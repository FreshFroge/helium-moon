import test from 'node:test';
import assert from 'node:assert/strict';
import { HeliumVoiceAI } from '../shared/sim/heliumVoice.js';
import { makeRng } from '../shared/math.js';

function fixture(kind='watcher'){
  const p={id:'one',x:0,y:0,z:0,yaw:0,state:'alive',flash:false};
  const reports=[];
  const world={heightAt:()=>0,deckAt:()=>null,lineOfSight:()=>0,navWalkable:()=>true};
  const sim={world,rng:makeRng(1),time:400,playerList:[p],players:new Map([[p.id,p]]),
    director:{onReveal:k=>reports.push(k),escalation:()=>0,minDistance:()=>0}};
  const hv=new HeliumVoiceAI(sim);hv.x=30;hv.target=p.id;hv.setState('reveal');
  hv.reveal={kind,pid:p.id,phase:kind==='watcher'?'show':'cross',t:0,end:[35,0]};
  hv.vocals=()=>{};hv.followPath=()=>false;hv.coverAway=()=>null;hv.concealedAt=()=>false;
  return {hv,p,sim,reports};
}
for(const kind of ['watcher','crossing'])test(`${kind} sighting reports once before its short visible escape`,()=>{
  const {hv,p,sim,reports}=fixture(kind);
  hv.perceive=()=>{hv.observers=[{p}];hv.litBy=null;sim.time+=.05;};
  // owner (Oct 25 midday): seen from a distance he holds and stares back first (HV.STARE),
  // then leaves; he must not vanish within the first second any more
  for(let i=0;i<20;i++)hv.update(.05);
  assert.notEqual(hv.state,'retreat','he stares back before leaving');
  for(let i=0;i<140;i++)hv.update(.05);
  assert.deepEqual(reports,[kind],'one real appearance must not disappear from pacing or count twice');
  assert.equal(hv.state,'retreat');
});

test('an unseen watcher timing out reports no phantom encounter',()=>{
  const {hv,reports}=fixture();hv.observers=[];hv.litBy=null;hv.reveal.t=29.99;
  hv.updateReveal(.05);
  assert.deepEqual(reports,[],'waiting unseen cannot produce encounter pressure');
  assert.equal(hv.state,'retreat');
});

test('an unseen approach refreshes a destination the target has walked past',()=>{
  const {hv,p,sim}=fixture();hv.observers=[];hv.reveal.phase='approach';
  Object.assign(hv.reveal,{spot:[50,0],origin:[0,0],lastPlanAt:390});
  p.x=20;hv.stateT=10;
  hv.revealPlan=()=>({kind:'watcher',pid:p.id,phase:'approach',spot:[80,20],origin:[p.x,p.z],lastPlanAt:sim.time});
  hv.planTo=()=>true;
  hv.updateReveal(.05);
  assert.deepEqual(hv.reveal.spot,[80,20]);
  assert.equal(hv.stateT,10,'refresh must not extend the overall approach timeout');
});

test('crossing plans reject routes whose endpoints are outside allowed creature space',()=>{
  const {hv,p}=fixture();hv.world.lineOfSight=()=>1;
  hv.openingClear=x=>Math.abs(x)<1;
  assert.equal(hv.revealPlan('crossing',p),null,'both crossing endpoints must fit allowed space');
});

for(const [label,counted,lastPlanAt] of [['recent refresh',false,399],['already witnessed',true,390]])
test(`moving target cannot churn a reveal plan after ${label}`,()=>{
  const {hv,p}=fixture();hv.observers=[];
  Object.assign(hv.reveal,{phase:'approach',spot:[50,0],origin:[0,0],lastPlanAt,counted});
  p.x=20;hv.revealPlan=()=>{throw new Error('unnecessary replanning');};
  hv.updateReveal(.05);assert.deepEqual(hv.reveal.spot,[50,0]);
});

for(const phase of ['show','cross'])test(`${phase} completion does not count an already-reported glimpse twice`,()=>{
  const {hv,p,reports}=fixture(phase==='show'?'watcher':'crossing');
  Object.assign(hv.reveal,{counted:true,t:30,exposureT:.3});hv.observers=[{p}];hv.litBy=null;
  hv.followPath=()=>true;hv.updateReveal(.05);
  assert.deepEqual(reports,[],'completion preserves prior sighting accounting');
});

test('a planned watcher turns its body and gaze toward the player without prior awareness',()=>{
  const {hv,p}=fixture();hv.yaw=hv.lookYaw=0;
  hv.perceive=()=>{hv.observers=[];hv.litBy=null;};
  for(let i=0;i<12;i++)hv.update(.05);
  const target=Math.atan2(p.x-hv.x,p.z-hv.z);
  const error=a=>Math.abs(Math.atan2(Math.sin(a-target),Math.cos(a-target)));
  assert.ok(error(hv.yaw)<.5,'watcher body should face its audience');
  assert.ok(error(hv.lookYaw)<.3,'watcher gaze should track the planned target');
});

test('repeated escapes during one brief appearance do not repeatedly raise director pressure',()=>{
  const {hv,p,sim,reports}=fixture();
  hv.perceive=()=>{hv.observers=[{p}];hv.litBy=null;};
  for(let i=0;i<5;i++)hv.update(.05);
  hv.setState('still');hv.retreatFrom(p);
  assert.deepEqual(reports,['watcher']);
  sim.time+=6;hv.retreatFrom(p);
  assert.deepEqual(reports,['watcher','retreat'],'a later perceived encounter still adds pressure');
});
