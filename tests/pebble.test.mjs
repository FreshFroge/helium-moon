import test from 'node:test';
import assert from 'node:assert/strict';
import {tracePebble} from '../shared/pebble.js';
import {CONFIG} from '../shared/config.js';
import {World} from '../shared/world.js';
import {GameSim} from '../shared/sim/sim.js';
import {pointAtDistance} from '../shared/math.js';

const flat=()=>({heightAt:()=>0,deckAt:()=>null,waterAt:()=>null,
  circles:[],segs:[],boxes:[],queryColliders(_x,_z,_r,out){
    out.length=0;this.circles.forEach((_,i)=>out.push(i));
    this.segs.forEach((_,i)=>out.push(100000+i));this.boxes.forEach((_,i)=>out.push(200000+i));return out;
  }});

test('ballistic flight lands on actual terrain, water and supported decks with bounded samples',()=>{
  const world=flat(),origin={x:0,y:1.62,z:0};
  const arc=tracePebble(world,origin,0,0);
  assert.ok(arc.hit&&arc.kind==='ground');assert.ok(Math.abs(arc.impact.y-CONFIG.PEBBLE.RADIUS)<.002);
  assert.ok(arc.impact.z<-10&&arc.impact.z>-13&&Math.abs(arc.impact.x)<.001);
  assert.ok(arc.duration>0&&arc.duration<=CONFIG.PEBBLE.MAX_FLIGHT&&arc.flight.length<85);
  for(let i=1;i<arc.flight.length;i++)assert.ok(arc.flight[i][0]>=arc.flight[i-1][0]);
  const aimed=tracePebble(world,origin,-Math.PI/2,.5);
  assert.ok(aimed.impact.x>arc.impact.z*-1.5,'aim changes the server-computed trajectory');
  world.waterAt=()=>.6;assert.ok(Math.abs(tracePebble(world,origin,0,0).impact.y-.635)<.002);
  world.deckAt=()=>.9;assert.ok(Math.abs(tracePebble(world,origin,0,0).impact.y-.935)<.002);
});

test('swept pebbles hit thin walls and trunks instead of passing between ballistic samples',()=>{
  const world=flat(),origin={x:0,y:1.62,z:0};
  world.boxes=[[0,-3,2,.002,0,3]];
  const wall=tracePebble(world,origin,0,0);
  assert.equal(wall.kind,'solid');assert.ok(wall.impact.z>-3&&wall.impact.z<-2.95);
  world.boxes=[];world.circles=[[0,-2,.2]];
  const trunk=tracePebble(world,origin,0,0);
  assert.equal(trunk.kind,'solid');assert.ok(trunk.impact.z>-2&&trunk.impact.z<-1.76);
  world.circles=[];world.segs=[[-2,-4,2,-4,.1,.3]];
  assert.equal(tracePebble(world,origin,0,0).kind,'ground','a high arc clears the finite top of a fallen log');
  assert.equal(tracePebble(world,{...origin,y:.2},0,-.1).kind,'solid','a low arc hits the same log');
});

test('range/time caps expire in the air without inventing a landing and reject nonfinite aim',()=>{
  const world=flat(),origin={x:0,y:200,z:0};
  const range=tracePebble(world,origin,0,0);assert.equal(range.hit,false);assert.equal(range.kind,'range');
  assert.ok(Math.hypot(range.impact.x,range.impact.z)<=CONFIG.PEBBLE.MAX_RANGE);
  const time=tracePebble(world,origin,0,1.45);assert.equal(time.hit,false);assert.equal(time.kind,'time');
  assert.equal(time.duration,CONFIG.PEBBLE.MAX_FLIGHT);
  assert.equal(tracePebble(world,origin,NaN,0),null);assert.equal(tracePebble(world,origin,0,Infinity),null);
});

const base=new World();
function fixture(legacy=false){
  const world=Object.assign(Object.create(base),flat(),{navWalkable:()=>true,isPlayable:()=>true,
    lineOfSight:()=>0,findPath:(x,z,gx,gz)=>[[x,z],[gx,gz]]});
  const sim=new GameSim(world,{seed:41});sim.state='play';sim.time=400;
  sim.director.enter('build');sim.director.update=sim.sf.update=sim.mimic.update=sim.wildlife.update=sim.obj.update=()=>{};
  const p=sim.addPlayer('one','One'),hv=sim.hv,at=pointAtDistance(world.trail,world.trailCum,500);
  Object.assign(p,{x:at.x,z:at.z,y:0,lastX:at.x,lastZ:at.z,flash:false,crouch:true,hidden:true,noise:0,voice:0});
  hv.place(p.x+5,p.z-3);hv.target=p.id;hv.setState('stalk');hv.startChase(p);
  hv.huntHideUntil=sim.time;hv.huntPhase='search';hv.huntContactAt=-999;
  hv.lastSeenChase={x:p.x,z:p.z,t:sim.time-1};
  if(legacy)hv.setState('search',{searchAt:{x:p.x-12,z:p.z-4},searchPts:[[p.x-8,p.z-4]]});
  sim.drainEvents();
  const act=(who=p,extra={})=>sim.action(who.id,{a:'pebble',yaw:0,pitch:0,...extra});
  const tick=seconds=>{for(let i=0;i<Math.ceil(seconds/.05);i++)sim.step(.05);};
  return{sim,p,hv,world,act,tick};
}

