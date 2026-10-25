// Hunt start rules (owner, Oct 25 2026; docs/HUNT_PLAYTESTS.md):
// a hunt starts only within CONFIG.HV.HUNT_START_RANGE; farther out he closes in first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { moveCharacter, waterDepthAt } from '../shared/physics.js';

const world = new World();
const R = CONFIG.HV.HUNT_START_RANGE;

function fixture(separation, seed = 7) {
  const sim = new GameSim(world, { seed });
  sim.state = 'play'; sim.time = 400; /* after intro + dread */
  sim.director.update = () => {}; sim.director.enter('build'); sim.sf.update = () => {}; sim.mimic.update = () => {};
  const p = sim.addPlayer('one', 'One'), hv = sim.hv;
  const at = pointAtDistance(world.trail, world.trailCum, 500), to = pointAtDistance(world.trail, world.trailCum, 500 + separation);
  Object.assign(p, { x: to.x, z: to.z, y: world.heightAt(to.x, to.z), flash: true, pitch: 0, viewFov: 75, viewAspect: 16 / 9 });
  p.yaw = Math.atan2(at.x - p.x, at.z - p.z);   // facing away from him (camera looks down -Z)
  hv.place(at.x, at.z); hv.yaw = hv.lookYaw = Math.atan2(p.x - hv.x, p.z - hv.z);
  hv.target = p.id; hv.awareness.set(p.id, 2); hv.spotted.add(p.id); hv.setState('stalk');
  return { sim, p, hv };
}

test(`a hunt requested from far away does not start: he closes in first`, () => {
  const { sim, p, hv } = fixture(70);
  assert.ok(hv.dist(p) > R);
  assert.equal(hv.startChase(p), false);
  assert.equal(hv.state, 'stalk');
  assert.equal(sim.director.chasing, false, 'no hunt (and no hum) yet');
  assert.equal(hv.closingOn?.pid, p.id);
});

test(`after closing in, the hunt commits inside ${R} m`, () => {
  for (const seed of [7, 8, 9]) {
    const { sim, p, hv } = fixture(70, seed);
    hv.startChase(p);
    let startedAt = null;
    for (let t = 0; t < 40 && startedAt == null; t += 0.05) {
      sim.step(0.05);
      for (const e of sim.drainEvents()) if (e.type === 'chase' && e.on) startedAt = hv.dist(p);
    }
    assert.ok(startedAt != null, `seed ${seed}: he reached the player and committed within 40 s`);
    assert.ok(startedAt <= R + 0.5, `seed ${seed}: committed at ${startedAt?.toFixed(1)} m (<= ${R})`);
  }
});

test('a hunt requested inside the range starts immediately', () => {
  const { sim, p, hv } = fixture(20);
  hv.startChase(p);
  assert.equal(hv.state, 'chase');
  assert.equal(sim.director.chasing, true);
});

test('hunts sample bounded changes in pursuit pace and unseen cutoff timing', () => {
  const paces = [], cutoffs = [], intervals = [];
  for (let seed = 20; seed < 28; seed++) {
    const { sim, p, hv } = fixture(20, seed);
    hv.startChase(p);
    paces.push(hv.huntPace); cutoffs.push(hv.huntCutMul); intervals.push(hv.huntPaceAt - sim.time);
    assert.ok(hv.huntPace >= CONFIG.HV.HUNT_PACE[0] && hv.huntPace <= CONFIG.HV.HUNT_PACE[1]);
    assert.ok(hv.huntCutMul >= CONFIG.HV.HUNT_CUTOFF_JITTER[0] && hv.huntCutMul <= CONFIG.HV.HUNT_CUTOFF_JITTER[1]);
    assert.ok(hv.huntPaceAt - sim.time >= CONFIG.HV.HUNT_PACE_INTERVAL[0]
      && hv.huntPaceAt - sim.time <= CONFIG.HV.HUNT_PACE_INTERVAL[1]);
  }
  assert.ok(Math.max(...paces)-Math.min(...paces)>.12,'pursuit cadence varies across hunts');
  assert.ok(Math.max(...cutoffs)-Math.min(...cutoffs)>.25,'cutoff timing varies across hunts');
  assert.ok(Math.max(...intervals)-Math.min(...intervals)>.5,'cadence duration varies across hunts');
});

test('a hunt prowls within twelve to fifteen feet for about thirty seconds before attacking',()=>{
  const {sim,p,hv}=fixture(4.2,31);p.flash=false;
  hv.startChase(p);
  for(let t=0;t<25;t+=.05)sim.step(.05);
  assert.equal(p.health,2,'the prowl is threatening without an early strike');
  assert.ok(hv.huntProwlT>=24,'nearby prowl time accumulates in the ring');
  for(let t=0;t<15&&p.health===2;t+=.05)sim.step(.05);
  assert.ok(p.health<2,'the completed prowl resolves into the final attack');
});

