// Rare real-animal false alarms (docs/SCARE_RESEARCH.md X4, owner approved Oct 25):
// a white-tailed deer that stares, blows and bolts, or a barred owl that lifts off a
// branch. The server schedules them (shared/sim/wildlife.js); every client animates the
// same animal locally from the event. Procedural models, built once and reused.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../render/shaderlib.js';
import { clamp, lerp, makeRng } from '../../shared/math.js';

const TAU = Math.PI * 2;
const DEER_MIN_VIEW = 15;   // m
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- geometry helpers
// Every part is tinted with vertex colours: a base coat plus countershading (lighter
// underside, darker back), the way real deer and owls are coloured.
function tint(g, base, { belly = null, bellyFrom = -0.35, back = 0.85, noise = 0.06, seed = 1 } = {}) {
  const pos = g.attributes.position, nrm = g.attributes.normal, n = pos.count;
  const col = new Float32Array(n * 3), c = new THREE.Color(base), b = belly ? new THREE.Color(belly) : null, r = makeRng(seed);
  for (let i = 0; i < n; i++) {
    const ny = nrm.getY(i);
    let rr = c.r, gg = c.g, bb = c.b;
    if (b) { const k = smooth(bellyFrom, bellyFrom - 0.35, ny); rr = lerp(rr, b.r, k); gg = lerp(gg, b.g, k); bb = lerp(bb, b.b, k); }
    const d = ny > 0.6 ? lerp(1, back, (ny - 0.6) / 0.4) : 1, j = 1 + (r() - 0.5) * noise;
    col[i * 3] = rr * d * j; col[i * 3 + 1] = gg * d * j; col[i * 3 + 2] = bb * d * j;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function blob(rx, ry, rz, x, y, z, color, opts, seg = 18) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  g.scale(rx, ry, rz); g.translate(x, y, z); g.computeVertexNormals();
  return tint(g, color, opts);
}
// tapered limb hanging down from its pivot (pivot at y = 0)
function limb(r0, r1, len, color, opts) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 9, 1);
  g.translate(0, -len / 2, 0);
  return tint(g, color, opts);
}
function merge(list) { const g = mergeGeometries(list.map((x) => x.index ? x.toNonIndexed() : x)); g.computeVertexNormals(); return g; }

function furMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.25 });
  patchMaterial(m, { key: 'wildlifeFur' });
  return m;
}
function eyeMaterial() { return new THREE.MeshBasicMaterial({ color: 0x050505, fog: false }); }

