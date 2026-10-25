// "He learns your escapes" (docs/SCARE_RESEARCH.md C2).
//  - flashing him off is remembered per player and fades with LEARN_HALF_LIFE;
//  - once a player has flashed him off repeatedly, he will not commit a hunt on them while
//    they are facing him (he waits for them to turn, up to LEARN_WAIT s), but does commit
//    once they look away;
//  - memories are per player: a teammate who never used the trick is hunted normally.
//   node tests/learn.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';

const world = new World({}); const C = CONFIG.HV, DT = 0.05;

function setup() {
  const sim = new GameSim(world, { seed: 4242 });
  sim.addPlayer('a', 'a'); sim.addPlayer('b', 'b');
  sim.state = 'play'; sim.time = 900;          // well past the dread
  sim.sf.update = () => {}; sim.mimic.update = () => {}; sim.wildlife.update = () => {};
  const q = pointAtDistance(world.trail, world.trailCum, 800);
  for (const p of sim.playerList) { p.x = q.x; p.z = q.z; p.y = world.heightAt(q.x, q.z); }
  return { sim, q };
}

test('memory is per player and decays', () => {
  const { sim } = setup(); const hv = sim.hv;
  hv.noteTactic('a', 'flash'); hv.noteTactic('a', 'flash');
  assert.ok(hv.tactic('a', 'flash') > 1.9);
  assert.equal(hv.tactic('b', 'flash'), 0);
  assert.ok(hv.counters('a', 'flash')); assert.ok(!hv.counters('b', 'flash'));
  sim.time += C.LEARN_HALF_LIFE;
  assert.ok(Math.abs(hv.tactic('a', 'flash') - 1) < 0.05, `${hv.tactic('a', 'flash')}`);
});

function closeIn(sim, pid, facing) {
  const hv = sim.hv, p = sim.players.get(pid);
  // him 20 m away, inside the hunt start range, closing in on p
  const x = p.x + 20, z = p.z; hv.place(x, z);
  p.yaw = facing ? Math.atan2(-(x - p.x), -(z - p.z)) : Math.atan2(x - p.x, z - p.z);
  hv.target = pid; hv.setState('stalk'); hv.closingOn = { pid, t: sim.time };
  sim.director.allowChase = () => true;
  // isolate the learned counter from the normal 'seen -> slip away' reaction
  const perceive = hv.perceive.bind(hv); hv.perceive = (dt) => { perceive(dt); hv.observers = []; hv.litBy = null; };
  let started = false;
  for (let i = 0; i < 40 && !started; i++) { sim.step(DT); started = hv.state === 'chase'; sim.drainEvents(); }
  return started;
}

test('a player who keeps flashing him off is not hunted while facing him', () => {
  const { sim } = setup(); sim.hv.noteTactic('a', 'flash'); sim.hv.noteTactic('a', 'flash');
  assert.equal(closeIn(sim, 'a', true), false);
});
test('...but is hunted as soon as they look away', () => {
  const { sim } = setup(); sim.hv.noteTactic('a', 'flash'); sim.hv.noteTactic('a', 'flash');
  assert.equal(closeIn(sim, 'a', false), true);
});
test('a teammate who never used the trick is hunted normally while facing him', () => {
  const { sim } = setup(); sim.hv.noteTactic('a', 'flash'); sim.hv.noteTactic('a', 'flash');
  assert.equal(closeIn(sim, 'b', true), true);
});
