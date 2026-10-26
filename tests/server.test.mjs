// End-to-end protocol test against a real server process (no browser):
// lobby create/join/codes, host start, snapshots with both players, input -> movement,
// chat, WebRTC signalling relay, binary mimic-audio relay, downed -> revive, host migration, leave.
//   node tests/server.test.mjs            (spawns its own server on a free port with HM_TEST=1)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18000 + Math.floor(Math.random() * 1000);
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : 'FAIL '} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(name) { this.name = name; this.msgs = []; this.bin = []; this.waiters = []; }
  connect() {
    return new Promise((res, rej) => {
      const ws = this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      ws.binaryType = 'arraybuffer';
      ws.onerror = rej;
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') { this.bin.push(e.data); return; }
        const m = JSON.parse(e.data);
        if (m.t === 'welcome') { this.id = m.id; this.send({ t: 'hello', name: this.name }); res(); }
        if (m.t === 'snap') this.snap = m.s;
        else this.msgs.push(m);
        for (const w of [...this.waiters]) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(m); }
      };
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(pred, ms = 5000) {
    const hit = this.msgs.find(pred); if (hit) return Promise.resolve(hit);
    return new Promise((res, rej) => { const w = { pred, res }; this.waiters.push(w); setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); rej(new Error('timeout waiting for message')); } }, ms); });
  }
  events(type) { return this.msgs.filter((m) => m.t === 'ev').flatMap((m) => m.ev).filter((e) => e.type === type); }
  close() { this.ws.close(); }
}

