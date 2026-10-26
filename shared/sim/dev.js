// Developer mode (owner, Oct 25): test tools for a locally simulated game (single player or
// a hosted room's local sim). Nothing here runs unless the player turned Developer mode on.
//   sim.dev = { skipDread, invincible }   - read by the director and damagePlayer
//   devHunt(sim, pid)    - skip any wait and start a real hunt on that player right now
//   devReveal(sim, pid)  - make him deliberately show himself to that player
//   devRelocate(sim, pid) - unseen relocation ahead of that player (ignores the cooldown)
import { CONFIG } from '../config.js';
import { inSpawnZone } from './zones.js';

function ready(sim) {
  if (sim.state === 'intro') { sim.time = Math.max(sim.time, CONFIG.SESSION.INTRO_TIME + 0.01); sim.step(0.001); }
  return sim.state === 'play' || sim.state === 'extract';
}

// a spot 18-28 m behind/beside the player, in cover if possible
function behind(sim, p) {
  const hv = sim.hv;
  const s = hv.observationSpot?.(p, 'behind', 18, 28);
  if (s) return s;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  for (const d of [24, 18, 30, 12]) {
    const x = p.x - fx * d, z = p.z - fz * d;
    if (sim.world.isPlayable(x, z)) return [x, z];
  }
  return [p.x + 20, p.z];
}

// returns true, or a short reason string when it can't
export function devHunt(sim, pid) {
  const p = sim.players.get(pid);
  if (!p || p.state !== 'alive' || !ready(sim)) return 'not playing';
  if (inSpawnZone(sim.world, p.x, p.z, CONFIG.ZONES?.SPAWN_MARGIN ?? 12)) return 'you are in the safe spawn area - walk out onto the trail first';
  const hv = sim.hv, dir = sim.director;
  if (hv.withdrawal || sim.time < (dir.nextChaseAt || 0)) return 'Helium is withdrawing or recovering from the last hunt';
  const [x, z] = behind(sim, p);
  hv.place(x, z);
  hv.yaw = hv.lookYaw = Math.atan2(p.x - hv.x, p.z - hv.z);
  hv.reveal = null; hv.windup = null; hv.lingerUntil = null; hv.closingOn = null;
  hv.target = p.id; hv.awareness.set(p.id, 2); hv.lastSeen.set(p.id, { x: p.x, z: p.z, t: sim.time });
  dir.lastChase = -999; dir.lastAttack = -999; hv.attackT = -999;
  if (dir.phase === 'relax') dir.enter('build');
  dir.chasing = false;
  hv.setState('stalk');
  hv.startChase(p);
  sim.emit({ type: 'dev', what: 'hunt', pid });
  return hv.state === 'chase' || 'he could not reach you from there';
}

export function devReveal(sim, pid) {
  const p = sim.players.get(pid);
  if (!p || p.state !== 'alive' || !ready(sim)) return false;
  const ok = sim.hv.requestReveal?.('watcher', p);
  if (ok) sim.emit({ type: 'dev', what: 'reveal', pid });
  return !!ok;
}

export function devRelocate(sim, pid) {
  const p = sim.players.get(pid);
  if (!p || p.state !== 'alive' || !ready(sim)) return false;
  const hv = sim.hv, keep = hv.relocateT;
  if (hv.withdrawal) return false;
  hv.relocateT = -1e9;
  const ok = hv.tryRelocate(p, 'dev');
  if (!ok) hv.relocateT = keep;
  return ok;
}
