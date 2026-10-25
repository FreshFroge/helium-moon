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
