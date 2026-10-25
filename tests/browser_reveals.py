"""Real-client planned glimpse timing, accounting and physical escape.
Fixtures establish an already-planned appearance; perception remains real.
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
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(f'http://localhost:{port}/?manual=1&q=low')
            await page.wait_for_function('window.READY || window.LOAD_ERROR',timeout=300000)
            assert not await page.evaluate('window.LOAD_ERROR')
            await page.locator('#loading').wait_for(state='hidden')
            await page.click('#menu-main [data-act=single]')
            output=Path(os.environ.get('HM_ARTIFACT_DIR','/tmp/helium-moon-reveals'))
            output.mkdir(parents=True,exist_ok=True)
            for kind in ['watcher','crossing']:
                mid=await page.evaluate('''async(kind)=>{
                  game.restart();
                  const {pointAtDistance}=await import('/shared/math.js');
                  const {onScreen}=await import('/shared/sim/perception.js');
                  const sim=game.sim,hv=sim.hv,p=sim.players.get(game.myId),w=game.world;
                  sim.state='play';sim.time=400;sim.director.update=()=>{};sim.director.enter('build');
                  sim.sf.update=()=>{};sim.mimic.update=()=>{};
                  const update=hv.update.bind(hv);hv.update=()=>{};
                  let at=null;
                  game.flashlight.on=true;
                  for(const along of [500,600,400,700,300]){
                    const a=pointAtDistance(w.trail,w.trailCum,along),b=pointAtDistance(w.trail,w.trailCum,along+28);
                    game.tp(b.x,b.z,a.x,a.z,0);game.advance(15,1/30,false);
                    hv.place(a.x,a.z);
                    if(hv.dist(p)>20 && onScreen(w,p,hv.x,hv.y,hv.z)){at=a;break;}
                  }
                  if(!at)throw new Error('No clear real-world glimpse fixture');
                  hv.update=update;hv.target=p.id;hv.awareness.set(p.id,.8);hv.spotted.add(p.id);
                  hv.lookYaw=hv.yaw=Math.atan2(p.x-hv.x,p.z-hv.z);hv.setState('reveal');
                  hv.reveal={kind,pid:p.id,phase:kind==='watcher'?'show':'cross',t:0,end:[at.x+8,at.z]};
                  if(kind==='crossing')hv.planTo(at.x+8,at.z,'direct');
                  const reports=[],report=sim.director.onReveal.bind(sim.director);
                  sim.director.onReveal=k=>{reports.push(k);report(k);};
                  window.revealCheck={reports,frames:0,maxStep:0,escapeAt:null};
                  game.advance(12,1/30,false);game.step(0,true);
                  return {state:hv.state,reports:[...reports],exposure:hv.reveal?.exposureT,
                    visible:game.hv.root.visible,screen:onScreen(w,p,hv.x,hv.y,hv.z),health:game.health};
                }''',kind)
                assert mid['state']=='reveal' and mid['reports']==[kind] and mid['screen'] and mid['visible'] and mid['health']==2,mid
                # Manual simulation is frozen at the glimpse; let only the UI's
                # real-time opening title finish fading before the artifact.
                await page.wait_for_function("!document.querySelector('#intro').classList.contains('show') && Number(getComputedStyle(document.querySelector('#intro')).opacity)<.02",timeout=15000)
                await page.screenshot(path=str(output/f'{kind}-glimpse.png'),timeout=120000)
                end=await page.evaluate('''()=>{
                    const hv=game.sim.hv,c=window.revealCheck;
                    for(let i=0;i<60;i++){
                      const x=hv.x,z=hv.z;game.advance(1,1/30,false);
                      c.maxStep=Math.max(c.maxStep,Math.hypot(hv.x-x,hv.z-z));
                      if(hv.state!=='reveal' && c.escapeAt===null)c.escapeAt=i/30+.4;
                    }
                    return {...c,health:game.health};
                }''')
                assert end['reports']==[kind] and .4<=end['escapeAt']<=1.3 and end['maxStep']<.8 and end['health']==2,end
                print(f'PASS actual {kind} glimpse/escape:',mid,end,flush=True)
            assert not errors,errors
        finally:
            await browser.close()

if __name__=='__main__':
    harness.play=play
    harness.main()
