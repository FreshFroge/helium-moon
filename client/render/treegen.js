// Procedural tree / bush geometry generator. Produces bark tubes with parallel-
// transport frames, root flare and gnarl, plus leaf-cluster cards with canopy
// normals and a per-vertex sway weight used by the wind shader.
import * as THREE from 'three';
import { makeRng, makeNoise2 } from '../../shared/math.js';

export const TREE_PRESETS = {
  // levels: [childCount, angle(deg), lengthRatio, radiusRatio, startT]
  oak:        { trunkLen: 0.42, gnarl: 0.32, levels: [[6, 62, 0.62, 0.55, 0.35], [5, 50, 0.55, 0.5, 0.2], [4, 45, 0.5, 0.5, 0.15]], up: 0.18, leafSize: 1.5, leafDensity: 1.0, leafStart: 0.25, crownSpread: 1.0, flare: 0.45 },
  sycamore:   { trunkLen: 0.5,  gnarl: 0.18, levels: [[5, 42, 0.55, 0.52, 0.45], [5, 45, 0.55, 0.5, 0.2], [4, 40, 0.5, 0.5, 0.15]], up: 0.35, leafSize: 1.7, leafDensity: 0.9, leafStart: 0.3, crownSpread: 0.85, flare: 0.35 },
  cottonwood: { trunkLen: 0.48, gnarl: 0.2,  levels: [[5, 34, 0.58, 0.55, 0.4], [5, 40, 0.55, 0.5, 0.2], [4, 38, 0.5, 0.5, 0.15]], up: 0.45, leafSize: 1.7, leafDensity: 1.0, leafStart: 0.3, crownSpread: 0.8, flare: 0.5 },
  elm:        { trunkLen: 0.36, gnarl: 0.16, levels: [[5, 38, 0.66, 0.55, 0.4], [4, 52, 0.55, 0.5, 0.2], [4, 50, 0.5, 0.5, 0.15]], up: 0.1, leafSize: 1.5, leafDensity: 0.95, leafStart: 0.3, crownSpread: 1.1, flare: 0.3, droop: 0.25 },
  hackberry:  { trunkLen: 0.34, gnarl: 0.35, levels: [[5, 55, 0.6, 0.55, 0.3], [4, 50, 0.55, 0.5, 0.2], [3, 45, 0.5, 0.5, 0.15]], up: 0.12, leafSize: 1.35, leafDensity: 0.9, leafStart: 0.25, crownSpread: 0.95, flare: 0.3 },
  snag:       { trunkLen: 0.8,  gnarl: 0.35, levels: [[3, 55, 0.35, 0.45, 0.4], [2, 50, 0.45, 0.5, 0.2]], up: 0.1, leafSize: 0, leafDensity: 0, broken: true, flare: 0.4 },
  cedar:      { cedar: true, trunkLen: 1.0, gnarl: 0.1, levels: [], leafSize: 1.0, leafDensity: 1.0, flare: 0.25 },
  sapling:    { trunkLen: 0.55, gnarl: 0.25, levels: [[4, 48, 0.55, 0.5, 0.35], [3, 45, 0.5, 0.5, 0.2]], up: 0.25, leafSize: 1.0, leafDensity: 0.8, leafStart: 0.2, crownSpread: 0.9, flare: 0.1 },
  bush:       { bush: true, stems: 7, leafSize: 0.85, leafDensity: 1.0 },
  tangle:     { bush: true, stems: 11, leafSize: 0.7, leafDensity: 0.75, tangle: true },
};

class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.sway = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

