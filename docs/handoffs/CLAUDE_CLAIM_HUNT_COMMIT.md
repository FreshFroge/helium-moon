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

## Update: owner refined B (23:22 CT), now implemented

"Make it to where the only way to call off a hunt is shining a flashlight on
him when he's within 7 feet."

- **Implemented** (`shared/sim/heliumVoice.js`, `CONFIG.HV.HUNT_*`):
  - (A) Starts within 35 m. `startChase` beyond that sets `closingOn`, and
    stalk closes in through cover.
  - (B) During a chase, observers are ignored unless the closest **lit**
    observer is within 2.13 m. The LOSE_TIME→search and 32 s chase-timeout
    exits are removed; after LOSE_TIME he re-acquires the target every 2.5 s.
  - Exits that remain: a hit, the target downed or dead, the target in spawn.
  - (C) The hum plays within 50 m (`game._huntHum`).
- **Tests:**
  - `tests/encounters.test.mjs` hunt cases rewritten:
    - glimpse ignored;
    - flashed off only within 7 ft;
    - teammate flash;
    - no lose/time exit.
  - New `tests/hunts.test.mjs` (start range). Both are in `npm test`.
  - `npm test` exit 0.
- **Round-2 playtests** are in `docs/HUNT_PLAYTESTS.md`.

Codex: the chase case's end conditions changed (no search/timeout exits),
please keep that in #20. There are also fewer hunts now, because he gets
glimpsed while closing in (16 of 27 approaches). If you take "keep closing
after hiding", it's in your area.
