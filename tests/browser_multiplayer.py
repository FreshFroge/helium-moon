# Two real browsers through the real server (needs: pip install playwright && playwright install chromium, ffmpeg):
#   python3 tests/browser_multiplayer.py
# Set CHROMIUM_EXECUTABLE_PATH to use an installed Chromium binary. A browser
# managed policy disabling direct UDP can block WebRTC; those checks remain failures.
# Lobby UI, game start, avatars, WebRTC voice with fake microphones playing the signature clip,
# proximity mixing, in-memory phrase capture, forced mimicry relay, privacy opt-out, chat,
# downed -> revive by holding E, mic off.
import asyncio, json, time, sys, os, subprocess, tempfile, random
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 18100 + random.randint(0, 800)
S = tempfile.mkdtemp()
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(ROOT, 'assets/audio/helium_voice_signature.ogg'), '-af', 'apad=pad_dur=1.6,volume=1.6', '-ac', '1', '-ar', '48000', os.path.join(S, 'fake_voice.wav')], check=True)
SERVER = subprocess.Popen(['node', os.path.join(ROOT, 'server/server.js')], env={**os.environ, 'PORT': str(PORT), 'HM_TEST': '1'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(6)
URL = f'http://localhost:{PORT}/?manual=1&q=low'
fails = 0
def ok(c, m):
    global fails
    print(('  ok  ' if c else 'FAIL  ') + m)
    if not c: fails += 1

async def pump(pages, seconds, step=6):
    t0 = time.time()
    while time.time() - t0 < seconds:
        for pg in pages: await pg.evaluate(f"game.advance({step}, 1/30, false)")
        await asyncio.sleep(0.02)

async def rtc_diagnostics(page):
    return await page.evaluate("""async () => {
        const peers = [];
        for (const peer of game.voice.peers.values()) {
            const stats = [...(await peer.pc.getStats()).values()];
            peers.push({id: peer.id, connection: peer.pc.connectionState,
                ice: peer.pc.iceConnectionState, gathering: peer.pc.iceGatheringState,
                signalling: peer.pc.signalingState,
                localDescription: peer.pc.localDescription?.type,
                remoteDescription: peer.pc.remoteDescription?.type,
                candidates: stats.filter(s => ['local-candidate', 'remote-candidate', 'candidate-pair'].includes(s.type)).map(s => ({
                    type: s.type, candidateType: s.candidateType, protocol: s.protocol,
                    address: s.address, port: s.port, state: s.state, nominated: s.nominated,
                    bytesSent: s.bytesSent, bytesReceived: s.bytesReceived,
                }))});
        }
        return {peers, events: window.__rtcEvents || []};
    }""")

async def received_codec(page):
    return await page.evaluate("""async () => {
        for (const peer of game.voice.peers.values()) {
            const stats = await peer.pc.getStats();
            for (const report of stats.values()) {
                if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                    const codec = stats.get(report.codecId);
                    if (codec) return codec.mimeType;
                }
            }
        }
        return null;
    }""")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH'), args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
            '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={S}/fake_voice.wav'])
        pages = []
        for name in ['Alpha', 'Bravo']:
            ctx = await b.new_context(viewport={'width': 640, 'height': 360}, permissions=['microphone'])
            pg = await ctx.new_page(); pg.logs = []
            pg.on('console', lambda m, pg=pg: pg.logs.append(f'[{m.type}] {m.text}'))
            pg.on('pageerror', lambda e, pg=pg: pg.logs.append(f'[pageerror] {e}'))
            await pg.goto(URL); pages.append(pg)
        A, B = pages
        for pg in pages: await pg.wait_for_function('window.READY || window.LOAD_ERROR', timeout=300000)
        ok(not await A.evaluate('window.LOAD_ERROR') and not await B.evaluate('window.LOAD_ERROR'), 'both clients loaded')
        for pg in pages:
            await pg.evaluate("""() => {
                window.__rtcEvents = [];
                const makePeer = game.voice._makePeer.bind(game.voice);
                game.voice._makePeer = function (id, initiator) {
                    const peer = makePeer(id, initiator), pc = peer.pc;
                    const record = event => __rtcEvents.push({peer: id, ...event});
                    pc.addEventListener('icecandidate', e => record({type: 'candidate', candidate: e.candidate?.candidate || null}));
                    pc.addEventListener('icecandidateerror', e => record({type: 'candidate-error', code: e.errorCode, text: e.errorText}));
                    pc.addEventListener('connectionstatechange', () => record({type: 'connection', state: pc.connectionState}));
                    pc.addEventListener('iceconnectionstatechange', () => record({type: 'ice', state: pc.iceConnectionState}));
                    return peer;
                };
            }""")
        # microphones: explicit enable (fake device), A open mic + mimicry opt-in, B push-to-talk
        await A.evaluate("void (ui.clickToPlay = function () {}); game.settings.voiceMode = 'open'; game.settings.micSensitivity = 0.7; game.settings.mimicOptIn = true; game.settings.save()")
        await B.evaluate("void (ui.clickToPlay = function () {}); game.settings.voiceMode = 'ptt'; game.settings.mimicOptIn = false; game.settings.save()")
        ra = await A.evaluate("game.voice.enableMic()"); rb = await B.evaluate("game.voice.enableMic()")
        ok(ra and rb, f"microphones enabled only on request (A {await A.evaluate('game.voice.micState')}, B {await B.evaluate('game.voice.micState')})")
        # lobby through the real UI
        for pg, nm in ((A, 'Alpha'), (B, 'Bravo')):
            await pg.click('#menu-main [data-act=multi]'); await pg.fill('#mp-name', nm)
        await A.click('#mp-create')
        await A.wait_for_function('game.lobby && game.lobby.code', timeout=10000)
        code = await A.evaluate('game.lobby.code')
        await B.fill('#mp-code', code); await B.click('#mp-join')
        await B.wait_for_function('game.lobby && game.lobby.players.length === 2', timeout=10000)
        ok(True, f'lobby {code} created and joined through the menu')
        lobby_txt = await B.inner_text('#panel')
        ok('Alpha' in lobby_txt and 'Bravo' in lobby_txt, 'lobby screen lists both players')
        # WebRTC voice connection
        try:
            await A.wait_for_function("[...game.voice.peers.values()].some(p => p.pc.connectionState === 'connected')", timeout=20000)
            await B.wait_for_function("[...game.voice.peers.values()].some(p => p.pc.connectionState === 'connected' && p.e)", timeout=20000)
            ok(True, 'WebRTC voice connected peer-to-peer (Opus)')
        except Exception as e:
            ok(False, 'WebRTC voice connected: ' + str(e)[:80])
            policy_file = '/etc/chromium/policies/managed/misc.json'
            try:
                with open(policy_file) as policy:
                    handling = json.load(policy).get('WebRtcIPHandling')
                if handling:
                    print(f'      Chromium managed WebRtcIPHandling={handling}; direct UDP voice may be blocked. The real connection check remains failed.')
            except (OSError, ValueError):
                pass
            for name, pg in zip(('Alpha', 'Bravo'), pages):
                print(f'      {name} RTC diagnostics:', json.dumps(await rtc_diagnostics(pg)))
                print(f'      {name} signalling warnings:', [line for line in pg.logs if 'offer failed' in line or 'voice signalling error' in line])
        codec = await received_codec(B)
        if not codec:
            await asyncio.sleep(2); codec = await received_codec(B)
        ok(codec and 'opus' in codec.lower(), f'voice codec {codec}')
        await A.click('#lb-start')
        for pg in pages: await pg.wait_for_function("game.mode === 'playing'", timeout=10000)
        ok(True, 'host started the game; both clients in the session')
        for pg in pages: print('      start pos:', await pg.evaluate("JSON.stringify({p: game.player.pos, yaw: game.player.yaw, info: game.info.players, me: game.myId, sp: (() => { try { return GameSimSpawn(); } catch (e) { return String(e); } })()})".replace('GameSimSpawn()', 'null')))
        await pump(pages, 0.3)
        for pg in pages: print('      after pump:', await pg.evaluate("JSON.stringify({p: game.player.pos, vel: game.player.vel, yaw: game.player.yaw, st: game.myState, me: game.me})"))
        await A.evaluate("game.net.send({t: 'debug', cmd: 'freeze'})")
        await pump(pages, 4)
        av = await A.evaluate("game.avatars.size"); bv = await B.evaluate("game.avatars.size")
        ok(av == 1 and bv == 1, 'each client sees the other player\'s avatar')
        # position sync
        await B.evaluate("void (window.mpTp = function (x, z) { game.player.spawn(x, z, game.player.yaw); game.net.send({t: 'debug', cmd: 'tp', x, z}); })")
        await A.evaluate("void (window.mpTp = function (x, z) { game.player.spawn(x, z, game.player.yaw); game.net.send({t: 'debug', cmd: 'tp', x, z}); })")
        apos = json.loads(await A.evaluate("JSON.stringify([game.player.pos.x, game.player.pos.z])"))
        await B.evaluate(f"mpTp({apos[0] + 3}, {apos[1]})")
        await pump(pages, 2)
        print('      debug:', await A.evaluate("JSON.stringify({av: [...game.avatars.values()].map(a => [a.id, a.pos.x, a.pos.z, a.state]), buf: [...game.plBufs.entries()].map(([k, b]) => [k, b.buf.length, b.latest()]), rt: game.renderT, snapT: game.snapT, me: game.myId})"))
        seen = json.loads(await A.evaluate("JSON.stringify([...game.avatars.values()].map(a => [a.pos.x, a.pos.z])[0])"))
        ok(abs(seen[0] - (apos[0] + 3)) < 0.6 and abs(seen[1] - apos[1]) < 0.6, f'teammate position synced (seen at {seen[0]-apos[0]:+.1f} m)')
        # voice activity: A open mic transmits when the clip plays; B hears A
        lvl = []; tx = []; heard = []
        for i in range(30):
            await pump(pages, 0.15, 3)
            lvl.append(await A.evaluate("game.voice.level")); tx.append(await A.evaluate("game.voice.transmitting"))
            heard.append(await B.evaluate("game.voice.isSpeaking([...game.voice.peers.keys()][0])"))
        ok(max(lvl) > 0.3 and any(tx) and not all(tx), f'open mic gates on speech (level peak {max(lvl):.2f}, transmitting {sum(tx)}/30 samples)')
        ok(any(heard), f'teammate hears the voice over WebRTC ({sum(heard)}/30 samples speaking)')
        btx = await B.evaluate("game.voice.transmitting")
        ok(not btx, 'push-to-talk player is silent while the key is up')
        await B.keyboard.down('v'); await pump(pages, 0.4, 3)
        ok(await B.evaluate("game.voice.transmitting"), 'push-to-talk transmits while V is held')
        await B.keyboard.up('v'); await pump(pages, 0.2, 3)
        # proximity mixing on B for A's voice
        gains = {}
        for d in (3, 15, 28, 60):
            await B.evaluate(f"mpTp({apos[0] + d}, {apos[1]})"); await pump(pages, 1.2, 4)
            gains[d] = json.loads(await B.evaluate("JSON.stringify((p => [p.e.out.gain.value, p.e.lp.frequency.value])([...game.voice.peers.values()][0]))"))
        print('      proximity gain/lowpass by distance:', {k: (round(v[0], 2), int(v[1])) for k, v in gains.items()})
        ok(gains[3][0] > 0.85 and gains[15][0] < gains[3][0] and gains[28][1] < 6000 and gains[60][0] < 0.02, 'proximity mix parameters: clear up close, quieter at 15 m, muffled at 28 m, silent at 60 m')
        await B.evaluate(f"mpTp({apos[0] + 4}, {apos[1]})"); await pump(pages, 1)
        # mimicry: A's phrases captured in memory only, force one, B receives processed audio
        await pump(pages, 4, 4)
        n = await A.evaluate("game.voice.phrases.length")
        durs = await A.evaluate("game.voice.phrases.map(p => +p.dur.toFixed(2))")
        ok(n >= 1, f'phrases captured in memory while transmitting ({n}, durations {durs})')
        ok(await B.evaluate("game.voice.phrases.length") == 0, 'nothing captured from the player who did not opt in')
        await A.evaluate("window.__mim = 0; void (game.voice.onMimicPlayed = function (at) { window.__mim++; window.__mimAt = at; })")
        await B.evaluate("window.__mim = 0; void (game.voice.onMimicPlayed = function (at) { window.__mim++; window.__mimAt = at; })")
        await A.evaluate("game.net.send({t: 'debug', cmd: 'mimic', listener: game.myId, owner: game.myId})")
        await pump(pages, 1.5, 4)
        am = await A.evaluate("window.__mim"); bm = await B.evaluate("window.__mim")
        ok(am == 1 and bm == 1, f'mimicry played on the owner and relayed to the teammate (A {am}, B {bm})')
        used_phrase = await A.evaluate("window.__mimAt && window.__mimAt.phrase")
        ok(bool(used_phrase) and not await A.evaluate("id => game.voice.phrases.some(p => p.id === id)", used_phrase), 'used phrase deleted after playback (checked by ID while capture continues)')
        await A.evaluate("game.settings.mimicOptIn = false; game.settings.save()"); await pump(pages, 0.5)
        ok(await A.evaluate("game.voice.phrases.length") == 0, 'opting out deletes all stored phrases')
        await pump(pages, 3, 4)
        ok(await A.evaluate("game.voice.phrases.length") == 0, 'no capture after opting out')
        # chat
        await B.keyboard.press('Enter'); await pump(pages, 0.3); await B.keyboard.type('behind you'); await B.keyboard.press('Enter'); await pump(pages, 0.6)
        ok('behind you' in await A.inner_text('#chat-log'), 'text chat delivered')
        # downed -> revive by holding E
        await B.evaluate("game.net.send({t: 'debug', cmd: 'down'})"); await pump(pages, 1)
        ok(await B.evaluate("game.myState") == 'downed', 'player downed in co-op')
        bp = json.loads(await B.evaluate("JSON.stringify([game.player.pos.x, game.player.pos.z])"))
        await A.evaluate(f"mpTp({bp[0] + 1.0}, {bp[1]}); game.look(Math.atan2(-({bp[0]} - {bp[0] + 1.0}), -({bp[1]} - {bp[1]})), -0.5)")
        await pump(pages, 0.6)
        print('      revive prompt on A:', await A.evaluate("ui._prompt"))
        await A.keyboard.down('e'); await pump(pages, 6, 4); await A.keyboard.up('e'); await pump(pages, 0.5)
        ok(await B.evaluate("game.myState") == 'alive', 'teammate revived by holding E')
        # mic off = mute: nothing transmitted
        await A.evaluate("game.voice.disableMic()"); await pump(pages, 0.5)
        ok(await A.evaluate("game.voice.micState") == 'off' and not await A.evaluate("game.voice.transmitting"), 'turning the mic off stops transmission')
        for pg in pages:
            errs = [l for l in pg.logs if 'pageerror' in l or ('[error]' in l and 'TUNNEL' not in l)]
            ok(not errs, 'no page errors' + (': ' + errs[0][:160] if errs else ''))
        await b.close()
    print('\n' + (f'{fails} FAILED' if fails else 'all multiplayer browser checks passed'))
try:
    asyncio.run(main())
finally:
    SERVER.kill()
sys.exit(1 if fails else 0)
