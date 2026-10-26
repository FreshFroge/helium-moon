"""Real refuge navigation/rig check for the mandatory post-hunt withdrawal.

Scripted setup and accelerated AI time; not an unassisted survival playtest.
"""
import os
from playwright.async_api import async_playwright
import browser_playthrough as harness


async def play(port):
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'),args=[
            '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
            '--autoplay-policy=no-user-gesture-required'])
        try:
            page=await browser.new_page(viewport={'width':960,'height':540})
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(f'http://localhost:{port}/?manual=1&q=low&msaa=0')
            await page.wait_for_function('window.READY || window.LOAD_ERROR',timeout=300000)
            assert not await page.evaluate('window.LOAD_ERROR')
            await page.evaluate("ui.clickToPlay=()=>{};game.startSingle('Withdrawal check')")
            result=await page.evaluate('''async()=>{
                const {pointAtDistance}=await import('/shared/math.js');
                const {groundAt}=await import('/shared/physics.js');
                const sim=game.sim,hv=sim.hv,p=sim.players.get(game.myId),w=game.world;
                sim.state='play';sim.time=400;sim.director.update=()=>{};
                sim.sf.update=sim.mimic.update=sim.wildlife.update=()=>{};
                const at=pointAtDistance(w.trail,w.trailCum,500),from=pointAtDistance(w.trail,w.trailCum,480);
                game.tp(at.x,at.z);Object.assign(p,{flash:false,crouch:false,noise:0,voice:0});
                hv.place(from.x,from.z);hv.target=p.id;hv.setState('stalk');hv.awareness.set(p.id,2);
                hv.startChase(p);
                if(hv.state!=='chase')throw Error('hunt fixture did not start');
                hv.finishHunt(p,'timeout');
                const end=sim.time,origin={x:hv.x,z:hv.z},deadline=sim.director.nextChaseAt;
                let maxStep=0,travel=0,maxRigError=0,blocked=0;
                const dt=.05;
                for(let i=0;i<7200&&hv.withdrawal;i++){
                    const x=hv.x,z=hv.z;sim.time+=dt;hv.update(dt);
                    const step=Math.hypot(hv.x-x,hv.z-z);maxStep=Math.max(maxStep,step);travel+=step;
                    if(hv.startChase(p)!==false)blocked++;
                    if(i%30===0){
                        game.hv.update(dt,hv.snapshot());
                        maxRigError=Math.max(maxRigError,game.hv.root.position.distanceTo({x:hv.x,y:hv.y,z:hv.z}));
                    }
                    sim.drainEvents();
                }
                const completed=!!hv.lastWithdrawal&&!hv.withdrawal;
                const separation=Math.hypot(hv.x-origin.x,hv.z-origin.z),targetDistance=hv.dist(p);
                const seconds=sim.time-end;
                const gate=deadline-end;
                // Return only after physical travel and cooldown have separately
                // been satisfied; never shorten the cooldown during extraction.
                sim.time=deadline-.01;
                const beforeDeadline=hv.startChase(p)===false;
                return {completed,separation,targetDistance,seconds,gate,maxStep,travel,maxRigError,blocked,beforeDeadline,
                    lastWithdrawal:hv.lastWithdrawal};
            }''')
            assert result['completed'], result
            assert result['separation']>=200 and result['targetDistance']>=200, result
            assert result['gate']==240 and result['beforeDeadline'], result
            # The physical follower permits at most 1.5x a requested step for
            # cylinder correction around bark (10.5 m/s * .05 s * 1.5).
            assert result['travel']>=200 and result['maxStep']<=.788, result
            assert result['maxRigError']<.012 and result['blocked']==0, result
            assert not errors, errors
            print('PASS actual refuge 200m physical withdrawal, rendered rig and end-based four-minute gate:',result,flush=True)
        finally:
            await browser.close()


if __name__=='__main__':
    harness.play=play
    harness.main()
