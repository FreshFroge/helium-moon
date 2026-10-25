// Helium Voice must never freeze in place while trying to move (Codex #20 trace, fixed Oct 25):
//  - seed 1003: boxed in by a 0.62 m fallen log (taller than his old 0.6 m step) that the
//    nav grid can't see -> HV.STEP_OVER 0.75 clears every log on the map (max 0.67 m);
//  - seed 1004: wedged in a 0.42 m gap between two trunks inside an open 2 m nav cell ->
//    cells he physically can't enter are avoided by the planner for HV.NAV_BLOCK_TIME s.
//  - SF6 (seeds 1001/1002 stalled at ~(254,-114.6)): logs/fences above the skunk's 0.5 m step
//    are costly cells in its planner (skunk.js tallLogCells) + the same blocked-cell memory.
//   node tests/nav_stuck.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { pointAtDistance } from '../shared/math.js';

const world = new World({}); const L = world.trailLength, DT = 0.05;
const MOVING = { hv: new Set(['roam', 'stalk', 'investigate', 'search', 'retreat', 'chase']), sf: new Set(['prowl', 'investigate', 'retreat']) };

function walker(s, t) {   // the pacing test's "glances back every 20 s" walker
  s.along ??= 4; s.dir ??= 1; s.along += 1.6 * DT * s.dir;
  if (s.along > L - 8 || s.along < 3) s.dir *= -1;
  const back = (t % 20) < 3, q = pointAtDistance(world.trail, world.trailCum, s.along);
  const fwd = Math.atan2(-Math.sin(q.dir), -Math.cos(q.dir));
  return { x: q.x, z: q.z, yaw: (s.dir < 0) !== back ? fwd + Math.PI : fwd, pitch: 0, flash: true, noise: 0.45 };
}

for (const [who, seed, until] of [['hv', 1003, 420], ['hv', 1004, 420], ['sf', 1001, 700], ['sf', 1002, 700]]) test(`${who === 'hv' ? 'Helium Voice' : 'SF6'}, seed ${seed}: never frozen for 20 s while in a moving state`, () => {
  const sim = new GameSim(world, { seed }); sim.addPlayer('p1', 'p1'); const s = {}, hist = [];
  let worst = null;
  for (let t = 0; t < until; t += DT) {
    const m = walker(s, sim.time); sim.input('p1', { ...m, y: world.heightAt(m.x, m.z), viewFov: 75, viewAspect: 16 / 9 });
    const q = sim.players.get('p1'); q.x = m.x; q.z = m.z; q.lastX = m.x; q.lastZ = m.z;
    sim.step(DT); sim.drainEvents();
    const hv = sim[who]; hist.push([sim.time, hv.x, hv.z, hv.state]);
    while (hist[0][0] < sim.time - 20) hist.shift();
    if (sim.time > 240 && hist.every((h) => MOVING[who].has(h[3]))) {
      let span = 0; for (const h of hist) span = Math.max(span, Math.hypot(h[1] - hv.x, h[2] - hv.z));
      if (span < 2) { worst = { t: +sim.time.toFixed(0), x: +hv.x.toFixed(1), z: +hv.z.toFixed(1), state: hv.state }; break; }
    }
  }
  assert.equal(worst, null, `frozen while moving: ${JSON.stringify(worst)}`);
});
