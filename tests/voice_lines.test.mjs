// Helium Voice spoken lines (shared/sim/voiceLines.js; Codex voice direction):
//  - chosen only from AI events, as line ids, with silence the most common outcome;
//  - never the same line twice in a row; a line isn't reused within VOICE_REUSE;
//  - ordinary lines respect the 18-30 s cooldown (forced hunt-start lines may bypass it);
//  - every id the sim can emit has audio on disk (recorded or cloned).
//   node tests/voice_lines.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { pointAtDistance } from '../shared/math.js';

const world = new World({}); const L = world.trailLength, DT = 0.05;
const lines = [];
for (const seed of [1001, 1002, 1003, 1004]) {
  const sim = new GameSim(world, { seed }); sim.addPlayer('p1', 'p1');
  let along = 4, dir = 1;
  for (let t = 0; t < 900; t += DT) {
    const p = sim.players.get('p1'); if (p.state !== 'alive' && p.state !== 'downed') break;
    along += 1.5 * DT * dir; if (along > L - 8 || along < 3) dir *= -1;
    const q = pointAtDistance(world.trail, world.trailCum, along);
    sim.input('p1', { x: q.x, z: q.z, y: world.heightAt(q.x, q.z), yaw: Math.atan2(-Math.sin(q.dir), -Math.cos(q.dir)) + (dir < 0 ? Math.PI : 0), pitch: 0, flash: true, noise: 0.45, viewFov: 75, viewAspect: 16 / 9 });
    if (p.state === 'alive') { p.x = q.x; p.z = q.z; }
    sim.step(DT);
    for (const e of sim.drainEvents()) if (e.type === 'hv_line') lines.push({ seed, ...e });
  }
}

test('Helium Voice emits no spoken lines', () => {
  assert.equal(lines.length, 0, `${lines.length} spoken lines in 4 sessions`);
});
