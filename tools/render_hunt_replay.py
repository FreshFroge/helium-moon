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

Rendering happens in chunks of --chunk frames, each in a fresh browser, and is
resumable with --frames-dir, because software (SwiftShader) rendering can be
killed for memory on small machines. Run it with nothing else heavy alongside it.
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
  if (treeFar) game.env.trees.preset.treeFar = treeFar;
  // keep trees/bushes off the camera -> Helium Voice sightline (client/render/sightline.js)
  const { SIGHTLINE } = await import('/client/render/sightline.js'); SIGHTLINE.on = true; SIGHTLINE.r = 1.4;   // far trees are lost in the dark anyway; geometry dominates software-render time
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
    for (const back of [2.4, 1.9, 1.4]) {   // close: little room for undergrowth/trunks between camera and him
      const c = hp.clone().addScaledVector(dir, -back).addScaledVector(side, 0.3 * back);
      c.y = Math.max(hp.y + R.height, w.heightAt(c.x, c.z) + 1.2);   // above the undergrowth, below most crowns
      want = c;
      if (w.lineOfSight(c.x, c.y, c.z, hp.x, hp.y + 1.2, hp.z, { brushK: 0.1 }) > 0.7) break;
    }
    const look = hp.clone().addScaledVector(dir, Math.min(dist * 0.6, 7)); look.y = hp.y + 1.0;
    if (!R.cam) { R.cam = want.clone(); R.look = look.clone(); }
    const k = 1 - Math.exp(-dt * 2.6);
    R.cam.lerp(want, k); R.look.lerp(look, 1 - Math.exp(-dt * 4));
    game.camera.position.copy(R.cam); game.camera.lookAt(R.look); game.camera.updateMatrixWorld();
    Object.assign(SIGHTLINE, { ax: R.cam.x, az: R.cam.z, bx: hp.x, bz: hp.z });
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


async def render_chunk(pw, a, frames, t0, start, dt, k0, k1, out_dir):
    """Render frames k0..k1-1 (frame k is game time start + (k+1)*dt) in a fresh browser."""
    w, h = map(int, a.size.split('x'))
    browser = await pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    try:
        page = await browser.new_page(viewport={'width': w, 'height': h})
        page.on('pageerror', lambda e: print('PAGE ERROR', e, file=sys.stderr))
        await page.goto(f'{a.url}/?manual=1&q={a.quality}&msaa=0')
        await page.wait_for_function('window.READY || window.LOAD_ERROR', timeout=600000)
        await page.evaluate(SETUP, {'frames': frames, 'target': a.target, 'exposure': a.exposure, 'height': a.height, 'treeFar': a.tree_far})
        first = start + (k0 + 1) * dt
        # warm up from the recording start (cheap, no rendering); the last 3 s settle the camera
        T = t0
        while T < first - dt:
            T += dt
            await page.evaluate(STEP, {'T': T, 'dt': dt, 'grab': False})
        t_start = time.time()
        for k in range(k0, k1):
            T = start + (k + 1) * dt
            data = await page.evaluate(STEP, {'T': T, 'dt': dt, 'grab': True})
            (out_dir / f'f{k:05d}.jpg').write_bytes(base64.b64decode(data.split(',', 1)[1]))
        print(f'  frames {k0}-{k1 - 1} done, {(time.time() - t_start) / max(1, k1 - k0):.1f} s/frame', flush=True)
    finally:
        await browser.close()


async def main(a):
    clip = json.load(open(a.clip))
    frames = clip['frames']
    t0 = frames[0]['t']
    start = a.start if a.start is not None else t0 + 3
    end = a.end if a.end is not None else frames[-1]['t']
    dt = 1 / a.fps
    total = int((end - start) / dt)
    if a.max_frames: total = min(total, a.max_frames)
    out_dir = Path(a.frames_dir) if a.frames_dir else Path(tempfile.mkdtemp(prefix='hunt_frames_'))
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f'replay {total} frames from game time {start:.1f} to {end:.1f}, frames in {out_dir}', flush=True)
    async with async_playwright() as pw:
        k = 0; failures = 0
        while k < total:
            while k < total and (out_dir / f'f{k:05d}.jpg').exists(): k += 1   # resume
            if k >= total: break
            k1 = min(total, k + a.chunk)
            try:
                await render_chunk(pw, a, frames, t0, start, dt, k, k1, out_dir); failures = 0
            except Exception as e:   # software rendering can be OOM-killed; retry from the first missing frame
                failures += 1
                print(f'  chunk from frame {k} failed ({str(e).splitlines()[0][:80]}); retry {failures}', flush=True)
                if failures > 3: raise
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(a.fps), '-i', str(out_dir / 'f%05d.jpg'),
                    '-frames:v', str(total), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart', a.out], check=True)
    print(f'wrote {a.out}: {total} frames')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('clip'); ap.add_argument('out')
    ap.add_argument('--target', default='p1', help='hunted player id in the recording')
    ap.add_argument('--fps', type=float, default=20)
    ap.add_argument('--size', default='854x480')
    ap.add_argument('--quality', default='medium')
    ap.add_argument('--exposure', type=float, default=1.0, help='camera exposure (1 = the game\'s unlit default)')
    ap.add_argument('--height', type=float, default=2.1, help='camera height above his feet (m); he is ~1.9 m tall')
    ap.add_argument('--tree-far', type=float, default=0, help='override tree draw distance (0 = preset)')
    ap.add_argument('--start', type=float, default=None, help='game time to start capturing')
    ap.add_argument('--end', type=float, default=None)
    ap.add_argument('--max-frames', type=int, default=0)
    ap.add_argument('--frames-dir', default='', help='keep frames here; rerunning resumes from the first missing frame')
    ap.add_argument('--chunk', type=int, default=40, help='frames per browser session (bounds software-render memory)')
    ap.add_argument('--url', default='http://127.0.0.1:8093')
    asyncio.run(main(ap.parse_args()))
