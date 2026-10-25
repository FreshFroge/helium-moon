// Local, per-player sensory effects of the terror radius: breath condensation in
// the cold, and peripheral apparitions that are gone when you look straight at them.
import * as THREE from 'three';
import { clamp, lerp } from '../../shared/math.js';
import { horrorCues } from '../../shared/horror.js';

function puffTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  for (let k = 0; k < 14; k++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 40, r = 18 + Math.random() * 28;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class BreathFX {
  constructor(scene) {
    this.tex = puffTexture();
    this.pool = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.SpriteMaterial({ map: this.tex, color: 0xdfe6ee, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 4; scene.add(s);
      this.pool.push({ s, age: 99, life: 1.6, vel: new THREE.Vector3(), a: 0 });
    }
    this.i = 0;
  }
  // strength 0..1 from temperature; light 0..1 (puffs are only really visible when lit)
  puff(camera, strength, light) {
    if (strength < 0.05) return;
    const p = this.pool[this.i++ % this.pool.length];
    const f = new THREE.Vector3(0, -0.13, -0.32).applyQuaternion(camera.quaternion);
    p.s.position.copy(camera.position).add(f);
    p.vel.set(0, 0.12, -0.55).applyQuaternion(camera.quaternion); p.vel.y = 0.08 + Math.random() * 0.06;
    p.age = 0; p.life = 1.3 + Math.random() * 0.6; p.a = strength * lerp(0.35, 1, light);
    p.s.scale.setScalar(0.12); p.s.visible = true; p.s.material.rotation = Math.random() * 6.28;
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.s.visible) continue;
      p.age += dt;
      if (p.age > p.life) { p.s.visible = false; continue; }
      const k = p.age / p.life;
      p.s.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(1 - dt * 1.2);
      p.s.scale.setScalar(0.12 + k * 0.55);
      p.s.material.opacity = p.a * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k) * 0.9;
    }
  }
}

function silhouetteTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.beginPath(); g.ellipse(64, 34, 15, 19, 0, 0, Math.PI * 2); g.fill();         // head
  g.fillRect(57, 50, 14, 12);                                                     // neck
  g.beginPath(); g.moveTo(26, 66); g.quadraticCurveTo(64, 54, 102, 66); g.lineTo(98, 140); g.quadraticCurveTo(64, 150, 30, 140); g.closePath(); g.fill();  // torso
  g.beginPath(); g.moveTo(26, 68); g.lineTo(16, 150); g.lineTo(26, 152); g.lineTo(36, 82); g.fill();       // arms hanging
  g.beginPath(); g.moveTo(102, 68); g.lineTo(112, 150); g.lineTo(102, 152); g.lineTo(92, 82); g.fill();
  g.fillRect(36, 138, 24, 112); g.fillRect(68, 138, 24, 112);                    // legs
  // a faint red cast where the shirt would be
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(70,6,6,0.9)'; g.fillRect(20, 62, 92, 76);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class AnomalyFX {
  constructor(scene, world) {
    this.world = world;
    const m = new THREE.MeshBasicMaterial({ map: silhouetteTexture(), transparent: true, alphaTest: 0.4, depthWrite: true, fog: true, color: 0x2a2a2a });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.9), m);
    this.mesh.geometry.translate(0, 0.95, 0);
    this.mesh.visible = false; scene.add(this.mesh);
    this.cool = 60; this.life = 0; this.count = 0;
  }
  reset() { this.mesh.visible = false; this.cool = 60; this.count = 0; }
  update(dt, camera, terror) {
    const m = this.mesh;
    const fwd = this._fwd || (this._fwd = new THREE.Vector3()); camera.getWorldDirection(fwd);
    if (m.visible) {
      this.life -= dt;
      const to = m.position.clone().setY(m.position.y + 1.2).sub(camera.position).normalize();
      const looked = to.dot(fwd) > Math.cos(THREE.MathUtils.degToRad(24));
      if (looked || this.life <= 0 || terror < 0.75) { m.visible = false; this.cool = 90 + Math.random() * 50; }
      else m.lookAt(camera.position.x, m.position.y, camera.position.z);
      return m.visible;
    }
    const eligible = horrorCues(terror).anomaly;
    this.cool -= dt * (eligible ? 1 : 0);
    if (this.cool > 0 || !eligible) return false;
    // somewhere 55-80 degrees off the view axis, 18-32 m out, standing in the trees
    const yaw = Math.atan2(fwd.x, fwd.z), side = Math.random() < 0.5 ? -1 : 1;
    for (let k = 0; k < 8; k++) {
      const a = yaw + side * THREE.MathUtils.degToRad(55 + Math.random() * 25), d = 18 + Math.random() * 14;
      const x = camera.position.x + Math.sin(a) * d, z = camera.position.z + Math.cos(a) * d;
      if (!this.world.isPlayable(x, z) || this.world.waterAt(x, z) !== null) continue;
      m.position.set(x, this.world.heightAt(x, z), z);
      m.visible = true; this.life = 1.5 + Math.random() * 2.5; this.count++;
      return true;
    }
    this.cool = 5;
    return false;
  }
}