// ---------------------------------------------------------------- white-tailed deer (doe)
// ~1.6 m long, 0.95 m at the shoulder; October greyish-brown coat; white throat patch,
// belly, inner legs and tail underside (the "flag" raised when fleeing).
const COAT = 0x6e5a48, BELLY = 0xd8d2c6, DARK = 0x2a2420, WHITE = 0xe6e2da;
function buildDeer() {
  const mat = furMaterial(), m = (g) => { const x = new THREE.Mesh(g, mat); x.castShadow = true; x.receiveShadow = true; return x; };
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.92; root.add(body);
  const o = { belly: BELLY, bellyFrom: -0.3, seed: 3 };
  body.add(m(merge([
    blob(0.2, 0.25, 0.48, 0, 0, 0, COAT, o),            // barrel
    blob(0.19, 0.27, 0.22, 0, 0.03, 0.34, COAT, o),     // chest / shoulders
    blob(0.2, 0.25, 0.24, 0, 0.02, -0.38, COAT, o),     // haunches
    blob(0.13, 0.16, 0.08, 0, 0.0, -0.6, WHITE, {}),     // white rump patch
  ])));
  // neck + head (pivots so the head can lift and turn)
  const neck = new THREE.Group(); neck.position.set(0, 0.14, 0.44); body.add(neck);
  const neckG = new THREE.CylinderGeometry(0.075, 0.12, 0.5, 10, 1); neckG.translate(0, 0.25, 0);
  const neckM = m(merge([tint(neckG, COAT, { belly: WHITE, bellyFrom: 0.2, seed: 5 }), blob(0.07, 0.06, 0.05, 0, 0.36, 0.06, WHITE, {})]));
  neck.rotation.x = 0.62; neck.add(neckM);
  const head = new THREE.Group(); head.position.set(0, 0.5, 0); neck.add(head);
  head.rotation.x = -0.62;
  const headG = merge([
    blob(0.085, 0.09, 0.13, 0, 0.03, 0.04, COAT, { seed: 7 }),          // skull
    blob(0.055, 0.06, 0.12, 0, -0.01, 0.17, COAT, { seed: 8 }),         // muzzle
    blob(0.05, 0.03, 0.035, 0, -0.035, 0.25, WHITE, {}),                 // white muzzle band
    blob(0.032, 0.026, 0.025, 0, 0.0, 0.285, DARK, {}),                   // nose
  ]);
  head.add(m(headG));
  const earG = new THREE.ConeGeometry(0.055, 0.17, 8, 1); earG.scale(1, 1, 0.35); earG.translate(0, 0.085, 0);
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(tint(earG.clone(), COAT, { seed: 9 }), mat); ear.castShadow = true;
    ear.position.set(s * 0.07, 0.1, -0.02); ear.rotation.set(-0.15, 0, -s * 0.55); head.add(ear); ears.push(ear);
  }
  const eyes = [];
  const eyeG = new THREE.SphereGeometry(0.017, 8, 6), eyeMat = eyeMaterial();
  for (const s of [-1, 1]) { const e = new THREE.Mesh(eyeG, eyeMat); e.position.set(s * 0.072, 0.045, 0.1); head.add(e); eyes.push(e); }
  // tail: brown on top, white underneath; raised as a flag when running
  const tail = new THREE.Group(); tail.position.set(0, 0.12, -0.6); body.add(tail);
  const tailM = m(merge([blob(0.055, 0.03, 0.13, 0, 0, -0.1, COAT, { belly: WHITE, bellyFrom: 0.1, seed: 11 })]));
  tail.add(tailM);
  // legs: shoulder/hip pivot -> upper -> knee pivot -> lower + hoof
  const legs = [];
  for (const [fx, fz, front] of [[-1, 0.33, true], [1, 0.33, true], [-1, -0.37, false], [1, -0.37, false]]) {
    const hip = new THREE.Group(); hip.position.set(fx * 0.1, front ? -0.1 : -0.06, fz); body.add(hip);
    const upLen = front ? 0.36 : 0.42, loLen = front ? 0.47 : 0.45;
    const upper = m(merge([limb(front ? 0.06 : 0.08, 0.035, upLen, COAT, { belly: WHITE, bellyFrom: 0, seed: 13 })]));
    hip.add(upper);
    const knee = new THREE.Group(); knee.position.y = -upLen; hip.add(knee);
    const hoofG = new THREE.CylinderGeometry(0.022, 0.03, 0.06, 7); hoofG.translate(0, -loLen - 0.02, 0.005);
    knee.add(m(merge([limb(0.032, 0.022, loLen, COAT, { seed: 17 }), tint(hoofG, DARK, {})])));
    legs.push({ hip, knee, front, side: fx });
  }
  root.traverse((o) => { o.frustumCulled = false; });
  return { root, body, neck, head, ears, eyes, eyeMat, tail, legs };
}

