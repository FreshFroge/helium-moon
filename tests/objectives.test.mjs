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
    for (const item of [...sim.obj.stations, ...sim.obj.items.filter(i => ['fuel', 'fuse','crank'].includes(i.kind))]) {
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
    for (const id of ['fuel', 'fuse','crank']) {
      const item = sim.obj.items.find(i => i.id === id);
      Object.assign(player, { x: item.x, z: item.z });
      sim.action(player.id, { a: 'pickup', id });
    }
    for (const station of sim.obj.stations) {
      const p = approach(station);
      assert.ok(p, `${station.where}: a real collision-clear approach must exist`);
      Object.assign(player, p);
      if(station.action==='dial'){
        for(let i=0;i<8&&!station.done;i++){sim.action(player.id,{a:'dial',id:station.id});sim.step(.4);}
        assert.equal(station.done,true,`seed ${seed}: aerial aligns from its accessible controls`);
        continue;
      }
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

test('the far-bank aerial requires its recovered handwheel and deliberate persistent compass turns',()=>{
  const sim=new GameSim(world,{seed:211}),p=sim.addPlayer('p','Visitor');
  const aerial=sim.obj.stations.find(s=>s.id==='uplink'),mast=sim.obj.stations.find(s=>s.id==='mast');
  for(const id of ['gen','relay'])sim.obj.stations.find(s=>s.id===id).done=true;
  assert.equal(sim.obj.canUse(mast),false,'power alone cannot bypass the far-bank objective');
  Object.assign(p,approach(aerial));
  assert.equal(sim.obj.turn(p,'uplink'),false,'missing handwheel blocks the controls');
  const item=sim.obj.items.find(i=>i.id==='crank');Object.assign(p,{x:item.x,y:item.y,z:item.z});
  assert.equal(sim.obj.pickup(p,'crank'),true);
  Object.assign(p,approach(aerial),{use:'uplink'});
  const initial=aerial.dial;sim.obj.update(90);
  assert.equal(aerial.dial,initial,'holding repair input cannot turn a compass control');
  assert.equal(sim.obj.turn(p,'uplink'),true);
  assert.equal(aerial.done,false,'every starting setting requires multiple deliberate turns');
  const saved=aerial.dial;p.x+=100;sim.time+=90;sim.obj.update(90);
  assert.equal(aerial.dial,saved,'leaving to hide does not reset the bearing');
  Object.assign(p,approach(aerial));
  for(let i=0;i<8&&!aerial.done;i++){sim.time+=.4;assert.ok(sim.obj.turn(p,'uplink'));}
  assert.ok(aerial.done && sim.obj.canUse(mast));
  const finished=aerial.dial;sim.time+=1;assert.equal(sim.obj.turn(p,'uplink'),false);
  assert.equal(aerial.dial,finished,'a completed aerial stays latched');
  assert.ok(sim.obj.memoText.includes(aerial.targetBearing) && sim.obj.memoText.includes('River Maintenance Crossing'));
});

test('the aerial rejects remote, held, downed, covered and wall-occluded interactions',()=>{
  for(const condition of ['remote','held','downed','covered','wall']){
    const sim=new GameSim(world,{seed:211}),p=sim.addPlayer('p','Visitor'),s=sim.obj.stations.find(s=>s.id==='uplink');
    sim.obj.team.crank=true;Object.assign(p,approach(s));
    if(condition==='remote')p.x+=50;
    if(condition==='held')p.heldUntil=sim.time+5;
    if(condition==='downed')p.state='downed';
    if(condition==='covered')p.covered=true;
    if(condition==='wall'){const blocked=Object.create(world);blocked.lineOfSight=()=>0;sim.obj.world=blocked;}
    const before=s.dial;assert.equal(sim.obj.turn(p,'uplink'),false,condition);assert.equal(s.dial,before);
  }
});

test('simultaneous teammates share one rate-limited authoritative aerial setting',()=>{
  const sim=new GameSim(world,{seed:211}),s=sim.obj.stations.find(s=>s.id==='uplink');
  const p=sim.addPlayer('p','Lead'),q=sim.addPlayer('q','Helper');
  sim.obj.team.crank=true;Object.assign(p,approach(s));Object.assign(q,approach(s));
  const initial=s.dial;assert.ok(sim.obj.turn(p,'uplink'));assert.equal(sim.obj.turn(q,'uplink'),false);
  assert.equal(s.dial,(initial+1)%8,'simultaneous actions cannot skip a setting');
  assert.equal(sim.obj.snapshot().st.find(s=>s[0]==='uplink')[3],s.dial);
  sim.time+=.4;assert.ok(sim.obj.turn(q,'uplink'),'another teammate can take over after the shared click');
});
