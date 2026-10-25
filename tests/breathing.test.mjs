// Render the actual player breath signals and exercise their playback mix.
// node tests/breathing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { breath, playerBreath, playerBreathMix, PLAYER_BREATH_VARIANTS, SR } from '../client/audio/synth.js';
import { filter } from '../client/audio/dsp.js';

const rms = (signal) => Math.sqrt(signal.reduce((sum, x) => sum + x * x, 0) / signal.length);
const peak = (signal) => signal.reduce((max, x) => Math.max(max, Math.abs(x)), 0);

test('player breaths are finite, quietly peaked, and fade gently at both ends', () => {
  for (let seed = 200; seed < 200 + PLAYER_BREATH_VARIANTS; seed++) {
    for (const inhale of [false, true]) for (const heavy of [false, true]) {
      const signal = playerBreath(seed, inhale, heavy);
      assert.ok(signal.every(Number.isFinite));
      assert.ok(rms(signal) > 0.02 && rms(signal) < 0.12, 'real airflow without a loud normalized hiss');
      assert.ok(peak(signal) <= (heavy ? 0.401 : 0.271));
      const edge = Math.floor(SR * 0.02), fullRms = rms(signal);
      assert.ok(rms(signal.slice(0, edge)) < fullRms * 0.1, 'soft onset');
      assert.ok(rms(signal.slice(-edge)) < fullRms * 0.1, 'soft release');
      assert.equal(Math.abs(signal[0]), 0);
      assert.equal(Math.abs(signal.at(-1)), 0);
    }
  }
});

test('player airflow has little high-frequency hiss and less energy than the former breath', () => {
  for (const inhale of [true, false]) {
    const signal = playerBreath(200, inhale, false);
    const high = filter(signal.slice(), 'hp', 3500, 0.7, SR);
    assert.ok(rms(high) ** 2 / rms(signal) ** 2 < 0.04, 'energy above 3.5 kHz stays low');
    assert.ok(rms(signal) < rms(breath(200, inhale, false)) * 0.6);
  }
});

test('inhale/exhale duration and airflow vary instead of repeating an identical mechanical pulse', () => {
  const lengths = new Set();
  for (let seed = 200; seed < 200 + PLAYER_BREATH_VARIANTS; seed++) {
    const inhale = playerBreath(seed, true, false), exhale = playerBreath(seed, false, false);
    lengths.add(inhale.length);
    assert.ok(exhale.length > inhale.length, 'exhaling takes longer than inhaling');
    assert.ok(playerBreath(seed, true, true).length < inhale.length, 'exertion shortens the breath naturally');
    assert.ok(rms(inhale.slice(0, inhale.length / 2)) > rms(inhale.slice(inhale.length / 2)), 'asymmetric airflow swell');
  }
  assert.ok(lengths.size >= 4);
});

test('resting and fear-only breathing remain quiet; fatigue still produces audible exertion', () => {
  const rest = playerBreathMix(0, 0), afraid = playerBreathMix(0, 1), tired = playerBreathMix(1, 0.5);
  assert.ok(afraid.gain < 0.025 && afraid.gain < rest.gain * 2);
  assert.equal(afraid.heavy, false, 'nearby danger alone does not produce heavy panting');
  assert.ok(tired.gain > rest.gain * 8 && tired.gain < 0.22);
  assert.equal(tired.heavy, true);
  const restingOutput = rms(playerBreath(200, true, false)) * rest.gain;
  const exertedOutput = rms(playerBreath(200, true, true)) * tired.gain;
  assert.ok(restingOutput < 0.0015);
  assert.ok(exertedOutput > restingOutput * 8 && exertedOutput < 0.025);
});

test('recovering breathing settles smoothly without changing the cold exhale strength', () => {
  let lastGain = 1;
  for (let exert = 1; exert >= 0; exert -= 0.05) {
    const mix = playerBreathMix(exert, 0);
    assert.ok(mix.gain <= lastGain);
    lastGain = mix.gain;
  }
  assert.equal(playerBreathMix(0.3, 0).gain, playerBreathMix(0, 0).gain, 'ordinary walking stays quiet');
  const scared = playerBreathMix(0, 1);
  assert.ok(scared.visualStrength > scared.gain * 10, 'visual condensation is independent of audible gain');
  assert.equal(playerBreathMix(1, 1, 1).visualStrength, 1);
});
