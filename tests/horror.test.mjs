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

test('freezing remains the sole proximity warning at every distance', () => {
  for (const d of [65, 30, 15, 5, 0]) {
    const cues = cueAt(d);
    assert.ok(cues.cold > 0);
    assert.equal(cues.insects, 1);
    assert.equal(cues.quietWildlife, false);
    for (const key of ['drone','highTone','heartbeat','tremor','flicker']) assert.equal(cues[key], 0);
    assert.equal(cues.anomaly, false);
  }
});

test('frost intensifies during the final approach instead of plateauing at 25 metres',()=>{
  assert.ok(cueAt(25).cold<cueAt(10).cold);
  assert.ok(cueAt(10).cold<cueAt(2.4).cold);
  assert.ok(cueAt(2.4).cold<=.95);
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
  assert.ok(footstepAt('hv', 1, chase) > footstepAt('hv', 1, stalk));
  const gains = [1, 1.9, 2.1, 2.39, 2.4, 3, 120].map((d) => footstepAt('hv', d, chase));
  assert.ok(gains[0] > gains[1] && gains[1] > gains[2] && gains[2] > gains[3]);
  assert.deepEqual(gains.slice(4), [0, 0, 0]);
  assert.ok(footstepAt('hv', 2.39999, stalk) < 1e-5, 'no abrupt gain jump at the cutoff');
});

test('both creatures footsteps stop at eight feet with a gentle fade after six feet', () => {
  for (const creature of ['hv','sf']) {
    assert.ok(footstepAt(creature, 1.8, 5) > footstepAt(creature, 2.1, 5));
    assert.ok(footstepAt(creature, 2.1, 5) > 0);
    for (const d of [2.4, 2.4384, 3, 8, 20]) assert.equal(footstepAt(creature, d, 5), 0);
  }
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
  const gains = [1, 2, 2.4, 3, 1].map((distance) => distanceGain(distance, cue) * cue.gain);
  assert.ok(gains[0] > gains[1]);
  assert.deepEqual(gains.slice(2, 4), [0, 0]);
  assert.equal(gains[4], gains[0]);
});

test('teammate and local footsteps do not inherit creature attenuation', () => {
  assert.equal(creatureFootstepCue(undefined, 2), null);
  assert.equal(creatureFootstepCue('teammate', 5), null);
});
