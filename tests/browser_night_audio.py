"""Real Web Audio startup, recording decoding and tree-emitter lifecycle."""
import os
from playwright.async_api import async_playwright
import browser_playthrough as harness

async def play(port):
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'),args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
        try:
            page=await browser.new_page(viewport={'width':960,'height':640})
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(f'http://localhost:{port}/?manual=1&q=low')
            await page.wait_for_function('window.READY || window.LOAD_ERROR',timeout=300000)
            assert not await page.evaluate('window.LOAD_ERROR')
            result=await page.evaluate('''async()=>{
              const a=game.audio;
              await a.ctx.resume();
              const loops=['crickets','wind','river','traffic'].map(k=>!!a.loops[k]?.src.loop);
              const forbidden=Object.keys(a.lib).filter(k=>/^(owl|frog|dog|coyote|katydids)/.test(k));
              const energy=buf=>{
                const pcm=buf.getChannelData(0);let power=0,peak=0;
                for(let i=0;i<pcm.length;i++){power+=pcm[i]*pcm[i];peak=Math.max(peak,Math.abs(pcm[i]));}
                return {rms:Math.sqrt(power/pcm.length),peak,duration:buf.duration,sampleRate:buf.sampleRate};
              };
              const tree=game.world.trees.find(t=>t.height>8);
              a.listener={...a.listener,x:tree.x,z:tree.z};
              a.world=game.world;a.treeRefreshAt=0;a._treeRustle(a.ctx.currentTime);
              const emitters=[...a.treeEmitters].map(([t,h])=>({tree:game.world.trees.includes(t),loop:h.src.loop,
                anchored:h.e.x===t.x&&h.e.z===t.z&&h.e.y>t.y+2,bus:!!h.e}));
              const old=[...a.treeEmitters.values()];
              a.listener.x=game.world.minX-1000;a.listener.z=game.world.minZ-1000;
              a.treeRefreshAt=0;a._treeRustle(a.ctx.currentTime);
              const released=old.every(h=>h.stopping)&&a.treeEmitters.size===0;
              a.stopAll();
              return {loops,forbidden,crickets:energy(a.lib.crickets),leaves:energy(a.lib.treeLeaves),emitters,released,
                ambientSurvives:a.active.has(a.loops.crickets)};
            }''')
            assert all(result['loops']),result
            assert not result['forbidden'],result
            for name,duration in [('crickets',40),('leaves',24)]:
                clip=result[name]
                assert abs(clip['duration']-duration)<.05 and clip['rms']>.0001 and clip['peak']<1.01,result
            assert result['emitters'] and len(result['emitters'])<=3,result
            assert all(all(e.values()) for e in result['emitters']),result
            assert result['released'] and result['ambientSurvives'],result
            assert not errors,errors
            print('PASS recorded ambience and real Web Audio tree sources:',result,flush=True)
        finally:
            await browser.close()

if __name__=='__main__':
    harness.play=play
    harness.main()
