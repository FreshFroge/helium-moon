"""Focused real-client checks for screen-triggered encounters and crawl rendering.
Position fixtures establish the encounter; actual AI supplies all movement/damage.
Uses the same isolated-server harness as browser_playthrough.py.
"""
import os
from pathlib import Path
from playwright.async_api import async_playwright
import browser_playthrough as harness

async def play(port):
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'),args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
        try:
            page=await browser.new_page(viewport={'width':1280,'height':720})
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(f'http://localhost:{port}/?manual=1&q=low')
            await page.wait_for_function('window.READY || window.LOAD_ERROR',timeout=300000)
            assert not await page.evaluate('window.LOAD_ERROR')
            await page.locator('#loading').wait_for(state='hidden')
            await page.click('#menu-main [data-act=single]')
            for seed,flash in [(2,True),(2,False),(7,True)]:
                first=await page.evaluate('''async([seed,flash])=>{
                    const random=Math.random;
                    try { Math.random=()=>seed/2**31;game.restart(); } finally { Math.random=random; }
                    const {pointAtDistance}=await import('/shared/math.js');
                    const at=pointAtDistance(game.world.trail,game.world.trailCum,500);
                    const to=pointAtDistance(game.world.trail,game.world.trailCum,506);
                    game.tp(to.x,to.z,at.x,at.z);game.look(game.player.yaw+Math.PI,0);game.flashlight.on=flash;game.advance(6,1/30,false);
                    const sim=game.sim,p=sim.players.get(game.myId),hv=sim.hv;
                    sim.state='play';sim.time=400;sim.sf.update=()=>{};sim.mimic.update=()=>{};
                    hv.place(at.x,at.z);hv.yaw=hv.lookYaw=Math.atan2(p.x-hv.x,p.z-hv.z);hv.setState('roam');
                    const initial={seed:sim.seed,target:hv.target,awareness:hv.awareness.size};
                    let chased=false,aborted=false;
                    for(let i=0;i<240 && p.health===2;i++){
                        game.advance(1,1/30,false);
                        chased ||= hv.state==='chase';
                        aborted ||= hv.state==='retreat'&&p.health===2;
                    }
                    game.advance(6,1/30,false);
                    return {initial,chased,aborted,server:p.health,client:game.health,chasing:sim.director.chasing};
                }''',[seed,flash])
                assert first['initial']=={'seed':seed,'target':None,'awareness':0},first
                assert first['chased'] and not first['aborted'],first
                assert first['server']<2 and first['client']==first['server'] and not first['chasing'],first
                print(f'  ok  normal first sighting reaches actual attack (seed {seed}, flashlight {flash}):',first,flush=True)
            await page.evaluate('game.restart()')
            result=await page.evaluate('''async()=>{
                const {pointAtDistance}=await import('/shared/math.js');
                const at=pointAtDistance(game.world.trail,game.world.trailCum,500);
                const to=pointAtDistance(game.world.trail,game.world.trailCum,502.3);
                game.tp(to.x,to.z,at.x,at.z);game.look(game.player.yaw+Math.PI,0);
                game.advance(6,1/30,false);
                const sim=game.sim,p=sim.players.get(game.myId),hv=sim.hv;
                sim.state='play';sim.time=400;sim.director.update=()=>{};sim.director.enter('build');
                sim.sf.update=()=>{};sim.mimic.update=()=>{};
                hv.place(at.x,at.z);hv.yaw=hv.lookYaw=Math.atan2(p.x-hv.x,p.z-hv.z);
                hv.target=p.id;hv.awareness.set(p.id,2);hv.spotted.add(p.id);hv.setState('chase');hv.speed=6.6;
                game.advance(60,1/30,false);
                return {server:p.health,client:game.health};
            }''')
            assert result['server']<2 and result['client']==result['server'],result
            print('  ok  unseen committed chase lands a real hit without a sighting:',result,flush=True)
            escape=await page.evaluate('''async()=>{
                game.restart();game.advance(6,1/30,false);
                const {pointAtDistance}=await import('/shared/math.js');
                const at=pointAtDistance(game.world.trail,game.world.trailCum,500),to=pointAtDistance(game.world.trail,game.world.trailCum,506);
                game.tp(to.x,to.z,at.x,at.z);game.advance(3,1/30,false);
                const sim=game.sim,p=sim.players.get(game.myId),hv=sim.hv;
                sim.state='play';sim.time=400;sim.director.update=()=>{};sim.sf.update=()=>{};sim.mimic.update=()=>{};
                hv.place(at.x,at.z);hv.target=p.id;hv.awareness.set(p.id,2);hv.spotted.add(p.id);hv.startChase(p);
                game.advance(9,1/30,false);
                return {state:hv.state,health:p.health,flags:game.hv.flags,moved:Math.hypot(hv.x-at.x,hv.z-at.z)};
            }''')
            assert escape['state']=='retreat' and escape['health']==2 and escape['flags']&16 and escape['moved']>.1,escape
            print('  ok  spotting a pursuit triggers physical reverse-crawl concealment:',escape,flush=True)
            pose=await page.evaluate('''async()=>{
                game.restart();game.advance(9,1/30,false);
                const {pointAtDistance}=await import('/shared/math.js');
                const at=pointAtDistance(game.world.trail,game.world.trailCum,500),end=pointAtDistance(game.world.trail,game.world.trailCum,470);
                const sim=game.sim,p=sim.players.get(game.myId),hv=sim.hv;
                sim.state='play';sim.time=400;sim.director.update=()=>{};sim.sf.update=()=>{};sim.mimic.update=()=>{};
                game.tp(at.x+3,at.z+2,at.x,at.z);game.advance(3,1/30,false);
                hv.place(at.x,at.z);hv.target=p.id;hv.awareness.set(p.id,2);hv.spotted.add(p.id);
                hv.retreatFrom(p,false,true);hv.path=game.world.findPath(hv.x,hv.z,end.x,end.z);hv.pathI=1;
                hv.yaw=Math.atan2(hv.path[1][0]-hv.x,hv.path[1][1]-hv.z)+Math.PI;
                game.advance(15,1/30,false);
                const result={flags:game.hv.flags,blend:game.hv.anim.blend.crawl,head:game.hv.headPos().y-game.hv.pos.y,speed:hv.speed};
                // Hold a real snapshot after motion so a rendered frame can be inspected.
                sim.hv.update=()=>{};game.tp(hv.x+3,hv.z+2,hv.x,hv.z);game.look(game.player.yaw,-.3);
                game.advance(12,1/30,false);game.step(0,true);
                document.querySelector('#intro').style.display='none';
                return result;
            }''')
            assert pose['flags']&16 and pose['blend']>.99 and pose['head']<.95 and pose['speed']>8,pose
            print('  ok  authoritative retreat renders as a low four-limb crawl:',pose,flush=True)
            output=Path(os.environ.get('HM_ARTIFACT_DIR','/tmp/helium-moon-encounters'))
            output.mkdir(parents=True,exist_ok=True)
            await page.screenshot(path=str(output/'reverse-crawl.png'))
            assert not errors,errors
            print('all focused browser encounter checks passed',flush=True)
        finally:
            await browser.close()

if __name__=='__main__':
    harness.play=play
    harness.main()
