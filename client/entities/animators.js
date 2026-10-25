// Procedural animation for the two creatures. Limbs are posed with aim
// constraints + analytic 2-bone IK so feet plant on the ground, and every motion
// is generated from gait parameters - which lets Helium Voice move in subtly
// wrong ways (locked head, dead arms, sudden stops) without canned clips.
import * as THREE from 'three';
import { clamp, lerp } from '../../shared/math.js';

const _e = new THREE.Euler(), _aq = new THREE.Quaternion(), _aq2 = new THREE.Quaternion(), _sq = new THREE.Quaternion(), _v3 = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q2 = new THREE.Quaternion();
const _chain = [], _wpQ = new THREE.Quaternion(), _wpV = new THREE.Vector3();   // scratch for wq()/wp() (not re-entrant)

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
  // world-space (skeleton-root) rotation/position of a bone. Called many times per
  // frame per character, so the bone chain and temporaries are reused, not allocated.
  wq(bone, out = new THREE.Quaternion()) {
    out.identity();
    const chain = _chain; let n = 0;
    let b = bone; while (b && b.isBone) { chain[n++] = b; b = b.parent; }
    for (let i = n - 1; i >= 0; i--) out.multiply(chain[i].quaternion);
    return out;
  }
  wp(bone, out = new THREE.Vector3()) {
    const chain = _chain; let n = 0;
    let b = bone; while (b && b.isBone) { chain[n++] = b; b = b.parent; }
    out.set(0, 0, 0); const q = _wpQ.identity();
    for (let i = n - 1; i >= 0; i--) {
      out.add(_wpV.copy(chain[i].position).applyQuaternion(q)); q.multiply(chain[i].quaternion);
    }
    return out;
  }
  aim(bone, dir, twist = 0) {
    const P = bone.parent && bone.parent.isBone ? this.wq(bone.parent, _q2) : _q2.identity();
    const W = _aq.setFromUnitVectors(bone.userData.bindDir, _v.copy(dir).normalize());
    if (twist) W.premultiply(_aq2.setFromAxisAngle(_v2.copy(dir).normalize(), twist));
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
    this.l = {}; this.feet = {};
    for (const s of ['L', 'R']) {
      const hip = b['upperleg01.' + s].userData.head, knee = b['lowerleg01.' + s].userData.head, ank = b['foot.' + s].userData.head;
      const sh = b['upperarm01.' + s].userData.head, el = b['lowerarm01.' + s].userData.head, wr = b['wrist.' + s].userData.head;
      this.l[s] = {
        thigh: hip.distanceTo(knee), shin: knee.distanceTo(ank),
        thighDir: knee.clone().sub(hip).normalize(), shinDir: ank.clone().sub(knee).normalize(),
        upperDir: el.clone().sub(sh).normalize(), foreDir: wr.clone().sub(el).normalize(),
        upper: sh.distanceTo(el), fore: el.distanceTo(wr),
        hipX: hip.x, ankX: ank.x, ankY: ank.y, ankZ: ank.z,
        footFwd: b['foot.' + s].userData.bindDir.clone(),
      };
      this.feet[s] = { target: ank.clone(), contact: true, roll: 0 };
    }
    this.phase = 0; this.t = 0;
    this.headYaw = 0; this.headPitch = 0; this.tilt = 0; this.jaw = 0;
    this.speed = 0; this.accel = 0; this.turn = 0; this.lastYaw = null; this.torsoYaw = 0;
    this.blend = { walk: 0, run: 0, crouch: 0, reach: 0, still: 0, stalk: 0, crawl: 0 };
    this.hands = {};
  }

  // MakeHuman's thigh, shin and arms each contain intermediate bones. Aim the
  // complete segment, not the short first bone, so the solved ankle really lands
  // on its target instead of floating or cutting through the ground.
  _aimSegment(bone, bindDir, dir) {
    const parent = bone.parent && bone.parent.isBone ? this.rig.wq(bone.parent, _sq) : _sq.identity();
    const aim = _aq.setFromUnitVectors(bindDir, _v3.copy(dir).normalize());
    bone.quaternion.copy(parent.invert()).multiply(aim);
  }

  _ground(p, x, z) {
    const height = p.ground ? p.ground(x, z) : 0;
    return Number.isFinite(height) ? height : 0;
  }

  _groundTilt(p, x = 0, z = 0) {
    const r = 0.12;
    const sx = clamp((this._ground(p, x + r, z) - this._ground(p, x - r, z)) / (2 * r), -0.65, 0.65);
    const sz = clamp((this._ground(p, x, z + r) - this._ground(p, x, z - r)) / (2 * r), -0.65, 0.65);
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-sx, 1, -sz).normalize());
  }

  _fitGroundContact(anchor, target, length, p, clearance) {
    // Shorten a stride that exceeds limb reach, then resample under the new
    // contact position. On a slope the shortened stride has a different height.
    for (let i = 0; i < 5; i++) {
      target.y = this._ground(p, target.x, target.z) + clearance;
      const dy = target.y - anchor.y, dx = target.x - anchor.x, dz = target.z - anchor.z;
      const horizontal = Math.hypot(dx, dz), reach = Math.sqrt(Math.max(0, length * length - dy * dy));
      if (horizontal <= reach || horizontal < 1e-6) break;
      target.x = anchor.x + dx * reach / horizontal;
      target.z = anchor.z + dz * reach / horizontal;
    }
    target.y = clamp(this._ground(p, target.x, target.z) + clearance, anchor.y - length, anchor.y + length);
  }

  // `unnatural` is opt-in: teammate avatars share this rig, but never receive
  // Helium Voice's asymmetric stalking, delayed torso turns or idle weight shifts.
  // p: {speed, run, crouch, reach, still, lookYaw, lookPitch, tilt, jaw,
  //     armSwing, snap, unnatural, yaw, state, ground(localX,localZ)}
  update(dt, p) {
    const rig = this.rig, b = this.b, B = this.blend;
    this.t += dt;
    const sp = Math.max(0, p.speed || 0), creature = p.unnatural ? 1 : 0;
    const k = 1 - Math.exp(-dt * 6);
    const oldSpeed = this.speed;
    this.speed = lerp(this.speed, sp, 1 - Math.exp(-dt * 9));
    if (dt > 0) this.accel = lerp(this.accel, clamp((this.speed - oldSpeed) / dt, -8, 8), 1 - Math.exp(-dt * 7));
    if (Number.isFinite(p.yaw)) {
      if (this.lastYaw !== null && dt > 0) {
        const d = Math.atan2(Math.sin(p.yaw - this.lastYaw), Math.cos(p.yaw - this.lastYaw));
        this.turn = lerp(this.turn, clamp(d / dt, -3, 3), 1 - Math.exp(-dt * 8));
      }
      this.lastYaw = p.yaw;
    } else this.turn = lerp(this.turn, 0, k);
    B.walk = lerp(B.walk, clamp(sp / 1.4, 0, 1), k);
    B.run = lerp(B.run, p.run ? 1 : 0, 1 - Math.exp(-dt * 4));
    B.crouch = lerp(B.crouch, p.crouch || 0, k);
    B.reach = lerp(B.reach, p.reach || 0, 1 - Math.exp(-dt * 10));
    B.still = lerp(B.still, p.still ? 1 : 0, 1 - Math.exp(-dt * 8));
    const stalking = creature && !p.run && (p.state === 3 || p.state === 4 || p.state === 7 || p.state === 9);
    B.stalk = lerp(B.stalk, stalking ? 1 : 0, k);
    B.crawl = lerp(B.crawl, creature && p.crawl ? 1 : 0, 1 - Math.exp(-dt * 22));
    const stride = lerp(0.66, 1.1, B.run) * (1 - 0.08 * B.stalk);
    if (sp > 0.02) this.phase = (this.phase + dt * sp / (stride * 2)) % 1;
    rig.reset();
    const moving = clamp(this.speed / 0.5, 0, 1);
    const free = 1 - B.still;
    const cycle = this.phase * Math.PI * 2;
    const idle = (1 - B.walk) * free * creature;
    const weight = (Math.sin(this.t * 0.53) + 0.35 * Math.sin(this.t * 0.19 + 0.8)) * 0.013 * idle;
    const drive = this.accel * 0.012 * creature * free;
    const bank = -this.turn * 0.025 * moving * creature * free;
    const lean = 0.06 * B.walk + 0.38 * B.run + 0.25 * B.crouch + 0.3 * B.reach + drive;
    const bob = Math.abs(Math.sin(cycle)) * (0.025 * B.walk + 0.06 * B.run) * moving;
    const breathe = free * Math.sin(this.t * 1.7) * 0.012;
    b.root.position.x = b.root.userData.restPos.x + weight + Math.sin(cycle) * 0.012 * B.walk * creature * free;
    b.root.position.y = b.root.userData.restPos.y - 0.04 * B.walk - 0.15 * B.run - 0.22 * B.crouch + bob;
    if (creature && p.ground) {
      // Lower the pelvis toward the downhill support rather than stretching
      // the downhill leg or leaving its foot suspended above the terrain.
      const low = Math.min(this._ground(p, 0.2, 0), this._ground(p, -0.2, 0), this._ground(p, 0, -0.4));
      b.root.position.y += clamp(low, -0.25, 0.12);
    }
    b.root.quaternion.setFromEuler(_e.set(0, 0, bank + weight * 0.55, 'XYZ'));
    // The torso follows a glance later and less far than the head. The residual
    // look angle stays in the neck, so turning the chest cannot double the gaze.
    this.torsoYaw = lerp(this.torsoYaw, clamp((p.lookYaw || 0) * 0.22, -0.3, 0.3) * creature,
      1 - Math.exp(-dt * (p.still ? 0.7 : 1.7)));
    const gaitYaw = Math.sin(cycle) * 0.035 * moving * free;
    for (const n of ['spine05', 'spine04', 'spine03', 'spine02']) {
      b[n].quaternion.setFromEuler(_e.set(lean / 4 + breathe * 0.3,
        this.torsoYaw / 5 + gaitYaw,
        -bank * 0.18, 'XYZ'));
    }
    b.spine01.quaternion.setFromEuler(_e.set(breathe, this.torsoYaw / 5, -weight * 0.3, 'XYZ'));
    this.headYaw = lerp(this.headYaw, clamp((p.lookYaw || 0) - this.torsoYaw - gaitYaw * 4 * creature, -1.95, 1.95),
      1 - Math.exp(-dt * (p.snap ? 12 : creature ? 3.4 : 2.2)));
    this.headPitch = lerp(this.headPitch, clamp((p.lookPitch || 0) - lean * 0.7, -0.7, 0.6), 1 - Math.exp(-dt * 3));
    this.tilt = lerp(this.tilt, p.tilt || 0, 1 - Math.exp(-dt * 1.6));
    this.jaw = lerp(this.jaw, p.jaw || 0, 1 - Math.exp(-dt * 14));
    const ny = this.headYaw / 4, np = this.headPitch / 4;
    for (const n of ['neck01', 'neck02', 'neck03']) b[n].quaternion.setFromEuler(_e.set(np, ny, this.tilt * 0.2, 'YXZ'));
    b.head.quaternion.setFromEuler(_e.set(np, ny, this.tilt * 0.6, 'YXZ'));
    if (b.jaw) b.jaw.quaternion.setFromEuler(_e.set(this.jaw * 0.45, 0, 0, 'XYZ'));
    for (const s of ['L', 'R']) {
      const L = this.l[s], foot = this.feet[s], sign = s === 'L' ? 1 : -1;
      // A small stance-time mismatch makes the stalk deliberate and uncomfortable
      // without changing the authoritative movement speed or making a zombie gait.
      const ph = (this.phase + (s === 'L' ? 0 : 0.5) + 1) % 1;
      const duty = lerp(0.62, 0.42, B.run) + sign * 0.025 * B.stalk;
      let fz, fy, roll;
      foot.contact = ph < duty || moving < 0.03;
      if (ph < duty) {
        const t = ph / duty;
        fz = lerp(stride / 2, -stride / 2, t); fy = 0;
        // Heel strike, a flat mid-stance, then a small toe-off.
        roll = -0.16 * Math.pow(Math.max(0, 1 - t * 4), 2)
          + 0.23 * Math.pow(Math.max(0, (t - 0.72) / 0.28), 2);
      } else {
        const t = (ph - duty) / (1 - duty), ease = t * t * (3 - 2 * t);
        fz = lerp(-stride / 2, stride / 2, ease);
        fy = Math.sin(Math.PI * t) * (0.09 + 0.16 * B.run);
        roll = -0.12 * Math.sin(Math.PI * t);
      }
      fz *= moving; fy *= moving; foot.roll = roll * moving;
      const hip = rig.wp(b['upperleg01.' + s]);
      // Ankle targets stay on the support plane while pelvis/chest shift above
      // them; lateral body sway no longer drags both planted feet with it.
      const target = foot.target.set(lerp(L.ankX, L.hipX * 1.04, B.walk), L.ankY + fy,
        L.ankZ + fz + 0.02 * B.crouch);
      // Keep the support height when a long step approaches full extension;
      // shorten its horizontal reach instead of lifting a planted ankle.
      this._fitGroundContact(hip, target, L.thigh + L.shin - 0.002, p, L.ankY + fy);
      const knee = rig.ik2(hip, L.thigh, L.shin, target, new THREE.Vector3(0, 0, 1));
      this._aimSegment(b['upperleg01.' + s], L.thighDir, new THREE.Vector3().subVectors(knee, hip));
      this._aimSegment(b['lowerleg01.' + s], L.shinDir, new THREE.Vector3().subVectors(target, knee));
      const f = L.footFwd.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), foot.roll);
      if (p.ground) f.applyQuaternion(this._groundTilt(p, target.x, target.z));
      rig.aim(b['foot.' + s], f);
    }
    for (const s of ['L', 'R']) {
      const sign = s === 'L' ? 1 : -1, L = this.l[s];
      const ph = (this.phase + (s === 'L' ? 0.5 : 0)) % 1;
      const swing = Math.sin(ph * Math.PI * 2 + sign * B.stalk * 0.16);
      const armSwing = (p.armSwing ?? 0.08) * B.walk * (1 - B.run) + 0.85 * B.run;
      const lag = B.stalk * sign * 0.025 + this.accel * 0.005 * creature * free;
      const up = new THREE.Vector3(0.14 * sign, -1, swing * armSwing * 0.6 + 0.05 - lag).normalize();
      const fore = new THREE.Vector3(0.05 * sign, -1, 0.12 + swing * armSwing * 0.4 + B.run * 0.9 - lag).normalize();
      if (B.reach > 0.01) {
        up.lerp(new THREE.Vector3(0.15 * sign, -0.05, 1).normalize(), B.reach).normalize();
        fore.lerp(new THREE.Vector3(0.05 * sign, 0.02, 1).normalize(), B.reach).normalize();
      }
      rig.aim(b['clavicle.' + s], new THREE.Vector3(sign, 0.02 * B.run, 0).normalize());
      this._aimSegment(b['upperarm01.' + s], L.upperDir, up);
      this._aimSegment(b['lowerarm01.' + s], L.foreDir, fore);
      rig.aim(b['wrist.' + s], fore);
    }
    if (B.crawl > 0.001) this._reverseCrawl(B.crawl, sp, p);
  }

  _reverseCrawl(blend, speed, p) {
    const rig = this.rig, b = this.b, cycle = this.phase * Math.PI * 2;
    // Hips high, chest low, head craned back toward the player. The body faces
    // opposite authoritative travel; planted limbs sweep forward in local space.
    b.root.position.y = lerp(b.root.position.y, 0.78 + Math.sin(cycle * 2) * 0.025, blend);
    const q = new THREE.Quaternion().setFromEuler(_e.set(1.95, 0, Math.sin(cycle) * 0.045, 'XYZ'));
    if (p.ground) q.premultiply(this._groundTilt(p));
    b.root.quaternion.slerp(q, blend);
    for (const n of ['spine05', 'spine04', 'spine03', 'spine02', 'spine01']) {
      q.setFromEuler(_e.set(-0.015, Math.sin(cycle + 0.7) * 0.015, 0, 'XYZ'));
      b[n].quaternion.slerp(q, blend);
    }
    for (const n of ['neck01', 'neck02', 'neck03', 'head']) {
      q.setFromEuler(_e.set(n === 'head' ? -0.65 : -0.39, this.headYaw * 0.18, this.tilt * 0.15, 'XYZ'));
      b[n].quaternion.slerp(q, blend);
    }
    const moving = clamp(speed / 0.5, 0, 1);
    const contact = (phase) => {
      const ph = (phase + 1) % 1, duty = 0.57;
      if (ph < duty) return { z: lerp(-0.34, 0.34, ph / duty) * moving, y: 0, planted: true };
      const t = (ph - duty) / (1 - duty), ease = t * t * (3 - 2 * t);
      return { z: lerp(0.34, -0.34, ease) * moving, y: Math.sin(t * Math.PI) * 0.16 * moving, planted: false };
    };
    for (const side of ['L', 'R']) {
      const L = this.l[side], sign = side === 'L' ? 1 : -1;
      const foot = this.feet[side], f = contact(this.phase + (side === 'L' ? 0 : 0.5));
      foot.target.lerp(new THREE.Vector3(sign * 0.28, L.ankY + f.y, -0.4 + f.z), blend);
      foot.contact = f.planted; foot.roll = 0;
      const hip = rig.wp(b['upperleg01.' + side]);
      this._fitGroundContact(hip, foot.target, L.thigh + L.shin - 0.002, p, L.ankY + f.y);
      const knee = rig.ik2(hip, L.thigh, L.shin, foot.target, new THREE.Vector3(sign * 0.65, 0, 1));
      this._aimSegment(b['upperleg01.' + side], L.thighDir, new THREE.Vector3().subVectors(knee, hip));
      this._aimSegment(b['lowerleg01.' + side], L.shinDir, new THREE.Vector3().subVectors(foot.target, knee));
      rig.aim(b['foot.' + side], new THREE.Vector3(0, 0, 1).applyQuaternion(this._groundTilt(p, foot.target.x, foot.target.z)));
      // Diagonal hand/foot pairs scuttle in a reverse bear gait. Solve the arms
      // as well as the legs, keeping palms close to the actual support plane.
      const hand = contact(this.phase + (side === 'L' ? 0.5 : 0));
      const target = rig.wp(b['wrist.' + side]).lerp(new THREE.Vector3(sign * 0.36, 0.11 + hand.y, 0.62 + hand.z), blend);
      const shoulder = rig.wp(b['upperarm01.' + side]);
      // Blend the support height during the quick upright-to-crawl transition.
      const clearance = lerp(target.y - this._ground(p, target.x, target.z), 0.11 + hand.y, blend);
      this._fitGroundContact(shoulder, target, L.upper + L.fore - 0.002, p, clearance);
      const elbow = rig.ik2(shoulder, L.upper, L.fore, target, new THREE.Vector3(sign, 0.2, -0.4));
      this._aimSegment(b['upperarm01.' + side], L.upperDir, new THREE.Vector3().subVectors(elbow, shoulder));
      this._aimSegment(b['lowerarm01.' + side], L.foreDir, new THREE.Vector3().subVectors(target, elbow));
      rig.aim(b['wrist.' + side], new THREE.Vector3(sign * 0.1, -0.4, 1).applyQuaternion(this._groundTilt(p, target.x, target.z)));
      this.hands[side] = { target, contact: hand.planted };
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
    b.root.quaternion.setFromEuler(_e.set(-1.05 * B.rear, 0, Math.sin(this.phase * Math.PI * 2) * 0.05 * B.move, 'XYZ'));
    const und = Math.sin(this.phase * Math.PI * 2 + 1.2) * 0.08 * B.move;
    b.spine1.quaternion.setFromEuler(_e.set(0.05 * B.low, und, 0, 'XYZ'));
    b.spine2.quaternion.setFromEuler(_e.set(0.08 * B.low - 0.15 * B.gas, und, 0, 'XYZ'));
    const twitch = (Math.sin(this.t * 13.1) > 0.97 ? 0.4 : 0) * (1 - B.move);
    this.headYaw = lerp(this.headYaw, clamp((p.lookYaw || 0) + twitch, -1.4, 1.4), 1 - Math.exp(-dt * 9));
    b.neck.quaternion.setFromEuler(_e.set(0.15 * B.low + 0.5 * B.rear, this.headYaw * 0.5, 0, 'XYZ'));
    b.head.quaternion.setFromEuler(_e.set(-0.1 + 0.4 * B.rear + Math.sin(this.t * 6) * 0.03 * (1 - B.move), this.headYaw * 0.5, Math.sin(this.t * 0.7) * 0.15, 'XYZ'));
    this.jaw = lerp(this.jaw, p.jaw || 0, 1 - Math.exp(-dt * 16));
    b.jaw.quaternion.setFromEuler(_e.set(this.jaw * 0.6, 0, 0, 'XYZ'));
    const tq = Math.sin(this.t * 28) * 0.08 * B.gas;
    b.tail1.quaternion.setFromEuler(_e.set(-0.4 * B.gas + 0.2 * B.low + Math.sin(this.t * 1.3) * 0.08, Math.sin(this.t * 0.9) * 0.15 + tq, 0, 'XYZ'));
    b.tail2.quaternion.setFromEuler(_e.set(-0.3 * B.gas + Math.sin(this.t * 1.1 + 1) * 0.1, tq, 0, 'XYZ'));
    b.tail3.quaternion.setFromEuler(_e.set(0.2 * B.gas, Math.sin(this.t * 1.7) * 0.2 + tq, 0, 'XYZ'));
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
