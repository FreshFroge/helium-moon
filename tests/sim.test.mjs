// Headless simulation checks (no browser): world determinism, trail walkability,
// objective reachability, creature movement sanity (no teleporting, stays on walkable
// ground), director pacing, signature/mimic/vocal events, step cost.
//   node tests/sim.test.mjs
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { moveCharacter, supportHeight } from '../shared/physics.js';

let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok ' : 'FAIL '} ${m}`); if (!c) failures++; };

const t0 = Date.now();
const world = new World({});
ok(world.trees.length > 30000, `world built in ${Date.now() - t0} ms with ${world.trees.length} trees, ${world.bushes.length} bushes`);
const w2 = new World({});
ok(w2.trees.length === world.trees.length && w2.trees[1234].x === world.trees[1234].x && w2.logs.length === world.logs.length, 'world generation is deterministic (server and clients agree)');

// trail walkable end to end with the player's collision code
let blocked = 0;
for (let a = 1; a < world.trailLength - 2; a += 0.5) {
  const p = pointAtDistance(world.trail, world.trailCum, a), q = pointAtDistance(world.trail, world.trailCum, a + 0.5);
  const pos = { x: p.x, z: p.z, y: supportHeight(world, p.x, p.z, 10) };
  const m = moveCharacter(world, pos, q.x - p.x, q.z - p.z, CONFIG.PLAYER.RADIUS, { boundary: true });
  if (Math.hypot(m.x - p.x, m.z - p.z) < 0.25) blocked++;
}
ok(blocked === 0, `trail (${world.trailLength.toFixed(0)} m) walkable end to end`);

// every objective station and item is reachable on the nav grid from the trailhead
for (let seed = 1; seed <= 5; seed++) {
  const sim = new GameSim(world, { seed });
  const sp = sim.spawnPoint(0), L = sim.obj.layout();
  const targets = [...L.stations.map((s) => [s.id, s.x, s.z]), ...L.items.filter((i) => !i.wall).map((i) => [i.id, i.x, i.z]), ['extract', L.extract.x, L.extract.z]];
  const unreachable = targets.filter(([, x, z]) => world.nearestNav(x, z) < 0 || !world.findPath(sp.x, sp.z, x, z, { maxExpand: 400000 })).map((t) => t[0]);
  ok(!unreachable.length, `seed ${seed}: all ${targets.length} objectives reachable${unreachable.length ? ' (unreachable: ' + unreachable.join(',') + ')' : ''}`);
}

