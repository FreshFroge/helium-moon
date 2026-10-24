// Loads the skinned character format written by tools/build_characters.py.
import * as THREE from 'three';
import { patchMaterial } from '../render/shaderlib.js';
import { assetUrl } from '../render/textures.js';

const cache = new Map();

async function fetchModel(name) {
  if (cache.has(name)) return cache.get(name);
  const p = (async () => {
    const meta = await (await fetch(assetUrl(`assets/models/${name}.json`))).json();
    // the hosted build serves model data under a binary type it allows (HM_BIN_SUFFIX)
    const bin = await (await fetch(assetUrl(`assets/models/${meta.bin}${(typeof window !== 'undefined' && window.HM_BIN_SUFFIX) || ''}`))).arrayBuffer();
    const tex = {};
    for (const [k, file] of Object.entries(meta.textures || {})) {
      const img = new Image(); img.src = assetUrl(`assets/models/${file}`); await img.decode();
      const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; t.anisotropy = 8; t.needsUpdate = true;
      tex[k] = t;
    }
    return { meta, bin, tex };
  })();
  cache.set(name, p);
  return p;
}

function clothMaterial(opts, key, fold = 0.6) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, envMapIntensity: 0.4, ...opts });
  patchMaterial(m, {
    key,
    onShader: (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 q = vObjPos * 38.0;
            float n1 = hm_vnoise(q.xy + q.z) - 0.5, n2 = hm_vnoise(q.yz * 1.3 + 7.0) - 0.5;
            float fold = sin(vObjPos.y * 90.0 + hm_vnoise(vObjPos.xz * 22.0) * 6.0) * 0.5;
            normal = normalize(normal + vec3(n1, n2, 0.0) * 0.12 + vec3(fold * ${fold.toFixed(2)} * 0.18, 0.0, 0.0));
          }`);
    },
  });
  return m;
}

export async function loadCharacter(name, opts = {}) {
  const { meta, bin, tex } = await fetchModel(name);
  const root = new THREE.Group(); root.name = name;
  const bones = [], byName = {};
  for (const b of meta.bones) {
    const bone = new THREE.Bone(); bone.name = b.name;
    bone.userData.head = new THREE.Vector3(...b.head); bone.userData.tail = new THREE.Vector3(...b.tail);
    bones.push(bone); byName[b.name] = bone;
  }
  for (const b of meta.bones) {
    const bone = byName[b.name];
    if (b.parent) { byName[b.parent].add(bone); bone.position.copy(bone.userData.head).sub(byName[b.parent].userData.head); }
    else { root.add(bone); bone.position.copy(bone.userData.head); }
  }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const meshes = {};
  for (const part of meta.parts) {
    const g = new THREE.BufferGeometry();
    const f32 = (off, n) => new Float32Array(bin, off, n);
    g.setAttribute('position', new THREE.BufferAttribute(f32(part.position, part.count * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(f32(part.normal, part.count * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(f32(part.uv, part.count * 2), 2));
    if (part.color !== undefined) g.setAttribute('color', new THREE.BufferAttribute(f32(part.color, part.count * 3), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(bin, part.skinIndex, part.count * 4), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(f32(part.skinWeight, part.count * 4), 4));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, part.index[0], part.index[1]), 1));
    g.computeBoundingSphere();
    let mat;
    const key = name === 'sf6' ? `sf6:${part.name}` : part.name;
    switch (key) {
      case 'skin':
        mat = patchMaterial(new THREE.MeshStandardMaterial({ map: tex.skin, roughness: 0.6, metalness: 0, envMapIntensity: 0.4 }), {
          key: 'humanskin',
          onShader: (sh) => {
            // soft wrap lighting (cheap subsurface) so faces read in a flashlight beam
            sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
              reflectedLight.directDiffuse += diffuseColor.rgb * reflectedLight.directDiffuse * 0.12;`);
          },
        });
        break;
      case 'shirt': mat = clothMaterial({ roughness: 0.92 }, 'shirt', 0.8); break;
      case 'shorts': mat = clothMaterial({ roughness: name === 'helium' ? 0.5 : 0.85, metalness: name === 'helium' ? 0.05 : 0 }, 'shorts', 0.5); break;
      case 'shoes': mat = clothMaterial({ roughness: 0.42 }, 'shoes', 0.1); break;
      case 'glasses': mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.2 }), { key: 'glasses' }); break;
      // simple tinted lens: a near-mirror PBR lens on a skinned mesh crashed software (SwiftShader) renderers
      case 'lenses': mat = new THREE.MeshBasicMaterial({ color: 0x1a2430, transparent: true, opacity: 0.3, depthWrite: false }); break;
      case 'sf6:body':
        mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, envMapIntensity: 0.3 }), {
          key: 'sffur',
          onShader: (sh) => {
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
              .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
                {
                  vec3 q = vObjPos * vec3(120.0, 60.0, 30.0);
                  float s1 = hm_vnoise(q.xy + q.z * 0.3) - 0.5, s2 = hm_vnoise(q.zy * 0.7 + 11.0) - 0.5;
                  normal = normalize(normal + vec3(s1, s2, 0.0) * 0.55);
                }`)
              .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
                roughnessFactor = 0.75 + 0.2 * hm_vnoise(vObjPos.xy * 200.0);`);
          },
        });
        break;
      case 'sf6:eyes': mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x777766 }); break;
      default: mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: part.color !== undefined, roughness: 0.7 }), { key: 'charDefault' });
    }
    if (opts.tint && key === 'shirt') { mat = mat.clone(); mat.color.set(opts.tint); }
    const mesh = new THREE.SkinnedMesh(g, mat);
    mesh.name = part.name;
    mesh.castShadow = part.name !== 'lenses'; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(skeleton, new THREE.Matrix4());
    root.add(mesh);
    meshes[part.name] = mesh;
  }
  return { root, bones: byName, skeleton, meshes, landmarks: meta.landmarks };
}
