// Man-made structures of the refuge: trailhead lot, red/white pipe gate, signs, the
// Stinchcomb granite monument, pump house, wildlife blind, ranger shed, abandoned
// camp, slough footbridge, repeater mast, highway bridge, fence and power line.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from './shaderlib.js';
import { makeTextTexture } from './textures.js';
import { makeRng } from '../../shared/math.js';
import { CONFIG } from '../../shared/config.js';

class Builder {
  constructor() { this.parts = new Map(); }
  add(key, geo, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g);
  }
}

export const M = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

export function boxUV(w, h, d, uvScale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny > 0.5) uv.setXY(i, x / uvScale, z / uvScale);
    else if (nx > 0.5) uv.setXY(i, z / uvScale, y / uvScale);
    else uv.setXY(i, x / uvScale, y / uvScale);
  }
  return g;
}

export function makePropMaterials(T) {
  const std = (o, key) => patchMaterial(new THREE.MeshStandardMaterial({ envMapIntensity: 0.3, ...o }), { key });
  return {
    wood: std({ map: T.wood_c, normalMap: T.wood_n, roughness: 0.9, color: 0x9a9286 }, 'wood'),
    woodDark: std({ map: T.wood_c, normalMap: T.wood_n, roughness: 0.92, color: 0x5d5245 }, 'wooddark'),
    concrete: std({ map: T.concrete_c, normalMap: T.concrete_n, roughness: 0.95 }, 'concrete'),
    metal: std({ map: T.metal_c, roughness: 0.5, metalness: 0.75, color: 0xb0b4b8 }, 'metal'),
    corr: std({ map: T.metal_c, normalMap: T.corrugated_n, roughness: 0.55, metalness: 0.7, color: 0xa7abae }, 'corr'),
    red: std({ color: 0x9a1812, roughness: 0.45, metalness: 0.3 }, 'red'),
    white: std({ color: 0xd8d6d0, roughness: 0.5, metalness: 0.2 }, 'white'),
    dark: std({ color: 0x1a1b1d, roughness: 0.7 }, 'dark'),
    rubber: std({ color: 0x111111, roughness: 0.85 }, 'rubber'),
    glass: std({ color: 0x0b0e12, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.2 }, 'glass'),
    granite: std({ map: T.granite_c, roughness: 0.55, color: 0xb9b9bd }, 'granite'),
    gravel: std({ map: T.gravel_c, normalMap: T.gravel_n, roughness: 0.95, color: 0xb0aaa0 }, 'gravel'),
    asphalt: std({ map: T.concrete_c, roughness: 0.9, color: 0x3a3a3c }, 'asphalt'),
    fabric: std({ color: 0x3d5a48, roughness: 0.85, side: THREE.DoubleSide }, 'fabric'),
    orange: std({ color: 0xa2521c, roughness: 0.6 }, 'orange'),
    yellow: std({ color: 0xb08a1c, roughness: 0.55, metalness: 0.2 }, 'yellow'),
    stone: std({ map: T.concrete_c, roughness: 0.95, color: 0x8a8278 }, 'stone'),
    pole: std({ map: T.bark_oak_c, roughness: 0.95, color: 0x6b6054 }, 'pole'),
  };
}

export class Props {
  constructor(world, bank) {
    this.world = world;
    this.group = new THREE.Group(); this.group.name = 'props';
    this.dynamic = [];
    this.mats = makePropMaterials(bank.tex);
    const B = this.B = new Builder();
    for (const o of world.structures) {
      const fn = this['_' + o.type];
      if (fn) fn.call(this, o, B);
    }
    this._fence(B);
    this._powerLine(B);
    for (const [key, list] of B.parts) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.mats[key]);
      mesh.castShadow = key !== 'gravel' && key !== 'asphalt';
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  W(o, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return M(o.x, o.y, o.z, o.rot).multiply(M(x, y, z, ry, rx, rz, sx, sy, sz));
  }

