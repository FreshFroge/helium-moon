import assert from 'node:assert/strict';
import test from 'node:test';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { pointAtDistance } from '../shared/math.js';

const world = new World();
function encounter(creature, separation=6) {
  const sim=new GameSim(world,{seed:42});
  sim.state='play';sim.time=100;sim.director.update=()=>{};sim.director.enter('build');sim.mimic.update=()=>{};
  const p=sim.addPlayer('tester','Tester');
  const at=pointAtDistance(world.trail,world.trailCum,500);
  const target=pointAtDistance(world.trail,world.trailCum,500+separation);
  Object.assign(p,{x:target.x,z:target.z,y:world.heightAt(target.x,target.z),flash:creature==='hv',noise:0});
  p.yaw=Math.atan2(at.x-p.x,at.z-p.z)+Math.PI;
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
  for(let t=0;t<8 && p.health===2;t+=0.05){sim.step(.05);events.push(...sim.drainEvents());}
  assert.ok(p.health<2,`${creature} must reach a real damaging attack`);
  assert.ok(events.some(e=>e.type==='hit'&&e.by===creature));
  if(creature==='sf') assert.ok(events.some(e=>e.type==='sf_vocal'&&e.k==='growl'),'ambush announces its windup at the server tick rate');
  assert.ok(Math.hypot(actor.x-p.x,actor.z-p.z)<initial);
});

test('a close flashlight encounter remains dangerous during the director cooldown',()=>{
  const {sim,p}=encounter('hv',3);
  sim.director.enter('relax');sim.director.lastChase=sim.time;
  for(let t=0;t<6 && p.health===2;t+=.05)sim.step(.05);
  assert.ok(p.health<2,'standing within arm reach cannot exploit a flashlight/cooldown immunity');
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
