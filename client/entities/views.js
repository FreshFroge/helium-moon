// Client-side views of networked state: snapshot interpolation, the two creatures,
// teammates' avatars, and the objective / item / extraction props.
import * as THREE from 'three';
import { loadCharacter } from './character.js';
import { HeliumAnimator, SkunkAnimator } from './animators.js';
import { angleDiff, clamp, lerp } from '../../shared/math.js';
import { makeTextTexture } from '../render/textures.js';
import { patchMaterial } from '../render/shaderlib.js';
import { NOTES } from '../../shared/sim/objectives.js';
import { CONFIG } from '../../shared/config.js';

// ------------------------------------------------------------------ interpolation
export class SnapBuffer {
  constructor(angles = [], discrete = []) { this.buf = []; this.angles = new Set(angles); this.discrete = new Set(discrete); this.out = []; }
  push(t, a) {
    if (!a) return;
    const b = this.buf;
    if (b.length && t <= b[b.length - 1].t) { if (t === b[b.length - 1].t) b[b.length - 1].a = a; else b.length = 0; }
    b.push({ t, a });
    if (b.length > 40) b.shift();
  }
  clear() { this.buf.length = 0; }
  latest() { return this.buf.length ? this.buf[this.buf.length - 1].a : null; }
  sample(rt) {
    const b = this.buf;
    if (!b.length) return null;
    if (rt <= b[0].t) return b[0].a;
    let i = b.length - 1;
    if (rt >= b[i].t) return b[i].a;   // no extrapolation: hold the last state
    while (i > 0 && b[i - 1].t > rt) i--;
    const A = b[i - 1], B = b[i], k = (rt - A.t) / Math.max(1e-6, B.t - A.t);
    const o = this.out; o.length = A.a.length;
    for (let j = 0; j < A.a.length; j++) {
      const x = A.a[j], y = B.a[j];
      if (typeof x !== 'number' || this.discrete.has(j)) o[j] = k < 0.5 ? x : y;
      else if (this.angles.has(j)) o[j] = x + angleDiff(x, y) * k;
      else o[j] = x + (y - x) * k;
    }
    return o;
  }
}

// ------------------------------------------------------------------ Helium Voice
export class HeliumView {
  static async create(scene) { const v = new HeliumView(); await v._load(scene); return v; }
  async _load(scene) {
    this.char = await loadCharacter('helium');
    this.root = this.char.root; this.root.visible = false;
    scene.add(this.root);
    this.anim = new HeliumAnimator(this.char);
    this.head = this.char.bones.head;
    this.pos = new THREE.Vector3(); this.state = 0; this.flags = 8; this.speed = 0; this.yaw = 0;
    this.stepAcc = 0;
  }
  // s: [x,y,z,yaw,lookYaw,lookPitch,speed,flags,tilt,jaw,stateIdx]
  update(dt, s) {
    if (!s) { this.root.visible = false; return; }
    const [x, y, z, yaw, lookYaw, lookPitch, speed, flags, tilt, jaw, st] = s;
    const prev = this.pos.clone();
    this.pos.set(x, y, z); this.yaw = yaw; this.flags = flags; this.state = st; this.speed = speed;
    this.root.visible = !(flags & 8);
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
    this.moved = prev.distanceTo(this.pos);
    if (this.root.visible) {
      this.anim.update(dt, { speed, run: !!(flags & 1), reach: flags & 2 ? 1 : 0, still: !!(flags & 4), lookYaw: angleDiff(yaw, lookYaw), lookPitch: -lookPitch, tilt, jaw, armSwing: 0.04, snap: !!(flags & 4), unnatural: true, yaw, state: st });
    }
  }
  headPos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + 1.78, this.pos.z); }
}

