// Session pacing timeline (measurement, not a pass/fail judgement of feel).
//
// Runs whole sessions of the real authoritative simulation with scripted player
// behaviours and records, per player: when the cold first reaches them (outer
// terror ring, CONFIG.TERROR.OUTER), first entry to each terror ring, first time Helium Voice is actually on their
// screen (perception.onScreen, the same check the AI uses), chases, hits,
// retreats, reveals, vocals, the signature line, mimicry, and the longest quiet
// stretch. Hard assertions cover invariants only; pacing numbers are printed
// and written to JSON for docs/PACING_REPORT.md.
//
//   node tests/pacing.test.mjs                 (4 behaviours x 4 seeds x 15 min)
//   PACING_SEEDS=2 PACING_MINUTES=8 node tests/pacing.test.mjs     (quicker)
//   PACING_JSON=/tmp/pacing.json node tests/pacing.test.mjs        (raw results)
import fs from 'node:fs';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { onScreen } from '../shared/sim/perception.js';

const SEEDS = +(process.env.PACING_SEEDS || 4);
const MINUTES = +(process.env.PACING_MINUTES || 15);
const DT = 0.05;
const T = CONFIG.TERROR;
const RINGS = [['outer', T.OUTER], ['middle', T.MIDDLE], ['inner', T.INNER], ['critical', T.CRITICAL]];
// "Threat" = something the player would perceive as the monster acting on them.
const THREATS = new Set(['chase', 'hit', 'downed', 'dead', 'hv_sig', 'snap', 'mimic', 'gas', 'reveal']);

let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok ' : 'FAIL '} ${m}`); if (!c) failures++; };

const world = new World({});
const L = world.trailLength;

// ------------------------------------------------------------------ scripted behaviours
// Each returns per-tick input for one player. `s` is that player's scratch state.
const trailPose = (along, back = false) => {
  const q = pointAtDistance(world.trail, world.trailCum, Math.max(2, Math.min(L - 2, along)));
  const fwd = Math.atan2(-Math.sin(q.dir), -Math.cos(q.dir));       // player yaw facing along the trail
  return { x: q.x, z: q.z, yaw: back ? fwd + Math.PI : fwd };
};
function walker(s, t, { speed = 1.6, lookBackEvery = 0, offset = 0, start = 4 } = {}) {
  s.along ??= start; s.dir ??= 1;
  s.along += speed * DT * s.dir;
  if (s.along > L - 8 || s.along < 3) s.dir *= -1;                   // ping-pong along the trail
  const back = lookBackEvery > 0 && (t % lookBackEvery) < 3;        // 3 s glance behind
  const p = trailPose(s.along + offset, (s.dir < 0) !== back);
  return { ...p, pitch: 0, crouch: false, sprint: false, flash: true, noise: 0.45, voice: 0, hidden: false };
}
function hider(s) {
  if (!s.spot) {   // densest walkable brush 3-12 m off the trail around 600 m
    let best = null, bs = -1;
    for (let a = 560; a < 640; a += 4) for (const side of [-12, -9, -6, -3, 3, 6, 9, 12]) {
      const q = pointAtDistance(world.trail, world.trailCum, a), x = q.x + Math.cos(q.dir) * side, z = q.z - Math.sin(q.dir) * side;
      if (!world.navWalkable(x, z)) continue;
      const b = world.gridAt(world.gBrush, x, z); if (b > bs) { bs = b; best = { x, z, yaw: Math.atan2(-(q.x - x), -(q.z - z)) }; }
    }
    s.spot = best;
  }
  return { ...s.spot, pitch: 0, crouch: true, sprint: false, flash: false, noise: 0, voice: 0, hidden: true };
}

const SCENARIOS = {
  'walker, never looks back': [(s, t) => walker(s, t)],
  'walker, glances back every 20 s': [(s, t) => walker(s, t, { lookBackEvery: 20 })],
  'stays crouched in brush, light off': [(s) => hider(s)],
  'co-op pair + straggler 30 m behind': [(s, t) => walker(s, t, { start: 40 }), (s, t) => walker(s, t, { start: 41.5, offset: 0 }), (s, t) => walker(s, t, { start: 10, speed: 1.55 })],
};

