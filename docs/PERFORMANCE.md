# Performance budget

`tests/browser_perf_budget.py` renders four fixed viewpoints at every quality
preset in a headless browser and records the GPU workload: draw calls,
triangles (including shadow passes), shader programs, geometries and textures.
These counts don't depend on resolution or on the software renderer used in
CI, so they're a stable regression signal. Frame rate on real hardware still
needs owner/human measurement (F3 overlay in game).

```
python3 tests/browser_perf_budget.py            # compare with tests/perf_budget.json (+25% tolerance)
python3 tests/browser_perf_budget.py --update   # rewrite the baseline; commit it with the reason
```
Run it with nothing else using the machine; software rendering needs most of
the memory.

## Baseline (128 m terrain chunks, October 25, 2026)

| preset | draw calls | triangles: trail views | triangles: looking into the trees | programs |
|---|---|---|---|---|
| low | 349–415 | 0.89–1.11 M | 1.84 M | 48 |
| medium | 445–545 | 1.76–2.26 M | 3.97 M | 48 |
| high | 483–557 | 2.79–3.33 M | 5.89 M | 48 |
| ultra | 483–561 | 3.95–5.21 M | 9.25 M | 48 |

Terrain chunks went from 64 m to 128 m (`client/render/terrain.js` `CHUNK`).
Terrain went from ~234 draw calls to ~70 at forest views, for +0.1 M triangles.
That cut 150–190 draws per frame on every preset (Low at the forest view:
517 → 354). Spawn and trail renders show no seams or LOD popping.
Trees are now the dominant cost: ~90% of triangles (0.94 M main pass on Low,
2.28 M on High, plus the shadow pass). They're the next target.

Low LOD1 distance 60 → 45 m (`QUALITY_PRESETS.low.treeLod1`): −280k triangles at the
forest view (1.84 → 1.56 M), −54k on the trail. 640×360 Low renders before/after differ
in only 1.4–2.8% of pixels (>16/255), mostly film grain. Low now: 341–407 draw calls,
0.82–1.05 M triangles on trail views, 1.56 M looking into the trees.

## Previous baseline (`abbe980`, 64 m terrain chunks)

| preset | draw calls | triangles: trail views | triangles: looking into the trees | programs |
|---|---|---|---|---|
| low | 511–602 | 0.84–1.02 M | 1.74 M | 48 |
| medium | 630–732 | 1.71–2.19 M | 3.87 M | 48 |
| high | 651–744 | 2.71–3.26 M | 5.79 M | 48 |
| ultra | 649–747 | 3.86–5.16 M | 9.12 M | 48 |

Observations (backlog #15):
- (Fixed by the 128 m chunks for terrain; still true for trees.) Draw calls barely fall on Low, so per-draw overhead (the main cost on
  integrated GPUs and in the browser) isn't reduced by the preset.
- The "into the trees" view is about 1.7–2× the trail views at every preset.

## CPU-side: per-frame garbage (October 25, 2026)

Measured with the CDP sampling heap profiler during 10 s of scripted trail
walking on Low, without rendering:
- **Before: 231 KB/frame.** Top sources: the foliage update (71 KB), `Math.hypot`
  (48 KB) and the tree update (29 KB).
- `Math.hypot` and `for…of` over typed arrays allocate in V8. In loops that touch
  thousands of instances per frame, that garbage drives minor-GC pauses
  (hitches).
- Fix: indexed loops plus `Math.sqrt` in `trees.js`, `foliage.js` and `terrain.js`.
- **After: 96 KB/frame (−58%).**
- Remaining top sources: the tree update (16 KB), `_beamDistance` (9 KB) and
  `nearestOnPolyline` (6 KB).
- Instanced tree and foliage sets with no instances this frame are now hidden.
  That skips their program/uniform setup in both the main and shadow passes
  (~40 per frame).

### Oct 25 morning (Claude)

Same profiler, Low, no rendering: **96 → 63 KB/frame, then 51 KB/frame** with the sim fixes below (single-player runs the sim in the page).
- Reused scratch objects in the flashlight, animators (Euler and quaternions),
  shadow-camera snap, player camera, anomaly and interaction checks.
- Tree and foliage instance update ranges reuse one `{start, count}` object.
- Far-LOD trees share one mesh per species across variants: Low −25…−34 draw
  calls per view (−8%) and −40…−55 GPU geometries.
- Sim A* is 3–5× faster with identical plans: no destructuring in the inner loop,
  a hole-sifting heap, and cheaper cost functions. Over 3 × 12 min of play, plan
  p99 went from 16.4 to 4.2 ms and ticks over 25 ms from 7 to 1. That matters in
  single-player, where the sim shares the main thread.
- Sim allocations (Node sampling profiler, 4000 ticks): **138 → 21 KB per tick.**
  `queryColliders` de-duplicated with a `Set` that re-grew its hash table on
  every call, and its output array was cleared with `length = 0`, which dropped
  the backing store. It now uses per-query stamp arrays and in-place writes,
  with the same results in the same order. That garbage was triggering old-space
  collections of 250–400 MB in `sim.test`.
