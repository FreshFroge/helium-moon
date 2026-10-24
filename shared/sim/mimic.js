// Voice mimicry director (server-authoritative). Only phrase METADATA lives here -
// the audio stays on the speaker's machine until a mimicry event is chosen, then
// the speaker's client pitch-shifts its own snippet and shares it for playback.
import { CONFIG } from '../config.js';
import { groundAt } from '../physics.js';
import { playerActive, playerFwd } from './perception.js';

const M = CONFIG.MIMIC;

export class MimicDirector {
  constructor(sim) {
    this.sim = sim; this.rng = sim.rng;
    this.phrases = new Map();   // pid -> [{id, dur, t}]
    this.lastT = -999; this.byPlayer = new Map();
    this.checkT = 5; this.seq = 1;
  }

  addPhrase(pid, id, dur) {
    if (!(dur >= M.PHRASE_MIN * 0.8 && dur <= M.PHRASE_MAX + 0.5)) return;
    const arr = this.phrases.get(pid) || [];
    arr.push({ id: String(id).slice(0, 24), dur, t: this.sim.time });
    while (arr.length > M.MAX_PHRASES) arr.shift();
    this.phrases.set(pid, arr);
  }
  dropPhrase(pid, id) { const arr = this.phrases.get(pid); if (arr) this.phrases.set(pid, arr.filter((p) => p.id !== id)); }
  clear(pid) { this.phrases.delete(pid); }

  update(dt) {
    const sim = this.sim, now = sim.time;
    for (const [pid, arr] of this.phrases) this.phrases.set(pid, arr.filter((p) => now - p.t < M.PHRASE_TTL));
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = M.CHECK_INTERVAL * this.rng.range(0.7, 1.3);
    if (sim.state !== 'play' && sim.state !== 'extract') return;
    if (now - this.lastT < M.MIN_COOLDOWN) return;
    if (sim.director.chasing) return;
    const hv = sim.hv;
    for (const p of sim.playerList) {
      if (!playerActive(p)) continue;
      if (now - (this.byPlayer.get(p.id) || -999) < M.PER_PLAYER_COOLDOWN) continue;
      // whose words? usually the listener's own, sometimes a teammate's
      let owner = p.id;
      const others = [...this.phrases.keys()].filter((k) => k !== p.id && (this.phrases.get(k) || []).length);
      if (others.length && this.rng() < 0.35) owner = this.rng.pick(others);
      const avail = (this.phrases.get(owner) || []).filter((ph) => { const age = now - ph.t; return age > M.MIN_DELAY && age < M.MAX_DELAY; });
      if (!avail.length) continue;
      const hvD = Math.hypot(hv.x - p.x, hv.z - p.z);
      const aware = (hv.awareness.get(p.id) || 0) > 0.3 || hv.target === p.id;
      let chance = M.BASE_CHANCE;
      if (aware) chance *= 2.2;
      if (hvD < 120) chance *= 1.5; else chance *= 0.3;
      if ((p.isolation || 0) > 15) chance *= 1.8;
      if (sim.world.sampleGrid(sim.world.gCover, p.x, p.z) > 0.3) chance *= 1.3;
      if (now - sim.director.lastReveal < 40) chance *= 0.3;
      if (sim.director.phase === 'relax') chance *= 0.4;
      if (this.rng() > chance) continue;
      const phrase = this.rng.pick(avail);
      const pos = this.emitterBehind(p);
      if (!pos) continue;
      this.lastT = now; this.byPlayer.set(p.id, now);
      this.dropPhrase(owner, phrase.id);
      sim.emit({ type: 'mimic', mid: this.seq++, listener: p.id, owner, phrase: phrase.id, dur: phrase.dur, x: pos.x, y: pos.y, z: pos.z, decoy: pos.decoy });
      sim.director.onVocal();
      break;
    }
  }

  // test hook (server only with HM_TEST=1): play one of owner's phrases to listener now
  force(listenerId, ownerId) {
    const sim = this.sim, p = sim.players.get(listenerId), arr = this.phrases.get(ownerId || listenerId) || [];
    if (!p || !arr.length) return false;
    const phrase = arr[arr.length - 1], pos = this.emitterBehind(p);
    if (!pos) return false;
    this.dropPhrase(ownerId || listenerId, phrase.id);
    sim.emit({ type: 'mimic', mid: this.seq++, listener: p.id, owner: ownerId || listenerId, phrase: phrase.id, dur: phrase.dur, x: pos.x, y: pos.y, z: pos.z, decoy: pos.decoy });
    return true;
  }

  // A concealed point 15-35 m behind the listener; Helium Voice's own position when he is back there.
  emitterBehind(p) {
    const sim = this.sim, w = sim.world, hv = sim.hv, rng = this.rng;
    const [fx, fz] = playerFwd(p);
    const hd = Math.hypot(hv.x - p.x, hv.z - p.z);
    if (hd > 8 && hd < M.BEHIND_MAX + 10) {
      const cos = ((hv.x - p.x) * fx + (hv.z - p.z) * fz) / hd;
      if (cos < -0.2) return { x: hv.x, y: hv.y + 1.7, z: hv.z, decoy: false };
    }
    let best = null, bestS = -1e9;
    const back = Math.atan2(-fx, -fz);
    for (let k = 0; k < 24; k++) {
      const a = back + rng.range(-0.9, 0.9), d = rng.range(M.BEHIND_MIN, M.BEHIND_MAX);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (!w.navWalkable(x, z)) continue;
      const y = groundAt(w, x, z);
      const vis = w.lineOfSight(p.x, p.y + 1.6, p.z, x, y + 1.5, z, { brushK: 0.35 });
      const s = (1 - vis) * 2 + w.sampleGrid(w.gCover, x, z) + (w.trailDistAt(x, z) < 3 ? 0.4 : 0);
      if (s > bestS) { bestS = s; best = { x, y: y + 1.5, z, decoy: true }; }
    }
    return best;
  }
}
