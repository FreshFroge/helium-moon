// Handheld flashlight: projected beam cookie, shadowing, hand lag/sway, battery,
// and supernatural flicker driven by the terror radius.
import * as THREE from 'three';
import { CONFIG } from '../../shared/config.js';
import { makeFlashlightCookie } from '../render/textures.js';
import { clamp, lerp } from '../../shared/math.js';
import { horrorCues } from '../../shared/horror.js';

const F = CONFIG.FLASHLIGHT;

export class Flashlight {
  constructor(scene, preset) {
    const L = this.light = new THREE.SpotLight(0xfff1dc, 0, F.RANGE, THREE.MathUtils.degToRad(F.ANGLE_DEG), preset.spotShadow ? 0.25 : 0.6, 1.6);
    L.castShadow = !!preset.spotShadow;
    // the projected cookie relies on the shadow camera matrices, so only use it with shadows
    if (L.castShadow) L.map = makeFlashlightCookie(256);
    L.shadow.mapSize.set(1024, 1024);
    L.shadow.bias = -0.0006; L.shadow.normalBias = 0.03;
    L.shadow.camera.near = 0.3; L.shadow.camera.far = F.RANGE;
    scene.add(L); scene.add(L.target);
    this.on = true; this.battery = 1;
    this.handQ = new THREE.Quaternion(); this.handPos = new THREE.Vector3();
    this.flicker = 1; this.flickerT = 0;
    this.dir = new THREE.Vector3(0, 0, -1);
    this.clickCb = null;
    // per-frame scratch (no garbage in update)
    this._off = new THREE.Vector3(); this._sway = new THREE.Euler(); this._swayQ = new THREE.Quaternion(); this._q = new THREE.Quaternion();
  }

  snap(camera) { this.handQ.copy(camera.quaternion); }

  toggle() {
    if (this.battery <= 0 && !this.on) { this.clickCb && this.clickCb(false, true); return; }
    this.on = !this.on;
    this.clickCb && this.clickCb(this.on, false);
  }

  addBattery(frac) { this.battery = Math.min(1, this.battery + frac); }

  update(dt, camera, terror, opts = {}) {
    this.handQ.slerp(camera.quaternion, 1 - Math.exp(-dt * 14));
    const off = this._off.set(0.18, -0.2, -0.15).applyQuaternion(camera.quaternion);
    this.handPos.copy(camera.position).add(off);
    const t = performance.now() * 0.001;
    const sway = this._sway.set(Math.sin(t * 1.3) * 0.006 + (opts.walkBob || 0) * 0.01, Math.sin(t * 0.9) * 0.008, 0);
    const q = this._q.copy(this.handQ).multiply(this._swayQ.setFromEuler(sway));
    this.dir.set(0, 0, -1).applyQuaternion(q);
    // in his grab the beam is jammed up into his face from chest height, shaking (opts.aimAt)
    this.drop = lerp(this.drop || 0, opts.aimAt ? 1 : 0, 1 - Math.exp(-dt * (opts.aimAt ? 12 : 3)));
    if (opts.aimAt) {
      this._aim = (this._aim || new THREE.Vector3()).subVectors(opts.aimAt, this.handPos).normalize();
      this._aim.x += Math.sin(t * 23) * 0.025; this._aim.y += Math.sin(t * 17 + 1) * 0.02;
    }
    if (this.drop > 0.001 && this._aim) { this.dir.lerp(this._aim, this.drop).normalize(); }
    this.light.position.copy(this.handPos);
    this.light.target.position.copy(this.handPos).addScaledVector(this.dir, 10);
    this.light.target.updateMatrixWorld();
    if (this.on) {
      this.battery = Math.max(0, this.battery - dt / F.BATTERY_SECONDS);
      if (this.battery <= 0) { this.on = false; this.clickCb && this.clickCb(false, true); }
    }
    this.flickerT -= dt;
    if (this.flickerT <= 0) {
      const low = this.battery < F.LOW ? (1 - this.battery / F.LOW) : 0;
      const p = low * 0.25 + horrorCues(terror).flicker * 0.14 + (opts.gas || 0) * 0.2;
      if (Math.random() < p) {
        // A healthy light only wavers near him; low battery and gas retain their
        // stronger failure cues independently of supernatural proximity.
        this.flicker = low > 0 || opts.gas > 0.1 ? (Math.random() < 0.4 ? 0.05 : 0.35 + Math.random() * 0.4) : 0.65 + Math.random() * 0.25;
        this.flickerT = 0.03 + Math.random() * 0.12;
      }
      else { this.flicker = 1; this.flickerT = 0.08 + Math.random() * 0.4; }
    }
    const batt = this.battery < 0.3 ? lerp(0.45, 1, this.battery / 0.3) : 1;
    const target = this.on && !opts.off ? F.INTENSITY * this.flicker * batt * (1 - 0.8 * (this.drop || 0)) : 0;
    this.light.intensity = lerp(this.light.intensity, target, 1 - Math.exp(-dt * 40));
    this.light.color.setRGB(1, lerp(0.82, 0.945, batt), lerp(0.6, 0.86, batt));
  }
}