test('fail-safe: a hunt on a target he cannot reach ends instead of running forever', () => {
  // synthetic unreachable target: deep river water (real players are blocked there too; this
  // guards any other unreachable spot, e.g. future props or nav gaps)
  let spot = null;
  for (let a = 220; a < 270 && !spot; a += 7) for (const side of [6, 10, 14, 18]) {
    const q = pointAtDistance(world.trail, world.trailCum, a);
    const x = q.x + Math.cos(q.dir) * side, z = q.z - Math.sin(q.dir) * side;
    if (!world.navWalkable(x, z) && world.isPlayable(x, z) && world.waterAt(x, z) !== null) { spot = { a, x, z }; break; }
  }
  assert.ok(spot, 'fixture: a wadeable river spot exists');
  const { sim, p, hv } = fixture(20, 3);
  Object.assign(p, { x: spot.x, z: spot.z, y: world.heightAt(spot.x, spot.z) });
  const at = pointAtDistance(world.trail, world.trailCum, spot.a - 20); hv.place(at.x, at.z);
  hv.startChase(p);
  let ended = null;
  for (let t = 0; t < 40 && ended == null; t += 0.05) { sim.step(0.05); for (const e of sim.drainEvents()) if (e.type === 'chase' && !e.on) ended = t; }
  assert.ok(ended != null && ended < CONFIG.HV.HUNT_STALL_TIME * 3 + 10, `stuck hunt ends (at ${ended?.toFixed(1)} s)`);
  assert.equal(sim.director.chasing, false);
});

test('running away is not an escape: a sprinting player (9 s stamina) still gets caught', () => {
  for (const seed of [3, 4, 5]) {
    const { sim, p, hv } = fixture(30, seed);
    hv.startChase(p);
    let along = 530, stamina = CONFIG.PLAYER.STAMINA_MAX, ended = null;
    for (let t = 0; t < 120 && ended == null; t += 0.05) {
      const sprint = stamina > 0.2; stamina -= sprint ? 0.05 : -0.05 * CONFIG.PLAYER.STAMINA_REGEN;
      along += (sprint ? CONFIG.PLAYER.SPRINT : CONFIG.PLAYER.WALK) * 0.05;
      const q = pointAtDistance(world.trail, world.trailCum, along), back = pointAtDistance(world.trail, world.trailCum, along - 3);
      Object.assign(p, { x: q.x, z: q.z, y: world.heightAt(q.x, q.z), lastX: q.x, lastZ: q.z, sprint, noise: sprint ? 1 : 0.45 });
      p.yaw = Math.atan2(back.x - q.x, back.z - q.z);   // facing where they run (away from him)
      sim.step(0.05);
      for (const e of sim.drainEvents()) if (e.type === 'chase' && !e.on) ended = t;
    }
    assert.ok(ended != null, `seed ${seed}: the hunt ends`);
    assert.ok(p.health < 2, `seed ${seed}: it ends with a hit, not by outrunning him (ended at ${ended?.toFixed(1)} s)`);
  }
});

test('hugging a big tree trunk is not an escape: the final lunge reaches the player', () => {
  // spots a real player body can occupy (pushed out of colliders) inside a 2 m nav cell
  // that the trunk blocks for the creature
  const spots = [];
  for (let a = 300; a < 1700 && spots.length < 5; a += 11) for (const side of [-14, -10, -6, 6, 10, 14]) {
    const q = pointAtDistance(world.trail, world.trailCum, a);
    const x = q.x + Math.cos(q.dir) * side, z = q.z - Math.sin(q.dir) * side;
    if (world.navWalkable(x, z) || !world.isPlayable(x, z) || waterDepthAt(world, x, z) > CONFIG.DEEP_WATER) continue;
    const r = moveCharacter(world, { x, y: world.heightAt(x, z), z }, 0, 0, CONFIG.PLAYER.RADIUS, { boundary: true });
    if (world.navWalkable(r.x, r.z)) continue;
    const inside = world.queryColliders(r.x, r.z, 2, []).some((ref) => ref < 100000 && Math.hypot(r.x - world.circles[ref][0], r.z - world.circles[ref][1]) < world.circles[ref][2] + 0.25);
    if (inside) continue;
    spots.push({ a, x: r.x, z: r.z }); break;
  }
  assert.ok(spots.length >= 3, `fixture: found ${spots.length} trunk-hugging spots`);
  for (const sp of spots) {
    const { sim, p, hv } = fixture(20, 3);
    Object.assign(p, { x: sp.x, z: sp.z, y: world.heightAt(sp.x, sp.z), flash: false });
    const at = pointAtDistance(world.trail, world.trailCum, sp.a - 20); hv.place(at.x, at.z);
    hv.startChase(p);
    for (let t = 0; t < 120 && p.health === 2; t += 0.05) sim.step(0.05);
    assert.ok(p.health < 2, `trail ${sp.a}: he reaches a player pressed against the trunk (state ${hv.state}, d ${hv.dist(p).toFixed(2)}, prowl ${(hv.huntProwlT||0).toFixed(1)}/${(hv.huntProwlFor||0).toFixed(1)})`);
  }
});
