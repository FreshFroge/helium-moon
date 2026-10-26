"""Actual event-to-Web-Audio routing plus rendered stereo/occlusion envelopes."""
import os
from playwright.async_api import async_playwright
import browser_playthrough as harness


async def play(port):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'), args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--autoplay-policy=no-user-gesture-required'])
        try:
            page = await browser.new_page(viewport={'width':960,'height':540})
            errors = []; page.on('pageerror', lambda error: errors.append(str(error)))
            await page.goto(f'http://localhost:{port}/?manual=1&q=low&msaa=0')
            await page.wait_for_function('window.READY || window.LOAD_ERROR', timeout=300000)
            assert not await page.evaluate('window.LOAD_ERROR')
            await page.evaluate("ui.clickToPlay=()=>{};game.startSingle('Search sound check')")
            result = await page.evaluate('''async()=>{
                const {AudioEngine}=await import('/client/audio/audio.js');
                const a=game.audio,heard=[],original=a.hvSearchMove;
                await a.ctx.resume();a.setListener(game.camera);
                a.hvSearchMove=function(seed,pos){const h=original.call(this,seed,pos);heard.push(h);return h;};
                game.hv.root.visible=false;
                const p=game.camera.position;
                game._onEvent({type:'hv_search_move',s:3,pid:'other player',x:p.x+6,y:p.y,z:p.z});
                const h=heard[0];
                const routed=!!h&&h.src.buffer===a.lib.searchCrack3&&h.e.pan.panningModel==='HRTF';
                const sourceError=h?Math.abs(h.e.x-p.x-6):Infinity;
                const far=game.camera.clone();far.position.x+=100;a.setListener(far);
                const faded=h?.e.out.gain.value;
                game._onEvent({type:'hv_search_move',s:1,x:p.x+100,y:p.y,z:p.z});
                const distantFiltered=heard.length===1;
                a.hvSearchMove=original;h?.stop(0);

                // Render the exact production emitter and crack sample in an
                // offline stereo graph, with no ambience masking measurements.
                async function render(x,z,visibility=1){
                    const ctx=new OfflineAudioContext(2,44100,44100),engine=new AudioEngine(game.settings);
                    engine.ctx=ctx;engine.ready=true;engine.lib=a.lib;
                    engine.bus={mon:ctx.createGain()};engine.bus.mon.connect(ctx.destination);
                    engine.revIn=ctx.createGain();engine.world={lineOfSight:()=>visibility};
                    const handle=engine.hvSearchMove(0,{x,y:0,z});
                    const buf=await ctx.startRendering();
                    const rms=Array.from({length:2},(_,channel)=>{
                        const data=buf.getChannelData(channel);let sum=0;
                        for(const value of data)sum+=value*value;return Math.sqrt(sum/data.length);
                    });
                    return {rms,source:!!handle};
                }
                const left=await render(-6,0),right=await render(6,0);
                const near=await render(0,-3),farther=await render(0,-12),muted=await render(0,-18);
                const muffled=await render(0,-3,0);
                return {routed,sourceError,faded,distantFiltered,left,right,near,farther,muted,muffled};
            }''')
            assert result['routed'] and result['sourceError']<.001, result
            assert result['faded']==0 and result['distantFiltered'], result
            assert result['left']['rms'][0]>result['left']['rms'][1]*1.15, result
            assert result['right']['rms'][1]>result['right']['rms'][0]*1.15, result
            assert sum(result['near']['rms'])>sum(result['farther']['rms'])>0, result
            assert not result['muted']['source'] and sum(result['muted']['rms'])==0, result
            assert 0<sum(result['muffled']['rms'])<sum(result['near']['rms']), result
            assert not errors, errors
            print('PASS hidden search event, live range cutoff, stereo direction/distance and cover muffling:',result,flush=True)
        finally:
            await browser.close()


if __name__=='__main__':
    harness.play=play
    harness.main()
