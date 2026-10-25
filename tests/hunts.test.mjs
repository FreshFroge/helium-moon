// Hunt start rules (owner, Oct 25 2026; docs/HUNT_PLAYTESTS.md):
// a hunt starts only within CONFIG.HV.HUNT_START_RANGE; farther out he closes in first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';

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

test('fail-safe: a hunt on a player he cannot reach (wading in the river) ends instead of running forever', () => {
  // the shallows by the River Bend Overlook: playable for players, not walkable for him
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
  assert.ok(ended != null && ended < CONFIG.HV.HUNT_STALL_TIME + 10, `stuck hunt ends (at ${ended?.toFixed(1)} s)`);
  assert.equal(sim.director.chasing, false);
});

test('running away is not an escape: a sprinting player (9 s stamina) still gets caught', () => {
  for (const seed of [3, 4, 5]) {
    const { sim, p, hv } = fixture(30, seed);
    hv.startChase(p);
    let along = 530, stamina = CONFIG.PLAYER.STAMINA_MAX, ended = null;
    for (let t = 0; t < 60 && ended == null; t += 0.05) {
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
