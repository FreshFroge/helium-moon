// Owner, Oct 26: 15–20 s stalking, then 30–40 s searching, then the hunt ends.
// These fixtures run the real movement/simulation; LOS is controlled to isolate perception.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';

const base = new World(), dt = .05;
function fixture(seed = 31, separation = 35) {
  const world = Object.create(base);
  world.lineOfSight = () => 0;
  const sim = new GameSim(world, { seed });
  sim.state = 'play'; sim.time = 400;
  sim.director.update = () => {}; sim.director.enter('build');
  sim.sf.update = sim.mimic.update = sim.wildlife.update = () => {};
  const p = sim.addPlayer('one', 'One'), hv = sim.hv;
  const q = pointAtDistance(world.trail, world.trailCum, 500);
  const h = pointAtDistance(world.trail, world.trailCum, 500 - separation);
  Object.assign(p, { x:q.x, z:q.z, y:world.heightAt(q.x,q.z), lastX:q.x, lastZ:q.z, flash:true, noise:0, voice:0 });
  hv.place(h.x,h.z); hv.target=p.id; hv.spotted.add(p.id); hv.awareness.set(p.id,2); hv.setState('stalk');
  hv.startChase(p);
  return {sim,p,hv,world};
}
function until(sim, time) { while (sim.time + 1e-7 < time) sim.step(Math.min(dt,time-sim.time)); }

test('unseen hunts always follow both timed phases and finish without a hit', () => {
  for (const seed of [31,32,33,34]) {
    const {sim,p,hv}=fixture(seed), start=sim.time;
    assert.ok(hv.huntHideUntil-start>=15 && hv.huntHideUntil-start<=20);
    assert.ok(hv.huntEndsAt-hv.huntHideUntil>=30 && hv.huntEndsAt-hv.huntHideUntil<=40);
    const end=hv.huntEndsAt;
    until(sim,hv.huntHideUntil-.1);
    assert.equal(hv.huntPhase,'stalk'); assert.equal(sim.director.chasing,true);
    until(sim,hv.huntHideUntil+.1);
    assert.equal(hv.huntPhase,'search');
    until(sim,end-.1); assert.equal(sim.director.chasing,true,'a concealed target receives the full search');
    until(sim,end+.1); assert.equal(sim.director.chasing,false);
    assert.equal(p.health,CONFIG.PLAYER.MAX_HEALTH);
    assert.ok(p.hideGraceUntil>sim.time,'the ending cannot immediately restart another hunt');
    assert.equal(sim.drainEvents().filter(e=>e.type==='chase'&&!e.on).length,1);
  }
});

test('search follows last evidence, never a silent player moving behind cover', () => {
  const {sim,p,hv}=fixture();
  const remembered={...hv.lastSeenChase};
  until(sim,hv.huntHideUntil+.1);
  const away=pointAtDistance(sim.world.trail,sim.world.trailCum,510);
  Object.assign(p,{x:away.x,z:away.z,y:sim.world.heightAt(away.x,away.z),lastX:away.x,lastZ:away.z});
  until(sim,sim.time+10);
  assert.deepEqual(hv.lastSeenChase,remembered,'no exact-position reacquisition or cutoff teleport');
  assert.equal(hv.huntPhase,'search');
});

test('the stalking window cannot walk through a nearby player', () => {
  const {sim,p,hv}=fixture(35,1.2);let closest=hv.dist(p);
  const end=hv.huntHideUntil;
  while(sim.time<end-.1) { sim.step(dt); closest=Math.min(closest,hv.dist(p)); }
  assert.ok(closest>=1.1,`stalk separation ${closest.toFixed(2)} m`);
  assert.equal(p.health,CONFIG.PLAYER.MAX_HEALTH);
});

test('a new visible player can be caught during search, and a hunt request cannot reset its clock', () => {
  const {sim,p,hv,world}=fixture(36);
  const end=hv.huntEndsAt;
  hv.startChase(p); assert.equal(hv.huntEndsAt,end);
  until(sim,hv.huntHideUntil+.1);
  const at=pointAtDistance(world.trail,world.trailCum,498.7);
  hv.place(at.x,at.z); hv.lookYaw=Math.atan2(p.x-hv.x,p.z-hv.z);
  world.lineOfSight=()=>1;
  until(sim,sim.time+5);
  assert.ok(p.health<CONFIG.PLAYER.MAX_HEALTH,'real discovery can still lead to a grab');
  assert.equal(sim.director.chasing,false);
});

test('fresh footsteps guide the search to an approximate source', () => {
  const {sim,p,hv}=fixture(37,12);
  until(sim,hv.huntHideUntil+.1);
  const at=pointAtDistance(sim.world.trail,sim.world.trailCum,490);
  hv.place(at.x,at.z);p.noise=.45;
  until(sim,sim.time+.1);
  assert.ok(hv.lastSeenChase.t>=sim.time-.15,'new audible evidence is investigated');
  assert.ok(Math.hypot(hv.lastSeenChase.x-p.x,hv.lastSeenChase.z-p.z)<5,'hearing locates the source approximately');
});

test('the deadline releases a held player without late damage', () => {
  const {sim,p,hv,world}=fixture(38);
  sim.time=hv.huntEndsAt-.6;hv.huntPhase='search';world.lineOfSight=()=>1;
  const at=pointAtDistance(world.trail,world.trailCum,498.7);hv.place(at.x,at.z);
  hv.startGrab(p);
  until(sim,sim.time+.5);
  assert.ok(hv.grab,'grab is staged just before the deadline');
  until(sim,hv.huntEndsAt+.1);
  assert.equal(hv.grab,null);assert.equal(p.heldUntil,null);
  assert.equal(p.health,CONFIG.PLAYER.MAX_HEALTH);assert.equal(sim.director.chasing,false);
});
