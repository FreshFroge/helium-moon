// Perception helpers shared by both monsters: player visibility, being observed,
// noise propagation, cover scoring.
import { CONFIG } from '../config.js';
import { clamp, angleDiff } from '../math.js';

export const eyeHeight = (p) => (p.crouch ? 1.0 : 1.6);
export const playerAlive = (p) => p.state === 'alive' || p.state === 'downed';
export const playerActive = (p) => p.state === 'alive';
export const playerFwd = (p) => [-Math.sin(p.yaw), -Math.cos(p.yaw)];

// Openness of the sky at a point (moonlight reaching the ground) 0..1
export function openness(world, x, z) {
  const trunk = world.sampleGrid(world.gCover, x, z);
  const trail = world.trailDistAt(x, z) < 3 ? 0.4 : 0;
  const river = world.riverDistAt(x, z) < CONFIG.RIVER_HALF_WIDTH + 8 ? 0.6 : 0;
  const clearing = world.gridAt(world.gClearing, x, z) ? 0.6 : 0;
  return clamp(0.15 + trail + river + clearing - trunk * 0.3, 0, 1);
}

// How well a player can see a creature standing at (x,y,z) with height h. Returns {vis, lit, cos, d}.
export function observedBy(world, p, x, y, z, h) {
  const dx = x - p.x, dz = z - p.z;
  const d = Math.hypot(dx, dz) || 0.001;
  const [fx, fz] = playerFwd(p);
  const cosA = (dx * fx + dz * fz) / d;
  const out = { vis: 0, lit: false, cos: cosA, d };
  if (cosA < 0.56) return out; // outside ~56 deg horizontal half FOV
  const flashOn = p.flash && p.state === 'alive';
  const lit = flashOn && cosA > 0.86 && d < CONFIG.FLASHLIGHT.RANGE * 0.95;
  const range = lit ? CONFIG.FLASHLIGHT.RANGE + 8 : 14 + 30 * openness(world, x, z);
  if (d > range) return out;
  const ey = p.y + eyeHeight(p);
  // test head and torso; whichever is clearer counts
  const v1 = world.lineOfSight(p.x, ey, p.z, x, y + h * 0.9, z, { brushK: 0.3 });
  const v2 = v1 > 0.6 ? v1 : Math.max(v1, world.lineOfSight(p.x, ey, p.z, x, y + h * 0.55, z, { brushK: 0.3 }));
  const centre = clamp((cosA - 0.56) / 0.3, 0, 1);
  out.vis = v2 * Math.pow(1 - d / range, 0.4) * (0.45 + 0.55 * centre);
  out.lit = lit && v2 > 0.25;
  return out;
}

// How well creature m (eye height eh, look yaw lookYaw, fov cos) can see player p. 0..1
export function sightOf(world, m, eh, lookYaw, p, cfg) {
  const dx = p.x - m.x, dz = p.z - m.z;
  const d = Math.hypot(dx, dz) || 0.001;
  let range = p.flash ? cfg.SIGHT_FLASHLIGHT : cfg.SIGHT_DARK * (0.7 + 0.6 * openness(world, p.x, p.z));
  if (p.crouch) range *= 0.65;
  if (p.hidden) range *= 0.35;
  if (p.state === 'downed') range *= 0.8;
  if (d > range) return 0;
  if (d > 6) {
    const a = Math.atan2(dx, dz); // monster convention: facing = (sin yaw, cos yaw)
    if (Math.abs(angleDiff(lookYaw, a)) > (cfg.SIGHT_FOV_DEG * Math.PI / 360)) return 0;
  }
  const los = world.lineOfSight(m.x, m.y + eh, m.z, p.x, p.y + (p.crouch ? 0.8 : 1.2), p.z, { brushK: 0.26 });
  return los * Math.pow(1 - d / range, 0.5);
}

// Noise radius produced by a player this tick
export function noiseRadius(p, cfg) {
  let r = 0;
  const n = p.noise || 0;
  if (n > 0.8) r = cfg.HEAR_SPRINT; else if (n > 0.3) r = cfg.HEAR_WALK * (n / 0.45); else if (n > 0.05) r = cfg.HEAR_CROUCH;
  if (p.voice > CONFIG.VOICE.NOISE_THRESHOLD) r = Math.max(r, cfg.HEAR_VOICE * clamp(p.voice / 0.12, 0.3, 1.4));
  if (p.interactNoise) r = Math.max(r, cfg.HEAR_INTERACT);
  return r;
}

// Is a world cell inside some player's view cone (used to steer paths around eyes)
export function viewCost(players, x, z, strength = 4) {
  let c = 0;
  for (const p of players) {
    if (!playerActive(p)) continue;
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 70 || d < 0.5) continue;
    const [fx, fz] = playerFwd(p);
    const cosA = (dx * fx + dz * fz) / d;
    if (cosA < 0.4) continue;
    const near = 1 - d / 70;
    c += strength * (cosA - 0.4) * near * (p.flash && cosA > 0.86 && d < 50 ? 2.5 : 1);
  }
  return c;
}
