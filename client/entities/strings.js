// "Cut the strings" (Helium Voice Puppet rework, owner Oct 25 2026): during a hunt, faint
// strings run from his head, hands and knees up into the canopy to the control - a dark
// wooden crossbar hanging in the dark. They are almost invisible until a flashlight beam
// crosses them. Holding the beam on the control cuts them (decided by the sim: HV snapshot
// fields 14-17 carry the control's offset from him and the cut progress).
import * as THREE from 'three';
import { clamp, lerp } from '../../shared/math.js';

const BONES = ['head', 'wrist.L', 'wrist.R', 'lowerleg01.L', 'lowerleg01.R'];   // lowerleg01 starts at the knee
const SEG = 6;                       // segments per string (they sag and tremble)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Vector3();

export class PuppetStrings {
  constructor(scene, char) {
    this.char = char;
    this.bones = BONES.map((n) => char.bones[n] || char.bones.head);
    const n = BONES.length * SEG * 2;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    }));
    this.lines.frustumCulled = false; this.lines.visible = false; this.lines.renderOrder = 4;
    scene.add(this.lines);
    // the control: a dark wooden crossbar, the strings tied off at its ends
    const wood = new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.92, metalness: 0 });
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.05), wood); g.add(bar);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), wood); cross.position.y = 0.02; g.add(cross);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 5, 10), new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.5, metalness: 0.6 }));
    hook.position.y = 0.08; g.add(hook);
    this.ties = [[0, -0.03, 0.28], [-0.4, -0.03, 0], [0.4, -0.03, 0], [-0.2, -0.03, -0.28], [0.2, -0.03, -0.28]];
    g.visible = false; scene.add(g);
    this.control = g;
    this.flash = null;               // { on, pos, dir, cosOuter, range } set by the game each frame
    this.t = 0; this.cutT = null; this.last = new THREE.Vector3(); this.had = false;
  }

  // light falling on a point from the player's flashlight (0..1)
  _lit(p) {
    const f = this.flash;
    if (!f || !f.on) return 0;
    _v.subVectors(p, f.pos); const d = _v.length();
    if (d > f.range || d < 0.1) return 0;
    const c = _v.dot(f.dir) / d;
    return clamp((c - f.cosOuter) / Math.max(1e-3, 1 - f.cosOuter) * 1.6, 0, 1) * (1 - d / f.range) * f.k;
  }

  update(dt, view, s) {
    this.t += dt;
    const active = s && s.length > 17 && s[15] > 0.5 && view.root.visible;
    const collapse = s && s[7] & 256;
    if (active) {
      this.last.set(view.pos.x + s[14], view.pos.y + s[15], view.pos.z + s[16]);
      this.cut = s[17] || 0; this.had = true; this.cutT = null;
    } else if (this.had && collapse && this.cutT == null) this.cutT = 0;     // the strings were just cut
    else if (!collapse) this.had = false;
    if (this.cutT != null) { this.cutT += dt; if (this.cutT >= 1.1) { this.cutT = null; this.had = false; } }
    const falling = this.cutT != null;
    const show = (active || falling) && view.root.visible;
    this.lines.visible = show; this.control.visible = show && !falling;
    if (!show) return;
    view.root.updateMatrixWorld(true);
    // the control sways a little in the canopy; it shakes as the beam works at it
    const shake = (this.cut || 0) * 0.04;
    const cx = this.last.x + Math.sin(this.t * 0.6) * 0.18 + (Math.random() - 0.5) * shake;
    const cy = this.last.y + Math.sin(this.t * 0.43) * 0.06;
    const cz = this.last.z + Math.cos(this.t * 0.5) * 0.18 + (Math.random() - 0.5) * shake;
    this.control.position.set(cx, cy, cz);
    this.control.rotation.set(Math.sin(this.t * 0.7) * 0.08, view.yaw + Math.sin(this.t * 0.31) * 0.2, Math.sin(this.t * 0.9) * 0.06);
    this.control.updateMatrixWorld(true);
    let o = 0;
    const tremble = 0.015 + (this.cut || 0) * 0.05;
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i].getWorldPosition(_a);
      _b.set(...this.ties[i]).applyMatrix4(this.control.matrixWorld);
      if (falling) {
        // cut: the loose ends drop from the control and slump onto him
        const u = clamp(this.cutT / 1.1, 0, 1);
        _b.lerp(_a, u * u).y += (1 - u) * 0.3;
      }
      _c.copy(_a).lerp(_b, 0.5);
      const lit = Math.max(this._lit(_a.clone().lerp(_b, 0.25)), this._lit(_c), this._lit(_a.clone().lerp(_b, 0.75)));
      const k = (0.05 + 0.85 * lit) * (falling ? 1 - this.cutT / 1.1 : 1);
      for (let j = 0; j < SEG; j++) {
        for (const e of [j, j + 1]) {
          const u = e / SEG, sag = Math.sin(Math.PI * u) * 0.12;
          const w = Math.sin(this.t * 31 + i * 1.7 + u * 9) * tremble * Math.sin(Math.PI * u);
          this.pos[o * 3] = lerp(_a.x, _b.x, u) + w;
          this.pos[o * 3 + 1] = lerp(_a.y, _b.y, u) - sag;
          this.pos[o * 3 + 2] = lerp(_a.z, _b.z, u) + w * 0.7;
          this.col[o * 3] = 0.85 * k; this.col[o * 3 + 1] = 0.82 * k; this.col[o * 3 + 2] = 0.75 * k;
          o++;
        }
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}
