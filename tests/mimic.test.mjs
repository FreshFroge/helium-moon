import test from 'node:test';
import assert from 'node:assert/strict';
import { MimicDirector } from '../shared/sim/mimic.js';

const fixedRng = () => {
  const r = () => 0;
  r.range = (a) => a;
  r.pick = (items) => items[0];
  return r;
};

function fixture() {
  const listener = { id: 'listener', x: 0, y: 0, z: 0, state: 'alive' };
  const friend = { id: 'friend', x: 2, y: 0, z: 0, state: 'alive' };
  const events = [];
  const sim = {
    time: 100, state: 'play', rng: fixedRng(), players: new Map([[listener.id, listener], [friend.id, friend]]),
    playerList: [listener, friend], hv: { x: 10, y: 0, z: 0, target: listener.id, awareness: new Map() },
    director: { chasing: true, onVocal: () => {} }, emit: (e) => events.push(e),
    world: { navWalkable: () => true, heightAt: () => 0, deckAt: () => null,
      lineOfSight: () => 0, sampleGrid: () => 1, trailDistAt: () => 10 },
  };
  return { sim, listener, friend, events, mimic: new MimicDirector(sim) };
}

test('a hunt can throw a consenting friend voice away from the real approach', () => {
  const { sim, listener, friend, events, mimic } = fixture();
  mimic.addPhrase(friend.id, 'v-friend', 1.4);
  sim.time += 3;
  assert.equal(mimic.queueHuntDecoy(listener.id), true);
  sim.time += 0.7; mimic.update(0.05);
  assert.equal(events.length, 1);
  const e = events[0];
  assert.equal(e.type, 'mimic'); assert.equal(e.hunt, true);
  assert.equal(e.listener, listener.id); assert.equal(e.owner, friend.id);
  const realX = sim.hv.x - listener.x, realZ = sim.hv.z - listener.z;
  const fakeX = e.x - listener.x, fakeZ = e.z - listener.z;
  assert.ok(realX * fakeX + realZ * fakeZ < 0, 'decoy is in the wrong direction from Helium Voice');
  assert.equal((mimic.phrases.get(friend.id) || []).length, 0, 'one-use phrase is removed');
});

test('hunt distraction never imitates the hunted player when no friend phrase exists', () => {
  const { listener, mimic } = fixture();
  mimic.addPhrase(listener.id, 'v-self', 1.4);
  assert.equal(mimic.queueHuntDecoy(listener.id), false);
});
