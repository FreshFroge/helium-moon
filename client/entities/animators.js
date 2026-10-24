// Procedural animation for the two creatures. Limbs are posed with aim
// constraints + analytic 2-bone IK so feet plant on the ground, and every motion
// is generated from gait parameters - which lets Helium Voice move in subtly
// wrong ways (locked head, dead arms, sudden stops) without canned clips.
import * as THREE from 'three';
import { clamp, lerp } from '../../shared/math.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q2 = new THREE.Quaternion();

class Rig {
  constructor(char) {
    this.c = char; this.b = char.bones;
    this.order = [];
    const visit = (bone) => { this.order.push(bone); for (const ch of bone.children) if (ch.isBone) visit(ch); };
    for (const ch of char.root.children) if (ch.isBone) visit(ch);
    for (const bone of this.order) {
      bone.userData.bindDir = new THREE.Vector3().subVectors(bone.userData.tail, bone.userData.head);
      bone.userData.len = bone.userData.bindDir.length();
      bone.userData.bindDir.normalize();
      if (!isFinite(bone.userData.bindDir.x) || bone.userData.len < 1e-5) bone.userData.bindDir.set(0, 1, 0);
      bone.userData.restPos = bone.position.clone();
    }
  }
  reset() { for (const bone of this.order) { bone.quaternion.identity(); bone.position.copy(bone.userData.restPos); } }
  wq(bone, out = new THREE.Quaternion()) {
    out.identity();
    const chain = [];
    let b = bone; while (b && b.isBone) { chain.push(b); b = b.parent; }
    for (let i = chain.length - 1; i >= 0; i--) out.multiply(chain[i].quaternion);
    return out;
  }
  wp(bone, out = new THREE.Vector3()) {
    const chain = [];
    let b = bone; while (b && b.isBone) { chain.push(b); b = b.parent; }
    out.set(0, 0, 0); const q = new THREE.Quaternion();
    for (let i = chain.length - 1; i >= 0; i--) {
      out.add(chain[i].position.clone().applyQuaternion(q)); q.multiply(chain[i].quaternion);
    }
    return out;
  }
  aim(bone, dir, twist = 0) {
    const P = bone.parent && bone.parent.isBone ? this.wq(bone.parent, _q2) : _q2.identity();
    const W = new THREE.Quaternion().setFromUnitVectors(bone.userData.bindDir, _v.copy(dir).normalize());
    if (twist) W.premultiply(new THREE.Quaternion().setFromAxisAngle(_v2.copy(dir).normalize(), twist));
    bone.quaternion.copy(P.invert()).multiply(W);
  }
  ik2(a, l1, l2, target, hint) {
    const d = _v.subVectors(target, a); let L = d.length();
    L = clamp(L, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    const dir = d.normalize();
    const cosA = (l1 * l1 + L * L - l2 * l2) / (2 * l1 * L);
    const along = l1 * cosA, h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const side = new THREE.Vector3().copy(hint).addScaledVector(dir, -hint.dot(dir)).normalize();
    return new THREE.Vector3().copy(a).addScaledVector(dir, along).addScaledVector(side, h);
  }
}

export class HeliumAnimator {
  constructor(char) {
    this.rig = new Rig(char); this.b = char.bones;
    const b = this.b;
    this.l = {};
    for (const s of ['L', 'R']) {
      const hip = b['upperleg01.' + s].userData.head, knee = b['lowerleg01.' + s].userData.head, ank = b['foot.' + s].userData.head;
      const sh = b['upperarm01.' + s].userData.head, el = b['lowerarm01.' + s].userData.head, wr = b['wrist.' + s].userData.head;
      this.l[s] = { thigh: hip.distanceTo(knee), shin: knee.distanceTo(ank), upper: sh.distanceTo(el), fore: el.distanceTo(wr), hipX: hip.x, ankY: ank.y, footFwd: b['foot.' + s].userData.bindDir.clone() };
    }
    this.phase = 0; this.t = 0;
    this.headYaw = 0; this.headPitch = 0; this.tilt = 0; this.jaw = 0;
    this.blend = { walk: 0, run: 0, crouch: 0, reach: 0, still: 0 };
  }

