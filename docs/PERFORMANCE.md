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

## Baseline (`abbe980`, October 25, 2026)

| preset | draw calls | triangles: trail views | triangles: looking into the trees | programs |
|---|---|---|---|---|
| low | 511–602 | 0.84–1.02 M | 1.74 M | 48 |
| medium | 630–732 | 1.71–2.19 M | 3.87 M | 48 |
| high | 651–744 | 2.71–3.26 M | 5.79 M | 48 |
| ultra | 649–747 | 3.86–5.16 M | 9.12 M | 48 |

Observations (backlog #15):
- Draw calls barely fall on Low, so per-draw overhead (the main cost on
  integrated GPUs and in the browser) isn't reduced by the preset.
- The "into the trees" view is about 1.7–2× the trail views at every preset.
