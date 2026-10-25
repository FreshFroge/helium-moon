// Forest rendering: procedural archetypes per species x variant x LOD, drawn with
// GPU instancing. CPU chunk culling + per-instance distance LOD each frame.
import * as THREE from 'three';
import { generateTree } from './treegen.js';
import { patchMaterial, windDepthMaterial } from './shaderlib.js';

const SPECIES_PRESET = ['oak', 'sycamore', 'cottonwood', 'elm', 'hackberry', 'snag', 'cedar'];
const SPECIES_LEAF = ['oak', 'ash', 'aspen', 'ash', 'oak', null, 'cedar'];
const SPECIES_BARK = ['oak', 'sycamore', 'cottonwood', 'elm', 'hackberry', 'elm', 'cedar'];
const BASE_HEIGHT = { oak: 18, sycamore: 22, cottonwood: 24, elm: 16, hackberry: 12, snag: 11, cedar: 9, sapling: 5 };
const LEAF_TINT = { oak: 0xb4bea2, ash: 0xaebd9e, aspen: 0xc4b488, cedar: 0x88998c, bush: 0xa2b094 };
const VARIANTS = 3;
const CHUNK = 48;

export class TreeSystem {
  constructor(world, bank, preset) {
    this.world = world; this.preset = preset;
    this.group = new THREE.Group(); this.group.name = 'trees';
    this.barkMats = {}; this.leafMats = {};
    for (const b of ['oak', 'sycamore', 'cottonwood', 'elm', 'hackberry', 'cedar']) this.barkMats[b] = this._barkMat(bank, b);
    for (const l of ['oak', 'ash', 'aspen', 'cedar']) this.leafMats[l] = this._leafMat(bank, l);
    this.arch = [];
    const archIndex = new Map();
    const addArch = (presetName, species, variant) => {
      const key = `${presetName}:${species}:${variant}`;
      if (archIndex.has(key)) return archIndex.get(key);
      const h = BASE_HEIGHT[presetName];
      const seed = 1000 + species * 97 + variant * 13 + (presetName === 'sapling' ? 500 : 0);
      const lods = [0, 1, 2].map((l) => generateTree(presetName, seed, h, l));
      lods[0].bark.computeBoundingBox();
      const top = Math.max(lods[0].bark.boundingBox.max.y, lods[0].leaves ? (lods[0].leaves.computeBoundingBox(), lods[0].leaves.boundingBox.max.y) : 0);
      const a = { key, presetName, species, variant, lods, top, meshes: [], instances: 0 };
      a.barkMat = this.barkMats[SPECIES_BARK[species]];
      const leafType = presetName === 'sapling' ? (SPECIES_LEAF[species] || 'ash') : SPECIES_LEAF[species];
      a.leafMat = leafType ? this.leafMats[leafType] : null;
      archIndex.set(key, this.arch.length);
      this.arch.push(a);
      return this.arch.length - 1;
    };
    const trees = world.trees;
    const n = trees.length;
    this.n = n;
    this.archOf = new Uint16Array(n);
    this.mats = new Float32Array(n * 16);
    this.pos = new Float32Array(n * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const leanQ = new THREE.Quaternion(), yQ = new THREE.Quaternion(), axis = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = trees[i];
      const presetName = t.scale < 0.4 && t.sp !== 5 && t.sp !== 6 ? 'sapling' : SPECIES_PRESET[t.sp];
      const ai = addArch(presetName, t.sp, t.variant % VARIANTS);
      this.archOf[i] = ai; this.arch[ai].instances++;
      const sc = t.height / this.arch[ai].top;
      yQ.setFromAxisAngle(axis.set(0, 1, 0), t.rot);
      leanQ.setFromAxisAngle(axis.set(Math.cos(t.leanDir), 0, Math.sin(t.leanDir)), t.lean);
      q.multiplyQuaternions(leanQ, yQ);
      m.compose(p.set(t.x, t.y - 0.05, t.z), q, s.set(sc * (0.92 + (i % 7) * 0.025), sc, sc * (0.92 + (i % 5) * 0.03)));
      m.toArray(this.mats, i * 16);
      this.pos[i * 3] = t.x; this.pos[i * 3 + 1] = t.y; this.pos[i * 3 + 2] = t.z;
    }
    const caps = [preset.maxTrees * 0.25, preset.maxTrees, 1e9];
    for (const a of this.arch) {
      for (let l = 0; l < 3; l++) {
        const cap = Math.max(4, Math.min(a.instances, Math.ceil(caps[l])));
        const lod = a.lods[l];
        const bm = new THREE.InstancedMesh(lod.bark, a.barkMat, cap);
        bm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        bm.frustumCulled = false; bm.count = 0;
        bm.castShadow = l < 2; bm.receiveShadow = true;
        bm.customDepthMaterial = this._barkDepth;
        this.group.add(bm);
        let lm = null;
        if (lod.leaves && a.leafMat) {
          lm = new THREE.InstancedMesh(lod.leaves, a.leafMat, cap);
          lm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          lm.frustumCulled = false; lm.count = 0;
          lm.castShadow = l < 2; lm.receiveShadow = true;
          lm.customDepthMaterial = a.leafMat.userData.depth;
          this.group.add(lm);
        }
        a.meshes[l] = { bark: bm, leaves: lm, cap, count: 0 };
      }
    }
    this.chunks = new Map();
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(this.pos[i * 3] / CHUNK), cz = Math.floor(this.pos[i * 3 + 2] / CHUNK);
      const k = cx + ':' + cz;
      let c = this.chunks.get(k);
      if (!c) { c = { cx, cz, idx: [], box: new THREE.Box3(new THREE.Vector3(cx * CHUNK, 1e9, cz * CHUNK), new THREE.Vector3((cx + 1) * CHUNK, -1e9, (cz + 1) * CHUNK)) }; this.chunks.set(k, c); }
      c.idx.push(i);
      c.box.min.y = Math.min(c.box.min.y, this.pos[i * 3 + 1] - 1);
      c.box.max.y = Math.max(c.box.max.y, this.pos[i * 3 + 1] + trees[i].height + 2);
    }
    this.chunkList = [...this.chunks.values()];
    for (const c of this.chunkList) c.idx = Uint32Array.from(c.idx);
    this.frustum = new THREE.Frustum(); this.projScreen = new THREE.Matrix4();
    this.stats = { drawn: 0 };
  }

  _barkMat(bank, b) {
    const mat = new THREE.MeshStandardMaterial({
      map: bank.tex[`bark_${b}_c`], normalMap: bank.tex[`bark_${b}_n`], roughnessMap: bank.tex[`bark_${b}_r`],
      roughness: 1.0, metalness: 0, normalScale: new THREE.Vector2(1.4, 1.4), envMapIntensity: 0.25,
    });
    patchMaterial(mat, {
      wind: 0.35, key: 'bark-' + b,
      onShader: (sh) => {
        if (b === 'sycamore') {
          // sycamores turn ghost-white higher up - very visible under moonlight
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLocalY;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalY = position.y;');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLocalY;')
            .replace('#include <map_fragment>', `#include <map_fragment>
              float pale = smoothstep(2.5, 8.0, vLocalY + (hm_vnoise(vMapUv * vec2(3.0, 1.2)) - 0.5) * 4.0);
              float patchy = smoothstep(0.35, 0.6, hm_vnoise(vMapUv * vec2(2.0, 0.7) + 3.0));
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.61, 0.56), pale * (0.55 + 0.45 * patchy));`);
        }
      },
    });
    if (!this._barkDepth) this._barkDepth = windDepthMaterial(null, 0.35, 0);
    return mat;
  }

  _leafMat(bank, l) {
    const tex = bank.tex[`leafc_${l}`];
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, color: LEAF_TINT[l], envMapIntensity: 0.2 });
    if (this.preset.msaa) mat.alphaToCoverage = true;
    patchMaterial(mat, { wind: 1.0, translucency: 0.9, key: 'leaf-' + l });
    mat.userData.depth = windDepthMaterial(tex, 1.0, 0.42);
    return mat;
  }

  update(camera) {
    const P = this.preset;
    const d0 = P.treeLod0, d1 = P.treeLod1, dFar = P.treeFar, shadowR = P.shadowDist * 0.8;
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const arch = this.arch, chunks = this.chunkList;
    for (let ai = 0; ai < arch.length; ai++) { const ms = arch[ai].meshes; for (let l = 0; l < ms.length; l++) ms[l].count = 0; }
    const cx = camera.position.x, cz = camera.position.z;
    const mats = this.mats, pos = this.pos, archOf = this.archOf;
    let drawn = 0;
    for (let ci = 0; ci < chunks.length; ci++) {   // indexed + sqrt: no per-frame garbage
      const c = chunks[ci];
      const ex = (c.cx + 0.5) * CHUNK - cx, ez = (c.cz + 0.5) * CHUNK - cz;
      const cd = Math.sqrt(ex * ex + ez * ez) - CHUNK * 0.71;
      if (cd > dFar) continue;
      const inView = this.frustum.intersectsBox(c.box);
      if (!inView && cd > shadowR) continue;
      const idx = c.idx;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        const dx = pos[i * 3] - cx, dz = pos[i * 3 + 2] - cz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > dFar) continue;
        if (!inView && d > shadowR) continue;
        let l = d < d0 ? 0 : d < d1 ? 1 : 2;
        const a = arch[archOf[i]];
        let mm = a.meshes[l];
        if (mm.count >= mm.cap) { if (l < 2) { l++; mm = a.meshes[l]; if (mm.count >= mm.cap) continue; } else continue; }
        const arr = mm.bark.instanceMatrix.array;
        const o = mm.count * 16, src = i * 16;
        for (let j = 0; j < 16; j++) arr[o + j] = mats[src + j];
        if (mm.leaves) { const la = mm.leaves.instanceMatrix.array; for (let j = 0; j < 16; j++) la[o + j] = mats[src + j]; }
        mm.count++; drawn++;
      }
    }
    for (let ai = 0; ai < arch.length; ai++) for (let l = 0; l < arch[ai].meshes.length; l++) {
      const mm = arch[ai].meshes[l];
      // empty meshes would still bind programs/uniforms every pass (main + shadow)
      mm.bark.visible = mm.count > 0; if (mm.leaves) mm.leaves.visible = mm.count > 0;
      mm.bark.count = mm.count; mm.bark.instanceMatrix.clearUpdateRanges(); mm.bark.instanceMatrix.addUpdateRange(0, mm.count * 16); mm.bark.instanceMatrix.needsUpdate = mm.count > 0;
      if (mm.leaves) { mm.leaves.count = mm.count; mm.leaves.instanceMatrix.clearUpdateRanges(); mm.leaves.instanceMatrix.addUpdateRange(0, mm.count * 16); mm.leaves.instanceMatrix.needsUpdate = mm.count > 0; }
    }
    this.stats.drawn = drawn;
  }
}
