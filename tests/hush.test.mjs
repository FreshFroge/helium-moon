// "The forest holds its breath" (docs/SCARE_RESEARCH.md C1). Over whole sessions:
//  - hush is only emitted while he is closing in on a player, within HUSH_DIST of them;
//  - at most once per closing-in attempt; some attempts are deliberately skipped;
//  - never during the opening dread (he never closes in then);
//  - it is cosmetic: the hash it uses never touches the AI's random stream.
//   node tests/hush.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';

const world = new World({}); const L = world.trailLength, DT = 0.05, C = CONFIG.HV;
const DREAD_END = CONFIG.SESSION.INTRO_TIME + CONFIG.DIRECTOR.DREAD_TIME;
const hushes = []; let attempts = 0;
for (const seed of [1001, 1002, 1003, 1004, 1005, 1006]) {
  const sim = new GameSim(world, { seed }); sim.addPlayer('p1', 'p1');
  let along = 4, dir = 1, lastAttempt = null;
  for (let t = 0; t < 900; t += DT) {
    const p = sim.players.get('p1'); if (p.state !== 'alive' && p.state !== 'downed') break;
    along += 1.5 * DT * dir; if (along > L - 8 || along < 3) dir *= -1;
    const q = pointAtDistance(world.trail, world.trailCum, along);
    sim.input('p1', { x: q.x, z: q.z, y: world.heightAt(q.x, q.z), yaw: Math.atan2(-Math.sin(q.dir), -Math.cos(q.dir)) + (dir < 0 ? Math.PI : 0), pitch: 0, flash: true, noise: 0.45, viewFov: 75, viewAspect: 16 / 9 });
    if (p.state === 'alive') { p.x = q.x; p.z = q.z; }
    sim.step(DT);
    const co = sim.hv.closingOn;
    if (co && co.t !== lastAttempt && Math.hypot(p.x - sim.hv.x, p.z - sim.hv.z) <= C.HUSH_DIST) { attempts++; lastAttempt = co.t; }
    for (const e of sim.drainEvents()) if (e.type === 'hush') {
      hushes.push({ seed, t: sim.time, closing: !!co, attemptT: co?.t, pid: e.pid, d: Math.hypot(p.x - e.x, p.z - e.z) });
    }
  }
}

test('hush happens, but not on every approach', () => {
  assert.ok(hushes.length >= 3, `${hushes.length} hushes`);
  assert.ok(hushes.length < attempts, `${hushes.length} hushes for ${attempts} close approaches: some must be skipped`);
});
test('only while closing in, within HUSH_DIST, after the dread', () => {
  for (const h of hushes) {
    assert.ok(h.closing, JSON.stringify(h));
    assert.ok(h.d <= C.HUSH_DIST + 2, JSON.stringify(h));
    assert.ok(h.t >= DREAD_END, JSON.stringify(h));
  }
});
test('at most once per closing-in attempt', () => {
  const seen = new Set();
  for (const h of hushes) { const k = h.seed + ':' + h.attemptT; assert.ok(!seen.has(k), k); seen.add(k); }
});
