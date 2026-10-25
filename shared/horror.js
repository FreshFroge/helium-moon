// Sensory envelopes, shared with regression tests. Cold is the first clue;
// strong audiovisual cues and identifiable creature steps need close proximity.
import { CONFIG } from './config.js';
import { clamp, lerp, smoothstep } from './math.js';

export function terrorAtDistance(distance, rings = CONFIG.TERROR) {
  const d = Math.max(0, distance);
  if (!Number.isFinite(d) || d >= rings.OUTER) return 0;
  if (d >= rings.MIDDLE) return lerp(0, 0.3, (rings.OUTER - d) / (rings.OUTER - rings.MIDDLE));
  if (d >= rings.INNER) return lerp(0.3, 0.6, (rings.MIDDLE - d) / (rings.MIDDLE - rings.INNER));
  if (d >= rings.CRITICAL) return lerp(0.6, 0.88, (rings.INNER - d) / (rings.INNER - rings.CRITICAL));
  return lerp(0.88, 1, (rings.CRITICAL - d) / rings.CRITICAL);
}

export function horrorCues(terror) {
  const tr = clamp(terror, 0, 1);
  return {
    cold: smoothstep(0.0, 0.6, tr) * 0.6,
    // The freezing aura is the sole proximity warning. Actual close-range
    // footsteps and direct encounters still make their own physical sounds.
    insects: 1, quietWildlife: false,
    drone: 0, highTone: 0, heartbeat: 0, tremor: 0, flicker: 0, anomaly: false,
  };
}

// Web Audio's inverse-distance PannerNode never reaches silence at maxDistance.
// Apply this separate envelope to the source gain (including its reverb send).
export function distanceGain(distance, { fadeStart, maxDistance }) {
  if (!Number.isFinite(distance) || distance >= maxDistance) return 0;
  return 1 - smoothstep(fadeStart, maxDistance, Math.max(0, distance));
}

export function creatureFootstepCue(creature, speed) {
  if (creature === 'hv') {
    const C = CONFIG.HV;
    return { fadeStart: C.FOOTSTEP_FADE_START, maxDistance: C.FOOTSTEP_MAX_DISTANCE,
      gain: speed >= C.CHASE * 0.8 ? C.FOOTSTEP_CHASE_GAIN : C.FOOTSTEP_STALK_GAIN };
  }
  if (creature === 'sf') {
    const C = CONFIG.SF;
    return { fadeStart: C.FOOTSTEP_FADE_START, maxDistance: C.FOOTSTEP_MAX_DISTANCE, gain: C.FOOTSTEP_GAIN };
  }
  return null; // local and teammate footsteps retain their normal mix
}

export function skunkVocalCue(kind) {
  const C = CONFIG.SF;
  const danger = ['growl', 'warn', 'gas', 'bite'].includes(kind);
  return danger
    ? { fadeStart: C.DANGER_FADE_START, maxDistance: C.DANGER_MAX_DISTANCE, gain: 1 }
    : { fadeStart: C.VOCAL_FADE_START, maxDistance: C.VOCAL_MAX_DISTANCE, gain: C.VOCAL_GAIN };
}
