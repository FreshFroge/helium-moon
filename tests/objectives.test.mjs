// Navigation paths alone miss equipment hidden inside solid buildings.
import assert from 'node:assert/strict';
import test from 'node:test';
import { World } from '../shared/world.js';
import { GameSim } from '../shared/sim/sim.js';
import { CONFIG } from '../shared/config.js';
import { groundAt, moveCharacter, waterDepthAt } from '../shared/physics.js';

const world = new World();
const layouts = new Map();

test('randomized objectives and required pickups stay outside solid building interiors', () => {
  for (let seed = 1; seed <= 64; seed++) {
    const sim = new GameSim(world, { seed });
    const key = sim.obj.stations.map(s => s.where).join('/');
    if (!layouts.has(key)) layouts.set(key, seed);
    for (const item of [...sim.obj.stations, ...sim.obj.items.filter(i => ['fuel', 'fuse'].includes(i.kind))]) {
      assert.ok(waterDepthAt(world, item.x, item.z) <= CONFIG.DEEP_WATER || world.deckAt(item.x, item.z) !== null,
        `seed ${seed}: ${item.id} must not be stranded in impassable deep water`);
      for (const [x, z, hx, hz, rot, top] of world.boxes) {
        if (top - groundAt(world, x, z) < 2.5) continue;
        const dx = item.x - x, dz = item.z - z;
        const lx = dx * Math.cos(rot) - dz * Math.sin(rot);
        const lz = dx * Math.sin(rot) + dz * Math.cos(rot);
        assert.ok(Math.abs(lx) >= hx || Math.abs(lz) >= hz,
          `seed ${seed}: ${item.id} must be visible outside solid walls`);
      }
    }
  }
  assert.equal(layouts.size, 8, 'both generator locations and all four relay locations execute');
});

function approach(station) {
  for (const radius of [1.2, 1.7, 2.1]) for (let k = 0; k < 24; k++) {
    const a = k * Math.PI / 12, dx = Math.cos(a), dz = Math.sin(a);
    let p = { x: station.x + dx * (radius + 3), z: station.z + dz * (radius + 3) };
    p.y = groundAt(world, p.x, p.z);
    let clear = true;
    for (let n = 1; n <= 30; n++) {
      const x = station.x + dx * (radius + 3 - n / 10);
      const z = station.z + dz * (radius + 3 - n / 10);
      const q = moveCharacter(world, p, x - p.x, z - p.z, CONFIG.PLAYER.RADIUS, { boundary: true });
      if (Math.hypot(q.x - x, q.z - z) > 0.01) { clear = false; break; }
      p = { ...q, y: groundAt(world, q.x, q.z) };
    }
    if (!clear) continue;
    if (world.lineOfSight(p.x, p.y + 1.5, p.z, station.x, station.y + 0.6, station.z, { brushK: 0 }) < 0.5) continue;
    return p;
  }
  return null;
}

test('every station variant has a visible collision-clear approach and completes repair', () => {
  for (const seed of layouts.values()) {
    const sim = new GameSim(world, { seed });
    const player = sim.addPlayer('tester', 'Tester');
    for (const actor of [sim.hv, sim.sf, sim.director, sim.mimic]) actor.update = () => {};
    for (const id of ['fuel', 'fuse']) {
      const item = sim.obj.items.find(i => i.id === id);
      Object.assign(player, { x: item.x, z: item.z });
      sim.action(player.id, { a: 'pickup', id });
    }
    for (const station of sim.obj.stations) {
      const p = approach(station);
      assert.ok(p, `${station.where}: a real collision-clear approach must exist`);
      Object.assign(player, p);
      sim.input(player.id, { ...p, use: station.id });
      for (let t = 0; t < station.hold + 0.25; t += 0.05) sim.step(0.05);
      assert.equal(station.done, true, `seed ${seed}: ${station.id} repair completes from the accessible side`);
    }
    assert.equal(sim.obj.extractOpen, true);
  }
});

test('supplies always have truthful landmark clues in the session briefing',()=>{
  const fuelSites=new Set(),fuseSites=new Set();
  for(let seed=1;seed<=64;seed++){
    const sim=new GameSim(world,{seed}),layout=sim.obj.layout();
    for(const id of ['fuel','fuse']){
      const it=layout.items.find(i=>i.id===id),hint=layout.supplyHints[id];
      assert.ok(it.label && it.label!=='trail' && it.label!=='kiosk',`seed ${seed}: ${id} is stored at a recognizable landmark`);
      assert.ok(hint && hint!=='beside the marked trail');
      assert.ok(layout.memoText.includes(hint),'the in-session memo gives the same location as the map register');
      (id==='fuel'?fuelSites:fuseSites).add(it.label);
    }
    assert.equal(layout.items.filter(i=>i.label==='kiosk').length,0,'only the briefing occupies the kiosk');
  }
  assert.ok(fuelSites.size>=3 && fuseSites.size>=3,'locations remain replayable');
});

function workingTeam(count=1){
  const sim=new GameSim(world,{seed:42});sim.time=400;sim.state='play';sim.obj.team.fuel=true;
  const station=sim.obj.stations[0],position=approach(station);
  assert.ok(position);
  for(let i=0;i<count;i++)Object.assign(sim.addPlayer('p'+i,'Worker'),position,{use:station.id});
  return{sim,station};
}

test('completed repair steps remain saved through a long hiding interruption',()=>{
  const {sim,station}=workingTeam();
  sim.obj.update(station.hold*.45);
  assert.equal(station.checkpoint,1/3);assert.ok(station.prog>1/3);
  sim.playerList[0].use=null;sim.obj.update(90);
  assert.equal(station.prog,1/3,'unfinished work recedes only to the last latched step');
  sim.playerList[0].use=station.id;sim.obj.update(station.hold*.7);
  assert.equal(station.done,true,'returning to the repair resumes from the checkpoint');
  assert.ok(sim.drainEvents().some(e=>e.type==='objective_step'&&e.step===1));
});

test('a nearby teammate helps the repair, while remote players cannot contribute',()=>{
  const solo=workingTeam(),team=workingTeam(2);
  solo.sim.obj.update(solo.station.hold*.8);team.sim.obj.update(team.station.hold*.8);
  assert.equal(solo.station.done,false);assert.equal(team.station.done,true);
  const remote=workingTeam(2);remote.sim.playerList[1].x+=20;
  remote.sim.obj.update(remote.station.hold*.8);
  assert.equal(remote.station.done,false,'a remote held-E request is not a worker');
});

test('held, covered and wall-occluded players cannot repair equipment',()=>{
  for(const condition of ['held','covered','wall']){
    const {sim,station}=workingTeam();
    if(condition==='held')sim.playerList[0].heldUntil=sim.time+5;
    if(condition==='covered')sim.playerList[0].covered=true;
    if(condition==='wall'){const blocked=Object.create(world);blocked.lineOfSight=()=>0;sim.obj.world=blocked;}
    sim.obj.update(station.hold+1);
    assert.equal(station.prog,0,condition);
  }
});