// 12 simulated minutes, 3 players walking the trail at different paces, one hides in brush
const sim = new GameSim(world, { seed: 4242 });
const names = ['p1', 'p2', 'p3'];
names.forEach((id) => sim.addPlayer(id, id));
const pace = { p1: 1.6, p2: 1.2, p3: 0.0 };
const along = { p1: 3, p2: 4.6, p3: 6.2 };
// Establish the scripted trail fixture once. The kiosk spawn is farther than
// the input protocol's 12 m movement limit from these initial trail points.
for(const id of names){
  const p=sim.players.get(id),q=pointAtDistance(world.trail,world.trailCum,along[id]);
  Object.assign(p,{x:q.x,z:q.z,y:world.heightAt(q.x,q.z),lastX:q.x,lastZ:q.z});
}
const ev = {}, hvStates = {}, sfStates = {};
let openingChases = 0;
let maxHvStep = 0, maxSfStep = 0, offNav = 0, nan = 0, worst = 0, steps = 0; const times = [];
let prevHv = [sim.hv.x, sim.hv.z], prevSf = [sim.sf.x, sim.sf.z];
const DT = 0.05;
for (let t = 0; t < 12 * 60; t += DT) {
  for (const id of names) {
    const p = sim.players.get(id);
    if (p.state !== 'alive') continue;
    along[id] = Math.min(world.trailLength - 5, along[id] + pace[id] * DT);
    const q = pointAtDistance(world.trail, world.trailCum, along[id]);
    const talking = id === 'p1' && (t % 40) < 3;
    sim.input(id, { x: q.x, y: world.heightAt(q.x, q.z), z: q.z, yaw: Math.atan2(-Math.sin(q.dir), -Math.cos(q.dir)), pitch: 0, crouch: id === 'p3', sprint: false, flash: id !== 'p3', noise: pace[id] > 0 ? 0.45 : 0, voice: talking ? 0.6 : 0, hidden: id === 'p3' });
    if (talking && (t % 40) < DT) sim.action(id, { a: 'phrase', id: 'v' + Math.floor(t), dur: 1.8 });
  }
  const s0 = performance.now(); sim.step(DT); const el = performance.now() - s0; times.push(el); if (sim.time > 3) worst = Math.max(worst, el); steps++;
  for (const e of sim.drainEvents()) { ev[e.type] = (ev[e.type] || 0) + 1; }
  if (sim.hv.state === 'chase' && sim.director.inDread()) openingChases++;
  hvStates[sim.hv.state] = (hvStates[sim.hv.state] || 0) + 1; sfStates[sim.sf.state] = (sfStates[sim.sf.state] || 0) + 1;
  const dh = Math.hypot(sim.hv.x - prevHv[0], sim.hv.z - prevHv[1]), ds = Math.hypot(sim.sf.x - prevSf[0], sim.sf.z - prevSf[1]);
  if (sim.hv.state !== 'dormant' && sim.time > CONFIG.SESSION.INTRO_TIME + 1) { maxHvStep = Math.max(maxHvStep, dh); if (world.nearestNav(sim.hv.x, sim.hv.z, 2) < 0) offNav++; }
  if (sim.sf.state !== 'dormant' && sim.time > CONFIG.SESSION.INTRO_TIME + 1) maxSfStep = Math.max(maxSfStep, ds);
  prevHv = [sim.hv.x, sim.hv.z]; prevSf = [sim.sf.x, sim.sf.z];
  if (![sim.hv.x, sim.hv.z, sim.sf.x, sim.sf.z].every(Number.isFinite)) nan++;
  if (sim.state === 'lost' || sim.state === 'won') break;
}
const sec = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v * DT)]));
console.log('     HV seconds by state:', sec(hvStates));
console.log('     SF6 seconds by state:', sec(sfStates));
console.log('     events:', ev);
ok(nan === 0, 'no NaN positions');
ok(maxHvStep < Math.max(CONFIG.HV.BURST, CONFIG.HV.RETREAT) * DT * 1.6, `Helium Voice never teleports (max ${maxHvStep.toFixed(2)} m per 50 ms step)`);
ok(maxSfStep < CONFIG.SF.DART * DT * 1.6, `SF6 never teleports (max ${maxSfStep.toFixed(2)} m per step)`);
ok(offNav === 0, 'Helium Voice stays on walkable ground');
ok(openingChases === 0, 'opening dread stays free of chases');
ok((hvStates.stalk || 0) + (hvStates.watch || 0) > 0, 'players outside protected spawn are engaged rather than ignored');
ok((ev.hv_vocal || 0) >= 3 && (ev.hv_vocal || 0) < 60, `vocals are present but sparse (${ev.hv_vocal || 0} in the session)`);
ok((ev.mimic || 0) >= 1, `mimicry happened (${ev.mimic || 0}x) with a talking player`);
times.sort((a, b) => a - b);
const pct = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
const mean = times.reduce((a, b) => a + b, 0) / times.length;
ok(mean < 2 && pct(0.99) < 10, `sim step cost: mean ${mean.toFixed(2)} ms, p99 ${pct(0.99).toFixed(2)} ms, worst ${worst.toFixed(1)} ms (budget 50 ms per 20 Hz tick)`);
ok(worst < 90, `no tick exceeds 90 ms (rare A*/GC spikes)`);
console.log(failures ? `\n${failures} FAILED` : '\nall sim tests passed');
process.exit(failures ? 1 : 0);
