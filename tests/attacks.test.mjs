import assert from 'node:assert/strict';
import test from 'node:test';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { pointAtDistance } from '../shared/math.js';

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
  for(let t=0;t<45 && p.health===2;t+=0.05){sim.step(.05);events.push(...sim.drainEvents());}
  assert.ok(p.health<2,`${creature} must reach a real damaging attack`);
  assert.ok(events.some(e=>e.type==='hit'&&e.by===creature));
  if(creature==='sf') assert.ok(events.some(e=>e.type==='sf_vocal'&&e.k==='growl'),'ambush announces its windup at the server tick rate');
  assert.ok(Math.hypot(actor.x-p.x,actor.z-p.z)<initial);
});

test('a close flashlight encounter remains dangerous during the director cooldown',()=>{
  const {sim,p}=encounter('hv',3);
  sim.director.enter('relax');sim.director.lastChase=sim.time;
  for(let t=0;t<45 && p.health===2;t+=.05)sim.step(.05);
  assert.ok(p.health<2,'standing within arm reach cannot exploit a flashlight/cooldown immunity');
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
    for(let t=0;t<50 && p.health===2&&!retreatBeforeHit;t+=.05){sim.step(.05);chased ||= hv.state==='chase';if(hv.state==='retreat'&&p.health===2)retreatBeforeHit=true;}
    assert.ok(chased,`seed ${seed}: natural first sighting must become a hunt`);
    if(flash) assert.ok(p.health<2||retreatBeforeHit,`seed ${seed}: the hunt attacks or is stopped by the close flashlight counter`);
    else { assert.ok(p.health<2,`seed ${seed}: the unlit hunt must resolve into a damaging attack`); assert.equal(retreatBeforeHit,false); }
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
  for(let t=0;t<45&&p.health===2;t+=.05)sim.step(.05);
  assert.ok(p.health<2,'the living observer becomes the actual attack target');
});

test('losing a chase target clears the director chase flag',()=>{
  const {sim,p,actor}=encounter('hv');
  actor.startChase(p);p.state='dead';sim.step(.05);
  assert.equal(actor.state,'retreat');assert.equal(sim.director.chasing,false);
});

test('a player who leaves during the skunk windup can avoid its bite',()=>{
  const {sim,p,actor}=encounter('sf');
  sim.step(.05);assert.equal(actor.state,'ambush');
  p.x+=20;p.lastX=p.x;
  for(let t=0;t<5;t+=.05)sim.step(.05);
  assert.equal(p.health,2);
});

test('nearby enemies do not damage through an occluding wall',()=>{
  for(const creature of ['hv','sf']){
    const {sim,p,actor}=encounter(creature,1);
    const blocked=Object.create(world);blocked.lineOfSight=()=>0;actor.world=blocked;
    if(creature==='hv'){actor.setState('chase');actor.lastSeenChase={x:p.x,z:p.z,t:sim.time};}
    else{actor.target=p.id;actor.setState('rear');}
    for(let t=0;t<1;t+=.05)sim.step(.05);
    assert.equal(p.health,2,creature);
  }
});

 test('opening dread cannot be bypassed by the close aggression override',()=>{
  const {sim,p}=encounter('hv',2.2);sim.time=20;
  for(let t=0;t<5;t+=.05)sim.step(.05);
  assert.equal(p.health,2);
});

for (const separation of [6,10]) for (const state of ['prowl','investigate']) test(`skunk at ${separation} m commits to a close ambush from ${state} under a flashlight`,()=>{
  const {sim,p,actor}=encounter('sf',separation);
  p.flash=true;
  p.yaw=Math.atan2(-(actor.x-p.x),-(actor.z-p.z));
  actor.setState(state,{inv:{x:p.x,z:p.z,t:sim.time,pid:p.id}});
  for(let t=0;t<8 && p.health===2;t+=.05)sim.step(.05);
  assert.ok(p.health<2,`a nearby flashlight must not suppress ${state} attack acquisition`);
});

test('a teammate flashlight cannot suppress the skunk attacking the nearest player',()=>{
  const {sim,p,actor}=encounter('sf',10);p.flash=false;
  const q=sim.addPlayer('lamp','Lamp'),at=pointAtDistance(world.trail,world.trailCum,511);
  Object.assign(q,{x:at.x,z:at.z,y:world.heightAt(at.x,at.z),flash:true,
    yaw:Math.atan2(-(actor.x-at.x),-(actor.z-at.z))});
  actor.setState('prowl');
  for(let t=0;t<8 && p.health===2;t+=.05)sim.step(.05);
  assert.ok(p.health<2,'the farther flashlight must not grant immunity to its teammate');
});
