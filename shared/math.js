// Small dependency-free math helpers shared by client and server.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;
export const angleDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// Deterministic PRNG (mulberry32).
export function makeRng(seed) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + (b - a) * rng();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.gauss = () => { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  rng.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return rng;
}

export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 2D gradient noise (Perlin-style), seeded.
export function makeNoise2(seed = 1) {
  const perm = new Uint8Array(512);
  const r = makeRng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = r() * TAU; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const g00 = perm[X + perm[Y]], g10 = perm[X + 1 + perm[Y]], g01 = perm[X + perm[Y + 1]], g11 = perm[X + 1 + perm[Y + 1]];
    const n00 = gx[g00] * xf + gy[g00] * yf;
    const n10 = gx[g10] * (xf - 1) + gy[g10] * yf;
    const n01 = gx[g01] * xf + gy[g01] * (yf - 1);
    const n11 = gx[g11] * (xf - 1) + gy[g11] * (yf - 1);
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.4142;
  }
  noise.fbm = (x, y, oct = 4, lac = 2.0, gain = 0.5) => {
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  };
  return noise;
}

// --- polyline helpers (arrays of [x, z]) -----------------------------------
export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

export function cumulativeLengths(pts) {
  const out = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) out[i] = out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return out;
}

export function pointAtDistance(pts, cum, d) {
  if (d <= 0) return { x: pts[0][0], z: pts[0][1], dir: Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), i: 0 };
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] >= d) {
      const t = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      const x = lerp(pts[i - 1][0], pts[i][0], t), z = lerp(pts[i - 1][1], pts[i][1], t);
      return { x, z, dir: Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), i };
    }
  }
  const n = pts.length - 1;
  return { x: pts[n][0], z: pts[n][1], dir: Math.atan2(pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1]), i: n };
}

// Nearest point on polyline: returns {d, x, z, along, side}.
export function nearestOnPolyline(pts, cum, px, pz) {
  // scalars while scanning, one result object at the end (called many times per frame)
  let bd = Infinity, bx0 = 0, bz0 = 0, bAlong = 0, bSide = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], bx = pts[i][0], bz = pts[i][1];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz || 1e-9;
    let t = ((px - ax) * dx + (pz - az) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t, cz = az + dz * t;
    const ex = px - cx, ez = pz - cz;
    if (ex * ex + ez * ez >= bd * bd) continue;   // cheap reject; exact hypot only for candidates
    const d = Math.hypot(ex, ez);
    if (d < bd) {
      const cross = dx * (pz - az) - dz * (px - ax);
      bd = d; bx0 = cx; bz0 = cz; bAlong = cum[i - 1] + Math.sqrt(L2) * t; bSide = Math.sign(cross) || 1;
    }
  }
  return { d: bd, x: bx0, z: bz0, along: bAlong, side: bSide };
}

export function pointInPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

// 1D squared Euclidean distance transform (Felzenszwalb & Huttenlocher).
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

// 2D EDT of a binary mask (1 = feature). Returns distance in cells (Float32Array).
export function distanceTransform(mask, w, h) {
  const INF = 1e20;
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
  }
  return out;
}

// Rasterise a polyline into a mask (cell coordinates), simple stamping.
export function rasterPolyline(mask, w, h, ptsCells, value = 1) {
  for (let i = 1; i < ptsCells.length; i++) {
    const [ax, ay] = ptsCells[i - 1], [bx, by] = ptsCells[i];
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(lerp(ax, bx, t)), y = Math.round(lerp(ay, by, t));
      if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = value;
    }
  }
}

export class BinaryHeap {
  constructor() { this.items = []; this.prio = []; }
  get size() { return this.items.length; }
  clear() { this.items.length = 0; this.prio.length = 0; }
  // hole-sifting (no destructuring swaps): same resulting order, far cheaper in the A* inner loop
  push(item, p) {
    const it = this.items, pr = this.prio; let i = it.length; it.push(item); pr.push(p);
    while (i > 0) { const j = (i - 1) >> 1; const pj = pr[j]; if (pj <= p) break; it[i] = it[j]; pr[i] = pj; i = j; }
    it[i] = item; pr[i] = p;
  }
  pop() {
    const it = this.items, pr = this.prio; const top = it[0];
    const last = it.pop(), lp = pr.pop(), n = it.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = -1, mp = lp;
        if (l < n && pr[l] < mp) { m = l; mp = pr[l]; }
        if (r < n && pr[r] < mp) { m = r; mp = pr[r]; }
        if (m < 0) break;
        it[i] = it[m]; pr[i] = mp; i = m;
      }
      it[i] = last; pr[i] = lp;
    }
    return top;
  }
}
