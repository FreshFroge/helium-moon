// HELIUM MOON - deterministic world generation (terrain, water, masks, vegetation,
// structures, colliders, navigation). Runs identically in the browser and in Node so
// the server's monster AI sees exactly the same trees, river and terrain as players.

import { CONFIG } from './config.js';
import { MAP_DATA } from './mapData.js';
import {
  clamp, lerp, smoothstep, makeRng, makeNoise2, cumulativeLengths, pointAtDistance,
  nearestOnPolyline, pointInPolygon, distanceTransform, rasterPolyline, TAU, BinaryHeap,
} from './math.js';

// Species table. Leaf texture + bark texture names are resolved by the client.
export const SPECIES = [
  { id: 0, name: 'post oak',     bark: 'oak',        leaf: 'oak',   hMin: 11, hMax: 22 },
  { id: 1, name: 'sycamore',     bark: 'sycamore',   leaf: 'ash',   hMin: 15, hMax: 28 },
  { id: 2, name: 'cottonwood',   bark: 'cottonwood', leaf: 'aspen', hMin: 18, hMax: 30 },
  { id: 3, name: 'american elm', bark: 'elm',        leaf: 'ash',   hMin: 10, hMax: 20 },
  { id: 4, name: 'hackberry',    bark: 'hackberry',  leaf: 'oak',   hMin: 8,  hMax: 16 },
  { id: 5, name: 'dead snag',    bark: 'elm',        leaf: null,    hMin: 6,  hMax: 16 },
  { id: 6, name: 'red cedar',    bark: 'cedar',      leaf: 'cedar', hMin: 5,  hMax: 12 },
];

export const SURFACE = { LITTER: 0, DIRT: 1, MUD: 2, GRASS: 3, SILT: 4, WATER: 5, GRAVEL: 6, WOOD: 7, ASPHALT: 8 };

export class World {
  // Build step by step, yielding so a loading screen can update (browser) - same result as new World().
  static async createAsync(opts = {}, progress = () => {}) {
    const w = new World({ ...opts, deferred: true });
    const steps = [['_features', 'Tracing the East Trail'], ['_grids', 'Mapping the refuge'], ['_heights', 'Shaping the floodplain'],
      ['_surfaces', 'Laying leaf litter'], ['_structures', 'Placing landmarks'], ['_vegetation', 'Growing the forest'],
      ['_colliders', 'Tracing collision'], ['_navigation', 'Final touches']];
    const t0 = Date.now();
    for (let i = 0; i < steps.length; i++) {
      progress(i / steps.length, steps[i][1]);
      await new Promise((r) => setTimeout(r, 0));
      w[steps[i][0]]();
    }
    w.buildMs = Date.now() - t0;
    progress(1, 'Done');
    return w;
  }

  constructor(opts = {}) {
    const t0 = Date.now();
    this.cfg = CONFIG;
    this.S = opts.mapScale || CONFIG.MAP_SCALE;
    this.seed = CONFIG.WORLD_SEED;
    this.log = opts.log || (() => {});
    this.td0 = [-95, -150]; this.td1 = [245, 250];
    this.tdC = [(this.td0[0] + this.td1[0]) / 2, (this.td0[1] + this.td1[1]) / 2];
    this.W = (this.td1[0] - this.td0[0]) * this.S;
    this.H = (this.td1[1] - this.td0[1]) * this.S;
    this.minX = -this.W / 2; this.minZ = -this.H / 2;
    this.noise = makeNoise2(this.seed);
    this.noise2 = makeNoise2(this.seed + 99);
    if (opts.deferred) return;
    this._features(); this._grids(); this._heights(); this._surfaces();
    this._structures(); this._vegetation(); this._colliders(); this._navigation();
    this.buildMs = Date.now() - t0;
    this.log(`world built in ${this.buildMs} ms`);
  }

  tdToWorld(p) { return [(p[0] - this.tdC[0]) * this.S, (p[1] - this.tdC[1]) * this.S]; }

