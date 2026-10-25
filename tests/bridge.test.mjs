// The slough must remain under the timber bridge, and the visible approaches
// must agree with the same walkable surfaces used by players and creature AI.
import assert from 'node:assert/strict';
import test from 'node:test';
import { World } from '../shared/world.js';
import { CONFIG } from '../shared/config.js';
import { groundAt, moveCharacter, supportHeight } from '../shared/physics.js';
import { cumulativeLengths, nearestOnPolyline } from '../shared/math.js';

const world = new World();
const bridge = world.structures.find((o) => o.type === 'footbridge');
const at = (along, across = 0) => ({
  x: bridge.x + Math.sin(bridge.rot) * along + Math.cos(bridge.rot) * across,
  z: bridge.z + Math.cos(bridge.rot) * along - Math.sin(bridge.rot) * across,
});

test('footbridge spans a real wet channel at the existing trail crossing', () => {
  const channel = world.sloughs.find((slough) => slough.bridge);
  assert.ok(channel, 'bridge channel is identified');
  assert.ok(world._polyDist(channel.pts, bridge.x, bridge.z) < 1e-6, 'channel passes through the bridge center');
  assert.ok(world.trailInfo(bridge.x, bridge.z).d < 1e-6, 'original trail remains under the bridge');
  for (const along of [-2, 0, 2]) {
    const p = at(along);
    const water = world.waterAt(p.x, p.z);
    assert.notEqual(water, null, `water under span at ${along} m`);
    assert.ok(water - world.heightAt(p.x, p.z) > 0.5, 'channel has depth rather than a dirt-covered surface');
    assert.ok(bridge.deckY - water > 0.5, 'deck is safely above the water');
    assert.equal(supportHeight(world, p.x, p.z, bridge.deckY), bridge.deckY, 'collision is on the plank top');
  }
});

test('both timber approaches meet the bank and deck without invisible steps', () => {
  const end = bridge.length / 2 + bridge.rampLength;
  for (const side of [-1, 1]) {
    const bank = at(side * end);
    const ramp = at(side * (end - 0.001));
    const join = at(side * (bridge.length / 2 + 0.001));
    assert.ok(Math.abs(world.deckAt(ramp.x, ramp.z) - world.heightAt(bank.x, bank.z)) < 0.05, 'ramp meets existing bank');
    assert.ok(Math.abs(world.deckAt(join.x, join.z) - bridge.deckY) < 0.001, 'ramp meets the flat span');
    assert.equal(world.deckAt(at(side * (end + 0.1)).x, at(side * (end + 0.1)).z), null, 'walkable deck does not extend beyond visible approach');
  }
});

test('player collision crosses the whole bridge both ways, including trail shoulders', () => {
  const end = bridge.length / 2 + bridge.rampLength + 1;
  for (const across of [-0.7, 0, 0.7]) for (const direction of [-1, 1]) {
    let p = at(-direction * end, across);
    p.y = supportHeight(world, p.x, p.z, 10);
    for (let along = -end + 0.1; along <= end; along += 0.1) {
      const target = at(direction * along, across);
      const next = moveCharacter(world, p, target.x - p.x, target.z - p.z, CONFIG.PLAYER.RADIUS, { boundary: true });
      assert.ok(Math.hypot(next.x - target.x, next.z - target.z) < 0.001, 'bridge cannot strand the player on water or a bank');
      const y = supportHeight(world, next.x, next.z, p.y);
      assert.ok(Math.abs(y - p.y) < CONFIG.PLAYER.STEP_HEIGHT, 'approach height stays within a walkable step');
      p = { ...next, y };
    }
  }
});

test('creature navigation can traverse the deck despite deep water below it', () => {
  const end = bridge.length / 2 + bridge.rampLength + 1;
  const a = at(-end), b = at(end);
  assert.ok(world.navWalkable(bridge.x, bridge.z), 'deck cells are traversable');
  const route = world.findPath(a.x, a.z, b.x, b.z);
  assert.ok(route && route.length > 1, 'a route joins the two banks');
  assert.ok(nearestOnPolyline(route, cumulativeLengths(route), bridge.x, bridge.z).d < 1.3, 'route uses the bridge');
  for (const [start, endPoint] of [[a, b], [b, a]]) {
    const path = world.findPath(start.x, start.z, endPoint.x, endPoint.z);
    let p = { ...start, y: groundAt(world, start.x, start.z) };
    for (const [x, z] of path) {
      for (let step = 0; step < 500; step++) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < 0.15) break;
        const next = moveCharacter(world, p, (x - p.x) / d * Math.min(0.1, d), (z - p.z) / d * Math.min(0.1, d), 0.25, { nav: true, slope: false, step: 0.5 });
        assert.ok(Math.hypot(next.x - p.x, next.z - p.z) > 0.01, 'creature follows the route without getting stranded over water');
        p = { ...next, y: groundAt(world, next.x, next.z) };
      }
    }
    assert.ok(Math.hypot(p.x - endPoint.x, p.z - endPoint.z) < 0.15, 'creature reaches the opposite bank');
  }
});
