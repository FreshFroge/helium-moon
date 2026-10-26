#!/usr/bin/env python3
"""Close tree shells and keep the first-person camera outside visible bark."""
import os
from playwright.async_api import async_playwright
import browser_playthrough as harness


async def play(port):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'),
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            page = await browser.new_page(viewport={'width': 640, 'height': 360})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            await page.goto(f'http://localhost:{port}/?manual=1&q=high')
            await page.wait_for_function('window.READY || window.LOAD_ERROR', timeout=600000)
            assert not await page.evaluate('window.LOAD_ERROR')
            await page.evaluate("game.startSingle('Tree test')")
            result = await page.evaluate('''async()=>{
              const {CONFIG}=await import('/shared/config.js');
              const THREE=await import('three');
              const ts=game.env.trees,w=game.world;
              const inwardBark=Object.values(ts.barkMats).every(m=>m.side===THREE.DoubleSide);
              let maxIntrusion=-Infinity,checked=0,worst=null;
              // At standing camera height, every rendered main trunk must stay
              // inside the physical trunk + player capsule clearance. This is
              // the exact mismatch that formerly put the camera in the bark.
              for(let i=0;i<w.trees.length;i++){
                const t=w.trees[i];if(!t.play||t.trunkR<=.06)continue;
                const a=ts.arch[ts.archOf[i]],g=a.lods[0].bark,p=g.attributes.position.array;
                const sway=g.attributes.aSway.array,m=ts.mats.subarray(i*16,i*16+16);
                let visible=0;
                for(let j=0;j<p.length;j+=3){
                  if(sway[j/3]>=.1)continue; // main trunk, not a low branch
                  const x=m[0]*p[j]+m[4]*p[j+1]+m[8]*p[j+2]+m[12];
                  const y=m[1]*p[j]+m[5]*p[j+1]+m[9]*p[j+2]+m[13];
                  const z=m[2]*p[j]+m[6]*p[j+1]+m[10]*p[j+2]+m[14];
                  if(y-t.y>1.5&&y-t.y<1.9)visible=Math.max(visible,Math.hypot(x-t.x,z-t.z));
                }
                if(!visible)continue;checked++;
                const collisionR=t.collisionR??t.trunkR+.02;
                const intrusion=visible-collisionR;
                if(intrusion>maxIntrusion){maxIntrusion=intrusion;worst={i,visible,physics:collisionR,height:t.height};}
              }
              // Keep room for camera bob and floating point drift inside the
              // player's collision radius.
              const cameraMargin=CONFIG.PLAYER.RADIUS-maxIntrusion;

              // Weld the UV seam, then compare connected bark tubes with open
              // boundary loops. A capped tube has only its buried/joined start
              // loop; the old hollow tube had a second loop at its visible tip.
              let maxBoundaryRatio=0,geometries=0;
              for(const a of ts.arch)for(const lod of a.lods){
                const g=lod.bark,p=g.attributes.position.array,idx=g.index.array;
                const ids=new Int32Array(p.length/3),byPos=new Map();let nw=0;
                for(let i=0;i<ids.length;i++){
                  const k=Math.round(p[i*3]*1e5)+','+Math.round(p[i*3+1]*1e5)+','+Math.round(p[i*3+2]*1e5);
                  let id=byPos.get(k);if(id===undefined){id=nw++;byPos.set(k,id);}ids[i]=id;
                }
                const parent=Int32Array.from({length:nw},(_,i)=>i);
                const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
                const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
                const edges=new Map();
                for(let i=0;i<idx.length;i+=3){
                  const q=[ids[idx[i]],ids[idx[i+1]],ids[idx[i+2]]];join(q[0],q[1]);join(q[1],q[2]);
                  for(let e=0;e<3;e++){let x=q[e],y=q[(e+1)%3];if(x===y)continue;if(x>y)[x,y]=[y,x];const k=x+','+y;edges.set(k,(edges.get(k)||0)+1);}
                }
                const components=new Set();for(let i=0;i<nw;i++)components.add(find(i));
                const adj=new Map();
                for(const [k,n] of edges)if(n===1){const [x,y]=k.split(',').map(Number);if(!adj.has(x))adj.set(x,[]);if(!adj.has(y))adj.set(y,[]);adj.get(x).push(y);adj.get(y).push(x);}
                let loops=0;const seen=new Set();
                for(const start of adj.keys())if(!seen.has(start)){loops++;const stack=[start];seen.add(start);while(stack.length){for(const n of adj.get(stack.pop())||[])if(!seen.has(n)){seen.add(n);stack.push(n);}}}
                maxBoundaryRatio=Math.max(maxBoundaryRatio,loops/components.size);geometries++;
              }
              return {checked,maxIntrusion,cameraMargin,worst,maxBoundaryRatio,geometries,inwardBark};
            }''')
            assert result['checked'] > 100, result
            assert result['cameraMargin'] > .08, result
            assert result['maxBoundaryRatio'] <= 1.01, result
            assert result['geometries'] > 20, result
            assert result['inwardBark'], result
            await page.evaluate('''()=>{
                for(const actor of [game.sim.hv,game.sim.sf,game.sim.director,game.sim.mimic])actor.update=()=>{};
                game.settings.headBob=0;game.settings.cameraShake=0;
            }''')
            for side,key in [(-1,'r'),(1,'q')]:
                await page.evaluate('''async side=>{
                    const {CONFIG}=await import('/shared/config.js');
                    const w=game.world;
                    const {moveCharacter,groundAt}=await import('/shared/physics.js');
                    window.leanTree=null;
                    for(const t of w.trees){
                        if(!t.play||t.trunkR<.2||t.height<5)continue;
                        const x=t.x+side*((t.collisionR||t.trunkR)+CONFIG.PLAYER.RADIUS+.01),z=t.z;
                        const p={x,z,y:groundAt(w,x,z)},q=moveCharacter(w,p,0,0,CONFIG.PLAYER.RADIUS,{cameraSafe:true,boundary:true});
                        if(Math.hypot(q.x-x,q.z-z)>.005||!w.isPlayable(x,z))continue;
                        game.tp(x,z);game.look(0,0);game.advance(30,1/30,false);window.leanTree=t;break;
                    }
                    if(!leanTree)throw Error('no collision-clear leaning fixture');
                }''',side)
                await page.keyboard.down(key)
                await page.evaluate('game.advance(45,1/30,false)')
                lean=await page.evaluate('''async()=>{
                    const {eyePosition}=await import('/shared/sim/perception.js');
                    const p=game.sim.players.get(game.myId),eye=eyePosition(game.world,p),c=game.camera.position,t=leanTree;
                    return {lean:game.player.lean,error:Math.hypot(c.x-eye.x,c.y-eye.y,c.z-eye.z),
                        clearance:Math.hypot(c.x-t.x,c.z-t.z)-(t.collisionR||t.trunkR)};
                }''')
                await page.keyboard.up(key)
                assert abs(lean['lean'])>.1,lean
                assert lean['error']<.02 and lean['clearance']>=.095,lean
                print('  ok  real Q/R input preserves camera clearance and authoritative eye position:',lean,flush=True)
            assert not errors, errors
            print('PASS closed tree tips and camera-safe bark scale:', result, flush=True)
        finally:
            await browser.close()


if __name__ == '__main__':
    harness.play = play
    harness.main()