// ------------------------------------------------------------------ one session
function runSession(name, behaviours, seed) {
  const sim = new GameSim(world, { seed });
  const ids = behaviours.map((_, i) => 'p' + (i + 1));
  ids.forEach((id) => sim.addPlayer(id, id));
  const scratch = ids.map(() => ({}));
  const pt = Object.fromEntries(ids.map((id) => [id, {
    firstRing: {}, ringSec: { outer: 0, middle: 0, inner: 0, critical: 0 }, firstSeen: null, seenSec: 0,
    hits: 0, parkedMax: 0, parked: 0, state: 'alive', diedAt: null,
  }]));
  const events = [], reveals = [];
  let revealNow = false;
  const origReveal = sim.director.onReveal.bind(sim.director);
  sim.director.onReveal = (kind) => {
    if (kind !== 'retreat') { reveals.push({ t: +sim.time.toFixed(1), kind }); revealNow = true; }
    return origReveal(kind);
  };
  let lastThreat = 0, longestQuiet = 0, quietSince = null, nan = 0, introViolation = false;
  const hvStateSec = {};
  for (let t = 0; t < MINUTES * 60; t += DT) {
    ids.forEach((id, i) => {
      const p = sim.players.get(id);
      if (!p || (p.state !== 'alive' && p.state !== 'downed')) return;
      const m = behaviours[i](scratch[i], sim.time);
      sim.input(id, { ...m, y: world.heightAt(m.x, m.z), viewFov: 75, viewAspect: 16 / 9 });
      const q = sim.players.get(id); if (Math.hypot(q.x - m.x, q.z - m.z) > 0.01) { q.x = m.x; q.z = m.z; q.lastX = m.x; q.lastZ = m.z; }   // behaviours may jump (ping-pong), the server's 12 m clamp would refuse
    });
    sim.step(DT);
    const hv = sim.hv;
    if (![hv.x, hv.z, sim.sf.x, sim.sf.z].every(Number.isFinite)) nan++;
    hvStateSec[hv.state] = (hvStateSec[hv.state] || 0) + DT;
    const intro = sim.state === 'intro';
    let threatNow = revealNow; revealNow = false;
    for (const e of sim.drainEvents()) {
      events.push({ t: e.t, type: e.type, k: e.k, pid: e.pid, on: e.on, by: e.by });
      if (intro && (e.type === 'chase' || e.type === 'hit')) introViolation = true;
      if (THREATS.has(e.type) && !(e.type === 'chase' && e.on === false)) threatNow = true;
      if ((e.type === 'hit' || e.type === 'downed' || e.type === 'dead') && pt[e.pid]) pt[e.pid].hits++;
    }
    for (const id of ids) {
      const p = sim.players.get(id), r = pt[id];
      if (!p) continue;
      r.state = p.state;
      if ((p.state === 'dead' || p.state === 'escaped') && r.diedAt === null) r.diedAt = +sim.time.toFixed(1);
      if (p.state !== 'alive' && p.state !== 'downed') continue;
      const d = hv.state === 'dormant' ? 1e9 : Math.hypot(hv.x - p.x, hv.z - p.z);
      for (const [ring, R] of RINGS) if (d < R) { r.ringSec[ring] += DT; if (r.firstRing[ring] == null) r.firstRing[ring] = +sim.time.toFixed(1); }
      // The owner's sole proximity warning is the freezing aura. Entering the
      // inner ring is therefore a perceived threat interval even without a
      // separate sound/event; count it when measuring genuinely safe gaps.
      if (d < T.INNER) threatNow = true;
      if (hv.state !== 'dormant' && d < 80 && onScreen(world, p, hv.x, hv.y, hv.z)) { r.seenSec += DT; if (r.firstSeen == null) r.firstSeen = +sim.time.toFixed(1); }
      // "parked": within creep distance of this player with no hit landing
      if (d <= CONFIG.HV.CREEP_DISTANCE + 0.2) { r.parked += DT; r.parkedMax = Math.max(r.parkedMax, r.parked); } else r.parked = 0;
    }
    if (sim.state === 'intro') continue;
    if (threatNow) { if (quietSince !== null) longestQuiet = Math.max(longestQuiet, sim.time - quietSince); quietSince = null; lastThreat = sim.time; }
    else if (quietSince === null) quietSince = sim.time;
    if (sim.state === 'won' || sim.state === 'lost') break;
  }
  if (quietSince !== null) longestQuiet = Math.max(longestQuiet, sim.time - quietSince);
  const count = (type, f = () => true) => events.filter((e) => e.type === type && f(e)).length;
  const firstT = (type, f = () => true) => { const e = events.find((x) => x.type === type && f(x)); return e ? e.t : null; };
  const ordered = events.every((e, i) => i === 0 || e.t >= events[i - 1].t);
  return {
    scenario: name, seed, minutes: +(sim.time / 60).toFixed(1), outcome: sim.state, nan, ordered, introViolation,
    chases: count('chase', (e) => e.on), firstChase: firstT('chase', (e) => e.on), hits: count('hit') + count('downed') + count('dead'), hvHits: events.filter((e) => ['hit', 'downed', 'dead'].includes(e.type) && e.by === 'hv').length, sfHits: events.filter((e) => ['hit', 'downed', 'dead'].includes(e.type) && e.by === 'sf').length,
    firstHit: firstT('hit') ?? firstT('downed') ?? firstT('dead'), sig: count('hv_sig'), firstSig: firstT('hv_sig'), snaps: count('snap'),
    vocals: count('hv_vocal'), sfVocals: count('sf_vocal'), mimic: count('mimic'), gas: count('gas'), reveals,
    longestQuiet: +longestQuiet.toFixed(0),
    // threat events (chase starts, hits, reveals, signature, snaps, mimicry, gas) per 5-minute window
    buckets: Array.from({ length: Math.ceil(MINUTES / 5) }, (_, b) => events.filter((e) => e.t >= b * 300 && e.t < (b + 1) * 300 && THREATS.has(e.type) && !(e.type === 'chase' && e.on === false)).length + reveals.filter((r) => r.t >= b * 300 && r.t < (b + 1) * 300).length), hvStateSec: Object.fromEntries(Object.entries(hvStateSec).map(([k, v]) => [k, Math.round(v)])), players: pt,
  };
}

