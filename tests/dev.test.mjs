// Developer mode (owner, Oct 25): skip the opening dread, invincibility, start a hunt on demand.
//   node tests/dev.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { pointAtDistance } from '../shared/math.js';
import { devHunt } from '../shared/sim/dev.js';

const world = new World({});
function game(dev) {
  const sim = new GameSim(world, { seed: 77 }); sim.addPlayer('p1', 'p1'); sim.dev = dev;
  const q = pointAtDistance(world.trail, world.trailCum, 300), p = sim.players.get('p1');
  p.x = p.lastX = q.x; p.z = p.lastZ = q.z; p.y = world.heightAt(q.x, q.z);
  for (let i = 0; i < (CONFIG.SESSION.INTRO_TIME + 1) / 0.05; i++) sim.step(0.05);
  return { sim, p };
}

test('without developer mode the opening dread is on', () => {
  const { sim } = game(null); assert.equal(sim.director.inDread(), true);
});
test('skip dread: no dread right after the intro', () => {
  const { sim } = game({ skipDread: true }); assert.equal(sim.director.inDread(), false);
});
test('test a hunt: a real hunt starts on the player', () => {
  const { sim } = game({ skipDread: true });
  assert.equal(devHunt(sim, 'p1'), true);
  assert.equal(sim.hv.state, 'chase'); assert.equal(sim.director.chasing, true);
});
test('a hunt is refused inside the protected spawn area', () => {
  const sim = new GameSim(world, { seed: 77 }); sim.addPlayer('p1', 'p1'); sim.dev = { skipDread: true };
  for (let i = 0; i < 220; i++) sim.step(0.05);
  assert.equal(typeof devHunt(sim, 'p1'), 'string');
});
test('invincible: hits register but do no damage', () => {
  const { sim, p } = game({ invincible: true });
  sim.damagePlayer(p, 'hv', sim.hv);
  assert.equal(p.health, CONFIG.PLAYER.MAX_HEALTH);
  assert.ok(sim.drainEvents().some((e) => e.type === 'hit' && e.dev));
});
