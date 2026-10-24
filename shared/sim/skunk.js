// SULFUR HEXAFLUORIDE - ambush predator of the undergrowth.
// Lurks low in dense brush near wet / overgrown ground, tracks players by sound and
// proximity rather than sight, avoids open paths, darts out, rears up, releases a
// disorienting gas cloud and melts back into the vegetation.
import { CONFIG } from '../config.js';
import { lerp, angleDiff, pointAtDistance } from '../math.js';
import { moveCharacter, groundAt } from '../physics.js';
import { observedBy, noiseRadius, playerActive, playerAlive } from './perception.js';

const C = CONFIG.SF;
export const SF_STATES = ['dormant', 'lurk', 'prowl', 'investigate', 'ambush', 'rear', 'retreat', 'emerge'];

export class SkunkAI {
  constructor(sim) {
    this.sim = sim; this.world = sim.world; this.rng = sim.rng;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.lookYaw = 0; this.speed = 0;
    this.state = 'dormant'; this.stateT = 0; this.path = null; this.pathI = 0;
    this.gasT = -999; this.vocalT = -999; this.biteT = -999; this.lurkFor = 20;
    this.anim = { fast: 0, rear: 0, gas: 0, low: 0, jaw: 0 };
    this.target = null; this.inv = null;
  }

  // dense-brush spot near wet / overgrown ground, preferably near players
  lurkSpot(near, minD = 20, maxD = 80) {
    const w = this.world, rng = this.rng;
    let best = null, bestS = -1e9;
    for (let k = 0; k < 50; k++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(minD, maxD);
      const x = near.x + Math.sin(a) * d, z = near.z + Math.cos(a) * d;
      if (!w.navWalkable(x, z)) continue;
      const brush = w.sampleGrid(w.gBrush, x, z);
      const wet = w.isWetZone(x, z) ? 0.6 : 0;
      const trail = w.trailDistAt(x, z);
      const s = brush * 3 + wet + Math.min(trail, 12) / 12 - (trail < 3 ? 3 : 0) - Math.hypot(x - this.x, z - this.z) / 120;
      if (s > bestS) { bestS = s; best = [x, z]; }
    }
    return best;
  }

  spawn() {
    const sim = this.sim;
    const tp = { x: sim.world.poi.overlook.x, z: sim.world.poi.overlook.z };
    const s = this.lurkSpot(tp, 15, 70) || [tp.x + 20, tp.z];
    const i = this.world.nearestNav(s[0], s[1], 20); const [x, z] = this.world.cellPos(i);
    this.x = x; this.z = z; this.y = groundAt(this.world, x, z);
  }

  setState(s, info) { this.state = s; this.stateT = 0; this.path = null; this.finalGoal = null; if (info) Object.assign(this, info); }

  planTo(x, z) {
    const w = this.world, gB = w.gBrush, gT = w.gTrail;
    const D = Math.hypot(x - this.x, z - this.z);
    let gx = x, gz = z; this.finalGoal = null;
    if (D > 90) { const k = 90 / D; gx = this.x + (x - this.x) * k; gz = this.z + (z - this.z) * k; this.finalGoal = [x, z]; }
    // avoid open trail and clearings, prefer brush
    const costFn = (i) => (gB[i] < 0.2 ? 1.2 : 0) + (gT[i] < 2.5 ? 3 : 0);
    this.path = w.findPath(this.x, this.z, gx, gz, { costFn, maxExpand: 10000 });
    if (!this.path && this.finalGoal) { const k = 40 / D; this.path = w.findPath(this.x, this.z, this.x + (x - this.x) * k, this.z + (z - this.z) * k, { maxExpand: 5000 }); if (!this.path) this.finalGoal = null; }
    this.pathI = 1;
    return !!this.path;
  }

  follow(dt, speed) {
    if (this.path && this.pathI >= this.path.length && this.finalGoal) { const fg = this.finalGoal; this.planTo(fg[0], fg[1]); }
    if (!this.path || this.pathI >= this.path.length) { this.speed = lerp(this.speed, 0, 1 - Math.exp(-dt * 10)); return true; }
    const [tx, tz] = this.path[this.pathI];
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.6) { this.pathI++; return this.pathI >= this.path.length; }
    this.speed = lerp(this.speed, speed, 1 - Math.exp(-dt * 6));
    const step = Math.min(d, this.speed * dt);
    const r = moveCharacter(this.world, this, dx / d * step, dz / d * step, 0.25, { nav: true, slope: false, step: 0.5 });
    this.x = r.x; this.z = r.z; this.y = groundAt(this.world, this.x, this.z);
    this.yaw += angleDiff(this.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
    return false;
  }

  dist(p) { return Math.hypot(p.x - this.x, p.z - this.z); }

