// Unseen relocation ("teleport", owner Oct 25 2026; docs/handoffs/OWNER_DECISIONS_2026-10-25b_HUNT_HUM_TELEPORT.md).
// Checks every relocation in several whole sessions against the owner's rules:
//  - never during the opening dread; never into spawn; never within RELOCATE_MIN_DIST of a player;
//  - never while anyone has him on screen (departure) or to a spot anyone can see (arrival);
//  - cooldown between relocations; at most one mid-hunt cut-off per hunt.
//   node tests/relocate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { onScreen } from '../shared/sim/perception.js';
import { inSpawnZone } from '../shared/sim/zones.js';

const world = new World({}); const L = world.trailLength, DT = 0.05, C = CONFIG.HV;
const DREAD_END = CONFIG.SESSION.INTRO_TIME + CONFIG.DIRECTOR.DREAD_TIME;

function walker(s, t, lookBackEvery) {
  s.along ??= 4; s.dir ??= 1; s.along += 1.6 * DT * s.dir;
  if (s.along > L - 8 || s.along < 3) s.dir *= -1;
  const back = lookBackEvery && (t % lookBackEvery) < 3, q = pointAtDistance(world.trail, world.trailCum, s.along);
  const fwd = Math.atan2(-Math.sin(q.dir), -Math.cos(q.dir));
  return { x: q.x, z: q.z, yaw: (s.dir < 0) !== back ? fwd + Math.PI : fwd, pitch: 0, flash: true, noise: 0.45 };
}

const relocations = [];
for (const [seed, look] of [[1001, 0], [1002, 20], [1003, 0], [1004, 20], [1005, 0], [1006, 20]]) {
  const sim = new GameSim(world, { seed }); sim.addPlayer('p1', 'p1'); const s = {};
  let huntCutoffs = 0, huntOn = false;
  for (let t = 0; t < 900; t += DT) {
    const p = sim.players.get('p1'); if (p.state !== 'alive' && p.state !== 'downed') break;
    const m = walker(s, sim.time, look); sim.input('p1', { ...m, y: world.heightAt(m.x, m.z), viewFov: 75, viewAspect: 16 / 9 });
    if (p.state === 'alive') { p.x = m.x; p.z = m.z; p.lastX = m.x; p.lastZ = m.z; }
    const before = { x: sim.hv.x, y: sim.hv.y, z: sim.hv.z };
    sim.step(DT);
    for (const e of sim.drainEvents()) {
      if (e.type === 'chase') { huntOn = !!e.on; if (e.on) huntCutoffs = 0; }
      if (e.type !== 'hv_relocate') continue;
      if (e.reason === 'cutoff') huntCutoffs++;
      const players = sim.playerList.filter((q) => q.state === 'alive');
      relocations.push({
        seed, t: e.t, reason: e.reason, huntCutoffs,
        afterDread: e.t >= DREAD_END,
        inSpawn: inSpawnZone(world, e.x, e.z),
        minDist: Math.min(...players.map((q) => Math.hypot(q.x - e.x, q.z - e.z))),
        arrivalSeen: players.some((q) => onScreen(world, q, e.x, world.heightAt(e.x, e.z), e.z)),
        departureSeen: players.some((q) => onScreen(world, q, before.x, before.y, before.z, e.reason === 'collapse' ? 0.45 : 1.9)),
      });
    }
  }
}

test('relocation happens (the feature is live)', () => {
  assert.ok(relocations.length >= 3, `${relocations.length} relocations in 6 sessions`);
});
test('never during the opening dread', () => {
  for (const r of relocations) assert.ok(r.afterDread, JSON.stringify(r));
});
test('never into the spawn area, never right next to a player', () => {
  for (const r of relocations) { assert.equal(r.inSpawn, false, JSON.stringify(r)); assert.ok(r.minDist >= C.RELOCATE_MIN_DIST, JSON.stringify(r)); }
});
test('never seen: neither the departure nor the arrival is on a player\'s screen', () => {
  for (const r of relocations) { assert.equal(r.departureSeen, false, JSON.stringify(r)); assert.equal(r.arrivalSeen, false, JSON.stringify(r)); }
});
test('cooldown between relocations; at most one cut-off per hunt', () => {
  const bySeed = {};
  // the cooldown governs the 'ahead'/'cutoff' teleports; the Puppet's collapse vanish and
  // lying in the grass are separate, rarer mechanics with their own rules
  for (const r of relocations) if (r.reason === 'ahead' || r.reason === 'cutoff') (bySeed[r.seed] ||= []).push(r);
  for (const list of Object.values(bySeed)) for (let i = 1; i < list.length; i++) assert.ok(list[i].t - list[i - 1].t >= C.RELOCATE_COOLDOWN[1] - 0.1, `gap ${(list[i].t - list[i - 1].t).toFixed(1)} s`);
  for (const r of relocations) if (r.reason === 'cutoff') assert.ok(r.huntCutoffs <= 1, JSON.stringify(r));
});
