import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three/three.module.js';
import {eyeHeight} from '../shared/sim/perception.js';
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
