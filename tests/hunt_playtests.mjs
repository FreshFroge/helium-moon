// Hunt playtests: whole sessions of the real authoritative simulation with bots
// that play the actual game, logging every Helium Voice hunt.
//
// A "hunt" is the director's chase window: `chase` on → `chase` off. That is the
// same window the client uses for the hunt hum and the chase music cues.
//
// Bots are scripted players, not people, but they play the real objective chain:
//   memo at the kiosk → gas can → generator → fuse kit → relay box → repeater mast → extraction.
// They walk the trail and use findPath for off-trail legs, glance around (per
// personality) and look up from repairs. They sprint away (real 9 s stamina,
// regen after 1.2 s) when they actually perceive Helium Voice (cautious players instead
// stand their ground and hold the light on him once he's within 12 m), and revive downed
// teammates. Perception matches the client: his vocals and footsteps are only
// audible within 2.4 m (CONFIG.HV.FOOTSTEP_MAX_DISTANCE), so at range the only
// tell is the hunt hum (audible ~1.5 s after a hunt starts, to players within
// HV.HUNT_HUM_RANGE of him, with no direction). On the hum, cautious/steady players sweep their view looking for
// him and rushers just sprint; a bot flees once it SEES him (perception.onScreen,
// within 45 m), hears him within 2.4 m, or is hit. Teams split into a
// generator branch and a relay branch; extra players escort and watch.
//
//   node tests/hunt_playtests.mjs                       (10 sessions, up to 30 min)
//   HUNT_JSON=/tmp/hunts.json node tests/hunt_playtests.mjs
//   HUNT_SESSIONS=3 HUNT_MINUTES=12 node tests/hunt_playtests.mjs   (quicker)
//   HUNT_ONLY=7 HUNT_RECORD=/tmp/clip.json HUNT_WINDOW=366,392 node tests/hunt_playtests.mjs
//     (one playtest; saves every server snapshot + event in the window, for video replays:
//      tools/render_hunt_replay.py)
import fs from 'node:fs';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance, makeRng } from '../shared/math.js';
import { onScreen } from '../shared/sim/perception.js';
import { inSpawnZone } from '../shared/sim/zones.js';
import { groundAt } from '../shared/physics.js';

const DT = 0.05;
const MINUTES = +(process.env.HUNT_MINUTES || 30);
const P = CONFIG.PLAYER;
const world = new World({});
const L = world.trailLength;
const POIS = Object.values(world.poi).sort((a, b) => a.along - b.along);

// Default 10-playtest mix; larger owner-requested runs extend it with balanced
// 1/2/3/4-player teams and unique deterministic seeds.
const BASE_PLAN = [
  { team: 1, seed: 2001 }, { team: 1, seed: 2002 }, { team: 1, seed: 2003 }, { team: 1, seed: 2004 },
  { team: 2, seed: 2005 }, { team: 2, seed: 2006 }, { team: 2, seed: 2007 },
  { team: 3, seed: 2008 }, { team: 3, seed: 2009 },
  { team: 4, seed: 2010 },
];
const SESSION_COUNT = +(process.env.HUNT_SESSIONS || 10);
const PLAN = Array.from({ length: SESSION_COUNT }, (_, i) => BASE_PLAN[i] || ({ team: 1 + (i % 4), seed: 2001 + i }))
  .map((cfg, i) => ({ ...cfg, n: i + 1 }))
  .filter((cfg) => !process.env.HUNT_ONLY || cfg.n === +process.env.HUNT_ONLY);
const REC = process.env.HUNT_RECORD ? { path: process.env.HUNT_RECORD, win: (process.env.HUNT_WINDOW || '0,99999').split(',').map(Number), frames: [] } : null;