// ------------------------------------------------------------------ Sulfur Hexafluoride
export class SkunkView {
  static async create(scene) { const v = new SkunkView(); await v._load(scene); return v; }
  async _load(scene) {
    this.char = await loadCharacter('sf6');
    this.root = this.char.root; this.root.visible = false;
    this.root.scale.setScalar(CONFIG.SF.MODEL_SCALE);
    scene.add(this.root);
    this.anim = new SkunkAnimator(this.char);
    this.pos = new THREE.Vector3(); this.flags = 16; this.state = 0; this.speed = 0;
    const eyes = this.char.meshes.eyes;
    if (eyes) { eyes.material = eyes.material.clone(); this.eyeMat = eyes.material; }
  }
  // s: [x,y,z,yaw,lookYaw,speed,flags,jaw,stateIdx]
  update(dt, s, shine = 0) {
    if (!s) { this.root.visible = false; return; }
    const [x, y, z, yaw, lookYaw, speed, flags, jaw, st] = s;
    this.pos.set(x, y, z); this.flags = flags; this.state = st; this.speed = speed;
    this.root.visible = !(flags & 16);
    this.root.position.copy(this.pos); this.root.rotation.y = yaw;
    if (this.root.visible) this.anim.update(dt, { speed: speed / CONFIG.SF.MODEL_SCALE, fast: !!(flags & 1), rear: !!(flags & 2), gas: !!(flags & 4), low: !!(flags & 8), lookYaw: angleDiff(yaw, lookYaw), jaw });
    // tapetum eyeshine: the eyes throw the flashlight back
    if (this.eyeMat) { const k = 0.45 + shine * 9; this.eyeMat.color.setRGB(k * 0.9, k * 0.85, k * 0.55); }
  }
  headPos(out = new THREE.Vector3()) { return this.char.bones.head.getWorldPosition(out); }
}

// ------------------------------------------------------------------ teammates
export const PLAYER_COLORS = [0x2f6d8c, 0xb5652a, 0x6b7f2e, 0x7b3f8c, 0xa8962e, 0x8c2f45];

function labelSprite(text, color) {
  const tex = makeTextTexture([{ text, font: '500 34px Inter, sans-serif', color }], { w: 256, h: 64, bg: null, pad: 12 });
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85, fog: false });
  const s = new THREE.Sprite(m); s.scale.set(0.9, 0.225, 1); s.renderOrder = 5;
  return s;
}

export class PlayerAvatar {
  static async create(scene, id, name, idx) { const v = new PlayerAvatar(); await v._load(scene, id, name, idx); return v; }
  async _load(scene, id, name, idx) {
    this.id = id; this.name = name; this.color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
    this.char = await loadCharacter('hiker', { tint: this.color });
    this.root = this.char.root; scene.add(this.root);
    this.anim = new HeliumAnimator(this.char);
    this.label = labelSprite(name, '#' + this.color.toString(16).padStart(6, '0'));
    this.label.position.y = 2.05; this.root.add(this.label);
    this.pos = new THREE.Vector3(); this.prev = new THREE.Vector3(); this.speed = 0; this.yaw = 0; this.pitch = 0;
    this.flags = 0; this.state = 0; this.health = 2; this.stride = 0; this.lie = 0; this.first = true;
  }
  // s: [id,x,y,z,yaw,pitch,flags,health,stateIdx,reviveProg,bleedT]
  update(dt, s, cameraPos) {
    const [, x, y, z, yaw, pitch, flags, health, st] = s;
    this.prev.copy(this.pos);
    this.pos.set(x, y, z);
    if (this.first) { this.prev.copy(this.pos); this.first = false; }
    const sp = dt > 0 ? Math.hypot(this.pos.x - this.prev.x, this.pos.z - this.prev.z) / dt : 0;
    this.speed = lerp(this.speed, Math.min(sp, 7), 1 - Math.exp(-dt * 8));
    this.yaw = yaw; this.pitch = pitch; this.flags = flags; this.state = st; this.health = health;
    this.root.visible = st !== 3;
    const down = st === 1 || st === 2;
    this.lie = lerp(this.lie, down ? 1 : 0, 1 - Math.exp(-dt * 4));
    this.root.position.set(x, y + this.lie * 0.18, z);
    this.root.rotation.set(-this.lie * 1.45, yaw + Math.PI, 0, 'YXZ');
    this.anim.update(dt, { speed: down ? 0 : this.speed, run: !!(flags & 4) && this.speed > 3, crouch: flags & 1 ? 1 : 0, lookYaw: 0, lookPitch: pitch * 0.8, armSwing: 0.35 });
    const d = cameraPos ? cameraPos.distanceTo(this.pos) : 0;
    this.label.material.opacity = clamp(1 - (d - 6) / 14, 0, 0.85) * (st === 2 ? 0.4 : 1);
    this.label.visible = this.label.material.opacity > 0.02;
  }
  handPos(out = new THREE.Vector3()) {
    const f = -Math.sin(this.yaw), g = -Math.cos(this.yaw);
    const h = lerp(this.flags & 1 ? 1.05 : 1.4, 0.3, this.lie);
    return out.set(this.pos.x + f * 0.35 + g * -0.18, this.pos.y + h, this.pos.z + g * 0.35 - f * -0.18);
  }
  dispose(scene) { scene.remove(this.root); }
}

