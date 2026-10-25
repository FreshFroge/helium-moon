import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { onScreen } from '../shared/sim/perception.js';

const world = new World();
function encounter() {
  const sim = new GameSim(world, {seed:42});
  sim.state='play';sim.time=100;sim.director.update=()=>{};sim.director.enter('build');sim.sf.update=()=>{};sim.mimic.update=()=>{};
  const p=sim.addPlayer('one','One'), hv=sim.hv;
  const at=pointAtDistance(world.trail,world.trailCum,500), to=pointAtDistance(world.trail,world.trailCum,502.3);
  Object.assign(p,{x:to.x,z:to.z,y:world.heightAt(to.x,to.z),flash:true,pitch:0,viewFov:75,viewAspect:16/9});
  hv.place(at.x,at.z);hv.yaw=hv.lookYaw=Math.atan2(p.x-hv.x,p.z-hv.z);
  hv.target=p.id;hv.awareness.set(p.id,2);hv.spotted.add(p.id);hv.setState('chase');hv.speed=CONFIG.HV.BURST;
  p.yaw=Math.atan2(hv.x-p.x,hv.z-p.z); // looking away (camera faces -Z)
  return {sim,p,hv};
}
function tick(sim,seconds) {for(let t=0;t<seconds;t+=.05)sim.step(.05);}

test('unseen close approach brakes to a creep, waits, then attacks when spotted',()=>{
  const {sim,p,hv}=encounter();
  sim.step(.05);
  assert.ok(hv.speed<=CONFIG.HV.CREEP_SPEED,'a running arrival brakes at eight feet');
  tick(sim,2);
  assert.equal(p.health,2);assert.equal(hv.closeCommitted,false);
  assert.ok(hv.dist(p)>1.6 && hv.dist(p)<2.4,'he creeps into a nearby waiting position');
  p.yaw+=Math.PI;sim.step(.05);
  assert.equal(hv.closeCommitted,true);assert.ok(hv.speed>CONFIG.HV.CREEP_SPEED);
  p.yaw+=Math.PI;tick(sim,2);
  assert.ok(p.health<2,'looking away after spotting him cannot undo his committed lunge');
});

test('looking above him is not a sighting; looking down at him triggers the attack',()=>{
  const {sim,p,hv}=encounter();p.yaw+=Math.PI;p.pitch=1.45;
  tick(sim,1);assert.equal(hv.closeCommitted,false);assert.equal(p.health,2);
  p.pitch=-.25;tick(sim,2);assert.ok(p.health<2);
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
});

test('server accepts bounded screen settings for individual co-op players',()=>{
  const {sim,p}=encounter();const second=sim.addPlayer('two','Two');
  sim.input(p.id,{viewFov:90,viewAspect:2.4});sim.input(second.id,{viewFov:55,viewAspect:.75});
  assert.deepEqual([p.viewFov,p.viewAspect,second.viewFov,second.viewAspect],[90,2.4,55,.75]);
  sim.input(p.id,{viewFov:999,viewAspect:999});assert.deepEqual([p.viewFov,p.viewAspect],[120,5]);
  sim.input(p.id,{viewFov:NaN,viewAspect:Infinity});assert.deepEqual([p.viewFov,p.viewAspect],[120,5]);
});

test('retreat moves physically backward at crawl speed and transmits its pose',()=>{
  const {sim,p,hv}=encounter();
  hv.retreatFrom(p,false,true);
  const end=pointAtDistance(world.trail,world.trailCum,470);
  hv.path=world.findPath(hv.x,hv.z,end.x,end.z);hv.pathI=1;
  hv.yaw=Math.atan2(hv.path[1][0]-hv.x,hv.path[1][1]-hv.z)+Math.PI;
  let fast=0,backward=0;
  for(let i=0;i<40;i++){
    const [x,z]=[hv.x,hv.z];sim.step(.05);
    const dx=hv.x-x,dz=hv.z-z,d=Math.hypot(dx,dz);
    assert.ok(d<=CONFIG.HV.RETREAT*.05*1.5,'each movement step is bounded, never a teleport');
    if(d>.3){fast++;if((dx*Math.sin(hv.yaw)+dz*Math.cos(hv.yaw))/d<-.8)backward++;}
    assert.ok(hv.snapshot()[7]&16,'the authoritative retreat reaches every client as a crawl pose');
  }
  assert.ok(fast>=20 && backward>=20,`fast=${fast}, backward=${backward}`);
  assert.equal(p.health,2);
});
