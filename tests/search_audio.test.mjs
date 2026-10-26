// Search movement uses authoritative physical motion, not a proximity alarm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { searchJointCrack, SR } from '../client/audio/synth.js';

const base = new World(), dt = .05;
function fixture() {
  const world = Object.create(base); world.lineOfSight = () => 0;
  const sim = new GameSim(world, { seed: 31 }); sim.state = 'play'; sim.time = 400;
  sim.director.update = sim.sf.update = sim.mimic.update = sim.wildlife.update = () => {};
  sim.director.enter('build');
  const p = sim.addPlayer('one', 'One'), hv = sim.hv;
  const q = pointAtDistance(world.trail, world.trailCum, 500);
  const h = pointAtDistance(world.trail, world.trailCum, 480);
  Object.assign(p, { x:q.x, z:q.z, y:world.heightAt(q.x,q.z), lastX:q.x, lastZ:q.z, flash:true, noise:0, voice:0 });
  hv.place(h.x,h.z); hv.target=p.id; hv.spotted.add(p.id); hv.awareness.set(p.id,2); hv.setState('stalk');
  hv.startChase(p); sim.drainEvents();
  return { sim, p, hv };
}

test('a full unseen hunt cracks at physical search positions, never in the opening stalk or escape', () => {
  const {sim,p,hv} = fixture(), end = hv.huntEndsAt, hideUntil = hv.huntHideUntil, sounds = [];
  while(sim.time < end + 2) {
    const from = {x:hv.x,z:hv.z}; sim.step(dt);
    for(const e of sim.drainEvents().filter(e=>e.type==='hv_search_move')) {
      assert.equal(hv.huntPhase,'search'); assert.equal(hv.state,'chase');
      assert.ok(sim.time >= hideUntil && sim.time < end);
      assert.ok(Math.hypot(hv.x-from.x,hv.z-from.z)>.005,'body actually moved');
      assert.ok(Math.hypot(e.x-hv.x,e.y-hv.y-1.15,e.z-hv.z)<.01,'sound originates at the body');
      sounds.push({time:sim.time,...e});
    }
  }
  assert.ok(sounds.length >= 3,`search emitted ${sounds.length} movement cues`);
  assert.ok(sounds.length <= 25,'not a continuous crackling alarm');
  for(let i=1;i<sounds.length;i++) assert.ok(sounds[i].time-sounds[i-1].time>=CONFIG.HV.SEARCH_CRACK_INTERVAL[0]-.001);
  assert.equal(p.health,CONFIG.PLAYER.MAX_HEALTH);
});

test('waiting, blocked motion, rushes, freezing, grabbing and relocation stay silent', () => {
  const {sim,hv}=fixture(); hv.huntPhase='search';
  const {x,z}=hv;
  for(const state of ['blocked','rush','freeze','grab','relocate']) {
    hv.resetSearchSound();hv.searchSoundAt=0;hv.searchSoundDistance=.001;
    Object.assign(hv.anim,{run:state==='rush'?1:0,frozen:state==='freeze'?1:0});
    hv.grab=state==='grab'?{}:null;
    const distance=state==='blocked'?0:state==='relocate'?10:.05;
    hv.x=x+distance; hv.searchMovementSound(dt,x,z,true);
    assert.equal(sim.drainEvents().filter(e=>e.type==='hv_search_move').length,0,state);
  }
  hv.grab=null;hv.anim.run=hv.anim.frozen=0;hv.state='stalk';hv.x=x+.05;
  hv.searchMovementSound(dt,x,z,true);
  assert.equal(sim.drainEvents().length,0,'outside search remains silent');
});

test('lost-evidence searches also emit movement cracks without changing gameplay RNG', () => {
  const {sim,hv}=fixture();
  // Snapshot the next gameplay RNG value via an identically constructed fixture.
  const twin=fixture();
  hv.setState('search');hv.searchAt={x:hv.x,z:hv.z};
  hv.searchSoundAt=0;hv.searchSoundDistance=.01;
  const fromX=hv.x;hv.x+=.05;hv.searchMovementSound(dt,fromX,hv.z,true);
  const [event]=sim.drainEvents();assert.equal(event.type,'hv_search_move');
  assert.equal(sim.rng(),twin.sim.rng(),'sound variation never changes AI decisions');
});

test('pausing then resuming movement cannot shorten an already scheduled crack cooldown', () => {
  const {sim,hv}=fixture();hv.huntPhase='search';
  hv.searchSoundAt=sim.time+2.3;const due=hv.searchSoundAt;
  hv.searchMovementSound(dt,hv.x,hv.z,true);
  assert.equal(hv.searchSoundAt,due);
  sim.time+=.1;hv.searchSoundDistance=.001;
  const x=hv.x;hv.x+=.05;hv.searchMovementSound(dt,x,hv.z,true);
  assert.equal(sim.drainEvents().length,0);
});

test('the four creak/crack variants have finite, bounded PCM and a short decay', () => {
  const variants=[];
  for(let i=0;i<4;i++) {
    const pcm=searchJointCrack(240+i);variants.push(pcm);
    assert.ok(pcm.every(Number.isFinite));
    assert.ok(pcm.length/SR>=.6&&pcm.length/SR<=.7);
    const rms=Math.sqrt(pcm.reduce((sum,v)=>sum+v*v,0)/pcm.length);
    assert.ok(rms>.02&&rms<.25,`RMS ${rms}`);
    assert.ok(pcm.every(v=>Math.abs(v)<=.8));
    assert.ok(Math.abs(pcm[0])<1e-6&&Math.abs(pcm.at(-1))<1e-6);
  }
  assert.ok(variants[0].some((v,i)=>v!==variants[1][i]));
});
