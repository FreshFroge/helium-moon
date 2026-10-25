// HELIUM VOICE - stalker AI.
// A predator that prefers not to be seen: it scores concealed observation spots
// around its target, paths around players' view cones, freezes when watched,
// slips away from flashlight beams, flanks and repositions ahead, occasionally
// reveals itself on purpose, and only sometimes commits to a chase.
import { CONFIG } from '../config.js';
import { clamp, lerp, angleDiff, pointAtDistance } from '../math.js';
import { moveCharacter, groundAt } from '../physics.js';
import { inSpawnZone, spawnZoneCost, spawnStepBlocked } from './zones.js';
import { eyeHeight, observedBy, onScreen, sightOf, noiseRadius, viewCost, playerActive, playerAlive, playerFwd } from './perception.js';

const C = CONFIG.HV;
export const HV_STATES = ['dormant', 'roam', 'investigate', 'stalk', 'watch', 'freeze', 'retreat', 'reveal', 'chase', 'search', 'still'];
const EYE = 1.78, HEIGHT = 1.9;

export class HeliumVoiceAI {
  constructor(sim) {
    this.sim = sim; this.world = sim.world; this.rng = sim.rng;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.lookYaw = 0; this.lookPitch = 0;
    this.speed = 0; this.vx = 0; this.vz = 0;
    this.state = 'dormant'; this.stateT = 0;
    this.path = null; this.pathI = 0; this.goal = null; this.replanT = 0;
    this.awareness = new Map(); this.lastSeen = new Map(); this.spotted = new Set();
    this.target = null; this.lookAt = null;
    this.anim = { run: 0, reach: 0, still: 0, tilt: 0, jaw: 0, crouch: 0 };
    this.sigT = -999; this.vocalT = -999; this.chaseT = 0; this.attackT = -999;
    this.observedT = 0; this.litT = 0; this.watchDur = 6; this.reveal = null;
    this.searchPts = []; this.stimulus = null; this.lastRetreatT = -999; this.falseRetreat = false;
    this.snapT = 0;
    this.closeCommitted = false;
  }

  spawn() {
    // start far up the trail, deep in cover, ~230 m ahead of the trailhead
    const w = this.world, rng = this.rng;
    for (let k = 0; k < 80; k++) {
      const p = pointAtDistance(w.trail, w.trailCum, rng.range(220, 420));
      const a = rng.range(0, Math.PI * 2), d = rng.range(25, 60);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (w.navWalkable(x, z) && this.outsideSpawn(x,z) && w.sampleGrid(w.gCover, x, z) > 0.25) { this.place(x, z); return; }
    }
    const p = pointAtDistance(w.trail, w.trailCum, 300);
    const i = w.nearestNav(p.x + 20, p.z, 30); const [x, z] = w.cellPos(i); this.place(x, z);
  }
  place(x, z) { if (!this.outsideSpawn(x,z)) return false; this.x = x; this.z = z; this.y = groundAt(this.world, x, z); this.path = null; this.finalGoal = null; }

  setState(s, info) {
    this.state = s; this.stateT = 0; this.path = null; this.goal = null; this.finalGoal = null;
    if (s !== 'chase') this.closeCommitted = false;
    if (info) Object.assign(this, info);
  }

  dist(p) { return Math.hypot(p.x - this.x, p.z - this.z); }

  outsideSpawn(x,z) { return !this.world.trail || !inSpawnZone(this.world,x,z,0.4); }

  focusPlayer() {
    const preferred=this.sim.director.focusPlayer();
    if(preferred && playerActive(preferred) && this.outsideSpawn(preferred.x,preferred.z))return preferred;
    let best=null,distance=Infinity;
    for(const p of this.sim.playerList){
      if(!playerActive(p)||!this.outsideSpawn(p.x,p.z))continue;
      const d=this.dist(p);if(d<distance){best=p;distance=d;}
    }
    return best;
  }

  openingDistance() {
    const d = this.sim.director?.minDistance?.() || 0;
    // Stay beyond the simulation's lit visibility range, while still entering
    // the outer cold ring. This does not hide the rendered character.
    return d > 0 ? Math.max(d, CONFIG.FLASHLIGHT.RANGE + 18) : 0;
  }
  openingClear(x, z) {
    const distance = this.openingDistance();
    return this.outsideSpawn(x,z) && (!distance || this.sim.playerList.every(p => !playerActive(p) || Math.hypot(x-p.x,z-p.z) >= distance));
  }


