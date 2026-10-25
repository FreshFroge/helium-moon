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
