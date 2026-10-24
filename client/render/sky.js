// Night sky: gradient + Oklahoma City light dome, stars, drifting clouds,
// and the Helium Moon - a waxing gibbous with real phase shading and a halo.
import * as THREE from 'three';
import { G, NOISE_GLSL } from './shaderlib.js';
import { CONFIG } from '../../shared/config.js';

export class Sky {
  constructor(bank) {
    const az = THREE.MathUtils.degToRad(CONFIG.MOON_AZIMUTH_DEG), el = THREE.MathUtils.degToRad(CONFIG.MOON_ELEVATION_DEG);
    // azimuth from north (-z) clockwise toward east (+x)
    this.moonDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    G.uMoonDir.value.copy(this.moonDir);
    this.uniforms = {
      uMoonTex: { value: bank.tex.moon },
      uMoonRadius: { value: THREE.MathUtils.degToRad(CONFIG.MOON_ANGULAR_SIZE / 2) },
      uPhase: { value: Math.acos(2 * CONFIG.MOON_PHASE - 1) },
      uMoonCloud: { value: 0 },
      uMoonCloudOff: { value: new THREE.Vector2(0, 0) },
      uCloudCover: { value: 0.42 },
      uCloudDrift: { value: new THREE.Vector2(0, 0) },
      uHaloPulse: { value: 0 },
      uMoonBright: { value: 1 },
      uStarDim: { value: 1 },
      uCityDir: { value: new THREE.Vector3(0.82, 0, 0.42).normalize() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...G, ...this.uniforms },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uMoonDir; uniform vec3 uMoonColor; uniform float uTime; uniform float uTerror;
        uniform sampler2D uMoonTex; uniform float uMoonRadius; uniform float uPhase; uniform float uMoonCloud;
        uniform vec2 uMoonCloudOff; uniform float uCloudCover; uniform vec2 uCloudDrift; uniform float uHaloPulse;
        uniform float uMoonBright; uniform float uStarDim; uniform vec3 uCityDir; uniform vec3 uFogColor;
        ${NOISE_GLSL}
        float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        vec3 hash33(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
        float stars(vec3 d, float scale, float density, float size) {
          vec3 p = d * scale; vec3 c = floor(p); vec3 f = fract(p);
          float h = hash31(c);
          if (h > density) return 0.0;
          vec3 sp = hash33(c) * 0.8 + 0.1;
          float dist = length(f - sp);
          float b = pow(hash31(c + 7.7), 6.0);
          float tw = 0.75 + 0.25 * sin(uTime * (2.0 + 6.0 * hash31(c + 3.1)) + h * 50.0);
          return smoothstep(size, 0.0, dist) * (0.15 + 2.6 * b) * tw;
        }
        void main() {
          vec3 d = normalize(vDir);
          float el = d.y;
          vec3 zenith = vec3(0.0035, 0.0055, 0.013);
          vec3 horizon = vec3(0.016, 0.02, 0.032);
          vec3 col = mix(horizon, zenith, smoothstep(-0.02, 0.55, el));
          vec2 dxz = normalize(d.xz + 1e-5);
          float cityA = max(dot(dxz, normalize(uCityDir.xz)), 0.0);
          col += vec3(0.07, 0.042, 0.022) * pow(cityA, 3.0) * exp(-max(el, 0.0) * 9.0);
          col += vec3(0.02, 0.016, 0.012) * exp(-max(el, 0.0) * 14.0);
          float mu = dot(d, uMoonDir);
          float ang = acos(clamp(mu, -1.0, 1.0));
          col += uMoonColor * (0.012 * exp(-ang * 4.0) + 0.05 * exp(-ang * 22.0)) * uMoonBright * (1.0 - uMoonCloud * 0.5);
          float haloR = 0.13 + 0.004 * sin(uTime * 0.21);
          col += vec3(0.022, 0.024, 0.03) * exp(-pow((ang - haloR) / 0.035, 2.0)) * (0.5 + 0.5 * uHaloPulse) * (0.3 + 0.7 * uMoonBright);
          col += vec3(0.05, 0.055, 0.068) * exp(-ang / 0.03) * uMoonBright;
          float starVis = smoothstep(0.02, 0.25, el) * (1.0 - exp(-ang * 7.0)) * uStarDim;
          float s = stars(d, 160.0, 0.18, 0.09) + stars(d, 330.0, 0.25, 0.07) * 0.45 + stars(d, 620.0, 0.3, 0.06) * 0.2;
          col += vec3(0.82, 0.87, 1.0) * s * starVis * 0.9;
          vec3 f = uMoonDir;
          vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
          vec3 u = cross(r, f);
          vec3 off = d - f * mu;
          vec2 mp = vec2(dot(off, r), dot(off, u)) / sin(uMoonRadius);
          float mr = length(mp);
          if (mu > 0.0 && mr < 1.03) {
            float z = sqrt(max(1.0 - mr * mr, 0.0));
            vec3 N = normalize(r * mp.x + u * mp.y - f * z);
            vec3 L = normalize(r * sin(uPhase) - f * cos(uPhase));
            float lam = max(dot(N, L), 0.0);
            float ls = lam / (lam + max(dot(N, -f), 0.05)) * 2.0;
            float alb = texture2D(uMoonTex, vec2(mp.x * 0.5 + 0.5, mp.y * 0.5 + 0.5)).r;
            float terminator = smoothstep(0.0, 0.08, lam);
            vec3 mc = vec3(1.0, 0.975, 0.93) * alb * ls * terminator * 5.2 * uMoonBright;
            mc += vec3(0.02, 0.022, 0.03) * alb * (1.0 - terminator);
            col = mix(col, mc, smoothstep(1.02, 0.985, mr));
          }
          if (el > 0.0) {
            vec2 cp = d.xz / (el + 0.12) * 1.2 + uCloudDrift;
            vec2 sp = vec2(cp.x * 0.55, cp.y * 1.3);
            float c = hm_fbm(sp * 0.7) * 0.6 + hm_fbm(sp * 2.3 + 3.0) * 0.28 + hm_fbm(cp * 6.0) * 0.12;
            float cover = smoothstep(1.0 - uCloudCover - 0.05, 1.0 - uCloudCover + 0.45, c) * 0.85;
            float mc2 = uMoonCloud * smoothstep(0.32, 0.0, length(vec2(dot(off, r), dot(off, u)) - uMoonCloudOff)) * (0.6 + 0.4 * hm_fbm(cp * 3.0));
            cover = max(cover * (1.0 - smoothstep(0.25, 0.05, ang) * 0.85), mc2);
            cover *= smoothstep(0.0, 0.12, el);
            float silver = pow(max(mu, 0.0), 10.0) * 0.9 + pow(max(mu, 0.0), 2.0) * 0.12;
            vec3 cloudCol = uMoonColor * (0.018 + silver * (1.0 - cover * 0.6)) * uMoonBright + vec3(0.012, 0.009, 0.007) * pow(cityA, 2.0) * exp(-el * 4.0);
            col = mix(col, cloudCol, cover * 0.92);
          }
          col = mix(col, uFogColor * 1.2, smoothstep(0.02, -0.08, el));
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthWrite: false, depthTest: true, side: THREE.BackSide,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.material = mat;
    this.cloudT = 0; this.nextCloud = 40 + Math.random() * 40; this.cloudLen = 18;
    this.drift = new THREE.Vector2(); this.driftVel = new THREE.Vector2(0.006, 0.0025);
    this.abnormal = 0;
  }

  // returns current moonlight visibility (0..1)
  update(dt, camPos, terror) {
    this.mesh.position.copy(camPos);
    const u = this.uniforms;
    this.cloudT += dt;
    let mc = 0;
    if (this.cloudT > this.nextCloud) {
      const t = (this.cloudT - this.nextCloud) / this.cloudLen;
      if (t >= 1) { this.nextCloud = this.cloudT + 50 + Math.random() * 90; this.cloudLen = 14 + Math.random() * 22; }
      else { mc = Math.sin(Math.PI * t) ** 0.6; u.uMoonCloudOff.value.set((t - 0.5) * 0.25, 0.02); }
    }
    u.uMoonCloud.value = mc;
    // Helium Moon abnormality: cloud drift occasionally reverses against the wind, faster near the entity
    this.abnormal = Math.max(0, Math.sin(G.uTime.value * 0.031) * 1.4 - 0.4) + terror * 0.6;
    const dir = 1 - 2 * Math.min(1, this.abnormal);
    this.drift.x += this.driftVel.x * dir * dt * (1 + terror * 2);
    this.drift.y += this.driftVel.y * dt;
    u.uCloudDrift.value.copy(this.drift);
    u.uHaloPulse.value = 0.5 + 0.5 * Math.sin(G.uTime.value * 0.4 + Math.sin(G.uTime.value * 0.11) * 3) * (0.3 + terror * 0.7);
    const flick = 1 - (terror * 0.18) * (0.5 + 0.5 * Math.sin(G.uTime.value * 7.3) * Math.sin(G.uTime.value * 3.1));
    u.uMoonBright.value = flick;
    const vis = (1 - mc * 0.78) * flick;
    G.uMoonVis.value = vis;
    return vis;
  }
}
