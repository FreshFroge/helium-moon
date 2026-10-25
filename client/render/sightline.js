// Optional "keep this sightline clear" filter for replay/cinematic cameras
// (tools/render_hunt_replay.py). When SIGHTLINE.on, tree and foliage instances whose
// base lies within SIGHTLINE.r of the segment camera -> subject are skipped, so leaves
// and trunks right in front of a third-person camera don't hide the subject.
// Off in normal play (no cost beyond one boolean check per chunk).
export const SIGHTLINE = { on: false, ax: 0, az: 0, bx: 0, bz: 0, r: 1.6 };

export function blocksSight(x, z) {
  const S = SIGHTLINE, vx = S.bx - S.ax, vz = S.bz - S.az, L2 = vx * vx + vz * vz || 1e-9;
  let t = ((x - S.ax) * vx + (z - S.az) * vz) / L2;
  if (t < 0 || t > 1) return false;
  const dx = x - (S.ax + vx * t), dz = z - (S.az + vz * t);
  return dx * dx + dz * dz < S.r * S.r;
}