const PERSONAS = {
  // travel: 'walk' never sprints between objectives (quiet, keeps stamina to flee);
  // 'bursts' jogs in sprint bursts on legs over 80 m when stamina is full;
  // 'max' sprints whenever stamina allows (fast, loud, often empty when hunted)
  // standGround: during a hunt, once they see him close they stop and aim at the Puppet's
  // overhead control long enough to try cutting his strings; others keep running.
  cautious: { glance: [9, 16], workLook: 5, fleeLook: true, travel: 'walk', standGround: true },
  steady: { glance: [18, 32], workLook: 9, fleeLook: true, travel: 'bursts', standGround: false },
  rusher: { glance: null, workLook: 0, fleeLook: false, travel: 'max', standGround: false },
};

const mmss = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
const faceYaw = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
function whereAt(x, z) {
  const n = world.trailInfo(x, z);
  let best = POIS[0];
  for (const p of POIS) if (Math.abs(p.along - n.along) < Math.abs(best.along - n.along)) best = p;
  const off = Math.round(n.along - best.along);
  const near = Math.abs(off) < 25 ? `at ${best.name}` : `trail ${Math.round(n.along)} m (${Math.abs(off)} m ${off > 0 ? 'past' : 'before'} ${best.name})`;
  return n.d > 6 ? `${near}, ${Math.round(n.d)} m off trail` : near;
}

// ------------------------------------------------------------------ bot
class Bot {
  constructor(sim, id, role, persona, rng, team) {
    Object.assign(this, { sim, id, role, persona, rng, team });
    this.P = PERSONAS[persona];
    this.route = []; this.goalKey = null; this.goalPos = null; this.routeT = 0;
    this.stamina = P.STAMINA_MAX; this.sprintRest = 0;
    this.glanceT = this.P.glance ? rng.range(...this.P.glance) : Infinity; this.glancing = 0; this.glanceYaw = 0;
    this.lookT = 0; this.fleeing = false; this.fleeSince = 0; this.lastThreat = -999; this.fleeLookT = 0;
    this.activity = 'starting at the trailhead'; this.claim = null; this.burstT = rng.range(8, 20);
    this.noticedAt = null;
  }
  get p() { return this.sim.players.get(this.id); }

