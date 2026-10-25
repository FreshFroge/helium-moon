// Rare, honest false alarms (owner approved, Oct 25: docs/SCARE_RESEARCH.md X4). Real
// refuge animals: a white-tailed deer that blows and bolts from the brush, or a barred owl
// that lifts off a branch. They break the "every noise is him" pattern, so the night stays
// unpredictable (prediction-error research), without any artificial warning sounds.
//
// The server schedules them so every co-op player sees the same animal. A separate random
// stream (not sim.rng) is used, so the creatures' AI decisions are unchanged.
//   event: { type: 'wildlife', kind: 'deer'|'owl', id, pid, x, y, z, fx, fz, s }
import { makeRng } from '../math.js';
import { playerActive } from './perception.js';
import { inSpawnZone } from './zones.js';

export const WILDLIFE = {
  FIRST: [90, 200],        // s after the intro before the first one
  GAP: [300, 480],         // s between them (at most one per 5 min)
  RETRY: 20,               // s to wait when the moment isn't right
  HV_CLEAR: 45,            // m: never near Helium Voice (no confusion with a real threat)
  DEER_DIST: [18, 30],      // owner: never let the deer get close
  OWL_DIST: [8, 20],
};

export class Wildlife {
  constructor(sim) {
    this.sim = sim;
    this.rng = makeRng((sim.seed ^ 0x5a17c0de) >>> 0);
    this.next = null; this.seq = 0; this.last = null;
  }

  update() {
    const sim = this.sim, W = WILDLIFE;
    if (sim.state !== 'play' && sim.state !== 'extract') return;
    if (this.next === null) this.next = sim.time + this.rng.range(W.FIRST[0], W.FIRST[1]);
    if (sim.time < this.next) return;
    const ok = this._try();
    this.next = sim.time + (ok ? this.rng.range(W.GAP[0], W.GAP[1]) : W.RETRY);
  }

  _try() {
    const sim = this.sim, hv = sim.hv, dir = sim.director;
    if (dir.chasing || hv.state === 'chase' || hv.closingOn) return false;
    const active = sim.playerList.filter((p) => p.state === 'alive' && playerActive(p));
    if (!active.length) return false;
    const p = active[Math.floor(this.rng() * active.length)];
    if (Math.hypot(p.x - hv.x, p.z - hv.z) < WILDLIFE.HV_CLEAR) return false;
    const kind = this.last === 'owl' ? 'deer' : this.rng() < 0.6 ? 'deer' : 'owl';
    const ev = kind === 'deer' ? this._deer(p) : this._owl(p);
    if (!ev) return false;
    this.last = kind;
    sim.emit({ type: 'wildlife', kind, id: ++this.seq, pid: p.id, ...ev, s: (this.rng() * 1e6) | 0 });
    return true;
  }

  _okSpot(x, z) {
    const w = this.sim.world, hv = this.sim.hv;
    if (!w.isPlayable(x, z) || w.isWater?.(x, z) || w.riverDistAt(x, z) < 5) return false;
    if (inSpawnZone(w, x, z, 15)) return false;
    return Math.hypot(x - hv.x, z - hv.z) > WILDLIFE.HV_CLEAR;
  }

  // a deer standing in the brush to one side or ahead; it flees away from the player along
  // the clearest of a few headings (fewest trunks in the way)
  _deer(p) {
    const w = this.sim.world, r = this.rng;
    const face = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));   // player's forward heading (x = sin, z = cos)
    for (let tries = 0; tries < 14; tries++) {
      const side = r() < 0.5 ? -1 : 1, a = face + side * r.range(0.5, 1.9), d = r.range(...WILDLIFE.DEER_DIST);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (!this._okSpot(x, z)) continue;
      let best = null, bestHits = 1e9;
      const away = Math.atan2(x - p.x, z - p.z);
      for (const off of [0, -0.45, 0.45, -0.8, 0.8]) {
        const h = away + off, fx = Math.sin(h), fz = Math.cos(h);
        let hits = 0, bad = false;
        for (let s = 2; s <= 24; s += 2) {
          const qx = x + fx * s, qz = z + fz * s;
          if (!w.isPlayable(qx, qz) || w.riverDistAt(qx, qz) < 3) { bad = true; break; }
          for (const ref of w.queryColliders(qx, qz, 0.5, this._tmp || (this._tmp = []))) {
            if (ref >= 100000) { if (ref < 200000) hits += 2; continue; }   // logs/fences: he'd have to leap
            const c = w.circles[ref]; if (Math.hypot(c[0] - qx, c[1] - qz) < c[2] + 0.45) hits++;
          }
        }
        if (!bad && hits < bestHits) { bestHits = hits; best = [fx, fz]; }
      }
      if (!best || bestHits > 6) continue;
      return { x: +x.toFixed(2), y: +w.heightAt(x, z).toFixed(2), z: +z.toFixed(2), fx: +best[0].toFixed(3), fz: +best[1].toFixed(3) };
    }
    return null;
  }

  // a barred owl on a branch of a tall tree near the player; it glides off away from them
  _owl(p) {
    const w = this.sim.world, r = this.rng;
    const cands = [];
    for (const t of w.trees) {
      if (t.height < 9) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d >= WILDLIFE.OWL_DIST[0] && d <= WILDLIFE.OWL_DIST[1] && this._okSpot(t.x, t.z)) cands.push(t);
    }
    if (!cands.length) return null;
    const t = cands[Math.floor(r() * cands.length)];
    const away = Math.atan2(t.x - p.x, t.z - p.z) + r.range(-0.6, 0.6);
    const off = (t.trunkR || 0.3) + 0.35, bx = t.x - Math.sin(away) * off, bz = t.z - Math.cos(away) * off;
    const y = t.y + t.height * r.range(0.45, 0.6);
    return { x: +bx.toFixed(2), y: +y.toFixed(2), z: +bz.toFixed(2), fx: +Math.sin(away).toFixed(3), fz: +Math.cos(away).toFixed(3) };
  }
}
