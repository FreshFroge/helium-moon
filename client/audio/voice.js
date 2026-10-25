// Proximity voice chat + Helium Voice mimicry.
//
// Voice chat: a WebRTC mesh between lobby members (Opus is WebRTC's default audio
// codec). Each remote stream is played through a positional Web Audio chain whose
// gain/low-pass follow distance and occlusion: clear within 5 m, quieter 10-20 m,
// muffled beyond, silent past the maximum range. Push-to-talk or open mic.
//
// Mimicry (separate opt-in): while the player is transmitting, short phrases
// (0.9-4 s) are cut from the mic signal into an in-memory ring (max 6, 120 s TTL).
// Only phrase *metadata* (id + duration) goes to the authoritative sim. When the sim
// picks one, the owner's client pitch-shifts/distorts it, plays it at the chosen
// concealed position and shares the processed clip with the lobby for synced
// playback. The original is deleted after use. Nothing is written to disk, uploaded
// to any third party, or kept after the session. Opting out or disabling the mic
// clears everything immediately.
import { CONFIG } from '../../shared/config.js';
import { clamp, lerp, smoothstep } from '../../shared/math.js';
import { mimicProcess } from './synth.js';

const V = CONFIG.VOICE, M = CONFIG.MIMIC;
const CAP_SR = 16000;
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

const WORKLET = `class HMCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) { for (let i = 0; i < ch.length; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; } } }
    return true;
  }
}
registerProcessor('hm-capture', HMCapture);`;

export class VoiceSystem {
  constructor(audio, settings, net) {
    this.audio = audio; this.settings = settings; this.net = net;   // net: {myId(), sig(to,data), voiceState(mic), act(obj), binary(buf), networked}
    this.stream = null; this.track = null; this.micState = 'off';    // off | requesting | live | denied | error
    this.level = 0; this.gateOpen = false; this.hang = 0; this.transmitting = false;
    this.peers = new Map();
    this.phrases = []; this.seg = null; this.segQuiet = 0; this.phraseSeq = 1;
    this.suppressUntil = 0; this.playing = new Set();
    this.onChange = null; this.error = '';
    settings.onChange(() => this._settingsChanged());
  }

  get ctx() { return this.audio.ctx; }
  get micOn() { return this.micState === 'live'; }