function anyPerp(v) {
  const a = Math.abs(v.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(v, a).normalize();
}

// Generates a tree. lod: 0 full, 1 reduced, 2 far.
export function generateTree(presetName, seed, height, lod = 0) {
  const P = TREE_PRESETS[presetName];
  const rng = makeRng(seed);
  const noise = makeNoise2(seed + 5);
  const bark = new GeoBuilder(), leaves = new GeoBuilder();
  const radialByLevel = lod === 0 ? [12, 7, 5, 3] : lod === 1 ? [7, 5, 3, 3] : [5, 3, 3, 3];
  const segByLevel = lod === 0 ? [14, 8, 5, 3] : lod === 1 ? [7, 4, 3, 2] : [4, 2, 2, 2];
  const maxLevel = lod === 0 ? 3 : lod === 1 ? 2 : 1;
  const leafCards = [];
  const crownCenter = new THREE.Vector3(0, height * 0.66, 0);
  const trunkR = height * (presetName === 'cottonwood' ? 0.028 : presetName === 'sycamore' ? 0.024 : presetName === 'cedar' ? 0.025 : 0.022) * (presetName === 'sapling' ? 0.55 : 1);

  function tube(points, radii, level, uvScale, swayBase) {
    const radial = radialByLevel[Math.min(level, 3)];
    const n = points.length;
    const tangents = [];
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
      tangents.push(new THREE.Vector3().subVectors(b, a).normalize());
    }
    const normal = anyPerp(tangents[0]);
    const base = bark.count;
    let along = 0;
    const circ = 2 * Math.PI * Math.max(radii[0], 0.02);
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const axis = new THREE.Vector3().crossVectors(tangents[i - 1], tangents[i]);
        const l = axis.length();
        if (l > 1e-6) { axis.divideScalar(l); normal.applyAxisAngle(axis, Math.acos(Math.min(1, Math.max(-1, tangents[i - 1].dot(tangents[i]))))); }
        along += points[i].distanceTo(points[i - 1]);
      }
      const binormal = new THREE.Vector3().crossVectors(tangents[i], normal).normalize();
      const r = radii[i];
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        let rr = r;
        if (level === 0 && P.flare) rr = r * (1 + Math.exp(-points[i].y * 2.4) * P.flare * (1 + 0.55 * Math.sin(a * 5 + seed)));
        const cx = Math.cos(a), sx = Math.sin(a);
        const nx = normal.x * cx + binormal.x * sx, ny = normal.y * cx + binormal.y * sx, nz = normal.z * cx + binormal.z * sx;
        bark.pos.push(points[i].x + nx * rr, points[i].y + ny * rr, points[i].z + nz * rr);
        bark.nor.push(nx, ny, nz);
        bark.uv.push((j / radial) * Math.max(1, Math.round(circ / 1.2)), along / uvScale);
        const hf = points[i].y / height;
        bark.sway.push(level === 0 ? hf * hf * 0.05 : swayBase + (i / (n - 1)) * 0.25 * level);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
      const a = base + i * (radial + 1) + j, b = a + radial + 1;
      bark.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  function branch(level, start, dir, length, radius, swayBase) {
    const segs = segByLevel[Math.min(level, 3)];
    const pts = [start.clone()], radii = [radius];
    const d = dir.clone();
    const p = start.clone();
    const gn = P.gnarl * (level === 0 ? 0.6 : 1);
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      d.x += noise(seed * 0.1 + level * 7 + i * 0.7, start.x * 0.3) * gn * 0.35;
      d.z += noise(seed * 0.1 + level * 3 + i * 0.7 + 50, start.z * 0.3) * gn * 0.35;
      d.y += (P.up || 0) * 0.08 * (level > 0 ? 1 : 0.3) - (P.droop || 0) * t * 0.12 * level;
      if (level === 0) { d.x *= 0.9; d.z *= 0.9; d.y = Math.max(d.y, 0.85); }
      d.normalize();
      p.addScaledVector(d, length / segs);
      pts.push(p.clone());
      const taper = level === 0 ? Math.pow(1 - t * 0.82, 1.1) : Math.pow(1 - t * 0.9, 1.0);
      radii.push(Math.max(radius * taper, 0.006));
    }
    if (P.broken && level === 0) radii[radii.length - 1] = radius * 0.4;
    tube(pts, radii, level, level === 0 ? 2.2 : 1.4, swayBase);
    const lvl = P.levels[level];
    if (level < P.levels.length && level < maxLevel && lvl) {
      const [count, angDeg, lenRatio, radRatio, startT] = lvl;
      const cnt = Math.max(1, Math.round(count * (lod === 2 && level === 0 ? 0.7 : 1) * (0.75 + rng() * 0.5)));
      for (let c = 0; c < cnt; c++) {
        const t = startT + (1 - startT) * ((c + rng() * 0.6) / cnt);
        const idx = Math.min(pts.length - 1, Math.floor(t * (pts.length - 1)));
        const bp = pts[idx];
        const baseR = radii[idx];
        const tangent = new THREE.Vector3().subVectors(pts[Math.min(pts.length - 1, idx + 1)], pts[Math.max(0, idx - 1)]).normalize();
        const ang = THREE.MathUtils.degToRad(angDeg * (0.75 + rng() * 0.5));
        const perp = anyPerp(tangent);
        perp.applyAxisAngle(tangent, (c / cnt) * Math.PI * 2 + rng() * 1.2 + level * 1.7);
        const cd = tangent.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang)).normalize();
        if (level === 0) cd.y = Math.max(cd.y, 0.15 + (P.up || 0));
        cd.normalize();
        const remain = level === 0 ? 1 - t * 0.55 : 1 - t * 0.4;
        const clen = length * lenRatio * remain * (0.8 + rng() * 0.4) * (level === 0 ? (P.crownSpread || 1) : 1);
        const crad = Math.min(baseR * 0.92, radius * radRatio * (0.8 + rng() * 0.3));
        if (P.broken && rng() < 0.4) continue;
        branch(level + 1, bp, cd, clen, crad, swayBase + 0.1 + level * 0.15);
      }
    }
    if (P.leafSize > 0 && (level >= Math.min(2, maxLevel) || (level >= 1 && level === maxLevel))) {
      const n = Math.max(1, Math.round(length * (lod === 0 ? 2.1 : lod === 1 ? 1.1 : 0.6) * P.leafDensity));
      for (let k = 0; k < n; k++) {
        const t = (P.leafStart || 0.2) + (1 - (P.leafStart || 0.2)) * rng();
        const idx = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
        const c = pts[idx].clone().add(new THREE.Vector3((rng() - 0.5) * 0.6, (rng() - 0.3) * 0.5, (rng() - 0.5) * 0.6));
        leafCards.push({ c, size: P.leafSize * (0.7 + rng() * 0.6) * (lod === 0 ? 1 : lod === 1 ? 1.45 : 2.1), sway: 0.35 + level * 0.15 });
      }
    }
  }

  if (P.cedar) {
    const pts = [], radii = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(noise(i * 0.4, seed) * 0.12 * t, t * height, noise(seed, i * 0.4) * 0.12 * t)); radii.push(trunkR * (1 - t * 0.9)); }
    tube(pts, radii, 0, 2.2, 0);
    const n = Math.round(height * (lod === 0 ? 26 : lod === 1 ? 12 : 6));
    for (let k = 0; k < n; k++) {
      const h = 0.12 + 0.88 * Math.pow(rng(), 0.8);
      const R = (1 - h) * height * 0.3 + 0.25;
      const a = rng() * Math.PI * 2, rr = R * Math.sqrt(rng());
      leafCards.push({ c: new THREE.Vector3(Math.cos(a) * rr, h * height, Math.sin(a) * rr), size: (0.9 + rng() * 0.6) * (lod === 0 ? 1 : lod === 1 ? 1.5 : 2.2), sway: 0.25 + h * 0.3 });
    }
    crownCenter.set(0, height * 0.45, 0);
  } else if (P.bush) {
    for (let s = 0; s < P.stems; s++) {
      const a = rng() * Math.PI * 2;
      const start = new THREE.Vector3(Math.cos(a) * 0.15 * rng(), 0, Math.sin(a) * 0.15 * rng());
      const dir = new THREE.Vector3(Math.cos(a) * (P.tangle ? 0.9 : 0.45), 1, Math.sin(a) * (P.tangle ? 0.9 : 0.45)).normalize();
      const len = height * (0.6 + rng() * 0.6);
      const segs = lod === 0 ? 4 : 2;
      const pts = [start.clone()], radii = [0.02];
      const p = start.clone(), d = dir.clone();
      for (let i = 1; i <= segs; i++) {
        d.y -= P.tangle ? 0.25 : 0.08; d.x += (rng() - 0.5) * 0.4; d.z += (rng() - 0.5) * 0.4; d.normalize();
        p.addScaledVector(d, len / segs); pts.push(p.clone()); radii.push(0.02 * (1 - i / segs) + 0.004);
        const nl = Math.round((lod === 0 ? 3 : 2) * P.leafDensity);
        for (let k = 0; k < nl; k++) leafCards.push({ c: p.clone().add(new THREE.Vector3((rng() - 0.5) * 0.5, (rng() - 0.5) * 0.35, (rng() - 0.5) * 0.5)), size: P.leafSize * (0.7 + rng() * 0.6) * (lod === 0 ? 1 : 1.4), sway: 0.5 });
      }
      if (lod === 0) tube(pts, radii, 2, 1, 0.2);
    }
    crownCenter.set(0, height * 0.45, 0);
  } else {
    const trunkLen = height * P.trunkLen * 1.25;
    const lean = new THREE.Vector3((rng() - 0.5) * 0.12, 1, (rng() - 0.5) * 0.12).normalize();
    branch(0, new THREE.Vector3(0, -0.4, 0), lean, presetName === 'snag' ? height * 0.95 : Math.max(trunkLen, height * 0.55), trunkR, 0);
  }

  for (const L of leafCards) {
    const s = L.size;
    const out = new THREE.Vector3().subVectors(L.c, crownCenter); out.y *= 0.6;
    if (out.lengthSq() < 1e-4) out.set(0, 1, 0);
    out.normalize();
    const nrm = out.clone().add(new THREE.Vector3((rng() - 0.5) * 1.6, rng() * 0.8, (rng() - 0.5) * 1.6)).normalize();
    const t1 = anyPerp(nrm);
    t1.applyAxisAngle(nrm, rng() * Math.PI * 2);
    const t2 = new THREE.Vector3().crossVectors(nrm, t1);
    const base = leaves.count;
    const canopyN = out.clone().multiplyScalar(0.75).add(nrm.clone().multiplyScalar(0.25)).normalize();
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      leaves.pos.push(L.c.x + (t1.x * a + t2.x * b) * s * 0.5, L.c.y + (t1.y * a + t2.y * b) * s * 0.5, L.c.z + (t1.z * a + t2.z * b) * s * 0.5);
      leaves.nor.push(canopyN.x, canopyN.y, canopyN.z);
      leaves.uv.push((a + 1) / 2, (b + 1) / 2);
      leaves.sway.push(L.sway);
    }
    leaves.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { bark: bark.build(), leaves: leafCards.length ? leaves.build() : null, height };
}
