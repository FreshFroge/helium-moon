// Distance/cue regressions for the envelopes the real client and audio engine use.
// node tests/horror.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../shared/config.js';
import { terrorAtDistance, horrorCues, distanceGain, creatureFootstepCue, skunkVocalCue } from '../shared/horror.js';

const cueAt = (meters) => horrorCues(terrorAtDistance(meters));
const footstepAt = (creature, meters, speed) => {
  const cue = creatureFootstepCue(creature, speed);
  return cue.gain * distanceGain(meters, cue);
};

test('outside the shortened terror range there is no proximity signal', () => {
  for (const d of [80, 90, 120, 1000, Infinity, NaN]) {
    assert.equal(terrorAtDistance(d), 0);
    assert.equal(cueAt(d).cold, 0);
  }
});

test('outer-range proximity suggests cold without a stack of precise alarms', () => {
  const c = cueAt(65);
  assert.ok(c.cold > 0 && c.cold < 0.2);
  assert.equal(c.insects, 1);
  assert.equal(c.quietWildlife, false);
  for (const key of ['drone', 'highTone', 'heartbeat', 'tremor', 'flicker']) assert.equal(c[key], 0, key);
  assert.equal(c.anomaly, false);
});

test('strong cues remain absent at 30 m and are available when danger is close', () => {
  const middle = cueAt(30), close = cueAt(5);
  for (const key of ['drone', 'highTone', 'heartbeat', 'tremor', 'flicker']) {
    assert.equal(middle[key], 0, key + ' should not track a distant creature');
    assert.ok(close[key] > 0, key + ' should still work at close range');
  }
  assert.equal(middle.anomaly, false);
  assert.equal(close.anomaly, true);
  assert.ok(close.insects >= 0.15 && close.insects < middle.insects);
});

test('terror rises continuously across every configurable ring boundary', () => {
  let previous = 0;
  for (let d = 100; d >= 0; d -= 0.25) {
    const t = terrorAtDistance(d);
    assert.ok(t >= previous && t <= 1, 'moving closer never reduces terror');
    previous = t;
  }
  for (const d of [CONFIG.TERROR.OUTER, CONFIG.TERROR.MIDDLE, CONFIG.TERROR.INNER, CONFIG.TERROR.CRITICAL]) {
    assert.ok(Math.abs(terrorAtDistance(d - 1e-5) - terrorAtDistance(d + 1e-5)) < 1e-5, 'boundary at ' + d);
  }
  const rings = { OUTER: 40, MIDDLE: 20, INNER: 10, CRITICAL: 5 };
  assert.equal(terrorAtDistance(40, rings), 0);
  assert.equal(terrorAtDistance(20, rings), 0.3);
  assert.equal(terrorAtDistance(0, rings), 1);
});

test('Helium Voice steps fade smoothly, stalking is quieter, and distance truly mutes', () => {
  const stalk = CONFIG.HV.STALK, chase = CONFIG.HV.CHASE;
  assert.ok(footstepAt('hv', 3, chase) > footstepAt('hv', 3, stalk));
  const gains = [3, 9, 15, 21, 22, 35, 120].map((d) => footstepAt('hv', d, chase));
  assert.ok(gains[0] > gains[1] && gains[1] > gains[2] && gains[2] > gains[3]);
  assert.deepEqual(gains.slice(4), [0, 0, 0]);
  assert.ok(footstepAt('hv', 21.99, stalk) < 1e-5, 'no abrupt gain jump at the cutoff');
});

test('skunk footsteps remain local to the undergrowth instead of broadcasting position', () => {
  assert.ok(footstepAt('sf', 2, 2) > footstepAt('sf', 8, 2));
  assert.ok(footstepAt('sf', 8, 2) > 0);
  assert.equal(footstepAt('sf', 12, 2), 0);
  assert.equal(footstepAt('sf', 20, 2), 0);
  assert.ok(footstepAt('hv', 20, CONFIG.HV.CHASE) > 0, 'creatures have independent ranges');
});

test('quiet skunk cues are shorter-range while imminent gas/attack warnings stay readable', () => {
  for (const kind of ['rumble', 'chitter', 'breath', 'rustle']) {
    const c = skunkVocalCue(kind);
    assert.ok(distanceGain(8, c) * c.gain > 0);
    assert.equal(distanceGain(18, c), 0);
    assert.equal(distanceGain(22, c), 0);
  }
  for (const kind of ['growl', 'warn', 'gas', 'bite']) {
    const c = skunkVocalCue(kind);
    assert.equal(distanceGain(5, c) * c.gain, 1);
    assert.ok(distanceGain(20, c) > 0);
    assert.equal(distanceGain(26, c), 0);
  }
});

test('moving listener gain reaches actual zero independently of the panner distance model', () => {
  const cue = creatureFootstepCue('hv', CONFIG.HV.CHASE);
  const gains = [10, 18, 22, 30, 10].map((distance) => distanceGain(distance, cue) * cue.gain);
  assert.ok(gains[0] > gains[1]);
  assert.deepEqual(gains.slice(2, 4), [0, 0]);
  assert.equal(gains[4], gains[0]);
});

test('teammate and local footsteps do not inherit creature attenuation', () => {
  assert.equal(creatureFootstepCue(undefined, 2), null);
  assert.equal(creatureFootstepCue('teammate', 5), null);
});
