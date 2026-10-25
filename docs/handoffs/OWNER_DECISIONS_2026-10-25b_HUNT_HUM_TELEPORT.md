# Owner decision (October 25, 2026, ~03:51 UTC), relayed by Claude: hunt hum + teleport

Owner's words: "I also want to add Hereditary-like scaring methods, like a very
deep bass tone or hum, as a method of scaring the player, maybe specifically
during Helium Voice hunts. If allowing Helium Voice to teleport would make it
scarier, also do that."

## 1. Hunt hum: DONE (Claude, `4556126`)

`client/audio/audio.js` adds a `huntHum` layer, and `game.js` passes
`hunt` / `huntNear` into `audio.update`.
- **Sound:** 31/33 Hz sines that beat at 2 Hz, plus 62/93 Hz harmonics for small
  speakers, a sub-rumble, and a slow 0.11 Hz swell.
- **Timing:** active only while the director's `chase` event is on. Builds over
  ~3 s, then cuts in 0.25 s when the hunt ends; the sudden silence is part of
  the scare. The filter opens as he comes within 40 m.

Codex: if you add other "hunt" states (e.g. a committed search after losing
the player), emit `chase` on/off for them, or tell me and I'll key the hum
off a new event.

## 2. Teleport: Codex, `shared/sim/heliumVoice.js` (your claimed file)

Recommendation: yes, but **only as unseen relocation**. A visible blink
would read as a game effect and undercut creature accuracy (owner priority 4).
The scare comes from the result:
- he was behind you, and now he's standing ahead on the trail;
- you lose him in a chase and his breathing is suddenly to your left.

Rules, so it stays fair and consistent with earlier owner decisions:
1. **Never while anyone has him on screen**, at either end. Both the departure
   point and the arrival spot must fail `onScreen` / LOS for every living
   player at the moment of the jump. Reuse the concealment checks.
2. **Never during dread** (`director.inDread()`), never into or across the spawn
   zone (`inSpawnZone(w, x, z, margin)`), and never within ~12 m of a player,
   so it doesn't become an unavoidable instant hit.
3. **Uses:**
   - (a) **cut-off**: during a hunt, after LOS has been broken for ≥ 4 s,
     relocate 35–60 m ahead of the hunted player along the trail, in cover,
     facing the trail, then resume the chase or stalk;
   - (b) **flank**: after a failed search, reappear on the opposite side of
     the player, 25–40 m out, out of sight;
   - (c) **escalation**: the frequency scales with `director.escalation()`.
     Suggested cooldown 150 s at 0, down to 60 s at full; at most one per
     hunt.
4. **Tells:** the hum (above) keeps going across the jump. Optionally his
   breathing or footsteps stop briefly at the old position (the `snap` event
   is suppressed by design). No visual effect.
5. **Server-authoritative:** emit `{type:'hv_relocate', x, z}` for tests and
   pacing. The client must not show anything special. Snap buffers should
   treat it as a discontinuity, so interpolation doesn't draw a 50 m slide;
   please also reset `SnapBuffer` on large jumps in `client/entities/views.js`.
   That file is free, so I can do it if you prefer.
6. **Tests:**
   - Node: a relocation never happens with him on screen, never in dread or
     spawn, and never within 12 m;
   - pacing: count relocations per session. I'll add `hv_relocate` to
     `tests/pacing.test.mjs` once the event name is final.

## Also, Codex: `browser_reveals.py` is flaky here

Line 55 waits only 15 s of real time for `#intro` to fade, which is a
7.5 s `setTimeout` plus a CSS transition. On this machine it fails on a
**clean** tree in 3 of 4 runs, because SwiftShader starves the main thread.
Suggestion: hide or skip `#intro` deterministically in the fixture, or raise
the timeout to 60 s.

## Update, Oct 25 ~11:00 UTC: Claude is implementing the teleport

Codex has been offline since ~02:50 UTC, so per the usage protocol Claude is
taking part 2. Claude's files for this:
- `shared/sim/heliumVoice.js`: a new `tryRelocate()` and its two trigger points,
  the chase cut-off and getting ahead while closing in;
- `shared/config.js`: new `HV.RELOCATE_*` keys;
- a new `tests/relocate.test.mjs`.

The client side (snapshot jump → snap) is already in from `4571318`.
