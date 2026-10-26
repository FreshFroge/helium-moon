import { CONFIG } from '../shared/config.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { pointAtDistance } from '../shared/math.js';
import { GRAB_KINDS } from '../shared/sim/heliumVoice.js';
const MAXH = CONFIG.PLAYER.MAX_HEALTH;

const world = new World();
function encounter(creature, separation=6) {
  const sim=new GameSim(world,{seed:42});
  sim.state='play';sim.time=400;/* after intro + DIRECTOR.DREAD_TIME */ sim.director.update=()=>{};sim.director.enter('build');sim.mimic.update=()=>{};
  const p=sim.addPlayer('tester','Tester');
  const at=pointAtDistance(world.trail,world.trailCum,500);
  const target=pointAtDistance(world.trail,world.trailCum,500+separation);
  Object.assign(p,{x:target.x,z:target.z,y:world.heightAt(target.x,target.z),flash:creature==='hv',noise:0});
  p.yaw=Math.atan2(at.x-p.x,at.z-p.z);
  const actor=sim[creature];actor.x=at.x;actor.z=at.z;actor.y=world.heightAt(at.x,at.z);
  actor.yaw=actor.lookYaw=Math.atan2(p.x-at.x,p.z-at.z);
  if(creature==='hv') {sim.sf.update=()=>{};actor.target=p.id;actor.awareness.set(p.id,1.5);actor.spotted.add(p.id);actor.setState('watch');}
  else {sim.hv.update=()=>{};actor.setState('lurk');}
  sim.drainEvents();
  return {sim,p,actor};
}

for(const creature of ['hv','sf']) test(`${creature} actually closes distance and damages a stationary player`,()=>{
  const {sim,p,actor}=encounter(creature);
  const events=[];const initial=Math.hypot(actor.x-p.x,actor.z-p.z);
  for(let t=0;t<45 && p.health===MAXH;t+=0.05){sim.step(.05);events.push(...sim.drainEvents());}
  assert.ok(p.health<MAXH,`${creature} must reach a real damaging attack`);
  assert.ok(events.some(e=>e.type==='hit'&&e.by===creature));
  if(creature==='sf') assert.ok(events.some(e=>e.type==='sf_vocal'&&e.k==='growl'),'ambush announces its windup at the server tick rate');
  assert.ok(Math.hypot(actor.x-p.x,actor.z-p.z)<initial);
});

function grabbed(kind='shoulders',coop=false) {
  const {sim,p,actor}=encounter('hv',1.2);
  if(coop)sim.addPlayer('helper','Helper');
  if(kind==='final')p.health=1;
  p.yaw=Math.atan2(-(actor.x-p.x),-(actor.z-p.z));
  actor.startChase(p);actor.huntHideUntil=sim.time;actor.huntPhase='search';
  actor.startGrab(p);actor.grab.kind=kind;
  const health=p.health,events=[];
  for(let t=0;t<6 && p.health===health;t+=.05){sim.step(.05);events.push(...sim.drainEvents());}
  return {sim,p,actor,events};
}

for(const kind of GRAB_KINDS.slice(1))test(`a completed ${kind} grab ends the hunt and immediately retreats`,()=>{
  const {sim,p,actor,events}=grabbed(kind,true);
  assert.equal(actor.grab,null);assert.equal(p.heldUntil,null);
  assert.equal(p.health,kind==='final'?0:MAXH-1,'damage is applied once at release');
  assert.equal(p.state,kind==='final'?'downed':'alive');
  assert.equal(actor.state,'retreat','no lingering beside the released victim');
  assert.equal(actor.anim.grab,0,'the release snapshot must not keep a grab pose');
  assert.equal(sim.director.chasing,false);
  assert.equal(events.filter(e=>e.type==='chase'&&!e.on).length,1,'one unambiguous chase ending');
  assert.equal(events.filter(e=>e.type==='hv_attack'&&e.phase==='release').length,1);
  assert.ok(events.some(e=>e.type==='hv_hunt_phase'&&e.phase==='end'&&e.reason==='grab'));
});