const server = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], { env: { ...process.env, PORT: String(PORT), HM_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

try {
  for (let i = 0; i < 100 && !serverLog.includes('running at'); i++) await sleep(150);
  ok(serverLog.includes('running at'), 'server started');
  const health = await fetch(`http://localhost:${PORT}/healthz`).then((r) => r.text());
  ok(health === 'ok', 'healthz responds');
  const page = await fetch(`http://localhost:${PORT}/`).then((r) => r.text());
  ok(page.includes('HELIUM MOON'), 'serves index.html');
  const blocked = await fetch(`http://localhost:${PORT}/server/server.js`).then((r) => r.status);
  ok(blocked === 404, 'does not serve server source');

  const A = new Client('Alpha'), B = new Client('Bravo'), C = new Client('Charlie');
  await A.connect(); await B.connect(); await C.connect();
  ok(A.id && B.id && A.id !== B.id, `unique ids (${A.id}, ${B.id}, ${C.id})`);

  A.send({ t: 'create' });
  const lob = await A.wait((m) => m.t === 'lobby');
  ok(/^[A-Z2-9]{5}$/.test(lob.code), `lobby code ${lob.code}`);
  B.send({ t: 'join', code: lob.code.toLowerCase() });
  const lobB = await B.wait((m) => m.t === 'lobby' && m.players.length === 2);
  ok(lobB.host === A.id, 'joiner sees creator as host');
  C.send({ t: 'join', code: 'ZZZZZ' });
  const err = await C.wait((m) => m.t === 'error');
  ok(/No lobby/.test(err.msg), 'bad code rejected');

  // voice signalling relay (WebRTC offer/answer/ICE go through the server)
  A.send({ t: 'sig', to: B.id, data: { type: 'offer', sdp: { type: 'offer', sdp: 'v=0 test' } } });
  const sig = await B.wait((m) => m.t === 'sig');
  ok(sig.from === A.id && sig.data.type === 'offer', 'signalling relayed to the addressed peer only');
  A.send({ t: 'voice_state', mic: true });
  const vs = await B.wait((m) => m.t === 'voice_state');
  ok(vs.id === A.id && vs.mic === true, 'voice state broadcast');

  // Direct WebRTC can fail behind restrictive NAT/firewall policy. The bounded
  // PCM fallback is addressed only to current lobby peers and gets its sender
  // identity from the server, never from an untrusted client header.
  const voiceClip = (to, n = 3200) => {
    const head = new TextEncoder().encode(JSON.stringify({ k: 'voice', from: 'forged', to, sr: 16000, seq: 7 }));
    const b = new Uint8Array(4 + head.length + n); new DataView(b.buffer).setUint32(0, head.length, true); b.set(head, 4); return b;
  };
  A.ws.send(voiceClip([B.id, C.id])); await sleep(250);
  const relayedHead = B.bin.length ? JSON.parse(new TextDecoder().decode(new Uint8Array(B.bin[0], 4, new DataView(B.bin[0]).getUint32(0, true)))) : null;
  ok(B.bin.length === 1 && C.bin.length === 0 && relayedHead?.from === A.id && relayedHead?.k === 'voice', 'voice fallback is server-authenticated and limited to current lobby targets');
  A.bin.length = 0; B.bin.length = 0; C.bin.length = 0;

  // non-host cannot start
  B.send({ t: 'start' }); await sleep(300);
  ok(!B.msgs.some((m) => m.t === 'start'), 'non-host cannot start');
  A.send({ t: 'start' });
  const st = await B.wait((m) => m.t === 'start');
  ok(st.info.players.length === 2 && st.info.layout.stations.length === 4, 'game starts with 2 players, three repairs and the far-bank aerial');
  C.send({ t: 'join', code: lob.code });
  const err2 = await C.wait((m) => m.t === 'error' && /progress/.test(m.msg));
  ok(!!err2, 'cannot join a game in progress');
  await sleep(500);
  ok(A.snap && A.snap.pl.length === 2, 'snapshots contain both players');
  ok(A.snap && Array.isArray(A.snap.hv) && A.snap.hv.length === 14 && A.snap.sf.length === 9, 'snapshots carry both creatures');

  // movement: client-owned positions, teleports rejected
  A.send({ t: 'debug', cmd: 'freeze' });
  const me = A.snap.pl.find((p) => p[0] === A.id);
  A.send({ t: 'in', x: me[1] + 1.5, y: me[2], z: me[3], yaw: 0.5, pitch: 0, crouch: true, sprint: false, flash: true, noise: 0.2, voice: 0, hidden: false, lean: -.8 });
  await sleep(300);
  const me2 = A.snap.pl.find((p) => p[0] === A.id);
  ok(Math.abs(me2[1] - (me[1] + 1.5)) < 0.01 && (me2[6] & 1), 'input moves player and sets crouch flag');
  ok(me2[11] === -.8 && B.snap.pl.find((p) => p[0] === A.id)[11] === -.8,
    'the same authoritative lean reaches both real clients after existing player fields');
  A.send({ t: 'in', x: me2[1] + 80, y: me2[2], z: me2[3], yaw: 0.5, pitch: 0 });
  await sleep(300);
  ok(Math.abs(A.snap.pl.find((p) => p[0] === A.id)[1] - me2[1]) < 0.01, 'teleport (>12 m) rejected');

  // chat
  B.send({ t: 'chat', text: 'did you hear that' });
  const chat = await A.wait((m) => m.t === 'chat');
  ok(chat.name === 'Bravo' && chat.text === 'did you hear that', 'chat relayed');

  // mimicry: phrase metadata -> forced selection -> event to everyone; binary audio relayed to others only
  B.send({ t: 'act', a: 'phrase', id: 'v1', dur: 1.6 });
  await sleep(200);
  B.send({ t: 'debug', cmd: 'mimic', listener: B.id, owner: B.id });
  const mev = await A.wait((m) => m.t === 'ev' && m.ev.some((e) => e.type === 'mimic'));
  const mimic = mev.ev.find((e) => e.type === 'mimic');
  ok(mimic.owner === B.id && mimic.phrase === 'v1' && Number.isFinite(mimic.x), 'mimic event broadcast with owner, phrase id and position');
  const meB = B.snap.pl.find((p) => p[0] === B.id);
  const dist = Math.hypot(mimic.x - meB[1], mimic.z - meB[3]);
  ok(dist > 8 && dist < 50, `mimic source ${dist.toFixed(1)} m from the listener`);
  const clip = (mid, n = 4000) => { const head = new TextEncoder().encode(JSON.stringify({ k: 'mimic', mid, x: 0, y: 0, z: 0, sr: 16000 })); const b = new Uint8Array(4 + head.length + n); new DataView(b.buffer).setUint32(0, head.length, true); b.set(head, 4); return b; };
  A.ws.send(clip(mimic.mid));                 // not the owner of this mimic event
  B.ws.send(clip(mimic.mid + 999));           // owner, but an event the server never issued
  const junk = new Uint8Array(4000); junk.set([10, 0, 0, 0], 0); B.ws.send(junk);
  await sleep(300);
  ok(A.bin.length === 0 && B.bin.length === 0, 'unsolicited / forged / non-owner audio is not relayed');
  B.ws.send(clip(mimic.mid));
  await sleep(300);
  ok(A.bin.length === 1 && B.bin.length === 0, 'mimic audio relayed to teammates, not echoed back');
  B.ws.send(clip(mimic.mid));
  await sleep(300);
  ok(A.bin.length === 1, 'each mimic event relays its audio only once');
  // chat flood is capped
  const before = A.msgs.filter((m) => m.t === 'chat').length;
  for (let i = 0; i < 30; i++) B.send({ t: 'chat', text: 'spam ' + i });
  await sleep(400);
  const relayed = A.msgs.filter((m) => m.t === 'chat').length - before;
  ok(relayed > 0 && relayed <= 6, `chat flood rate-limited (${relayed} of 30 relayed)`);
  B.send({ t: 'act', a: 'mimic_off' });

  // downed -> revive by teammate
  B.send({ t: 'debug', cmd: 'down' });
  const dn = await A.wait((m) => m.t === 'ev' && m.ev.some((e) => e.type === 'downed'));
  ok(!!dn, 'player downed in co-op (not killed)');
  const bp = A.snap.pl.find((p) => p[0] === B.id), ap = A.snap.pl.find((p) => p[0] === A.id);
  A.send({ t: 'debug', cmd: 'tp', x: bp[1] + 1, z: bp[3] });
  await sleep(150);
  const t0 = Date.now();
  while (Date.now() - t0 < 6500) { A.send({ t: 'in', x: bp[1] + 1, y: bp[2], z: bp[3], yaw: 0, pitch: 0, revive: B.id }); await sleep(50); }
  const rv = A.events('revived');
  ok(rv.length === 1 && rv[0].pid === B.id && rv[0].by === A.id, 'teammate revive works');
  ok(A.snap.pl.find((p) => p[0] === B.id)[8] === 0, 'revived player is alive again');

  // host leaves -> host migrates; remaining player can restart / return to lobby
  A.close();
  const lob2 = await B.wait((m) => m.t === 'lobby' && m.host === B.id, 4000);
  ok(!!lob2 && lob2.players.length === 1, 'host migrates when host leaves');
  B.send({ t: 'to_lobby' });
  const lob3 = await B.wait((m) => m.t === 'lobby' && m.state === 'lobby' && m !== lob2, 4000).catch(() => null);
  ok(!!lob3, 'new host can return the group to the lobby');
  B.send({ t: 'start' });
  const st2 = await B.wait((m) => m.t === 'start' && m !== st, 4000).catch(() => null);
  ok(!!st2 && st2.info.players.length === 1, 'new game starts from the lobby');
  B.close(); C.close();
  await sleep(300);
  ok(/closed/.test(serverLog), 'empty lobby closed');
} catch (e) {
  console.error(e); failures++;
} finally {
  server.kill();
}
console.log(failures ? `\n${failures} FAILED` : '\nall server tests passed');
process.exit(failures ? 1 : 0);
