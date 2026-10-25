import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from '../shared/config.js';
import {sightOf,eyeHeight} from '../shared/sim/perception.js';

for(const crouch of [false,true])for(const flash of [false,true])
test(`low cover conceals a downed player's real head (crouch ${crouch}, flashlight ${flash})`,()=>{
  const rays=[];
  const world={gCover:[],gClearing:[],sampleGrid:()=>0,gridAt:()=>0,trailDistAt:()=>0,riverDistAt:()=>1000,
    lineOfSight:(x,y,z,tx,ty,tz)=>{rays.push(ty);return ty>.7?1:0;}};
  const monster={x:0,y:0,z:0};
  const p={x:0,y:0,z:5,state:'downed',crouch,flash,hidden:false};
  assert.equal(sightOf(world,monster,1.8,0,p,CONFIG.HV),0,'no invisible upright target above a prone player');
  assert.equal(rays.length,1);
  assert.equal(rays[0],eyeHeight(p),'prone visibility ray ends at the real downed eye height');
  p.state='alive';
  assert.ok(sightOf(world,monster,1.8,0,p,CONFIG.HV)>0,'upright player remains visible above the same cover');
});
