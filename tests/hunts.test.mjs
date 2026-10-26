// Hunt start rules (owner, Oct 25 2026; docs/HUNT_PLAYTESTS.md):
// a hunt starts only within CONFIG.HV.HUNT_START_RANGE; farther out he closes in first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { moveCharacter, waterDepthAt } from '../shared/physics.js';
const MAXH = CONFIG.PLAYER.MAX_HEALTH;

const world = new World();
const R = CONFIG.HV.HUNT_START_RANGE;

function fixture(separation, seed = 7) {
  const sim = new GameSim(world, { seed });
  sim.state = 'play'; sim.time = 400; /* after intro + dread */
  sim.director.update = () => {}; sim.director.enter('build'); sim.sf.update = () => {}; sim.mimic.update = () => {};
  const p = sim.addPlayer('one', 'One'), hv = sim.hv;
  const at = pointAtDistance(world.trail, world.trailCum, 500), to = pointAtDistance(world.trail, world.trailCum, 500 + separation);
  Object.assign(p, { x: to.x, z: to.z, y: world.heightAt(to.x, to.z), flash: true, pitch: 0, viewFov: 75, viewAspect: 16 / 9 });
  p.yaw = Math.atan2(at.x - p.x, at.z - p.z);   // facing away from him (camera looks down -Z)
  hv.place(at.x, at.z); hv.yaw = hv.lookYaw = Math.atan2(p.x - hv.x, p.z - hv.z);
  hv.target = p.id; hv.awareness.set(p.id, 2); hv.spotted.add(p.id); hv.setState('stalk');
  return { sim, p, hv };
}

test(`a hunt requested from far away does not start: he closes in first`, () => {
  const { sim, p, hv } = fixture(70);
  assert.ok(hv.dist(p) > R);
  assert.equal(hv.startChase(p), false);
  assert.equal(hv.state, 'stalk');
  assert.equal(sim.director.chasing, false, 'no hunt (and no hum) yet');
  assert.equal(hv.closingOn?.pid, p.id);
});

test(`after closing in, the hunt commits inside ${R} m`, () => {
  for (const seed of [7, 8, 9]) {
    const { sim, p, hv } = fixture(70, seed);
    hv.startChase(p);
    let startedAt = null;
    for (let t = 0; t < 40 && startedAt == null; t += 0.05) {
      sim.step(0.05);
      for (const e of sim.drainEvents()) if (e.type === 'chase' && e.on) startedAt = hv.dist(p);
    }
    assert.ok(startedAt != null, `seed ${seed}: he reached the player and committed within 40 s`);
    assert.ok(startedAt <= R + 0.5, `seed ${seed}: committed at ${startedAt?.toFixed(1)} m (<= ${R})`);
  }
});

test('a hunt requested inside the range starts immediately', () => {
  const { sim, p, hv } = fixture(20);
  hv.startChase(p);
  assert.equal(hv.state, 'chase');
  assert.equal(sim.director.chasing, true);
});

test('hunts sample bounded changes in pursuit pace and unseen cutoff timing', () => {
  const paces = [], cutoffs = [], intervals = [];
  for (let seed = 20; seed < 28; seed++) {
    const { sim, p, hv } = fixture(20, seed);
    hv.startChase(p);
    paces.push(hv.huntPace); cutoffs.push(hv.huntCutMul); intervals.push(hv.huntPaceAt - sim.time);
    assert.ok(hv.huntPace >= CONFIG.HV.HUNT_PACE[0] && hv.huntPace <= CONFIG.HV.HUNT_PACE[1]);
    assert.ok(hv.huntCutMul >= CONFIG.HV.HUNT_CUTOFF_JITTER[0] && hv.huntCutMul <= CONFIG.HV.HUNT_CUTOFF_JITTER[1]);
    assert.ok(hv.huntPaceAt - sim.time >= CONFIG.HV.HUNT_PACE_INTERVAL[0]
      && hv.huntPaceAt - sim.time <= CONFIG.HV.HUNT_PACE_INTERVAL[1]);
  }
  assert.ok(Math.max(...paces)-Math.min(...paces)>.12,'pursuit cadence varies across hunts');
  assert.ok(Math.max(...cutoffs)-Math.min(...cutoffs)>.25,'cutoff timing varies across hunts');
  assert.ok(Math.max(...intervals)-Math.min(...intervals)>.5,'cadence duration varies across hunts');
});

test('a hunt gives a hiding window, then does not circle within twelve to fifteen feet before attacking',()=>{
  const {sim,p,hv}=fixture(4.2,31);p.flash=true;
  hv.startChase(p);
  const opening=hv.huntHideUntil-sim.time;
  for(let t=0;t<opening-.1;t+=.05)sim.step(.05);
  assert.equal(p.health,MAXH,'the opening window gives a player time to hide');
  for(let t=0;t<12&&p.health===MAXH;t+=.05)sim.step(.05);
  assert.ok(p.health<MAXH,'after the hiding window, a close hunt commits instead of orbiting');
  assert.equal(hv.huntProwlT,undefined,'no close-range prowl timer remains');
});

