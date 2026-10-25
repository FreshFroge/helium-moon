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
