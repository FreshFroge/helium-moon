// Voice ICE configuration: the server hands clients STUN by default and a TURN relay
// when configured (TURN_URL/TURN_USERNAME/TURN_CREDENTIAL or HM_ICE_SERVERS JSON).
//   node tests/ice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function welcome(env) {
  const port = 19000 + Math.floor(Math.random() * 900);
  const srv = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stdout.on('data', (d) => { out += d; }); srv.stderr.on('data', (d) => { out += d; });
  try {
    for (let i = 0; i < 150 && !out.includes('running at'); i++) await new Promise((r) => setTimeout(r, 100));
    const msg = await new Promise((res, rej) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const to = setTimeout(() => rej(new Error('no welcome')), 5000);
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'welcome') { clearTimeout(to); ws.close(); res(m); } };
      ws.onerror = rej;
    });
    return { msg, out };
  } finally { srv.kill(); }
}

test('default: public STUN only', async () => {
  const { msg } = await welcome({ TURN_URL: '', HM_ICE_SERVERS: '' });
  assert.ok(Array.isArray(msg.iceServers) && msg.iceServers.length === 1);
  assert.ok([].concat(msg.iceServers[0].urls).every((u) => u.startsWith('stun:')));
});

test('TURN_URL adds a relay with credentials', async () => {
  const { msg } = await welcome({ TURN_URL: 'turn:turn.example.com:3478,turns:turn.example.com:5349', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' });
  const turn = msg.iceServers.find((e) => [].concat(e.urls).some((u) => u.startsWith('turn')));
  assert.deepEqual(turn, { urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'], username: 'u', credential: 'p' });
});

test('HM_ICE_SERVERS JSON replaces the list; invalid JSON falls back with a warning', async () => {
  const list = [{ urls: 'turn:relay.example.net:3478', username: 'a', credential: 'b' }];
  assert.deepEqual((await welcome({ HM_ICE_SERVERS: JSON.stringify(list) })).msg.iceServers, list);
  const bad = await welcome({ HM_ICE_SERVERS: '{not json' });
  assert.ok(bad.msg.iceServers.length >= 1 && /HM_ICE_SERVERS/.test(bad.out));
});
