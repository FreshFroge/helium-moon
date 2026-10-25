import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { listenOptions, listenWithFallback } from '../server/listen.js';

test('port configuration distinguishes the default from an explicit choice', () => {
  assert.deepEqual(listenOptions([], {}), {port:8080, fallback:true});
  assert.deepEqual(listenOptions(['--port','8081'], {}), {port:8081, fallback:false});
  assert.deepEqual(listenOptions(['--port=0'], {PORT:'8085'}), {port:0, fallback:false});
  assert.deepEqual(listenOptions([], {PORT:'8083'}), {port:8083, fallback:false});
  for (const value of ['-1','65536','abc','1.5','']) assert.throws(() => listenOptions([], {PORT:value}));
  assert.throws(() => listenOptions(['--port'], {}));
});

test('a busy default moves to a usable port without replacing the existing service', async () => {
  const existing = http.createServer((req,res) => res.end('existing'));
  const game = http.createServer((req,res) => res.end('game'));
  await listenWithFallback(existing, {port:0});
  const busy = existing.address().port, retries = [];
  try {
    const selected = await listenWithFallback(game, {port:busy, fallback:true, onRetry:port => retries.push(port)});
    assert.ok(selected > busy && selected <= busy+9);
    assert.equal(retries[0], busy);
    assert.equal(await (await fetch(`http://localhost:${busy}`)).text(), 'existing');
    assert.equal(await (await fetch(`http://localhost:${selected}`)).text(), 'game');
  } finally { existing.closeAllConnections(); game.closeAllConnections(); await Promise.all([new Promise(r=>existing.close(r)), new Promise(r=>game.close(r))]); }
});

test('an occupied explicit port exits cleanly with an actionable message', async () => {
  const existing = http.createServer((req,res) => res.end('existing'));
  await listenWithFallback(existing,{port:0});
  try {
    const result = await new Promise((resolve,reject) => {
      const child=spawn(process.execPath,['server/server.js','--port',String(existing.address().port)], {env:{...process.env,PORT:''},stdio:['ignore','pipe','pipe']});
      let output=''; child.stdout.on('data',d=>output+=d); child.stderr.on('data',d=>output+=d);
      const timeout=setTimeout(()=>{child.kill();reject(new Error('failed startup must not hang'));},20000);
      child.on('error',reject); child.on('close',code=>{clearTimeout(timeout);resolve({code,output});});
    });
    assert.equal(result.code,1);
    assert.match(result.output,/already in use/);
    assert.match(result.output,/node server\/server.js --port/);
    assert.doesNotMatch(result.output,/Unhandled 'error'|node:events/);
    assert.equal(await (await fetch(`http://localhost:${existing.address().port}`)).text(),'existing');
  } finally {existing.closeAllConnections();await new Promise(r=>existing.close(r));}
});