  // ---------------------------------------------------------------- perception
  perceive(dt) {
    const sim = this.sim;
    let best = null, bestVis = 0;
    this.observers = []; this.litBy = null;
    for (const p of sim.playerList) {
      if (!playerAlive(p)) continue;
      const vis = this.outsideSpawn(p.x,p.z) ? sightOf(this.world, this, EYE, this.lookYaw, p, C) : 0;
      let aw = this.awareness.get(p.id) || 0;
      if (vis > 0.05) {
        const d = this.dist(p);
        aw = Math.min(3, aw + vis * dt * (d < 15 ? 3 : 1.4) * (p.flash ? 1.3 : 1));
        this.lastSeen.set(p.id, { x: p.x, z: p.z, t: sim.time });
      } else aw = Math.max(0, aw - dt * 0.07);
      this.awareness.set(p.id, aw);
      if (aw >= 1 && !this.spotted.has(p.id)) { this.spotted.add(p.id); this.onSpotted(p); }
      if (aw < 0.2 && this.spotted.has(p.id) && sim.time - (this.lastSeen.get(p.id)?.t || 0) > 45) this.spotted.delete(p.id);
      if (vis > bestVis) { bestVis = vis; best = p; }
      // being watched?
      if (playerActive(p)) {
        const ob = observedBy(this.world, p, this.x, this.y, this.z, HEIGHT);
        const visible = onScreen(this.world, p, this.x, this.y, this.z, this.state === 'retreat' ? 0.95 : HEIGHT);
        if (visible) this.observers.push({ p, ob });
        if (visible && ob.lit && (!this.litBy || ob.d < this.litBy.ob.d)) this.litBy = { p, ob };
      }
    }
    this.observedT = this.observers.length ? this.observedT + dt : 0;
    this.litT = this.litBy ? this.litT + dt : 0;
    // hearing
    for (const p of sim.playerList) {
      if (!playerAlive(p) || !this.outsideSpawn(p.x,p.z)) continue;
      const r = noiseRadius(p, C);
      if (r <= 0) continue;
      const d = this.dist(p);
      if (d > r) continue;
      const loud = 1 - d / r;
      if (!this.stimulus || loud > this.stimulus.loud || sim.time - this.stimulus.t > 4) {
        const err = d * 0.18;
        this.stimulus = { x: p.x + this.rng.range(-err, err), z: p.z + this.rng.range(-err, err), t: sim.time, loud, pid: p.id, voice: p.voice > CONFIG.VOICE.NOISE_THRESHOLD };
      }
    }
    return best;
  }

  onSpotted(p) {
    const sim = this.sim;
    if (this.state === 'chase' || this.state === 'reveal') return;
    // the user's recording: sometimes, when he first notices someone, he stops and speaks
    // the first time in a session is much more likely, so most players hear it at least once
    const prob = this.sigCount ? C.SIGNATURE_PROB : Math.max(C.SIGNATURE_PROB, C.SIGNATURE_FIRST_PROB ?? 0.75);
    if (sim.time - this.sigT > C.SIGNATURE_COOLDOWN && this.rng() < prob) {
      this.sigT = sim.time; this.sigCount = (this.sigCount || 0) + 1;
      sim.emit({ type: 'hv_sig', x: this.x, y: this.y + EYE, z: this.z });
      this.vocalT = sim.time;
    }
    this.target = p.id;
    if (this.concealedAt(this.x, this.z)) this.setState('still', { stillFor: this.rng.range(2, 4.5) });
    else { this.setState('stalk'); this.replanT = 0; }
  }

  // ---------------------------------------------------------------- movement
  planTo(x, z, mode = 'cover') {
    if (!this.openingClear(x,z)) { this.path=null;this.finalGoal=null;return false; }
    const w = this.world, sim = this.sim, R = CONFIG.GRID_RES, gw = w.gw, x0 = w.minX, z0 = w.minZ;
    // long trips are planned in legs of <=110 m (bounded A* cost per tick; re-planned on arrival)
    const D = Math.hypot(x - this.x, z - this.z);
    let gx = x, gz = z; this.finalGoal = null;
    if (D > 110 && mode !== 'direct') { const k = 110 / D; gx = this.x + (x - this.x) * k; gz = this.z + (z - this.z) * k; this.finalGoal = [x, z, mode]; }
    let costFn = null;
    if (mode === 'cover' || mode === 'quiet') {
      // flatten the players' view cones once per plan (no allocation per grid cell)
      const eyes = [];
      for (const p of sim.playerList) { if (!playerActive(p)) continue; const [fx, fz] = playerFwd(p); eyes.push(p.x, p.z, fx, fz, p.flash ? 1 : 0); }
      const strength = mode === 'cover' ? 5 : 2, cover = mode === 'cover', gC = w.gCover;
      costFn = (i) => {
        const cx = x0 + (i % gw) * R, cz = z0 + ((i / gw) | 0) * R;
        let c = cover ? (1 - gC[i]) * 0.6 : 0;
        for (let k = 0; k < eyes.length; k += 5) {
          const dx = cx - eyes[k], dz = cz - eyes[k + 1], dd = dx * dx + dz * dz;
          if (dd > 4900 || dd < 0.25) continue;
          const d = Math.sqrt(dd), cosA = (dx * eyes[k + 2] + dz * eyes[k + 3]) / d;
          if (cosA < 0.4) continue;
          c += strength * (cosA - 0.4) * (1 - d / 70) * (eyes[k + 4] && cosA > 0.86 && d < 50 ? 2.5 : 1);
        }
        return c;
      };
    }
    const coverCost = costFn, opening = this.openingDistance();
    const openingPlayers = opening ? sim.playerList.filter(playerActive).map(p => [p.x,p.z]) : [];
    const safetyCost = i => {
      const cx=x0+(i%gw)*R,cz=z0+((i/gw)|0)*R;
      let cost=spawnZoneCost(w,cx,cz);
      for(const [px,pz] of openingPlayers){
        const distance=Math.hypot(cx-px,cz-pz);
        if(distance<opening)return cost+1e5;
        if(distance<opening+8)cost+=8*Math.pow(1-(distance-opening)/8,2);
      }
      return cost;
    };
    costFn = i => safetyCost(i)+(coverCost?coverCost(i):0);
    this.path = w.findPath(this.x, this.z, gx, gz, { costFn, maxExpand: mode === 'direct' ? 9000 : 14000 });
    // leg target unreachable (e.g. across the river): try a short plain leg instead of an unbounded search
    if (!this.path && this.finalGoal) { const k = 45 / D; this.path = w.findPath(this.x, this.z, this.x + (x - this.x) * k, this.z + (z - this.z) * k, { costFn: safetyCost, maxExpand: 5000 }); if (!this.path) this.finalGoal = null; }
    this.pathI = 1; this.goal = [x, z];
    return !!this.path;
  }