test('the post-grab escape stays fast while watched and cannot immediately restart a hunt',()=>{
  const {sim,p,actor}=encounter('hv',1.2);
  const away=pointAtDistance(world.trail,world.trailCum,470);
  actor.coverAway=()=>[away.x,away.z];actor.concealedAt=()=>false;
  p.yaw=Math.atan2(-(actor.x-p.x),-(actor.z-p.z));
  actor.startChase(p);actor.huntHideUntil=sim.time;actor.huntPhase='search';actor.startGrab(p);
  while(p.health===MAXH)sim.step(.05);
  const from={x:actor.x,z:actor.z},before=actor.dist(p),endedAt=sim.time;
  sim.drainEvents();
  assert.ok(p.hideGraceUntil>sim.time,'the released victim gets the normal hunt-ending breather');
  const other=sim.addPlayer('observer','Observer');Object.assign(other,{x:p.x+1,y:p.y,z:p.z,yaw:p.yaw});
  assert.equal(actor.startChase(other),false,'the escape cannot be replaced with a hunt on a teammate');
  let maximumStep=0,watched=false;
  for(let i=0;i<30;i++){
    p.yaw=Math.atan2(-(actor.x-p.x),-(actor.z-p.z));other.yaw=p.yaw;
    const previous={x:actor.x,z:actor.z};sim.step(.05);
    maximumStep=Math.max(maximumStep,Math.hypot(actor.x-previous.x,actor.z-previous.z));
    watched ||= actor.observers.length>0;
  }
  assert.ok(watched,'the fast escape is exercised in the player view');
  assert.equal(actor.state,'retreat');assert.ok(actor.speed>8,'looking at him cannot slow the post-grab escape');
  assert.equal(actor.anim.low,1);assert.equal(actor.anim.back,0);
  assert.ok(actor.dist(p)>before+8 && Math.hypot(actor.x-from.x,actor.z-from.z)>8);
  assert.ok(maximumStep<=CONFIG.HV.RETREAT*.05+.01,'escape is physical movement, not a teleport');
  assert.equal(p.health,MAXH-1);assert.equal(sim.director.chasing,false);
  assert.equal(sim.drainEvents().filter(e=>e.type==='chase'&&e.on&&e.t>endedAt).length,0);
});

test('a dodged grab does not count as a catch or terminate the ongoing hunt',()=>{
  const {sim,p,actor}=encounter('hv',1.2);
  actor.startChase(p);actor.huntHideUntil=sim.time;actor.huntPhase='search';actor.startGrab(p);
  p.x+=20;p.lastX=p.x;
  for(let t=0;t<.6;t+=.05)sim.step(.05);
  assert.equal(p.health,MAXH);assert.equal(actor.grab,null);
  assert.equal(actor.state,'chase');assert.equal(sim.director.chasing,true);
  assert.ok(sim.drainEvents().some(e=>e.type==='hv_attack'&&e.phase==='miss'));
});

test('a post-grab escape continues its long withdrawal when the first endpoint is still exposed',()=>{
  const {sim,p,actor}=encounter('hv',1.2);let plans=0;
  actor.concealedAt=()=>false;
  actor.coverAway=()=>{
    plans++;
    const along=world.trailInfo(actor.x,actor.z).along;
    const next=pointAtDistance(world.trail,world.trailCum,along-8);
    return[next.x,next.z];
  };
  actor.startChase(p);actor.huntHideUntil=sim.time;actor.huntPhase='search';actor.startGrab(p);
  while(p.health===MAXH)sim.step(.05);
  const from={x:actor.x,z:actor.z};
  for(let i=0;i<80;i++){p.yaw=Math.atan2(-(actor.x-p.x),-(actor.z-p.z));sim.step(.05);}
  assert.ok(plans>=1&&actor.withdrawal?.goal,'a short escape continues toward its distant withdrawal goal');
  assert.ok(Math.hypot(actor.x-from.x,actor.z-from.z)>18,'he keeps moving away through successive escape legs');
  assert.equal(actor.state,'retreat');assert.equal(sim.director.chasing,false);
});

test('a first close flashlight encounter remains dangerous during ordinary director relaxation',()=>{
  const {sim,p}=encounter('hv',3);
  assert.equal(sim.director.nextChaseAt,0,'no completed hunt has started the hard recovery gate');
  sim.director.enter('relax');sim.director.lastChase=sim.time;
  for(let t=0;t<45 && p.health===MAXH;t+=.05)sim.step(.05);
  assert.ok(p.health<MAXH,'a first encounter cannot exploit ordinary director relaxation');
});

for(const flash of [true,false]) test(`first sighting reaches a real attack without preassigned awareness (flashlight ${flash})`,()=>{
  for(const seed of [1,2,3,4,5,6,7,8]) {
    const sim=new GameSim(world,{seed}),p=sim.addPlayer('tester','Tester'),hv=sim.hv;
    sim.state='play';sim.time=400;/* after intro + DIRECTOR.DREAD_TIME */ sim.sf.update=()=>{};sim.mimic.update=()=>{};
    const at=pointAtDistance(world.trail,world.trailCum,500),to=pointAtDistance(world.trail,world.trailCum,506);
    Object.assign(p,{x:to.x,z:to.z,y:world.heightAt(to.x,to.z),yaw:Math.atan2(at.x-to.x,at.z-to.z),pitch:0,flash});
    hv.place(at.x,at.z);hv.yaw=hv.lookYaw=Math.atan2(p.x-hv.x,p.z-hv.z);hv.setState('roam');
    assert.equal(hv.target,null);assert.equal(hv.awareness.size,0);
    let retreatBeforeHit=false,chased=false;
    for(let t=0;t<50 && p.health===MAXH&&!retreatBeforeHit;t+=.05){sim.step(.05);chased ||= hv.state==='chase';if((hv.state==='retreat'||hv.state==='collapse')&&p.health===MAXH)retreatBeforeHit=true;}
    assert.ok(chased,`seed ${seed}: natural first sighting must become a hunt`);
    if(flash) assert.ok(p.health<MAXH||retreatBeforeHit,`seed ${seed}: the hunt attacks or is stopped by the close flashlight counter`);
    else { assert.ok(p.health<MAXH,`seed ${seed}: the unlit hunt must resolve into a damaging attack`); assert.equal(retreatBeforeHit,false); }
    assert.equal(sim.director.chasing,false,'a completed hit closes the director chase');
  }
});

