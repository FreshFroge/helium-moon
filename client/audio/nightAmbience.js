// Field recordings are credited in assets/audio/NIGHT_AMBIENCE_LICENSE.md.
export const NIGHT_CRICKETS_FILE = 'assets/audio/night_crickets.ogg';
export const TREE_LEAVES_FILE = 'assets/audio/tree_leaves.ogg';

const indices = new WeakMap();
const CELL = 32;
export function nearbyCanopies(world, x, z) {
  if (!world?.trees) return [];
  let bins = indices.get(world);
  if (!bins) {
    bins = new Map();
    for (const tree of world.trees) {
      if (tree.height < 4) continue;
      const key = `${Math.floor(tree.x/CELL)},${Math.floor(tree.z/CELL)}`;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(tree);
    }
    indices.set(world,bins);
  }
  const found=[];const bx=Math.floor(x/CELL),bz=Math.floor(z/CELL);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++) {
    for(const tree of bins.get(`${bx+dx},${bz+dz}`)||[]) {
      const d=Math.hypot(tree.x-x,tree.z-z);
      if(d<30)found.push({tree,d});
    }
  }
  found.sort((a,b)=>a.d-b.d);
  const selected=[];
  for(const {tree} of found) {
    if(selected.every(t=>Math.hypot(t.x-tree.x,t.z-tree.z)>8))selected.push(tree);
    if(selected.length===3)break;
  }
  return selected;
}
