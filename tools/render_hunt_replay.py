#!/usr/bin/env python3
"""Render a third-person video of a recorded Helium Voice hunt.

1. Record a hunt window with the playtest harness (server snapshots at 20 Hz):
     HUNT_ONLY=7 HUNT_RECORD=/tmp/clip7.json HUNT_WINDOW=365,392 node tests/hunt_playtests.mjs
2. Serve the repo (python3 -m http.server 8093) and render:
     python3 tools/render_hunt_replay.py /tmp/clip7.json /tmp/clip7.mp4 --target p1

The real game client renders the replay. The local simulation is frozen and the
recorded snapshots are fed to the client exactly as a server would send them,
so Helium Voice, the players (as full avatars with their own flashlights), the
skunk and objective props all animate from the playtest data. The local player
is parked at spawn with the light off. A chase camera rides behind Helium
Voice's shoulder, framing him and the hunted player. Frames are read straight
off the WebGL canvas (no HUD) and encoded with ffmpeg. No audio.
"""
import argparse, asyncio, base64, json, os, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright

SETUP = r"""async ({frames, target, exposure, height, treeFar}) => {
  ui.clickToPlay = function () {};
  game.startSingle('Replay');
  game.advance(3, 1/30, false);
  const me = game.net.myId();
  game.net.tick = () => {};                         // freeze the local sim: the recording drives everything
  game.flashlight.on = false;
  const sp = game.sim.spawnPoint(0);
  // avatars normally appear at session start; create one per recorded player
  const ids = [...new Set(frames.flatMap((f) => f.snap.pl.map((r) => r[0])))];
  for (let i = 0; i < ids.length; i++) await game._ensureAvatar('r' + ids[i], ids[i].toUpperCase(), i + 1);
  if (treeFar) game.env.trees.preset.treeFar = treeFar;   // far trees are lost in the dark anyway; geometry dominates software-render time
  window.__rp = { frames, i: 0, me, target: 'r' + target, exposure, height, cam: null, look: null,
    meRow: [me, sp.x, sp.y, sp.z, 0, 0, 0, 2, 0, 0, 0] };
  const THREE_V = game.camera.position.constructor;
  const orig = game._updatePlaying.bind(game);
  game._updatePlaying = (dt) => {
    orig(dt);
    game.flashlight.on = false;
    const R = window.__rp, hv = game.hv, w = game.world;
    const tgt = game.avatars.get(R.target);
    const hp = hv.pos.clone();
    let dir = new THREE_V(Math.sin(hv.yaw), 0, Math.cos(hv.yaw));
    let dist = 8;
    if (tgt) { const v = tgt.pos.clone().sub(hp); v.y = 0; dist = v.length(); if (dist > 0.5) dir = v.normalize(); }
    const side = new THREE_V(dir.z, 0, -dir.x);
    // over-the-shoulder; step in closer when a trunk would block the view of him
    let want = null;
    for (const back of [3.2, 2.6, 2.0, 1.4]) {
      const c = hp.clone().addScaledVector(dir, -back).addScaledVector(side, 0.3 * back);
      c.y = Math.max(hp.y + R.height, w.heightAt(c.x, c.z) + 1.2);   // above the undergrowth, below most crowns
      want = c;
      if (w.lineOfSight(c.x, c.y, c.z, hp.x, hp.y + 1.2, hp.z, { brushK: 0.1 }) > 0.7) break;
    }
    const look = hp.clone().addScaledVector(dir, Math.min(dist * 0.45, 9)); look.y = hp.y + 0.9;
    if (!R.cam) { R.cam = want.clone(); R.look = look.clone(); }
    const k = 1 - Math.exp(-dt * 2.6);
    R.cam.lerp(want, k); R.look.lerp(look, 1 - Math.exp(-dt * 4));
    game.camera.position.copy(R.cam); game.camera.lookAt(R.look); game.camera.updateMatrixWorld();
    game.exposure = R.exposure;
  };
  return { me, n: frames.length, t0: frames[0].t, t1: frames[frames.length - 1].t };
}"""

STEP = r"""({T, dt, grab}) => {
  const R = window.__rp;
  while (R.i < R.frames.length && R.frames[R.i].t <= T) {
    const s = JSON.parse(JSON.stringify(R.frames[R.i].snap));
    s.pl = s.pl.map((row) => { row[0] = 'r' + row[0]; return row; });
    const meRow = R.meRow.slice(); s.pl.push(meRow);
    game._onSnap(s);
    for (const e of R.frames[R.i].ev) if (e.type === 'chase') game.chasing = !!e.on;
    R.i++;
  }
  game.step(dt, grab);
  if (!grab) return null;
  return game.renderer.gl.domElement.toDataURL('image/jpeg', 0.9);
}"""


async def main(a):
    clip = json.load(open(a.clip))
    frames = clip['frames']
    t0 = frames[0]['t']
    start = a.start if a.start is not None else t0 + 1.5
    end = a.end if a.end is not None else frames[-1]['t']
    w, h = map(int, a.size.split('x'))
    out_dir = Path(tempfile.mkdtemp(prefix='hunt_frames_'))
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        page = await browser.new_page(viewport={'width': w, 'height': h})
        page.on('pageerror', lambda e: print('PAGE ERROR', e, file=sys.stderr))
        await page.goto(f'{a.url}/?manual=1&q={a.quality}&msaa=0')
        await page.wait_for_function('window.READY || window.LOAD_ERROR', timeout=600000)
        info = await page.evaluate(SETUP, {'frames': frames, 'target': a.target, 'exposure': a.exposure, 'height': a.height, 'treeFar': a.tree_far})
        print('replay', info, flush=True)
        dt = 1 / a.fps
        # warm up from the first recorded snapshot (interpolation buffer, camera smoothing, fade-in)
        T = t0
        while T < start:
            T += dt
            await page.evaluate(STEP, {'T': T, 'dt': dt, 'grab': False})
        n = 0; t_start = time.time()
        while T < end:
            T += dt
            data = await page.evaluate(STEP, {'T': T, 'dt': dt, 'grab': True})
            (out_dir / f'f{n:05d}.jpg').write_bytes(base64.b64decode(data.split(',', 1)[1]))
            n += 1
            if n % 20 == 0: print(f'  frame {n} (game time {T:.1f} s), {(time.time() - t_start) / n:.2f} s/frame', flush=True)
            if a.max_frames and n >= a.max_frames: break
        await browser.close()
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(a.fps), '-i', str(out_dir / 'f%05d.jpg'),
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', a.out], check=True)
    print(f'wrote {a.out}: {n} frames, frames in {out_dir}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('clip'); ap.add_argument('out')
    ap.add_argument('--target', default='p1', help='hunted player id in the recording')
    ap.add_argument('--fps', type=float, default=20)
    ap.add_argument('--size', default='854x480')
    ap.add_argument('--quality', default='medium')
    ap.add_argument('--exposure', type=float, default=1.0, help='camera exposure (1 = the game\'s unlit default)')
    ap.add_argument('--height', type=float, default=2.6, help='camera height above him (m)')
    ap.add_argument('--tree-far', type=float, default=0, help='override tree draw distance (0 = preset)')
    ap.add_argument('--start', type=float, default=None, help='game time to start capturing')
    ap.add_argument('--end', type=float, default=None)
    ap.add_argument('--max-frames', type=int, default=0)
    ap.add_argument('--url', default='http://127.0.0.1:8093')
    asyncio.run(main(ap.parse_args()))