  // what is the next thing this player should do
  goal() {
    const sim = this.sim, O = sim.obj, p = this.p;
    const item = (id) => O.items.find((i) => i.id === id);
    const st = (id) => O.stations.find((s) => s.id === id);
    // revive a downed teammate first (unless the creature is right there)
    for (const q of sim.playerList) if (q.state === 'downed' && q.id !== this.id) {
      const hvd = Math.hypot(sim.hv.x - q.x, sim.hv.z - q.z);
      if (hvd > 15 || sim.hv.state === 'dormant') return { key: 'revive:' + q.id, x: q.x, z: q.z, act: 'revive', target: q.id, label: `reviving ${q.id}`, travel: `running to revive ${q.id}` };
    }
    if (O.extractOpen) return { key: 'extract', x: O.extract.x, z: O.extract.z, act: 'stand', label: 'waiting at extraction', travel: 'heading to extraction' };
    const memo = item('note_memo');
    if (this.role === 'gen' && !memo.holder) return { key: 'memo', x: memo.x, z: memo.z, act: 'pickup', id: 'note_memo', label: 'reading the kiosk memo', travel: 'walking to the kiosk' };
    const chains = {
      gen: [['fuel', 'item'], ['gen', 'st'], ['fuse', 'item'], ['relay', 'st'],['crank','item'],['uplink','st']],
      relay: [['fuse', 'item'], ['relay', 'st'], ['crank','item'],['uplink','st'],['fuel', 'item'], ['gen', 'st']],
    };
    const claimedByOther = (k) => sim._bots.some((b) => b !== this && b.claim === k && b.p?.state === 'alive');
    // grab anything useful lying within 15 m (players pick things up as they pass)
    for (const it of O.items) if (!it.holder && it.kind !== 'note' && Math.hypot(it.x - p.x, it.z - p.z) < 15 && !claimedByOther(it.id))
      return { key: 'grab:' + it.id, x: it.x, z: it.z, act: 'pickup', id: it.id, label: `picking up ${it.name.toLowerCase()}`, travel: `grabbing ${it.name.toLowerCase()}` };
    if (this.role !== 'escort') {
      // available tasks for my branch (own branch first), nearest along the trail
      const here = world.trailInfo(p.x, p.z).along;
      const cand = [];
      chains[this.role].forEach(([k, kind], order) => {
        if (claimedByOther(k)) return;
        if (kind === 'item') { const it = item(k); if (!it.holder && !O.team[k]) cand.push({ order: order < 2 ? 0 : 1, k, x: it.x, z: it.z, act: 'pickup', id: k, label: `picking up the ${it.name.toLowerCase()}`, travel: `heading for the ${it.name.toLowerCase()}` }); return; }
        const s = st(k); if (!s.done && O.canUse(s)) cand.push({ order: order < 2 ? 0 : 1, k, x: s.x, z: s.z, act: s.action==='dial'?'dial':'use', id: k, label: `working: ${s.name.toLowerCase()}`, travel: `heading to ${s.where} (${k})` });
      });
      cand.sort((a, b) => a.order - b.order || Math.abs(world.trailInfo(a.x, a.z).along - here) - Math.abs(world.trailInfo(b.x, b.z).along - here));
      if (cand.length) { const c = cand[0]; this.claim = c.k; return { key: c.k, ...c }; }
      const mast = st('mast');
      if (!mast.done && O.canUse(mast) && !claimedByOther('mast')) { this.claim = 'mast'; return { key: 'mast', x: mast.x, z: mast.z, act: 'use', id: 'mast', label: 'sending the distress call at the mast', travel: 'heading to the repeater mast' }; }
    }
    // escort / nothing left for me: stay near a working teammate and watch
    this.claim = null;
    const lead = sim._bots.filter((b) => b !== this && b.role !== 'escort' && b.p?.state === 'alive')
      .sort((a, b) => Math.hypot(a.p.x - p.x, a.p.z - p.z) - Math.hypot(b.p.x - p.x, b.p.z - p.z))[0];
    if (lead) {
      const lp = lead.p, a = this.rng.range(0, 6.28);
      const near = Math.hypot(lp.x - p.x, lp.z - p.z) < 7;
      return { key: 'escort:' + lead.id, x: near ? p.x : lp.x + Math.sin(a) * 4, z: near ? p.z : lp.z + Math.cos(a) * 4, act: 'watch', label: `watching ${lead.id}'s back`, travel: `following ${lead.id}`, follow: lead };
    }
    const mast = st('mast');
    return { key: 'wait-mast', x: mast.x, z: mast.z, act: 'stand', label: 'waiting at the mast', travel: 'heading to the mast' };
  }

  routeTo(tx, tz) {
    const p = this.p, pts = [];
    if (Math.hypot(tx - p.x, tz - p.z) < 30 && world._straightWalkable([p.x, p.z], [tx, tz])) { this.route = [[tx, tz]]; return; }
    const here = world.trailInfo(p.x, p.z), there = world.trailInfo(tx, tz);
    if (here.d > 3) { const r = world.findPath(p.x, p.z, here.x, here.z, { maxExpand: 6000 }); if (r) pts.push(...r.slice(1)); pts.push([here.x, here.z]); }
    const step = there.along > here.along ? 4 : -4;
    for (let a = here.along + step; step > 0 ? a < there.along : a > there.along; a += step) { const q = pointAtDistance(world.trail, world.trailCum, a); pts.push([q.x, q.z]); }
    pts.push([there.x, there.z]);
    if (there.d > 1.2) { const r = world.findPath(there.x, there.z, tx, tz, { maxExpand: 6000 }); if (r) pts.push(...r.slice(1)); pts.push([tx, tz]); }
    this.route = pts;
  }

  // flee along the trail, away from Helium Voice
  fleeRoute() {
    const p = this.p, hv = this.sim.hv;
    const a = world.trailInfo(p.x, p.z).along, h = world.trailInfo(hv.x, hv.z).along;
    let sign = h > a ? -1 : 1;
    if ((sign < 0 && a < 30) || (sign > 0 && a > L - 30)) sign = -sign;
    const t = pointAtDistance(world.trail, world.trailCum, Math.max(2, Math.min(L - 2, a + sign * 40)));
    this.routeTo(t.x, t.z);
    this.activity = 'running from Helium Voice';
  }

