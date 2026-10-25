// Undergrowth and ground clutter: bushes/thickets, tall grass, reeds, fallen logs,
// sticks and stumps. All instanced with chunked distance culling.
import * as THREE from 'three';
import { generateTree } from './treegen.js';
import { patchMaterial, windDepthMaterial } from './shaderlib.js';
import { makeRng, makeNoise2 } from '../../shared/math.js';

const CH = 32;

export class InstancedScatter {
  constructor(name, variants, items, maxDist, { castShadow = false, cap = 6000 } = {}) {
    this.group = new THREE.Group(); this.group.name = name;
    this.maxDist = maxDist;
    const n = items.length;
    this.n = n;
    this.pos = new Float32Array(n * 3); this.var = new Uint8Array(n); this.mats = new Float32Array(n * 16);
    const counts = new Array(variants.length).fill(0);
    items.forEach((it, i) => {
      this.pos[i * 3] = it.x; this.pos[i * 3 + 1] = it.y; this.pos[i * 3 + 2] = it.z;
      this.var[i] = it.v; counts[it.v]++;
      it.m.toArray(this.mats, i * 16);
    });
    this.meshes = variants.map((v, k) => {
      const parts = Array.isArray(v) ? v : [v];
      const c = Math.max(1, Math.min(counts[k], cap));
      return { cap: c, count: 0, list: parts.map((p) => {
        const m = new THREE.InstancedMesh(p.geo, p.mat, c);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false; m.count = 0; m.castShadow = castShadow; m.receiveShadow = true;
        if (p.depthMat) m.customDepthMaterial = p.depthMat;
        this.group.add(m);
        return m;
      }) };
    });
    this.chunks = new Map();
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(this.pos[i * 3] / CH), cz = Math.floor(this.pos[i * 3 + 2] / CH);
      const key = cx + ':' + cz;
      let c = this.chunks.get(key);
      if (!c) { c = { cx, cz, idx: [], box: new THREE.Box3(new THREE.Vector3(cx * CH, 1e9, cz * CH), new THREE.Vector3((cx + 1) * CH, -1e9, (cz + 1) * CH)) }; this.chunks.set(key, c); }
      c.idx.push(i);
      c.box.min.y = Math.min(c.box.min.y, this.pos[i * 3 + 1] - 1);
      c.box.max.y = Math.max(c.box.max.y, this.pos[i * 3 + 1] + 4);
    }
    this.chunkList = [...this.chunks.values()];
    for (const c of this.chunkList) c.idx = Uint32Array.from(c.idx);
  }

  update(camera, frustum, distScale = 1) {
    const maxD = this.maxDist * distScale;
    // hot loop (thousands of instances per frame): indexed loops and no Math.hypot,
    // both of which allocate in V8 and cost ~70 KB/frame of garbage here
    const meshes = this.meshes, pos = this.pos, mats = this.mats, vari = this.var, chunks = this.chunkList;
    for (let k = 0; k < meshes.length; k++) meshes[k].count = 0;
    const cx = camera.position.x, cz = camera.position.z, maxD2 = maxD * maxD;
    for (let ci = 0; ci < chunks.length; ci++) {
      const c = chunks[ci];
      const ex = (c.cx + 0.5) * CH - cx, ez = (c.cz + 0.5) * CH - cz;
      if (Math.sqrt(ex * ex + ez * ez) - CH * 0.71 > maxD) continue;
      if (!frustum.intersectsBox(c.box)) continue;
      const idx = c.idx;
      for (let n = 0; n < idx.length; n++) {
        const i = idx[n];
        const dx = pos[i * 3] - cx, dz = pos[i * 3 + 2] - cz;
        if (dx * dx + dz * dz > maxD2) continue;
        const mm = meshes[vari[i]];
        if (mm.count >= mm.cap) continue;
        const o = mm.count * 16, src = i * 16, list = mm.list;
        for (let q = 0; q < list.length; q++) { const arr = list[q].instanceMatrix.array; for (let j = 0; j < 16; j++) arr[o + j] = mats[src + j]; }
        mm.count++;
      }
    }
    for (let k = 0; k < meshes.length; k++) for (let q = 0; q < meshes[k].list.length; q++) {
      const mm = meshes[k], m = mm.list[q];
      m.count = mm.count; m.visible = mm.count > 0;   // skip program/uniform setup for empty sets
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, mm.count * 16);
      m.instanceMatrix.needsUpdate = mm.count > 0;
    }
  }
}

