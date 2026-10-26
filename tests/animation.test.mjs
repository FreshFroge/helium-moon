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
const { HeliumAnimator, SkunkAnimator } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const meta = JSON.parse(await readFile(new URL('../assets/models/helium.json', import.meta.url), 'utf8'));

function character(skeleton = meta) {
  const root = new THREE.Group(), bones = {};
  for (const def of skeleton.bones) {
    const bone = bones[def.name] = new THREE.Bone();
    bone.name = def.name;
    bone.userData.head = new THREE.Vector3(...def.head);
    bone.userData.tail = new THREE.Vector3(...def.tail);
  }
  for (const def of skeleton.bones) {
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

const crawler = new HeliumAnimator(character());
let crawlFootError=0, crawlHandError=0, handHeight=0, headHeight=0;
for(let i=0;i<360;i++) {
  crawler.update(1/60,{speed:10.5,crawl:true,unnatural:true,state:6,yaw:0,lookYaw:0});
  finitePose(crawler);
  if(i>=60) headHeight=Math.max(headHeight,crawler.rig.wp(crawler.b.head).y);
  for(const side of ['L','R']) {
    const hand=crawler.hands[side], foot=crawler.feet[side];
    crawlFootError=Math.max(crawlFootError,crawler.rig.wp(crawler.b['foot.'+side]).distanceTo(foot.target));
    crawlHandError=Math.max(crawlHandError,crawler.rig.wp(crawler.b['wrist.'+side]).distanceTo(hand.target));
    if(i>=60 && hand.contact) handHeight=Math.max(handHeight,Math.abs(hand.target.y-.11));
  }
}
console.log({crawlFootError,crawlHandError,handHeight,headHeight});
assert.ok(crawlFootError<.012 && crawlHandError<.012,'reverse crawl IK reaches all four contact targets');
assert.ok(handHeight<.02 && headHeight<.95,'hands plant on the ground and the head stays below standing height');
for(let i=0;i<120;i++){crawler.update(1/60,{speed:2,unnatural:true,state:3});finitePose(crawler);}
assert.ok(crawler.blend.crawl<.001,'crawl blends back to the normal stalk');
console.log('  ok  reverse bear crawl has finite grounded hands/feet and returns to walking');

for(const [sx,sz] of [[.3,.2],[-.3,-.2],[.3,-.2],[-.3,.2]]) {
  for(const crawl of [false,true]) {
    const slope=new HeliumAnimator(character()),ground=(x,z)=>sx*x+sz*z;
    let footSupportError=0,handSupportError=0,limbError=0;
    for(let i=0;i<240;i++) {
      slope.update(1/60,{speed:crawl?10.5:1.35,crawl,unnatural:true,state:crawl?6:3,yaw:0,ground});
      finitePose(slope);
      if(i<60)continue;
      for(const side of ['L','R']) {
        const foot=slope.feet[side],ankle=slope.rig.wp(slope.b['foot.'+side]);
        limbError=Math.max(limbError,ankle.distanceTo(foot.target));
        if(foot.contact)footSupportError=Math.max(footSupportError,Math.abs(ankle.y-slope.l[side].ankY-ground(ankle.x,ankle.z)));
        if(crawl){
          const hand=slope.hands[side],wrist=slope.rig.wp(slope.b['wrist.'+side]);
          limbError=Math.max(limbError,wrist.distanceTo(hand.target));
          if(hand.contact)handSupportError=Math.max(handSupportError,Math.abs(wrist.y-.11-ground(wrist.x,wrist.z)));
        }
      }
    }
    assert.ok(limbError<.012,`all limbs reach their slope targets (${sx},${sz}, crawl=${crawl}): ${limbError}`);
    assert.ok(footSupportError<.012,`feet follow uphill/downhill and cross-slope support: ${footSupportError}`);
    assert.ok(handSupportError<.02,`palms follow the actual support height: ${handSupportError}`);
  }
}
console.log('  ok  walk and reverse crawl plant on uphill, downhill and cross-slope terrain');

const hiker = JSON.parse(await readFile(new URL('../assets/models/hiker.json', import.meta.url), 'utf8'));
const teammate = new HeliumAnimator(character(hiker));
for (const crouch of [0, 1]) {
  for (const sideLean of [-1, 0, 1]) {
    for (let i = 0; i < 180; i++) teammate.update(1/60, {speed:0, crouch, sideLean});
    finitePose(teammate);
    const head = teammate.rig.wp(teammate.b.head);
    if (sideLean) assert.ok(head.x * sideLean < -.2 && head.x * sideLean > -.35,
      `the actual hiker head peeks in the camera's direction without moving the feet: ${head.x}`);
    else assert.ok(Math.abs(head.x) < .001, 'releasing lean returns the hiker to center');
    if (crouch) assert.ok(head.y > .85 && head.y < 1.08, `remote crouch matches the low player eye position: ${head.y}`);
    for (const side of ['L','R']) {
      assert.ok(teammate.rig.wp(teammate.b['foot.'+side]).distanceTo(teammate.feet[side].target) < .012,
        'lean/crouch keeps both ankles grounded');
    }
  }
}
console.log('  ok  actual hiker leans above planted feet and crouches to the player eye height');

const skunkMeta = JSON.parse(await readFile(new URL('../assets/models/sf6.json', import.meta.url), 'utf8'));
let pawError = 0, pawSupportError = 0, pawWorst;
for (const [sx,sz] of [[0,0],[.3,.2],[-.3,-.2],[.3,-.2],[-.3,.2]]) {
  for (const pose of [{speed:1},{speed:3.8,fast:true},{speed:0,rear:true,gas:true},{speed:.6,low:true}]) {
    const skunk = new SkunkAnimator(character(skunkMeta)), ground = (x,z) => sx*x+sz*z;
    for (let i=0;i<240;i++) {
      skunk.update(1/60,{...pose,ground}); finitePose(skunk);
      if(i<120)continue;
      for(const [key,foot] of Object.entries(skunk.feet)) {
        if(!foot.contact)continue;
        const actual=skunk.rig.wp(skunk.legs[key].e);
        pawError=Math.max(pawError,actual.distanceTo(foot.target));
        const supportError=Math.abs(actual.y-ground(actual.x,actual.z)-.02);
        if(supportError>pawSupportError){pawSupportError=supportError;pawWorst={sx,sz,pose,key,actual:actual.toArray(),target:foot.target.toArray()};}
      }
    }
  }
}
console.log({pawError,pawSupportError,pawWorst});
assert.ok(pawError < .012 && pawSupportError < .015,'skunk walk, run, crouch and reared hind paws follow the actual support plane');
console.log('  ok  skunk paws ground on slopes and stay planted while rearing');

console.log('\nall animation tests passed');
