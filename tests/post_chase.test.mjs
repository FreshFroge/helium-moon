import test from 'node:test';
import assert from 'node:assert/strict';
import {HeliumVoiceAI} from '../shared/sim/heliumVoice.js';
import {Director} from '../shared/sim/director.js';
import {devHunt,devRelocate} from '../shared/sim/dev.js';
import {makeRng} from '../shared/math.js';
import {CONFIG} from '../shared/config.js';

function fixture(seed=17){
  const p={id:'one',x:0,y:0,z:2,yaw:0,state:'alive',health:3,flash:false,noise:0,voice:0};
  const world={heightAt:()=>0,deckAt:()=>null,waterAt:()=>null,isPlayable:()=>true,
    navWalkable:()=>true,queryColliders:()=>[],circles:[],segs:[],boxes:[],gCover:[],
    trail:[[-1000,-1000],[-1000,-900]],trailCum:[0,100],trailDistAt:()=>10,
    sampleGrid:()=>.7,gridAt:()=>0,riverDistAt:()=>100,lineOfSight:()=>0,
    findPath:(x,z,gx,gz)=>[[x,z],[gx,gz]]};
  const events=[],sim={world,seed,time:400,state:'play',rng:makeRng(seed),
    playerList:[p],players:new Map([[p.id,p]]),emit:e=>events.push(e),
    obj:{doneCount:()=>0,extractOpen:false},nearestPlayer:()=>({p,d:Math.hypot(sim.hv.x-p.x,sim.hv.z-p.z)})};
  sim.director=new Director(sim);sim.director.enter('build');
  sim.hv=new HeliumVoiceAI(sim);const hv=sim.hv;hv.target=p.id;hv.setState('stalk');
  hv.observers=[];
  hv.startChase(p);assert.equal(hv.state,'chase');
  const tick=(seconds)=>{for(let i=0;i<Math.round(seconds/.05);i++){sim.time+=.05;hv.update(.05);}};
  return{sim,hv,p,world,events,tick};
}

for(const reason of ['timeout','target','grab'])test(`${reason} ends with persistent physical withdrawal and a four-minute hard gate`,()=>{
  const {sim,hv,p,events}=fixture();
  if(reason==='timeout'){p.crouch=true;p.covered=true;}
  hv.finishHunt(p,reason);
  assert.equal(hv.state,'retreat');assert.ok(hv.withdrawal);
  assert.equal(hv.withdrawal.x,0);assert.equal(hv.withdrawal.z,0);
  assert.equal(sim.director.nextChaseAt,sim.time+240);
  assert.equal(sim.director.lastChaseEnd,sim.time);
  assert.equal(events.filter(e=>e.type==='chase'&&!e.on).length,1);
  assert.ok(!events.some(e=>e.type==='hv_collapse'||e.type==='hv_relocate'),
    'even a hidden timeout flees physically instead of collapsing and teleporting');
});

test('cover and a completed short escape leg do not end the 200m withdrawal',()=>{
  const {sim,hv,p,tick}=fixture();hv.finishHunt(p,'timeout');
  tick(8);assert.ok(hv.withdrawal);assert.equal(hv.state,'retreat');
  let maxStep=0,travel=0;
  for(let i=0;i<5000&&hv.withdrawal;i++){
    const x=hv.x,z=hv.z;tick(.05);
    const step=Math.hypot(hv.x-x,hv.z-z);maxStep=Math.max(maxStep,step);travel+=step;
  }
  assert.equal(hv.withdrawal,null,'the exit eventually reaches its physical destination');
  assert.ok(hv.lastWithdrawal.distance>=200&&hv.lastWithdrawal.targetDistance>=200);
  assert.ok(hv.dist(p)>=200&&travel>175);
  assert.ok(maxStep<=CONFIG.HV.RETREAT*.05+.001,'movement stays within the physical speed cap');
  assert.equal(hv.state,'roam');assert.ok(sim.time<sim.director.nextChaseAt);
});

