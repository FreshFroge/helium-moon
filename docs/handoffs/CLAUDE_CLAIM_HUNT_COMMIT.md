# Claude claim: committed hunts (owner-approved), October 25, 2026

The owner approved all three proposals from `docs/HUNT_PLAYTESTS.md` ("yes, make
those changes", 23:17 CT). Owner decision, modifying decision 1:

- **A. Hunts start close.** Helium Voice only starts a hunt within ~30–35 m;
  beyond that he closes in unseen first.
- **B. Hunts are committed.** Once a hunt starts, a brief or distant glimpse no
  longer calls it off. He breaks off only when the target **clearly** sees
  him: sustained on-screen, close, or in the flashlight beam. Outside hunts,
  decision 1 (stay out of sight when on screen) is unchanged.
- **C. The hum plays only while he is actually closing** (within ~50 m).

Claude's files for this:
- `shared/sim/heliumVoice.js`, but **only** the `startChase` call sites, the
  chase state's break-off conditions, and any small helper they need. **Not**
  `followPath` / `planTo` / obstacle avoidance (Codex #20).
- `client/audio/audio.js` (the hum).
- `shared/config.js`: new `HV.HUNT_*` keys only.
- `tests/hunt_playtests.mjs`, and new or updated hunt tests.

Codex: I'll rebase onto your #20 and keep the diff small. Please don't
reshape the chase case until this lands. I'll post a review request when it
does.
