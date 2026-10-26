"""Actual Helium rig transitions and physical routes around real refuge trunks.

Pose/route fixtures isolate motion; this is not an unassisted survival run.
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
            page=await browser.new_page(viewport={'width':960,'height':540})
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(f'http://localhost:{port}/?manual=1&q=low&msaa=0')
            await page.wait_for_function('window.READY || window.LOAD_ERROR',timeout=300000)
            assert not await page.evaluate('window.LOAD_ERROR')
            await page.evaluate("ui.clickToPlay=()=>{};game.startSingle('Motion check')")
            result=await page.evaluate('''async()=>{
                const {groundAt,moveCharacter}=await import('/shared/physics.js');
                const {pointAtDistance,angleDiff}=await import('/shared/math.js');
                const w=game.world,hv=game.sim.hv,v=game.hv,aiUpdate=hv.update;
                for(const actor of [game.sim.hv,game.sim.sf,game.sim.director,game.sim.mimic])actor.update=()=>{};
                game.sim.state='play';game.sim.time=400;
                const at=pointAtDistance(w.trail,w.trailCum,500),y=groundAt(w,at.x,at.z);
                const pose=(yaw,flags=0,speed=0)=>[at.x,y,at.z,yaw,yaw,0,speed,flags,0,0,8];
                v.root.visible=false;v.update(1/60,pose(3.12));
                const before=v.yaw;v.update(1/60,pose(-3.12));
                const wrap=Math.abs(angleDiff(before,v.yaw));
                const turnFrom=v.yaw;v.update(1/60,pose(turnFrom+Math.PI/2));
                const firstTurn=Math.abs(angleDiff(turnFrom,v.yaw));
                for(let i=0;i<120;i++)v.update(1/60,pose(turnFrom+Math.PI/2));
                const turnError=Math.abs(angleDiff(v.yaw,turnFrom+Math.PI/2));
                v.tip=0;v.tipV=0;v.riseT=null;
                for(let i=0;i<6;i++)v.update(1/60,pose(0,256));
                const partial=v.tip;v.update(1/60,pose(0,1024));
                const riseJump=Math.abs(v.tip-partial);
                for(let i=0;i<180;i++)v.update(1/60,pose(0));
                const rootError=Math.hypot(v.root.position.x-at.x,v.root.position.y-y,v.root.position.z-at.z);

                // Real discovery must replace a leftover search/cover path now,
                // even when its ordinary replan timer has not expired.
                const to=pointAtDistance(w.trail,w.trailCum,506),behind=pointAtDistance(w.trail,w.trailCum,490);
                game.tp(to.x,to.z);const player=game.sim.players.get(game.myId);
                Object.assign(player,{yaw:at.dir,flash:false,noise:0});
                hv.place(at.x,at.z);hv.setState('chase');hv.target=player.id;
                hv.huntHideUntil=game.sim.time;hv.huntPhase='search';hv.lbNext=game.sim.time+10;
                hv.lookYaw=hv.yaw=Math.atan2(player.x-hv.x,player.z-hv.z);
                hv.path=[[hv.x,hv.z],[behind.x,behind.z]];hv.pathI=1;hv.goal=[behind.x,behind.z];hv.pathMode='quiet';hv.replanT=100;
                aiUpdate.call(hv,.05);
                const pursuit={mode:hv.pathMode,error:Math.hypot(hv.goal[0]-player.x,hv.goal[1]-player.z)};

                // Eight deterministic, physically clear starts/goals on opposite
                // sides of actual trees; use the real planner and follower.
                const routes=[];
                for(const tree of w.trees){
                    if(routes.length>=8)break;
                    if(!tree.play||tree.trunkR<.28||w.trailInfo(tree.x,tree.z).d>35)continue;
                    if(routes.some(r=>Math.hypot(r.cx-tree.x,r.cz-tree.z)<15))continue;
                    const radius=tree.trunkR+3.2;
                    for(const angle of [0,Math.PI/4,Math.PI/2]){
                        const start={x:tree.x+Math.sin(angle)*radius,z:tree.z+Math.cos(angle)*radius};
                        const goal={x:tree.x-Math.sin(angle)*radius,z:tree.z-Math.cos(angle)*radius};
                        if(![start,goal].every(p=>{
                            p.y=groundAt(w,p.x,p.z);const q=moveCharacter(w,p,0,0,.32,{nav:true,slope:false,step:.75});
                            return w.navWalkable(p.x,p.z)&&Math.hypot(q.x-p.x,q.z-p.z)<.001;
                        }))continue;
                        hv.setState('chase');hv.target=null;hv.place(start.x,start.z);hv.speed=0;
                        if(!hv.planTo(goal.x,goal.z,'direct'))continue;
                        let arrived=false,maxStep=0,ticks=0;
                        for(;ticks<400&&!arrived;ticks++){
                            if(!hv.path)hv.planTo(goal.x,goal.z,'direct');
                            const x=hv.x,z=hv.z;game.sim.time+=.05;
                            arrived=hv.followPath(.05,6.6);
                            maxStep=Math.max(maxStep,Math.hypot(hv.x-x,hv.z-z));
                        }
                        routes.push({cx:tree.x,cz:tree.z,arrived,remaining:Math.hypot(hv.x-goal.x,hv.z-goal.z),seconds:ticks*.05,maxStep});
                        break;
                    }
                }
                return{wrap,firstTurn,turnError,riseJump,rootError,pursuit,routes};
            }''')
            assert result['wrap']<.03 and result['firstTurn']<=.201 and result['turnError']<.01,result
            assert result['riseJump']<.02 and result['rootError']<.0001,result
            assert result['pursuit']['mode']=='direct' and result['pursuit']['error']<.001,result
            print('  ok  actual view eases wrapped/abrupt turns, interrupted rise and exact root positions:',
                  {k:v for k,v in result.items()if k!='routes'},flush=True)
            assert len(result['routes'])==8,result
            assert all(r['arrived'] and r['remaining']<.35 and r['maxStep']<.496 for r in result['routes']),result['routes']
            print('  ok  eight actual trunk routes complete with bounded physical movement:',result['routes'],flush=True)

            output=Path(os.environ.get('HM_ARTIFACT_DIR','/tmp/helium-smooth-motion'));output.mkdir(parents=True,exist_ok=True)
            for name,flags,speed,kind,phase in [('run',1,5.15,0,0),('grab',2048,0,2,2),('crawl',16,10.5,0,0)]:
                await page.evaluate('''async({flags,speed,kind,phase})=>{
                    const {pointAtDistance}=await import('/shared/math.js');const {groundAt}=await import('/shared/physics.js');
                    const w=game.world,v=game.hv,at=pointAtDistance(w.trail,w.trailCum,500),yaw=at.dir;
                    const s=[at.x,groundAt(w,at.x,at.z),at.z,yaw,yaw,0,speed,flags,0,0,8,kind,phase,0];
                    for(let i=0;i<120;i++)v.update(1/60,s);
                    game.tp(at.x+Math.cos(yaw)*3.2+Math.sin(yaw)*2,at.z-Math.sin(yaw)*3.2+Math.cos(yaw)*2,at.x,at.z);
                    game.look(game.player.yaw,-.15);game.flashlight.update(1/30,game.camera,0);
                    game.fade=game.fadeTarget=0;game.env.update(1/30,game.camera,0);game._render(0);
                    document.querySelector('#intro').style.display='none';
                }''',dict(flags=flags,speed=speed,kind=kind,phase=phase))
                await page.screenshot(path=str(output/f'{name}.png'),timeout=60000)
            assert not errors,errors
            print('all browser Helium motion checks passed; pose artifacts:',str(output),flush=True)
        finally:
            await browser.close()


if __name__=='__main__':
    harness.play=play
    harness.main()
