import test from 'node:test';
import assert from 'node:assert/strict';
import { HeliumVoiceAI } from '../shared/sim/heliumVoice.js';
import { Director } from '../shared/sim/director.js';
import { makeRng } from '../shared/math.js';

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
