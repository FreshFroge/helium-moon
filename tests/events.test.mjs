// Semantic event IDs must survive transport so clients can locate the picked-up
// item or completed station. Event ordering/audio variation uses a separate seq.
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';

const sim = new GameSim(new World({}), { seed: 4242 });
const player = sim.addPlayer('p1', 'Visitor');

for (const id of ['fuel', 'fuse','crank']) {
  const item = sim.obj.items.find((item) => item.id === id);
  player.x = item.x; player.z = item.z;
  sim.action(player.id, { a: 'pickup', id });
}
const pickups = sim.drainEvents();
assert.deepEqual(pickups.map((event) => [event.type, event.id, event.kind, event.pid]), [
  ['pickup', 'fuel', 'fuel', player.id],
  ['pickup', 'fuse', 'fuse', player.id],
  ['pickup','crank','crank',player.id],
]);
assert.equal(sim.obj.team.fuel, true);
assert.equal(sim.obj.team.fuse, true);
console.log('  ok  pickups retain item IDs and player attribution');

for (const station of sim.obj.stations) {
  player.x = station.x; player.z = station.z; player.use = station.id;
  player.y=station.y;
  if(station.action==='dial'){
    for(let i=0;i<8&&!station.done;i++){sim.action(player.id,{a:'dial',id:station.id});sim.time+=.4;}
  }
  sim.obj.update(station.hold + 0.001);
  assert.equal(station.done, true, `${station.id} completes`);
}
const objectives = sim.drainEvents();
assert.deepEqual(objectives.filter((event) => event.type === 'objective').map((event) => event.id), ['gen', 'relay','uplink', 'mast']);
assert.equal(sim.obj.extractOpen, true);
assert.equal(objectives.at(-1).type, 'extract_open');
console.log('  ok  completed stations retain IDs used by client messages and audio');

sim.addGas(player.x, player.y, player.z);
const gas = sim.drainEvents();
assert.equal(gas[0].type, 'gas');
const events = [...pickups, ...objectives, ...gas];
assert.deepEqual(events.map((event) => event.seq), events.map((_, index) => index + 1));
assert.ok(events.every((event) => Number.isFinite(event.t)));
assert.equal(gas[0].id, undefined, 'events without a semantic ID do not acquire a conflicting ID');
console.log('  ok  separate event sequences remain ordered for transport and audio seeds');
console.log('\nall event tests passed');
