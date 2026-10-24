// Minimal dependency-free WebSocket (RFC 6455) server side: handshake, framing,
// fragmentation, ping/pong, close. Enough for game traffic + small binary blobs.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class WSConn extends EventEmitter {
  constructor(socket, maxPayload) {
    super();
    this.socket = socket; this.maxPayload = maxPayload;
    this.buf = Buffer.alloc(0); this.frags = []; this.fragOp = 0;
    this.open = true;
    socket.setNoDelay(true);
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }

  _closed() { if (!this.open) return; this.open = false; this.emit('close'); }

  _onData(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; const hi = this.buf.readUInt32BE(2); len = hi * 2 ** 32 + this.buf.readUInt32BE(6); off = 10; }
      if (len > this.maxPayload) { this.close(1009, 'too big'); return; }
      if (!masked) { this.close(1002, 'unmasked'); return; }
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x8) { this.close(1000); return; }
      if (op === 0x9) { this._send(0xA, data); continue; }
      if (op === 0xA) { this.lastPong = Date.now(); continue; }
      if (op === 0x0) { this.frags.push(data); if (fin) { const all = Buffer.concat(this.frags); this.frags = []; this._msg(this.fragOp, all); } continue; }
      if (!fin) { this.fragOp = op; this.frags = [data]; continue; }
      this._msg(op, data);
    }
  }

  _msg(op, data) {
    if (op === 0x1) this.emit('message', data.toString('utf8'), false);
    else if (op === 0x2) this.emit('message', data, true);
  }

  _send(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    let head;
    if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
    else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeUInt32BE(Math.floor(len / 2 ** 32), 2); head.writeUInt32BE(len >>> 0, 6); }
    head[0] = 0x80 | op;
    try { this.socket.write(Buffer.concat([head, payload])); } catch (e) { this._closed(); }
  }

  send(data) {
    if (typeof data === 'string') this._send(0x1, Buffer.from(data, 'utf8'));
    else this._send(0x2, Buffer.isBuffer(data) ? data : Buffer.from(data));
  }
  ping() { this._send(0x9, Buffer.alloc(0)); }
  close(code = 1000, reason = '') {
    if (!this.open) return;
    const b = Buffer.alloc(2 + Buffer.byteLength(reason)); b.writeUInt16BE(code, 0); b.write(reason, 2);
    this._send(0x8, b);
    this.open = false;
    try { this.socket.end(); } catch (e) { /* ignore */ }
    this.emit('close');
  }
}

export function attachWebSocket(server, path, onConnection, { maxPayload = 2 * 1024 * 1024 } = {}) {
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x');
    const key = req.headers['sec-websocket-key'];
    if (url.pathname !== path || !key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    onConnection(new WSConn(socket, maxPayload), req);
  });
}