  followPath(dt, speed) {
    if (this.path && this.pathI >= this.path.length && this.finalGoal) { const fg = this.finalGoal; this.planTo(fg[0], fg[1], fg[2]); }
    if (!this.path || this.pathI >= this.path.length) { this.speed = lerp(this.speed, 0, 1 - Math.exp(-dt * 8)); return true; }
    const [tx, tz] = this.path[this.pathI];
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < (this.state === 'chase' ? 0.3 : 0.8)) { this.pathI++; return this.pathI >= this.path.length; }
    // Brake unseen stalking at eight feet. A committed chase is allowed
    // to close and hit without waiting for the player to look back.
    const tp = this.target != null ? this.sim.players.get(this.target) : null;
    if (tp && this.state !== 'retreat' && this.state !== 'chase' && !this.closeCommitted
        && this.dist(tp) <= C.CREEP_DISTANCE + Math.max(speed, this.speed) * dt
        && !this.observers?.some(o => o.p.id === tp.id)) {
      speed = this.dist(tp) <= C.CREEP_STOP ? 0 : C.CREEP_SPEED;
      this.speed = Math.min(this.speed, speed);
    }
    this.speed = lerp(this.speed, speed, 1 - Math.exp(-dt * (this.state === 'retreat' ? 18 : speed > 3 ? 3 : 5)));
    const step = Math.min(d, this.speed * dt);
    const nx = dx / d, nz = dz / d;
    const r = moveCharacter(this.world, this, nx * step, nz * step, 0.32, { nav: true, slope: false, step: 0.6 });
    const minimum = this.openingDistance();
    if (minimum && this.sim.playerList.some(p => playerActive(p)
        && this.dist(p) >= minimum && Math.hypot(p.x-r.x,p.z-r.z) < minimum)) {
      this.path = null; this.stop(dt); return false;
    }
    if (spawnStepBlocked(this.world,this.x,this.z,r.x,r.z)) { this.path=null;this.stop(dt);return false; }
    const moved = Math.hypot(r.x - this.x, r.z - this.z);
    // A tight waypoint beside solid geometry can return a large penetration
    // correction. Replan instead of snapping the creature through the obstacle.
    if (moved > Math.max(0.08, step * 1.5)) { this.path = null; this.stop(dt); return false; }
    this.x = r.x; this.z = r.z; this.y = groundAt(this.world, this.x, this.z);
    const desired = Math.atan2(nx, nz) + (this.state === 'retreat' ? Math.PI : 0);
    this.yaw += angleDiff(this.yaw, desired) * Math.min(1, dt * (this.state === 'retreat' ? 22 : speed > 3 ? 8 : 4));
    if (moved < step * 0.2) { this.stuckT = (this.stuckT || 0) + dt; if (this.stuckT > 1.2) { this.stuckT = 0; this.path = null; } } else this.stuckT = 0;
    return false;
  }

  stop(dt) { this.speed = lerp(this.speed, 0, 1 - Math.exp(-dt * 10)); }

  lookAtPoint(x, y, z) {
    this.lookYaw = Math.atan2(x - this.x, z - this.z);
    this.lookPitch = Math.atan2(y - (this.y + EYE), Math.hypot(x - this.x, z - this.z));
  }

  // ---------------------------------------------------------------- spot selection
  concealedAt(x, z) {
    const w = this.world;
    if (w.trailDistAt(x, z) < 3 || w.sampleGrid(w.gCover, x, z) < 0.2) return false;
    const y = groundAt(w, x, z);
    for (const p of this.sim.playerList) {
      if (!playerActive(p) || Math.hypot(p.x - x, p.z - z) > 100) continue;
      // Cover must hide the silhouette, not just darken its center. Brush alone
      // can attenuate LOS but is not solid concealment.
      const a = Math.atan2(p.x - x, p.z - z), rx = Math.cos(a) * 0.32, rz = -Math.sin(a) * 0.32;
      for (const height of [1.8, 1.0, 0.25]) for (const side of [0, -1, 1]) {
        if (w.lineOfSight(p.x, p.y + eyeHeight(p), p.z, x + rx * side, y + height, z + rz * side, { brushK: 0 }) > 0) return false;
      }
    }
    return true;
  }

  // concealed observation spot around player p. mode: 'behind' | 'flank' | 'ahead'
  observationSpot(p, mode = 'behind', minD = C.OBSERVE_MIN, maxD = C.OBSERVE_MAX) {
    const w = this.world, rng = this.rng, sim = this.sim;
    const [fx, fz] = p.moveDir || playerFwd(p);
    const baseA = Math.atan2(fx, fz);
    let best = null, bestS = -1e9;
    for (let k = 0; k < 36; k++) {
      let rel;
      if (mode === 'ahead') rel = rng.range(-0.7, 0.7);
      else if (mode === 'flank') rel = (rng() < 0.5 ? -1 : 1) * rng.range(1.1, 2.0);
      else rel = Math.PI + rng.range(-1.3, 1.3);
      const a = baseA + rel, d = rng.range(minD, maxD);
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      if (!w.navWalkable(x, z) || !this.openingClear(x, z)) continue;
      if (w.trailDistAt(x, z) < 3) continue;
      if (!this.concealedAt(x, z)) continue;
      const cover = w.sampleGrid(w.gCover, x, z);
      const y = groundAt(w, x, z);
      const vis = w.lineOfSight(p.x, p.y + eyeHeight(p), p.z, x, y + 1.7, z, { brushK: 0.3 });
      let s = cover * 2.2;
      s += (1 - vis) * 2; // concealed watching; deliberate reveals are handled separately
      s -= viewCost(sim.playerList, x, z, 1) * 0.8;
      s -= Math.hypot(x - this.x, z - this.z) / 90;
      for (const q of sim.playerList) if (q !== p && playerActive(q) && Math.hypot(q.x - x, q.z - z) < 20) s -= 2;
      if (s > bestS) { bestS = s; best = [x, z]; }
    }
    return best;
  }

  // nearest point that breaks line of sight from the threatening player(s), away from them
  coverAway(from, minD = 12, maxD = 32) {
    const w = this.world, rng = this.rng;
    const away = Math.atan2(this.x - from.x, this.z - from.z);
    const candidates = [];
    for (let k = 0; k < 30; k++) {
      const a = away + rng.range(-1.2, 1.2), d = rng.range(minD, maxD);
      const x = this.x + Math.sin(a) * d, z = this.z + Math.cos(a) * d;
      if (!w.navWalkable(x, z) || !this.openingClear(x, z)) continue;
      const y = groundAt(w, x, z);
      const vis = w.lineOfSight(from.x, from.y + eyeHeight(from), from.z, x, y + 1.6, z, { brushK: 0.35 });
      const score = (1 - vis) * 3 + w.sampleGrid(w.gCover, x, z) - d / 60;
      candidates.push({ x, z, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    // Full silhouette occlusion is expensive with several teammates. Rank by
    // the cheap center ray first, then fully verify at most three finalists.
    // Actual hiding poses still recheck every silhouette sample; a fallback
    // destination is only a movement goal, never permission to stand exposed.
    for (const candidate of candidates.slice(0, 3)) {
      if (this.concealedAt(candidate.x, candidate.z)) return [candidate.x, candidate.z];
    }
    return candidates.length ? [candidates[0].x, candidates[0].z] : null;
  }

  roamGoal() {
    const w = this.world, rng = this.rng, sim = this.sim;
    const tp = this.focusPlayer();
    for (let k = 0; k < 40; k++) {
      let x, z;
      if (tp && (sim.director.wantsPresence() || this.openingDistance() > 0)) {
        // drift into the outer terror ring of the focus player
        const a = rng.range(0, Math.PI * 2), minimum = this.openingDistance();
        const d = minimum ? rng.range(minimum + 3, Math.max(minimum + 4, CONFIG.TERROR.OUTER - 3)) : rng.range(55, 110);
        x = tp.x + Math.sin(a) * d; z = tp.z + Math.cos(a) * d;
      } else {
        // wander the stretch of trail around whoever he is following, never the whole map
        const ref = tp ? w.trailInfo(tp.x, tp.z).along : w.trailInfo(this.x, this.z).along;
        const p = pointAtDistance(w.trail, w.trailCum, Math.max(0, Math.min(w.trailLength, ref + rng.range(-120, 160))));
        const a = rng.range(0, Math.PI * 2), d = rng.range(15, 90);
        x = p.x + Math.sin(a) * d; z = p.z + Math.cos(a) * d;
      }
      if (w.navWalkable(x, z) && this.openingClear(x, z) && Math.hypot(x - this.x, z - this.z) > 25) return [x, z];
    }
    return null;
  }

  // ---------------------------------------------------------------- main update
  update(dt) {
    const sim = this.sim, dir = sim.director;
    const escalation = dir.escalation?.() || 0;
    this.stateT += dt;
    if (this.state === 'dormant') { this.stop(dt); return; }
    this.perceive(dt);
    const minimum = this.openingDistance();
    if (minimum > 0 && this.state !== 'retreat') {
      const near = sim.nearestPlayer(this.x, this.z);
      if (near && near.d < minimum) this.retreatFrom(near.p, false, true);
    }

    let tp = this.target != null ? sim.players.get(this.target) : null;
    if (tp && (!playerAlive(tp) || !this.outsideSpawn(tp.x,tp.z))) {
      if(this.state==='chase')this.retreatFrom(tp,false,true);
      this.target=null;tp=null;
    }
    const anim = this.anim;
    anim.run = 0; anim.reach = 0; anim.still = 0;
    let lookP = tp && playerAlive(tp) && (this.awareness.get(tp.id) || 0) > 0.6 ? tp : null;

    // A recognized nearby player can be pursued from any direction. Seeing
    // him encourages concealment; it is no longer permission to deal damage.
    const close = tp && playerActive(tp) && this.dist(tp) <= C.CREEP_DISTANCE;
    if (tp && playerActive(tp) && this.dist(tp) < CONFIG.TERROR.CRITICAL
        && sim.state !== 'intro' && !dir.inDread?.() && this.state !== 'chase' && this.state !== 'retreat'
        && (this.awareness.get(tp.id) || 0) >= 1
        && this.lastSeen.get(tp.id)?.t === sim.time
        && sim.time - this.attackT >= C.ATTACK_COOLDOWN
        && (dir.allowChase(tp) || close || this.dist(tp) < C.ATTACK_RANGE * 2)) this.startChase(tp);

    if (this.state !== 'retreat' && this.observers.length) {
      const observer = this.litBy || this.observers[0];
      // Complete an already committed contact strike, then escape. At longer
      // range immediately seek cover, including when a chase is spotted.
      const contact = this.state === 'chase' && tp && this.dist(tp) < C.ATTACK_RANGE;
      if (!contact) this.retreatFrom(observer.p, !!this.litBy, true);
    }

    // Reactions above can start a chase of a player who was not the previous
    // target. Resolve again before executing that new state: otherwise the
    // first chase tick sees null/an old teammate and immediately retreats.
    tp = this.target != null ? sim.players.get(this.target) : null;
    if (this.state === 'chase' && tp) lookP = tp;

    switch (this.state) {
      case 'still': {
        if (tp && !this.concealedAt(this.x, this.z)) { this.retreatFrom(tp, false, true); break; }
        this.stop(dt); anim.still = 1;
        if (this.stateT > (this.stillFor || 3)) this.decideAfterSpotting(tp);
        break;
      }
      case 'roam': {
        const fpl = this.focusPlayer();
        if (this.path && this.goal && fpl && dir.wantsPresence() && Math.hypot(this.goal[0] - fpl.x, this.goal[1] - fpl.z) > 120) this.path = null;
        if (!this.path) { const g = this.roamGoal(); if (g) this.planTo(g[0], g[1], 'cover'); }
        const near = sim.nearestPlayer(this.x, this.z);
        // unseen and far away he covers ground quickly; near people he slows to a creep
        const roamSpd = !near || near.d > 130 ? C.RELOCATE : near.d > 75 ? C.STALK : C.WALK * (0.8 + 0.4 * Math.sin(sim.time * 0.37 + 1.3));
        if (this.followPath(dt, roamSpd)) this.path = null;
        // stimuli
        if (this.stimulus && sim.time - this.stimulus.t < 1) this.setState('investigate', { inv: this.stimulus, stimulus: null });
        if (tp && (this.awareness.get(tp.id) || 0) > 1 && this.stateT > 2) this.setState('stalk');
        lookP = null;
        break;
      }
      case 'investigate': {
        const inv = this.inv;
        if (!this.path && this.stateT < 1) this.planTo(inv.x, inv.z, 'cover');
        const fast = inv.voice ? C.STALK * 1.15 : C.STALK;
        const done = this.followPath(dt, Math.hypot(inv.x - this.x, inv.z - this.z) > 30 ? fast : C.WALK);
        if (this.stimulus && this.stimulus.t > inv.t + 2 && this.stimulus.loud > 0.2) { this.inv = this.stimulus; this.stimulus = null; this.path = null; this.stateT = 0.5; }
        if (done || this.stateT > 45) this.setState('search', { searchAt: { x: inv.x, z: inv.z }, searchPts: [] });
        if (tp && (this.awareness.get(tp.id) || 0) > 1) this.setState('stalk');
        break;
      }
      case 'stalk': {
        if (!tp) { this.setState('roam'); break; }
        const aw = this.awareness.get(tp.id) || 0;
        const ls = this.lastSeen.get(tp.id);
        if (aw < 0.25 && ls && sim.time - ls.t > 25) { this.setState('search', { searchAt: { x: ls.x, z: ls.z }, searchPts: [] }); break; }
        const d = this.dist(tp);
        if (!this.path || this.replanT <= 0) {
          const mode = this.falseRetreat ? 'ahead' : (this.rng() < 0.35 ? 'flank' : 'behind');
          const spot = this.observationSpot(tp, mode, lerp(C.OBSERVE_MIN,15,escalation), lerp(C.OBSERVE_MAX,35,escalation));
          if (spot) this.planTo(spot[0], spot[1], 'cover');
          this.falseRetreat = false;
          this.replanT = this.rng.range(5, 9) * (1 - .35 * escalation);
        }
        this.replanT -= dt;
        const done = this.followPath(dt, (d > 75 ? C.STALK * 1.4 : d > 40 ? C.STALK : C.WALK) * (1 + .2 * escalation));
        if (done) this.setState('watch', { watchDur: this.rng.range(4, 12) * (1 - .5 * escalation) });
        if (dir.wantsChase(tp, d) && aw > 1) this.startChase(tp);
        break;
      }
      case 'watch': {
        if (!tp) { this.setState('roam'); break; }
        if (!this.concealedAt(this.x, this.z)) { this.retreatFrom(tp, false, true); break; }
        this.stop(dt); anim.still = 1;
        if (this.stateT > this.watchDur) { this.setState('stalk'); this.replanT = 0; }
        const d = this.dist(tp);
        if (d < 22 && (this.awareness.get(tp.id) || 0) > 1.4 && dir.wantsChase(tp, d)) this.startChase(tp);
        // a deliberate twig snap while watching from behind the player
        if (this.stateT > 2 && sim.time - this.snapT > 50 && d < 35 && this.rng() < dt * 0.05) {
          const ob = observedBy(this.world, tp, this.x, this.y, this.z, HEIGHT);
          if (ob.cos < 0) { this.snapT = sim.time; sim.emit({ type: 'snap', x: this.x, y: this.y, z: this.z }); }
        }
        break;
      }
      case 'freeze': {
        // completely motionless while watched; head keeps tracking
        this.stop(dt); anim.still = 1;
        const w = this.watcher != null ? sim.players.get(this.watcher) : null;
        if (w) lookP = w;
        if (!this.observers.length && this.stateT > 0.4) {
          // the moment they look away, he moves
          this.retreatFrom(w || tp || { x: this.x + 1, y: this.y, z: this.z }, false, true);
        } else if (this.stateT > this.freezeFor) {
          this.retreatFrom(w || tp, false);
        }
        break;
      }
      case 'retreat': {
        // Keep escaping until genuinely occluded; an exposed route endpoint
        // must never become a prolonged stationary hiding pose.
        if (!this.path && tp) { const away = this.coverAway(tp, 8, 24); if (away) this.planTo(...away, 'cover'); }
        const done = this.followPath(dt, C.RETREAT);
        if (tp && this.stateT > 0.45 && this.concealedAt(this.x, this.z)) {
          this.lastRetreatT = sim.time; this.setState('still', { stillFor: this.rng.range(2, 6) }); break;
        }
        if (done || this.stateT > 14) {
          this.lastRetreatT = sim.time;
          if (tp && (this.awareness.get(tp.id) || 0) > 0.5) {
            // false retreat: reappear further ahead along their route
            this.falseRetreat = this.rng() < 0.45;
            if (this.concealedAt(this.x, this.z)) this.setState('still', { stillFor: this.rng.range(2, 6) });
            else { this.setState('stalk'); this.replanT = 0; }
          } else this.setState('roam');
        }
        break;
      }
      case 'reveal': this.updateReveal(dt); lookP = this.reveal && sim.players.get(this.reveal.pid); break;
      case 'chase': {
        anim.run = 1;
        if (!tp || !playerAlive(tp) || tp.state === 'downed') { this.retreatFrom(tp || this, false); break; }
        this.lookAtPoint(tp.x, tp.y + 1.5, tp.z);
        const vis = sightOf(this.world, this, EYE, this.lookYaw, tp, C);
        if (vis > 0.02 || this.dist(tp) < 12) this.lastSeenChase = { x: tp.x, z: tp.z, t: sim.time };
        // hearing keeps the chase going when sight is lost (sprinting is loud)
        if (this.stimulus && this.stimulus.pid === tp.id && sim.time - this.stimulus.t < 0.2) this.lastSeenChase = { x: this.stimulus.x, z: this.stimulus.z, t: sim.time - 0.5 };
        let ls = this.lastSeenChase || { x: tp.x, z: tp.z, t: sim.time };
        // reached the last known point with nothing new: guess along their last heading
        if (Math.hypot(ls.x - this.x, ls.z - this.z) < 2.5 && tp.moveDir && !ls.extrap) {
          ls = this.lastSeenChase = { x: ls.x + tp.moveDir[0] * 10, z: ls.z + tp.moveDir[1] * 10, t: ls.t, extrap: true };
          this.path = null;
        }
        this.replanT -= dt;
        if (this.replanT <= 0 || !this.path) { this.planTo(ls.x, ls.z, 'direct'); this.replanT = this.dist(tp) < 15 ? 0.3 : 0.7; }
        const d = this.dist(tp);
        const burst = d < 12 ? C.BURST : C.CHASE;
        if (d < 7 && this.world._straightWalkable([this.x, this.z], [tp.x, tp.z])) {
          // close enough to lunge straight at them
          this.path = [[this.x, this.z], [tp.x, tp.z]]; this.pathI = 1;
        }
        this.followPath(dt, burst * dir.chaseSpeedMul() * (1 + .12 * escalation));
        if (d < 4) anim.reach = 1;
        if (d < C.ATTACK_RANGE && Math.abs(this.y - tp.y) < 1.8 && sim.time - this.attackT > C.ATTACK_COOLDOWN
            && this.world.lineOfSight(this.x, this.y + 1, this.z, tp.x, tp.y + 1, tp.z, { brushK: 0 }) > 0.2) {
          this.attackT = sim.time;
          sim.damagePlayer(tp, 'hv', this);
          dir.onAttack(tp);
          this.awareness.set(tp.id, 0.5);
          this.retreatFrom(tp, false, true);
          break;
        }
        if (sim.time - ls.t > C.LOSE_TIME * (1 + .4 * escalation)) { dir.onChaseEnd(false); this.setState('search', { searchAt: { x: ls.x, z: ls.z }, searchPts: [] }); }
        else if (this.stateT > 32 + 12 * escalation) { dir.onChaseEnd(false); this.retreatFrom(tp, false); }
        break;
      }
      case 'search': {
        const c = this.searchAt;
        if (!this.searchPts.length && this.stateT < 1) {
          for (let k = 0; k < 4; k++) { const a = this.rng.range(0, 6.28), r = this.rng.range(4, 16); this.searchPts.push([c.x + Math.sin(a) * r, c.z + Math.cos(a) * r]); }
        }
        if (!this.path && this.searchPts.length) { const p = this.searchPts.shift(); this.planTo(p[0], p[1], 'quiet'); this.pauseT = this.rng.range(1.5, 4); }
        const done = this.followPath(dt, C.WALK);
        if (done) { this.pauseT -= dt; if (this.pauseT > 0) { this.stop(dt); anim.still = 0.5; this.lookYaw += dt * 0.8 * Math.sin(this.stateT * 0.7); } else this.path = null; }
        if (this.stimulus && sim.time - this.stimulus.t < 1 && this.stimulus.loud > 0.25) this.setState('investigate', { inv: this.stimulus, stimulus: null });
        if (this.stateT > C.SEARCH_TIME || (!this.searchPts.length && !this.path)) this.setState('roam');
        if (tp && (this.awareness.get(tp.id) || 0) > 1.2) this.setState('stalk');
        break;
      }
      default: this.setState('roam');
    }

    // head: locked on whoever he is aware of, otherwise looks where he walks with a slow scan
    if (lookP) this.lookAtPoint(lookP.x, lookP.y + 1.5, lookP.z);
    else if (this.state !== 'search') { this.lookYaw += angleDiff(this.lookYaw, this.yaw + Math.sin(sim.time * 0.3) * 0.5) * Math.min(1, dt * 2); this.lookPitch = lerp(this.lookPitch, -0.05, dt); }
    anim.tilt = this.state === 'freeze' || this.state === 'watch' || (this.state === 'reveal' && this.reveal?.phase === 'show') ? 0.35 * Math.sin(sim.time * 0.13 + 0.7) : 0;
    anim.jaw = sim.time - this.vocalT < 1.4 ? 0.6 + 0.4 * Math.sin(sim.time * 17) : 0;
    this.vocals(dt);
  }

  decideAfterSpotting(tp) {
    const dir = this.sim.director;
    if (!tp) { this.setState('roam'); return; }
    const d = this.dist(tp);
    if (dir.wantsChase(tp, d) && d < 28) this.startChase(tp);
    else if (this.rng() < 0.3) this.retreatFrom(tp, false);
    else { this.setState('stalk'); this.replanT = 0; }
  }

  retreatFrom(p, lit = false, quick = false) {
    if (this.state === 'chase' && this.sim.director.chasing) this.sim.director.onChaseEnd(false);
    p ||= this.sim.players.get(this.target) || { x: this.x + 1, y: this.y, z: this.z };
    const minimum = Math.max(lit ? 14 : 10, this.openingDistance() - this.dist(p) + 10);
    const away = this.coverAway(p, minimum, Math.max(minimum + 20, lit ? 34 : 26));
    this.setState('retreat');
    if (away) this.planTo(away[0], away[1], 'cover');
    if (this.path?.length > 1) this.yaw = Math.atan2(this.path[1][0] - this.x, this.path[1][1] - this.z) + Math.PI;
    // Only perceived escapes add tension. Unseen repositioning must not
    // keep the director in permanent recovery while the player hears nothing.
    if (this.observers?.length || this.dist(p) <= C.FOOTSTEP_MAX_DISTANCE || this.sim.time-this.attackT < .2)
      this.sim.director.onReveal('retreat');
  }

  startChase(p) {
    if (!this.outsideSpawn(p.x,p.z) || this.sim.director.inDread?.()) return false;
    this.target = p.id; this.lastSeenChase = { x: p.x, z: p.z, t: this.sim.time };
    this.setState('chase'); this.replanT = 0;
    this.closeCommitted = true;
    this.sim.director.onChaseStart(p);
    this.vocal('scream', true);
  }

  // ---------------------------------------------------------------- deliberate reveals
  requestReveal(kind, p) {
    if (!this.outsideSpawn(p.x,p.z) || this.openingDistance()) return false;
    if (!['roam', 'stalk', 'watch', 'search'].includes(this.state)) return false;
    if (this.dist(p) > 150) return false;
    const w = this.world, rng = this.rng;
    const [fx, fz] = playerFwd(p);
    const baseA = Math.atan2(fx, fz);
    let plan = null;
    for (let k = 0; k < 40 && !plan; k++) {
      if (kind === 'watcher') {
        const a = baseA + rng.range(-0.35, 0.35), d = rng.range(32, 46);
        const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
        if (!w.navWalkable(x, z) || !this.openingClear(x, z)) continue;
        const vis = w.lineOfSight(p.x, p.y + eyeHeight(p), p.z, x, groundAt(w, x, z) + 1.6, z, { brushK: 0.25 });
        if (vis < 0.45) continue;
        plan = { kind, pid: p.id, spot: [x, z], phase: 'approach' };
      } else if (kind === 'crossing') {
        const a = baseA + rng.range(-0.25, 0.25), d = rng.range(45, 70);
        const cx = p.x + Math.sin(a) * d, cz = p.z + Math.cos(a) * d;
        const pa = a + Math.PI / 2, half = rng.range(9, 14);
        const A = [cx + Math.sin(pa) * half, cz + Math.cos(pa) * half], B = [cx - Math.sin(pa) * half, cz - Math.cos(pa) * half];
        if (!w.navWalkable(A[0], A[1]) || !w.navWalkable(B[0], B[1]) || !w.navWalkable(cx, cz)) continue;
        const vis = w.lineOfSight(p.x, p.y + eyeHeight(p), p.z, cx, groundAt(w, cx, cz) + 1.6, cz, { brushK: 0.2 });
        if (vis < 0.4) continue;
        plan = rng() < 0.5 ? { kind, pid: p.id, spot: A, end: B, phase: 'approach' } : { kind, pid: p.id, spot: B, end: A, phase: 'approach' };
      }
    }
    if (!plan) return false;
    this.reveal = plan;
    this.setState('reveal');
    if (!this.planTo(plan.spot[0], plan.spot[1], 'cover')) { this.reveal = null; this.setState('roam'); return false; }
    return true;
  }

  updateReveal(dt) {
    const r = this.reveal, sim = this.sim;
    const p = r ? sim.players.get(r.pid) : null;
    if (!r || !p || !playerActive(p)) { this.setState('roam'); return; }
    const C2 = C;
    if (r.phase === 'approach') {
      const far = Math.hypot(r.spot[0] - this.x, r.spot[1] - this.z) > 25 && !this.observers.length;
      const done = this.followPath(dt, far ? C2.RELOCATE : C2.STALK);
      if (this.stateT > 40 || (done && Math.hypot(r.spot[0] - this.x, r.spot[1] - this.z) > 3)) {
        this.reveal = null; this.retreatFrom(p, false, true); return;
      }
      if (done) { r.phase = r.kind === 'watcher' ? 'show' : 'cross'; r.t = 0; if (r.kind === 'crossing') this.planTo(r.end[0], r.end[1], 'direct'); }
    } else if (r.phase === 'show') {
      // stand motionless between the trees, facing them, until seen (or bored)
      r.t += dt; this.stop(dt); this.anim.still = 1;
      if (this.observers.some((o) => o.p.id === p.id)) r.seenT = (r.seenT || 0) + dt;
      if ((r.seenT || 0) > this.rng.range(1.2, 2.6) || this.litBy || r.t > 30) {
        sim.director.onReveal('watcher');
        this.reveal = null; this.retreatFrom(p, false, true);
      }
    } else if (r.phase === 'slip') {
      this.retreatFrom(p, false, true); this.reveal = null;
    } else if (r.phase === 'cross') {
      r.t = (r.t || 0) + dt;
      const done = this.followPath(dt, C2.WALK * 1.25);
      if (r.t > 1 && !r.counted && this.observers.some((o) => o.p.id === p.id)) { r.counted = true; sim.director.onReveal('crossing'); }
      if (done || r.t > 25) { this.reveal = null; this.retreatFrom(p, false, true); }
    }
  }

  // ---------------------------------------------------------------- vocal events (synthesised identically on every client from the seed)
  vocals(dt) {
    const sim = this.sim, dir = sim.director;
    if (sim.time - this.vocalT < 14) return;
    const nearest = sim.nearestPlayer(this.x, this.z);
    if (!nearest) return;
    const d = nearest.d;
    let kind = null;
    const r = this.rng;
    const rate = dir.vocalRate(this.state, d);
    if (r() > rate * dt) return;
    if (this.state === 'stalk' || this.state === 'watch') kind = r.pick(d < 30 ? ['whisper', 'breath', 'giggle', 'inhale', 'hum'] : ['whisper', 'hum', 'fragment', 'laugh']);
    else if (this.state === 'roam' || this.state === 'search') kind = r.pick(d > 70 ? ['call', 'call', 'cry', 'fragment'] : ['hum', 'fragment', 'laugh', 'whisper']);
    else if (this.state === 'retreat') kind = r.pick(['giggle', 'laugh', 'breath']);
    else if (this.state === 'freeze') kind = r.chance(0.5) ? 'inhale' : null;
    if (kind) this.vocal(kind);
  }

  vocal(kind, force = false) {
    const sim = this.sim;
    if (!force && sim.time - this.vocalT < 10) return;
    this.vocalT = sim.time;
    sim.emit({ type: 'hv_vocal', k: kind, x: this.x, y: this.y + EYE, z: this.z, s: (this.rng() * 1e9) | 0 });
    sim.director.onVocal();
  }

  snapshot() {
    const a = this.anim;
    return [+this.x.toFixed(2), +this.y.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(3), +this.lookYaw.toFixed(3), +this.lookPitch.toFixed(3),
      +this.speed.toFixed(2), (a.run ? 1 : 0) | (a.reach > 0.5 ? 2 : 0) | (a.still > 0.5 ? 4 : 0) | (this.state === 'dormant' ? 8 : 0) | (this.state === 'retreat' ? 16 : 0),
      +a.tilt.toFixed(2), +a.jaw.toFixed(2), HV_STATES.indexOf(this.state)];
  }
}
