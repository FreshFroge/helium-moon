// No-go zones for the creatures (owner, Oct 25 2026: "prevent him from being able
// to go into the spawn area"). Pure geometry shared by the server sim and the
// in-browser sim; the AI files consult it when choosing goals, paths and spots.
//
//   spawnZone(world)                -> { x, z, r, margin }   (cached per world)
//   inSpawnZone(world, x, z, extra) -> true inside r + extra
//   spawnZoneCost(world, x, z)      -> 0 outside r + margin; ramps up through the
//                                      margin; BLOCK_COST inside r (for findPath costFn)
//   pushOutOfSpawn(world, x, z)     -> nearest point on the zone's outer edge (r + margin)
//                                      if (x, z) is inside it, else the point unchanged
import { CONFIG } from '../config.js';
import { pointAtDistance } from '../math.js';

export const BLOCK_COST = 1e5;
const cache = new WeakMap();

const Z = () => CONFIG.ZONES || { SPAWN_RADIUS: 40, SPAWN_MARGIN: 12, SPAWN_PLAYERS: 6 };

// The zone covers the trailhead kiosk, gate, parking lot, parked cars, the
// trailhead signs and every player spawn point, with the radius from CONFIG.
export function spawnZone(world) {
  let z = cache.get(world);
  if (z) return z;
  const pts = [];
  const add = (x, zz) => { if (Number.isFinite(x) && Number.isFinite(zz)) pts.push([x, zz]); };
  if (world.poi?.trailhead) add(world.poi.trailhead.x, world.poi.trailhead.z);
  if (world.parking) add(world.parking.x, world.parking.z);
  for (const o of world.structures || []) if (['lot', 'kiosk', 'gate', 'car'].includes(o.type)) add(o.x, o.z);
  // player spawn points mirror GameSim.spawnPoint(i): trail distance 3 + 1.6 i
  for (let i = 0; i < Z().SPAWN_PLAYERS; i++) { const p = pointAtDistance(world.trail, world.trailCum, 3 + i * 1.6); add(p.x, p.z); }
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  z = { x: cx, z: cz, r: Z().SPAWN_RADIUS, margin: Z().SPAWN_MARGIN, covers: pts.length };
  cache.set(world, z);
  return z;
}

export function inSpawnZone(world, x, z, extra = 0) {
  const s = spawnZone(world);
  return Math.hypot(x - s.x, z - s.z) < s.r + extra;
}

export function spawnZoneCost(world, x, z) {
  const s = spawnZone(world), d = Math.hypot(x - s.x, z - s.z);
  if (d < s.r) return BLOCK_COST;
  if (d < s.r + s.margin) { const k = 1 - (d - s.r) / s.margin; return 40 * k * k; }
  return 0;
}

export function pushOutOfSpawn(world, x, z) {
  const s = spawnZone(world), dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz), edge = s.r + s.margin;
  if (d >= edge) return { x, z, moved: false };
  const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
  return { x: s.x + ux * edge, z: s.z + uz * edge, moved: true };
}

// Test the whole movement segment, not just its endpoint: short lunges and
// grid corner shortcuts must not cut through the protected circle.
export function spawnStepBlocked(world, ax, az, bx, bz, padding = 0.4) {
  if (!world.trail?.length) return false;
  const zone = spawnZone(world), dx = bx-ax, dz = bz-az, length2 = dx*dx+dz*dz;
  const t = length2 ? Math.max(0,Math.min(1,((zone.x-ax)*dx+(zone.z-az)*dz)/length2)) : 0;
  return inSpawnZone(world,ax+dx*t,az+dz*t,padding);
}