  tick(t, events) {
    const sim = this.sim, p = this.p;
    if (!p || p.state !== 'alive') return;
    const hv = sim.hv, rng = this.rng;
    const hvd = hv.state === 'dormant' ? 1e9 : Math.hypot(hv.x - p.x, hv.z - p.z);
    // --- perceive the creature (what a player could actually see/hear)
    let notice = null;
    for (const e of events) {
      if (e.type === 'chase' && e.on && this.humAt == null) this.humAt = t + 1.5;            // hunt hum becomes audible
      if (e.type === 'chase' && !e.on) this.humAt = null;
      if ((e.type === 'hit' || e.type === 'downed') && e.pid === this.id) notice = 'got hit';
    }
    // the client plays the hum only within HV.HUNT_HUM_RANGE of this player (+10 m hysteresis)
    this.humNear = hvd < CONFIG.HV.HUNT_HUM_RANGE + (this.humNear ? 10 : 0);
    const humOn = this.humAt != null && t >= this.humAt && sim.director.chasing && this.humNear;
    if (humOn && !this.fleeing && this.sweepT == null && this.P.travel !== 'max') this.sweepT = 0;   // look all around
    if (!notice && hvd < 45 && onScreen(world, p, hv.x, hv.y, hv.z)) notice = 'saw him';
    if (!notice && hvd < CONFIG.HV.FOOTSTEP_MAX_DISTANCE) notice = 'heard him right behind';
    if (notice) {
      this.lastThreat = t;
      if (!this.fleeing) { this.fleeing = true; this.fleeSince = t; this.noticedAt = t; this.noticeHow = notice; this.sweepT = null; this.fleeRoute(); this.routeT = 0; }
    }
    if (this.fleeing) {
      const huntOnMe = sim.director.chasing && hv.target === this.id;
      if (!huntOnMe && t - this.lastThreat > 6) { this.fleeing = false; this.goalKey = null; }
      else if ((this.routeT -= DT) <= 0) { this.fleeRoute(); this.routeT = 3; }
    }
    // --- choose goal
    let g = null;
    if (!this.fleeing) {
      g = this.goal();
      const moved = !this.goalPos || Math.hypot(g.x - this.goalPos.x, g.z - this.goalPos.z) > 3;
      if (g.key !== this.goalKey || (moved && (this.routeT -= DT) <= 0)) { this.goalKey = g.key; this.goalPos = { x: g.x, z: g.z }; this.routeTo(g.x, g.z); this.routeT = 6; }
    }
    // --- move
    const atGoal = !this.fleeing && g && Math.hypot(g.x - p.x, g.z - p.z) < (g.act === 'use' ? 1.8 : g.act === 'revive' ? 1.6 : 1.5);
    if (g) this.activity = atGoal ? g.label : g.travel;
    let mvx = 0, mvz = 0, sprint = false;
    if (!atGoal && this.route.length) {
      const [wx, wz] = this.route[0];
      const dx = wx - p.x, dz = wz - p.z, d = Math.hypot(dx, dz);
      // sprinting: fleeing always; rushers sprint in bursts between objectives
      let want = this.fleeing || (humOn && this.P.travel === 'max');
      if (!want && this.P.travel === 'max') want = this.sprinting || this.stamina > 3;
      if (!want && this.P.travel === 'bursts' && this.route.length > 20) want = this.sprinting || this.stamina >= P.STAMINA_MAX - 0.01;
      if (want && this.stamina > 0.2 && this.sprintRest <= 0) sprint = true;
      this.sprinting = sprint;
      if (sprint) { this.stamina -= DT; if (this.stamina <= 0.2) this.sprintRest = 2.5; }
      const sp = sprint ? P.SPRINT : P.WALK, stepLen = Math.min(d, sp * DT);
      if (d > 1e-6) { mvx = dx / d * stepLen; mvz = dz / d * stepLen; }
      if (d < 0.45) this.route.shift();
    }
    if (!sprint) { this.sprintRest -= DT; if (this.sprintRest <= 0) this.stamina = Math.min(P.STAMINA_MAX, this.stamina + P.STAMINA_REGEN * DT); }
    // Stand ground and aim at the Puppet's overhead control while he charges.
    const huntOnMe = sim.director.chasing && hv.target === this.id;
    const control = huntOnMe && hv.controlPos?.();
    if (this.P.standGround && this.fleeing && control && hvd < 18 && (this.noticeHow === 'saw him' || onScreen(world, p, hv.x, hv.y, hv.z))) {
      mvx = 0; mvz = 0; sprint = false; this.activity = 'standing ground with the flashlight';
      this.standing = true; this.controlAiming = true;
    } else { this.standing = false; this.controlAiming = false; }
    const nx = p.x + mvx, nz = p.z + mvz;
    // --- gaze
    let yaw = p.yaw, pitch = 0;
    if (Math.hypot(mvx, mvz) > 1e-4) yaw = Math.atan2(-mvx, -mvz);
    let use = null, revive = null;
    if (atGoal && g) {
      if (g.act === 'use') { use = g.id; yaw = faceYaw(p.x, p.z, g.x, g.z); }
      if (g.act === 'pickup') sim.action(this.id, { a: 'pickup', id: g.id });
      if (g.act === 'dial') {sim.action(this.id,{a:'dial',id:g.id});yaw=faceYaw(p.x,p.z,g.x,g.z);}
      if (g.act === 'revive') { revive = g.target; yaw = faceYaw(p.x, p.z, g.x, g.z); }
      if (g.act === 'watch' || g.act === 'stand') { this.lookT -= DT; if (this.lookT <= 0) { this.watchYaw = rng.range(-Math.PI, Math.PI); this.lookT = rng.range(2, 4); } yaw = this.watchYaw ?? yaw; }
      if (g.act === 'use' && this.P.workLook) {   // nervously look up from the repair
        this.lookT -= DT;
        if (this.lookT <= -1.5) this.lookT = this.P.workLook * rng.range(0.7, 1.3);
        if (this.lookT < 0) { use = null; yaw += this.workYaw ??= rng.range(1.6, 3.1) * (rng() < 0.5 ? -1 : 1); } else this.workYaw = null;
      }
    }
    if (this.controlAiming && control) {
      yaw = faceYaw(p.x, p.z, control.x, control.z);
      pitch = Math.atan2(control.y - (p.y + 1.6), Math.hypot(control.x - p.x, control.z - p.z));
    } else if (this.standing) yaw = faceYaw(p.x, p.z, hv.x, hv.z);
    else if (this.fleeing && this.P.fleeLook) {        // look back over the shoulder while running
      this.fleeLookT -= DT;
      if (this.fleeLookT <= -0.6) this.fleeLookT = rng.range(2.5, 4);
      if (this.fleeLookT < 0) yaw += Math.PI;
    } else if (this.sweepT != null && humOn) {        // hum: turn a full circle over 2.5 s, then every 6 s again
      this.sweepT += DT; yaw += (this.sweepT % 6) < 2.5 ? (this.sweepT % 6) / 2.5 * Math.PI * 2 : 0;
    } else if (!atGoal && !this.fleeing && this.P.glance) {
      this.glanceT -= DT;
      if (this.glanceT <= 0) { this.glancing = 1.6; this.glanceYaw = rng() < 0.5 ? Math.PI : (rng() < 0.5 ? 1.5 : -1.5); this.glanceT = rng.range(...this.P.glance); }
      if (this.glancing > 0) { this.glancing -= DT; yaw += this.glanceYaw; }
    }
    const noise = sprint ? 1 : Math.hypot(mvx, mvz) > 1e-4 ? 0.45 : 0.12;
    sim.input(this.id, { x: nx, y: groundAt(world,nx,nz), z: nz, yaw, pitch, crouch: false, sprint, flash: true, noise, voice: 0, hidden: false, use, revive, viewFov: 75, viewAspect: 16 / 9 });
  }
}

