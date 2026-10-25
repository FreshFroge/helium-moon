// Audio engine: Web Audio graph, HRTF-positional emitters with occlusion and a
// forest reverb, natural night ambience, subdued player physiology, footsteps
// and creature vocals. Player breathing and Helium Voice's signature are sourced
// recordings; other effects are synthesized at load. Cold is the proximity cue.
import * as S from './synth.js';
import { PLAYER_BREATH_FILE, recordedBreathPhrase } from './playerBreath.js';
import { impulse, rngFor } from './dsp.js';
import { assetUrl } from '../render/textures.js';
import { clamp, lerp, smoothstep } from '../../shared/math.js';
import { horrorCues, distanceGain, creatureFootstepCue, skunkVocalCue } from '../../shared/horror.js';
import { SURFACE } from '../../shared/world.js';

const SURF_NAME = { [SURFACE.LITTER]: 'litter', [SURFACE.DIRT]: 'dirt', [SURFACE.MUD]: 'mud', [SURFACE.GRASS]: 'grass', [SURFACE.SILT]: 'silt', [SURFACE.WATER]: 'water', [SURFACE.GRAVEL]: 'gravel', [SURFACE.WOOD]: 'wood', [SURFACE.ASPHALT]: 'asphalt' };
const HV_KINDS = ['whisper', 'breath', 'inhale', 'giggle', 'laugh', 'hum', 'call', 'cry', 'scream', 'fragment'];
const SF_KINDS = ['rumble', 'chitter', 'breath', 'rustle', 'growl', 'warn', 'gas', 'bite'];
const yieldUI = () => new Promise((r) => setTimeout(r, 0));

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ready = false; this.lib = {}; this.var = {};
    this.world = null; this.listener = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
    this.timers = { owl: 30, coyote: 100, train: 200, creak: 10, snap: 30, frog: 8, dog: 150 };
    this.breathT = 0; this.breathIn = true; this.heartT = 0; this.onExhale = null;
    this.state = { terror: 0, fear: 0, cold: 0, exert: 0, gas: 0, downed: 0, inGame: false, critical: 0 };
    this.loops = {};
    this.active = new Set();
  }

  // ---------------------------------------------------------------- setup
  async init(world, progress = () => {}) {
    this.world = world;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.warn('Web Audio unavailable'); return; }
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.master = g(); this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.005; this.comp.release.value = 0.25;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.hear = ctx.createBiquadFilter(); this.hear.type = 'lowpass'; this.hear.frequency.value = 20000; this.hear.Q.value = 0.5;
    this.hear.connect(this.master);
    this.bus = { amb: g(), sfx: g(), mon: g(), voice: g(), ui: g() };
    this.bus.amb.connect(this.hear); this.bus.sfx.connect(this.hear); this.bus.mon.connect(this.hear); this.bus.voice.connect(this.hear);
    this.bus.ui.connect(this.master);
    this.reverb = ctx.createConvolver();
    const [L, R] = impulse(ctx.sampleRate, 2.6, 2.4, rngFor(77), 3800);
    this.reverb.buffer = this.toBuffer([L, R], ctx.sampleRate);
    this.revIn = g(0.9); this.revIn.connect(this.reverb); this.reverb.connect(this.hear);
    this.applyVolumes();
    this.settings.onChange(() => this.applyVolumes());
    // ---- synthesis (yielding so the loading bar keeps moving)
    const jobs = [];
    const add = (key, fn) => jobs.push([key, fn]);
    add('crickets', () => S.crickets(11)); add('katydids', () => S.katydids(12)); add('wind', () => S.wind(13)); add('river', () => S.river(14)); add('traffic', () => S.traffic(15));
    for (let i = 0; i < 3; i++) { add('owl' + i, () => S.owl(20 + i)); add('creak' + i, () => S.creak(30 + i)); add('snap' + i, () => S.twigSnap(40 + i)); add('frog' + i, () => S.frog(50 + i)); }
    add('coyote0', () => S.coyotes(60)); add('coyote1', () => S.coyotes(61)); add('train', () => S.trainHorn(62)); add('dog0', () => S.dogBark(63));
    for (const k of ['litter', 'dirt', 'mud', 'grass', 'silt', 'water', 'gravel', 'wood', 'asphalt', 'brush']) for (let i = 0; i < 4; i++) add(`fs_${k}${i}`, () => S.footstep(k, 100 + i * 7 + k.length));
    add('heart', () => S.heartbeat()); add('clickOn', () => S.click(1, true)); add('clickOff', () => S.click(2, false)); add('paper', () => S.paper(3)); add('clink', () => S.clink(4));
    for (const k of ['gen', 'relay', 'mast']) add('work_' + k, () => S.work(k, 5));
    add('genLoop', () => S.generatorLoop(6)); add('hum', () => S.humLoop()); add('siren', () => S.sirenLoop()); add('radio', () => S.radioCall(7));
    for (const k of ['reveal', 'snap', 'chase']) add('st_' + k, () => S.stinger(k, 8));
    add('hurt', () => S.hurt(9, false)); add('down', () => S.hurt(10, true));
    let t0 = performance.now();
    for (let i = 0; i < jobs.length; i++) {
      const [k, fn] = jobs[i];
      this.lib[k] = this.toBuffer(fn());
      if (performance.now() - t0 > 40) { progress(i / jobs.length); await yieldUI(); t0 = performance.now(); }
    }
    this.sigPCM = null;
    try { await this.loadSignature(); } catch (e) { console.warn('signature clip unavailable', e); }
    await this.loadPlayerBreathing();
    this._buildLoops();
    this.ready = true;
  }

  async loadPlayerBreathing() {
    const response = await fetch(assetUrl(PLAYER_BREATH_FILE));
    if (!response.ok) throw new Error('Player breathing recording is missing');
    const recording = await this.ctx.decodeAudioData(await response.arrayBuffer());
    const pcm = recording.getChannelData(0);
    for (let i = 0; i < S.PLAYER_BREATH_VARIANTS; i++) for (let half = 0; half < 2; half++) {
      const clip = this.toBuffer(recordedBreathPhrase(pcm, recording.sampleRate, i * 2 + half), recording.sampleRate);
      const phase = half ? 'out' : 'in';
      this.lib[phase + i] = clip;
      this.lib[phase + 'H' + i] = clip;
    }
    this.playerBreathSource = 'recorded';
  }

  async loadSignature() {
    const ctx = this.ctx;
    for (const f of ['assets/audio/helium_voice_signature.ogg', 'assets/audio/helium_voice_signature.mp4']) {
      try {
        const ab = await (await fetch(assetUrl(f))).arrayBuffer();
        const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
        this.lib.signature = buf;
        // mono copy at SR for vocal fragments
        const d = buf.getChannelData(0), ratio = buf.sampleRate / S.SR, n = Math.floor(d.length / ratio), m = new Float32Array(n);
        const d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d;
        for (let i = 0; i < n; i++) { const k = Math.floor(i * ratio); m[i] = (d[k] + d1[k]) * 0.5; }
        this.sigPCM = m;
        return;
      } catch (e) { /* try next format */ }
    }
    throw new Error('could not decode signature clip');
  }

  toBuffer(data, sr = S.SR) {
    const chans = Array.isArray(data) ? data : [data];
    const b = this.ctx.createBuffer(chans.length, chans[0].length, sr);
    chans.forEach((c, i) => b.copyToChannel ? b.copyToChannel(c, i) : b.getChannelData(i).set(c));
    return b;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings, t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.bus.amb.gain.setTargetAtTime(s.ambienceVolume, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.bus.mon.gain.setTargetAtTime(s.sfxVolume * 1.1, t, 0.05);
    this.bus.voice.gain.setTargetAtTime(s.voiceVolume, t, 0.05);
    this.bus.ui.gain.setTargetAtTime(s.sfxVolume * 0.8, t, 0.05);
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  // ---------------------------------------------------------------- emitters
  // A positional chain: input -> occlusion lowpass -> gain -> HRTF panner -> bus (+ reverb send)
  emitter({ bus = 'sfx', ref = 4, rolloff = 1.15, max = 400, reverb = 0.25, gain = 1 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000; lp.Q.value = 0.6;
    const out = ctx.createGain(); out.gain.value = gain;
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = ref; pan.rolloffFactor = rolloff; pan.maxDistance = max;
    input.connect(lp); lp.connect(out); out.connect(pan); pan.connect(this.bus[bus]);
    const send = ctx.createGain(); send.gain.value = reverb; pan.connect(send); send.connect(this.revIn);
    const e = {
      input, lp, out, pan, send, x: 0, y: 0, z: 0, baseRev: reverb,
      setPos: (x, y, z, smooth = 0) => {
        e.x = x; e.y = y; e.z = z;
        if (pan.positionX) {
          const t = ctx.currentTime;
          if (smooth) { pan.positionX.setTargetAtTime(x, t, smooth); pan.positionY.setTargetAtTime(y, t, smooth); pan.positionZ.setTargetAtTime(z, t, smooth); } else { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; }
        } else pan.setPosition(x, y, z);
      },
      occlude: (vis, smooth = 0.08) => {
        const t = ctx.currentTime, d = Math.hypot(e.x - this.listener.x, e.z - this.listener.z);
        const f = lerp(650, 18000, vis * vis) * lerp(1, 0.35, clamp(d / 250, 0, 1));
        lp.frequency.setTargetAtTime(f, t, smooth);
        send.gain.setTargetAtTime(e.baseRev * (0.6 + clamp(d / 60, 0, 1.6)) * (1.3 - vis * 0.3), t, smooth);
      },
      dispose: () => { try { input.disconnect(); lp.disconnect(); out.disconnect(); pan.disconnect(); send.disconnect(); } catch (er) { /* ignore */ } },
    };
    return e;
  }

  visibility(x, y, z) {
    const l = this.listener;
    if (!this.world) return 1;
    const v = this.world.lineOfSight(l.x, l.y, l.z, x, y, z, { brushK: 0.3 });
    return 0.3 + 0.7 * v;
  }

  // play a buffer; pos = {x,y,z} for positional, otherwise stereo/mono direct
  play(buf, o = {}) {
    if (!this.ready || !buf || !this.ctx) return null;
    const ctx = this.ctx;
    const rangeGain = o.pos && o.range ? distanceGain(Math.hypot(o.pos.x - this.listener.x, o.pos.y - this.listener.y, o.pos.z - this.listener.z), o.range) : 1;
    if (rangeGain === 0) return null;
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = o.rate || 1; src.loop = !!o.loop;
    let h;
    if (o.pos) {
      const e = this.emitter({ bus: o.bus || 'sfx', ref: o.ref || 4, rolloff: o.rolloff ?? 1.15, reverb: o.reverb ?? 0.25, gain: (o.gain ?? 1) * rangeGain });
      e.setPos(o.pos.x, o.pos.y, o.pos.z);
      e.occlude(o.occlude === false ? 1 : this.visibility(o.pos.x, o.pos.y, o.pos.z), 0.001);
      src.connect(e.input);
      h = { src, e, range: o.range, baseGain: o.gain ?? 1 };
    } else {
      const gn = ctx.createGain(); gn.gain.value = o.gain ?? 1;
      let node = src;
      if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; src.connect(p); node = p; }
      node.connect(gn); gn.connect(this.bus[o.bus || 'sfx']);
      if (o.reverb) { const s = ctx.createGain(); s.gain.value = o.reverb; gn.connect(s); s.connect(this.revIn); }
      h = { src, gn };
    }
    h.stop = (fadeT = 0.05) => {
      h.stopping = true;
      try {
        const g = h.e ? h.e.out.gain : h.gn.gain; g.setTargetAtTime(0, ctx.currentTime, fadeT / 3);
        src.stop(ctx.currentTime + fadeT + 0.05);
      } catch (er) { /* already stopped */ }
    };
    src.onended = () => { this.active.delete(h); if (h.e) h.e.dispose(); else try { h.gn.disconnect(); } catch (er) { /* */ } };
    src.start(ctx.currentTime + (o.delay || 0));
    this.active.add(h);
    return h;
  }

  pick(prefix, n, seed) { return this.lib[prefix + (((seed % n) + n) % n)] || this.lib[prefix + '0']; }

  // ---------------------------------------------------------------- listener
  setListener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener, p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = new cam.position.constructor()));
    const up = this._u || (this._u = new cam.position.constructor());
    up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z; this.listener.fx = f.x; this.listener.fz = f.z;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
      L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, up.x, up.y, up.z); }
    // Re-evaluate range for already-playing creature sounds too: walking away
    // should not leave a loud step or skunk call hanging beyond its cutoff.
    for (const h of this.active) {
      if (!h.e || !h.range || h.stopping) continue;
      const e = h.e, t = this.ctx.currentTime;
      const gain = distanceGain(Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z), h.range) * h.baseGain;
      if (gain === 0) { e.out.gain.cancelScheduledValues(t); e.out.gain.setValueAtTime(0, t); }
      else e.out.gain.setTargetAtTime(gain, t, 0.025);
    }
  }

  // ---------------------------------------------------------------- loops (ambience + fear layer)
  _buildLoops() {
    const ctx = this.ctx;
    const loop = (name, bus, gain = 0) => { const h = this.play(this.lib[name], { loop: true, bus, gain }); return h; };
    this.loops.crickets = loop('crickets', 'amb'); this.loops.katydids = loop('katydids', 'amb');
    this.loops.wind = loop('wind', 'amb'); this.loops.river = loop('river', 'amb'); this.loops.traffic = loop('traffic', 'amb');
    // cold wind: band-passed noise whose centre wanders
    const nb = ctx.createBuffer(1, S.SR * 4, S.SR); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 7;
    const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 2600; bp2.Q.value = 11;
    const cg = ctx.createGain(); cg.gain.value = 0;
    ns.connect(bp); ns.connect(bp2); bp.connect(cg); bp2.connect(cg); cg.connect(this.bus.amb); cg.connect(this.revIn);
    ns.start();
    this.cold = { bp, bp2, g: cg };
    // drone: two detuned saws a minor second apart, filtered; plus a glassy high pair
    const dg = ctx.createGain(); dg.gain.value = 0;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 180; dlp.Q.value = 2;
    const oscs = [];
    for (const f of [43.65, 46.25, 87.3]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = f > 80 ? 0.25 : 0.5; o.connect(og); og.connect(dlp); o.start(); oscs.push(o); }
    dlp.connect(dg); dg.connect(this.bus.amb);
    const hg = ctx.createGain(); hg.gain.value = 0;
    for (const f of [1864, 1975]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = 0.5; o.connect(og); og.connect(hg); o.start(); oscs.push(o); }
    hg.connect(this.bus.amb); hg.connect(this.revIn);
    const tin = ctx.createOscillator(); tin.type = 'sine'; tin.frequency.value = 6900; const tg = ctx.createGain(); tg.gain.value = 0; tin.connect(tg); tg.connect(this.master); tin.start();
    this.drone = { g: dg, lp: dlp, high: hg, tin: tg, oscs };
    // objective loops are created on demand
  }

  setLoopGain(h, v, tc = 0.4) { if (h && h.gn) h.gn.gain.setTargetAtTime(v, this.ctx.currentTime, tc); }

  // ---------------------------------------------------------------- per-frame
  // st: {terror, fear, cold, exert, gas, downed, inGame, critical, menu}
  update(dt, st) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, w = this.world, L = this.listener;
    Object.assign(this.state, st);
    const terr = st.terror || 0;
    const cues = horrorCues(terr);
    // the night goes quiet as he gets close: insects first, then everything
    const insects = cues.insects * (st.menu ? 0.6 : 1);
    this.setLoopGain(this.loops.crickets, 0.55 * insects, 0.6);
    this.setLoopGain(this.loops.katydids, 0.32 * insects * (0.7 + 0.3 * Math.sin(t * 0.05)), 0.6);
    const rd = w ? w.riverDistAt(L.x, L.z) : 100;
    this.setLoopGain(this.loops.river, 0.55 * Math.pow(clamp(1 - rd / 75, 0, 1), 2), 0.5);
    this.setLoopGain(this.loops.wind, 0.28 + 0.12 * Math.sin(t * 0.13), 0.8);
    const hw = w?.poi?.highway;
    const hd = hw ? Math.hypot(L.x - hw.x, L.z - hw.z) : 800;
    this.setLoopGain(this.loops.traffic, 0.1 + 0.4 * clamp(1 - hd / 500, 0, 1), 1);
    // fear layer
    const cold = st.cold || 0;
    this.cold.g.gain.setTargetAtTime(0, t, 0.5);
    this.cold.bp.frequency.setTargetAtTime(1500 + 700 * Math.sin(t * 0.37) + 300 * Math.sin(t * 1.1), t, 0.3);
    this.cold.bp2.frequency.setTargetAtTime(2500 + 600 * Math.sin(t * 0.23 + 1), t, 0.3);
    this.drone.g.gain.setTargetAtTime(0.065 * cues.drone, t, 0.8);
    this.drone.lp.frequency.setTargetAtTime(120 + 260 * terr, t, 0.5);
    this.drone.high.gain.setTargetAtTime(0.004 * cues.highTone, t, 1.2);
    this.drone.tin.gain.setTargetAtTime(0.006 * (st.gas || 0), t, 0.6);
    const muffle = Math.max(st.gas || 0, (st.downed || 0) * 0.6);
    this.hear.frequency.setTargetAtTime(lerp(20000, 650, muffle), t, 0.3);
    if (!st.inGame) return;
    // breathing (also drives breath-condensation visuals through onExhale)
    const exert = st.exert || 0, fear = st.fear || 0;
    this.breathT -= dt;
    if (this.breathT <= 0) {
      const mix = S.playerBreathMix(exert, fear, st.downed || 0);
      const k = (Math.random() * S.PLAYER_BREATH_VARIANTS) | 0;
      const name = (this.breathIn ? 'in' : 'out') + (mix.heavy ? 'H' : '') + k;
      this.play(this.lib[name], { bus: 'sfx', gain: mix.gain, rate: mix.rate });
      if (!this.breathIn && this.onExhale) this.onExhale(mix.visualStrength);
      const dur = this.lib[name].duration / mix.rate;
      const gap = this.breathIn ? mix.inhaleGap : mix.exhaleGap;
      this.breathT = (dur + gap) * (0.94 + Math.random() * 0.12);
      this.breathIn = !this.breathIn;
    }
    // heartbeat
    const heart = S.playerHeartbeatMix(exert, st.downed || 0);
    if (heart.gain > 0) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 60 / heart.bpm;
        this.play(this.lib.heart, { bus: 'sfx', gain: heart.gain, rate: heart.rate });
        if (this.onBeat) this.onBeat();
      }
    }
    this._wildlife(dt, terr);
  }

  _randPos(dmin, dmax, h = 2) {
    const L = this.listener, a = Math.random() * Math.PI * 2, d = lerp(dmin, dmax, Math.random());
    const x = L.x + Math.sin(a) * d, z = L.z + Math.cos(a) * d;
    const y = (this.world ? this.world.heightAt(x, z) : 0) + h;
    return { x, y, z };
  }

  _wildlife(dt, terr) {
    const T = this.timers, quiet = horrorCues(terr).quietWildlife;
    for (const k in T) T[k] -= dt * (quiet ? 0.15 : 1);
    if (quiet) return;
    if (T.owl <= 0) { T.owl = 25 + Math.random() * 55; this.play(this.pick('owl', 3, (Math.random() * 9) | 0), { pos: this._randPos(50, 140, 9), gain: 0.55, ref: 12, reverb: 0.5, occlude: false }); }
    if (T.coyote <= 0) { T.coyote = 100 + Math.random() * 140; this.play(this.pick('coyote', 2, (Math.random() * 9) | 0), { pos: this._randPos(220, 420, 2), gain: 0.9, ref: 40, reverb: 0.8, occlude: false }); }
    if (T.train <= 0) { T.train = 260 + Math.random() * 200; this.play(this.lib.train, { pos: this._randPos(900, 1300, 5), gain: 1.2, ref: 300, rolloff: 1, max: 3000, reverb: 0.6, occlude: false }); }
    if (T.creak <= 0) { T.creak = 7 + Math.random() * 16; this.play(this.pick('creak', 3, (Math.random() * 9) | 0), { pos: this._randPos(10, 40, 5), gain: 0.35, ref: 5, reverb: 0.35 }); }
    if (T.snap <= 0) { T.snap = 25 + Math.random() * 45; this.play(this.pick('snap', 3, (Math.random() * 9) | 0), { pos: this._randPos(25, 70, 0.3), gain: 0.4, ref: 6, reverb: 0.4 }); }
    if (T.frog <= 0) {
      T.frog = 5 + Math.random() * 10;
      const w = this.world, L = this.listener;
      if (w && (w.riverDistAt(L.x, L.z) < 60 || w.isWetZone(L.x, L.z))) this.play(this.pick('frog', 3, (Math.random() * 9) | 0), { pos: this._randPos(12, 40, 0.2), gain: 0.4, ref: 5, reverb: 0.3 });
    }
    if (T.dog <= 0) { T.dog = 140 + Math.random() * 160; this.play(this.lib.dog0, { pos: this._randPos(500, 800, 2), gain: 0.6, ref: 60, reverb: 0.7, occlude: false }); }
  }

  // ---------------------------------------------------------------- game sounds
  footstep(info, pos = null) {
    const name = info.water > 0.12 ? 'water' : SURF_NAME[info.surface] || 'dirt';
    const k = (Math.random() * 4) | 0;
    const g = (0.25 + info.loud * 0.55) * (pos ? 1.3 : 0.75);
    const cue = pos ? creatureFootstepCue(info.creature, info.speed) : null;
    const sourceGain = cue ? cue.gain : 1;
    const rate = 0.92 + Math.random() * 0.16;
    if (pos) this.play(this.lib[`fs_${name}${k}`], { pos, gain: g * sourceGain, rate, ref: 3, reverb: cue ? 0.07 : 0.15, range: cue });
    else this.play(this.lib[`fs_${name}${k}`], { gain: g, rate, pan: (this._foot = !this._foot) ? -0.12 : 0.12 });
    if (info.brush > 0.35 && info.speed > 0.6) {
      const b = this.lib[`fs_brush${(Math.random() * 4) | 0}`];
      const bg = clamp((info.brush - 0.3) * 1.2, 0, 1) * (0.25 + info.loud * 0.5);
      if (pos) this.play(b, { pos, gain: bg * 1.3 * sourceGain, rate, ref: 3, ...(cue ? { reverb: 0.07, range: cue } : {}) }); else this.play(b, { gain: bg * 0.7, rate });
    }
  }

  hvVocal(kind, seed, pos) {
    const key = `hv_${kind}_${seed % 5}`;
    if (!this.var[key]) this.var[key] = this.toBuffer(S.hvVocal(HV_KINDS.includes(kind) ? kind : 'giggle', seed % 5 + 1, this.sigPCM));
    const loud = { scream: 2.2, call: 1.6, cry: 1.2, laugh: 1.2, whisper: 0.55, breath: 0.6, inhale: 0.7, hum: 0.8, giggle: 1, fragment: 1.2 }[kind] || 1;
    return this.play(this.var[key], { pos, bus: 'mon', gain: loud, ref: 1.5, reverb: 0.1, range: creatureFootstepCue('hv', 0) });
  }

  signature(pos) { return this.play(this.lib.signature, { pos, bus: 'mon', gain: 1.35, ref: 7, reverb: 0.4 }); }

  sfVocal(kind, seed, pos) {
    const cue = skunkVocalCue(kind);
    if (pos && distanceGain(Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z), cue) === 0) return null;
    const key = `sf_${kind}_${seed % 4}`;
    if (!this.var[key]) this.var[key] = this.toBuffer(S.sfVocal(SF_KINDS.includes(kind) ? kind : 'breath', seed % 4 + 1));
    const loud = { rumble: 2.0, growl: 1.5, warn: 1.4, gas: 1.6, bite: 1.6, chitter: 0.8, breath: 0.6, rustle: 0.9 }[kind] || 1;
    return this.play(this.var[key], { pos, bus: 'mon', gain: loud * cue.gain, ref: kind === 'rumble' ? 5 : 3, reverb: 0.15, range: cue });
  }

  stinger(kind, gain = 0.8) { return this.play(this.lib['st_' + kind], { bus: 'sfx', gain, reverb: 0.3 }); }
  ui(name, gain = 0.6) { return this.play(this.lib[name], { bus: 'ui', gain }); }
  at(name, pos, o = {}) { return this.play(this.lib[name], { pos, ...o }); }

  // looping positional sound owned by the caller (generators, siren, …)
  loopAt(id, name, pos, o = {}) {
    if (this.loops[id]) return this.loops[id];
    const h = this.play(this.lib[name], { pos, loop: true, ...o });
    this.loops[id] = h;
    return h;
  }
  stopLoop(id) { const h = this.loops[id]; if (h) { h.stop(0.5); delete this.loops[id]; } }

  // stop transient game sounds (session end / restart); ambience keeps running
  stopAll() {
    for (const h of [...this.active]) if (!Object.values(this.loops).includes(h)) h.stop(0.2);
    for (const id of ['gen', 'relay', 'siren']) this.stopLoop(id);
  }
}
