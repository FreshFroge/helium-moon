// Spawn-area exclusion (owner: creatures must never go into the spawn area).
//   node tests/zones.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { spawnZone, inSpawnZone, spawnZoneCost, pushOutOfSpawn, BLOCK_COST } from '../shared/sim/zones.js';

const world = new World({});
const zone = spawnZone(world);

test('zone covers the trailhead, kiosk, gate, parked cars and all six spawn points', () => {
  const sim = new GameSim(world, { seed: 1 });
  for (let i = 0; i < 6; i++) { const sp = sim.spawnPoint(i); assert.ok(inSpawnZone(world, sp.x, sp.z, -8), `spawn ${i} well inside the zone`); }
  for (const o of world.structures.filter((s) => ['kiosk', 'gate', 'car', 'lot'].includes(s.type))) assert.ok(inSpawnZone(world, o.x, o.z, -5), `${o.type} inside the zone`);
  assert.ok(inSpawnZone(world, world.poi.trailhead.x, world.poi.trailhead.z, -10));
});

test('cost: blocking inside, ramp through the margin, zero outside; pushOut lands on the outer edge', () => {
  assert.equal(spawnZoneCost(world, zone.x, zone.z), BLOCK_COST);
  const at = (d) => spawnZoneCost(world, zone.x + d, zone.z);
  assert.equal(at(zone.r - 0.5), BLOCK_COST);
  assert.ok(at(zone.r + 1) > at(zone.r + zone.margin / 2) && at(zone.r + zone.margin / 2) > 0);
  assert.equal(at(zone.r + zone.margin + 0.1), 0);
  const p = pushOutOfSpawn(world, zone.x + 3, zone.z + 4);
  assert.ok(p.moved && Math.abs(Math.hypot(p.x - zone.x, p.z - zone.z) - (zone.r + zone.margin)) < 1e-6);
  assert.equal(pushOutOfSpawn(world, zone.x + 500, zone.z).moved, false);
});

test('excluding the zone does not cut the refuge in two (creatures can still reach the whole trail)', () => {
  // BFS over walkable nav cells, treating zone cells as blocked, from a cell far up the trail
  const gw = world.gw, n = world.navCost.length;
  const far = pointAtDistance(world.trail, world.trailCum, world.trailLength * 0.6);
  const start = world.nearestNav(far.x, far.z);
  const blocked = (i) => { const [x, z] = world.cellPos(i); return inSpawnZone(world, x + CONFIG.GRID_RES / 2, z + CONFIG.GRID_RES / 2); };
  const seen = new Uint8Array(n); const q = [start]; seen[start] = 1; let reach = 0;
  while (q.length) {
    const i = q.pop(); reach++;
    for (const j of [i - 1, i + 1, i - gw, i + gw]) if (j >= 0 && j < n && !seen[j] && world.navCost[j] > 0 && !blocked(j)) { seen[j] = 1; q.push(j); }
  }
  let walkable = 0, inZone = 0;
  for (let i = 0; i < n; i++) if (world.navCost[i] > 0) { walkable++; if (blocked(i)) inZone++; }
  // every walkable cell outside the zone should still be reachable (allow 1% for isolated pockets)
  assert.ok(reach >= (walkable - inZone) * 0.99, `reachable ${reach} of ${walkable - inZone} walkable cells outside the zone`);
  // and every trail point beyond the zone edge is reachable
  for (let a = 0; a < world.trailLength; a += 25) {
    const p = pointAtDistance(world.trail, world.trailCum, a);
    if (inSpawnZone(world, p.x, p.z, zone.margin)) continue;
    const c = world.nearestNav(p.x, p.z); if (c >= 0) assert.ok(seen[c], `trail ${a} m reachable without crossing the zone`);
  }
});

// Becomes a hard requirement once the AI wiring lands (Codex, backlog #9 / task B).
test('creatures never enter the spawn zone during a 10-minute session', { todo: !process.env.HM_ZONES_WIRED && 'until zones.js is wired into heliumVoice.js / skunk.js' }, () => {
  const sim = new GameSim(world, { seed: 7 });
  sim.addPlayer('p1', 'P1');
  let hvIn = 0, sfIn = 0;
  for (let t = 0; t < 600; t += 0.05) {
    const sp = sim.spawnPoint(0);          // the player waits at spawn: the hardest case
    sim.input('p1', { x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw, pitch: 0, flash: true, noise: 0.3 });
    sim.step(0.05); sim.drainEvents();
    if (sim.hv.state !== 'dormant' && inSpawnZone(world, sim.hv.x, sim.hv.z)) hvIn++;
    if (sim.sf.state !== 'dormant' && inSpawnZone(world, sim.sf.x, sim.sf.z)) sfIn++;
  }
  assert.equal(hvIn, 0, `Helium Voice spent ${(hvIn * 0.05).toFixed(1)} s in the spawn zone`);
  assert.equal(sfIn, 0, `SF6 spent ${(sfIn * 0.05).toFixed(1)} s in the spawn zone`);
});
