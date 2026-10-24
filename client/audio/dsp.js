// Small offline DSP toolkit used to synthesise every sound in the game into
// AudioBuffers (no audio files except the user's own recording).
import { makeRng } from '../../shared/math.js';

export class Biquad {
  constructor(type, freq, q, sr, gainDb = 0) { this.sr = sr; this.set(type, freq, q, gainDb); this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, freq, q, gainDb = 0) {
    const w = 2 * Math.PI * Math.min(freq, this.sr * 0.49) / this.sr, cw = Math.cos(w), sw = Math.sin(w), a = sw / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + a; a1 = -2 * cw; a2 = 1 - a; break;
      case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + a; a1 = -2 * cw; a2 = 1 - a; break;
      case 'bp': b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * cw; a2 = 1 - a; break;
      case 'peak': b0 = 1 + a * A; b1 = -2 * cw; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * cw; a2 = 1 - a / A; break;
      default: b0 = 1; b1 = 0; b2 = 0; a0 = 1; a1 = 0; a2 = 0;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  run(buf) { for (let i = 0; i < buf.length; i++) buf[i] = this.tick(buf[i]); return buf; }
}

export function filter(buf, type, freq, q, sr, gainDb) { return new Biquad(type, freq, q, sr, gainDb).run(buf); }

export function noise(n, rng) { const b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = rng() * 2 - 1; return b; }

export function brown(n, rng) { const b = new Float32Array(n); let v = 0; for (let i = 0; i < n; i++) { v = (v + (rng() * 2 - 1) * 0.02) * 0.998; b[i] = v * 6; } return b; }

export function normalize(buf, peak = 0.9) {
  let m = 1e-9; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  const k = peak / m; for (let i = 0; i < buf.length; i++) buf[i] *= k; return buf;
}

export function fade(buf, sr, inS = 0.01, outS = 0.05) {
  const a = Math.floor(inS * sr), b = Math.floor(outS * sr), n = buf.length;
  for (let i = 0; i < a && i < n; i++) buf[i] *= i / a;
  for (let i = 0; i < b && i < n; i++) buf[n - 1 - i] *= i / b;
  return buf;
}

export function softclip(buf, drive = 2) { const k = Math.tanh(drive); for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * drive) / k; return buf; }

export function mixInto(dst, src, at, gain = 1) { for (let i = 0; i < src.length && at + i < dst.length; i++) if (at + i >= 0) dst[at + i] += src[i] * gain; return dst; }

// Vowel formant table (adult-ish, scaled up for the helium timbre by the caller)
export const VOWELS = {
  a: [800, 1150, 2900, 3900], e: [400, 1600, 2700, 3300], i: [300, 2300, 3000, 3700], o: [450, 800, 2830, 3800], u: [325, 700, 2700, 3800], m: [250, 1100, 2400, 3300],
};

// Formant voice: pitch contour f0(t), vowel sequence, breathiness, amplitude envelope
export function voice(sr, dur, { f0, vowel, breath = 0.15, env, formantShift = 1.25, jitter = 0.015, rng, whisper = false }) {
  const n = Math.floor(dur * sr);
  const src = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f0(t) * (1 + (rng() - 0.5) * jitter);
    ph += f / sr; if (ph >= 1) ph -= 1;
    const pulse = whisper ? 0 : (ph < 0.4 ? Math.sin(Math.PI * ph / 0.4) ** 2 : 0) - 0.25;   // Rosenberg-like glottal pulse
    src[i] = pulse + (rng() * 2 - 1) * (whisper ? 1 : breath);
  }
  const out = new Float32Array(n);
  const bands = [new Biquad('bp', 500, 8, sr), new Biquad('bp', 1500, 10, sr), new Biquad('bp', 2800, 12, sr), new Biquad('bp', 3800, 12, sr)];
  const gains = [1, 0.6, 0.3, 0.15];
  const blk = 128;
  for (let i = 0; i < n; i += blk) {
    const t = i / sr;
    const v = vowel(t);
    for (let k = 0; k < 4; k++) bands[k].set('bp', v[k] * formantShift, 6 + k * 3, 0);
    for (let j = i; j < Math.min(n, i + blk); j++) {
      let s = 0; for (let k = 0; k < 4; k++) s += bands[k].tick(src[j]) * gains[k];
      out[j] = s * env(j / sr);
    }
  }
  return out;
}

export function lerpVowel(a, b, t) { return a.map((x, i) => x + (b[i] - x) * t); }

// Granular pitch shifter that keeps duration (two crossfaded read heads).
export function pitchShift(input, ratio, sr, grainMs = 60) {
  const n = input.length, out = new Float32Array(n);
  const G = Math.floor(grainMs / 1000 * sr);
  const hann = (x) => 0.5 - 0.5 * Math.cos(2 * Math.PI * x);
  // delay-line style: read pointer advances at `ratio`, resets every grain; two heads offset by half a grain
  for (let h = 0; h < 2; h++) {
    const off = h * (G >> 1);
    for (let i = 0; i < n; i++) {
      const k = (i + off) % G;            // position inside the grain
      const start = i - k;                // grain start (output time)
      const src = start + k * ratio;      // read position
      const s0 = Math.floor(src), fr = src - s0;
      const a = s0 >= 0 && s0 < n ? input[s0] : 0, b = s0 + 1 >= 0 && s0 + 1 < n ? input[s0 + 1] : 0;
      out[i] += (a + (b - a) * fr) * hann(k / G);
    }
  }
  return out;
}

export function resample(input, ratio) {
  const n = Math.floor(input.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const s = i * ratio, s0 = Math.floor(s), fr = s - s0; out[i] = (input[s0] || 0) + ((input[s0 + 1] || 0) - (input[s0] || 0)) * fr; }
  return out;
}

export function reverse(buf) { const o = new Float32Array(buf.length); for (let i = 0; i < buf.length; i++) o[i] = buf[buf.length - 1 - i]; return o; }

export function rngFor(seed) { return makeRng(seed >>> 0); }

// Exponentially decaying stereo noise impulse response for a damp forest / hollow
export function impulse(sr, dur, decay, rng, tone = 3500) {
  const n = Math.floor(dur * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { const e = Math.pow(1 - i / n, decay); L[i] = (rng() * 2 - 1) * e; R[i] = (rng() * 2 - 1) * e; }
  filter(L, 'lp', tone, 0.7, sr); filter(R, 'lp', tone, 0.7, sr);
  // early reflections from trunks
  for (let k = 0; k < 14; k++) { const t = Math.floor(rng() * 0.12 * sr) + 200; const g = 0.5 * (1 - k / 14); L[t] += g * (rng() - 0.5); R[t + 37] += g * (rng() - 0.5); }
  return [L, R];
}
