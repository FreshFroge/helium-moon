"""Two real network clients: shared briefing, supplies and durable cooperative repair.
Run with HM_TEST=1 for the server's explicit freeze/position fixtures.
"""
import asyncio
import math
import os
import time
from playwright.async_api import async_playwright
import browser_playthrough as harness


async def play(port):
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'),args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
        try:
            pages=[];errors=[]
            for _ in range(2):
                context=await browser.new_context(viewport={'width':640,'height':360})
                page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
                await page.goto(f'http://localhost:{port}/?manual=1&q=low&msaa=0');pages.append(page)
            for page in pages:
                await page.wait_for_function('window.READY || window.LOAD_ERROR',timeout=300000)
                assert not await page.evaluate('window.LOAD_ERROR')
                await page.evaluate('ui.clickToPlay=()=>{}')
                await page.click('#menu-main [data-act=multi]')
            a,b=pages
            await a.fill('#mp-name','Repair lead');await a.click('#mp-create')
            await a.wait_for_function('game.lobby?.code')
            code=await a.evaluate('game.lobby.code')
            await b.fill('#mp-name','Repair helper');await b.fill('#mp-code',code);await b.click('#mp-join')
            await b.wait_for_function('game.lobby?.players.length===2')
            await a.click('#lb-start')
            for page in pages:await page.wait_for_function("game.mode==='playing'")
            layouts=[await p.evaluate('({h:game.info.layout.supplyHints,m:game.info.layout.memoText})')for p in pages]
            assert layouts[0]==layouts[1] and layouts[0]['h'],'both clients receive the same truthful supply register'
            print('  ok  two separate clients share the authoritative supply hints and briefing',flush=True)
            await a.evaluate("game.net.send({t:'debug',cmd:'freeze'})")

            async def pump(seconds):
                end=time.monotonic()+seconds
                while time.monotonic()<end:
                    for p in pages:await p.evaluate('game.advance(4,1/30,false)')
                    await asyncio.sleep(.04)

            # Real Q/R input -> server snapshot -> the other client's actual
            # hiker skeleton. Do not substitute a locally posed avatar here.
            for page in pages:
                await page.wait_for_function('game.avatars.size===1')
            await pump(.5)
            baseline=await b.evaluate('''() => {const v=[...game.avatars.values()][0];v.root.updateMatrixWorld(true);
                const h=v.char.bones.head.getWorldPosition(v.pos.clone());
                return {x:h.x,y:h.y,z:h.z};}''')
            for key,sign in [('q',-1),('r',1)]:
                await a.keyboard.down(key);await pump(1)
                pose=await b.evaluate('''() => {const v=[...game.avatars.values()][0];v.root.updateMatrixWorld(true);
                    const h=v.char.bones.head.getWorldPosition(v.pos.clone());
                    return {x:h.x,y:h.y,z:h.z,yaw:v.yaw,lean:v.anim.sideLean,snapshot:game.plBufs.get(v.id).latest()[11]};}''')
                lateral=(pose['x']-baseline['x'])*math.cos(pose['yaw'])-(pose['z']-baseline['z'])*math.sin(pose['yaw'])
                assert pose['snapshot']*sign>.9 and pose['lean']*sign>.9,pose
                assert .2<lateral*sign<.36,(pose,lateral)
                await a.keyboard.up(key);await pump(1)
            await a.keyboard.down('Control');await pump(1)
            crouched=await b.evaluate('''() => {const v=[...game.avatars.values()][0];v.root.updateMatrixWorld(true);
                return v.char.bones.head.getWorldPosition(v.pos.clone()).y-v.pos.y;}''')
            assert .85<crouched<1.1,crouched
            await a.keyboard.up('Control');await pump(.5)
            print('  ok  real Q/R peeks and low crouch reach the other client as grounded hiker poses',flush=True)

            for page in pages:
                await page.evaluate('''() => { window.coopApproach=async(id,station=false)=>{
                    const {moveCharacter,groundAt}=await import('/shared/physics.js');
                    const w=game.world,view=(station?game.objViews.stations:game.objViews.items).get(id),s=view.def;
                    for(const radius of [1.25,1.7,2])for(let i=0;i<24;i++){
                        const a=i*Math.PI/12,x=s.x+Math.cos(a)*radius,z=s.z+Math.sin(a)*radius;
                        const from={x,z,y:groundAt(w,x,z)},q=moveCharacter(w,from,0,0,.34,{boundary:true,cameraSafe:true});
                        if(Math.hypot(q.x-x,q.z-z)>.02 || !w.isPlayable(x,z))continue;
                        const y=station?s.y+.6:view.y+.1;
                        if(w.lineOfSight(x,from.y+1.62,z,s.x,y,s.z,{brushK:0})<.5)continue;
                        game.tp(x,z,s.x,s.z);
                        game.net.send({t:'debug',cmd:'tp',x,z});
                        game.look(game.player.yaw,Math.atan2(y-game.camera.position.y,Math.hypot(s.x-x,s.z-z)));
                        return true;
                    }
                    return false;
                }; }''')
            assert await a.evaluate("coopApproach('fuel')")
            await pump(.5);await a.keyboard.press('e');await pump(.4)
            for page in pages:assert await page.evaluate('game.team.fuel'),'one pickup supplies the shared team'
            print('  ok  a real E pickup reaches the other client and unlocks its repair',flush=True)
            for page in pages:assert await page.evaluate("coopApproach('gen',true)")
            await pump(.5)
            for page in pages:await page.keyboard.down('e')
            await pump(2.9)
            for page in pages:await page.keyboard.up('e')
            await pump(.5)
            progress=await a.evaluate("game.objViews.stations.get('gen').prog")
            checkpoint=math.floor(progress*3+.0005)/3
            assert checkpoint in (1/3,2/3) and progress<1,progress
            # The server runs in real time; allow an entire unfinished third
            # to decay even if slow software rendering delays a key release.
            await pump(18)
            saved=[await p.evaluate("game.objViews.stations.get('gen').prog")for p in pages]
            assert all(abs(v-checkpoint)<.002 for v in saved),(checkpoint,saved)
            print('  ok  both clients retain their completed repair checkpoint after interruption:',saved,flush=True)
            for page in pages:await page.keyboard.down('e')
            await pump(5.8)
            for page in pages:await page.keyboard.up('e')
            await pump(.3)
            assert all([await p.evaluate("game.objViews.stations.get('gen').done")for p in pages])
            assert not errors,errors
            print('  ok  cooperative work completes on the authoritative server and both clients; no page errors',flush=True)
        finally:
            await browser.close()


if __name__=='__main__':
    harness.play=play
    harness.main()
