import test from 'node:test';
import assert from 'node:assert/strict';
import { HeliumVoiceAI } from '../shared/sim/heliumVoice.js';
import { Director } from '../shared/sim/director.js';
import { makeRng } from '../shared/math.js';
import { CONFIG } from '../shared/config.js';

test('hidden middle-distance proximity cannot cancel an overdue Helium Voice approach',()=>{
  const p={id:'one',x:0,z:0,state:'alive',quietT:0};
  const sim={time:400,state:'play',rng:makeRng(2),players:new Map([['one',p]]),playerList:[p],
    hv:{x:40,z:0,observers:[]},obj:{doneCount:()=>0,extractOpen:false}};
  const dir=new Director(sim);dir.enter('build');dir.phaseLen=999;dir.nextReveal=999;
  for(let t=0;t<60;t+=.05){sim.time+=.05;dir.update(.05);}
  assert.equal(dir.safeT,0,'legacy physical proximity timer resets');
  assert.ok(dir.wantsPresence(),'unseen creature must continue its approach');
  sim.hv.observers=[{p}];dir.update(.05);
  assert.equal(dir.presenceT,0,'a real glimpse resets presence pacing');
});

test('a lull keeps Helium Voice near his focus instead of wandering down the map',()=>{
  const p={id:'one',x:0,z:0,state:'alive'};
  const sim={world:{navWalkable:()=>true},rng:makeRng(8),playerList:[p],players:new Map([['one',p]]),
    director:{focusPlayer:()=>p,wantsPresence:()=>false,minDistance:()=>0}};
  const hv=new HeliumVoiceAI(sim);hv.x=200;hv.z=0;
  for(let i=0;i<30;i++){
    const goal=hv.roamGoal();assert.ok(goal);
    assert.ok(Math.hypot(...goal)<=85.001,'post-encounter lull stays local');
  }
});

test('only a perceived appearance earns the full reveal cooldown',()=>{
  const p={id:'one',x:0,z:0,state:'alive',quietT:0};
  let requests=0;
  const request=()=>{requests++;return requests>1;};
  const sim={time:400,state:'play',rng:makeRng(12),players:new Map([['one',p]]),playerList:[p],
    hv:{x:60,z:0,observers:[],focusPlayer:()=>p,requestReveal:request},
    sf:{requestEmerge:request},obj:{doneCount:()=>0,extractOpen:false},emit:()=>{}};
  const dir=new Director(sim);dir.enter('build');dir.phaseLen=999;dir.nextReveal=399;
  dir.update(.05);
  assert.equal(requests,1);
  assert.ok(dir.nextReveal>=sim.time+6 && dir.nextReveal<=sim.time+12,'failed plan retries without a fake recovery period');

  sim.time=dir.nextReveal+.01;dir.update(.05);
  assert.equal(requests,2);
  assert.equal(dir.nextReveal,dir.revealPendingUntil,'accepted travel has a bounded resolution reservation');

  sim.time+=10;dir.onReveal('watcher');
  assert.equal(dir.revealPendingUntil,0);
  const revealBounds=CONFIG.DIRECTOR.REVEAL_GAP.flat();
  assert.ok(dir.nextReveal>=sim.time+Math.min(...revealBounds) && dir.nextReveal<=sim.time+Math.max(...revealBounds),
    'the real sighting starts the configured full recovery gap');
});

test('a survived Helium Voice glimpse schedules a delayed physical hunt attempt',()=>{
  const p={id:'one',x:0,z:0,state:'alive',quietT:0};
  let starts=0;
  const hv={x:30,z:0,observers:[],state:'roam',closingOn:null,focusPlayer:()=>p,
    requestReveal:()=>false,startChase:()=>{starts++;hv.closingOn={pid:p.id};return false;}};
  const sim={time:400,state:'play',rng:makeRng(5),players:new Map([['one',p]]),playerList:[p],hv,
    sf:{requestEmerge:()=>false},obj:{doneCount:()=>0,extractOpen:false},emit:()=>{},mimic:null};
  const dir=new Director(sim);dir.enter('build');dir.phaseLen=999;dir.nextReveal=999;
  dir.onReveal('watcher');
  assert.ok(dir.huntDueAt>=sim.time+10 && dir.huntDueAt<=sim.time+28);
  sim.time=dir.huntDueAt+.01;dir.update(.05);
  assert.equal(starts,1);
  assert.equal(dir.huntDueAt,0,'accepted close-in attempt consumes the schedule');
});
