import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { onScreen } from '../shared/sim/perception.js';
const MAXH = CONFIG.PLAYER.MAX_HEALTH;

const world = new World();
function encounter(separation=2.3) {
  const sim = new GameSim(world, {seed:42});
  sim.state='play';sim.time=400;/* after intro + DIRECTOR.DREAD_TIME */ sim.director.update=()=>{};sim.director.enter('build');sim.sf.update=()=>{};sim.mimic.update=()=>{};
  const p=sim.addPlayer('one','One'), hv=sim.hv;
  const at=pointAtDistance(world.trail,world.trailCum,500), to=pointAtDistance(world.trail,world.trailCum,500+separation);
  Object.assign(p,{x:to.x,z:to.z,y:world.heightAt(to.x,to.z),flash:true,pitch:0,viewFov:75,viewAspect:16/9});
  hv.place(at.x,at.z);hv.yaw=hv.lookYaw=Math.atan2(p.x-hv.x,p.z-hv.z);
  hv.target=p.id;hv.awareness.set(p.id,2);hv.spotted.add(p.id);hv.setState('chase');hv.speed=CONFIG.HV.BURST;
  p.yaw=Math.atan2(hv.x-p.x,hv.z-p.z); // looking away (camera faces -Z)
  return {sim,p,hv};
}
function tick(sim,seconds) {for(let t=0;t<seconds;t+=.05)sim.step(.05);}

test('a committed chase attacks a player who never looks back',()=>{
  const {sim,p,hv}=encounter();
  tick(sim,3.5);   // reach + hold (the grab, owner's Puppet rework): damage lands as he lets go
  assert.ok(p.health<MAXH,'unseen pursuit must be able to land a real hit');
  assert.equal(sim.director.chasing,false,'the hit ends the chase');
});

// Hunts: once a hunt is on, the ONLY way to call it off is to cut his strings - hold a
// flashlight beam on the control above him (CONFIG.HV.CONTROL_*; owner, Puppet rework).
// Being seen, lit at any range, losing sight and time do not end it.
function aimAt(p,q){const ey=p.y+1.6;p.yaw=Math.atan2(-(q.x-p.x),-(q.z-p.z));p.pitch=Math.atan2(q.y-ey,Math.hypot(q.x-p.x,q.z-p.z));}
test('a glimpse at range does not call off a hunt',()=>{
  const {sim,p,hv}=encounter(10);p.yaw+=Math.PI;          // turns and looks, light on
  tick(sim,.2);
  assert.equal(hv.state,'chase','being seen at 10 m is ignored');
  p.yaw+=Math.PI;                                         // looks away again
  tick(sim,5);
  assert.ok(p.health<MAXH,'the hunt follows through to a hit');
});

test('the old 7-ft flashlight rule is gone: a beam in his face does not stop him',()=>{
  const {sim,p,hv}=encounter(12);p.yaw+=Math.PI;          // faces him with the light the whole time
  let collapsed=false;
  for(let t=0;t<50&&p.health===MAXH;t+=.05){aimAt(p,{x:hv.x,y:hv.y+1.6,z:hv.z});sim.step(.05);collapsed||=hv.state==='collapse';}
  assert.equal(collapsed,false);assert.ok(p.health<MAXH,'he gets you anyway');
});

test('holding the beam on the control above him cuts the strings: he collapses, then is gone',()=>{
  const {sim,p,hv}=encounter(16);
  tick(sim,.05);assert.ok(hv.controlPos(),'a hunt has a control above him');
  const snap=hv.snapshot();assert.ok(snap[15]>=CONFIG.HV.CONTROL_UP[0]-.01,'clients receive where it hangs');
  let cutAt=null,events=[];
  for(let t=0;t<6&&cutAt==null;t+=.05){const c=hv.controlPos();if(c)aimAt(p,c);sim.step(.05);events.push(...sim.drainEvents());if(hv.state==='collapse')cutAt=t;}
  assert.ok(cutAt!=null,'the strings were cut');
  assert.ok(cutAt>=CONFIG.HV.CONTROL_TIME-.06,`not instantly (${cutAt?.toFixed(2)} s)`);
  assert.ok(events.some(e=>e.type==='hv_cut'&&e.pid===p.id));
  assert.equal(sim.director.chasing,false);assert.equal(p.health,MAXH);
  assert.ok(hv.snapshot()[7]&256,'the collapse reaches every client');
  const at=[hv.x,hv.z];
  aimAt(p,{x:hv.x,y:hv.y+.3,z:hv.z});tick(sim,2);
  assert.equal(hv.state,'collapse','he lies there while watched');
  assert.ok(Math.hypot(hv.x-at[0],hv.z-at[1])<.05,'no movement while watched');
  p.yaw+=Math.PI;tick(sim,.6);                            // look away...
  assert.ok(Math.hypot(hv.x-at[0],hv.z-at[1])>20,'...and he is gone');
});

test('the beam has to stay on it: a sweep across the control is not enough',()=>{
  const {sim,p,hv}=encounter(16);
  for(let k=0;k<6;k++){for(let i=0;i<4;i++){const c=hv.controlPos();if(c)aimAt(p,c);sim.step(.05);}p.yaw+=Math.PI;tick(sim,.6);p.yaw-=Math.PI;}
  assert.notEqual(hv.state,'collapse');
});

