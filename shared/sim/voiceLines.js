// Helium Voice's spoken lines: his real recordings plus lines cloned from his voice
// (assets/audio/hv_voice/). Selection follows Codex's voice direction
// (docs/SCARE_RESEARCH_CODEX.md):
//  - lines are chosen server-side from an AI event and sent as a line id, so every
//    player hears the same act;
//  - never because a distance threshold was crossed;
//  - 18-30 s between ordinary lines, no line twice in a row, least-recently-used first;
//  - attack lines may bypass the cooldown, but only on actual damage.
// Uses its own random stream so his movement/attack decisions are unchanged.
import { makeRng } from '../math.js';

// context -> candidate line ids (file names without .ogg)
export const VOICE_CONTEXTS = {
  hunt_start: ['gen_there_you_are', 'gen_i_can_see_you'],
  hit: ['gen_found_you', 'gen_got_you', 'gen_hold_still'],
  watched: ['gen_i_can_see_you', 'gen_hey', 'rec_you_know'],
  lost_target: ['gen_where_are_you', 'gen_are_you_still_there', 'gen_hello', 'gen_was_that_you', 'rec_anyone_recording'],
  heard: ['gen_i_heard_you', 'gen_was_that_you'],
  left_behind: ['gen_dont_leave', 'gen_come_back', 'gen_you_left_me', 'gen_wait'],
  flashed_off: ['gen_too_slow'],
  repeated_counter: ['gen_again'],
  chatter: ['rec_you_know', 'rec_got_a_wire', 'rec_you_got_a_point', 'rec_dont_care', 'rec_no_you_cant', 'rec_okay_ace', 'rec_i_can_tell'],
};
// how often each context actually speaks (the rest stay silent: silence is the default)
// owner (Oct 25 midday): "he isn't talking" -> he speaks far more often now
export const VOICE_CHANCE = { hunt_start: 0.6, hit: 0.7, watched: 0.55, lost_target: 0.75, heard: 0.6, left_behind: 0.5, flashed_off: 0.6, repeated_counter: 0.8, chatter: 0.7 };
export const VOICE_COOLDOWN = [9, 16];
export const VOICE_REUSE = 100;       // s before the same line may be used again

export class VoiceLines {
  constructor(sim) {
    this.sim = sim; this.rng = makeRng((sim.seed ^ 0x7a11ce5) >>> 0);
    this.nextOk = 0; this.last = null; this.used = new Map();
  }

  // returns the line id spoken (and emits it), or null
  say(context, at, { force = false } = {}) {
    const sim = this.sim, r = this.rng, t = sim.time;
    if (!force && t < this.nextOk) return null;
    if (r() > (VOICE_CHANCE[context] ?? 0)) return null;
    const cands = (VOICE_CONTEXTS[context] || []).filter((id) => id !== this.last && t - (this.used.get(id) ?? -1e9) >= VOICE_REUSE);
    if (!cands.length) return null;
    cands.sort((a, b) => (this.used.get(a) ?? -1e9) - (this.used.get(b) ?? -1e9));   // least recently used first
    const id = cands[Math.min(cands.length - 1, Math.floor(r() * Math.min(2, cands.length)))];
    this.used.set(id, t); this.last = id;
    this.nextOk = t + r.range(VOICE_COOLDOWN[0], VOICE_COOLDOWN[1]);
    sim.emit({ type: 'hv_line', id, ctx: context, x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2) });
    return id;
  }
}