// ---------------------------------------------------------------- barred owl
// ~50 cm tall, ~1.1 m wingspan; mottled grey-brown, pale facial disc, dark eyes that
// still throw back a dull orange shine in a flashlight beam.
const OWL = 0x6a5f55, OWL_PALE = 0xb9ab98, OWL_FACE = 0xa89a88;
function buildOwl() {
  const mat = furMaterial(), m = (g) => { const x = new THREE.Mesh(g, mat); x.castShadow = true; return x; };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  body.add(m(merge([
    blob(0.13, 0.2, 0.12, 0, 0.2, 0, OWL, { belly: OWL_PALE, bellyFrom: 0.2, noise: 0.18, seed: 21 }),
    blob(0.1, 0.06, 0.09, 0, 0.03, -0.02, OWL, { seed: 22 }),      // tail stub
  ])));
  const head = new THREE.Group(); head.position.y = 0.4; body.add(head);
  head.add(m(merge([
    blob(0.11, 0.1, 0.1, 0, 0, 0, OWL, { noise: 0.15, seed: 23 }),
    blob(0.085, 0.08, 0.03, 0, -0.005, 0.075, OWL_FACE, { noise: 0.05, seed: 24 }),   // facial disc
    blob(0.012, 0.02, 0.02, 0, -0.03, 0.105, 0x3a3a30, {}),                            // beak
  ])));
  const eyeG = new THREE.SphereGeometry(0.016, 8, 6), eyeMat = eyeMaterial(), eyes = [];
  for (const s of [-1, 1]) { const e = new THREE.Mesh(eyeG, eyeMat); e.position.set(s * 0.035, 0.005, 0.095); head.add(e); eyes.push(e); }
  // wings: rounded flat blades hinged at the shoulder
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.bezierCurveTo(0.18, 0.07, 0.42, 0.06, 0.52, -0.02);
  shape.bezierCurveTo(0.48, -0.16, 0.25, -0.24, 0.0, -0.2); shape.lineTo(0, 0);
  const wingG = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 10 });
  wingG.rotateX(Math.PI / 2); wingG.translate(0, 0, 0.0);
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.1, 0.3, 0.02); body.add(pivot);
    const g = tint(wingG.clone(), OWL, { belly: OWL_PALE, bellyFrom: -0.5, noise: 0.25, seed: 25 + s });
    if (s < 0) g.scale(-1, 1, 1);
    const w = new THREE.Mesh(g, mat); w.castShadow = true; pivot.add(w);
    wings.push({ pivot, side: s });
  }
  root.traverse((o) => { o.frustumCulled = false; });
  return { root, body, head, eyes, eyeMat, wings };
}