test('chase contact, extraction, a second player and developer tools cannot bypass recovery',()=>{
  const {sim,hv,p,tick,world,events}=fixture();hv.finishHunt(p,'timeout');
  const other={...p,id:'two'};sim.playerList.push(other);sim.players.set(other.id,other);
  const origin={x:hv.x,z:hv.z};
  assert.equal(hv.startChase(other),false);
  assert.equal(hv.tryRelocate(p,'cutoff'),false);assert.equal(hv.vanish(p),false);
  assert.equal(hv.place(900,900),false);assert.equal(devRelocate(sim,p.id),false);
  assert.equal(typeof devHunt(sim,p.id),'string');assert.deepEqual({x:hv.x,z:hv.z},origin);
  const withdrawalDeadline=sim.time+360;
  while(hv.withdrawal&&sim.time<withdrawalDeadline)tick(.05);
  assert.equal(hv.withdrawal,null,'the bounded fixture must complete its withdrawal');
  const deadline=sim.director.nextChaseAt;
  sim.state='extract';sim.obj.extractOpen=true;sim.dev={skipDread:true};
  Object.assign(p,{x:hv.x,z:hv.z+1,crouch:false,covered:false});
  world.lineOfSight=()=>1;hv.target=p.id;hv.awareness.set(p.id,2);hv.lookYaw=0;
  hv.setState('stalk');hv.fastRetreat=false;
  const starts=events.filter(e=>e.type==='chase'&&e.on).length;
  tick(.25);
  assert.equal(hv.state==='chase',false,'actual close-contact aggression must respect the end-based gate');
  assert.equal(events.filter(e=>e.type==='chase'&&e.on).length,starts);
  sim.time=deadline-.001;sim.director.enter('peak');
  assert.equal(sim.director.allowChase(p),false);assert.equal(hv.startChase(p),false);
  assert.equal(hv.setState('chase'),false);assert.equal(typeof devHunt(sim,p.id),'string');
  sim.time=deadline+.001;hv.fastRetreat=false;hv.fleeAfterGrab=false;
  hv.startChase(p);assert.equal(hv.state,'chase','after travel and four minutes, a close hunt works again');
});

test('an interrupted withdrawal cannot be replaced by stalking or a reveal',()=>{
  const {hv,p,tick}=fixture();hv.finishHunt(p,'timeout');
  hv.onSpotted(p);assert.equal(hv.state,'retreat');
  assert.equal(hv.requestReveal('watcher',p),false);
  hv.setState('stalk');tick(.05);
  assert.equal(hv.state,'retreat');assert.ok(hv.withdrawal);
});

test('spotted non-hunt appearances share a single one-to-two-second budget',()=>{
  for(const state of ['stalk','watch','freeze','reveal','lie']){
    const {sim,hv,p,world,tick}=fixture();sim.director.chasing=false;sim.director.nextChaseAt=sim.time+240;
    hv.setState(state);hv.scareVisibleUntil=null;
    hv.reveal=state==='reveal'?{kind:'watcher',pid:p.id,phase:'show',t:0}:null;
    hv.lieFor=p.id;hv.lieMin=20;hv.freezeFor=7;
    world.lineOfSight=()=>1;
    const from=sim.time;let elapsed=0;
    while(hv.state!=='retreat'&&elapsed<2.1){tick(.05);elapsed=sim.time-from;}
    assert.equal(hv.state,'retreat',`${state}: sighting must end by two seconds`);
    assert.ok(elapsed>=1&&elapsed<=2.05,`${state}: ${elapsed}s exposure`);
    assert.equal(hv.fastRetreat,true,'discovery prompts the full-speed escape');
  }
});

test('a shadow follows behind the current view, then flees on discovery without attacking',()=>{
  const {sim,hv,p,world,tick}=fixture();sim.director.chasing=false;
  hv.setState('reveal');hv.reveal={kind:'shadow',pid:p.id,phase:'follow',t:0,followFor:25};
  hv.z=18;p.yaw=0;let sampled;
  hv.observationSpot=subject=>{sampled=subject;return[0,20];};
  tick(.1);assert.equal(sampled.moveDir,null,'follow planning uses the current view direction');
  assert.equal(hv.state,'reveal');assert.equal(hv.reveal.phase,'follow');
  world.lineOfSight=()=>1;p.yaw=Math.PI;
  tick(.3);assert.equal(hv.state,'retreat');assert.equal(hv.fastRetreat,true);
  assert.equal(sim.director.chasing,false);assert.equal(p.health,3);
});
