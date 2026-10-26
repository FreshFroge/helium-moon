// Character collision against the deterministic world (trunks, logs, structures,
// fence, playable boundary, deep water). Used by the player and by monsters.
import { CONFIG } from './config.js';

const tmp = [];

// Horizontal eye displacement for Q/R. Sweep a small camera cylinder rather than
// letting a cosmetic offset put the near plane through bark or a wall.
export function leanDistance(world,p,amount,height){
  if(!Number.isFinite(amount)||!amount||!world.queryColliders)return 0;
  const sign=Math.sign(amount),request=Math.min(1,Math.abs(amount))*.28;
  const rx=Math.cos(p.yaw||0)*sign,rz=-Math.sin(p.yaw||0)*sign;
  const eye={x:p.x,y:p.y+height-.1,z:p.z};
  const opts={slope:false,water:false,step:0,cameraSafe:true,boundary:true};
  const clear=distance=>{
    const q=moveCharacter(world,eye,rx*distance,rz*distance,.1,opts);
    return Math.hypot(q.x-(p.x+rx*distance),q.z-(p.z+rz*distance))<.0001;
  };
  if(clear(request))return request*sign;
  let lo=0,hi=request;
  for(let i=0;i<6;i++){const mid=(lo+hi)*.5;if(clear(mid))lo=mid;else hi=mid;}
  return lo*sign;
}

export function waterDepthAt(world, x, z) {
  const w = world.waterAt(x, z);
  if (w === null) return 0;
  return Math.max(0, w - world.heightAt(x, z));
}

export function groundAt(world, x, z) {
  const g = world.heightAt(x, z);
  const deck = world.deckAt(x, z);
  return deck !== null && deck > g - 0.5 ? Math.max(g, deck) : g;
}

function blocked(world, x, z, opts) {
  if (opts.boundary && !world.isPlayable(x, z)) return true;
  if (opts.nav && !world.navWalkable(x, z)) return true;
  if (opts.water !== false && waterDepthAt(world, x, z) > CONFIG.DEEP_WATER && world.deckAt(x, z) === null) return true;
  return false;
}

// Moves a vertical cylinder (feet at y) from p by (dx, dz); returns resolved position.
export function moveCharacter(world, p, dx, dz, r, opts = {}) {
  const feet = p.y;
  const step = opts.step ?? CONFIG.PLAYER.STEP_HEIGHT;
  let nx = p.x + dx, nz = p.z + dz;
  if (blocked(world, nx, nz, opts)) {
    if (!blocked(world, p.x + dx, p.z, opts)) nz = p.z;
    else if (!blocked(world, p.x, p.z + dz, opts)) nx = p.x;
    else { nx = p.x; nz = p.z; }
  }
  if (opts.slope !== false) {
    const h0 = world.heightAt(p.x, p.z), h1 = world.heightAt(nx, nz);
    const dist = Math.hypot(nx - p.x, nz - p.z);
    if (dist > 1e-4 && (h1 - h0) / dist > 1.35 && world.deckAt(nx, nz) === null) { nx = p.x; nz = p.z; }
  }
  for (let iter = 0; iter < 3; iter++) {
    const refs = world.queryColliders(nx, nz, r + 1.0, tmp);
    for (const ref of refs) {
      if (ref < 100000) {
        const c = world.circles[ref];
        const ex = nx - c[0], ez = nz - c[1];
        const d = Math.hypot(ex, ez), min = (opts.cameraSafe ? (c[3] ?? c[2]) : c[2]) + r;
        if (d < min && d > 1e-6) { nx = c[0] + ex / d * min; nz = c[1] + ez / d * min; }
      } else if (ref < 200000) {
        const s = world.segs[ref - 100000];
        if (feet + step > s[5]) continue; // can step over it
        const ax = s[0], az = s[1], bx = s[2], bz = s[3];
        const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1e-9;
        let t = ((nx - ax) * vx + (nz - az) * vz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + vx * t, cz = az + vz * t;
        const ex = nx - cx, ez = nz - cz; const d = Math.hypot(ex, ez), min = s[4] + r;
        if (d < min && d > 1e-6) { nx = cx + ex / d * min; nz = cz + ez / d * min; }
      } else {
        const b = world.boxes[ref - 200000];
        if (feet + step > b[5]) continue;
        const c = Math.cos(b[4]), s = Math.sin(b[4]);
        const lx = (nx - b[0]) * c - (nz - b[1]) * s, lz = (nx - b[0]) * s + (nz - b[1]) * c;
        const hx = b[2] + r, hz = b[3] + r;
        if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
          const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
          let ox = lx, oz = lz;
          if (px < pz) ox = Math.sign(lx || 1) * hx; else oz = Math.sign(lz || 1) * hz;
          nx = b[0] + ox * c + oz * s; nz = b[1] - ox * s + oz * c;
        }
      }
    }
  }
  if (blocked(world, nx, nz, opts)) { nx = p.x; nz = p.z; }
  return { x: nx, z: nz };
}

// Highest walkable surface under a point (terrain, bridge deck, small logs you stand on).
export function supportHeight(world, x, z, feet) {
  let g = groundAt(world, x, z);
  const refs = world.queryColliders(x, z, 0.5, tmp);
  for (const ref of refs) {
    if (ref >= 100000 && ref < 200000) {
      const s = world.segs[ref - 100000];
      if (s[4] > 0.5) continue;
      const vx = s[2] - s[0], vz = s[3] - s[1], L2 = vx * vx + vz * vz || 1e-9;
      let t = ((x - s[0]) * vx + (z - s[1]) * vz) / L2; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (s[0] + vx * t), z - (s[1] + vz * t));
      if (d < s[4] * 0.8 && s[5] - 0.1 <= feet + 0.45) g = Math.max(g, s[5] - 0.12);
    }
  }
  return g;
}