// ------------------------------------------------------------------ one playtest
function playtest(n, { team, seed }) {
  const sim = new GameSim(world, { seed });
  const rng = makeRng(seed * 31 + 7);
  const roles = ['gen', 'relay', 'escort', 'escort'], personaNames = Object.keys(PERSONAS);
  const bots = [];
  for (let i = 0; i < team; i++) {
    const id = 'p' + (i + 1); sim.addPlayer(id, id);
    bots.push(new Bot(sim, id, team === 1 ? 'gen' : roles[i], personaNames[(rng() * 3) | 0], makeRng(seed * 97 + i), team));
  }
  sim._bots = bots;
  const hunts = [], timeline = [];
  let open = null, prevHv = sim.hv.state, hvPrevNonChase = 'roam';
  const ctx = { reveals: 0, sfHits: 0, hvHitsOutsideHunts: 0, vocals: 0, sig: 0, approaches: [],
    cuts: 0, freezes: 0, collapses: 0, grabs: 0, relocations: {}, unannouncedMax: 0, unannouncedAt: null };
  let prevX = sim.hv.x, prevZ = sim.hv.z;
  let approach = null;   // he is closing in on someone for a hunt (beyond HUNT_START_RANGE)
  const origReveal = sim.director.onReveal.bind(sim.director);
  sim.director.onReveal = (k) => { if (k !== 'retreat') { ctx.reveals++; timeline.push({ t: +sim.time.toFixed(1), what: `planned glimpse (${k})` }); } return origReveal(k); };
  let pending = [];
  for (let t = 0; t < MINUTES * 60 && sim.state !== 'won' && sim.state !== 'lost'; t += DT) {
    for (const b of bots) b.tick(sim.time, pending);
    sim.step(DT);
    const hv = sim.hv;
    const evs = sim.drainEvents();
    const relocated = evs.some((e) => e.type === 'hv_relocate');
    const step = Math.hypot(hv.x - prevX, hv.z - prevZ);
    if (!relocated && step > ctx.unannouncedMax) {
      ctx.unannouncedMax = step; ctx.unannouncedAt = { t: +sim.time.toFixed(2), state: hv.state, x: +hv.x.toFixed(1), z: +hv.z.toFixed(1) };
    }
    prevX = hv.x; prevZ = hv.z;
    pending = evs;
    if (REC && sim.time >= REC.win[0] && sim.time <= REC.win[1]) REC.frames.push({ t: +sim.time.toFixed(2), snap: sim.snapshot(), ev: evs, hvState: hv.state });
    for (const e of evs) {
      const tgtBot = (pid) => bots.find((b) => b.id === pid);
      if (e.type === 'chase' && e.on) {
        if (open) { open.end = e.t; open.endReason = `switched to ${e.pid}`; hunts.push(open); }
        const tp = sim.players.get(e.pid), b = tgtBot(e.pid);
        const d = Math.hypot(hv.x - tp.x, hv.z - tp.z);
        open = {
          n: hunts.length + 1, start: e.t, pid: e.pid, team, before: hvPrevNonChase, startDist: +d.toFixed(1),
          seenAtStart: onScreen(world, tp, hv.x, hv.y, hv.z), where: whereAt(tp.x, tp.z), activity: b?.activity || '?',
          escalation: +(sim.director.escalation?.() ?? 0).toFixed(2), minDist: d, seenSec: 0, noticed: null, hits: [], others: 0,
        };
        for (const ob of bots) if (ob.id !== e.pid && ob.p?.state === 'alive' && Math.hypot(ob.p.x - tp.x, ob.p.z - tp.z) < 20) open.others++;
      } else if (e.type === 'chase' && !e.on && open) {
        open.end = e.t; open._closing = true;
      }
      if (['hit', 'downed', 'dead'].includes(e.type)) {
        if (e.by === 'sf') ctx.sfHits++;
        if (open && (e.by === 'hv' || e.type === 'dead') && (e.pid === open.pid || e.by === 'hv')) open.hits.push({ t: e.t, type: e.type, pid: e.pid });
        else if (e.by === 'hv') ctx.hvHitsOutsideHunts++;
        timeline.push({ t: e.t, what: `${e.pid} ${e.type === 'hit' ? 'hit' : e.type}${e.by ? ' by ' + (e.by === 'hv' ? 'Helium Voice' : 'SF6') : ''}` });
      }
      if (e.type === 'hv_vocal') ctx.vocals++;
      if (e.type === 'hv_sig') ctx.sig++;
      if (e.type === 'hv_cut') { ctx.cuts++; if (open) open.cutBy = e.pid; }
      if (e.type === 'hv_freeze') ctx.freezes++;
      if (e.type === 'hv_collapse') ctx.collapses++;
      if (e.type === 'hv_attack' && e.phase === 'grab') ctx.grabs++;
      if (e.type === 'hv_relocate') ctx.relocations[e.reason || 'unknown'] = (ctx.relocations[e.reason || 'unknown'] || 0) + 1;
      if (e.type === 'pickup') timeline.push({ t: e.t, what: `${e.pid} picked up ${e.id === 'note_memo' ? 'the memo' : e.kind === 'note' ? 'a note' : e.kind}` });
      if (e.type === 'objective') timeline.push({ t: e.t, what: `${e.pid} completed: ${e.name}` });
      if (e.type === 'extract_open') timeline.push({ t: e.t, what: 'extraction open' });
      if (e.type === 'revived') timeline.push({ t: e.t, what: `${e.by} revived ${e.pid}` });
      if (e.type === 'hv_relocate') timeline.push({ t: e.t, what: 'Helium Voice relocated unseen' });
    }
    if (open) {
      const tp = sim.players.get(open.pid);
      if (tp) {
        const d = Math.hypot(hv.x - tp.x, hv.z - tp.z); open.minDist = Math.min(open.minDist, d);
        if ((tp.state === 'alive' || tp.state === 'downed') && onScreen(world, tp, hv.x, hv.y, hv.z)) { open.seenSec += DT; open.lastSeenT = sim.time; }
        for (const q of sim.playerList) if (q.id !== open.pid && q.state === 'alive' && onScreen(world, q, hv.x, hv.y, hv.z)) open.otherSeenT = sim.time;
        const b = bots.find((x) => x.id === open.pid);
        if (open.noticed == null && b?.fleeing && b.noticedAt != null && b.noticedAt >= open.start - 0.05) { open.noticed = +(b.noticedAt - open.start).toFixed(1); open.noticeHow = b.noticeHow; }
        if (open.noticed == null && b?.fleeing && b.noticedAt != null && b.noticedAt < open.start) { open.noticed = 0; open.noticeHow = 'already running from him'; }
      }
      if (open._closing) {
        delete open._closing;
        const tpState = tp?.state;
        const hit = open.hits.find((h) => h.pid === open.pid);
        if (open.cutBy && !hit) open.endReason = `strings cut by ${open.cutBy === open.pid ? 'the target' : 'teammate ' + open.cutBy}`;
        else if (hit) open.endReason = hit.type === 'dead' ? 'caught: killed' : hit.type === 'downed' ? 'caught: downed' : 'caught: hit (wounded)';
        else if (tpState === 'dead' || tpState === 'downed') open.endReason = `target ${tpState} (other cause)`;
        else if (tp && inSpawnZone(world, tp.x, tp.z, 8)) open.endReason = 'target reached the spawn area (he can\'t follow)';
        else if (hv.state === 'search') open.endReason = 'lost sight: he searches where he last saw them';
        else if (hv.state === 'retreat' && open.end - open.start >= 31.5) open.endReason = 'gave up: chase time limit';
        else if (hv.state === 'retreat' && sim.time - (open.lastSeenT ?? -99) < 2.5) open.endReason = 'target saw him: he broke off to get out of sight';
        else if (hv.state === 'retreat' && sim.time - (open.otherSeenT ?? -99) < 2.5) open.endReason = 'a teammate saw him: he broke off to get out of sight';
        else if (hv.state === 'retreat') open.endReason = 'broke off and retreated (unseen)';
        else open.endReason = `ended (${hv.state})`;
        open.endDist = tp ? +Math.hypot(hv.x - tp.x, hv.z - tp.z).toFixed(1) : null;
        open.minDist = +open.minDist.toFixed(1); open.seenSec = +open.seenSec.toFixed(1);
        delete open.lastSeenT; delete open.otherSeenT;
        hunts.push(open); open = null;
      }
    }
    // closing-in attempts and what became of them
    const co = hv.closingOn;
    if (co && (!approach || approach.ref !== co)) { if (approach) ctx.approaches.push({ ...approach, ref: undefined, result: 'retargeted' }); approach = { ref: co, t: +sim.time.toFixed(1), pid: co.pid, spotted: false }; }
    if (approach) {
      if (hv.state === 'retreat') approach.spotted = true;
      if (!co) {
        const result = hv.state === 'chase' ? 'became a hunt' : approach.spotted ? 'seen while closing in, gave up' : 'gave up (time limit or director said not now)';
        ctx.approaches.push({ t: approach.t, pid: approach.pid, end: +sim.time.toFixed(1), result, spotted: approach.spotted }); approach = null;
      }
    }
    if (hv.state !== 'chase') hvPrevNonChase = hv.state;
    prevHv = hv.state;
  }
  if (open) { open.end = +sim.time.toFixed(1); open.endReason = 'session ended mid-hunt'; open.minDist = +open.minDist.toFixed(1); open.seenSec = +open.seenSec.toFixed(1); hunts.push(open); }
  return {
    n, team, seed, personas: bots.map((b) => `${b.id} ${b.role} ${b.persona}`), outcome: sim.state === 'won' ? 'escaped' : sim.state === 'lost' ? 'all dead' : 'time up',
    minutes: +(sim.time / 60).toFixed(1), objectives: sim.obj.doneCount(),totalObjectives:sim.obj.stations.length, hunts, timeline: timeline.sort((a, b) => a.t - b.t),
    players: bots.map((b) => ({ id: b.id, state: b.p?.state })), ...ctx,
  };
}