  update(dt) {
    const sim = this.sim, dir = sim.director, rng = this.rng;
    this.stateT += dt;
    const a = this.anim; a.fast = 0; a.rear = 0; a.gas = 0; a.low = 0;
    if (this.state === 'dormant') return;
    // senses: proximity + sound (not sight)
    let nearest = null, nd = 1e9;
    for (const p of sim.playerList) {
      if (!playerAlive(p)) continue;
      const d = this.dist(p);
      if (d < nd) { nd = d; nearest = p; }
      const r = noiseRadius(p, CONFIG.HV) * 0.75;
      if (d < Math.max(r, C.SENSE_RADIUS * (p.crouch ? 0.5 : 1)) && (!this.inv || sim.time - this.inv.t > 6)) this.inv = { x: p.x, z: p.z, t: sim.time, pid: p.id };
    }
    // flashlight in its eyes up close makes it bolt
    let lit = null;
    for (const p of sim.playerList) if (playerActive(p)) { const ob = observedBy(this.world, p, this.x, this.y, this.z, 0.7); if (ob.lit && ob.d < 12 && ob.vis > 0.3) lit = p; }
    if (lit && !['retreat', 'rear', 'ambush'].includes(this.state) && this.state !== 'lurk') this.flee(lit);
    // gas lingering players hiding nearby out of cover
    switch (this.state) {
      case 'lurk': {
        a.low = 1; this.speed = lerp(this.speed, 0, dt * 6);
        if (nearest) this.lookYaw = Math.atan2(nearest.x - this.x, nearest.z - this.z);
        if (nearest && nd < C.AMBUSH_RADIUS && dir.allowSkunkAmbush() && sim.time - this.gasT > C.GAS_COOLDOWN) { this.target = nearest.id; this.setState('ambush'); break; }
        if (nearest && nearest.hidden && nd < 14 && sim.time - this.gasT > C.GAS_COOLDOWN) { this.target = nearest.id; this.setState('ambush'); break; }
        if (this.inv && sim.time - this.inv.t < 1 && this.dist(this.inv) > 10 && this.stateT > 4) this.setState('investigate');
        else if (this.stateT > this.lurkFor) this.setState('prowl');
        if (rng() < dt * 0.02 && sim.time - this.vocalT > 30 && nd < 45) this.vocal('rumble');
        break;
      }
      case 'prowl': {
        a.low = 1;
        if (!this.path) {
          // set up beside the route ahead of the focus player, in the brush just off the trail
          const fp = dir.focusPlayer() || nearest;
          let s = null;
          if (fp && this.rng() < 0.7) {
            const ti = this.world.trailInfo(fp.x, fp.z);

            const ahead = pointAtDistance(this.world.trail, this.world.trailCum, Math.min(this.world.trailLength - 5, ti.along + this.rng.range(25, 70)));
            s = this.lurkSpot({ x: ahead.x, z: ahead.z }, 3, 11);
          }
          if (!s) s = this.lurkSpot(fp || this, 12, 60);
          if (s) this.planTo(s[0], s[1]); else { this.setState('lurk', { lurkFor: 10 }); break; }
        }
        const remain = this.path ? Math.hypot(this.path[this.path.length - 1][0] - this.x, this.path[this.path.length - 1][1] - this.z) : 0;
        if (this.follow(dt, remain > 15 && nd > 25 ? C.SCURRY : C.SNEAK)) this.setState('lurk', { lurkFor: rng.range(15, 45) });
        if (nearest && nd < C.AMBUSH_RADIUS + 2 && dir.allowSkunkAmbush() && sim.time - this.gasT > C.GAS_COOLDOWN) { this.target = nearest.id; this.setState('ambush'); }
        if (rng() < dt * 0.03 && sim.time - this.vocalT > 25) this.vocal(rng.pick(['chitter', 'breath', 'rustle']));
        break;
      }
      case 'investigate': {
        a.low = 1;
        if (!this.path && this.stateT < 0.5) {
          const s = this.lurkSpot(this.inv, 4, 14) || [this.inv.x, this.inv.z];
          this.planTo(s[0], s[1]);
        }
        if (this.follow(dt, C.SCURRY * 0.7) || this.stateT > 30) this.setState('lurk', { lurkFor: rng.range(8, 20) });
        if (nearest && nd < C.AMBUSH_RADIUS && dir.allowSkunkAmbush() && sim.time - this.gasT > C.GAS_COOLDOWN) { this.target = nearest.id; this.setState('ambush'); }
        break;
      }
      case 'ambush': {
        const p = sim.players.get(this.target);
        if (!p || !playerAlive(p)) { this.setState('retreat'); break; }
        a.fast = 1;
        const d = this.dist(p);
        if (this.stateT < 0.05) { this.vocal('growl', true); sim.director.onSkunk(); }
        if (d > 3.2 && this.stateT < 3.5) {
          this.speed = lerp(this.speed, C.DART, dt * 8);
          const dx = p.x - this.x, dz = p.z - this.z;
          const step = Math.min(d - 3, this.speed * dt);
          const r = moveCharacter(this.world, this, dx / d * step, dz / d * step, 0.25, { nav: true, slope: false });
          this.x = r.x; this.z = r.z; this.y = groundAt(this.world, this.x, this.z);
          this.yaw += angleDiff(this.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 12);
        } else this.setState('rear', { target: p.id });
        break;
      }
      case 'rear': {
        const p = sim.players.get(this.target);
        a.rear = 1; a.gas = this.stateT > 0.8 ? 1 : 0; this.speed = 0;
        if (p) this.yaw += angleDiff(this.yaw, Math.atan2(p.x - this.x, p.z - this.z)) * Math.min(1, dt * 6);
        if (this.stateT > 0.4 && this.stateT - dt <= 0.4) this.vocal('warn', true);
        if (this.stateT > 1.0 && sim.time - this.gasT > 5) {
          this.gasT = sim.time;
          sim.addGas(this.x, this.y, this.z);
        }
        if (p && this.dist(p) < C.BITE_RANGE && sim.time - this.biteT > 6) { this.biteT = sim.time; sim.damagePlayer(p, 'sf', this); }
        if (this.stateT > 2.4) this.flee(p || this);
        break;
      }
      case 'retreat': {
        a.fast = 1; a.low = 1;
        if (this.follow(dt, C.SCURRY) || this.stateT > 12) this.setState('lurk', { lurkFor: rng.range(25, 60) });
        break;
      }
      case 'emerge': {
        // deliberate reveal: step out of the undergrowth, call, vanish
        const p = sim.players.get(this.target);
        if (!p) { this.setState('lurk'); break; }
        if (this.emergePhase === 'go') {
          if (this.follow(dt, C.SNEAK * 1.5) || this.stateT > 20) { this.emergePhase = 'show'; this.stateT = 0; }
          a.low = 1;
        } else if (this.emergePhase === 'show') {
          this.speed = 0; this.lookYaw = Math.atan2(p.x - this.x, p.z - this.z);
          this.yaw += angleDiff(this.yaw, this.lookYaw) * Math.min(1, dt * 4);
          a.rear = this.stateT > 0.6 && this.stateT < 2.4 ? 1 : 0;
          if (this.stateT > 0.7 && this.stateT - dt <= 0.7) { this.vocal('warn', true); sim.director.onReveal('skunk'); }
          if (this.stateT > 2.8) this.flee(p);
        }
        break;
      }
      default: this.setState('lurk');
    }
    a.jaw = sim.time - this.vocalT < 1.2 ? 0.5 + 0.5 * Math.sin(sim.time * 23) : 0;
    if (this.state !== 'lurk' && this.state !== 'emerge') this.lookYaw += angleDiff(this.lookYaw, this.yaw) * Math.min(1, dt * 6);
  }

