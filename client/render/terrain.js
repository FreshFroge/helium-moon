// Chunked heightfield terrain with distance LOD + splat-mapped PBR material.
import * as THREE from 'three';
import { patchMaterial } from './shaderlib.js';
import { CONFIG } from '../../shared/config.js';

const CHUNK = 128;   // m; 64 m chunks cost ~230 draw calls for ~0.1 M triangles (see docs/PERFORMANCE.md)
const LOD_STEPS = [1, 2, 4, 8];

export class Terrain {
  constructor(world, bank, quality) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.cx = Math.ceil(world.W / CHUNK); this.cz = Math.ceil(world.H / CHUNK);
    this.chunks = [];
    this.material = this._makeMaterial(world, bank);
    for (let iz = 0; iz < this.cz; iz++) for (let ix = 0; ix < this.cx; ix++) {
      const mesh = new THREE.Mesh(undefined, this.material);
      mesh.receiveShadow = true; mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      const c = { ix, iz, mesh, lod: -1, geos: [], x0: world.minX + ix * CHUNK, z0: world.minZ + iz * CHUNK };
      c.center = new THREE.Vector3(c.x0 + CHUNK / 2, 0, c.z0 + CHUNK / 2);
      this.chunks.push(c);
      this.group.add(mesh);
    }
    this.lodDist = quality === 'low' ? [60, 150, 320] : quality === 'ultra' ? [130, 260, 520] : [95, 210, 430];
  }

  _makeMaterial(world, bank) {
    const splat = new THREE.DataTexture(world.splat, world.hw, world.hh, THREE.RGBAFormat, THREE.UnsignedByteType);
    splat.flipY = false; splat.magFilter = THREE.LinearFilter; splat.minFilter = THREE.LinearFilter;
    splat.wrapS = splat.wrapT = THREE.ClampToEdgeWrapping; splat.needsUpdate = true;
    this.splatTex = splat;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.35 });
    const uniforms = {
      uSplat: { value: splat },
      uLayers: { value: bank.tex.groundC },
      uLayersN: { value: bank.tex.groundN },
      uWorldMin: { value: new THREE.Vector2(world.minX, world.minZ) },
      uWorldSize: { value: new THREE.Vector2((world.hw - 1), (world.hh - 1)) },
      uWater: { value: CONFIG.WATER_LEVEL },
      uSwampWater: { value: CONFIG.SWAMP_WATER_LEVEL },
    };
    patchMaterial(mat, {
      key: 'terrain', extraUniforms: uniforms,
      onShader: (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWN;')
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWN = objectNormal;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec3 vWN;
            uniform sampler2D uSplat; uniform mediump sampler2DArray uLayers; uniform mediump sampler2DArray uLayersN;
            uniform vec2 uWorldMin; uniform vec2 uWorldSize; uniform float uWater; uniform float uSwampWater;
            vec4 hmTerrainW; float hmClay; float hmWet; float hmPuddle; vec2 hmP;
          `)
          .replace('#include <map_fragment>', `
            hmP = vFogWorld.xz;
            vec2 suv = (hmP - uWorldMin + 0.5) / (uWorldSize + 1.0);
            vec4 sp = texture2D(uSplat, suv);
            float n1 = hm_fbm(hmP * 0.9);
            float n2 = hm_fbm(hmP * 0.13 + 7.0);
            float d = sp.r * 12.0;
            float over = sp.b;
            float halfW = mix(1.8, 1.1, smoothstep(0.1, 0.95, over));
            float trailZone = 1.0 - smoothstep(halfW + 0.6, halfW + 1.8, d);
            float trailM = 1.0 - smoothstep(halfW - 0.45, halfW + 0.15, d + (n1 - 0.5) * 0.6);
            float strip = (1.0 - smoothstep(0.22, 0.5, d + (n1 - 0.5) * 0.25)) * smoothstep(0.15, 0.6, over);
            float rut = exp(-pow((d - halfW * 0.48) / 0.32, 2.0)) * trailM;
            float grassW = mix(sp.b, clamp(strip * 1.2 + smoothstep(halfW - 0.5, halfW + 0.6, d) * (0.35 + over * 0.6), 0.0, 1.0), trailZone);
            float mudW = sp.g * smoothstep(0.25, 0.65, n2 + sp.g * 0.6);
            float sandW = sp.a;
            vec3 nW = normalize(vWN);
            float slope = 1.0 - nW.y;
            hmClay = smoothstep(0.28, 0.5, slope + (n1 - 0.5) * 0.12);
            trailM *= 1.0 - strip;
            float wTrail = trailM * (1.0 - hmClay);
            float wGrass = grassW * (1.0 - wTrail) * (1.0 - hmClay);
            float wSand = sandW * (1.0 - wTrail) * (1.0 - hmClay) * (1.0 - wGrass * 0.7);
            float wMud = mudW * (1.0 - hmClay) * (1.0 - wSand * 0.5);
            float wLitter = max(0.0, 1.0 - wTrail - wGrass - wSand - wMud - hmClay);
            float tot = wLitter + wTrail + wGrass + wSand + wMud + hmClay;
            hmTerrainW = vec4(wTrail, wMud, wGrass, wSand) / tot; wLitter /= tot; float wClay = hmClay / tot;
            vec2 uvA = hmP / 2.6;
            vec2 uvB = mat2(0.8, 0.6, -0.6, 0.8) * hmP / 6.9;
            vec3 cLit = mix(texture(uLayers, vec3(uvA, 0.0)).rgb, texture(uLayers, vec3(uvB, 0.0)).rgb, smoothstep(0.3, 0.7, n2) * 0.6);
            vec3 cTrail = texture(uLayers, vec3(hmP / 3.1, 1.0)).rgb;
            vec3 cMud = texture(uLayers, vec3(hmP / 3.3, 2.0)).rgb;
            vec3 cGrass = mix(texture(uLayers, vec3(hmP / 2.2, 3.0)).rgb, texture(uLayers, vec3(uvB * 1.4, 3.0)).rgb, 0.4);
            vec3 cSand = texture(uLayers, vec3(hmP / 4.5, 4.0)).rgb;
            vec2 cuv = abs(nW.x) > abs(nW.z) ? vec2(vFogWorld.z, vFogWorld.y) : vec2(vFogWorld.x, vFogWorld.y);
            vec3 cClay = texture(uLayers, vec3(cuv / 3.0, 5.0)).rgb;
            vec3 col = cLit * wLitter + cTrail * hmTerrainW.x + cMud * hmTerrainW.y + cGrass * hmTerrainW.z + cSand * hmTerrainW.w + cClay * wClay;
            col *= mix(1.0, 0.82, rut * (1.0 - over));
            col *= 0.86 + 0.28 * n2;
            float hAboveWater = vFogWorld.y - uWater;
            hmWet = clamp(hmTerrainW.y * 1.2 + (1.0 - smoothstep(0.0, 0.7, hAboveWater)) + rut * 0.35 * (1.0 - over) + (1.0 - smoothstep(-0.05, 0.25, vFogWorld.y - uSwampWater)) * 0.8, 0.0, 1.0);
            hmPuddle = smoothstep(0.62, 0.8, hmWet * (0.6 + 0.6 * hm_vnoise(hmP * 0.35))) * (1.0 - hmClay);
            col *= mix(1.0, 0.55, hmWet);
            col = mix(col, col * 0.35, hmPuddle);
            diffuseColor.rgb *= col;
          `)
          .replace('#include <roughnessmap_fragment>', `
            float roughnessFactor = roughness;
            roughnessFactor = mix(0.92, 0.82, hmTerrainW.x) - hmWet * 0.45;
            roughnessFactor = mix(roughnessFactor, 0.08, hmPuddle);
          `)
          .replace('#include <normal_fragment_maps>', `
            {
              vec3 tLit = texture(uLayersN, vec3(hmP / 2.6, 0.0)).xyz * 2.0 - 1.0;
              vec3 tTr = texture(uLayersN, vec3(hmP / 3.1, 1.0)).xyz * 2.0 - 1.0;
              vec3 tMu = texture(uLayersN, vec3(hmP / 3.3, 2.0)).xyz * 2.0 - 1.0;
              vec3 tGr = texture(uLayersN, vec3(hmP / 2.2, 3.0)).xyz * 2.0 - 1.0;
              vec3 tSa = texture(uLayersN, vec3(hmP / 4.5, 4.0)).xyz * 2.0 - 1.0;
              vec3 tn = tLit * (1.0 - hmTerrainW.x - hmTerrainW.y - hmTerrainW.z - hmTerrainW.w) + tTr * hmTerrainW.x + tMu * hmTerrainW.y + tGr * hmTerrainW.z + tSa * hmTerrainW.w;
              tn.xy *= mix(1.1, 0.15, hmPuddle);
              vec3 gN = normalize(vWN);
              vec3 wN = normalize(vec3(gN.x + tn.x, gN.y, gN.z - tn.y));
              if (hmClay > 0.01) {
                vec2 cuv2 = abs(gN.x) > abs(gN.z) ? vec2(vFogWorld.z, vFogWorld.y) : vec2(vFogWorld.x, vFogWorld.y);
                vec3 tc = texture(uLayersN, vec3(cuv2 / 3.0, 5.0)).xyz * 2.0 - 1.0;
                vec3 side = abs(gN.x) > abs(gN.z) ? vec3(0.0, tc.y, tc.x) * sign(gN.x) : vec3(tc.x, tc.y, 0.0);
                wN = normalize(mix(wN, normalize(gN + side * 0.9), hmClay));
              }
              normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
            }
          `);
      },
    });
    return mat;
  }

  _buildGeo(c, step) {
    const w = this.world;
    const n = CHUNK / step;
    const vx = n + 1;
    const total = vx * vx + 4 * vx;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    const hAt = (x, z) => w.heightAt(x, z);
    const normal = (x, z, out, o) => {
      const e = Math.max(1, step * 0.75);
      const hx = hAt(x + e, z) - hAt(x - e, z), hz = hAt(x, z + e) - hAt(x, z - e);
      const l = Math.hypot(hx, 2 * e, hz);
      out[o] = -hx / l; out[o + 1] = 2 * e / l; out[o + 2] = -hz / l;
    };
    let k = 0;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = c.x0 + i * step, z = c.z0 + j * step;
      pos[k * 3] = x; pos[k * 3 + 1] = hAt(x, z); pos[k * 3 + 2] = z;
      normal(x, z, nor, k * 3); k++;
    }
    const border = [];
    for (let i = 0; i <= n; i++) border.push([i, 0]);
    for (let j = 1; j <= n; j++) border.push([n, j]);
    for (let i = n - 1; i >= 0; i--) border.push([i, n]);
    for (let j = n - 1; j >= 1; j--) border.push([0, j]);
    const skirtStart = k;
    for (const [i, j] of border) {
      const src = j * vx + i;
      pos[k * 3] = pos[src * 3]; pos[k * 3 + 1] = pos[src * 3 + 1] - 1.2 * step; pos[k * 3 + 2] = pos[src * 3 + 2];
      nor[k * 3] = nor[src * 3]; nor[k * 3 + 1] = nor[src * 3 + 1]; nor[k * 3 + 2] = nor[src * 3 + 2];
      k++;
    }
    const idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * vx + i, b = a + 1, cI = a + vx, d = cI + 1;
      idx.push(a, cI, b, b, cI, d);
    }
    for (let s = 0; s < border.length; s++) {
      const [i0, j0] = border[s], [i1, j1] = border[(s + 1) % border.length];
      const a = j0 * vx + i0, b = j1 * vx + i1, sa = skirtStart + s, sb = skirtStart + (s + 1) % border.length;
      idx.push(a, b, sa, b, sb, sa);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, k * 3), 3));
    g.setIndex(idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }

  update(camPos) {
    const [d0, d1, d2] = this.lodDist;
    for (const c of this.chunks) {
      const dx = Math.max(Math.abs(camPos.x - c.center.x) - CHUNK / 2, 0);
      const dz = Math.max(Math.abs(camPos.z - c.center.z) - CHUNK / 2, 0);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1100) { c.mesh.visible = false; continue; }
      const lod = d < d0 ? 0 : d < d1 ? 1 : d < d2 ? 2 : 3;
      if (lod !== c.lod) {
        if (!c.geos[lod]) c.geos[lod] = this._buildGeo(c, LOD_STEPS[lod]);
        c.mesh.geometry = c.geos[lod];
        c.lod = lod;
      }
      c.mesh.visible = true;
    }
  }
}