  // p: {speed, run, crouch, reach, still, lookYaw, lookPitch, tilt, jaw, armSwing, snap}
  update(dt, p) {
    const rig = this.rig, b = this.b;
    this.t += dt;
    const sp = p.speed || 0;
    const B = this.blend;
    const k = 1 - Math.exp(-dt * 6);
    B.walk = lerp(B.walk, clamp(sp / 1.4, 0, 1), k);
    B.run = lerp(B.run, p.run ? 1 : 0, 1 - Math.exp(-dt * 4));
    B.crouch = lerp(B.crouch, p.crouch || 0, k);
    B.reach = lerp(B.reach, p.reach || 0, 1 - Math.exp(-dt * 10));
    B.still = lerp(B.still, p.still ? 1 : 0, 1 - Math.exp(-dt * 8));
    const stride = lerp(0.66, 1.6, B.run);
    if (sp > 0.02) this.phase = (this.phase + dt * sp / (stride * 2)) % 1;
    rig.reset();
    const moving = clamp(sp / 0.5, 0, 1);
    const lean = 0.06 * B.walk + 0.38 * B.run + 0.25 * B.crouch + 0.3 * B.reach;
    const bob = Math.abs(Math.sin(this.phase * Math.PI * 2)) * (0.025 * B.walk + 0.06 * B.run) * moving;
    const breathe = (1 - B.still) * Math.sin(this.t * 1.7) * 0.012;
    b.root.position.y = b.root.userData.restPos.y - 0.04 * B.walk - 0.12 * B.run - 0.22 * B.crouch + bob;
    const spineBend = lean / 4;
    for (const n of ['spine05', 'spine04', 'spine03', 'spine02']) b[n].quaternion.setFromEuler(new THREE.Euler(spineBend + breathe * 0.3, Math.sin(this.phase * Math.PI * 2) * 0.05 * moving * (1 - B.still), 0));
    b.spine01.quaternion.setFromEuler(new THREE.Euler(breathe, 0, 0));
    // head locked onto its target independent of the body (deliberately wrong)
    this.headYaw = lerp(this.headYaw, clamp(p.lookYaw || 0, -1.95, 1.95), 1 - Math.exp(-dt * (p.snap ? 12 : 2.2)));
    this.headPitch = lerp(this.headPitch, clamp((p.lookPitch || 0) - lean * 0.7, -0.7, 0.6), 1 - Math.exp(-dt * 3));
    this.tilt = lerp(this.tilt, p.tilt || 0, 1 - Math.exp(-dt * 1.6));
    this.jaw = lerp(this.jaw, p.jaw || 0, 1 - Math.exp(-dt * 14));
    const ny = this.headYaw / 4, np = this.headPitch / 4;
    for (const n of ['neck01', 'neck02', 'neck03']) b[n].quaternion.setFromEuler(new THREE.Euler(np, ny, this.tilt * 0.2, 'YXZ'));
    b.head.quaternion.setFromEuler(new THREE.Euler(np, ny, this.tilt * 0.6, 'YXZ'));
    if (b.jaw) b.jaw.quaternion.setFromEuler(new THREE.Euler(this.jaw * 0.45, 0, 0));
    for (const s of ['L', 'R']) {
      const L = this.l[s];
      const ph = (this.phase + (s === 'L' ? 0 : 0.5)) % 1;
      const duty = lerp(0.62, 0.42, B.run);
      let fz, fy;
      if (ph < duty) { const t = ph / duty; fz = lerp(stride / 2, -stride / 2, t); fy = 0; }
      else { const t = (ph - duty) / (1 - duty); fz = lerp(-stride / 2, stride / 2, t * t * (3 - 2 * t)); fy = Math.sin(Math.PI * t) * (0.09 + 0.16 * B.run); }
      fz *= moving; fy *= moving;
      const hip = rig.wp(b['upperleg01.' + s]);
      const target = new THREE.Vector3(L.hipX * 1.02, L.ankY + fy, hip.z + fz + 0.02 * B.crouch);
      const knee = rig.ik2(hip, L.thigh, L.shin, target, new THREE.Vector3(0, 0, 1));
      rig.aim(b['upperleg01.' + s], new THREE.Vector3().subVectors(knee, hip));
      rig.aim(b['lowerleg01.' + s], new THREE.Vector3().subVectors(target, knee));
      const f = L.footFwd.clone(); f.y = 0; f.normalize();
      const pitch = ph > duty ? -0.25 * Math.sin(Math.PI * (ph - duty) / (1 - duty)) * moving : 0;
      rig.aim(b['foot.' + s], new THREE.Vector3(f.x, -0.45 + pitch, f.z));
    }
    for (const s of ['L', 'R']) {
      const sign = s === 'L' ? 1 : -1;
      const ph = (this.phase + (s === 'L' ? 0.5 : 0)) % 1;
      const swing = Math.sin(ph * Math.PI * 2);
      const armSwing = (p.armSwing ?? 0.08) * B.walk * (1 - B.run) + 0.85 * B.run;
      const up = new THREE.Vector3(0.14 * sign, -1, swing * armSwing * 0.6 + 0.05).normalize();
      const fore = new THREE.Vector3(0.05 * sign, -1, 0.12 + swing * armSwing * 0.4 + B.run * 0.9).normalize();
      if (B.reach > 0.01) {
        up.lerp(new THREE.Vector3(0.15 * sign, -0.05, 1).normalize(), B.reach).normalize();
        fore.lerp(new THREE.Vector3(0.05 * sign, 0.02, 1).normalize(), B.reach).normalize();
      }
      rig.aim(b['clavicle.' + s], new THREE.Vector3(sign, 0.02 * B.run, 0).normalize());
      rig.aim(b['upperarm01.' + s], up);
      rig.aim(b['lowerarm01.' + s], fore);
      rig.aim(b['wrist.' + s], fore);
    }
  }
}

export class SkunkAnimator {
  constructor(char) {
    this.rig = new Rig(char); this.b = char.bones;
    this.phase = 0; this.t = 0;
    this.blend = { move: 0, fast: 0, rear: 0, gas: 0, low: 0 };
    this.legs = {};
    const b = this.b;
    for (const s of ['L', 'R']) for (const f of ['f', 'b']) {
      const a = b[`${f}l1.${s}`], m = b[`${f}l2.${s}`], e = b[`${f}l3.${s}`];
      this.legs[f + s] = { a, m, e, l1: a.userData.head.distanceTo(m.userData.head), l2: m.userData.head.distanceTo(e.userData.head), rest: e.userData.head.clone() };
    }
    this.headYaw = 0; this.jaw = 0;
  }

