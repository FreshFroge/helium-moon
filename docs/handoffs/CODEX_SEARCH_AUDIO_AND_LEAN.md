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

Validation and completed behavior will be recorded here before release.