// ------------------------------------------------------------------ run + report
const results = [];
const t0 = Date.now();
for (const [name, beh] of Object.entries(SCENARIOS)) for (let seed = 1; seed <= SEEDS; seed++) results.push(runSession(name, beh, 1000 + seed));
console.log(`\n${results.length} sessions, ${MINUTES} min each, ${((Date.now() - t0) / 1000).toFixed(0)} s wall time\n`);

const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? (v >= 100 ? Math.round(v) : +v.toFixed(1)) : v);
const mmss = (s) => {
  if (s == null) return '—';
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
for (const name of Object.keys(SCENARIOS)) {
  console.log(`## ${name}`);
  console.log(`seed | outcome | cold (${T.OUTER} m) | inner (${T.INNER} m) | first on screen | 1st chase | chases | HV hits | skunk hits | parked ≤2.6 m max | sig | reveals | longest quiet | threats per 5 min`);
  for (const r of results.filter((x) => x.scenario === name)) {
    const p1 = r.players.p1;
    console.log([r.seed, r.outcome, mmss(p1.firstRing.outer), mmss(p1.firstRing.inner), mmss(p1.firstSeen), mmss(r.firstChase), r.chases, r.hvHits, r.sfHits,
      `${fmt(Math.max(...Object.values(r.players).map((p) => p.parkedMax)))} s`, r.sig, r.reveals.map((x) => x.kind).join('/') || '—', mmss(r.longestQuiet), r.buckets.join(' ')].join(' | '));
  }
  console.log('');
}
if (process.env.PACING_JSON) fs.writeFileSync(process.env.PACING_JSON, JSON.stringify(results, null, 1));

// invariants only
ok(results.every((r) => r.nan === 0), 'no NaN creature positions');
ok(results.every((r) => r.ordered), 'event timestamps are ordered');
ok(results.every((r) => !r.introViolation), 'no chase or hit during the protected intro');
ok(results.every((r) => r.players.p1.firstRing.outer == null || r.players.p1.firstRing.outer >= CONFIG.SESSION.INTRO_TIME), `Helium Voice is not inside the outer ring (${T.OUTER} m) before the intro ends`);
console.log(failures ? `\n${failures} FAILED` : '\npacing invariants passed (pacing numbers above are measurements, not pass/fail)');
process.exit(failures ? 1 : 0);