  _lot(o, B) {
    const w = this.world, seg = 24;
    const g = new THREE.PlaneGeometry(o.hx * 2, o.hz * 2, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), lz = pos.getZ(i);
      const wx = o.x + lx * c + lz * s, wz = o.z - lx * s + lz * c;
      pos.setXYZ(i, wx, w.heightAt(wx, wz) + 0.04, wz);
      uv.setXY(i, lx / 3, lz / 3);
    }
    g.computeVertexNormals();
    B.add('gravel', g, new THREE.Matrix4());
    for (let i = -3; i <= 3; i++) {
      const lx = i * 3.2, lz = -o.hz + 1.2;
      const wx = o.x + lx * c + lz * s, wz = o.z - lx * s + lz * c;
      B.add('concrete', boxUV(1.8, 0.14, 0.25), M(wx, w.heightAt(wx, wz) + 0.1, wz, o.rot));
    }
  }

  _kiosk(o, B) {
    for (const x of [-1.25, 1.25]) B.add('woodDark', boxUV(0.16, 2.9, 0.16), this.W(o, x, 1.45, 0));
    B.add('woodDark', boxUV(3.1, 0.08, 1.2), this.W(o, 0, 2.95, 0, 0, 0.18));
    B.add('wood', boxUV(2.4, 1.3, 0.06), this.W(o, 0, 1.55, 0.03));
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ map: this._mapBoardTexture(), roughness: 0.6 }), { key: 'kioskmap' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.15), mat);
    m.applyMatrix4(this.W(o, 0, 1.55, 0.065));
    m.receiveShadow = true;
    this.group.add(m);
  }

  _mapBoardTexture() {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 540;
    const g = cv.getContext('2d');
    g.fillStyle = '#d9d2bd'; g.fillRect(0, 0, 1024, 540);
    g.fillStyle = '#4a3b2a'; g.fillRect(0, 0, 1024, 70);
    g.fillStyle = '#efe6c8'; g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center';
    g.fillText('STINCHCOMB WILDLIFE REFUGE', 512, 50);
    g.fillStyle = '#7c8f6a'; g.fillRect(40, 90, 620, 420);
    const w = this.world;
    const xs = w.trail.map((p) => p[0]), zs = w.trail.map((p) => p[1]);
    const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60, minZ = Math.min(...zs) - 60, maxZ = Math.max(...zs) + 60;
    const sc = Math.min(600 / (maxX - minX), 400 / (maxZ - minZ));
    const P = (p) => [50 + (p[0] - minX) * sc, 100 + (p[1] - minZ) * sc];
    g.strokeStyle = '#5b7da3'; g.lineWidth = 7; g.beginPath();
    w.river.forEach((p, i) => { const [x, y] = P(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    g.strokeStyle = '#8a2d1d'; g.lineWidth = 4; g.setLineDash([10, 6]); g.beginPath();
    w.trail.forEach((p, i) => { const [x, y] = P(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
    const [sx, sy] = P(w.trail[0]);
    g.fillStyle = '#c0261d'; g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222'; g.font = 'bold 18px Arial'; g.textAlign = 'left'; g.fillText('YOU ARE HERE', sx - 140, sy + 6);
    g.font = '20px Arial'; g.fillStyle = '#2a2a2a';
    ['EAST TRAIL (old River Road)', 'Open 5:00 AM - 11:00 PM', '', 'NO motorized vehicles', 'Stay on marked trails', 'Waterfowl hunting area -', '  seasonal closures apply', '', 'Report emergencies:', 'Ranger radio at the', 'maintenance shed']
      .forEach((l, i) => g.fillText(l, 690, 120 + i * 32));
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  _car(o, B) {
    const key = 'car' + o.color.toString(16);
    if (!this.mats[key]) this.mats[key] = patchMaterial(new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.32, metalness: 0.55, envMapIntensity: 0.8 }), { key: 'carpaint' });
    const s = new THREE.Shape();
    s.moveTo(-2.3, 0.32); s.lineTo(-2.35, 0.72); s.quadraticCurveTo(-2.3, 0.88, -2.05, 0.9); s.lineTo(-1.1, 0.95);
    s.quadraticCurveTo(-0.75, 1.42, -0.4, 1.44); s.lineTo(0.85, 1.44); s.quadraticCurveTo(1.2, 1.42, 1.55, 0.98);
    s.lineTo(2.2, 0.9); s.quadraticCurveTo(2.36, 0.85, 2.36, 0.62); s.lineTo(2.3, 0.32); s.closePath();
    const body = new THREE.ExtrudeGeometry(s, { depth: 1.72, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 8 });
    body.translate(0, 0, -0.86);
    B.add(key, body, this.W(o, 0, 0, 0, Math.PI / 2));
    const w = new THREE.Shape();
    w.moveTo(-1.02, 0.98); w.quadraticCurveTo(-0.72, 1.38, -0.4, 1.39); w.lineTo(0.84, 1.39); w.quadraticCurveTo(1.15, 1.37, 1.46, 0.99); w.closePath();
    const wg = new THREE.ExtrudeGeometry(w, { depth: 1.8, bevelEnabled: false });
    wg.translate(0, 0, -0.9);
    B.add('glass', wg, this.W(o, 0, 0.01, 0, Math.PI / 2));
    const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16); wheel.rotateZ(Math.PI / 2);
    for (const [x, z] of [[0.82, 1.45], [-0.82, 1.45], [0.82, -1.4], [-0.82, -1.4]]) B.add('rubber', wheel, this.W(o, x, 0.34, z));
    for (const x of [-0.6, 0.6]) B.add('white', boxUV(0.32, 0.12, 0.04), this.W(o, x, 0.72, 2.37));
    for (const x of [-0.65, 0.65]) B.add('red', boxUV(0.3, 0.1, 0.04), this.W(o, x, 0.78, -2.36));
  }

  _gate(o, B) {
    for (const x of [-2.4, 2.4]) B.add('white', new THREE.CylinderGeometry(0.09, 0.09, 1.5, 10), this.W(o, x, 0.65, 0));
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      const L = 4.4 / stripes;
      const x = -2.2 + L * (i + 0.5);
      const g = new THREE.CylinderGeometry(0.055, 0.055, L, 10); g.rotateZ(Math.PI / 2);
      B.add(i % 2 ? 'white' : 'red', g, this.W(o, x, 1.08, 0.12));
      const g2 = new THREE.CylinderGeometry(0.045, 0.045, L, 8); g2.rotateZ(Math.PI / 2);
      B.add(i % 2 ? 'white' : 'red', g2, this.W(o, x, 0.55, 0.12));
    }
    const brace = new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8);
    B.add('red', brace, this.W(o, -1.0, 0.82, 0.12, 0, 0, 1.3));
    B.add('red', brace, this.W(o, -1.0, 0.82, 0.12, 0, 0, -1.3));
    B.add('metal', boxUV(0.14, 0.14, 0.12), this.W(o, 2.25, 1.08, 0.12));
  }

  _sign(o, B) {
    const tex = makeTextTexture([
      { text: 'STINCHCOMB', font: 'bold 92px Georgia, serif' },
      { text: 'WILDLIFE REFUGE', font: 'bold 64px Georgia, serif' },
      { text: 'OKLAHOMA CITY · YUKON · BETHANY', font: '28px Georgia, serif', color: '#e8dca6' },
    ], { w: 1024, h: 360, bg: '#4b3420', fg: '#efd890', pad: 40, border: '#d9c27a' });
    for (const x of [-1.5, 1.5]) B.add('woodDark', boxUV(0.2, 2.6, 0.2), this.W(o, x, 1.3, 0));
    const mat = patchMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), { key: 'signface' });
    const back = new THREE.Mesh(boxUV(3.4, 1.2, 0.1), this.mats.woodDark); back.applyMatrix4(this.W(o, 0, 1.75, 0)); back.castShadow = true; this.group.add(back);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.12), mat); face.applyMatrix4(this.W(o, 0, 1.75, 0.056)); this.group.add(face);
  }

  _warning(o, B) {
    B.add('metal', new THREE.CylinderGeometry(0.04, 0.04, 3.0, 8), this.W(o, 0, 1.5, 0));
    const t1 = makeTextTexture([
      { text: 'WARNING!', font: 'bold 120px Arial, sans-serif', color: '#c4121a' },
      { text: 'MIGRATORY WATERFOWL HUNTING AREA', font: 'bold 34px Arial', color: '#111' },
      { text: 'Hunting permitted in season.', font: '30px Arial', color: '#222' },
      { text: 'Stay on trails. Wear blaze orange.', font: '30px Arial', color: '#222' },
      { text: 'STINCHCOMB WILDLIFE REFUGE', font: 'bold 32px Arial', color: '#c4121a' },
    ], { w: 900, h: 640, bg: '#f2f0ea', pad: 50, lineH: 1.45 });
    const t2 = makeTextTexture([{ text: 'NO MOTOR', font: 'bold 44px Arial' }, { text: 'VEHICLES', font: 'bold 44px Arial' }], { w: 256, h: 160, bg: '#f2f0ea', pad: 26 });
    const mk = (tex, w, h, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), patchMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide }), { key: 'signpanel' }));
      m.applyMatrix4(this.W(o, 0, y, 0.05)); m.castShadow = true; this.group.add(m);
    };
    mk(t1, 0.9, 0.64, 1.75); mk(t2, 0.4, 0.25, 2.4);
  }

  _monument(o, B) {
    // granite marker: "Stinchcomb Wildlife Refuge Monument - dedicated to Lee and Sarah Stinchcomb, '49ers, by their children"
    const w = this.world;
    B.add('gravel', new THREE.CylinderGeometry(1.7, 1.9, 0.08, 20), M(o.x, w.heightAt(o.x, o.z) + 0.02, o.z));
    const stone = new THREE.BoxGeometry(1.0, 0.62, 0.36, 4, 3, 2);
    const rng = makeRng(42);
    const p = stone.attributes.position;
    for (let i = 0; i < p.count; i++) { if (p.getY(i) > 0.2) p.setY(i, p.getY(i) + (rng() - 0.5) * 0.08); p.setX(i, p.getX(i) * (1 + (rng() - 0.5) * 0.04)); }
    stone.computeVertexNormals();
    B.add('granite', stone, this.W(o, 0, 0.3, 0, 0, -0.18));
    const tex = makeTextTexture([
      { text: 'STINCHCOMB', font: 'bold 54px Georgia, serif' },
      { text: 'WILDLIFE REFUGE MONUMENT', font: '34px Georgia, serif' },
      { text: 'DEDICATED TO', font: '30px Georgia, serif' },
      { text: 'LEE AND SARAH', font: '34px Georgia, serif' },
      { text: "STINCHCOMB, '49ER'S", font: '34px Georgia, serif' },
      { text: 'BY THEIR CHILDREN', font: '30px Georgia, serif' },
    ], { w: 640, h: 400, bg: null, fg: 'rgba(40,40,44,0.92)', pad: 26, lineH: 1.3, emboss: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.5), patchMaterial(new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), { key: 'engrave' }));
    m.applyMatrix4(this.W(o, 0, 0.3, 0.19, 0, -0.18));
    this.group.add(m);
  }

  _streetlight(o, B) {
    B.add('pole', new THREE.CylinderGeometry(0.13, 0.17, 8.5, 10), this.W(o, 0, 4.25, 0));
    B.add('metal', new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), this.W(o, 0, 7.9, 1.0, 0, Math.PI / 2 - 0.15));
    B.add('metal', boxUV(0.35, 0.16, 0.7), this.W(o, 0, 7.95, 2.1));
    const L = new THREE.PointLight(0xffb070, 0, 26, 2);
    L.position.copy(new THREE.Vector3(0, 7.75, 2.1).applyMatrix4(M(o.x, o.y, o.z, o.rot)));
    this.group.add(L);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    bulb.position.copy(L.position); this.group.add(bulb);
    this.dynamic.push({ kind: 'sodium', light: L, bulb, t: 0 });
  }

  _bench(o, B) {
    for (const x of [-0.75, 0.75]) B.add('concrete', boxUV(0.12, 0.45, 0.45), this.W(o, x, 0.22, 0));
    for (const z of [-0.14, 0, 0.14]) B.add('wood', boxUV(1.8, 0.05, 0.12), this.W(o, 0, 0.47, z));
    B.add('wood', boxUV(1.8, 0.12, 0.05), this.W(o, 0, 0.78, -0.24, 0, -0.2));
  }

  _pumphouse(o, B) {
    B.add('concrete', boxUV(3.5, 2.8, 3.5, 2), this.W(o, 0, 1.4, 0));
    B.add('concrete', boxUV(3.8, 0.18, 3.8, 2), this.W(o, 0, 2.88, 0));
    B.add('corr', boxUV(1.0, 2.0, 0.06), this.W(o, 0.6, 1.05, 1.76));
    B.add('dark', boxUV(0.6, 0.35, 0.06), this.W(o, -0.9, 2.1, 1.76));
    B.add('metal', new THREE.CylinderGeometry(0.1, 0.1, 1.4, 10), this.W(o, -1.95, 0.7, -0.8));
    const pipe = new THREE.CylinderGeometry(0.1, 0.1, 1.2, 10); pipe.rotateZ(Math.PI / 2);
    B.add('metal', pipe, this.W(o, -2.4, 1.3, -0.8));
    B.add('metal', new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8), this.W(o, 1.2, 3.4, -1.1));
  }

  _blind(o, B) {
    for (const [x, z] of [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.2], [1.7, 1.2]]) B.add('woodDark', boxUV(0.14, 0.9, 0.14), this.W(o, x, 0.2, z));
    B.add('wood', boxUV(3.6, 0.1, 2.6), this.W(o, 0, 0.62, 0));
    B.add('wood', boxUV(3.6, 1.95, 0.08), this.W(o, 0, 1.6, -1.27));
    B.add('wood', boxUV(0.08, 1.95, 2.6), this.W(o, -1.77, 1.6, 0));
    B.add('wood', boxUV(0.08, 1.95, 2.6), this.W(o, 1.77, 1.6, 0));
    B.add('wood', boxUV(3.6, 0.95, 0.08), this.W(o, 0, 1.12, 1.27));
    B.add('wood', boxUV(3.6, 0.45, 0.08), this.W(o, 0, 2.33, 1.27));
    B.add('woodDark', boxUV(4.0, 0.08, 3.2), this.W(o, 0, 2.7, 0, 0, 0.12));
    B.add('wood', boxUV(0.8, 0.08, 2.0), this.W(o, -0.8, 0.95, -1.9, 0, -0.6));
  }

  _shed(o, B) {
    B.add('concrete', boxUV(6.4, 0.2, 4.4, 2), this.W(o, 0, 0.1, 0));
    B.add('corr', boxUV(6.2, 2.6, 0.06), this.W(o, 0, 1.5, -2.1));
    B.add('corr', boxUV(0.06, 2.6, 4.2), this.W(o, -3.1, 1.5, 0));
    B.add('corr', boxUV(0.06, 2.6, 4.2), this.W(o, 3.1, 1.5, 0));
    B.add('corr', boxUV(3.2, 2.6, 0.06), this.W(o, -1.5, 1.5, 2.1));
    B.add('corr', boxUV(1.6, 0.6, 0.06), this.W(o, 2.3, 2.5, 2.1));
    B.add('corr', boxUV(1.6, 1.0, 0.05), this.W(o, 2.3, 1.85, 2.15));
    const roof = boxUV(3.5, 0.06, 4.8);
    B.add('corr', roof, this.W(o, -1.6, 3.15, 0, 0, 0, 0.32));
    B.add('corr', roof, this.W(o, 1.6, 3.15, 0, 0, 0, -0.32));
    B.add('woodDark', boxUV(2.0, 0.08, 0.8), this.W(o, -1.8, 0.95, -1.6));
    for (const x of [-2.7, -0.9]) for (const z of [-1.9, -1.3]) B.add('woodDark', boxUV(0.08, 0.85, 0.08), this.W(o, x, 0.5, z));
    B.add('orange', boxUV(0.8, 0.6, 0.6), this.W(o, 1.8, 0.5, -1.3));
    B.add('metal', new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), this.W(o, -2.6, 0.65, 1.4));
  }

  _camp(o, B) {
    const tent = new THREE.SphereGeometry(1.35, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const rng = makeRng(9);
    const p = tent.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, p.getY(i) * (0.45 + 0.3 * Math.sin(p.getX(i) * 2.0) * 0.5) + (rng() - 0.5) * 0.06);
      p.setX(i, p.getX(i) * 1.15);
    }
    tent.computeVertexNormals();
    B.add('fabric', tent, this.W(o, -2.0, 0.0, -1.2, 0.4));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      B.add('stone', new THREE.DodecahedronGeometry(0.16 + rng() * 0.06, 0), this.W(o, 1.2 + Math.cos(a) * 0.55, 0.08, 0.6 + Math.sin(a) * 0.55, rng() * 3));
    }
    B.add('dark', boxUV(0.7, 0.04, 0.7), this.W(o, 1.2, 0.03, 0.6));
    B.add('white', boxUV(0.7, 0.4, 0.42), this.W(o, -0.1, 0.2, 1.6, 0.4));
    B.add('fabric', boxUV(0.5, 0.05, 0.5), this.W(o, 2.6, 0.08, -0.4, 0.9, 1.4));
    for (const [x, z] of [[2.4, -0.6], [2.8, -0.2]]) B.add('metal', new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5), this.W(o, x, 0.2, z, 0, 1.3));
  }

  _footbridge(o, B) {
    const L = o.length, w = this.world;
    const deckLocalY = o.deckY - o.y;
    for (let i = 0; i < Math.round(L / 0.32); i++) {
      const z = -L / 2 + 0.16 + i * 0.32;
      B.add('wood', boxUV(2.6, 0.06, 0.28), this.W(o, 0, deckLocalY - 0.03, z, 0, 0, (i % 3 - 1) * 0.01));
    }
    for (const x of [-1.05, 1.05]) B.add('woodDark', boxUV(0.14, 0.22, L), this.W(o, x, deckLocalY - 0.14, 0));
    for (let i = 0; i <= 4; i++) {
      const z = -L / 2 + (L / 4) * i;
      for (const x of [-1.25, 1.25]) {
        const gy = w.heightAt(o.x + Math.sin(o.rot) * z + Math.cos(o.rot) * x, o.z + Math.cos(o.rot) * z - Math.sin(o.rot) * x) - o.y;
        const h = deckLocalY + 1.0 - gy + 0.3;
        B.add('woodDark', boxUV(0.12, h, 0.12), this.W(o, x, gy - 0.3 + h / 2, z));
      }
      B.add('woodDark', boxUV(2.65, 0.16, 0.16), this.W(o, 0, deckLocalY - 0.22, z));
    }
    for (const x of [-1.25, 1.25]) B.add('wood', boxUV(0.08, 0.1, L), this.W(o, x, deckLocalY + 0.95, 0));
    // Timber approaches meet the actual banks; their geometry and deckAt()
    // share the same endpoints so players do not climb invisible steps.
    for (const side of [-1, 1]) {
      const bankY = o.bankY[side < 0 ? 0 : 1] - o.y;
      const slope = side * Math.atan2(deckLocalY - bankY, o.rampLength);
      const count = Math.ceil(o.rampLength / 0.32), step = o.rampLength / count;
      for (let i = 0; i < count; i++) {
        const along = (i + 0.5) * step;
        const y = deckLocalY + (bankY - deckLocalY) * along / o.rampLength;
        B.add('wood', boxUV(2.6, 0.06, step - 0.025), this.W(o, 0, y - 0.03, side * (L / 2 + along), 0, slope));
      }
      // Grounded end sill carries the span and buries into the bank.
      const z = side * L / 2;
      const gy = w.heightAt(o.x + Math.sin(o.rot) * z, o.z + Math.cos(o.rot) * z) - o.y;
      const h = Math.max(0.22, deckLocalY - gy + 0.18);
      B.add('woodDark', boxUV(2.7, h, 0.3), this.W(o, 0, deckLocalY - h / 2 - 0.06, z));
    }
  }

  _fishing(o, B) {
    B.add('fabric', boxUV(0.5, 0.04, 0.45), this.W(o, 0, 0.42, 0));
    B.add('fabric', boxUV(0.5, 0.45, 0.04), this.W(o, 0, 0.66, -0.24, 0, -0.2));
    for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) B.add('metal', new THREE.CylinderGeometry(0.012, 0.012, 0.45, 5), this.W(o, x, 0.2, z));
    B.add('white', new THREE.CylinderGeometry(0.15, 0.13, 0.36, 12), this.W(o, 0.6, 0.18, 0.3));
    B.add('dark', new THREE.CylinderGeometry(0.008, 0.012, 2.4, 5), this.W(o, -0.5, 0.75, 0.9, 0, 1.0));
  }

  _mast(o, B) {
    const H = 24, legs = 3, R0 = 1.1, R1 = 0.35;
    const legPts = [];
    for (let l = 0; l < legs; l++) { const a = (l / legs) * Math.PI * 2; legPts.push([Math.cos(a), Math.sin(a)]); }
    const seg = 12;
    for (let s = 0; s < seg; s++) {
      const y0 = (s / seg) * H, y1 = ((s + 1) / seg) * H;
      const r0 = R0 + (R1 - R0) * (s / seg), r1 = R0 + (R1 - R0) * ((s + 1) / seg);
      for (let l = 0; l < legs; l++) {
        const [cx, cz] = legPts[l], [nx, nz] = legPts[(l + 1) % legs];
        const a = new THREE.Vector3(cx * r0, y0, cz * r0), b = new THREE.Vector3(cx * r1, y1, cz * r1);
        this._rod(B, 'metal', o, a, b, 0.035);
        this._rod(B, 'metal', o, a, new THREE.Vector3(nx * r1, y1, nz * r1), 0.012);
        this._rod(B, 'metal', o, b, new THREE.Vector3(nx * r1, y1, nz * r1), 0.012);
        this._rod(B, 'metal', o, new THREE.Vector3(nx * r0, y0, nz * r0), b, 0.012);
      }
    }
    B.add('metal', boxUV(0.9, 1.4, 0.6), this.W(o, 1.8, 0.7, 0.4));
    B.add('concrete', boxUV(1.4, 0.15, 1.0), this.W(o, 1.8, 0.05, 0.4));
    B.add('metal', new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), this.W(o, 0.3, H + 0.6, 0));
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    beacon.position.copy(new THREE.Vector3(0, H + 0.3, 0).applyMatrix4(M(o.x, o.y, o.z, o.rot)));
    this.group.add(beacon);
    const L = new THREE.PointLight(0xff2010, 0, 30, 2); L.position.copy(beacon.position); this.group.add(L);
    this.dynamic.push({ kind: 'beacon', light: L, bulb: beacon, t: 0 });
  }

  _rod(B, key, o, a, b, r) {
    const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, 5); g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    B.add(key, g, M(o.x, o.y, o.z, o.rot).multiply(new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1))));
  }

  _highwaybridge(o, B) {
    const w = this.world, hw = w.highway;
    const segL = 8;
    for (let x = hw.x0; x < hw.x1; x += segL) {
      const cx = x + segL / 2;
      const rd = w.riverDistAt(cx, hw.z);
      const ground = w.heightAt(cx, hw.z);
      const deckY = rd < 30 ? hw.embank : Math.max(ground, hw.embank - 0.3);
      B.add('asphalt', boxUV(segL + 0.05, 0.3, hw.halfW * 2, 4), M(cx, deckY + 0.05, hw.z));
      for (const side of [-1, 1]) {
        B.add('metal', boxUV(segL, 0.32, 0.08), M(cx, deckY + 0.75, hw.z + side * (hw.halfW - 0.4)));
        B.add('metal', boxUV(0.12, 0.75, 0.12), M(cx, deckY + 0.4, hw.z + side * (hw.halfW - 0.45)));
      }
      B.add('white', boxUV(segL * 0.45, 0.02, 0.12), M(cx, deckY + 0.21, hw.z));
      if (rd < 30) {
        B.add('concrete', boxUV(segL, 1.2, hw.halfW * 2 + 0.6, 2), M(cx, deckY - 0.6, hw.z));
        if (Math.round(cx / segL) % 3 === 0) B.add('concrete', new THREE.CylinderGeometry(0.7, 0.8, deckY - CONFIG.WATER_LEVEL + 3, 12), M(cx, (deckY + CONFIG.WATER_LEVEL - 3) / 2, hw.z));
      }
    }
  }

  _fence(B) {
    const posts = this.world.fencePosts;
    const g = new THREE.CylinderGeometry(0.05, 0.06, 1.45, 6);
    for (const [x, y, z, d] of posts) B.add('pole', g, M(x, y + 0.6, z, d, 0, (Math.abs(x) * 13 % 1) * 0.08));
    const verts = [];
    for (let i = 1; i < posts.length; i++) {
      const a = posts[i - 1], b = posts[i];
      if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 5) continue;
      for (const h of [0.45, 0.8, 1.15]) verts.push(a[0], a[1] + h, a[2], b[0], b[1] + h - 0.02, b[2]);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x0c0d0f, transparent: true, opacity: 0.8 })));
  }

  _powerLine(B) {
    const poles = this.world.powerPoles;
    const g = new THREE.CylinderGeometry(0.13, 0.18, 10, 8);
    const arm = boxUV(2.2, 0.12, 0.12);
    const verts = [];
    for (let i = 0; i < poles.length; i++) {
      const [x, y, z, d] = poles[i];
      B.add('pole', g, M(x, y + 4.6, z, d));
      B.add('pole', arm, M(x, y + 9.2, z, d + Math.PI / 2));
      if (i > 0) {
        const [x0, y0, z0, d0] = poles[i - 1];
        if (Math.hypot(x - x0, z - z0) > 70) continue;
        for (const off of [-0.95, 0, 0.95]) {
          const ox0 = Math.cos(d0) * off, oz0 = -Math.sin(d0) * off, ox1 = Math.cos(d) * off, oz1 = -Math.sin(d) * off;
          const n = 8;
          for (let k = 0; k < n; k++) {
            const t0 = k / n, t1 = (k + 1) / n;
            const sag = (t) => -Math.sin(Math.PI * t) * 0.9;
            verts.push(x0 + ox0 + (x + ox1 - x0 - ox0) * t0, y0 + 9.3 + (y - y0) * t0 + sag(t0), z0 + oz0 + (z + oz1 - z0 - oz0) * t0,
              x0 + ox0 + (x + ox1 - x0 - ox0) * t1, y0 + 9.3 + (y - y0) * t1 + sag(t1), z0 + oz0 + (z + oz1 - z0 - oz0) * t1);
          }
        }
      }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x07080a })));
  }

  update(dt, time) {
    for (const d of this.dynamic) {
      if (d.kind === 'beacon') {
        const on = (time % 2.2) < 0.9;
        d.light.intensity = on ? 6 : 0;
        d.bulb.material.color.setRGB(on ? 6 : 0.1, on ? 0.4 : 0.01, on ? 0.2 : 0.01);
      } else if (d.kind === 'sodium') {
        d.t -= dt;
        if (d.t < 0) { d.t = 0.05 + Math.random() * (Math.random() < 0.1 ? 3 : 0.25); d.state = Math.random() < 0.18; }
        const k = d.state ? 0.6 + Math.random() * 0.4 : 0;
        d.light.intensity = k * 28;
        d.bulb.material.color.setRGB(k * 8, k * 4, k * 1.5);
      }
    }
  }
}