  // ---------------------------------------------------------------- microphone
  async enableMic() {
    if (this.micOn || this.micState === 'requesting') return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.micState = 'error'; this.error = 'This browser does not allow microphone access here.'; this._notify(); return false; }
    this.micState = 'requesting'; this._notify();
    this.audio.resume();
    try {
      const dev = this.settings.micDevice;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: dev ? { exact: dev } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      });
    } catch (e) {
      this.micState = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'error';
      this.error = this.micState === 'denied' ? 'Microphone permission was denied. Voice chat and mimicry stay off; the game plays normally.' : `Could not open the microphone (${e && e.name || 'error'}).`;
      this.settings.micEnabled = false; this.settings.save();
      this._notify();
      return false;
    }
    // local track: level meter + voice gate (+ in-memory phrase capture if opted in); never sent anywhere.
    // sendTrack: a clone that peers receive; it is only enabled while push-to-talk is held or the gate is open.
    // (A disabled track outputs silence everywhere, so the gate must listen to the original.)
    this.track = this.stream.getAudioTracks()[0];
    this.sendTrack = this.track.clone();
    this.sendTrack.enabled = false;
    this.track.onended = () => this.disableMic();
    const ctx = this.ctx;
    this.src = ctx.createMediaStreamSource(this.stream);
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 90;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 1024; this.tbuf = new Float32Array(1024);
    this.src.connect(this.hp); this.hp.connect(this.analyser);
    this.micState = 'live'; this.error = '';
    this.settings.micEnabled = true; this.settings.save();
    for (const p of this.peers.values()) this._attachTrack(p);
    this.net.voiceState(true);
    await this._setupCapture();
    this._notify();
    return true;
  }

  disableMic() {
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    if (this.sendTrack) this.sendTrack.stop();
    this.stream = null; this.track = null; this.sendTrack = null;
    try { this.src && this.src.disconnect(); this.hp && this.hp.disconnect(); } catch (e) { /* */ }
    this._teardownCapture();
    this.clearPhrases(true);
    for (const p of this.peers.values()) if (p.sender) p.sender.replaceTrack(null).catch(() => {});
    this.transmitting = false; this.level = 0;
    if (this.micState === 'live' || this.micState === 'requesting') this.micState = 'off';
    this.net.voiceState(false);
    this._notify();
  }

  async devices() {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch (e) { return []; }
  }

  async _settingsChanged() {
    if (!this.settings.mimicOptIn) this.clearPhrases(true);
    if (this.micOn) {
      if (this.settings.mimicOptIn && !this.capNode) await this._setupCapture();
      if (!this.settings.mimicOptIn) this._teardownCapture();
      // switch device if changed
      const cur = this.track && this.track.getSettings ? this.track.getSettings().deviceId : '';
      if (this.settings.micDevice && cur && this.settings.micDevice !== cur) { this.disableMic(); await this.enableMic(); }
    }
  }

  // ---------------------------------------------------------------- phrase capture (in memory only)
  async _setupCapture() {
    if (!this.micOn || !this.settings.mimicOptIn || this.capNode) return;
    const ctx = this.ctx;
    try {
      if (!this._workletLoaded) {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        this._workletLoaded = true;
      }
      this.capNode = new AudioWorkletNode(ctx, 'hm-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      this.capNode.port.onmessage = (e) => this._onBlock(e.data);
    } catch (e) {
      // fallback for browsers without AudioWorklet
      this.capNode = ctx.createScriptProcessor(2048, 1, 1);
      this.capNode.onaudioprocess = (e) => this._onBlock(e.inputBuffer.getChannelData(0).slice(0));
    }
    this.capSink = ctx.createGain(); this.capSink.gain.value = 0;
    this.hp.connect(this.capNode); this.capNode.connect(this.capSink); this.capSink.connect(ctx.destination);
  }

  _teardownCapture() {
    if (!this.capNode) return;
    try { this.hp && this.hp.disconnect(this.capNode); this.capNode.disconnect(); this.capSink.disconnect(); } catch (e) { /* */ }
    if (this.capNode.port) this.capNode.port.onmessage = null;
    this.capNode = null; this.seg = null;
  }

  _onBlock(block) {
    // only the local microphone is ever captured, only while transmitting, and never while
    // mimicry/signature playback is audible (so the game cannot record its own output)
    const now = this.ctx.currentTime;
    const ok = this.settings.mimicOptIn && this.micOn && this.transmitting && now > this.suppressUntil && this.inGame;
    const ratio = this.ctx.sampleRate / CAP_SR;
    if (ok && this.gateOpen) {
      if (!this.seg) this.seg = { chunks: [], n: 0 };
      const n = Math.floor(block.length / ratio), ds = new Float32Array(n);
      for (let i = 0; i < n; i++) ds[i] = block[Math.floor(i * ratio)];
      this.seg.chunks.push(ds); this.seg.n += n; this.segQuiet = 0;
      if (this.seg.n / CAP_SR >= M.PHRASE_MAX) this._closeSegment();
    } else if (this.seg) {
      this.segQuiet += block.length / this.ctx.sampleRate;
      if (this.segQuiet > 0.3 || !ok) this._closeSegment();
    }
  }

  _closeSegment() {
    const seg = this.seg; this.seg = null;
    if (!seg) return;
    const dur = seg.n / CAP_SR;
    if (dur < M.PHRASE_MIN || dur > M.PHRASE_MAX + 0.2) return;
    const pcm = new Float32Array(seg.n); let o = 0; for (const c of seg.chunks) { pcm.set(c, o); o += c.length; }
    let e = 0; for (let i = 0; i < pcm.length; i++) e += pcm[i] * pcm[i];
    if (Math.sqrt(e / pcm.length) < 0.008) return;   // effectively silence
    const id = 'v' + (this.phraseSeq++);
    this.phrases.push({ id, pcm, dur, t: performance.now() });
    while (this.phrases.length > M.MAX_PHRASES) { const old = this.phrases.shift(); this.net.act({ a: 'phrase_drop', id: old.id }); old.pcm = null; }
    this.net.act({ a: 'phrase', id, dur: +dur.toFixed(2) });
    this._notify();
  }

  clearPhrases(tellSim = false) {
    for (const p of this.phrases) p.pcm = null;
    this.phrases = []; this.seg = null;
    if (tellSim) this.net.act({ a: 'mimic_off' });
    this._notify();
  }

  // ---------------------------------------------------------------- per frame
  // ctx: {ptt, inGame, alive, me:{x,y,z}, players: Map(id -> {x,y,z,state})}
  update(dt, c) {
    this.inGame = !!c.inGame;
    const now = performance.now();
    // phrase expiry (memory only, TTL)
    if (this.phrases.length && now - this.phrases[0].t > M.PHRASE_TTL * 1000) {
      const keep = [];
      for (const p of this.phrases) { if (now - p.t > M.PHRASE_TTL * 1000) { p.pcm = null; this.net.act({ a: 'phrase_drop', id: p.id }); } else keep.push(p); }
      this.phrases = keep;
    }
    if (this.micOn) {
      this.analyser.getFloatTimeDomainData(this.tbuf);
      let e = 0; for (let i = 0; i < this.tbuf.length; i++) e += this.tbuf[i] * this.tbuf[i];
      const db = 10 * Math.log10(e / this.tbuf.length + 1e-12);
      const lvl = clamp((db + 62) / 48, 0, 1);
      this.level = lerp(this.level, lvl, lvl > this.level ? 0.6 : 0.15);
      const thr = lerp(0.62, 0.18, this.settings.micSensitivity);
      if (this.level > thr) { this.gateOpen = true; this.hang = 0.45; } else { this.hang -= dt; if (this.hang <= 0) this.gateOpen = false; }
      const want = (this.settings.voiceMode === 'ptt' ? !!c.ptt : this.gateOpen) && c.alive !== false;
      if (want !== this.transmitting) { this.transmitting = want; if (this.sendTrack) this.sendTrack.enabled = want; this._notify(); }
      if (this.settings.voiceMode === 'ptt') this.gateOpen = this.transmitting && this.level > 0.1;
    } else { this.transmitting = false; this.level = 0; }
    // proximity mix for every remote voice
    const ctxT = this.ctx ? this.ctx.currentTime : 0;
    for (const [id, p] of this.peers) {
      if (!p.e) continue;
      const pl = c.players && c.players.get(id);
      let gain = 0.85, lp = 18000, vis = 1;
      if (c.inGame && pl && c.me) {
        const d = Math.hypot(pl.x - c.me.x, pl.y - c.me.y, pl.z - c.me.z);
        if (d <= V.CLEAR) gain = 1;
        else if (d <= V.FADE_END) gain = lerp(1, 0.35, (d - V.CLEAR) / (V.FADE_END - V.CLEAR));
        else if (d <= V.MUFFLE) gain = lerp(0.35, 0.16, (d - V.FADE_END) / (V.MUFFLE - V.FADE_END));
        else if (d <= V.MAX) gain = lerp(0.16, 0, (d - V.MUFFLE) / (V.MAX - V.MUFFLE));
        else gain = 0;
        // full bandwidth up close, progressively muffled (~9.6 kHz at 20 m, ~4 kHz at 28 m, 700 Hz at the edge)
        lp = 16000 * Math.pow(700 / 16000, smoothstep(12, V.MAX, d));
        if (gain > 0 && this.audio.world) {
          vis = this.audio.world.lineOfSight(c.me.x, c.me.y, c.me.z, pl.x, pl.y, pl.z, { brushK: 0.25 });
          vis = 0.35 + 0.65 * vis;
          gain *= lerp(0.6, 1, vis); lp = Math.min(lp, lerp(1400, 16000, vis * vis));
        }
        if (pl.state === 'dead') gain = 0;     // the dead are silent to the living
        if (pl.state === 'downed') lp = Math.min(lp, 3000);
        p.e.setPos(pl.x, pl.y, pl.z, 0.05);
        p.e.pan.refDistance = 1000;             // distance curve handled here, panner only spatialises
      } else if (p.e) { p.e.setPos(c.me ? c.me.x : 0, c.me ? c.me.y : 0, c.me ? c.me.z - 0.5 : 0); }
      p.e.out.gain.setTargetAtTime(gain, ctxT, 0.08);
      p.e.lp.frequency.setTargetAtTime(lp, ctxT, 0.08);
      p.speaking = p.analyser ? this._peerLevel(p) > 0.15 : false;
    }
  }

  _peerLevel(p) {
    p.analyser.getFloatTimeDomainData(p.tb);
    let e = 0; for (let i = 0; i < p.tb.length; i++) e += p.tb[i] * p.tb[i];
    return clamp((10 * Math.log10(e / p.tb.length + 1e-12) + 62) / 48, 0, 1);
  }

  // value reported to the sim (monsters react to how loud, never to what is said)
  get voiceLevel() { return this.transmitting ? Math.max(0.05, this.level) : 0; }

  // ---------------------------------------------------------------- WebRTC mesh
  syncPeers(ids) {
    if (!this.net.networked || typeof RTCPeerConnection === 'undefined') return;
    const me = this.net.myId();
    for (const id of ids) if (id !== me && !this.peers.has(id)) this._makePeer(id, this._num(me) < this._num(id));
    for (const id of [...this.peers.keys()]) if (!ids.includes(id)) this.dropPeer(id);
  }

  _num(id) { return parseInt(String(id).replace(/\D/g, ''), 10) || 0; }

  _makePeer(id, initiator) {
    const fromServer = typeof window !== 'undefined' && Array.isArray(window.HM_ICE_SERVERS) && window.HM_ICE_SERVERS.length ? window.HM_ICE_SERVERS : null;
    const pc = new RTCPeerConnection({ iceServers: fromServer || ICE });
    const p = { id, pc, sender: null, e: null, initiator, el: null, analyser: null, speaking: false };
    this.peers.set(id, p);
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    p.sender = tr.sender;
    this._attachTrack(p);
    pc.onicecandidate = (e) => { if (e.candidate) this.net.sig(id, { type: 'ice', c: e.candidate }); };
    pc.ontrack = (e) => this._onRemoteTrack(p, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { this.dropPeer(id); } };
    if (initiator) {
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => this.net.sig(id, { type: 'offer', sdp: pc.localDescription })).catch((e) => console.warn('offer failed', e));
    }
    return p;
  }

  _attachTrack(p) { if (p.sender && this.sendTrack) p.sender.replaceTrack(this.sendTrack).catch(() => {}); }

  async onSignal(from, data) {
    if (!this.net.networked || typeof RTCPeerConnection === 'undefined' || !data) return;
    let p = this.peers.get(from);
    try {
      if (data.type === 'offer') {
        if (!p) p = this._makePeer(from, false);
        await p.pc.setRemoteDescription(data.sdp);
        const ans = await p.pc.createAnswer();
        await p.pc.setLocalDescription(ans);
        this.net.sig(from, { type: 'answer', sdp: p.pc.localDescription });
        for (const c of p.pending || []) await p.pc.addIceCandidate(c).catch(() => {});
        p.pending = null;
      } else if (data.type === 'answer' && p) {
        await p.pc.setRemoteDescription(data.sdp);
        for (const c of p.pending || []) await p.pc.addIceCandidate(c).catch(() => {});
        p.pending = null;
      } else if (data.type === 'ice' && p) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.c).catch(() => {});
        else (p.pending || (p.pending = [])).push(data.c);
      }
    } catch (e) { console.warn('voice signalling error', e); }
  }

  _onRemoteTrack(p, stream) {
    if (p.e) return;
    // Chrome only feeds remote WebRTC audio into Web Audio if the stream is also attached to a media element
    const el = new Audio(); el.srcObject = stream; el.muted = true; el.play().catch(() => {});
    p.el = el;
    const ctx = this.ctx;
    const src = ctx.createMediaStreamSource(stream);
    p.e = this.audio.emitter({ bus: 'voice', ref: 1000, rolloff: 1, reverb: 0.06 });
    p.analyser = ctx.createAnalyser(); p.analyser.fftSize = 512; p.tb = new Float32Array(512);
    src.connect(p.e.input); src.connect(p.analyser);
    p.src = src;
  }

  dropPeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch (e) { /* */ }
    if (p.e) p.e.dispose();
    try { p.src && p.src.disconnect(); } catch (e) { /* */ }
    if (p.el) { p.el.srcObject = null; }
    this.peers.delete(id);
  }

  dropAllPeers() { for (const id of [...this.peers.keys()]) this.dropPeer(id); }

  isSpeaking(id) { const p = this.peers.get(id); return !!(p && p.speaking); }

  // ---------------------------------------------------------------- mimicry playback
  // Sim chose one of OUR phrases: process it, play it, share it, delete it.
  onMimicEvent(ev) {
    if (ev.owner !== this.net.myId()) return;
    const i = this.phrases.findIndex((p) => p.id === ev.phrase);
    if (i < 0) return;
    const ph = this.phrases.splice(i, 1)[0];
    const pcm = mimicProcess(ph.pcm, CAP_SR, M.PITCH, ev.mid * 7919);
    ph.pcm = null;   // the original snippet is gone after one use
    this._notify();
    this.playMimic(pcm, CAP_SR, ev);
    if (this.net.networked) {
      let js = JSON.stringify({ k: 'mimic', mid: ev.mid, x: ev.x, y: ev.y, z: ev.z, sr: CAP_SR, decoy: !!ev.decoy, listener: ev.listener });
      let head = new TextEncoder().encode(js);
      if (head.length % 2) head = new TextEncoder().encode(js + ' ');   // keep the PCM 2-byte aligned
      const buf = new ArrayBuffer(4 + head.length + pcm.length * 2);
      new DataView(buf).setUint32(0, head.length, true);
      new Uint8Array(buf, 4, head.length).set(head);
      const i16 = new Int16Array(buf, 4 + head.length, pcm.length);
      for (let k = 0; k < pcm.length; k++) i16[k] = clamp(pcm[k], -1, 1) * 32767;
      this.net.binary(buf);
    }
  }

  // processed clip from a teammate (never stored, played once)
  onBinary(buf) {
    try {
      const dv = new DataView(buf), hl = dv.getUint32(0, true);
      const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
      if (head.k !== 'mimic' || !(head.sr > 4000 && head.sr <= 48000)) return;
      const off = 4 + hl, n = Math.floor((buf.byteLength - off) / 2);
      if (n <= 0 || n > head.sr * 8) return;
      const i16 = new Int16Array(buf.slice(off, off + n * 2));
      const pcm = new Float32Array(n); for (let k = 0; k < n; k++) pcm[k] = i16[k] / 32767;
      this.playMimic(pcm, head.sr, head);
    } catch (e) { /* malformed */ }
  }

  playMimic(pcm, sr, at) {
    const buf = this.audio.toBuffer(pcm, sr);
    const h = this.audio.play(buf, { pos: { x: at.x, y: at.y, z: at.z }, bus: 'mon', gain: 1.25, ref: 4, reverb: 0.55 });
    this.suppressUntil = this.ctx.currentTime + buf.duration + 0.6;
    if (this.onMimicPlayed) this.onMimicPlayed(at);
    return h;
  }

  // signature line / loud monster audio also suppress capture
  suppress(seconds) { if (this.ctx) this.suppressUntil = Math.max(this.suppressUntil, this.ctx.currentTime + seconds); }

  endSession() { this.clearPhrases(false); this.seg = null; }

  status() {
    return {
      mic: this.micState, transmitting: this.transmitting, level: this.level, mode: this.settings.voiceMode,
      mimic: this.settings.mimicOptIn && this.micOn, phrases: this.phrases.length, error: this.error,
    };
  }

  _notify() { if (this.onChange) this.onChange(this.status()); }
}