  // p: {speed, fast, rear, gas, low, lookYaw, jaw}
  update(dt, p) {
    const rig = this.rig, b = this.b, B = this.blend;
    this.t += dt;
    const sp = p.speed || 0;
    const k = 1 - Math.exp(-dt * 7);
    B.move = lerp(B.move, clamp(sp / 0.8, 0, 1), k);
    B.fast = lerp(B.fast, p.fast ? 1 : 0, k);
    B.rear = lerp(B.rear, p.rear ? 1 : 0, 1 - Math.exp(-dt * 3));
    B.gas = lerp(B.gas, p.gas ? 1 : 0, 1 - Math.exp(-dt * 5));
    B.low = lerp(B.low, p.low ? 1 : 0, k);
    const stride = lerp(0.32, 0.75, B.fast);
    if (sp > 0.02) this.phase = (this.phase + dt * sp / (stride * 2)) % 1;
    rig.reset();
    b.root.position.y = b.root.userData.restPos.y - 0.12 * B.low + Math.sin(this.phase * Math.PI * 4) * 0.02 * B.move + 0.35 * B.rear;
    b.root.quaternion.setFromEuler(new THREE.Euler(-1.05 * B.rear, 0, Math.sin(this.phase * Math.PI * 2) * 0.05 * B.move));
    const und = Math.sin(this.phase * Math.PI * 2 + 1.2) * 0.08 * B.move;
    b.spine1.quaternion.setFromEuler(new THREE.Euler(0.05 * B.low, und, 0));
    b.spine2.quaternion.setFromEuler(new THREE.Euler(0.08 * B.low - 0.15 * B.gas, und, 0));
    const twitch = (Math.sin(this.t * 13.1) > 0.97 ? 0.4 : 0) * (1 - B.move);
    this.headYaw = lerp(this.headYaw, clamp((p.lookYaw || 0) + twitch, -1.4, 1.4), 1 - Math.exp(-dt * 9));
    b.neck.quaternion.setFromEuler(new THREE.Euler(0.15 * B.low + 0.5 * B.rear, this.headYaw * 0.5, 0));
    b.head.quaternion.setFromEuler(new THREE.Euler(-0.1 + 0.4 * B.rear + Math.sin(this.t * 6) * 0.03 * (1 - B.move), this.headYaw * 0.5, Math.sin(this.t * 0.7) * 0.15));
    this.jaw = lerp(this.jaw, p.jaw || 0, 1 - Math.exp(-dt * 16));
    b.jaw.quaternion.setFromEuler(new THREE.Euler(this.jaw * 0.6, 0, 0));
    const tq = Math.sin(this.t * 28) * 0.08 * B.gas;
    b.tail1.quaternion.setFromEuler(new THREE.Euler(-0.4 * B.gas + 0.2 * B.low + Math.sin(this.t * 1.3) * 0.08, Math.sin(this.t * 0.9) * 0.15 + tq, 0));
    b.tail2.quaternion.setFromEuler(new THREE.Euler(-0.3 * B.gas + Math.sin(this.t * 1.1 + 1) * 0.1, tq, 0));
    b.tail3.quaternion.setFromEuler(new THREE.Euler(0.2 * B.gas, Math.sin(this.t * 1.7) * 0.2 + tq, 0));
    const offs = { fL: 0, bR: 0.1, fR: 0.5, bL: 0.6 };
    for (const [key, L] of Object.entries(this.legs)) {
      const ph = (this.phase + offs[key]) % 1;
      const duty = lerp(0.6, 0.45, B.fast);
      let fz, fy;
      if (ph < duty) { const t = ph / duty; fz = lerp(stride / 2, -stride / 2, t); fy = 0; }
      else { const t = (ph - duty) / (1 - duty); fz = lerp(-stride / 2, stride / 2, t); fy = Math.sin(Math.PI * t) * (0.06 + 0.08 * B.fast); }
      fz *= B.move; fy *= B.move;
      const hip = rig.wp(L.a);
      const isFront = key[0] === 'f';
      const target = new THREE.Vector3(L.rest.x * 1.05, 0.02 + fy, L.rest.z + fz);
      if (isFront && B.rear > 0.05) target.lerp(new THREE.Vector3(L.rest.x * 0.8, hip.y - 0.12, hip.z + 0.18), B.rear);
      if (!isFront && B.rear > 0.05) target.z = lerp(target.z, hip.z + 0.05, B.rear);
      const knee = rig.ik2(hip, L.l1, L.l2, target, new THREE.Vector3(0, 0, isFront ? -1 : 1));
      rig.aim(L.a, new THREE.Vector3().subVectors(knee, hip));
      rig.aim(L.m, new THREE.Vector3().subVectors(target, knee));
      rig.aim(L.e, new THREE.Vector3(0, -0.2, 1));
    }
  }
}
