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

// Hunts: once a hunt is on, the ONLY way to call it off is to hide from him (CONFIG.HV.HIDE_*;
// owner, Puppet rework). Being seen, lit at any range, and time do not end it.
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

// hiding fixture: the player slipped away from where he last had them and is now crouched in
// the dark, light off, still and silent; he searches round the old spot
function hidingFixture(sep=20){
  const {sim,p,hv}=encounter(sep);
  const decoy=pointAtDistance(world.trail,world.trailCum,500+sep+24);
  Object.assign(p,{flash:false,crouch:true,hidden:true,noise:0,sprint:false,moveSpeed:0});
  hv.lastSeenChase={x:decoy.x,z:decoy.z,t:sim.time-3};
  return {sim,p,hv};
}
test('hiding ends a hunt: out of his sight, dark, still and quiet - he loses you and goes limp',()=>{
  const {sim,p,hv}=hidingFixture();
  let lost=null,events=[];
  for(let t=0;t<14&&lost==null;t+=.05){p.moveSpeed=0;p.noise=0;sim.step(.05);events.push(...sim.drainEvents());if(hv.state==='collapse')lost=t;}
  assert.ok(lost!=null,`he lost them (state ${hv.state}, hide ${hv.hide?.t?.toFixed(2)})`);
  assert.ok(lost>=CONFIG.HV.HIDE_TIME-.06,`not instantly (${lost?.toFixed(2)} s)`);
  assert.ok(events.some(e=>e.type==='hv_lost'&&e.pid===p.id));
  assert.equal(sim.director.chasing,false);assert.equal(p.health,MAXH);
  assert.ok(p.hideGraceUntil>sim.time,'a breather before the next hunt');
});

test('your light gives you away: a lit hiding place never ends the hunt',()=>{
  const {sim,p,hv}=hidingFixture();p.flash=true;
  for(let t=0;t<12;t+=.05){p.moveSpeed=0;sim.step(.05);assert.notEqual(hv.state,'collapse');}
});

test('moving gives you away too',()=>{
  const {sim,p,hv}=hidingFixture();
  for(let t=0;t<12;t+=.05){p.moveSpeed=1.4;sim.step(.05);assert.notEqual(hv.state,'collapse');}
});

test('no hunt opens on a downed player; after hiding there is a breather',()=>{
  const {sim,p,hv}=encounter(20);
  p.state='downed';hv.setState('stalk');
  assert.equal(hv.startChase(p),false);assert.equal(sim.director.allowChase(p),false);
  p.state='alive';p.hideGraceUntil=sim.time+30;
  assert.equal(hv.startChase(p),false,'grace after hiding from him');
  p.hideGraceUntil=null;hv.startChase(p);assert.equal(hv.state,'chase');
});

test('losing sight or time no longer ends a hunt',()=>{
  const {sim,p,hv}=encounter(25);
  hv.startChase(p);assert.equal(sim.director.chasing,true);
  hv.huntHideUntil=sim.time; // exercise the committed-pursuit behavior after the opening stalk
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
