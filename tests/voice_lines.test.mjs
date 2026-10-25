// Helium Voice spoken lines (shared/sim/voiceLines.js; Codex voice direction):
//  - chosen only from AI events, as line ids, with silence the most common outcome;
//  - never the same line twice in a row; a line isn't reused within VOICE_REUSE;
//  - ordinary lines respect the 18-30 s cooldown (forced hunt-start lines may bypass it);
//  - every id the sim can emit has audio on disk (recorded or cloned).
//   node tests/voice_lines.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { pointAtDistance } from '../shared/math.js';
import { VOICE_CONTEXTS, VOICE_COOLDOWN, VOICE_REUSE } from '../shared/sim/voiceLines.js';

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

test('he speaks sometimes, from AI events only', () => {
  assert.ok(lines.length >= 2, `${lines.length} lines in 4 sessions`);
  for (const l of lines) assert.ok(VOICE_CONTEXTS[l.ctx]?.includes(l.id), JSON.stringify(l));
});
test('no repeats, reuse gap, cooldown', () => {
  const by = {};
  for (const l of lines) (by[l.seed] ||= []).push(l);
  for (const list of Object.values(by)) for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    assert.notEqual(a.id, b.id, `${a.id} twice in a row`);
    if (b.ctx !== 'hunt_start' && b.ctx !== 'hit') assert.ok(b.t - a.t >= VOICE_COOLDOWN[0] - 0.01, `${b.t - a.t} s between lines`);
    for (const c of list.slice(0, i)) if (c.id === b.id) assert.ok(b.t - c.t >= VOICE_REUSE - 0.01, `${b.id} reused after ${b.t - c.t} s`);
  }
});
test('every line id has audio', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../assets/audio/hv_voice/lines.json', import.meta.url)));
  for (const ids of Object.values(VOICE_CONTEXTS)) for (const id of ids) {
    if (id.startsWith('rec_')) assert.ok(fs.existsSync(new URL(`../assets/audio/hv_voice/hv_${id.slice(4)}.ogg`, import.meta.url)), id);
    else {
      assert.ok(manifest.lines[id]?.length, `${id} missing from lines.json`);
      for (const f of manifest.lines[id]) assert.ok(fs.existsSync(new URL(`../assets/audio/hv_voice/${f}`, import.meta.url)), f);
    }
  }
});