function crossedQuads(w, h, planes = 3, swayPow = 2) {
  const pos = [], nor = [], uv = [], sway = [], idx = [];
  for (let p = 0; p < planes; p++) {
    const a = (p / planes) * Math.PI;
    const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
    const b = pos.length / 3;
    for (const [x, y, z, u, vv] of [[-dx, 0, -dz, 0, 0], [dx, 0, dz, 1, 0], [dx, h, dz, 1, 1], [-dx, h, -dz, 0, 1]]) {
      pos.push(x, y, z); nor.push(0, 1, 0); uv.push(u, vv); sway.push(Math.pow(vv, swayPow) * 0.6);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  return g;
}

function logGeometry(seed, radial = 10, segs = 8) {
  const rng = makeRng(seed); const nz = makeNoise2(seed);
  const pos = [], nor = [], uv = [], sway = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, z = t - 0.5;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const r = 1 + nz(a * 1.3, t * 4) * 0.12 + (i === 0 || i === segs ? -0.05 : 0);
      pos.push(Math.cos(a) * r, Math.sin(a) * r, z + (i === 0 || i === segs ? (rng() - 0.5) * 0.06 : 0));
      nor.push(Math.cos(a), Math.sin(a), 0); uv.push(j / radial * 2, t * 3); sway.push(0);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  for (const end of [0, segs]) {
    const c = pos.length / 3; pos.push(0, 0, end === 0 ? -0.5 : 0.5); nor.push(0, 0, end === 0 ? -1 : 1); uv.push(0.5, 0.5); sway.push(0);
    for (let j = 0; j < radial; j++) {
      const a = end * (radial + 1) + j;
      if (end === 0) idx.push(c, a + 1, a); else idx.push(c, a, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export class Foliage {
  constructor(world, bank, preset, treeSys) {
    this.world = world; this.preset = preset;
    this.group = new THREE.Group(); this.group.name = 'foliage';
    const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const mk = (x, y, z, yaw, sx, sy, sz, pitch = 0, roll = 0) => {
      e.set(pitch, yaw, roll, 'YXZ'); q.setFromEuler(e);
      return new THREE.Matrix4().compose(p.set(x, y, z), q, s.set(sx, sy, sz));
    };
    const bushTex = bank.tex.leafc_bush;
    const bushMat = new THREE.MeshStandardMaterial({ map: bushTex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, color: 0xa2b094, envMapIntensity: 0.2 });
    if (preset.msaa) bushMat.alphaToCoverage = true;
    patchMaterial(bushMat, { wind: 0.8, translucency: 0.7, key: 'bush' });
    const bushDepth = windDepthMaterial(bushTex, 0.8, 0.42);
    const stemMat = treeSys.barkMats.hackberry;
    const bushVariants = [];
    for (const [kind, h, sd] of [['bush', 1.6, 0], ['bush', 1.3, 1], ['tangle', 1.4, 2], ['bush', 2.4, 3]]) {
      const g = generateTree(kind, 3000 + sd * 11, h, 0);
      const parts = [{ geo: g.leaves, mat: bushMat, depthMat: bushDepth }];
      if (g.bark.attributes.position.count > 0) parts.push({ geo: g.bark, mat: stemMat });
      bushVariants.push(parts);
    }
    const bushItems = world.bushes.map((b) => ({ x: b[0], y: b[1], z: b[2], v: b[5] === 1 ? 2 : b[5] === 2 ? 3 : (Math.floor(Math.abs(b[0] * 7 + b[2])) % 2), m: mk(b[0], b[1] - 0.05, b[2], b[4], b[3], b[3] * (0.8 + b[6] * 0.4), b[3]) }));
    this.bushes = new InstancedScatter('bushes', bushVariants, bushItems, preset.bushDist, { castShadow: true, cap: 5000 });
    this.group.add(this.bushes.group);
    const grassMat = new THREE.MeshStandardMaterial({ map: bank.tex.grass_card, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.9, color: 0xb6b49a });
    if (preset.msaa) grassMat.alphaToCoverage = true;
    patchMaterial(grassMat, { wind: 1.0, translucency: 0.5, key: 'grass',
      onShader: (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(mix(normal, (viewMatrix * vec4(0.0,1.0,0.0,0.0)).xyz, 0.6));');
      } });
    const gVariants = [
      { geo: crossedQuads(1.0, 0.75, 3, 2), mat: grassMat },
      { geo: crossedQuads(1.3, 1.25, 3, 2), mat: grassMat },
      { geo: crossedQuads(0.9, 0.6, 2, 2), mat: grassMat },
    ];
    const grassItems = world.grass.map((g) => ({ x: g[0], y: g[1], z: g[2], v: g[5], m: mk(g[0], g[1] - 0.04, g[2], g[4], g[3], g[3] * (0.8 + (Math.abs(g[0]) % 1) * 0.4), g[3]) }));
    this.grass = new InstancedScatter('grass', gVariants, grassItems, preset.grassDist, { castShadow: false, cap: 12000 });
    this.group.add(this.grass.group);
    const reedMat = new THREE.MeshStandardMaterial({ map: bank.tex.reed_card, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, color: 0xa6a68c });
    patchMaterial(reedMat, { wind: 0.7, key: 'reed' });
    const reedItems = world.reeds.map((r) => ({ x: r[0], y: r[1], z: r[2], v: 0, m: mk(r[0], r[1] - 0.1, r[2], r[4], r[3], r[3] * 1.1, r[3]) }));
    this.reeds = new InstancedScatter('reeds', [{ geo: crossedQuads(0.9, 1.9, 3, 1.5), mat: reedMat }], reedItems, preset.grassDist * 1.4, { cap: 4000 });
    this.group.add(this.reeds.group);
    const logMat = new THREE.MeshStandardMaterial({ map: bank.tex.bark_elm_c, normalMap: bank.tex.bark_elm_n, roughness: 0.95, color: 0x7d776a, envMapIntensity: 0.2 });
    patchMaterial(logMat, { key: 'log' });
    const logItems = world.logs.map((l) => ({ x: l[0], y: l[1], z: l[2], v: 0, m: mk(l[0], l[1] + l[4] * 0.55, l[2], l[5], l[4], l[4] * 0.92, l[3], l[6], 0) }));
    this.logs = new InstancedScatter('logs', [{ geo: logGeometry(77), mat: logMat }], logItems, 160, { castShadow: true, cap: 2000 });
    this.group.add(this.logs.group);
    const stickItems = world.debris.map((d) => ({ x: d[0], y: d[1], z: d[2], v: 0, m: mk(d[0], d[1] + d[5] * 0.6, d[2], d[4], d[5], d[5], d[3], (Math.abs(d[0]) % 0.2) - 0.1) }));
    this.sticks = new InstancedScatter('sticks', [{ geo: logGeometry(91, 4, 3), mat: logMat }], stickItems, 45, { cap: 3000 });
    this.group.add(this.sticks.group);
    const stumpGeo = new THREE.CylinderGeometry(0.85, 1.15, 1, 10, 1);
    stumpGeo.setAttribute('aSway', new THREE.Float32BufferAttribute(new Float32Array(stumpGeo.attributes.position.count), 1));
    stumpGeo.translate(0, 0.5, 0);
    const stumpItems = world.stumps.map((st) => ({ x: st[0], y: st[1], z: st[2], v: 0, m: mk(st[0], st[1] - 0.1, st[2], st[0], st[3], st[3] * (1.6 + (Math.abs(st[2]) % 1)), st[3]) }));
    this.stumps = new InstancedScatter('stumps', [{ geo: stumpGeo, mat: logMat }], stumpItems, 120, { castShadow: true, cap: 800 });
    this.group.add(this.stumps.group);
    this.frustum = new THREE.Frustum(); this.pm = new THREE.Matrix4();
  }

  update(camera) {
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    this.bushes.update(camera, this.frustum);
    this.grass.update(camera, this.frustum);
    this.reeds.update(camera, this.frustum);
    this.logs.update(camera, this.frustum);
    this.sticks.update(camera, this.frustum);
    this.stumps.update(camera, this.frustum);
  }
}
