// Horror pacing director. Tracks how long players have been safe, whether they are
// grouped or isolated, recent chases/attacks, objective progress and how
// predictable the night has become - and steers both entities accordingly.
import { CONFIG } from '../config.js';
import { clamp } from '../math.js';
import { playerActive } from './perception.js';

export class Director {
  constructor(sim) {
    this.sim = sim; this.rng = sim.rng;
    this.phase = 'build'; this.phaseT = 0;
    this.intensity = 0;          // short-term stress (0..1+)
    this.safeT = 0;              // seconds since anything threatening happened near anyone
    this.lastChase = -999; this.lastAttack = -999; this.lastReveal = -999; this.lastVocal = -999; this.lastSkunk = -999;
    this.nextReveal = this.rng.range(110, 170);
    this.revealKinds = ['watcher', 'crossing', 'skunk'];
    this.recentKinds = [];
    this.chasing = false;
    this.focus = null;
  }

  get progress() { return this.sim.obj ? this.sim.obj.doneCount() : 0; }
  get extraction() { return this.sim.obj ? this.sim.obj.extractOpen : false; }

  aggression() {
    let a = 0.12 + 0.11 * this.progress + (this.extraction ? 0.25 : 0);
    if (this.phase === 'peak') a += 0.25;
    if (this.phase === 'relax') a *= 0.2;
    return clamp(a, 0, 0.85);
  }

  // the player the monsters should pay most attention to: the isolated, the quiet, the one in front
  focusPlayer() { return this.focus ? this.sim.players.get(this.focus) : null; }

  wantsPresence() { return this.phase !== 'relax' && (this.safeT > 50 || this.phase === 'peak'); }

  allowChase(p) {
    const t = this.sim.time;
    if (this.phase === 'relax' || this.sim.state === 'intro') return false;
    if (t - this.lastChase < (this.extraction ? 35 : 70) || t - this.lastAttack < 50) return false;
    return true;
  }

  wantsChase(p, d) {
    if (!this.allowChase(p)) return false;
    const iso = p.isolation || 0;
    const chance = this.aggression() * (d < 20 ? 1.4 : d < 35 ? 0.8 : 0.3) * (iso > 25 ? 1.4 : 1) * (this.phase === 'peak' ? 1.3 : 1);
    return this.rng() < chance * 0.04;   // evaluated every tick -> per-second hazard ~0.8*chance
  }

  chaseSpeedMul() { return this.extraction ? 1.06 : 1; }
  allowSkunkAmbush() { return this.phase !== 'relax' && this.sim.time - this.lastSkunk > 35 && this.sim.state !== 'intro'; }

  vocalRate(state, d) {
    // long silences are the default; vocals cluster in build-up and drop during relax
    let r = 0.025;
    if (this.phase === 'relax') r *= 0.25;
    if (this.phase === 'peak') r *= 1.6;
    if (d < 25) r *= 0.6;            // close by he mostly goes quiet
    if (this.sim.time - this.lastVocal < 30) r *= 0.3;
    return r;
  }

  onVocal() { this.lastVocal = this.sim.time; }
  onChaseStart(p) { this.chasing = true; this.lastChase = this.sim.time; this.intensity += 0.6; this.safeT = 0; this.sim.emit({ type: 'chase', pid: p.id, on: true }); }
  onChaseEnd(caught) { this.chasing = false; this.sim.emit({ type: 'chase', on: false }); this.enter('relax'); }
  onAttack(p) { this.lastAttack = this.sim.time; this.intensity += 1; this.chasing = false; this.sim.emit({ type: 'chase', on: false }); this.enter('relax'); }
  onReveal(kind) { if (kind !== 'retreat') { this.lastReveal = this.sim.time; this.recentKinds.push(kind); if (this.recentKinds.length > 3) this.recentKinds.shift(); } this.intensity += 0.25; this.safeT = 0; }
  onSkunk() { this.lastSkunk = this.sim.time; this.intensity += 0.4; this.safeT = 0; }

  enter(phase) { this.phase = phase; this.phaseT = 0; this.phaseLen = phase === 'relax' ? this.rng.range(45, 85) : phase === 'peak' ? this.rng.range(50, 90) : this.rng.range(90, 160); }

  update(dt) {
    const sim = this.sim;
    this.phaseT += dt;
    if (!this.phaseLen) this.enter('build');
    this.intensity = Math.max(0, this.intensity - dt * 0.02);
    // proximity of danger -> resets the safe timer
    const hv = sim.hv;
    let closest = 1e9;
    const active = sim.playerList.filter(playerActive);
    for (const p of active) {
      closest = Math.min(closest, Math.hypot(p.x - hv.x, p.z - hv.z));
      // isolation from teammates
      let iso = 1e9;
      for (const q of active) if (q !== p) iso = Math.min(iso, Math.hypot(q.x - p.x, q.z - p.z));
      p.isolation = active.length > 1 ? iso : 0;
    }
    if (closest < CONFIG.TERROR.MIDDLE) this.safeT = 0; else this.safeT += dt;
    if (closest < CONFIG.TERROR.INNER) this.intensity += dt * 0.01;
    // focus: most isolated player, else the one furthest along the trail, rotating occasionally
    if (!this.focusT || this.focusT <= 0) {
      let best = null, bs = -1e9;
      for (const p of active) {
        const s = (p.isolation || 0) * 0.05 + (p.quietT || 0) * 0.01 + this.rng() * 1.5;
        if (s > bs) { bs = s; best = p; }
      }
      this.focus = best ? best.id : null;
      this.focusT = this.rng.range(30, 70);
    }
    this.focusT -= dt;
    // phase machine
    if (this.phase === 'relax' && this.phaseT > this.phaseLen) this.enter('build');
    else if (this.phase === 'build' && this.phaseT > this.phaseLen && !this.chasing) this.enter('peak');
    else if (this.phase === 'peak' && this.phaseT > this.phaseLen && !this.chasing) this.enter(this.intensity > 1 ? 'relax' : 'build');
    if (this.intensity > 1.6 && this.phase !== 'relax' && !this.chasing) this.enter('relax');
    // deliberate reveals - rare, varied, never the same twice in a row
    if (sim.state === 'play' || sim.state === 'extract') {
      if (sim.time > this.nextReveal && !this.chasing && this.phase !== 'relax') {
        const p = this.focusPlayer();
        if (p) {
          let kinds = this.revealKinds.filter((k) => k !== this.recentKinds[this.recentKinds.length - 1]);
          const kind = this.rng.pick(kinds);
          const ok = kind === 'skunk' ? sim.sf.requestEmerge(p) : sim.hv.requestReveal(kind, p);
          this.nextReveal = sim.time + (ok ? this.rng.range(150, 260) : 20);
          if (ok) this.lastReveal = sim.time;
        }
      }
    }
  }
}
