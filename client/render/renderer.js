// Renderer + post stack: HDR scene target (MSAA + depth), volumetric flashlight and
// moon shafts (shadow-map raymarch), SF6 gas volumes, bloom, filmic tonemap, night grading,
// terror effects (frost, aberration, peripheral distortion), grain and dithering.
import * as THREE from 'three';
import { G, NOISE_GLSL } from './shaderlib.js';

const FS_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Renderer {
  constructor(canvas, settings) {
    this.settings = settings;
    const r = this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false, preserveDrawingBuffer: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsGeo = new THREE.BufferGeometry();
    this.fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.fsMesh = new THREE.Mesh(this.fsGeo);
    this.fsMesh.frustumCulled = false;
    this.fsScene = new THREE.Scene(); this.fsScene.add(this.fsMesh);
    this._makeMaterials();
    this.dynScale = 1;
    this.resize();
  }

  _makeMaterials() {
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, uThreshold: { value: 1.2 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`varying vec2 vUv; uniform sampler2D tColor; uniform float uThreshold;
        void main(){ vec3 c = texture2D(tColor, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold * 2.5, l), 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uTexel;
        void main(){ vec3 s = vec3(0.0);
          s += texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb; s += texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb;
          s += texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb; s += texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb;
          s += texture2D(tColor, vUv).rgb * 2.0;
          gl_FragColor = vec4(s / 6.0, 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.finalU = {
      tColor: { value: null }, tDepth: { value: null }, tBloom0: { value: null }, tBloom1: { value: null }, tBloom2: { value: null },
      tFrost: { value: null }, tMoonShadow: { value: null },
      uProjInv: { value: new THREE.Matrix4() }, uViewInv: { value: new THREE.Matrix4() },
      uShadowMatrix: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uFlashPos: { value: new THREE.Vector3() }, uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
      uFlashCos: { value: new THREE.Vector2(0.9, 0.95) }, uFlashI: { value: 0 }, uFlashRange: { value: 40 },
      uVolSteps: { value: 10 }, uVolOn: { value: 1 },
      uExposure: { value: 1.0 }, uRes: { value: new THREE.Vector2(1, 1) },
      uTerrorFx: { value: 0 }, uCold: { value: 0 }, uFear: { value: 0 }, uHeart: { value: 0 },
      uDamage: { value: 0 }, uDowned: { value: 0 }, uGasFx: { value: 0 }, uFade: { value: 0 },
      uGrain: { value: 1 }, uAberration: { value: 0 }, uAnomaly: { value: 0 }, uBloom: { value: 0.42 },
      uGasCount: { value: 0 },
      uGas: { value: [new THREE.Vector4(0, -999, 0, 0), new THREE.Vector4(0, -999, 0, 0), new THREE.Vector4(0, -999, 0, 0), new THREE.Vector4(0, -999, 0, 0)] },
      ...G,
    };
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: this.finalU,
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBloom0; uniform sampler2D tBloom1; uniform sampler2D tBloom2;
        uniform sampler2D tFrost; uniform sampler2DShadow tMoonShadow;
        uniform mat4 uProjInv; uniform mat4 uViewInv; uniform mat4 uShadowMatrix; uniform float uShadowOn;
        uniform vec3 uCamPos; uniform vec3 uFlashPos; uniform vec3 uFlashDir; uniform vec2 uFlashCos; uniform float uFlashI; uniform float uFlashRange;
        uniform float uVolSteps; uniform float uVolOn; uniform float uExposure; uniform vec2 uRes;
        uniform float uTerrorFx; uniform float uCold; uniform float uFear; uniform float uHeart; uniform float uDamage; uniform float uDowned;
        uniform float uGasFx; uniform float uFade; uniform float uGrain; uniform float uAberration; uniform float uAnomaly; uniform float uBloom;
        uniform float uTime; uniform vec3 uMoonDir; uniform vec3 uMoonColor; uniform float uMoonVis; uniform float uFogDensity; uniform float uMist;
        uniform vec4 uGas[4]; uniform float uGasCount;
        ${NOISE_GLSL}
        vec3 viewPos(vec2 uv, float d) { vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec4 v = uProjInv * c; return v.xyz / v.w; }
        vec3 aces(vec3 x) { const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main() {
          vec2 uv = vUv;
          vec2 cen = uv - 0.5;
          float edge = smoothstep(0.25, 0.75, length(cen * vec2(uRes.x / uRes.y, 1.0)));
          vec2 warp = vec2(hm_vnoise(uv * 6.0 + uTime * 0.6) - 0.5, hm_vnoise(uv * 6.0 - uTime * 0.5 + 9.0) - 0.5);
          uv += warp * (uAnomaly * 0.02 * edge + uGasFx * 0.012);
          float depth = texture2D(tDepth, uv).r;
          vec3 vp = viewPos(uv, depth);
          vec3 wp = (uViewInv * vec4(vp, 1.0)).xyz;
          vec3 rd = normalize(wp - uCamPos);
          float sceneDist = depth >= 0.99999 ? 1e4 : length(wp - uCamPos);
          float ca = (uAberration + uGasFx * 0.6) * 0.004 * edge;
          vec3 col;
          col.r = texture2D(tColor, uv + cen * ca).r;
          col.g = texture2D(tColor, uv).g;
          col.b = texture2D(tColor, uv - cen * ca).b;
          if (uGasFx > 0.01) {
            vec3 g2 = texture2D(tColor, uv + vec2(0.006, 0.002) * uGasFx * sin(uTime * 1.3)).rgb;
            col = mix(col, g2, 0.35 * uGasFx);
          }
          float jit = ign(gl_FragCoord.xy + fract(uTime * 7.1) * 57.0);
          if (uVolOn > 0.5) {
            float maxD = min(sceneDist, max(uFlashRange, 34.0));
            float stepL = maxD / uVolSteps;
            float beam = 0.0, shafts = 0.0;
            float halfA = acos(uFlashCos.x);
            for (float i = 0.0; i < 16.0; i += 1.0) {
              if (i >= uVolSteps) break;
              float t = (i + jit) * stepL;
              vec3 p = uCamPos + rd * t;
              float dens = (uFogDensity * 10.0 + uMist * 0.04 * smoothstep(0.35, 0.8, hm_fbm(p.xz * 0.035 + vec2(uTime * 0.012, uTime * 0.007))) * exp(-max(p.y + 0.4, 0.0) * 0.6)) * (1.0 + 0.35 * uTerrorFx);
              if (uFlashI > 0.0) {
                vec3 lv = p - uFlashPos; float ld = length(lv);
                float th = acos(clamp(dot(lv / max(ld, 1e-3), uFlashDir), -1.0, 1.0));
                float cone = exp(-pow(th / (halfA * 0.42), 2.0)) * 0.8 + exp(-pow(th / (halfA * 0.85), 2.0)) * 0.2;
                beam += cone * dens / (1.0 + ld * ld * 0.09) * stepL * smoothstep(0.6, 3.0, ld);
              }
              if (uShadowOn > 0.5) {
                vec4 sc = uShadowMatrix * vec4(p, 1.0); sc.xyz /= sc.w;
                if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) shafts += texture(tMoonShadow, vec3(sc.xy, sc.z - 0.002)) * dens * stepL;
              }
            }
            float mu = dot(rd, uMoonDir);
            float phaseM = 0.12 + 0.9 * pow(max(mu, 0.0), 5.0);
            col += vec3(1.0, 0.94, 0.82) * beam * uFlashI * 0.016;
            col += uMoonColor * shafts * phaseM * uMoonVis * 0.012;
          }
          for (int k = 0; k < 4; k++) {
            if (float(k) >= uGasCount) break;
            vec4 g = uGas[k];
            vec3 oc = uCamPos - g.xyz;
            float b = dot(oc, rd); float c = dot(oc, oc) - g.w * g.w;
            float h = b * b - c;
            if (h > 0.0) {
              h = sqrt(h);
              float t0 = max(-b - h, 0.0), t1 = min(-b + h, sceneDist);
              if (t1 > t0) {
                vec3 mid = uCamPos + rd * (t0 + t1) * 0.5;
                float n = hm_fbm(mid.xz * 0.4 + uTime * 0.15);
                // SF6 is ~5x denser than air: the cloud pools in the first metre above the ground
                float lowK = exp(-max(mid.y - (g.y - 1.0) - 0.9, 0.0) * 1.1);
                float a = (1.0 - exp(-(t1 - t0) * (0.07 + 0.09 * n) * (0.35 + 0.65 * lowK))) * 0.85;
                vec3 gc = vec3(0.045, 0.05, 0.04) + uMoonColor * 0.025 * uMoonVis;
                float lit = uFlashI > 0.0 ? smoothstep(uFlashCos.x * 0.98, 1.0, dot(normalize(mid - uFlashPos), uFlashDir)) / (1.0 + dot(mid - uFlashPos, mid - uFlashPos) * 0.05) : 0.0;
                gc += vec3(0.42, 0.44, 0.3) * lit * uFlashI * 0.05;
                col = mix(col, gc, a);
              }
            }
          }
          vec3 bl = texture2D(tBloom0, uv).rgb * 0.5 + texture2D(tBloom1, uv).rgb * 0.35 + texture2D(tBloom2, uv).rgb * 0.3;
          col += bl * uBloom;
          col *= uExposure;
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          float scot = 1.0 - smoothstep(0.02, 0.35, lum);
          col = mix(col, vec3(lum) * vec3(0.78, 0.9, 1.25), scot * 0.55);
          col = aces(col * 1.15);
          float fear = clamp(uFear, 0.0, 1.0);
          float l2 = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, vec3(l2), fear * 0.45 + uDowned * 0.7);
          col *= mix(vec3(1.0), vec3(0.9, 0.97, 1.08), uCold);
          // frost creeps in from the corners as the air gets colder (texture mirrored, no visible seam)
          vec2 fuv = uv * vec2(uRes.x / uRes.y, 1.0) * 0.75;
          float frost = texture2D(tFrost, fuv).a;
          float er = length(cen * vec2(1.15, 1.0)) * 1.55;
          float fr = smoothstep(1.1 - uCold * 0.2, 1.3, er + (frost - 0.5) * 0.16);
          col = mix(col, col * 0.62 + vec3(0.05, 0.06, 0.075) * (0.5 + frost * 0.6), fr * uCold * 0.42);
          float vig = smoothstep(1.1, 0.25, length(cen * vec2(1.1, 1.0)) * (1.0 + fear * 0.35 + uHeart * 0.08));
          col *= mix(0.55, 1.0, vig);
          col = mix(col, col * vec3(1.0, 0.25, 0.2), uDamage * (1.0 - vig) * 0.9);
          col = mix(col, vec3(0.02, 0.025, 0.02), uGasFx * 0.25);
          float gr = (hm_hash12(gl_FragCoord.xy + fract(uTime * 13.7) * 311.0) - 0.5);
          col += gr * (0.013 + fear * 0.026) * uGrain * (1.0 - l2 * 0.6);
          col = toSRGB(clamp(col, 0.0, 1.0));
          col += (jit - 0.5) / 255.0;
          col *= 1.0 - uFade;
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
  }

  setQuality(preset, renderScale) {
    this.preset = preset;
    this.renderScale = renderScale * preset.renderScale;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setPixelRatio(this.pixelRatio);
    this.gl.setSize(w, h, false);
    const scale = (this.renderScale || 1) * this.dynScale;
    const rw = Math.max(320, Math.floor(w * this.pixelRatio * scale)), rh = Math.max(180, Math.floor(h * this.pixelRatio * scale));
    if (this.sceneRT && this.sceneRT.width === rw && this.sceneRT.height === rh && this.sceneRT.samples === (this.preset?.msaa || 0)) return;
    if (this.sceneRT) { this.sceneRT.dispose(); this.sceneRT.depthTexture.dispose(); for (const b of this.bloomRTs) b.dispose(); }
    const dt = new THREE.DepthTexture(rw, rh, THREE.UnsignedIntType);
    this.sceneRT = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.HalfFloatType, samples: this.preset?.msaa || 0, depthTexture: dt, depthBuffer: true });
    this.sceneRT.texture.minFilter = THREE.LinearFilter; this.sceneRT.texture.generateMipmaps = false;
    this.bloomRTs = [];
    let bw = rw >> 1, bh = rh >> 1;
    for (let i = 0; i < 6; i++) {
      this.bloomRTs.push(new THREE.WebGLRenderTarget(Math.max(4, bw), Math.max(4, bh), { type: THREE.HalfFloatType, depthBuffer: false }));
      if (i % 2 === 1) { bw >>= 1; bh >>= 1; }
    }
    this.finalU.uRes.value.set(w, h);
  }

  _fs(mat, target) {
    this.fsMesh.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.fsScene, this.fsCam);
  }

  render(scene, camera, fx) {
    const gl = this.gl;
    gl.info.reset();
    gl.setRenderTarget(this.sceneRT);
    gl.clear();
    gl.render(scene, camera);
    this.brightMat.uniforms.tColor.value = this.sceneRT.texture;
    this.brightMat.uniforms.uThreshold.value = 1.2 / Math.max(0.15, this.exposure || 1);   // bloom follows eye adaptation
    this._fs(this.brightMat, this.bloomRTs[0]);
    const blur = (src, dst) => { this.blurMat.uniforms.tColor.value = src.texture; this.blurMat.uniforms.uTexel.value.set(1.5 / src.width, 1.5 / src.height); this._fs(this.blurMat, dst); };
    for (let i = 0; i < 5; i++) blur(this.bloomRTs[i], this.bloomRTs[i + 1]);
    const u = this.finalU;
    u.tColor.value = this.sceneRT.texture; u.tDepth.value = this.sceneRT.depthTexture;
    u.tBloom0.value = this.bloomRTs[1].texture; u.tBloom1.value = this.bloomRTs[3].texture; u.tBloom2.value = this.bloomRTs[5].texture;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uViewInv.value.copy(camera.matrixWorld);
    u.uCamPos.value.copy(camera.position);
    u.uVolSteps.value = this.preset?.fogSteps || 8;
    u.uVolOn.value = this.preset?.volumetric ? 1 : 0;
    if (fx) fx(u);
    this._fs(this.finalMat, null);
  }
}
