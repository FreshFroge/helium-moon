import test from 'node:test';
import assert from 'node:assert/strict';
import { SkunkAI } from '../shared/sim/skunk.js';
import { HeliumVoiceAI } from '../shared/sim/heliumVoice.js';
import { makeRng } from '../shared/math.js';

function actor(Type){
  const world={gBrush:[],gTrail:[],gCover:[],heightAt:()=>0,deckAt:()=>null,waterAt:()=>null,
    navWalkable:()=>true,queryColliders:()=>[],findPath:(x,z,gx,gz)=>[[x,z],[gx,gz]],
    minX:0,minZ:0,gw:200};
  const sim={world,rng:makeRng(1),time:400,playerList:[],players:new Map(),director:{}};
  const ai=new Type(sim);ai.setState(Type===SkunkAI?'prowl':'roam');ai.target=null;
  return ai;
}
for(const [name,Type,method] of [['skunk',SkunkAI,'follow'],['Helium Voice',HeliumVoiceAI,'followPath']]) {
  test(`${name} completes all route legs before reporting arrival`,()=>{
    const ai=actor(Type);ai.planTo(240,0);
    let arrived=false,maxStep=0;
    for(let i=0;i<4000 && !arrived;i++){
      const x=ai.x;arrived=ai[method](.05,4);maxStep=Math.max(maxStep,Math.abs(ai.x-x));
    }
    assert.ok(arrived,'route eventually completes');
    assert.ok(ai.x>239,`arrival was reported at ${ai.x.toFixed(1)} m, before the 240 m goal`);
    assert.ok(maxStep<=.201,'leg transitions preserve physical movement');
  });
}

test('a blocked skunk route is abandoned without reporting arrival, then can recover',()=>{
  const ai=actor(SkunkAI);ai.world.navWalkable=x=>x<.5;ai.world.lineOfSight=()=>0;ai.planTo(3,0);
  let arrived=false;
  for(let i=0;i<200 && ai.path;i++)arrived ||= ai.follow(.05,2);
  assert.equal(ai.path,null,'no-progress route must be invalidated for replanning');
  assert.equal(arrived,false,'blocked movement is not arrival');
  assert.ok(ai.x<.5,'no teleport through the obstacle');
  ai.world.navWalkable=()=>true;ai.world.lineOfSight=()=>1;ai.planTo(3,0);
  for(let i=0;i<100 && !arrived;i++)arrived=ai.follow(.05,2);
  assert.ok(arrived && ai.x>2.4,'fresh route can resume movement');
});

test('skunk physically goes around a fallen log instead of pushing against it forever',()=>{
  const ai=actor(SkunkAI);ai.z=1;
  ai.world.lineOfSight=(x,y,z,tx,ty,tz)=>z>0 && Math.abs(x+(tx-x)*z/(z-tz))<4.6 ? 0:1;
  ai.world.segs=[[-4,0,4,0,.3,2]];ai.world.queryColliders=()=>[100000];
  ai.planTo(0,-3);let arrived=false,maxStep=0;
  for(let i=0;i<1000 && !arrived;i++){
    if(!ai.path)ai.planTo(0,-3);
    const x=ai.x,z=ai.z;arrived=ai.follow(.05,2);
    maxStep=Math.max(maxStep,Math.hypot(ai.x-x,ai.z-z));
  }
  assert.ok(arrived && ai.z<-2.3,`must reach the far side of the log, ended at ${ai.x},${ai.z}`);
  assert.ok(maxStep<.151,'local avoidance cannot teleport through geometry');
});

test('skunk replaces a prowl destination the moving player has left far behind',()=>{
  const ai=actor(SkunkAI),p={id:'one',x:300,y:0,z:0,yaw:0,state:'alive',flash:false};
  ai.world.lineOfSight=()=>0;
  ai.sim.playerList=[p];ai.sim.players.set(p.id,p);
  ai.sim.director={focusPlayer:()=>p,allowSkunkAmbush:()=>true};
  ai.sim.rng=ai.rng=Object.assign(()=>.9,{range:(a,b)=>(a+b)/2});
  ai.planTo(20,0);ai.goal=[20,0];const old=ai.path;
  ai.lurkSpot=()=>[310,10];ai.update(.05);
  assert.notEqual(ai.path,old,'do not finish a stale route and lurk far behind the player');
  assert.ok(Math.hypot(ai.goal[0]-p.x,ai.goal[1]-p.z)<110);
});

test('Helium runs through close waypoints without spending a movement tick at each one',()=>{
  const ai=actor(HeliumVoiceAI);ai.setState('chase');
  ai.path=Array.from({length:41},(_,i)=>[0,i*.2]);ai.pathI=1;
  let arrived=false,pauses=0;
  for(let i=0;i<120&&!arrived;i++){
    const before=ai.z;arrived=ai.followPath(.05,5);
    if(!arrived && Math.abs(ai.z-before)<.001)pauses++;
  }
  assert.ok(arrived && ai.z>7.6,'the complete run reaches its endpoint');
  assert.equal(pauses,0,'consuming a nearby waypoint must continue movement in the same tick');
});

for(const obstacle of ['trunk','fence'])test(`Helium pursuit steers around a ${obstacle} missed by the coarse nav grid`,()=>{
  const ai=actor(HeliumVoiceAI);ai.setState('chase');ai.z=4;
  if(obstacle==='trunk'){ai.world.circles=[[0,0,.55]];ai.world.queryColliders=()=>[0];}
  else{ai.world.segs=[[-3,0,3,0,.25,2]];ai.world.queryColliders=()=>[100000];}
  // The planner's straight segment models a locally obstructed coarse grid
  // cell. Actual physics must steer the creature; no teleport/ignored collision.
  ai.planTo(0,-4);let arrived=false,maxStep=0;
  for(let i=0;i<300&&!arrived;i++){
    if(!ai.path || i%6===0)ai.planTo(0,-4);
    const x=ai.x,z=ai.z;ai.sim.time+=.05;
    arrived=ai.followPath(.05,6.6);
    maxStep=Math.max(maxStep,Math.hypot(ai.x-x,ai.z-z));
    if(obstacle==='trunk')assert.ok(Math.hypot(ai.x,ai.z)>=.55+.32-.001,'the running cylinder stays outside bark');
    else assert.ok(Math.abs(ai.x)>3 || Math.abs(ai.z)>=.25+.32-.001,'the route never passes through the fence');
  }
  assert.ok(arrived && ai.z<-3.6,`run reaches the far side, ended at ${ai.x},${ai.z}`);
  assert.ok(maxStep<=6.6*.05*1.5+.001,'bounded physical movement, including collision correction');
});

test('Helium snapshots stop the running gait when the body cannot move',()=>{
  const ai=actor(HeliumVoiceAI);ai.setState('chase');ai.world.navWalkable=()=>false;
  ai.planTo(4,0);ai.anim.run=1;
  for(let i=0;i<20;i++){
    if(!ai.path)ai.planTo(4,0);
    ai.sim.time+=.05;ai.followPath(.05,6.6);
  }
  assert.ok(ai.speed>3,'the route is still requesting a run');
  assert.equal(ai.snapshot()[6],0,'network gait speed reflects the blocked body rather than its requested speed');
});