test('acquisition switches from a downed teammate to the living target',()=>{
  const sim=new GameSim(world,{seed:2}),old=sim.addPlayer('old','Old'),p=sim.addPlayer('new','New'),hv=sim.hv;
  sim.state='play';sim.time=400;/* after intro + DIRECTOR.DREAD_TIME */ sim.sf.update=()=>{};sim.mimic.update=()=>{};
  old.state='downed';hv.target=old.id;
  const at=pointAtDistance(world.trail,world.trailCum,500),to=pointAtDistance(world.trail,world.trailCum,506);
  Object.assign(p,{x:to.x,z:to.z,y:world.heightAt(to.x,to.z),yaw:Math.atan2(at.x-to.x,at.z-to.z),pitch:0,flash:false});
  hv.place(at.x,at.z);hv.yaw=hv.lookYaw=Math.atan2(p.x-hv.x,p.z-hv.z);hv.setState('roam');
  for(let t=0;t<45&&p.health===MAXH;t+=.05)sim.step(.05);
  assert.ok(p.health<MAXH,'the living observer becomes the actual attack target');
});

test('losing a chase target clears the director chase flag',()=>{
  const {sim,p,actor}=encounter('hv');
  actor.startChase(p);p.state='dead';sim.step(.05);
  assert.equal(actor.state,'retreat');assert.equal(sim.director.chasing,false);
});

test('a stale downed focus cannot start a Helium Voice hunt',()=>{
  const {sim,p,actor}=encounter('hv');
  p.state='downed'; sim.director.focus=p.id;
  assert.equal(sim.director.focusPlayer(),null,'director drops an inactive focus');
  assert.equal(sim.director.allowChase(p),false,'director rejects an inactive chase target');
  assert.equal(actor.startChase(p),false,'Helium Voice also rejects a stale direct hunt request');
  assert.notEqual(actor.state,'chase');
  assert.equal(sim.director.chasing,false);
});

test('a player who leaves during the skunk windup can avoid its bite',()=>{
  const {sim,p,actor}=encounter('sf');
  sim.step(.05);assert.equal(actor.state,'ambush');
  p.x+=20;p.lastX=p.x;
  for(let t=0;t<5;t+=.05)sim.step(.05);
  assert.equal(p.health,MAXH);
});

test('nearby enemies do not damage through an occluding wall',()=>{
  for(const creature of ['hv','sf']){
    const {sim,p,actor}=encounter(creature,1);
    const blocked=Object.create(world);blocked.lineOfSight=()=>0;actor.world=blocked;
    if(creature==='hv'){actor.setState('chase');actor.lastSeenChase={x:p.x,z:p.z,t:sim.time};}
    else{actor.target=p.id;actor.setState('rear');}
    for(let t=0;t<1;t+=.05)sim.step(.05);
    assert.equal(p.health,MAXH,creature);
  }
});

 test('opening dread cannot be bypassed by the close aggression override',()=>{
  const {sim,p}=encounter('hv',2.2);sim.time=20;
  for(let t=0;t<5;t+=.05)sim.step(.05);
  assert.equal(p.health,MAXH);
});

for (const separation of [3,6]) for (const state of ['prowl','investigate']) test(`skunk at ${separation} m commits to a close ambush from ${state} in the lighter's light`,()=>{
  const {sim,p,actor}=encounter('sf',separation);
  p.flash=true;
  p.yaw=Math.atan2(-(actor.x-p.x),-(actor.z-p.z));
  actor.setState(state,{inv:{x:p.x,z:p.z,t:sim.time,pid:p.id}});
  for(let t=0;t<8 && p.health===MAXH;t+=.05)sim.step(.05);
  assert.ok(p.health<MAXH,`a nearby flashlight must not suppress ${state} attack acquisition`);
});

test('a teammate lighter cannot suppress the skunk attacking the nearest player',()=>{
  // Both players must be inside the new 6.5 m lighter range. The former 10/11 m
  // flashlight fixture no longer supplied light or guaranteed close acquisition.
  const {sim,p,actor}=encounter('sf',3);p.flash=false;
  const q=sim.addPlayer('lamp','Lamp'),at=pointAtDistance(world.trail,world.trailCum,504);
  Object.assign(q,{x:at.x,z:at.z,y:world.heightAt(at.x,at.z),flash:true,
    yaw:Math.atan2(-(actor.x-at.x),-(actor.z-at.z))});
  actor.setState('prowl');
  for(let t=0;t<8 && p.health===MAXH;t+=.05)sim.step(.05);
  assert.ok(p.health<MAXH,'the farther flashlight must not grant immunity to its teammate');
});