test('fail-safe: a hunt on a target he cannot reach ends instead of running forever', () => {
  // synthetic unreachable target: deep river water (real players are blocked there too; this
  // guards any other unreachable spot, e.g. future props or nav gaps)
  let spot = null;
  for (let a = 220; a < 270 && !spot; a += 7) for (const side of [6, 10, 14, 18]) {
    const q = pointAtDistance(world.trail, world.trailCum, a);
    const x = q.x + Math.cos(q.dir) * side, z = q.z - Math.sin(q.dir) * side;
    if (!world.navWalkable(x, z) && world.isPlayable(x, z) && world.waterAt(x, z) !== null) { spot = { a, x, z }; break; }
  }
  assert.ok(spot, 'fixture: a wadeable river spot exists');
  const { sim, p, hv } = fixture(20, 3);
  Object.assign(p, { x: spot.x, z: spot.z, y: world.heightAt(spot.x, spot.z) });
  const at = pointAtDistance(world.trail, world.trailCum, spot.a - 20); hv.place(at.x, at.z);
  hv.startChase(p);
  const deadline=hv.huntEndsAt;
  let ended = null;
  for (let t = 0; t < 60 && ended == null; t += 0.05) { sim.step(0.05); for (const e of sim.drainEvents()) if (e.type === "chase" && !e.on) ended = t; }
  assert.ok(ended != null && sim.time<=deadline+.1, `unreachable hunt respects its shared deadline (ended at ${ended?.toFixed(1)} s)`);
  assert.equal(sim.director.chasing, false);
  assert.equal(p.health,MAXH,'an unreachable target receives no grab damage');
});

test('a moving player can outlast a hunt without extending its deadline', () => {
  for (const seed of [3, 4, 5]) {
    const { sim, p, hv } = fixture(30, seed);
    hv.startChase(p);
    const deadline=hv.huntEndsAt;
    let along = 530, stamina = CONFIG.PLAYER.STAMINA_MAX, ended = null;
    for (let t = 0; t < 120 && ended == null; t += 0.05) {
      const sprint = stamina > 0.2; stamina -= sprint ? 0.05 : -0.05 * CONFIG.PLAYER.STAMINA_REGEN;
      along += (sprint ? CONFIG.PLAYER.SPRINT : CONFIG.PLAYER.WALK) * 0.05;
      const q = pointAtDistance(world.trail, world.trailCum, along), back = pointAtDistance(world.trail, world.trailCum, along - 3);
      Object.assign(p, { x: q.x, z: q.z, y: world.heightAt(q.x, q.z), lastX: q.x, lastZ: q.z, sprint, noise: sprint ? 1 : 0.45 });
      p.yaw = Math.atan2(back.x - q.x, back.z - q.z);   // facing where they run (away from him)
      sim.step(0.05);
      for (const e of sim.drainEvents()) if (e.type === 'chase' && !e.on) ended = t;
    }
    assert.ok(ended != null, `seed ${seed}: the hunt ends`);
    assert.ok(sim.time<=deadline+.1,`seed ${seed}: pursuit never runs past its deadline`);
  }
});

test('crouched players can use real trunks for cover, and light or stepping out exposes them', () => {
  let checked=0;
  for(const tree of world.trees) {
    if(tree.trunkR<.35 || tree.height<4)continue;
    const {sim,p,hv}=fixture(20,3);
    const offset=(tree.collisionR||tree.trunkR)+CONFIG.PLAYER.RADIUS+.02;
    const px=tree.x,pz=tree.z+offset,hx=tree.x,hz=tree.z-20;
    if(!world.isPlayable(px,pz)||!world.navWalkable(hx,hz)||!hv.outsideSpawn(px,pz)||!hv.outsideSpawn(hx,hz))continue;
    Object.assign(p,{x:px,z:pz,y:world.heightAt(px,pz),lastX:px,lastZ:pz,flash:false,crouch:true,noise:0,sprint:false,moveSpeed:0});
    hv.place(hx,hz);hv.observers=[];
    p.x+=3;const otherCover=hv.trunkShield(p);p.x-=3;
    if(otherCover)continue; // choose a side-step without a second nearby trunk
    assert.equal(hv.trunkShield(p),true,'a solid trunk between player and Helium provides cover');
    assert.equal(hv.hidden(p),true,'crouched, still and unlit behind the trunk is hidden');
    p.flash=true;assert.equal(hv.hidden(p),false,'a lighter defeats concealment');
    p.flash=false;p.x+=3;
    assert.equal(hv.trunkShield(p),false,'stepping around the trunk removes its shield');
    if(++checked===5)break;
  }
  assert.equal(checked,5,'five real trees exercised');
});
