// River + swamp water: dark, opaque North Canadian water that mirrors the night sky.
import * as THREE from 'three';
import { patchMaterial } from './shaderlib.js';
import { CONFIG } from '../../shared/config.js';
import { cumulativeLengths } from '../../shared/math.js';

export class Water {
  constructor(world, bank) {
    this.group = new THREE.Group(); this.group.name = 'water';
    const n = bank.tex.water_n;
    const mkMat = (flow) => {
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.075, 0.066, 0.035), roughness: 0.035, metalness: 0.0,
        normalMap: n, normalScale: new THREE.Vector2(0.22, 0.22), envMapIntensity: 1.25,
      });
      patchMaterial(m, {
        key: 'water' + flow,
        onShader: (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `
            {
              vec2 p = vFogWorld.xz;
              vec2 fl = ${flow ? 'vec2(0.0, uTime * 0.045)' : 'vec2(uTime * 0.004, uTime * 0.003)'};
              vec3 a = texture2D(normalMap, ${flow ? 'vNormalMapUv + fl' : 'p / 9.0 + fl'}).xyz * 2.0 - 1.0;
              vec3 b = texture2D(normalMap, ${flow ? 'vNormalMapUv * 2.3 + fl * 1.7 + 0.37' : 'p / 3.7 - fl * 1.3'}).xyz * 2.0 - 1.0;
              vec3 tn = normalize(vec3((a.xy + b.xy * 0.6) * normalScale, 1.0));
              vec3 wN = normalize(vec3(tn.x, 1.0, -tn.y));
              normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
            }`);
        },
      });
      return m;
    };
    const pts = world.river;
    const cum = cumulativeLengths(pts);
    const half = CONFIG.RIVER_HALF_WIDTH + CONFIG.RIVER_BANK * 0.85 + 2;
    const pos = [], uv = [], nor = [], idx = [];
    const y = CONFIG.WATER_LEVEL;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      pos.push(pts[i][0] + nx * half, y, pts[i][1] + nz * half, pts[i][0] - nx * half, y, pts[i][1] - nz * half);
      uv.push(0, cum[i] / 14, half * 2 / 14, cum[i] / 14);
      nor.push(0, 1, 0, 0, 1, 0);
      if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.river = new THREE.Mesh(g, mkMat(true));
    this.river.receiveShadow = true;
    this.group.add(this.river);
    // still water in swamps, ponds, sloughs: 4 m quads only over wet cells away from the river
    const still = mkMat(false);
    still.color.setRGB(0.05, 0.052, 0.04);
    const bb = (poly, pad = 12) => { let a = [1e9, 1e9], b = [-1e9, -1e9]; for (const p of poly) { a = [Math.min(a[0], p[0]), Math.min(a[1], p[1])]; b = [Math.max(b[0], p[0]), Math.max(b[1], p[1])]; } return [a[0] - pad, a[1] - pad, b[0] + pad, b[1] + pad]; };
    const boxes = [bb(world.seSwamp), bb(world.swSwamp), bb(world.wMarsh)];
    const pw = world.pondWater; boxes.push([pw.x - pw.rx - 20, pw.z - pw.rz - 20, pw.x + pw.rx + 20, pw.z + pw.rz + 20]);
    for (const e of world.ponds) boxes.push([e.x - e.rx - 14, e.z - e.rz - 14, e.x + e.rx + 14, e.z + e.rz + 14]);
    for (const sl of world.sloughs) boxes.push(bb(sl.pts, sl.halfW + 8));
    boxes.push(bb(world.creek, 10));
    const C4 = 4, wl = CONFIG.SWAMP_WATER_LEVEL;
    const done = new Set();
    const wp = [], wn = [], wu = [], wi = [];
    for (const [x0, z0, x1, z1] of boxes) {
      for (let z = Math.floor(z0 / C4) * C4; z < z1; z += C4) for (let x = Math.floor(x0 / C4) * C4; x < x1; x += C4) {
        const key = x + ':' + z; if (done.has(key)) continue; done.add(key);
        const cx = x + C4 / 2, cz = z + C4 / 2;
        if (world.riverDistAt(cx, cz) < CONFIG.RIVER_HALF_WIDTH + CONFIG.RIVER_BANK + 3) continue;
        if (!world.isWetZone(cx, cz)) continue;
        const hmin = Math.min(world.heightAt(x, z), world.heightAt(x + C4, z), world.heightAt(x, z + C4), world.heightAt(x + C4, z + C4), world.heightAt(cx, cz));
        if (hmin > wl + 0.02) continue;
        const b0 = wp.length / 3;
        wp.push(x, wl, z, x + C4, wl, z, x + C4, wl, z + C4, x, wl, z + C4);
        wn.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
        wu.push(x / 9, z / 9, (x + C4) / 9, z / 9, (x + C4) / 9, (z + C4) / 9, x / 9, (z + C4) / 9);
        wi.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
      }
    }
    if (wp.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
      sg.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
      sg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
      sg.setIndex(wi); sg.computeBoundingSphere();
      const m = new THREE.Mesh(sg, still);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }
}
