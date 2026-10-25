#!/usr/bin/env python3
"""GPU workload budget per quality preset (regression guard, not an FPS benchmark).

Renders fixed viewpoints in a headless browser at each quality preset and records
what the GPU is asked to do: draw calls, triangles, compiled shader programs,
geometries, textures. Software rendering can't measure frame rate, but these
counts are resolution-independent and drive real-GPU cost. A change that silently
doubles them shows up here.

  python3 tests/browser_perf_budget.py            # compare with tests/perf_budget.json
  python3 tests/browser_perf_budget.py --update   # rewrite the baseline (commit it with the reason)

Fails when any count exceeds its baseline by more than TOLERANCE (25%).
Set CHROMIUM_EXECUTABLE_PATH to use an installed Chromium binary.
"""
import asyncio, json, os, socket, subprocess, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / 'tests' / 'perf_budget.json'
TOLERANCE = 0.25
PRESETS = ['low', 'medium', 'high', 'ultra']
# viewpoints: trail distance (m), sideways offset (m), yaw offset from trail direction (rad), pitch
VIEWS = {
    'trailhead_kiosk': (3, 0, 0.0, -0.05),         # spawn area, structures + lot
    'deep_forest_trail': (600, 0, 0.0, -0.02),     # densest canopy along the trail
    'forest_side_view': (900, 0, 1.4, 0.0),        # looking into the trees, not along the cut
    'river_bend': (261, 0, 0.0, -0.05),            # overlook, water + open sky
}
KEYS = ['calls', 'triangles', 'programs', 'geometries', 'textures']


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


async def measure(page, preset):
    await page.goto(f'{page.base}/?manual=1&q={preset}&msaa=0')
    await page.wait_for_function('window.READY || window.LOAD_ERROR', timeout=600000)
    err = await page.evaluate('window.LOAD_ERROR || null')
    if err: raise RuntimeError(f'{preset}: load error {err[:300]}')
    await page.evaluate("void (ui.clickToPlay = function () {}); game.startSingle('Perf')")
    # creatures off so they don't wander into some views and not others
    await page.evaluate("game.sim.hv.update = function () { game.sim.hv.state = 'dormant'; }; game.sim.sf.update = function () { game.sim.sf.state = 'dormant'; }")
    await page.evaluate('game.advance(30, 1/30, false)')
    out = {}
    for name, (along, side, dyaw, pitch) in VIEWS.items():
        await page.evaluate(f"""(() => {{ game.teleport({along}, {side}); game.look(game.player.yaw + {dyaw}, {pitch}); }})()""")
        await page.evaluate('game.advance(4, 1/30, false)')     # let LOD / culling settle
        await page.evaluate('game.advance(1, 1/30, true)')
        info = await page.evaluate("""(() => { const i = game.renderer.gl.info; return {
            calls: i.render.calls, triangles: i.render.triangles, programs: (i.programs || []).length,
            geometries: i.memory.geometries, textures: i.memory.textures }; })()""")
        out[name] = info
        print(f'  {preset:7s} {name:18s} ' + '  '.join(f'{k} {info[k]:>9,}' for k in KEYS), flush=True)
    return out


async def main(update):
    port = free_port()
    server = subprocess.Popen(['node', str(ROOT / 'server/server.js')], env={**os.environ, 'PORT': str(port)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
            except OSError: time.sleep(0.2)
        results = {}
        async with async_playwright() as p:
            for preset in PRESETS:      # fresh browser per preset keeps software-renderer memory bounded
                b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'),
                                            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
                page = await b.new_page(viewport={'width': 320, 'height': 180})
                page.base = f'http://127.0.0.1:{port}'
                page.set_default_timeout(600000)
                errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
                results[preset] = await measure(page, preset)
                await b.close()
                if errors: raise RuntimeError(f'{preset}: page errors {errors[:2]}')
    finally:
        server.kill()

    if update or not BASELINE.exists():
        BASELINE.write_text(json.dumps(results, indent=1) + '\n')
        print(f'\nbaseline written to {BASELINE.relative_to(ROOT)}')
        return 0
    base = json.loads(BASELINE.read_text())
    fails = []
    for preset, views in results.items():
        for view, info in views.items():
            ref = base.get(preset, {}).get(view)
            if not ref: continue
            for k in KEYS:
                if ref.get(k) and info[k] > ref[k] * (1 + TOLERANCE):
                    fails.append(f'{preset}/{view}: {k} {info[k]:,} > baseline {ref[k]:,} (+{(info[k] / ref[k] - 1) * 100:.0f}%)')
    # presets must stay ordered: higher quality never cheaper than lower... and low must be clearly cheaper than ultra
    for view in VIEWS:
        lo, hi = results['low'][view]['triangles'], results['ultra'][view]['triangles']
        if lo >= hi: fails.append(f'{view}: low preset is not cheaper than ultra ({lo:,} vs {hi:,} triangles)')
    print('\n' + ('\n'.join('FAIL ' + f for f in fails) if fails else 'perf budget OK (all counts within +25% of baseline; presets ordered)'))
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main('--update' in sys.argv)))
