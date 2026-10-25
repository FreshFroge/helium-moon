// The first view should orient players at the trailhead without trapping them
// against a prop, placing them in water, or overlapping their teammates.
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { groundAt, moveCharacter, waterDepthAt } from '../shared/physics.js';

const world = new World({});
const slots = Array.from({ length: CONFIG.NET.MAX_PLAYERS }, (_, index) =>
  GameSim.prototype.spawnPoint.call({ world }, index));
const clearance = CONFIG.PLAYER.RADIUS + 0.15;
const ahead = pointAtDistance(world.trail, world.trailCum, 20);

for (const [index, spawn] of slots.entries()) {
  assert.ok(Object.values(spawn).every(Number.isFinite), `slot ${index} has finite coordinates`);
  assert.equal(spawn.y, groundAt(world, spawn.x, spawn.z));
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
    const x = spawn.x + Math.cos(angle) * clearance;
    const z = spawn.z + Math.sin(angle) * clearance;
    assert.equal(world.isPlayable(x, z), true, `slot ${index} footprint is inside the map`);
    assert.equal(waterDepthAt(world, x, z), 0, `slot ${index} footprint is dry`);
  }
  const resolved = moveCharacter(world, spawn, 0, 0, clearance, { boundary: true });
  assert.ok(Math.hypot(resolved.x - spawn.x, resolved.z - spawn.z) < 1e-6,
    `slot ${index} has clearance from props and trees`);
  const fx = -Math.sin(spawn.yaw), fz = -Math.cos(spawn.yaw);
  const towardTrail = Math.hypot(ahead.x - spawn.x, ahead.z - spawn.z);
  assert.ok((fx * (ahead.x - spawn.x) + fz * (ahead.z - spawn.z)) / towardTrail > 0.999,
    `slot ${index} faces into the refuge`);

  // Exercise the real collision resolver along the initial W route, not only a
  // point/nav-grid check. Everyone can walk five metres without hitting a prop.
  let position = { ...spawn };
  for (let step = 1; step <= 50; step++) {
    const moved = moveCharacter(world, position, fx * 0.1, fz * 0.1, clearance, { boundary: true });
    const wantedX = spawn.x + fx * step * 0.1;
    const wantedZ = spawn.z + fz * step * 0.1;
    assert.ok(Math.hypot(moved.x - wantedX, moved.z - wantedZ) < 1e-6,
      `slot ${index} has a clear first five metres`);
    assert.equal(world.isPlayable(moved.x, moved.z), true);
    assert.equal(waterDepthAt(world, moved.x, moved.z), 0);
    position = { ...moved, y: groundAt(world, moved.x, moved.z) };
  }
}
for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
  assert.ok(Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z) > clearance * 2,
    `slots ${i} and ${j} have non-overlapping footprints`);
}
console.log('  ok  all six spawn slots are dry, spaced, clear of obstacles, and face a clear route into the refuge');

const kiosk = world.structures.find((structure) => structure.type === 'kiosk');
const memoX = kiosk.x + Math.sin(kiosk.rot) * 0.45;
const memoZ = kiosk.z + Math.cos(kiosk.rot) * 0.45;
assert.ok(Math.hypot(slots[0].x - memoX, slots[0].z - memoZ) < 2.4,
  'solo player begins within memo interaction range after turning toward it');
console.log('  ok  the trailhead memo is beside the solo spawn, within interaction range');

for (const seed of [1, 98765]) {
  const server = new GameSim(world, { seed });
  for (let index = 0; index < slots.length; index++) {
    const player = server.addPlayer(`p${index}`, 'Visitor');
    const { x, z, y, yaw } = player;
    assert.deepEqual({ x, z, y, yaw }, slots[index], 'server and prototype-only client calls agree');
  }
}
console.log('  ok  spawn slots agree for the authoritative server and client regardless of session seed');

const withoutKiosk = Object.create(world);
withoutKiosk.structures = world.structures.filter((structure) => structure.type !== 'kiosk');
const fallback = GameSim.prototype.spawnPoint.call({ world: withoutKiosk }, 0);
const forwardTrail = pointAtDistance(world.trail, world.trailCum, 13);
assert.ok(-Math.sin(fallback.yaw) * (forwardTrail.x - fallback.x)
  - Math.cos(fallback.yaw) * (forwardTrail.z - fallback.z) > 0,
  'a map without the kiosk still faces forward along the trail');
console.log('  ok  fallback spawn faces forward when the kiosk is absent');
console.log('\nall spawn tests passed');