test('a teammate can cut the strings',()=>{
  const {sim,p,hv}=encounter(8);                         // target facing away
  const q=sim.addPlayer('two','Two');
  const back=pointAtDistance(world.trail,world.trailCum,478);   // on the open trail behind him
  Object.assign(q,{x:back.x,z:back.z,y:world.heightAt(back.x,back.z),flash:true,pitch:0,viewFov:75,viewAspect:16/9});
  hv.target=p.id;
  let cut=false;
  for(let t=0;t<4&&!cut;t+=.05){const c=hv.controlPos();if(c)aimAt(q,c);sim.step(.05);cut=hv.state==='collapse';}
  assert.ok(cut);assert.equal(p.health,MAXH);
});

test('losing sight or time no longer ends a hunt',()=>{
  const {sim,p,hv}=encounter(25);
  hv.startChase(p);assert.equal(sim.director.chasing,true);
  hv.lastSeenChase={x:p.x+30,z:p.z+30,t:sim.time-20};hv.stateT=90;
  tick(sim,.5);
  assert.equal(hv.state,'chase');assert.equal(sim.director.chasing,true);
  assert.ok(Math.hypot(hv.lastSeenChase.x-p.x,hv.lastSeenChase.z-p.z)<1,'he re-acquires where the player really is');
});

test('screen checks account for pitch, screen edges, aspect ratio and occlusion',()=>{
  const clear={lineOfSight:()=>1}, p={x:0,y:0,z:0,yaw:0,pitch:0,state:'alive',flash:true,viewFov:60,viewAspect:1};
  assert.equal(onScreen(clear,p,0,0,-3),true);
  assert.equal(onScreen(clear,p,2,0,-3),true,'a shoulder entering the edge counts');
  assert.equal(onScreen(clear,p,3,0,-3),false);
  p.viewAspect=2;assert.equal(onScreen(clear,p,3,0,-3),true,'wider displays expose more of the scene');
  p.pitch=1.4;assert.equal(onScreen(clear,p,0,0,-3),false);
  p.pitch=0;assert.equal(onScreen({lineOfSight:()=>0},p,0,0,-3),false);
  assert.equal(onScreen(clear,p,0,0,3),false);
  p.viewFov=120;p.viewAspect=3;
  assert.equal(onScreen(clear,p,70,0,-40),false,'a wide frustum cannot extend the physical sight range');
});

test('server accepts bounded screen settings for individual co-op players',()=>{
  const {sim,p}=encounter();const second=sim.addPlayer('two','Two');
  sim.input(p.id,{viewFov:90,viewAspect:2.4});sim.input(second.id,{viewFov:55,viewAspect:.75});
  assert.deepEqual([p.viewFov,p.viewAspect,second.viewFov,second.viewAspect],[90,2.4,55,.75]);
  sim.input(p.id,{viewFov:999,viewAspect:999});assert.deepEqual([p.viewFov,p.viewAspect],[120,5]);
  sim.input(p.id,{viewFov:NaN,viewAspect:Infinity});assert.deepEqual([p.viewFov,p.viewAspect],[120,5]);
});

test('retreat: unwatched he goes low and fast; watched he backs away upright, facing you',()=>{
  const {sim,p,hv}=encounter();
  hv.retreatFrom(p,false,true);
  const end=pointAtDistance(world.trail,world.trailCum,470);
  hv.path=world.findPath(hv.x,hv.z,end.x,end.z);hv.pathI=1;
  let fast=0,forward=0;
  for(let i=0;i<30;i++){
    const [x,z]=[hv.x,hv.z];sim.step(.05);
    const dx=hv.x-x,dz=hv.z-z,d=Math.hypot(dx,dz);
    assert.ok(d<=CONFIG.HV.RETREAT*.05*1.5,'each movement step is bounded, never a teleport');
    if(d>.3){fast++;if((dx*Math.sin(hv.yaw)+dz*Math.cos(hv.yaw))/d>.8)forward++;}
    assert.ok(hv.snapshot()[7]&16,'unwatched: the low operated crawl reaches every client');
  }
  assert.ok(fast>=15 && forward>=15,`fast=${fast}, forward=${forward}`);
  // now the player turns and watches him go
  p.yaw=Math.atan2(-(hv.x-p.x),-(hv.z-p.z));
  hv.path=world.findPath(hv.x,hv.z,end.x,end.z);hv.pathI=1;
  let slow=0,backward=0;
  for(let i=0;i<30;i++){
    const [x,z]=[hv.x,hv.z];sim.step(.05);
    if(hv.state!=='retreat')break;
    const dx=hv.x-x,dz=hv.z-z,d=Math.hypot(dx,dz);
    if(d>.02){slow++;if(i>=3)assert.ok(d<=CONFIG.HV.SLOW_RETREAT*.05*1.5+.01,'watched, he backs off at walking pace');
      if((dx*Math.sin(hv.yaw)+dz*Math.cos(hv.yaw))/d<-.5)backward++;}
  }
  assert.ok(slow>=5 && backward>=slow*.6,`slow=${slow}, backward=${backward}`);
  assert.equal(p.health,MAXH);
});
