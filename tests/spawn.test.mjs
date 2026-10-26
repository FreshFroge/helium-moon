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
assert.ok(Math.hypot(slots[0].x - memoX, slots[0].z - memoZ) < 6,
  'solo player begins in the arrival forecourt beside the briefing shelter');
let memoApproach={...slots[0]};
const memoDistance=Math.hypot(memoX-memoApproach.x,memoZ-memoApproach.z);
const memoForward={x:(memoX-memoApproach.x)/memoDistance,z:(memoZ-memoApproach.z)/memoDistance};
for(let i=0;i<32;i++){
  const q=moveCharacter(world,memoApproach,memoForward.x*.1,memoForward.z*.1,clearance,{boundary:true});
  memoApproach={...q,y:groundAt(world,q.x,q.z)};
}
assert.ok(Math.hypot(memoApproach.x-memoX,memoApproach.z-memoZ)<2.4,
  'a clear 3.2-metre walk puts the maintenance memo within interaction range');
console.log('  ok  a clear short forecourt approach reaches the maintenance memo');

const arrival=world.arrival,entry=world.structures.find(s=>s.type==='arrival_entry');
assert.ok(arrival&&entry&&arrival.path.length>=3,'the visitor court has a continuous signed forest approach');
for(let i=1;i<arrival.path.length;i++){
  const [ax,az]=arrival.path[i-1],[bx,bz]=arrival.path[i],distance=Math.hypot(bx-ax,bz-az),n=Math.ceil(distance/.1);
  let pos={x:ax,z:az,y:groundAt(world,ax,az)};
  for(let step=1;step<=n;step++){
    const q=moveCharacter(world,pos,(bx-ax)/n,(bz-az)/n,clearance,{boundary:true});
    assert.ok(Math.hypot(q.x-(ax+(bx-ax)*step/n),q.z-(az+(bz-az)*step/n))<1e-5,'approach path is clear of props and trunks');
    assert.equal(waterDepthAt(world,q.x,q.z),0,'arrival path remains dry');
    pos={...q,y:groundAt(world,q.x,q.z)};
  }
}
console.log('  ok  the entire grounded arrival path is collision clear and reaches the forest portal');

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