  // ------------------------------------------------------------ traced features
  _features() {
    const conv = (arr) => arr.map((p) => this.tdToWorld(p));
    const scaleEll = (e) => { const c = this.tdToWorld(e.c); return { x: c[0], z: c[1], rx: e.rx * this.S, rz: e.ry * this.S, rot: e.rot }; };
    this.trail = conv(MAP_DATA.trail);
    this.trailCum = cumulativeLengths(this.trail);
    this.trailLength = this.trailCum[this.trailCum.length - 1];
    this.river = conv(MAP_DATA.river);
    const rn = this.river[0], rn2 = this.river[3];
    const dx = rn[0] - rn2[0], dz = rn[1] - rn2[1], L = Math.hypot(dx, dz);
    this.river.unshift([rn[0] + dx / L * 260, rn[1] + dz / L * 260]);
    this.riverCum = cumulativeLengths(this.river);
    this.creek = conv(MAP_DATA.creek);
    this.sidePath = conv(MAP_DATA.sidePath);
    this.pondWater = scaleEll(MAP_DATA.pondWater);
    this.sandFlat = scaleEll(MAP_DATA.sandFlat);
    this.pondClearing = conv(MAP_DATA.pondClearing);
    this.seSwamp = conv(MAP_DATA.seSwamp);
    this.swSwamp = conv(MAP_DATA.swSwamp);
    this.wMarsh = conv(MAP_DATA.wMarsh);
    this.ponds = [scaleEll(MAP_DATA.swPond), ...MAP_DATA.sePonds.map(scaleEll)];
    this.poi = {};
    for (const [k, v] of Object.entries(MAP_DATA.poi)) {
      const p = this.tdToWorld(v.td);
      const nt = nearestOnPolyline(this.trail, this.trailCum, p[0], p[1]);
      this.poi[k] = { key: k, name: v.name, x: p[0], z: p[1], along: nt.along, trailDist: nt.d };
    }
    // fence line: trail offset to the right (field side)
    const off = CONFIG.FENCE_OFFSET;
    this.fence = [];
    for (let i = 0; i < this.trail.length; i++) {
      const a = this.trail[Math.max(0, i - 2)], b = this.trail[Math.min(this.trail.length - 1, i + 2)];
      const dx2 = b[0] - a[0], dz2 = b[1] - a[1], l2 = Math.hypot(dx2, dz2) || 1;
      this.fence.push([this.trail[i][0] - dz2 / l2 * off, this.trail[i][1] + dx2 / l2 * off]);
    }
    const far = 2200;
    const fieldPoly = this.fence.slice(4);
    const tail = [];
    for (let i = this.fence.length - 1; i >= 4; i -= 6) {
      const a = this.trail[Math.max(0, i - 3)], b = this.trail[Math.min(this.trail.length - 1, i + 3)];
      const dx2 = b[0] - a[0], dz2 = b[1] - a[1], l2 = Math.hypot(dx2, dz2) || 1;
      tail.push([this.fence[i][0] - dz2 / l2 * far, this.fence[i][1] + dx2 / l2 * far]);
    }
    this.fieldPoly = fieldPoly.concat(tail);
    // sloughs: old meander scars inside the refuge, one crossing at the footbridge
    const rng = makeRng(this.seed + 7);
    this.sloughs = [];
    const bridge = this.poi.bridge;
    const tAt = pointAtDistance(this.trail, this.trailCum, bridge.along);
    {
      const dir = tAt.dir + Math.PI / 2;
      const pts = [];
      for (let i = -6; i <= 6; i++) {
        const s = i * 9;
        // Anchor the channel to the actual trail crossing, not the nearby map
        // annotation. Keep its meander zero at i=0 so it runs under the span.
        pts.push([tAt.x + Math.sin(dir) * s + Math.sin(i * 0.5) * 6, tAt.z + Math.cos(dir) * s + (Math.cos(i * 0.4) - 1) * 5]);
      }
      this.sloughs.push({ pts, halfW: 2.6, depth: 1.8, bridge: true });
    }
    for (let k = 0; k < 7; k++) {
      const along = rng.range(0.08, 0.92) * this.trailLength;
      const p = pointAtDistance(this.trail, this.trailCum, along);
      const left = p.dir - Math.PI / 2;
      const depth = rng.range(30, 140);
      const cx = p.x + Math.sin(left) * depth, cz = p.z + Math.cos(left) * depth;
      const a0 = rng.range(0, TAU), R = rng.range(35, 70), span = rng.range(1.2, 2.6);
      const pts = [];
      for (let i = 0; i <= 14; i++) { const a = a0 + span * (i / 14); pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); }
      this.sloughs.push({ pts, halfW: rng.range(2.5, 4.5), depth: rng.range(0.7, 1.2) });
    }
    this.parking = { x: this.poi.trailhead.x + 14, z: this.poi.trailhead.z + 4, hx: 22, hz: 14, rot: 0.1 };
    const end = this.trail[this.trail.length - 1];
    this.highway = { z: end[1] - 18, x0: this.minX - 50, x1: this.minX + this.W + 50, halfW: 9, embank: 4.2, slope: 14 };
  }

  // half width + overgrowth (0..1) of the old River Road at a distance along the trail
  trailShape(along) {
    const C = CONFIG;
    const f = along / this.trailLength;
    const n = this.noise(along / 37, 4.2) * 0.5 + this.noise(along / 9, 7.7) * 0.18;
    const over = clamp(smoothstep(0.42, 0.95, f) * 0.85 + n * 0.35 + 0.08, 0, 1);
    const halfW = lerp(C.TRAIL_HALF_WIDTH, C.TRAIL_HALF_WIDTH_NORTH, smoothstep(0.35, 0.95, f)) * (1 + n * 0.12);
    return { halfW, over };
  }

  // ------------------------------------------------------------ 2 m grids
  _grids() {
    const R = CONFIG.GRID_RES;
    this.gw = Math.ceil(this.W / R) + 1; this.gh = Math.ceil(this.H / R) + 1;
    const gw = this.gw, gh = this.gh, n = gw * gh;
    const toCell = (p) => [(p[0] - this.minX) / R, (p[1] - this.minZ) / R];
    const m = new Uint8Array(n);
    rasterPolyline(m, gw, gh, this.trail.map(toCell));
    this.gTrail = distanceTransform(m, gw, gh); for (let i = 0; i < n; i++) this.gTrail[i] *= R;
    m.fill(0); rasterPolyline(m, gw, gh, this.river.map(toCell));
    this.gRiver = distanceTransform(m, gw, gh); for (let i = 0; i < n; i++) this.gRiver[i] *= R;
    this.gField = new Uint8Array(n);
    this.gSwamp = new Float32Array(n);
    this.gClearing = new Uint8Array(n);
    const swampMask = new Uint8Array(n), notSwamp = new Uint8Array(n);
    const bbox = (poly) => { let a = [1e9, 1e9], b = [-1e9, -1e9]; for (const p of poly) { a = [Math.min(a[0], p[0]), Math.min(a[1], p[1])]; b = [Math.max(b[0], p[0]), Math.max(b[1], p[1])]; } return [a, b]; };
    const fill = (poly, arr, v) => {
      const [a, b] = bbox(poly);
      const x0 = Math.max(0, Math.floor((a[0] - this.minX) / R)), x1 = Math.min(gw - 1, Math.ceil((b[0] - this.minX) / R));
      const y0 = Math.max(0, Math.floor((a[1] - this.minZ) / R)), y1 = Math.min(gh - 1, Math.ceil((b[1] - this.minZ) / R));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (pointInPolygon(poly, this.minX + x * R, this.minZ + y * R)) arr[y * gw + x] = v;
      }
    };
    fill(this.fieldPoly, this.gField, 1);
    for (const p of [this.seSwamp, this.swSwamp, this.wMarsh]) fill(p, swampMask, 1);
    fill(this.pondClearing, this.gClearing, 1);
    for (let i = 0; i < n; i++) notSwamp[i] = swampMask[i] ? 0 : 1;
    const dIn = distanceTransform(notSwamp, gw, gh);
    for (let i = 0; i < n; i++) this.gSwamp[i] = swampMask[i] ? smoothstep(0, 12, dIn[i] * R) : 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (this._inParking(this.minX + x * R, this.minZ + y * R, 6)) this.gField[y * gw + x] = 0;
    }
    const fieldD = distanceTransform(this.gField, gw, gh);
    this.gFieldDist = fieldD; for (let i = 0; i < n; i++) this.gFieldDist[i] *= R;
    this.gPlay = new Uint8Array(n);
    const nz = this.noise2;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      const wx = this.minX + x * R, wz = this.minZ + y * R;
      const corridor = CONFIG.CORRIDOR_WIDTH + nz.fbm(wx / 90, wz / 90, 2) * 35;
      let ok = !this.gField[i] && this.gTrail[i] < corridor;
      if (this._inParking(wx, wz, 2)) ok = true;
      if (wz < this.highway.z + this.highway.halfW + 4) ok = false;
      if (x < 3 || y < 3 || x > gw - 4 || y > gh - 4) ok = false;
      this.gPlay[i] = ok ? 1 : 0;
    }
    const outside = new Uint8Array(n); for (let i = 0; i < n; i++) outside[i] = this.gPlay[i] ? 0 : 1;
    this.gEdge = distanceTransform(outside, gw, gh); for (let i = 0; i < n; i++) this.gEdge[i] *= R;
    this.gOutDist = distanceTransform(this.gPlay, gw, gh); for (let i = 0; i < n; i++) this.gOutDist[i] *= R;
    this.gThicket = new Float32Array(n);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const wx = this.minX + x * R, wz = this.minZ + y * R;
      this.gThicket[y * gw + x] = smoothstep(0.05, 0.42, nz.fbm(wx / 55 + 31, wz / 55 - 17, 3));
    }
  }

  _inParking(x, z, pad = 0) {
    const p = this.parking; const c = Math.cos(-p.rot), s = Math.sin(-p.rot);
    const lx = (x - p.x) * c - (z - p.z) * s, lz = (x - p.x) * s + (z - p.z) * c;
    return Math.abs(lx) < p.hx + pad && Math.abs(lz) < p.hz + pad;
  }

  sampleGrid(arr, x, z) {
    const R = CONFIG.GRID_RES;
    let fx = (x - this.minX) / R, fz = (z - this.minZ) / R;
    fx = clamp(fx, 0, this.gw - 1.001); fz = clamp(fz, 0, this.gh - 1.001);
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, w = this.gw;
    const a = arr[iz * w + ix], b = arr[iz * w + ix + 1], c = arr[(iz + 1) * w + ix], d = arr[(iz + 1) * w + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }
  gridAt(arr, x, z) {
    const R = CONFIG.GRID_RES;
    const ix = clamp(Math.round((x - this.minX) / R), 0, this.gw - 1), iz = clamp(Math.round((z - this.minZ) / R), 0, this.gh - 1);
    return arr[iz * this.gw + ix];
  }
  cellOf(x, z) {
    const R = CONFIG.GRID_RES;
    return clamp(Math.round((z - this.minZ) / R), 0, this.gh - 1) * this.gw + clamp(Math.round((x - this.minX) / R), 0, this.gw - 1);
  }
  cellPos(i) { const R = CONFIG.GRID_RES; return [this.minX + (i % this.gw) * R, this.minZ + Math.floor(i / this.gw) * R]; }
  isPlayable(x, z) { return this.gridAt(this.gPlay, x, z) === 1; }

  trailInfo(x, z) { return nearestOnPolyline(this.trail, this.trailCum, x, z); }
  riverInfo(x, z) { return nearestOnPolyline(this.river, this.riverCum, x, z); }

  _ellipseSdf(e, x, z) {
    const c = Math.cos(-e.rot), s = Math.sin(-e.rot);
    const lx = (x - e.x) * c - (z - e.z) * s, lz = (x - e.x) * s + (z - e.z) * c;
    return (Math.hypot(lx / e.rx, lz / e.rz) - 1) * Math.min(e.rx, e.rz);
  }

  // ------------------------------------------------------------ heights (1 m)
  _heights() {
    const R = CONFIG.HEIGHT_RES;
    const hw = this.hw = Math.ceil(this.W / R) + 1, hh = this.hh = Math.ceil(this.H / R) + 1;
    const h = this.heights = new Float32Array(hw * hh);
    this.trailD = new Float32Array(hw * hh).fill(99);
    this.riverD = new Float32Array(hw * hh).fill(999);
    this.trailAlong = new Float32Array(hw * hh);
    const tmpN = { d: 0, along: 0 };
    const nz = this.noise;
    const C = CONFIG;
    const trailBuckets = this._segBuckets(this.trail, 24);
    const riverBuckets = this._segBuckets(this.river, 32);
    const hwy = this.highway;
    for (let y = 0; y < hh; y++) {
      const wz = this.minZ + y * R;
      for (let x = 0; x < hw; x++) {
        const wx = this.minX + x * R;
        const i = y * hw + x;
        const low = nz.fbm(wx / 210, wz / 210, 3);
        let base = 0.55 + low * 1.4 + nz.fbm(wx / 48 + 9.1, wz / 48 - 3.3, 3) * 0.45 + nz(wx / 7.3, wz / 7.3) * 0.07;
        base = base < -0.25 ? -0.25 + (base + 0.25) * 0.2 : base;
        const fieldW = this.sampleGrid(this.gField, wx, wz);
        if (fieldW > 0) base = lerp(base, 0.85 + low * 0.5, clamp(fieldW, 0, 1));
        const sw = this.sampleGrid(this.gSwamp, wx, wz);
        if (sw > 0) base -= sw * (1.15 + nz(wx / 11, wz / 11) * 0.45);
        let bridgeChannelDist = 1e9;
        for (const sl of this.sloughs) {
          const d = this._polyDist(sl.pts, wx, wz, 30);
          if (sl.bridge) bridgeChannelDist = d;
          if (d < sl.halfW + 6) base -= sl.depth * (1 - smoothstep(sl.halfW * 0.5, sl.halfW + 6, d));
        }
        const pw = this._ellipseSdf(this.pondWater, wx, wz);
        if (pw < 14) base = Math.min(base, lerp(-1.9, base, smoothstep(-6, 14, pw)));
        for (const e of this.ponds) {
          const d = this._ellipseSdf(e, wx, wz);
          if (d < 10) base = Math.min(base, lerp(-1.6, base, smoothstep(-4, 10, d)));
        }
        const cd = this._polyDist(this.creek, wx, wz, 30);
        if (cd < 9) base -= 1.25 * (1 - smoothstep(1.2, 9, cd));
        const gr = this.sampleGrid(this.gRiver, wx, wz);
        if (gr < 45) {
          const rd = this._bucketDist(riverBuckets, this.river, wx, wz);
          this.riverD[i] = rd;
          const hwR = C.RIVER_HALF_WIDTH + nz(wx / 37, wz / 37) * 1.6;
          const bank = C.RIVER_BANK;
          if (rd < hwR) {
            const t = rd / hwR;
            base = C.WATER_LEVEL - 0.25 - 1.5 * (1 - t * t);
          } else if (rd < hwR + bank) {
            const t = smoothstep(hwR, hwR + bank, rd);
            base = lerp(C.WATER_LEVEL - 0.25, base + 0.35, Math.pow(t, 0.7));
          } else {
            base += 0.35 * (1 - smoothstep(hwR + bank, hwR + bank + 18, rd));
          }
        }
        const dzh = Math.abs(wz - hwy.z);
        if (dzh < hwy.halfW + hwy.slope) {
          const t = 1 - smoothstep(hwy.halfW, hwy.halfW + hwy.slope, dzh);
          if (gr > 26) base = lerp(base, hwy.embank, t);
        }
        if (this._inParking(wx, wz, 3)) base = lerp(base, 0.9, this._inParking(wx, wz, 0) ? 1 : 0.6);
        const gt = this.sampleGrid(this.gTrail, wx, wz);
        if (gt < 12) {
          this._bucketNearest(trailBuckets, this.trail, this.trailCum, wx, wz, tmpN);
          const td = tmpN.d;
          this.trailD[i] = td; this.trailAlong[i] = tmpN.along;
          const shp = this.trailShape(tmpN.along);
          const smooth = 0.55 + low * 1.4 + nz.fbm(wx / 48 + 9.1, wz / 48 - 3.3, 3) * 0.45;
          let target = Math.max(smooth, C.WATER_LEVEL + 1.6) - 0.1;
          const rutOff = shp.halfW * 0.48;
          target -= 0.085 * (1 - shp.over * 0.6) * Math.exp(-(((td - rutOff) / (0.28 + shp.over * 0.1)) ** 2));
          // The trail crosses this slough on a deck. Flattening it like dirt
          // filled the channel back in and left the bridge floating on land.
          const bridgeOpening = 1 - smoothstep(2.0, 5.2, bridgeChannelDist);
          const t = (1 - smoothstep(shp.halfW * 0.85, shp.halfW + 2.4, td)) * (1 - bridgeOpening);
          base = lerp(base, target, t);
          if (td < shp.halfW + 2.4 && base < C.WATER_LEVEL + 1.4) base = lerp(base, C.WATER_LEVEL + 1.4, t);
        }
        // Retain a shallow, wet channel through the crossing even where the
        // surrounding floodplain happens to be elevated by procedural noise.
        if (bridgeChannelDist < 5.2) base = Math.min(base, lerp(C.SWAMP_WATER_LEVEL - 0.65, base, smoothstep(2.0, 5.2, bridgeChannelDist)));
        h[i] = base;
      }
    }
  }

  _segBuckets(pts, cell) {
    const b = new Map();
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const x0 = Math.floor((Math.min(ax, bx) - 50) / cell), x1 = Math.floor((Math.max(ax, bx) + 50) / cell);
      const z0 = Math.floor((Math.min(az, bz) - 50) / cell), z1 = Math.floor((Math.max(az, bz) + 50) / cell);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const k = x * 73856093 ^ z * 19349663;
        let arr = b.get(k); if (!arr) b.set(k, arr = []); arr.push(i);
      }
    }
    b.cell = cell;
    return b;
  }

  _bucketDist(b, pts, x, z) {
    const arr = b.get(Math.floor(x / b.cell) * 73856093 ^ Math.floor(z / b.cell) * 19349663);
    if (!arr) return 99;
    let best = 1e9;
    for (const i of arr) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x, ez = az + dz * t - z; const d = ex * ex + ez * ez;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  _bucketNearest(b, pts, cum, x, z, out) {
    const arr = b.get(Math.floor(x / b.cell) * 73856093 ^ Math.floor(z / b.cell) * 19349663);
    out.d = 99; out.along = 0;
    if (!arr) return out;
    let best = 1e9;
    for (const i of arr) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x, ez = az + dz * t - z; const d = ex * ex + ez * ez;
      if (d < best) { best = d; out.along = cum[i - 1] + Math.sqrt(L2) * t; }
    }
    out.d = Math.sqrt(best);
    return out;
  }

  _polyDist(pts, x, z, early = 1e9) {
    if (!pts._bb) {
      let a = [1e9, 1e9], b = [-1e9, -1e9];
      for (const p of pts) { a = [Math.min(a[0], p[0]), Math.min(a[1], p[1])]; b = [Math.max(b[0], p[0]), Math.max(b[1], p[1])]; }
      pts._bb = [a, b];
    }
    const [a, b] = pts._bb;
    if (x < a[0] - early || x > b[0] + early || z < a[1] - early || z > b[1] + early) return 1e9;
    let best = 1e18;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x, ez = az + dz * t - z; const d = ex * ex + ez * ez;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  heightAt(x, z) {
    const R = CONFIG.HEIGHT_RES;
    let fx = (x - this.minX) / R, fz = (z - this.minZ) / R;
    fx = clamp(fx, 0, this.hw - 1.001); fz = clamp(fz, 0, this.hh - 1.001);
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, w = this.hw, h = this.heights;
    const a = h[iz * w + ix], b = h[iz * w + ix + 1], c = h[(iz + 1) * w + ix], d = h[(iz + 1) * w + ix + 1];
    if (tx + tz < 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  normalAt(x, z) {
    const e = 0.75;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    return [-hx / l, 2 * e / l, -hz / l];
  }

  waterAt(x, z) {
    const g = this.heightAt(x, z);
    const rd = this.riverDistAt(x, z);
    if (rd < CONFIG.RIVER_HALF_WIDTH + CONFIG.RIVER_BANK && g < CONFIG.WATER_LEVEL) return CONFIG.WATER_LEVEL;
    if (this.isWetZone(x, z) && g < CONFIG.SWAMP_WATER_LEVEL) return CONFIG.SWAMP_WATER_LEVEL;
    return null;
  }
  riverDistAt(x, z) { return this._rawSample(this.riverD, x, z); }
  trailDistAt(x, z) { return this._rawSample(this.trailD, x, z); }
  trailAlongAt(x, z) { return this._rawSample(this.trailAlong, x, z); }
  _rawSample(arr, x, z) {
    const R = CONFIG.HEIGHT_RES;
    const ix = clamp(Math.round((x - this.minX) / R), 0, this.hw - 1), iz = clamp(Math.round((z - this.minZ) / R), 0, this.hh - 1);
    return arr[iz * this.hw + ix];
  }
  isWetZone(x, z) {
    if (this.sampleGrid(this.gSwamp, x, z) > 0.02) return true;
    if (this._ellipseSdf(this.pondWater, x, z) < 16) return true;
    for (const e of this.ponds) if (this._ellipseSdf(e, x, z) < 12) return true;
    for (const sl of this.sloughs) if (this._polyDist(sl.pts, x, z, 12) < sl.halfW + 6) return true;
    if (this._polyDist(this.creek, x, z, 12) < 9) return true;
    return false;
  }

  // ------------------------------------------------------------ surface splat (1 m, RGBA8)
  // R: distance to trail centre (0..12 m), G: mud, B: grass / road overgrowth, A: silt
  _surfaces() {
    const hw = this.hw, hh = this.hh, n = hw * hh, R = CONFIG.HEIGHT_RES;
    const sp = this.splat = new Uint8Array(n * 4);
    const nz = this.noise2;
    const C = CONFIG;
    for (let y = 0; y < hh; y++) {
      const wz = this.minZ + y * R;
      for (let x = 0; x < hw; x++) {
        const wx = this.minX + x * R; const i = y * hw + x;
        const g = this.heights[i];
        const td = this.trailD[i];
        let trail = td;
        if (this._inParking(wx, wz, 0)) trail = 0.0;
        const hwy = this.highway;
        let mud = 0, grass = 0, silt = 0;
        const rd = this.riverD[i];
        if (rd < C.RIVER_HALF_WIDTH + C.RIVER_BANK + 4) {
          silt = 1 - smoothstep(C.RIVER_HALF_WIDTH + 1, C.RIVER_HALF_WIDTH + C.RIVER_BANK + 4, rd);
          silt *= 0.75 + 0.25 * nz(wx / 6, wz / 6);
        }
        const wetZone = this.sampleGrid(this.gSwamp, wx, wz);
        const wl = C.SWAMP_WATER_LEVEL;
        if (g < wl + 0.35) mud = Math.max(mud, 1 - smoothstep(wl - 0.05, wl + 0.35, g));
        if (rd < C.RIVER_HALF_WIDTH + 3) mud = Math.max(mud, 0.7);
        mud = Math.max(mud, wetZone * 0.6);
        mud *= clamp(0.65 + 0.5 * nz(wx / 9 + 3, wz / 9), 0, 1);
        if (td < 3 && nz(wx / 14, wz / 14) > 0.32) mud = Math.max(mud, 0.75);
        const field = this.gridAt(this.gField, wx, wz);
        const clearing = this.gridAt(this.gClearing, wx, wz);
        if (field) grass = 1;
        if (clearing) grass = Math.max(grass, 0.85 * smoothstep(-0.1, 0.4, nz(wx / 8, wz / 8) + 0.3));
        const fd = this.sampleGrid(this.gFieldDist, wx, wz);
        if (!field && fd < 12) grass = Math.max(grass, (1 - smoothstep(4, 12, fd)) * 0.9);
        if (this._ellipseSdf(this.sandFlat, wx, wz) < 0) silt = Math.max(silt, 0.9);
        if (Math.abs(wz - hwy.z) < hwy.halfW + hwy.slope) grass = Math.max(grass, 0.8);
        if (td < 6) {
          const shp = this.trailShape(this.trailAlong[i]);
          const k = 1 - smoothstep(shp.halfW + 0.4, shp.halfW + 1.6, td);
          grass = lerp(grass, shp.over, k);
        }
        sp[i * 4] = clamp(Math.round(trail / 12 * 255), 0, 255);
        sp[i * 4 + 1] = clamp(Math.round(mud * 255), 0, 255);
        sp[i * 4 + 2] = clamp(Math.round(grass * 255), 0, 255);
        sp[i * 4 + 3] = clamp(Math.round(silt * 255), 0, 255);
      }
    }
  }

  surfaceAt(x, z) {
    if (this.deckAt(x, z) !== null) return SURFACE.WOOD;
    const w = this.waterAt(x, z);
    if (w !== null && w - this.heightAt(x, z) > 0.04) return SURFACE.WATER;
    const R = CONFIG.HEIGHT_RES;
    const ix = clamp(Math.round((x - this.minX) / R), 0, this.hw - 1), iz = clamp(Math.round((z - this.minZ) / R), 0, this.hh - 1);
    const i = (iz * this.hw + ix) * 4, sp = this.splat;
    if (this._inParking(x, z, 0)) return SURFACE.GRAVEL;
    if (Math.abs(z - this.highway.z) < this.highway.halfW - 2) return SURFACE.ASPHALT;
    const trail = sp[i] / 255 * 12;
    if (sp[i + 1] > 150) return SURFACE.MUD;
    if (trail < 4) {
      const shp = this.trailShape(this.trailAlong[iz * this.hw + ix]);
      if (trail < shp.halfW) return (trail < 0.4 && shp.over > 0.55) ? SURFACE.GRASS : SURFACE.DIRT;
    }
    if (sp[i + 3] > 140) return SURFACE.SILT;
    if (sp[i + 2] > 140) return SURFACE.GRASS;
    return SURFACE.LITTER;
  }

  // ------------------------------------------------------------ structures / POIs
  _structures() {
    const s = this.structures = [];
    const add = (type, x, z, rot, extra = {}) => { const o = { type, x, z, y: this.heightAt(x, z), rot, ...extra }; s.push(o); return o; };
    const faceTrail = (p) => { const n = this.trailInfo(p.x, p.z); return Math.atan2(n.x - p.x, n.z - p.z); };
    const P = this.poi;
    const pk = this.parking;
    add('lot', pk.x, pk.z, pk.rot, { hx: pk.hx, hz: pk.hz });
    add('kiosk', P.trailhead.x - 6, P.trailhead.z - 2, faceTrail({ x: P.trailhead.x + 6, z: P.trailhead.z + 6 }) + Math.PI);
    add('car', pk.x + 6, pk.z - 4, pk.rot + 1.45, { color: 0x3a4652 });
    add('car', pk.x - 4, pk.z + 6, pk.rot - 1.6, { color: 0x6b1f1f });
    add('gate', P.trailhead.x - 1, P.trailhead.z + 1, faceTrail(P.trailhead) + Math.PI / 2);
    add('sign', pk.x + 18, pk.z + 12, pk.rot + Math.PI);
    {
      // warning sign beside the gate, granite monument a short way up the trail (reference photos)
      const g0 = pointAtDistance(this.trail, this.trailCum, 6);
      const left = g0.dir - Math.PI / 2;
      add('warning', g0.x + Math.sin(left) * 3.4, g0.z + Math.cos(left) * 3.4, g0.dir + Math.PI);
      const m0 = pointAtDistance(this.trail, this.trailCum, 34);
      const l2 = m0.dir - Math.PI / 2;
      add('monument', m0.x + Math.sin(l2) * 4.2, m0.z + Math.cos(l2) * 4.2, Math.atan2(-Math.sin(l2), -Math.cos(l2)));
    }
    add('streetlight', pk.x + 20, pk.z - 12, 0);
    add('bench', P.overlook.x, P.overlook.z, Math.atan2(...this._riverDir(P.overlook)));
    add('pumphouse', P.pumphouse.x, P.pumphouse.z, faceTrail(P.pumphouse));
    add('blind', P.blind.x, P.blind.z, Math.atan2(this.pondWater.x - P.blind.x, this.pondWater.z - P.blind.z));
    add('shed', P.shed.x, P.shed.z, faceTrail(P.shed));
    add('camp', P.camp.x, P.camp.z, faceTrail(P.camp));
    const br = pointAtDistance(this.trail, this.trailCum, P.bridge.along);
    const bridgeLength = 13, rampLength = 2.4;
    const bankY = [-1, 1].map((side) => this.heightAt(br.x + Math.sin(br.dir) * side * (bridgeLength / 2 + rampLength), br.z + Math.cos(br.dir) * side * (bridgeLength / 2 + rampLength)) + 0.035);
    add('footbridge', br.x, br.z, br.dir, {
      length: bridgeLength, rampLength, bankY,
      // deckY is the planks' top and collision surface, with short ramps
      // connecting to each existing bank instead of a floating 0.6 m step.
      deckY: Math.max(...bankY) + 0.1,
    });
    add('fishing', P.fishing.x, P.fishing.z, Math.atan2(...this._riverDir(P.fishing)));
    add('mast', P.mast.x, P.mast.z, 0.3);
    add('highwaybridge', 0, this.highway.z, 0);
    this.fencePosts = [];
    const fc = cumulativeLengths(this.fence);
    const fl = fc[fc.length - 1];
    for (let d = 40; d < fl - 40; d += 3.2) {
      const p = pointAtDistance(this.fence, fc, d);
      if (this.heightAt(p.x, p.z) < CONFIG.WATER_LEVEL + 0.8) continue;
      this.fencePosts.push([p.x, this.heightAt(p.x, p.z), p.z, p.dir]);
    }
    this.fenceLine = this.fence;
    this.fenceCum = fc;
    this.powerPoles = [];
    for (let d = 60; d < fl - 60; d += 46) {
      const p = pointAtDistance(this.fence, fc, d);
      const right = p.dir + Math.PI / 2;
      const x = p.x + Math.sin(right) * 7, z = p.z + Math.cos(right) * 7;
      if (this.heightAt(x, z) < CONFIG.WATER_LEVEL + 1) continue;
      this.powerPoles.push([x, this.heightAt(x, z), z, p.dir]);
    }
  }

  _riverDir(p) { const n = this.riverInfo(p.x, p.z); return [n.x - p.x, n.z - p.z]; }

  // height of walkable structure surfaces (footbridge deck); null if none
  deckAt(x, z) {
    if (!this.structures) return null;
    for (const o of this.structures) {
      if (o.type !== 'footbridge') continue;
      const dx = x - o.x, dz = z - o.z;
      const along = dx * Math.sin(o.rot) + dz * Math.cos(o.rot);
      const across = dx * Math.cos(o.rot) - dz * Math.sin(o.rot);
      if (Math.abs(across) >= 1.3) continue;
      const distance = Math.abs(along), half = o.length / 2;
      if (distance <= half) return o.deckY;
      if (distance < half + o.rampLength) {
        const bankY = o.bankY[along < 0 ? 0 : 1];
        return lerp(o.deckY, bankY, (distance - half) / o.rampLength);
      }
    }
    return null;
  }

  // ------------------------------------------------------------ vegetation
  _vegetation() {
    const rng = makeRng(this.seed + 31);
    const C = CONFIG;
    const trees = [], bushes = [], grass = [], reeds = [], logs = [], debris = [], stumps = [];
    const nz = this.noise2;
    const structClear = (x, z, r) => {
      for (const o of this.structures) {
        const rr = o.type === 'lot' ? 30 : o.type === 'highwaybridge' ? 0 : o.type === 'mast' ? 7 : o.type === 'footbridge' ? 9 : o.type === 'monument' ? 3.5 : 6;
        if (rr && Math.hypot(x - o.x, z - o.z) < rr + r) return false;
      }
      return true;
    };
    const R = 3.7; // canopy grid (dense Oklahoma river-bottom hardwoods)
    const X0 = this.minX + 4, Z0 = this.minZ + 4;
    const nx = Math.floor((this.W - 8) / R), nzc = Math.floor((this.H - 8) / R);
    for (let gy = 0; gy < nzc; gy++) for (let gx = 0; gx < nx; gx++) {
      const x = X0 + (gx + rng()) * R, z = Z0 + (gy + rng()) * R;
      if (Math.abs(z - this.highway.z) < this.highway.halfW + this.highway.slope + 2) continue;
      if (z < this.highway.z - 30 && rng() > 0.25) continue;
      const play = this.isPlayable(x, z);
      const tdist = this.sampleGrid(this.gTrail, x, z);
      const field = this.gridAt(this.gField, x, z);
      if (field) { if (rng() < 0.004) trees.push(this._tree(rng, x, z, 2, 1.1, false)); continue; }
      if (!play && tdist > C.CORRIDOR_WIDTH + 260) continue;
      const g = this.heightAt(x, z);
      const water = this.waterAt(x, z);
      const rd = this.riverDistAt(x, z);
      if (rd < C.RIVER_HALF_WIDTH + 1.5) continue;
      if (water !== null && water - g > 0.5) continue;
      const td = tdist < 12 ? this.trailDistAt(x, z) : tdist;
      const trailHalf = tdist < 12 ? this.trailShape(this.trailAlongAt(x, z)).halfW : C.TRAIL_HALF_WIDTH;
      if (td < trailHalf + 0.9) continue;
      if (!structClear(x, z, 1)) continue;
      const sw = this.sampleGrid(this.gSwamp, x, z);
      const clearing = this.gridAt(this.gClearing, x, z);
      let density = 0.9 + nz.fbm(x / 70, z / 70, 2) * 0.3;
      if (clearing) density *= 0.08;
      if (sw > 0.2) density *= 0.55;
      if (td < 6) density *= 0.92;
      if (this.sampleGrid(this.gFieldDist, x, z) < 6) density *= 0.8;
      if (!play) density *= 0.85;
      if (rng() > density) continue;
      let sp;
      const riparian = rd < 45;
      const r = rng();
      if (sw > 0.25 && r < 0.45) sp = 5;
      else if (riparian) sp = r < 0.38 ? 2 : r < 0.72 ? 1 : r < 0.86 ? 3 : 4;
      else sp = r < 0.3 ? 0 : r < 0.5 ? 4 : r < 0.66 ? 3 : r < 0.74 ? 1 : r < 0.8 ? 2 : 6;
      if (this.sampleGrid(this.gFieldDist, x, z) < 25 && rng() < 0.35) sp = 6;
      const sizeR = rng();
      const size = sizeR < 0.22 ? 2 : sizeR < 0.64 ? 1 : 0;
      trees.push(this._tree(rng, x, z, sp, [0.45, 0.72, 1.0][size], play));
    }
    const U = 2.2;
    const ux = Math.floor((this.W - 8) / U), uz = Math.floor((this.H - 8) / U);
    for (let gy = 0; gy < uz; gy++) for (let gx = 0; gx < ux; gx++) {
      const x = X0 + (gx + rng()) * U, z = Z0 + (gy + rng()) * U;
      const tdist = this.sampleGrid(this.gTrail, x, z);
      const field = this.gridAt(this.gField, x, z);
      const play = this.isPlayable(x, z);
      if (!play && !(field && this.sampleGrid(this.gFieldDist, x, z) < 140) && tdist > C.CORRIDOR_WIDTH + 60) continue;
      if (Math.abs(z - this.highway.z) < this.highway.halfW + 1) continue;
      const g = this.heightAt(x, z);
      const water = this.waterAt(x, z);
      const td = tdist < 12 ? this.trailDistAt(x, z) : tdist;
      const shp = tdist < 12 ? this.trailShape(this.trailAlongAt(x, z)) : { halfW: C.TRAIL_HALF_WIDTH, over: 0 };
      const onTrail = td < shp.halfW - 0.15 * shp.over;
      if (this._inParking(x, z, 1)) continue;
      if (!structClear(x, z, 0)) continue;
      const rd = this.riverDistAt(x, z);
      if (field) { if (rng() < 0.55) grass.push([x, g, z, rng.range(0.7, 1.25), rng() * TAU, 1]); continue; }
      if (water !== null) {
        if (water - g < 0.45 && rng() < 0.55) reeds.push([x, g, z, rng.range(0.7, 1.3), rng() * TAU]);
        continue;
      }
      if (rd < C.RIVER_HALF_WIDTH + 1) continue;
      if (onTrail) continue;
      const thick = this.sampleGrid(this.gThicket, x, z);
      const clearing = this.gridAt(this.gClearing, x, z);
      const sw = this.sampleGrid(this.gSwamp, x, z);
      const edge = td < 5 ? 0.6 + shp.over * 0.6 : 0;
      const pg = 0.05 + edge * 0.5 + (clearing ? 0.85 : 0) + (rd < C.RIVER_HALF_WIDTH + C.RIVER_BANK + 6 ? 0.35 : 0) + (this.sampleGrid(this.gFieldDist, x, z) < 12 ? 0.8 : 0);
      if (rng() < pg) grass.push([x, g, z, rng.range(0.6, 1.2), rng() * TAU, clearing ? 0 : 2]);
      let pb = 0.14 + thick * 0.72 + (td < 3.5 ? 0.18 + shp.over * 0.35 : 0) + sw * 0.15;
      if (clearing) pb *= 0.3;
      if (td < shp.halfW + 0.8) pb *= 0.15 + shp.over * 0.3;
      if (rng() < pb) {
        const kind = rng() < 0.6 ? 0 : rng() < 0.5 ? 1 : 2;
        bushes.push([x, g, z, rng.range(0.7, 1.5) * (0.8 + thick * 0.5), rng() * TAU, kind, thick]);
      }
      if (rng() < 0.07 + thick * 0.1 && td > 2.5) trees.push(this._tree(rng, x, z, rng() < 0.5 ? 4 : 3, rng.range(0.18, 0.32), play));
      if (rng() < 0.035) debris.push([x, g, z, rng.range(0.6, 2.2), rng() * TAU, rng.range(0.02, 0.06)]);
    }
    for (let k = 0; k < 2600; k++) {
      const x = rng.range(this.minX + 20, this.minX + this.W - 20), z = rng.range(this.minZ + 20, this.minZ + this.H - 20);
      const tdist = this.sampleGrid(this.gTrail, x, z);
      if (!this.isPlayable(x, z) && tdist > C.CORRIDOR_WIDTH + 40) continue;
      if (this.gridAt(this.gField, x, z)) continue;
      const td = tdist < 12 ? this.trailDistAt(x, z) : tdist;
      if (this.waterAt(x, z) !== null && rng() < 0.6) continue;
      if (!structClear(x, z, 3)) continue;
      const len = rng.range(3, 13), rad = rng.range(0.12, 0.42), yaw = rng() * TAU;
      if (td < 4 && rng() > 0.18) continue;
      // keep fallen trunks out of the walkable trail: only thin, step-over branches may cross it
      if (rad > 0.15 && tdist < len + 6) {
        let blocks = false;
        for (let k2 = 0; k2 <= 6 && !blocks; k2++) {
          const f = k2 / 6 - 0.5, px = x + Math.sin(yaw) * len * f, pz = z + Math.cos(yaw) * len * f;
          const pa = this.trailAlongAt(px, pz), hw = this.trailShape(pa).halfW;
          if (this.trailDistAt(px, pz) < hw + rad + 0.9) blocks = true;
        }
        if (blocks) continue;
      }
      logs.push([x, this.heightAt(x, z), z, len, rad, yaw, rng.range(-0.06, 0.06), rng.int(0, 4)]);
      if (rng() < 0.4) stumps.push([x + Math.sin(yaw) * (len / 2 + 0.6), 0, z + Math.cos(yaw) * (len / 2 + 0.6), rad * 1.1]);
    }
    for (const s of stumps) s[1] = this.heightAt(s[0], s[2]);
    this.trees = trees; this.bushes = bushes; this.grass = grass; this.reeds = reeds;
    this.logs = logs; this.debris = debris; this.stumps = stumps;
    this.log(`vegetation: ${trees.length} trees, ${bushes.length} bushes, ${grass.length} grass, ${reeds.length} reeds, ${logs.length} logs`);
    // brush density grid (vision occlusion, movement slow, concealment) at 2 m
    const gw = this.gw, gh = this.gh, Rg = CONFIG.GRID_RES;
    this.gBrush = new Float32Array(gw * gh);
    this.gTrunk = new Float32Array(gw * gh);
    for (const b of bushes) {
      const ix = Math.round((b[0] - this.minX) / Rg), iz = Math.round((b[2] - this.minZ) / Rg);
      if (ix < 0 || iz < 0 || ix >= gw || iz >= gh) continue;
      this.gBrush[iz * gw + ix] = Math.min(1, this.gBrush[iz * gw + ix] + 0.35 * b[3]);
    }
    for (const t of trees) {
      const ix = Math.round((t.x - this.minX) / Rg), iz = Math.round((t.z - this.minZ) / Rg);
      if (ix < 0 || iz < 0 || ix >= gw || iz >= gh) continue;
      if (t.scale <= 0.4) this.gBrush[iz * gw + ix] = Math.min(1, this.gBrush[iz * gw + ix] + 0.25);
      this.gTrunk[iz * gw + ix] = Math.max(this.gTrunk[iz * gw + ix], t.trunkR);
    }
    this.hideSpots = [];
    for (const b of bushes) {
      if (b[6] > 0.75 && b[3] > 1.15 && this.isPlayable(b[0], b[2]) && this.sampleGrid(this.gTrail, b[0], b[2]) < 70) {
        if (this.hideSpots.every((h) => Math.hypot(h.x - b[0], h.z - b[2]) > 14)) this.hideSpots.push({ x: b[0], z: b[2], y: b[1], r: 1.6 * b[3] });
      }
    }
  }

  _tree(rng, x, z, sp, scale, play) {
    const S = SPECIES[sp];
    const height = lerp(S.hMin, S.hMax, rng()) * scale;
    const trunkR = clamp(height * (sp === 2 ? 0.026 : sp === 1 ? 0.024 : 0.021) * (0.8 + rng() * 0.4), 0.04, 0.85);
    return {
      x, z, y: this.heightAt(x, z), sp, scale, height, trunkR,
      rot: rng() * TAU, lean: rng.range(0, 0.06) + (scale < 0.4 ? 0.06 : 0), leanDir: rng() * TAU,
      variant: Math.floor(rng() * 4), play,
    };
  }

  // ------------------------------------------------------------ colliders
  _colliders() {
    const cell = this.colCell = 4;
    this.colGrid = new Map();
    const circles = this.circles = [];
    const segs = this.segs = [];   // capsules: ax, az, bx, bz, r, topY (absolute)
    const boxes = this.boxes = []; // oriented boxes: x, z, hx, hz, rot, top
    for (const t of this.trees) if (t.trunkR > 0.06) circles.push([t.x, t.z, t.trunkR + 0.02]);
    for (const s of this.stumps) circles.push([s[0], s[2], s[3]]);
    for (const l of this.logs) {
      const [x, y, z, len, rad, yaw] = l;
      const dx = Math.sin(yaw) * len / 2, dz = Math.cos(yaw) * len / 2;
      segs.push([x - dx, z - dz, x + dx, z + dz, rad, y + rad * 1.6]);
    }
    for (const o of this.structures) {
      const box = (hx, hz, top, ox = 0, oz = 0) => {
        const c = Math.cos(o.rot), s = Math.sin(o.rot);
        boxes.push([o.x + ox * c + oz * s, o.z - ox * s + oz * c, hx, hz, o.rot, o.y + top]);
      };
      switch (o.type) {
        case 'kiosk': box(1.4, 0.35, 2.6); break;
        case 'car': box(0.95, 2.3, 1.5); break;
        case 'pumphouse': box(1.75, 1.75, 3.0); break;
        case 'blind': box(1.9, 1.4, 2.6, 0, -0.2); break;
        case 'shed': box(3.1, 2.1, 3.2); break;
        case 'mast': box(1.3, 1.3, 30); break;
        case 'gate': box(2.2, 0.08, 1.1, 0, 0); break;
        case 'streetlight': circles.push([o.x, o.z, 0.15]); break;
        case 'sign': box(1.6, 0.15, 2.2); break;
        case 'bench': box(0.9, 0.3, 0.5); break;
        case 'monument': box(0.55, 0.22, 0.75); break;
        case 'warning': circles.push([o.x, o.z, 0.08]); break;
        default: break;
      }
    }
    for (const pp of this.powerPoles) circles.push([pp[0], pp[2], 0.17]);
    for (let i = 1; i < this.fencePosts.length; i++) {
      const a = this.fencePosts[i - 1], b = this.fencePosts[i];
      if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 5) continue;
      segs.push([a[0], a[2], b[0], b[2], 0.06, Math.max(a[1], b[1]) + 1.3]);
    }
    const addTo = (minx, minz, maxx, maxz, ref) => {
      for (let gz = Math.floor(minz / cell); gz <= Math.floor(maxz / cell); gz++)
        for (let gx = Math.floor(minx / cell); gx <= Math.floor(maxx / cell); gx++) {
          const k = gx * 73856093 ^ gz * 19349663;
          let a = this.colGrid.get(k); if (!a) this.colGrid.set(k, a = []); a.push(ref);
        }
    };
    circles.forEach((c, i) => addTo(c[0] - c[2], c[1] - c[2], c[0] + c[2], c[1] + c[2], i));
    segs.forEach((s, i) => addTo(Math.min(s[0], s[2]) - s[4], Math.min(s[1], s[3]) - s[4], Math.max(s[0], s[2]) + s[4], Math.max(s[1], s[3]) + s[4], 100000 + i));
    boxes.forEach((b, i) => { const r = Math.hypot(b[2], b[3]); addTo(b[0] - r, b[1] - r, b[0] + r, b[1] + r, 200000 + i); });
  }

  queryColliders(x, z, r, out = []) {
    out.length = 0;
    const cell = this.colCell;
    const seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let gz = Math.floor((z - r) / cell); gz <= Math.floor((z + r) / cell); gz++)
      for (let gx = Math.floor((x - r) / cell); gx <= Math.floor((x + r) / cell); gx++) {
        const a = this.colGrid.get(gx * 73856093 ^ gz * 19349663);
        if (!a) continue;
        for (const ref of a) if (!seen.has(ref)) { seen.add(ref); out.push(ref); }
      }
    return out;
  }

  // Line of sight between two eye points. Returns 0..1 visibility (brush attenuates, trunks/terrain block).
  lineOfSight(ax, ay, az, bx, by, bz, opts = {}) {
    const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz);
    if (dist < 0.5) return 1;
    const steps = Math.ceil(dist / 1.5);
    let vis = 1;
    const brushK = opts.brushK ?? 0.22;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = ax + dx * t, z = az + dz * t, y = ay + (by - ay) * t;
      const g = this.heightAt(x, z);
      if (g > y - 0.15) return 0;
      const b = this.gridAt(this.gBrush, x, z);
      if (b > 0 && y - g < 1.9) vis *= 1 - b * brushK;
      if (vis < 0.08) return 0;
    }
    const cand = this.queryColliders((ax + bx) / 2, (az + bz) / 2, dist / 2 + 1, this._losTmp || (this._losTmp = []));
    const L2 = dist * dist;
    for (const ref of cand) {
      if (ref >= 100000) {
        if (ref >= 200000) {
          const b = this.boxes[ref - 200000];
          // treat structures as circles of their half-diagonal (good enough for occlusion)
          const rr = Math.min(b[2], b[3]);
          let t = ((b[0] - ax) * dx + (b[1] - az) * dz) / L2; if (t <= 0.02 || t >= 0.98) continue;
          const ex = ax + dx * t - b[0], ez = az + dz * t - b[1];
          if (ex * ex + ez * ez < rr * rr && (ay + (by - ay) * t) < b[5]) return 0;
        }
        continue;
      }
      const c = this.circles[ref];
      let t = ((c[0] - ax) * dx + (c[1] - az) * dz) / L2; if (t <= 0.02 || t >= 0.98) continue;
      const ex = ax + dx * t - c[0], ez = az + dz * t - c[1];
      if (ex * ex + ez * ez < c[2] * c[2]) return 0;
    }
    return vis;
  }

  // ------------------------------------------------------------ navigation (2 m grid A*)
  _navigation() {
    const gw = this.gw, gh = this.gh, n = gw * gh, R = CONFIG.GRID_RES;
    // monsters may roam a little beyond the player boundary (to watch from the treeline) but not into fields/water
    this.navCost = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, z] = this.cellPos(i);
      let c = 1;
      if (this.gField[i] || this.gOutDist[i] > 34) c = 0;
      if (z < this.highway.z + this.highway.halfW + 2) c = 0;
      if (c) {
        const water = this.waterAt(x, z);
        if (water !== null && this.deckAt(x, z) === null) { const d = water - this.heightAt(x, z); if (d > CONFIG.DEEP_WATER) c = 0; else c += d * 6; }
      }
      if (c) {
        if (this.gTrunk[i] > 0.55) c = 0; // big trunk fills the cell
        c += this.gBrush[i] * 0.6;
      }
      this.navCost[i] = c;
    }
    // keep only the main connected walkable region (no isolated islands / pockets to get stuck in)
    {
      const comp = new Int32Array(n).fill(-1);
      const queue = new Int32Array(n);
      let bestC = -1, bestSize = 0, cid = 0;
      for (let i = 0; i < n; i++) {
        if (this.navCost[i] <= 0 || comp[i] >= 0) continue;
        let qh = 0, qt = 0; queue[qt++] = i; comp[i] = cid; let size = 0;
        while (qh < qt) {
          const c = queue[qh++]; size++;
          const cx = c % gw, cy = (c / gw) | 0;
          if (cx > 0 && this.navCost[c - 1] > 0 && comp[c - 1] < 0) { comp[c - 1] = cid; queue[qt++] = c - 1; }
          if (cx < gw - 1 && this.navCost[c + 1] > 0 && comp[c + 1] < 0) { comp[c + 1] = cid; queue[qt++] = c + 1; }
          if (cy > 0 && this.navCost[c - gw] > 0 && comp[c - gw] < 0) { comp[c - gw] = cid; queue[qt++] = c - gw; }
          if (cy < gh - 1 && this.navCost[c + gw] > 0 && comp[c + gw] < 0) { comp[c + gw] = cid; queue[qt++] = c + gw; }
        }
        if (size > bestSize) { bestSize = size; bestC = cid; }
        cid++;
      }
      for (let i = 0; i < n; i++) if (comp[i] !== bestC) this.navCost[i] = 0;
    }
    // cover value: how concealed a standing figure is in this cell (brush + nearby trunks)
    this.gCover = new Float32Array(n);
    for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      let tr = 0, br = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = i + dy * gw + dx; tr += this.gTrunk[j]; br += this.gBrush[j];
      }
      this.gCover[i] = clamp(br / 9 * 1.6 + tr * 0.9, 0, 1);
    }
    this._navHeap = new BinaryHeap();
    this._navG = new Float32Array(n);
    this._navFrom = new Int32Array(n);
    this._navStamp = new Uint32Array(n);
    this._navSeq = 1;
  }

  navWalkable(x, z) { return this.navCost[this.cellOf(x, z)] > 0; }

  // nearest walkable cell to (x, z)
  nearestNav(x, z, maxR = 12) {
    let i = this.cellOf(x, z);
    if (this.navCost[i] > 0) return i;
    const gw = this.gw;
    const cx = i % gw, cy = Math.floor(i / gw);
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= gw || yy >= this.gh) continue;
        const j = yy * gw + xx;
        if (this.navCost[j] > 0) return j;
      }
    }
    return -1;
  }

  // A* on the 2 m grid. costFn(cellIndex) can add per-call costs (e.g. avoid player view). Returns [[x,z],...] or null.
  findPath(sx, sz, tx, tz, opts = {}) {
    const s = this.nearestNav(sx, sz), t = this.nearestNav(tx, tz);
    if (s < 0 || t < 0) return null;
    const gw = this.gw, R = CONFIG.GRID_RES;
    const maxExp = opts.maxExpand || 24000;
    const extra = opts.costFn;
    const heap = this._navHeap; heap.clear();
    const G = this._navG, from = this._navFrom, stamp = this._navStamp;
    const seq = ++this._navSeq;
    const tx0 = t % gw, ty0 = Math.floor(t / gw);
    const hfn = (i) => { const dx = Math.abs(i % gw - tx0), dy = Math.abs(Math.floor(i / gw) - ty0); return (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)); };
    G[s] = 0; from[s] = -1; stamp[s] = seq;
    heap.push(s, hfn(s));
    let best = s, bestH = hfn(s), exp = 0;
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (heap.size) {
      const cur = heap.pop();
      if (cur === t) { best = t; break; }
      if (++exp > maxExp) break;
      const cx = cur % gw, cy = (cur / gw) | 0;
      const gc = G[cur];
      for (const [dx, dy, dl] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= this.gh) continue;
        const ni = ny * gw + nx;
        const c = this.navCost[ni];
        if (c <= 0) continue;
        if (dx && dy && (this.navCost[cy * gw + nx] <= 0 || this.navCost[ny * gw + cx] <= 0)) continue;
        const ng = gc + dl * (c + (extra ? extra(ni) : 0));
        if (stamp[ni] === seq && ng >= G[ni]) continue;
        stamp[ni] = seq; G[ni] = ng; from[ni] = cur;
        const h = hfn(ni);
        if (h < bestH) { bestH = h; best = ni; }
        heap.push(ni, ng + h * 1.05);
      }
    }
    if (best === s) return null;
    const cells = [];
    for (let i = best; i !== -1; i = from[i]) cells.push(i);
    cells.reverse();
    // string-pull: keep only waypoints needed for straight walkable segments
    const pts = cells.map((i) => this.cellPos(i));
    // Cost-aware routes deliberately avoid exposed ground/player sightlines.
    // Geometric string-pulling would discard those costs and undo the cover
    // detour. Only remove collinear waypoints for weighted paths.
    if (extra) {
      const route = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1];
        if ((b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0])) route.push(b);
      }
      route.push(pts[pts.length - 1]);
      if (best === t) route[route.length - 1] = [tx, tz];
      return route;
    }
    const out = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this._straightWalkable(pts[anchor], pts[i])) { out.push(pts[i - 1]); anchor = i - 1; }
    }
    out.push(pts[pts.length - 1]);
    if (best === t) out[out.length - 1] = [tx, tz];
    return out;
  }

  _straightWalkable(a, b) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.ceil(d / 1.0);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      if (this.navCost[this.cellOf(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)] <= 0) return false;
    }
    return true;
  }
}
