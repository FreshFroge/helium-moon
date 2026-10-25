import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../shared/world.js';
import { HeliumVoiceAI } from '../shared/sim/heliumVoice.js';
import { BinaryHeap, makeRng, pointAtDistance } from '../shared/math.js';

test('weighted navigation preserves its cover detour during path simplification', () => {
  const world = Object.create(World.prototype);
  Object.assign(world, {gw:21,gh:21,minX:0,minZ:0,navCost:new Float32Array(441).fill(1),
    _navHeap:new BinaryHeap(),_navG:new Float32Array(441),_navFrom:new Int32Array(441),
    _navStamp:new Uint32Array(441),_navSeq:1});
  const exposed = (x,z) => x>=12 && x<=28 && z>=10 && z<=30;
  const path = world.findPath(2,20,38,20,{costFn:i=>exposed(...world.cellPos(i))?80:0});
  assert.ok(path.length>2,'the exposed straight shortcut is not restored');
  for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*5);
    for(let j=0;j<=n;j++) assert.equal(exposed(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n),false);
  }
  assert.equal(world.findPath(2,20,38,20).length,2,'ordinary open routes still simplify');
});

function fixture() {
  const player={id:'one',x:0,y:0,z:0,yaw:0,state:'alive',flash:false};
  const world={gCover:[],navWalkable:()=>true,trailDistAt:()=>10,sampleGrid:()=>0.8,
    heightAt:()=>0,deckAt:()=>null,lineOfSight:()=>0};
  const sim={world,playerList:[player],players:new Map([[player.id,player]]),rng:makeRng(42),time:100,director:{}};
  const hv=new HeliumVoiceAI(sim);hv.target=player.id;
  return {hv,sim,world,player};
}

test('observation spots need real occlusion from every active teammate', () => {
  const {hv,sim,world,player}=fixture();
  world.lineOfSight=()=>1;
  assert.equal(hv.observationSpot(player),null,'dense vegetation scores do not excuse clear sightlines');
  world.lineOfSight=()=>0.1;
  assert.equal(hv.observationSpot(player),null,'translucent brush is not full concealment');
  world.lineOfSight=(_x,_y,_z,x)=>x>0.2?1:0;
  assert.equal(hv.concealedAt(0,10),false,'an exposed shoulder invalidates a center-occluded hiding spot');
  const other={...player,id:'two',x:5};sim.playerList.push(other);
  world.lineOfSight=ax=>ax===5?1:0;
  assert.equal(hv.observationSpot(player),null,'cover from one player is not cover from a teammate');
  other.state='dead';
  assert.ok(hv.observationSpot(player),'concealed spots remain available when the extra observer is inactive');
});

test('an exposed watcher starts moving back to cover instead of holding a pose', () => {
  const {hv,world,player}=fixture();
  world.lineOfSight=()=>1;
  hv.setState('watch');hv.perceive=()=>{hv.observers=[];hv.litBy=null;};hv.vocals=()=>{};
  let retreat=false;hv.retreatFrom=p=>{assert.equal(p,player);retreat=true;hv.setState('retreat');};
  hv.update(0.05);
  assert.equal(retreat,true);assert.equal(hv.state,'retreat');
  assert.deepEqual([hv.x,hv.z],[0,0],'no teleport was used');
});

test('failed reveal travel cannot become an exposed stationary reveal', () => {
  const {hv,player}=fixture();
  hv.observers=[];hv.reveal={pid:player.id,kind:'watcher',phase:'approach',spot:[80,0]};
  hv.followPath=()=>true;let retreat=false;hv.retreatFrom=()=>{retreat=true;};
  hv.updateReveal(0.05);
  assert.equal(hv.reveal,null);assert.equal(retreat,true);
});

test('the real refuge supplies concealed observation positions for cooperative stalking', () => {
  const world=new World(),q=pointAtDistance(world.trail,world.trailCum,500);
  const player={id:'one',x:q.x,y:world.heightAt(q.x,q.z),z:q.z,yaw:0,state:'alive',flash:true};
  const other={...player,id:'two',x:q.x+3};let available=0;
  for(let seed=1;seed<=10;seed++) {
    const hv=new HeliumVoiceAI({world,playerList:[player,other],rng:makeRng(seed)});
    hv.x=q.x;hv.z=q.z;
    const spot=hv.observationSpot(player,seed%2?'behind':'flank');
    if(spot){available++;assert.ok(hv.concealedAt(...spot));assert.ok(world.navWalkable(...spot));}
  }
  assert.ok(available>=5,`concealed routes must remain practical (${available}/10 positions found)`);
});

