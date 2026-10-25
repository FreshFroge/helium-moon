// Exercise the real MakeHuman skeleton with the real animator, without WebGL.
// Browser import maps are replaced with equivalent local file URLs for Node.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../vendor/three/three.module.js';

const animatorURL = new URL('../client/entities/animators.js', import.meta.url);
const threeURL = new URL('../vendor/three/three.module.js', import.meta.url);
const mathURL = new URL('../shared/math.js', import.meta.url);
const source = (await readFile(animatorURL, 'utf8'))
  .replace("from 'three'", `from '${threeURL.href}'`)
  .replace("from '../../shared/math.js'", `from '${mathURL.href}'`);
const { HeliumAnimator } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const meta = JSON.parse(await readFile(new URL('../assets/models/helium.json', import.meta.url), 'utf8'));

function character() {
  const root = new THREE.Group(), bones = {};
  for (const def of meta.bones) {
    const bone = bones[def.name] = new THREE.Bone();
    bone.name = def.name;
    bone.userData.head = new THREE.Vector3(...def.head);
    bone.userData.tail = new THREE.Vector3(...def.tail);
  }
  for (const def of meta.bones) {
    const bone = bones[def.name];
    if (def.parent) {
      bones[def.parent].add(bone);
      bone.position.copy(bone.userData.head).sub(bones[def.parent].userData.head);
    } else { root.add(bone); bone.position.copy(bone.userData.head); }
  }
  return { root, bones };
}

function finitePose(animator) {
  for (const bone of Object.values(animator.b)) {
    assert.ok([...bone.position, ...bone.quaternion].every(Number.isFinite), `${bone.name} pose is finite`);
    assert.ok(Math.abs(bone.quaternion.length() - 1) < 1e-6, `${bone.name} rotation stays normalized`);
  }
}

const creature = new HeliumAnimator(character());
let ankleError = 0, plantedHeightError = 0;
for (let frame = 0; frame < 720; frame++) {
  const time = frame / 60;
  const speed = time < 2 ? time : time < 5 ? 2 : time < 7 ? 2 + (time - 5) * 1.5 : time < 9 ? 5 : Math.max(0, 5 - (time - 9) * 2.5);
  creature.update(1 / 60, { speed, run: speed > 3, unnatural: true, state: speed > 3 ? 8 : 3,
    yaw: Math.sin(time * 0.4), lookYaw: 0.65, lookPitch: -0.05, armSwing: 0.04 });
  finitePose(creature);
  for (const side of ['L', 'R']) {
    const foot = creature.feet[side], actual = creature.rig.wp(creature.b['foot.' + side]);
    ankleError = Math.max(ankleError, actual.distanceTo(foot.target));
    if (foot.contact) plantedHeightError = Math.max(plantedHeightError, Math.abs(actual.y - creature.l[side].ankY));
  }
}
console.log(`     ankle target error ${ankleError.toFixed(5)} m; planted height error ${plantedHeightError.toFixed(5)} m`);
assert.ok(ankleError < 0.012, 'compound leg IK must place the actual ankle within 1.2 cm of its target');
assert.ok(plantedHeightError < 0.012, 'stance feet must remain on the local support plane');
console.log('  ok  walk, chase, acceleration, braking and turns keep finite grounded poses');

for (let i = 0; i < 900; i++) creature.update(1 / 60, { speed: 0, still: true, snap: true,
  unnatural: true, yaw: 0, state: 5, lookYaw: 0.4 });
const frozen = Object.values(creature.b).map(bone => [...bone.position, ...bone.quaternion]);
for (let i = 0; i < 120; i++) creature.update(1 / 60, { speed: 0, still: true, snap: true,
  unnatural: true, yaw: 0, state: 5, lookYaw: 0.4 });
let frozenDelta = 0;
Object.values(creature.b).forEach((bone, i) => [...bone.position, ...bone.quaternion].forEach((v, j) => {
  frozenDelta = Math.max(frozenDelta, Math.abs(v - frozen[i][j]));
}));
assert.ok(frozenDelta < 1e-5, 'watched/frozen stance must settle without idle twitching');
console.log('  ok  frozen pose settles while retaining the requested gaze');

const natural = new HeliumAnimator(character()), unnatural = new HeliumAnimator(character());
for (let i = 0; i < 240; i++) {
  const pose = { speed: 0, lookYaw: 0.8, yaw: 0, state: 4 };
  natural.update(1 / 60, pose);
  unnatural.update(1 / 60, { ...pose, unnatural: true });
}
assert.equal(natural.torsoYaw, 0, 'teammates do not inherit delayed creature torso tracking');
assert.equal(natural.b.root.position.x, natural.b.root.userData.restPos.x, 'teammates do not inherit creature idle weight shifts');
assert.ok(unnatural.torsoYaw > 0.1 && Math.abs(unnatural.b.root.position.x) > 0.002);
assert.ok(Math.abs(unnatural.headYaw + unnatural.torsoYaw - 0.8) < 0.015, 'neck compensates for torso tracking without doubling the gaze');
console.log('  ok  creature-only layers preserve teammate behavior and independent head tracking');

console.log('\nall animation tests passed');