// ---------------------------------------------------------------- system
export class WildlifeSystem {
  constructor(scene, world, audio) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.deer = buildDeer(); this.owl = buildOwl();
    for (const a of [this.deer, this.owl]) { a.root.visible = false; scene.add(a.root); }
    this.active = null;
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3();
  }

  // e: the server's 'wildlife' event
  spawn(e, viewer) {
    // owner: the deer never appears close. The server places it 18-30 m from the player it
    // was chosen for; a teammate who happens to be nearer than DEER_MIN_VIEW just hears it.
    if (e.kind === 'deer' && Math.hypot(viewer.x - e.x, viewer.z - e.z) < DEER_MIN_VIEW) return;
    if (this.active) this.end();
    const rng = makeRng(e.s >>> 0);
    const a = { kind: e.kind, t: 0, x: e.x, y: e.y, z: e.z, fx: e.fx, fz: e.fz, rng, stepT: 0, said: {} };
    if (e.kind === 'deer') {
      a.alert = rng.range(0.9, 1.5);
      a.face = Math.atan2(viewer.x - e.x, viewer.z - e.z);     // looks at the player first
      a.flee = Math.atan2(e.fx, e.fz); a.yaw = a.face; a.speed = 0; a.dist = 0; a.phase = 0;
      this.deer.root.visible = true;
    } else {
      a.hold = rng.range(0.7, 1.4);
      a.yaw = Math.atan2(viewer.x - e.x, viewer.z - e.z); a.flee = Math.atan2(e.fx, e.fz);
      a.h = 0; a.dist = 0;
      this.owl.root.visible = true;
    }
    this.active = a;
  }

  end() {
    if (!this.active) return;
    (this.active.kind === 'deer' ? this.deer : this.owl).root.visible = false;
    this.active = null;
  }

  // flash: { on, pos, dir, k }  (k = beam strength 0..1)
  update(dt, camPos, flash) {
    const a = this.active; if (!a) return;
    a.t += dt;
    if (a.kind === 'deer') this._deer(a, dt, camPos); else this._owl(a, dt, camPos);
    // tapetum eyeshine: deer throw back a bright green-white, owls a dull orange
    const M = a.kind === 'deer' ? this.deer : this.owl;
    let shine = 0;
    if (flash && flash.on && M.root.visible) {
      M.eyes[0].getWorldPosition(this._v);
      const to = this._d.subVectors(this._v, flash.pos), d = to.length();
      if (d < 45) shine = clamp((to.normalize().dot(flash.dir) - 0.93) / 0.06, 0, 1) * (1 - d / 45) * (flash.k ?? 1);
    }
    const k = 0.02 + shine * 7;
    if (a.kind === 'deer') M.eyeMat.color.setRGB(k * 0.75, k * 0.95, k * 0.7); else M.eyeMat.color.setRGB(k * 0.9, k * 0.45, k * 0.12);
  }

  // [x, y(base), z, radius, height] of the active animal, for flashlight exposure/occlusion
  body() {
    const a = this.active; if (!a) return null;
    if (a.kind === 'deer') { const p = this.deer.root.position; return { x: p.x, y: p.y, z: p.z, r: 0.45, h: 1.5 }; }
    const p = this.owl.root.position; return { x: p.x, y: p.y, z: p.z, r: 0.25, h: 0.55 };
  }

  _ground(x, z) { return this.world.heightAt(x, z); }

  _deer(a, dt, cam) {
    const D = this.deer, A = this.audio;
    const bolting = a.t > a.alert;
    // alert: frozen stare, head high, ears forward, one foot stamp; then the blow
    if (!a.said.stamp && a.t > a.alert * 0.4) { a.said.stamp = true; A && A.footstep({ surface: 1, water: 0, brush: 0.2, loud: 0.8, speed: 1 }, { x: a.x, y: a.y, z: a.z }); }
    if (!a.said.blow && a.t > a.alert - 0.25) { a.said.blow = true; A && A.at('deerBlow' + (a.rng() * 3 | 0), { x: a.x, y: a.y + 1.3, z: a.z }, { bus: 'sfx', gain: 1.25, ref: 6, reverb: 0.35 }); }
    if (bolting) {
      const tb = a.t - a.alert;
      a.yaw = a.face + angleTo(a.face, a.flee) * smooth(0, 0.35, tb);
      a.speed = Math.min(10.5, a.speed + dt * (tb < 0.6 ? 16 : 4));
      a.x += Math.sin(a.yaw) * a.speed * dt; a.z += Math.cos(a.yaw) * a.speed * dt; a.dist += a.speed * dt;
      a.phase += dt * 2.3;
      a.stepT -= dt;
      if (a.stepT <= 0) {
        a.stepT = 1 / 2.3;
        const p = { x: a.x, y: this._ground(a.x, a.z) + 0.1, z: a.z };
        A && A.footstep({ surface: 1, water: 0, brush: 0.9, loud: 1, speed: 6 }, p);
        A && A.footstep({ surface: 1, water: 0, brush: 0.7, loud: 0.8, speed: 6 }, p);
      }
      if (a.dist > 34 || a.t > a.alert + 5) { this.end(); return; }
    }
    const g = this._ground(a.x, a.z);
    const ph = a.phase * TAU, run = bolting ? smooth(0, 0.4, a.t - a.alert) : 0;
    // rotary bound: the body arcs up off the hind legs and lands on the fore legs
    const lift = run * Math.max(0, Math.sin(ph)) * 0.38;
    D.root.position.set(a.x, g + lift, a.z); D.root.rotation.y = a.yaw;
    D.body.rotation.x = run * Math.sin(ph + 0.6) * 0.16;
    // head: stare at the player while alert (ears forward, a small tilt), forward and low when running
    const look = bolting ? 0 : clamp(angleTo(a.yaw, Math.atan2(cam.x - a.x, cam.z - a.z)), -0.9, 0.9);
    D.neck.rotation.y = look * 0.6;
    D.neck.rotation.x = lerp(0.35, 1.0, run);
    D.head.rotation.x = lerp(-0.45, -1.05, run); D.head.rotation.z = bolting ? 0 : Math.sin(a.t * 1.3) * 0.06;
    for (const [i, e] of D.ears.entries()) e.rotation.x = lerp(-0.15, -0.9, run) + (bolting ? 0 : Math.sin(a.t * 3 + i) * 0.05);
    D.tail.rotation.x = lerp(0.35, -1.25, smooth(0, 0.25, a.t - a.alert + 0.15));   // the white flag
    for (const L of D.legs) {
      const off = (L.front ? Math.PI * 0.95 : 0) + (L.side > 0 ? 0.25 : 0);
      const s = Math.sin(ph + off), c = Math.cos(ph + off);
      const stand = !bolting && L.front && L.side > 0 && a.t > a.alert * 0.35 && a.t < a.alert * 0.55 ? -0.35 : 0;  // the stamp
      L.hip.rotation.x = run * s * (L.front ? 0.85 : 0.75) + stand;
      L.knee.rotation.x = run * Math.max(0, c) * (L.front ? -1.35 : 1.1) + (stand ? -0.6 : 0);
    }
  }

  _owl(a, dt) {
    const O = this.owl, A = this.audio;
    const fly = a.t > a.hold, tf = a.t - a.hold;
    if (fly && !a.said.wings) { a.said.wings = true; A && A.at('wings' + (a.rng() * 3 | 0), { x: a.x, y: a.y, z: a.z }, { bus: 'sfx', gain: 1.1, ref: 4, reverb: 0.3 }); }
    if (fly) {
      a.yaw = a.yaw + angleTo(a.yaw, a.flee) * Math.min(1, dt * 6);
      const sp = Math.min(8, 2 + tf * 7);
      a.x += Math.sin(a.yaw) * sp * dt; a.z += Math.cos(a.yaw) * sp * dt; a.dist += sp * dt;
      a.h += (tf < 0.5 ? -1.4 : 0.35 * Math.sin(tf * 1.7)) * dt;   // drops off the branch, then glides
      if (a.dist > 30 || tf > 5) {
        // a few seconds later it calls from further off: the night going on as normal
        const fx = a.x + Math.sin(a.flee) * 15, fz = a.z + Math.cos(a.flee) * 15;
        if (A) A.at('owlHoot' + (a.rng() * 3 | 0), { x: fx, y: a.y + 3, z: fz }, { bus: 'amb', gain: 0.55, ref: 18, reverb: 0.6, delay: 2 + a.rng() * 3 });
        this.end(); return;
      }
    }
    O.root.position.set(a.x, a.y + a.h, a.z); O.root.rotation.y = a.yaw;
    O.body.rotation.x = fly ? lerp(0, 1.1, smooth(0, 0.6, tf)) : 0;   // leans into level flight
    O.head.rotation.y = fly ? 0 : Math.sin(a.t * 2.1) * 0.5;          // the slow head swivel while perched
    O.head.rotation.x = fly ? -lerp(0, 1.0, smooth(0, 0.6, tf)) : 0;
    const flap = fly ? (tf < 1.6 ? Math.sin(tf * TAU * 3.2) : Math.sin(tf * TAU * 0.6) * 0.15) : 0;
    const open = fly ? smooth(0, 0.25, tf) : 0;
    for (const w of O.wings) {
      // folded: blade hangs down along the body; open: straight out and flapping
      w.pivot.rotation.z = w.side * lerp(-1.45, 0.15 + flap * 0.85, open);
      w.pivot.rotation.y = w.side * lerp(0.35, 0, open);
    }
  }
}

function angleTo(a, b) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