// ------------------------------------------------------------------ run
const t0 = Date.now();
const results = PLAN.map((cfg) => {
  const r = playtest(cfg.n, cfg);
  console.log(`\n### Playtest ${r.n}: ${r.team === 1 ? 'solo' : r.team + ' players'} (seed ${r.seed}): ${r.outcome} at ${mmss(r.minutes * 60)}, ${r.objectives}/${r.totalObjectives} objectives, ${r.hunts.length} hunts`);
  console.log(`players: ${r.personas.join('; ')}`);
  console.log('# | start | end | length | target | he was | start dist | target doing | where | player reacted | ended | closest | on target screen');
  for (const h of r.hunts) console.log([h.n, mmss(h.start), mmss(h.end), `${(h.end - h.start).toFixed(0)} s`, h.pid, h.before, `${h.startDist} m`, h.activity, h.where, h.noticed == null ? 'never noticed' : `${h.noticeHow} +${h.noticed} s`, h.endReason, `${h.minDist} m`, `${h.seenSec} s`].join(' | '));
  const ap = r.approaches; console.log(`closing-in attempts: ${ap.length} (${['became a hunt', 'seen while closing in, gave up', 'gave up (time limit or director said not now)', 'retargeted'].map((k) => `${ap.filter((a) => a.result === k).length} ${k}`).join(', ')}; ${ap.filter((a) => a.spotted).length} were spotted at least once while closing)`);
  console.log('timeline: ' + r.timeline.map((e) => `${mmss(e.t)} ${e.what}`).join(' · '));
  return r;
});
console.log(`\n${results.length} playtests, ${((Date.now() - t0) / 1000).toFixed(0)} s wall time`);
if (process.env.HUNT_JSON) fs.writeFileSync(process.env.HUNT_JSON, JSON.stringify(results, null, 1));
if (REC) { fs.writeFileSync(REC.path, JSON.stringify({ window: REC.win, frames: REC.frames })); console.log(`recorded ${REC.frames.length} snapshots to ${REC.path}`); }
