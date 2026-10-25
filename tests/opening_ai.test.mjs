import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../shared/world.js';
import {GameSim} from '../shared/sim/sim.js';
import {pointAtDistance} from '../shared/math.js';
import {onScreen} from '../shared/sim/perception.js';
import {CONFIG} from '../shared/config.js';
const world=new World();

test('ordinary trail traversal gets cold before an opening-period sighting or attack',()=>{
  let totalCold=0;
  for(const seed of [1001,1002]){
    const sim=new GameSim(world,{seed}),p=sim.addPlayer('one','One');let seen=0,hits=0,cold=0;
    const start=100, origin=pointAtDistance(world.trail,world.trailCum,start);
    Object.assign(p,{x:origin.x,z:origin.z,y:world.heightAt(origin.x,origin.z),lastX:origin.x,lastZ:origin.z});
    for(let t=0;t<CONFIG.SESSION.INTRO_TIME+CONFIG.DIRECTOR.DREAD_TIME;t+=.05){
      const at=pointAtDistance(world.trail,world.trailCum,start+t*1.6);
      sim.input(p.id,{x:at.x,y:world.heightAt(at.x,at.z),z:at.z,yaw:Math.atan2(-Math.sin(at.dir),-Math.cos(at.dir)),pitch:0,flash:true,noise:.45});
      sim.step(.05);
      if(sim.hv.state!=='dormant'){
        if(onScreen(world,p,sim.hv.x,sim.hv.y,sim.hv.z))seen++;
        if(sim.hv.dist(p)<CONFIG.TERROR.OUTER)cold++;
      }
      for(const e of sim.drainEvents())if(e.type==='hit'||e.type==='downed'||e.type==='dead')hits++;
    }
    assert.equal(seen,0,`seed ${seed}: no early on-screen appearance during ordinary traversal`);
    assert.equal(hits,0,`seed ${seed}: opening remains protected`);
    totalCold+=cold;

  }
  assert.ok(totalCold>0,'opening traversal sample still receives restrained cold build-up');
});