  flee(from) {
    const s = this.lurkSpot({ x: this.x * 2 - from.x, z: this.z * 2 - from.z }, 15, 40) || this.lurkSpot(this, 20, 50);
    this.setState('retreat');
    if (s) this.planTo(s[0], s[1]);
  }

  requestEmerge(p) {
    if (!['lurk', 'prowl'].includes(this.state)) return false;
    const w = this.world;
    // a brush edge 10-18 m from them, inside their view
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const base = Math.atan2(fx, fz);
    for (let k = 0; k < 30; k++) {
      const a = base + this.rng.range(-0.5, 0.5), d = this.rng.range(10, 18);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (!w.navWalkable(x, z) || w.sampleGrid(w.gBrush, x, z) < 0.15) continue;
      if (Math.hypot(x - this.x, z - this.z) > 70) continue;
      this.target = p.id;
      this.setState('emerge', { emergePhase: 'go' });
      this.planTo(x, z);
      return true;
    }
    return false;
  }

  vocal(kind, force = false) {
    const sim = this.sim;
    if (!force && sim.time - this.vocalT < 8) return;
    this.vocalT = sim.time;
    sim.emit({ type: 'sf_vocal', k: kind, x: this.x, y: this.y + 0.4, z: this.z, s: (this.rng() * 1e9) | 0 });
  }

  snapshot() {
    const a = this.anim;
    return [+this.x.toFixed(2), +this.y.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(3), +this.lookYaw.toFixed(3), +this.speed.toFixed(2),
      (a.fast ? 1 : 0) | (a.rear ? 2 : 0) | (a.gas ? 4 : 0) | (a.low ? 8 : 0) | (this.state === 'dormant' ? 16 : 0), +a.jaw.toFixed(2), SF_STATES.indexOf(this.state)];
  }
}