test('unlimited pebbles have independent authoritative 20-second cooldowns for co-op players',()=>{
  const {sim,p,act}=fixture();const two=sim.addPlayer('two','Two');
  Object.assign(two,{x:p.x+1,y:0,z:p.z,crouch:true,hidden:true,flash:false});
  act();act(two);assert.equal(sim.pebbles.length,2);
  assert.equal(p.pebbleReadyAt,420);assert.equal(two.pebbleReadyAt,420);
  act();assert.equal(sim.pebbles.length,2);
  assert.ok(sim.drainEvents().some(e=>e.type==='pebble_status'&&e.reason==='cooldown'));
  sim.time=419.999;act();assert.equal(sim.pebbles.length,2);
  sim.time=420;sim.updatePebbles();act();assert.equal(p.pebbleReadyAt,440);
  assert.equal(sim.pebbles.length,1,'a fresh pebble is always available once the cooldown ends');
  const snap=sim.snapshot();assert.equal(snap.pl.find(row=>row[0]===p.id)[12],440);
  assert.equal(snap.pebbles.length,1);assert.ok(snap.pebbles[0].flight.length>2);
});

for(const condition of ['intro','downed','held','covered','paused','stalk','rush','grab','withdrawal'])
test(`pebbles are refused during ${condition} without spending a cooldown`,()=>{
  const {sim,p,hv,world,act}=fixture();
  if(condition==='intro')sim.state='intro';
  else if(condition==='downed')p.state='downed';
  else if(condition==='held')p.heldUntil=sim.time+1;
  else if(condition==='covered')p.covered=true;
  else if(condition==='paused')sim.input(p.id,{paused:true});
  else if(condition==='stalk')hv.huntPhase='stalk';
  else if(condition==='rush'){p.crouch=p.hidden=false;world.lineOfSight=()=>1;hv.huntContactAt=sim.time;}
  else if(condition==='grab')hv.grab={pid:p.id};
  else if(condition==='withdrawal')hv.beginWithdrawal(p);
  act();assert.equal(sim.pebbles.length,0);assert.equal(p.pebbleReadyAt,0);
  assert.ok(sim.drainEvents().some(e=>e.type==='pebble_status'));
});

test('only a real impact redirects search; target memory and hunt/recovery deadlines survive',()=>{
  const {sim,p,hv,act,tick}=fixture(),memory={...hv.lastSeenChase},deadline=hv.huntEndsAt,gate=sim.director.nextChaseAt;
  act(p,{x:9e8,y:9e8,z:9e8,impact:{x:9e8,y:9e8,z:9e8}});
  const pebble=sim.pebbles[0],impact={...pebble.impact};
  assert.ok(Math.hypot(impact.x-p.x,impact.z-p.z)<CONFIG.PEBBLE.MAX_RANGE,'client coordinates do not control landing');
  assert.equal(hv.pebbleDecoy,null,'a throw does not reveal the distraction before it lands');
  p.x+=60;p.lastX=p.x;
  tick(pebble.duration+.05);
  assert.ok(hv.pebbleDecoy);assert.deepEqual(hv.lastSeenChase,memory);
  assert.deepEqual(hv.goal,[impact.x,impact.z]);
  assert.equal(hv.huntEndsAt,deadline);assert.equal(sim.director.nextChaseAt,gate);
  const event=sim.drainEvents().find(e=>e.type==='pebble_impact');
  assert.equal(event.distracted,true);assert.equal(event.kind,'ground');
  assert.deepEqual([event.x,event.y,event.z],[impact.x,impact.y,impact.z]);
});

test('an impact rechecks phase and cannot lure an opening stalk, rush or ended hunt',()=>{
  for(const phase of ['stalk','rush','end']){
    const {sim,p,hv,world,act,tick}=fixture();act();const duration=sim.pebbles[0].duration;
    if(phase==='stalk'){hv.huntPhase='stalk';hv.huntHideUntil=sim.time+10;}
    if(phase==='rush'){p.crouch=p.hidden=false;world.lineOfSight=()=>1;hv.huntContactAt=sim.time;}
    if(phase==='end')hv.finishHunt(p,'timeout');
    tick(duration+.05);
    const event=sim.drainEvents().find(e=>e.type==='pebble_impact');
    assert.equal(event.distracted,false,phase);assert.equal(hv.pebbleDecoy,null,phase);
  }
});

test('clear sight and fresh real footsteps override a pebble without resetting the hunt',()=>{
  for(const evidence of ['sight','sound']){
    const {sim,p,hv,world,act,tick}=fixture();act();tick(sim.pebbles[0].duration+.05);
    assert.ok(hv.pebbleDecoy);const deadline=hv.huntEndsAt;
    if(evidence==='sight'){p.crouch=p.hidden=false;world.lineOfSight=()=>1;hv.lookYaw=Math.atan2(p.x-hv.x,p.z-hv.z);}
    else p.noise=.45;
    tick(.1);assert.equal(hv.pebbleDecoy,null,evidence);assert.equal(hv.huntEndsAt,deadline);
    assert.ok(hv.lastSeenChase.t>=sim.time-.15,evidence);
  }
});

test('legacy search investigates the impact without losing original evidence or staring at the live player',()=>{
  const {sim,p,hv,act,tick}=fixture(true),original={...hv.searchAt};
  act();sim.time+=sim.pebbles[0].duration+.001;sim.updatePebbles();
  hv.awareness.set(p.id,2);tick(.1);
  assert.equal(hv.state,'search','old awareness cannot override the sound with omniscient pursuit');
  assert.ok(hv.pebbleDecoy);assert.deepEqual(hv.searchAt,original);
  assert.deepEqual(hv.goal,[hv.pebbleDecoy.x,hv.pebbleDecoy.z]);
  const toward=Math.atan2(hv.pebbleDecoy.x-hv.x,hv.pebbleDecoy.z-hv.z);
  assert.ok(Math.abs(Math.atan2(Math.sin(hv.lookYaw-toward),Math.cos(hv.lookYaw-toward)))<.001);
});
