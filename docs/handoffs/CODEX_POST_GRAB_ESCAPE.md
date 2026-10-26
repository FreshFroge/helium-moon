# Post-grab chase ending — completed by Codex

Owner request: when Helium grabs a player during a chase, he must run away and
the chase must end. Apply this after the grab animation finishes and releases
the player; retain its existing damage and final-grab consequences.

Files changed: `shared/sim/heliumVoice.js`, `tests/attacks.test.mjs`,
`tests/browser_encounters.py`, `tests/hush.test.mjs`, this handoff and backlog.
All reservations for this fix are released after publication.

Root cause: `releaseGrab()` ended the director chase but entered `watch`
with a linger timer. He stays beside the victim and can reacquire them. Ordinary
retreats also slow down when watched, which would not satisfy this escape.

## Result

On a completed grab, release and damage still happen at the end of the hold.
`finishHunt(..., 'grab')` now closes the hunt and gives a surviving victim the
normal hunt-ending breather. He immediately enters the existing fast crawl
retreat at up to 10.5 m/s, including while watched, and clears the grab pose in
the release snapshot. A completed grab always retreats rather than collapsing
as a hiding success. The director still emits exactly one chase-off event.

During this escape, new chase requests and newly spotted teammates cannot
replace the retreat. Exposed route endpoints trigger further escape legs;
the retry deadline is retained instead of being postponed every tick. Once
concealed he can settle into hiding, with the existing 14-second retreat
fail-safe retained. Ordinary watched retreats keep their existing behavior.
Missed/dodged reaches remain active hunts; a hunt deadline can still cancel a
pending grab without applying late damage.

## Evidence

- Seven initial regressions failed before the change: all six grab variants
  remained in `watch`, and the escape had no recovery protection. Final attack
  suite has 25 passing checks, including cooperative final-grab downing,
  exactly one release/chase ending, fast watched movement, teammate acquisition,
  misses, and successive exposed escape legs.
- The repeated-leg check caught a postponed-retry bug during implementation;
  it failed with one plan, then passed after retaining the scheduled retry time.
- Full `npm test` passes on final source, including the six timed-search checks.
  Log: `/tmp/helium-post-grab-full.log`.
- `HM_SKIP_ARTIFACTS=1 CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium python3 -u
  tests/browser_encounters.py` passes. Three actual-client sighting/grab cases
  (seeds 2/7, light on/off) see the release, fast crawl, server/client chase off
  and hunt-hum level zero. Peak escape speed 10.5 m/s; about 11.8–12.5 m net
  movement in the following 1.5 seconds. Movement stays within the existing
  per-simulation-tick collision bound; no teleport substitutes for the escape.
  Unseen attack, survived-search ending, ordinary crawl, both skunk states and
  fallen-log traversal also pass. Log: `/tmp/helium-post-grab-browser.log`.
- Eight scripted 15-minute-limit sessions during implementation recorded 24
  hunts, maximum 56.8 seconds, with real hits/downings and chase endings. This
  smoke run preceded the final exposed-endpoint retry fix; the full suite and
  browser checks above were rerun afterward. Log/JSON:
  `/tmp/helium-post-grab-soak.{log,json}`. These are scripted simulations.

Two fixture corrections keep the broader checks meaningful: post-grab movement
is compared against actual simulation time and its existing collision bound,
rather than one render frame. The skunk close-acquisition fixture now starts
at 3 m, inside the current 6.5 m lighter range, rather than relying on a random
10 m investigation. The hush integration still checks real approaches and
distance/time restrictions; its incidental minimum count was replaced with
an additional 1,000-approach skip-rate, no-repeat and RNG-independence check.
No hush/audio settings or skunk gameplay code changed.

GitHub issue posting remains unavailable through the session's GitHub API;
this published repository handoff is the coordination record.
The prior overnight test schedule finished at its 13:00 UTC deadline; this
fix's checks were run explicitly in the active session.