test('retreat selection bounds expensive silhouette probes while keeping real concealment',()=>{
  const {hv,sim,world,player}=fixture();
  sim.playerList.push({...player,id:'two',x:5},{...player,id:'three',x:10});
  let probes=0;world.lineOfSight=()=>{probes++;return 0;};
  const goal=hv.coverAway(player);
  assert.ok(goal);
  assert.ok(probes<=120,`one retreat selection must bound multi-player LOS work, got ${probes}`);
  assert.ok(hv.concealedAt(...goal),'bounded search still returns fully occluded cover when available');
});

test('unseen cover repositioning does not manufacture player tension',()=>{
  const {hv,sim,player}=fixture();player.z=30;
  hv.coverAway=()=>[20,20];hv.planTo=()=>true;
  let reports=0;sim.director.onReveal=()=>{reports++;};
  hv.observers=[];hv.retreatFrom(player);
  assert.equal(reports,0,'hidden repositioning must not prolong director recovery');
  hv.observers=[{p:player}];hv.retreatFrom(player);
  assert.equal(reports,1,'a witnessed escape remains a real tension event');
});

test('weighted navigation evaluates each cell cost once and refreshes it next search',()=>{
  const world=Object.create(World.prototype),size=21*21;
  Object.assign(world,{gw:21,gh:21,minX:0,minZ:0,navCost:new Float32Array(size).fill(1),
    _navHeap:new BinaryHeap(),_navG:new Float32Array(size),_navFrom:new Int32Array(size),
    _navStamp:new Uint32Array(size),_navSeq:1});
  for(const weight of [30,0]) {
    const visited=new Set();
    const path=world.findPath(2,20,38,20,{costFn:i=>{
      assert.equal(visited.has(i),false,'duplicate expensive evaluation in one search');
      visited.add(i);return weight;
    }});
    assert.ok(path.length>=2);assert.ok(visited.size>0,'new search recomputes costs');
  }
});

test('a cylinder overlapping a trunk recovers gradually instead of rejecting every correction',()=>{
  const {hv,world}=fixture();
  Object.assign(world,{circles:[[0,0,.5]],queryColliders:()=>[0],waterAt:()=>null});
  hv.x=.1;hv.z=0;hv.target=null;hv.setState('roam');
  let maxStep=0;
  for(let i=0;i<60;i++) {
    if(!hv.path){hv.path=[[hv.x,hv.z],[3,0]];hv.pathI=1;}
    const x=hv.x,z=hv.z;hv.followPath(.05,2.8);
    maxStep=Math.max(maxStep,Math.hypot(hv.x-x,hv.z-z));
  }
  assert.ok(hv.x>1,'actor must leave the overlapping tree');
  assert.ok(maxStep<.22,'recovery cannot teleport');
});

test('an intentional appearance registers briefly before physically retreating',()=>{
  const {hv,player}=fixture();hv.x=30;
  hv.setState('reveal');hv.reveal={pid:player.id,kind:'watcher',phase:'show'};
  hv.sim.director.onReveal=()=>{};
  hv.perceive=()=>{hv.observers=[{p:player}];hv.litBy=null;};
  hv.vocals=()=>{};hv.updateReveal=()=>{};hv.followPath=()=>false;
  hv.concealedAt=()=>false;hv.coverAway=()=>null;
  let retreats=0;hv.retreatFrom=()=>{retreats++;hv.setState('retreat');};
  for(let i=0;i<10;i++)hv.update(.05);
  assert.equal(retreats,0,'a deliberate glimpse survives its first visible frame');
  for(let i=0;i<15;i++)hv.update(.05);
  assert.equal(retreats,1,'appearance still ends in physical escape');
});

test('a flashlight cannot cancel the first frame of a planned watcher glimpse',()=>{
  const {hv,sim,player}=fixture();hv.x=30;
  hv.reveal={pid:player.id,kind:'watcher',phase:'show',t:0,exposureT:.1};
  hv.observers=[{p:player}];hv.litBy={p:player};
  sim.director.onReveal=()=>{};
  let retreats=0;hv.retreatFrom=()=>{retreats++;};
  hv.updateReveal(.05);assert.equal(retreats,0);
  hv.reveal.exposureT=.95;
  hv.updateReveal(.05);assert.equal(retreats,1);
});
