# Search movement sounds and working lean — Codex active claim

Owner request (October 26, 2026): Helium Voice should make cracking/popping
sounds as he moves during a search so players can judge his direction and
distance; repair the lean mechanic.

Baseline: `4afb0cd`. No newer shared-branch changes were found on fetch.
The latest existing Claude director handoff and Kimi validation notes were
read; this work preserves their current gameplay and test contributions.

Reserved until this handoff is completed:

- Codex: `shared/sim/heliumVoice.js`, `shared/config.js`, `shared/horror.js`,
  `client/audio/audio.js`, `client/audio/synth.js`, `client/game/game.js`, and
  focused new search-audio/browser tests.
- Codex lean subtask: `client/core/input.js`, `client/game/player.js`,
  `shared/physics.js`, lean-related perception/UI/control instructions and
  focused lean tests. No concurrent edits to audio, game orchestration or AI.

Plan: movement-triggered positional joint sounds in the searching phase,
with restrained cadence, distance attenuation and occlusion. Keep footsteps,
voice removal, hunt timing and the post-grab escape unchanged. Reproduce lean
input/camera/collision faults and validate real browser controls and perception.

GitHub issue/comment access was unavailable in the preceding sessions;
issue ownership remains pending. This Git-published reservation is the shared
coordination record, not evidence that Claude or Kimi has read it.

Implementation complete: searching emits varied joint creak/cracks only after
actual movement, with an independent sound RNG and a 1.4–2.3 second minimum
cadence. Sounds originate at his body, pan with HRTF, fade through 4–18 metres
and are muffled by cover. Standing, blocked motion, grabs, attack rushes and
relocations do not emit this cue. Footstep limits remain 1.8–2.4 metres.

Lean now reaches 42 cm, banks with the peek, sweeps camera clearance and keeps
requested leaning separate from collision-limited pose. Hold Q/R; release
to centre. Collision-limited pose is replicated for authoritative perception.

Checks completed: `npm test` (Node 24.19.0) passes, including five new search
audio regressions and expanded camera/perception checks. Actual Chromium
`tests/browser_lean.py` passes: a 32.65 cm trunk blocks the old 28 cm peek,
but both new peeks reveal LOS 0.6575; capsule movement and authority eye error
are zero. Release and dual Q/R centre correctly. Screenshots were inspected
at `/tmp/helium-lean/`. This is a controlled fixture, not human playtest evidence.

`tests/browser_search_audio.py` is added; real/offline audio verification is
still running at this checkpoint and will be recorded before task completion.
Lean reservations are released. AI/config ownership continues under
`CODEX_POST_CHASE_PACING.md` for the owner's newest pacing addition.
