// Shared shader uniforms + material patches (night fog with moon scattering, wind,
// foliage translucency). Every scene material is patched through here so fog and
// wind are consistent across terrain, trees, props and characters.
import * as THREE from 'three';

export const G = {
  uTime: { value: 0 },
  uMoonDir: { value: new THREE.Vector3(0, 0.6, -0.8) },
  uMoonColor: { value: new THREE.Color(0.55, 0.64, 0.86) },
  uFogColor: { value: new THREE.Color(0.012, 0.016, 0.026) },
  uFogDensity: { value: 0.0105 },
  uFogHeightK: { value: 0.16 },
  uMist: { value: 0.55 },
  uWind: { value: new THREE.Vector3(0.6, 0, 0.35) },
  uTerror: { value: 0 },
  uCold: { value: 0 },
  uMoonVis: { value: 1 },
  uHorizonGlow: { value: new THREE.Color(0.11, 0.07, 0.04) },
};

export const NOISE_GLSL = /* glsl */`
float hm_hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hm_vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hm_hash12(i), hm_hash12(i+vec2(1,0)), u.x), mix(hm_hash12(i+vec2(0,1)), hm_hash12(i+vec2(1,1)), u.x), u.y); }
float hm_fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i=0;i<4;i++){ s += a*hm_vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
`;

const FOG_PARS_VERT = /* glsl */`
varying vec3 vFogWorld;
`;
const FOG_VERT = /* glsl */`
{
  vec4 hmW = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    hmW = batchingMatrix * hmW;
  #endif
  #ifdef USE_INSTANCING
    hmW = instanceMatrix * hmW;
  #endif
  vFogWorld = (modelMatrix * hmW).xyz;
}
`;
const FOG_PARS_FRAG = /* glsl */`
varying vec3 vFogWorld;
uniform vec3 uMoonDir; uniform vec3 uMoonColor; uniform vec3 uFogColor; uniform float uFogDensity;
uniform float uFogHeightK; uniform float uMist; uniform float uTime; uniform float uTerror; uniform float uMoonVis;
uniform vec3 uHorizonGlow;
${NOISE_GLSL}
vec3 hmApplyFog(vec3 col, vec3 wp) {
  vec3 rd = wp - cameraPosition;
  float dist = length(rd);
  vec3 dir = rd / max(dist, 1e-3);
  float k = uFogHeightK;
  float h0 = cameraPosition.y + 0.6, h1 = wp.y + 0.6;
  float dh = h1 - h0;
  float hInt = abs(dh) > 0.05 ? (exp(-k * h0) - exp(-k * h1)) / (k * dh) : exp(-k * h0);
  float dens = uFogDensity * (1.0 + uTerror * 0.9);
  float mist = hm_fbm(wp.xz * 0.035 + vec2(uTime * 0.012, uTime * 0.007));
  mist = smoothstep(0.35, 0.8, mist) * uMist * exp(-max(wp.y + 0.4, 0.0) * 0.9);
  float fogAmt = dens * dist * (0.35 + 1.4 * hInt) + mist * min(dist, 60.0) * 0.012;
  float T = exp(-fogAmt);
  float mu = dot(dir, uMoonDir);
  float phase = 0.25 + 0.9 * pow(max(mu, 0.0), 6.0) + 0.35 * pow(max(mu, 0.0), 1.5);
  vec3 fogCol = uFogColor + uMoonColor * 0.045 * phase * uMoonVis + uHorizonGlow * 0.15 * pow(1.0 - abs(dir.y), 6.0);
  return col * T + fogCol * (1.0 - T);
}
`;
const FOG_FRAG = /* glsl */`
gl_FragColor.rgb = hmApplyFog(gl_FragColor.rgb, vFogWorld);
`;

const WIND_PARS = /* glsl */`
uniform float uTime; uniform vec3 uWind;
attribute float aSway;
`;
function windVert(strength) {
  return /* glsl */`
  {
    vec3 hmOrigin = vec3(0.0);
    #ifdef USE_INSTANCING
      hmOrigin = instanceMatrix[3].xyz;
    #endif
    float hmPh = dot(hmOrigin.xz, vec2(0.071, 0.113));
    float gust = 0.65 + 0.35 * sin(uTime * 0.37 + hmOrigin.x * 0.013) * sin(uTime * 0.23 + hmOrigin.z * 0.011) + uWind.y;
    float sway = aSway * ${strength.toFixed(3)} * gust;
    vec3 wdir = vec3(uWind.x, 0.0, uWind.z);
    float flutter = sin(uTime * 2.7 + hmPh + position.x * 1.7 + position.y * 0.9) * 0.35 + sin(uTime * 4.1 + position.z * 2.3) * 0.15;
    transformed += (wdir * (0.6 + 0.4 * sin(uTime * 0.9 + hmPh)) + vec3(flutter * 0.3, flutter * 0.12, flutter * 0.3)) * sway;
  }
  `;
}

export function patchMaterial(mat, opts = {}) {
  const { wind = 0, translucency = 0, extraUniforms = null, onShader = null, fog = true } = opts;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, G);
    if (extraUniforms) Object.assign(shader.uniforms, extraUniforms);
    if (fog) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <fog_pars_vertex>', FOG_PARS_VERT)
        .replace('#include <fog_vertex>', FOG_VERT);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <fog_pars_fragment>', FOG_PARS_FRAG)
        .replace('#include <fog_fragment>', FOG_FRAG);
    }
    if (wind > 0) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + WIND_PARS)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + windVert(wind));
    }
    if (translucency > 0) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        #if NUM_DIR_LIGHTS > 0
          vec3 L = directionalLights[0].direction;
          float back = max(dot(-L, normalize(vViewPosition)), 0.0);
          float trans = pow(back, 3.0) * ${translucency.toFixed(3)};
          reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * trans * 0.6;
        #endif
      }`);
    }
    if (onShader) onShader(shader);
    mat.userData.shader = shader;
  };
  // materials that only get the shared fog/wind/translucency patch compile to identical code, so they share
  // programs; a per-material key is only needed when onShader / extra uniforms change the source
  const key = `hm-${fog}-${wind}-${translucency}-${onShader || extraUniforms ? (opts.key || '') : ''}`;
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => key + (prevKey ? prevKey.call(mat) : '');
  return mat;
}

// depth material for shadow casting that keeps wind + alpha test in sync
export function windDepthMaterial(map, wind, alphaTest = 0.5) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
  if (wind > 0) patchMaterial(m, { wind, fog: false, key: 'depth' });
  return m;
}