// ------------------------------------------------------------------ objectives, items, extraction
const ORANGE = 0xc2581a;

function std(o, key) { return patchMaterial(new THREE.MeshStandardMaterial({ envMapIntensity: 0.35, ...o }), { key }); }

function glintTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.15, 'rgba(255,250,235,0.6)'); grd.addColorStop(1, 'rgba(255,240,220,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(32, 4); g.lineTo(32, 60); g.moveTo(4, 32); g.lineTo(60, 32); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class ObjectiveViews {
  constructor(scene, mats) {
    this.scene = scene; this.m = mats;
    this.group = new THREE.Group(); this.group.name = 'objectives'; scene.add(this.group);
    this.items = new Map(); this.stations = new Map();
    this.glintTex = glintTexture();
    // lights are created once (stable light count -> no shader recompiles)
    this.workLight = new THREE.PointLight(0xffc68a, 0, 14, 2); scene.add(this.workLight);
    this.extractLight = new THREE.PointLight(0xff2020, 0, 45, 1.6); scene.add(this.extractLight);
    this.mats = {
      redPlastic: std({ color: 0xa3170e, roughness: 0.45 }, 'redplastic'),
      orange: std({ color: ORANGE, roughness: 0.5 }, 'orangeplastic'),
      black: std({ color: 0x151515, roughness: 0.6 }, 'blackplastic'),
      gold: std({ color: 0xb08a3a, roughness: 0.35, metalness: 0.7 }, 'gold'),
      grey: std({ color: 0x8b8f92, roughness: 0.45, metalness: 0.6 }, 'greymetal'),
      ledOff: new THREE.MeshBasicMaterial({ color: 0x220806 }),
      paper: null,
    };
  }

  clear() {
    for (const c of [...this.group.children]) this.group.remove(c);
    this.items.clear(); this.stations.clear();
    this.workLight.intensity = 0; this.extractLight.intensity = 0; this.extract = null;
  }

  build(layout, world) {
    this.clear();
    this.layout = layout;
    for (const s of layout.stations) this._station(s, world);
    for (const it of layout.items) this._item(it, world);
    this._extract(layout.extract, world);
  }

  _place(obj, x, y, z, rot) { obj.position.set(x, y, z); obj.rotation.y = rot || 0; this.group.add(obj); obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return obj; }

  _station(s, world) {
    const g = new THREE.Group(), M = this.m, X = this.mats;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0x300404 }));
    if (s.kind === 'generator') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 0.46), X.redPlastic); body.position.y = 0.32; g.add(body);
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.36), X.black); tank.position.y = 0.6; g.add(tank);
      const frame = new THREE.CylinderGeometry(0.018, 0.018, 0.72, 6);
      for (const [x, z] of [[-0.34, -0.26], [0.34, -0.26], [-0.34, 0.26], [0.34, 0.26]]) { const f = new THREE.Mesh(frame, X.black); f.position.set(x, 0.36, z); g.add(f); }
      const bar = new THREE.CylinderGeometry(0.018, 0.018, 0.68, 6); bar.rotateZ(Math.PI / 2);
      for (const z of [-0.26, 0.26]) { const b = new THREE.Mesh(bar, X.black); b.position.set(0, 0.72, z); g.add(b); }
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.3), M.dark); panel.position.set(0.32, 0.35, 0); g.add(panel);
      led.position.set(0.335, 0.42, 0.1); g.add(led);
      this.workLight.position.set(s.x, s.y + 1.6, s.z);
    } else if (s.kind === 'relay') {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), M.wood); post.position.y = 0.65; g.add(post);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.2), X.grey); box.position.set(0, 1.05, 0.11); g.add(box);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.015), X.grey); door.position.set(0, 1.05, 0.22); g.add(door);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshStandardMaterial({ map: makeTextTexture([{ text: 'DANGER 240V', font: 'bold 40px Inter' }], { w: 384, h: 128, bg: '#c9a51c', fg: '#111' }), roughness: 0.6 }));
      sign.position.set(0, 1.2, 0.229); g.add(sign);
      led.position.set(0.15, 0.85, 0.23); g.add(led);
    } else {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.45, 0.42), X.grey); cab.position.y = 0.72; g.add(cab);
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.01), M.dark); vent.position.set(0, 1.25, 0.215); g.add(vent);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.18), new THREE.MeshStandardMaterial({ map: makeTextTexture([{ text: 'EMERGENCY', font: 'bold 44px Inter' }, { text: 'REPEATER CH.4', font: '30px Inter' }], { w: 384, h: 160, bg: '#d9d4c8', fg: '#7a1010' }), roughness: 0.6 }));
      sign.position.set(0, 0.95, 0.215); g.add(sign);
      led.position.set(0.22, 1.35, 0.22); g.add(led);
    }
    this._place(g, s.x, s.y, s.z, (s.rot || 0) + Math.PI);
    this.stations.set(s.id, { def: s, obj: g, led, done: false });
  }

  _item(it, world) {
    const X = this.mats;
    let g = new THREE.Group();
    if (it.kind === 'fuel') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.3, 0.32), X.redPlastic); body.position.y = 0.15; g.add(body);
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI), X.redPlastic); h.position.set(0, 0.3, -0.04); h.rotation.y = Math.PI / 2; g.add(h);
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.12, 8), X.black); sp.position.set(0, 0.33, 0.12); sp.rotation.x = 0.6; g.add(sp);
      g.rotation.z = 0.0;
    } else if (it.kind === 'fuse') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.11, 0.24), X.orange); body.position.y = 0.055; g.add(body);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.08), new THREE.MeshStandardMaterial({ map: makeTextTexture([{ text: 'FUSE KIT', font: 'bold 44px Inter' }], { w: 256, h: 96, bg: '#efe9db', fg: '#222' }) }));
      lab.rotation.x = -Math.PI / 2; lab.position.y = 0.111; g.add(lab);
    } else if (it.kind === 'battery') {
      for (let k = 0; k < 2; k++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.06, 10), k ? X.black : X.gold);
        c.rotation.z = Math.PI / 2; c.position.set(0, 0.018, k * 0.04 - 0.02); g.add(c);
        const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.03, 10), k ? X.gold : X.black);
        c2.rotation.z = Math.PI / 2; c2.position.set(0.045, 0.018, k * 0.04 - 0.02); g.add(c2);
      }
    } else if (it.kind === 'note') {
      const n = NOTES.find((q) => q.id === it.note);
      const lines = (n ? n.text : '').split('\n').slice(0, 7).map((t) => ({ text: t.length > 34 ? t.slice(0, 33) + '…' : t, font: 'italic 19px "Cormorant Garamond", Georgia, serif', lh: 1.4 }));
      const tex = makeTextTexture(lines, { w: 320, h: 420, bg: '#d8d1bd', fg: '#2a2620', align: 'left', pad: 22 });
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
      if (it.wall) { paper.position.set(0, 0, 0.02); }
      else { paper.rotation.x = -Math.PI / 2; paper.rotation.z = 0.4; paper.position.y = 0.012; }
      g.add(paper);
    }
    const y = it.wall ? it.y : (world ? world.heightAt(it.x, it.z) : it.y);
    this._place(g, it.x, y, it.z, it.rot || 0);
    if (it.wall) g.rotation.y = (it.rot || 0);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glintTex, color: 0xfff4e0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glint.scale.setScalar(0.35); glint.position.y = it.kind === 'fuel' ? 0.3 : 0.12;
    g.add(glint);
    this.items.set(it.id, { def: it, obj: g, glint, held: false, y });
  }

  _extract(ex, world) {
    if (!ex) return;
    const g = new THREE.Group(), M = this.m;
    const paint = std({ color: 0xe8e8e6, roughness: 0.3, metalness: 0.5, envMapIntensity: 0.9 }, 'policepaint');
    const s = new THREE.Shape();
    s.moveTo(-2.4, 0.32); s.lineTo(-2.45, 0.74); s.quadraticCurveTo(-2.4, 0.9, -2.1, 0.92); s.lineTo(-1.2, 0.97);
    s.quadraticCurveTo(-0.8, 1.45, -0.45, 1.47); s.lineTo(0.9, 1.47); s.quadraticCurveTo(1.25, 1.45, 1.6, 1.0);
    s.lineTo(2.3, 0.92); s.quadraticCurveTo(2.46, 0.87, 2.46, 0.64); s.lineTo(2.4, 0.32); s.closePath();
    const body = new THREE.ExtrudeGeometry(s, { depth: 1.8, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 8 });
    body.translate(0, 0, -0.9);
    const car = new THREE.Mesh(body, paint); car.rotation.y = Math.PI / 2; g.add(car);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.42, 1.9), M.dark); door.position.set(0.97, 0.62, 0); g.add(door);
    const door2 = door.clone(); door2.position.x = -0.97; g.add(door2);
    const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16); wheel.rotateZ(Math.PI / 2);
    for (const [x, z] of [[0.86, 1.5], [-0.86, 1.5], [0.86, -1.45], [-0.86, -1.45]]) { const w = new THREE.Mesh(wheel, M.rubber); w.position.set(x, 0.34, z); g.add(w); }
    const barMat = new THREE.MeshBasicMaterial({ color: 0x220000 }), barMat2 = new THREE.MeshBasicMaterial({ color: 0x000022 });
    const lb1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.25), barMat); lb1.position.set(-0.3, 1.58, 0.1); g.add(lb1);
    const lb2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.25), barMat2); lb2.position.set(0.3, 1.58, 0.1); g.add(lb2);
    const hl = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const x of [-0.6, 0.6]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.04), hl); h.position.set(x, 0.74, 2.47); g.add(h); }
    const y = world ? world.heightAt(ex.x + 4, ex.z + 3) : ex.y;
    this._place(g, ex.x + 4, y, ex.z + 3, 2.3);
    g.visible = false;
    // road flare
    const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    flare.rotation.z = 1.3;
    this._place(flare, ex.x, (world ? world.heightAt(ex.x, ex.z) : ex.y) + 0.03, ex.z, 0);
    flare.visible = false;
    this.extract = { def: ex, car: g, lb1, lb2, barMat, barMat2, flare, hl, open: false, t: 0 };
  }

  setHeld(id, held) { const it = this.items.get(id); if (it) { it.held = held; it.obj.visible = !held; } }

  // obj snapshot: {st:[[id,done,prog]], it:[heldIds], team, ex}
  apply(o) {
    if (!o) return;
    const held = new Set(o.it);
    for (const [id, it] of this.items) if (it.held !== held.has(id)) this.setHeld(id, held.has(id));
    for (const [id, done, prog] of o.st) {
      const s = this.stations.get(id); if (!s) continue;
      s.prog = prog;
      if (done && !s.done) { s.done = true; s.led.material.color.setRGB(0.2, 3, 0.4); }
    }
    if (this.extract && o.ex && !this.extract.open) { this.extract.open = true; this.extract.car.visible = true; this.extract.flare.visible = true; this.extract.hl.color.setRGB(3, 3, 2.6); }
  }

  update(dt, time, flash) {
    // retro-reflective glints when the beam sweeps across an item
    for (const it of this.items.values()) {
      if (it.held) continue;
      let k = 0;
      if (flash && flash.on) {
        const dx = it.def.x - flash.pos.x, dy = it.y + 0.15 - flash.pos.y, dz = it.def.z - flash.pos.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 32 && d > 0.6) {
          const c = (dx * flash.dir.x + dy * flash.dir.y + dz * flash.dir.z) / d;
          k = clamp((c - 0.93) / 0.05, 0, 1) * clamp(1 - d / 32, 0, 1) * flash.k;
          k *= 0.55 + 0.45 * Math.sin(time * 9 + it.def.x);
        }
      }
      it.glint.material.opacity = lerp(it.glint.material.opacity, k, 1 - Math.exp(-dt * 12));
      it.glint.visible = it.glint.material.opacity > 0.01;
    }
    const gen = this.stations.get('gen');
    this.workLight.intensity = gen && gen.done ? 9 * (0.93 + 0.07 * Math.sin(time * 37)) : 0;
    const e = this.extract;
    if (e && e.open) {
      e.t += dt;
      const ph = (e.t * 2.4) % 2, red = ph < 1, strobe = Math.sin(e.t * 40) > 0;
      e.barMat.color.setRGB(red && strobe ? 8 : 0.15, 0.02, 0.02);
      e.barMat2.color.setRGB(0.02, 0.05, !red && strobe ? 9 : 0.15);
      this.extractLight.position.set(e.car.position.x, e.car.position.y + 2, e.car.position.z);
      this.extractLight.color.setRGB(red ? 1 : 0.15, 0.08, red ? 0.06 : 1);
      this.extractLight.intensity = strobe ? 55 : 8;
      e.flare.material.color.setRGB(9 + Math.random() * 3, 1.2, 0.6);
    }
  }
}
