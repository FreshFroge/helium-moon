"""Real keyboard peeks around an actual refuge trunk, with camera/AI agreement.

Threats are staged and frozen to isolate cover and controls from hunt pacing.
"""
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright
import browser_playthrough as harness


async def play(port):
    output=Path(os.environ.get('HM_ARTIFACT_DIR','/tmp/helium-lean'))
    output.mkdir(parents=True,exist_ok=True)
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'),args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
            '--autoplay-policy=no-user-gesture-required'])
        try:
            page=await browser.new_page(viewport={'width':960,'height':540})
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            await page.goto(f'http://localhost:{port}/?manual=1&q=low&msaa=0')
            await page.wait_for_function('window.READY || window.LOAD_ERROR',timeout=300000)
            assert not await page.evaluate('window.LOAD_ERROR')
            await page.evaluate("ui.clickToPlay=()=>{};game.startSingle('Lean check')")
            fixture=await page.evaluate('''async()=>{
                const {groundAt,moveCharacter,leanDistance}=await import('/shared/physics.js');
                const {eyePosition,eyeHeight}=await import('/shared/sim/perception.js');
                const w=game.world;
                for(const actor of [game.sim.hv,game.sim.sf,game.sim.director,game.sim.mimic])actor.update=()=>{};
                game.settings.headBob=0;game.settings.cameraShake=0;
                for(const t of w.trees){
                    if(!t.play||t.trunkR<.27||t.trunkR>.4||w.trailInfo(t.x,t.z).d>35)continue;
                    for(let i=0;i<8;i++){
                        const a=i*Math.PI/4,r=t.collisionR+.36;
                        const p={x:t.x+Math.sin(a)*r,z:t.z+Math.cos(a)*r,yaw:a,state:'alive',lean:0};
                        p.y=groundAt(w,p.x,p.z);
                        if(!w.isPlayable(p.x,p.z)||w.waterAt(p.x,p.z)!==null)continue;
                        const q=moveCharacter(w,p,0,0,.32,{boundary:true,cameraSafe:true});
                        if(Math.hypot(q.x-p.x,q.z-p.z)>.001)continue;
                        const target={x:t.x-Math.sin(a)*6,z:t.z-Math.cos(a)*6};
                        target.y=groundAt(w,target.x,target.z)+1.65;
                        const vis=amount=>{const e=eyePosition(w,{...p,lean:amount});
                            return w.lineOfSight(e.x,e.y,e.z,target.x,target.y,target.z,{brushK:.3});};
                        const centered=vis(0),oldReach=vis(.28/.42),right=vis(1),left=vis(-1);
                        if(centered>.2||Math.min(right,left)<.35||oldReach>.2)continue;
                        game.tp(p.x,p.z,target.x,target.z,0);game.advance(30,1/30,false);
                        game.player.pitch=0;game.player.yaw=a;game.player.leanIntent=0;
                        game.sim.hv.place(target.x,target.z);game.sim.hv.setState('still');
                        game.advance(15,1/30,false);game.fade=game.fadeTarget=0;
                        window.leanTarget=target;window.leanAnchor=game.player.pos.toArray();
                        window.leanMeasure=()=>{
                            const pl=game.player,p={x:pl.pos.x,y:pl.pos.y,z:pl.pos.z,yaw:pl.yaw,state:'alive',crouch:pl.crouching,lean:pl.lean};
                            const e=eyePosition(w,p),cam=game.camera.position;
                            return{amount:pl.lean,shift:(cam.x-pl.pos.x)*Math.cos(pl.yaw)-(cam.z-pl.pos.z)*Math.sin(pl.yaw),
                                roll:game.camera.rotation.z,authorityError:Math.hypot(cam.x-e.x,cam.y-e.y,cam.z-e.z),
                                bodyShift:Math.hypot(pl.pos.x-leanAnchor[0],pl.pos.z-leanAnchor[2]),
                                visibility:w.lineOfSight(cam.x,cam.y,cam.z,target.x,target.y,target.z,{brushK:.3}),
                                replicated:game.sim.players.get(game.myId).lean};
                        };
                        document.querySelector('#intro').style.display='none';
                        return{tree:{x:t.x,z:t.z,radius:t.trunkR},centered,oldReach,right,left};
                    }
                }
                throw Error('No real trunk fixture distinguishes a 28 cm reach from a shoulder-width peek');
            }''')
            print('  fixture:',json.dumps(fixture),flush=True)

            async def advance():
                await page.evaluate('game.advance(40,1/60,false)')

            async def capture(name):
                await page.evaluate('game.env.update(1/30,game.camera,0);game._render(0)')
                await page.screenshot(path=str(output/f'{name}.png'),timeout=60000)

            await capture('centered')
            results=[]
            for key,sign in [('q',-1),('r',1)]:
                await page.keyboard.down(key);await advance()
                result=await page.evaluate('leanMeasure()');results.append(result)
                assert result['shift']*sign>.41 and result['amount']*sign>.99,result
                assert result['roll']*sign<-.11,result
                assert result['visibility']>.35 and result['bodyShift']<.001,result
                assert result['authorityError']<.002 and abs(result['replicated']-result['amount'])<.02,result
                await capture('left' if sign<0 else 'right')
                await page.keyboard.up(key);await advance()
                centered=await page.evaluate('leanMeasure()')
                assert abs(centered['shift'])<.001 and abs(centered['roll'])<.001,centered
            await page.keyboard.down('q');await page.keyboard.down('r');await advance()
            both=await page.evaluate('leanMeasure()')
            assert abs(both['shift'])<.001,both
            await page.keyboard.up('q');await page.keyboard.up('r')
            assert not errors,errors
            (output/'results.json').write_text(json.dumps({'fixture':fixture,'peeks':results},indent=2)+'\n')
            print('  ok  actual Q/R peeks open sightlines around refuge bark, bank correctly, leave the body planted, replicate and center:',json.dumps(results),flush=True)
            print('lean browser checks pass; artifacts:',output,flush=True)
        finally:
            await browser.close()


if __name__=='__main__':
    harness.play=play
    harness.main()
