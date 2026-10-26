import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three/three.module.js';
import {eyeHeight} from '../shared/sim/perception.js';
import * as perception from '../shared/sim/perception.js';
import {leanDistance,LEAN_REACH,LEAN_ROLL} from '../shared/physics.js';
const base=new URL('../client/game/player.js',import.meta.url);
let source=await readFile(base,'utf8');
source=source.replace("from 'three'",`from '${new URL('../vendor/three/three.module.js',import.meta.url).href}'`);
source=source.replace(/from '(\.\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,base).href}'`);
const {PlayerController}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const camera=new THREE.PerspectiveCamera(),controller=new PlayerController({},camera,{headBob:0,cameraShake:0});
controller.pos.set(5,3,7);
for(const crouch of [false,true]){
  controller.crouch=crouch?1:0;controller._camera(0,0);
  assert.ok(Math.abs(camera.position.y-controller.pos.y-eyeHeight({crouch}))<1e-6,
    `AI eye origin must match the real settled ${crouch?'crouched':'standing'} camera`);
}
console.log('  ok  authoritative eye origin matches actual standing/crouched camera');

controller.downed=1;
for(const crouch of [false,true]){
  controller.crouch=crouch?1:0;controller._camera(0,0);
  assert.ok(Math.abs(camera.position.y-controller.pos.y-eyeHeight({state:'downed',crouch}))<1e-6,
    'authoritative eye origin must match the actual downed camera');
}
console.log('  ok  authoritative eye origin matches actual downed camera');

// Q/R must change the same eye origin for the renderer and the authoritative AI.
// Flat fixtures isolate leaning from bob, motion and terrain sampling.
const leanWorld={heightAt:()=>0,waterAt:()=>null,deckAt:()=>null,isPlayable:()=>true,
  queryColliders:()=>[],circles:[],segs:[],boxes:[],sampleGrid:()=>0,gridAt:()=>0,
  trailDistAt:()=>10,riverDistAt:()=>100,lineOfSight:()=>1};
const leanCam=new THREE.PerspectiveCamera(),leaner=new PlayerController(leanWorld,leanCam,{headBob:0,cameraShake:0});
leaner.pos.set(0,0,0);leaner.yaw=0;leaner.inputLean=1;leaner.leanIntent=1;leaner._camera(.05,0);
const state={x:0,y:0,z:0,yaw:0,lean:leaner.lean,state:'alive',crouch:false};
const authority=perception.eyePosition?perception.eyePosition(leanWorld,state):{x:state.x,y:eyeHeight(state),z:state.z};
assert.ok(Math.abs(authority.x-leanCam.position.x)<.001,'server perception must match a leaning camera');
assert.ok(leanCam.position.x>.41,'clear-space leaning permits a shoulder-width peek');
assert.ok(leanCam.rotation.z<-.1,'a right peek banks right instead of counter-rolling left');
assert.equal(leanCam.rotation.z,leaner.lean*LEAN_ROLL);
assert.equal(leaner.pos.x,0,'leaning does not move the player capsule');

for(const kind of ['tree','wall']){
  const blocked={...leanWorld,circles:kind==='tree'?[[.6,0,.3,.3]]:[],boxes:kind==='wall'?[[.6,0,.3,2,0,3]]:[],
    queryColliders:()=>[kind==='tree'?0:200000]};
  leaner.world=blocked;leaner.leanIntent=1;leaner._camera(.05,0);
  assert.ok(leanCam.position.x<=.201,kind+': lean must leave near-plane clearance');
  const p={...state,lean:leaner.lean},eye=perception.eyePosition(blocked,p);
  assert.ok(Math.abs(eye.x-leanCam.position.x)<.001,kind+': constrained lean agrees with authority');
}
console.log('  ok  leaning preserves camera clearance at trunks/walls and matches server perception');

const thinFence={...leanWorld,boxes:[[.21,0,.015,2,0,3]],queryColliders:()=>[200000]};
assert.ok(leanDistance(thinFence,state,1,eyeHeight(state))<.096,
  'the swept eye cannot jump through a thin fence to a clear destination');
leaner.world=thinFence;leaner.inputLean=1;
for(let i=0;i<30;i++)leaner._camera(1/60,0);
assert.ok(leaner.leanIntent>.99&&leaner.lean<.25,'collision does not shorten the intended pose');
leaner.world=leanWorld;leaner._camera(1/60,0);
assert.ok(leanCam.position.x>LEAN_REACH*.99,'holding a peek reaches full extension once cover clears');
leaner.inputLean=-1;
for(let i=0;i<60;i++)leaner._camera(1/60,0);
assert.ok(leanCam.position.x<-.41&&leanCam.rotation.z>.1,'a left peek mirrors the right peek');
leaner.inputLean=0;
for(let i=0;i<60;i++)leaner._camera(1/60,0);
assert.ok(Math.abs(leanCam.position.x)<.001&&Math.abs(leanCam.rotation.z)<.001,'releasing lean smoothly centers the eye');
leaner.inputLean=1;leaner.covered=true;leaner._camera(1/60,0);
assert.equal(leaner.lean,0,'covering the player cancels leaning');
leaner.covered=false;leaner.lookLock={};leaner._camera(1/60,0);
assert.equal(leaner.lean,0,'a grab camera lock cancels leaning');
console.log('  ok  peeks sweep thin obstacles, recover when clear, bank correctly and center on release');

const peekWorld={...leanWorld,lineOfSight:(ax,ay,az,bx)=>bx>.12?1:0};
const monster={x:0,y:0,z:-6},hider={...state,lean:0,flash:false};
const {CONFIG}=await import('../shared/config.js');
assert.equal(perception.sightOf(peekWorld,monster,1.78,0,hider,CONFIG.HV),0);
hider.lean=1;
assert.ok(perception.sightOf(peekWorld,monster,1.78,0,hider,CONFIG.HV)>.02,'peeking the head outside cover can reveal a player');
hider.covered=true;
assert.equal(perception.eyePosition(peekWorld,hider).x,0,'a deployed blanket cannot also peek');
console.log('  ok  a visible leaning head can be discovered while the covered body remains occluded');
