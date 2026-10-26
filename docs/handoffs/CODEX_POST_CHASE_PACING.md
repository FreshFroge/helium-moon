# Post-chase withdrawal and brief scares — implemented by Codex

Owner addition, October 26, 2026 (America/Chicago): after a chase Helium Voice
must physically travel 200 metres away and cannot chase again for about four
minutes. Reveals should last 1–2 seconds. Between chases he should use alternate
scares, including following behind unseen and fleeing fast when spotted.

Codex reserves `shared/sim/heliumVoice.js`, `shared/sim/director.js`,
`shared/config.js`, `shared/sim/dev.js`, affected hunt/attack/reveal tests and focused new withdrawal
coverage. The earlier search-audio changes in these files must be preserved.
No map/model/other-enemy changes are planned.

Implementation: an end-based 240-second hard gate on every chase entry path;
persistent physical withdrawal after every hunt outcome, including concealed
timeout; short sightings and non-attacking shadow-follow encounters during
the cooldown after withdrawal. Keep the immediate fast post-grab escape and
use physical travel without teleporting to satisfy the withdrawal.

## Result

- Every hunt ending, including a grab, removed target and concealed timeout,
  starts withdrawal. Reaching the first cover or waiting 14 seconds cannot
  cancel it. Helium must physically reach at least 200 metres from the ending
  position and original target. Other teammates influence exit choice without
  requiring an impossible global 200-metre exclusion around spread-out players.
- He flees fast while exposed, then walks at 2.3 m/s in concealment. The actual
  path follower handles trees and the existing spawn/water restrictions. Hidden
  placement, relocation and developer relocation cannot substitute for travel.
- A separate hard 240 gameplay-second cooldown begins at the hunt END. Close
  aggression, extraction, other players, state changes and developer hunt tools
  cannot bypass it. Withdrawal must also finish before a new hunt can begin.
- A shared 1–2 second visible-scare deadline prevents watch/freeze/reveal/lie
  transitions or a quick look away from restarting a long staring pose. After
  the deadline he flees fast rather than backing slowly while watched.
- Watcher, crossing and shadow scares rotate without repeating the last two
  kinds. The shadow follows behind the current view at 12–22 m for 18–32 s;
  spotting it prompts a fast escape after a short registration beat. It does
  not resume the removed close circling or attack through the hard cooldown.

## Validation

- `node tests/post_chase.test.mjs`: eight passes, covering endings, actual
  movement, all chase/relocation bypasses, interrupted withdrawal, exposure
  limits and shadow following/discovery. The new file is in `npm test`.
- Existing attack (25), hunt-search (6), presence (4), developer (5), reveal
  (11), hiding (11) and encounter (11) checks pass. Old expectations of limp
  post-hunt collapse, long exposure and slow watched quick retreats were updated
  to the owner's new behavior. Initial full-suite attempts exposed those stale
  expectations; no passing result is claimed for those attempts.
- `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium python3 tests/browser_post_chase.py`:
  actual refuge withdrawal reaches 200.053 m from the ending position and
  209.201 m from the target in 80.1 gameplay seconds, with 216.716 m of physical
  route travel. Maximum step 0.525 m at 20 Hz; rounded snapshot rig-position
  error <0.008 m. Every restart attempt during withdrawal is rejected and the
  separate cooldown remains 240 seconds.
- `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium HM_ARTIFACT_DIR=/tmp/helium-short-reveals python3 tests/browser_reveals.py`:
  actual watcher/crossing appearances begin fast escape after 1.4/1.8 s.
  A shadow outside the real view flees 0.15 s after turning/discovery without
  chasing or damaging the player. The shadow destination is held for this
  discovery fixture; navigation is verified separately. Screenshots are outside
  Git. These are controlled browser checks, not an unassisted human playthrough.
- Search-sound and Q/R lean browser evidence is in
  `CODEX_SEARCH_AUDIO_AND_LEAN.md`; those implementations are preserved.

- Final `npm test`: PASS on Node 24.19.0 after the expectation updates, including
  search audio, collision/perception, all gameplay/navigation/objectives,
  animation, simulation performance, multiplayer server, ICE and spawn-zone
  checks. Full log: `/tmp/helium-final-full-tests.log`. No build step is configured;
  the browser checks load the real client directly from the Node server.

Production claims are released with the final commit. This Git handoff is the coordination channel;
receipt by Claude/Kimi or an automatic wake-up is not assumed.
