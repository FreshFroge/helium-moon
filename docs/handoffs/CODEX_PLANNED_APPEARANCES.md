# Planned Helium Voice appearances: real sightings and moving-player routes

Owner instruction: keep working, with Helium Voice consistently central.
Baseline application `a7754ba`; task ownership published at `93632b9`.

Reproduced and fixed:

- A watcher timing out unseen reported a reveal anyway, creating phantom
  pressure. A real short watcher/crossing appearance could escape before its
  later reporting timer ran, leaving the real sighting uncounted.
- Reports now require 0.2 s of actual on-screen exposure, occur once, and retain
  the existing 0.9 s maximum glimpse before physical escape. Unseen timeout
  contributes no fake encounter. Completion preserves the prior report, and
  repeated retreats in the next five seconds do not repeatedly inflate pressure.
  A later witnessed retreat still counts. No new stinger or proximity audio.
- An unseen approach refreshes its physical destination when the player has
  moved more than 12 m, at most every three seconds. It keeps its original
  40-second approach deadline and accumulated exposure. Seen plans are retained.
- Crossing selection validates both endpoints and its center against allowed
  creature space, instead of discovering a protected endpoint partway through.
- A watcher smoothly turns its body toward the player, matching its existing
  gaze tracking. Previously the comment promised a facing watcher but the body
  could still face the old walking direction.

Eleven reveal regressions pass, covering actual sighting reports, no unseen
phantom report, moving-player refresh and its limits, protected endpoints,
completion/repeated-escape accounting and body/gaze direction. Defect cases were
observed failing before their corresponding source fixes.

Final paired eight-session measurement (same seeds 1001/1002, four behaviours,
15 minutes each), compared with the routing pass:

| Measurement | Before | After |
| --- | ---: | ---: |
| Helium Voice chase starts | 20 | 23 |
| Geometrically on-screen time, all players | 32.5 s | 46.1 s |
| Players with a sighting | 6 / 12 | 10 / 12 |
| Helium Voice hits | 12 | 16 |
| Skunk hits | 4 | 4 |
| Sessions ending in loss | 2 | 4 |

Full sixteen-session check: 40 chases, 50.9 s on screen across 24 players,
13 players with sightings, 32 Helium Voice hits, five skunk hits, seven losses;
all pacing invariants pass. These are scripted diagnostics, not a guarantee of
human encounter frequency or fairness. Reveal-report counts and threat-gap
metrics are not directly comparable because this fix corrects their accounting.
The increased losses need attention in real playtests.

Full npm suite passed (mean simulation step 0.15 ms / p99 1.13 ms / worst 25.3 ms).
`tests/browser_reveals.py` passes in actual Chromium for both watcher and
crossing: a real-world on-screen, rendered glimpse exists at 0.4 s, reports the
right kind exactly once, and starts its physical escape at about 0.833 s.
Health remains unchanged and the largest movement step is below 0.658 m across both artifact cases. The browser
check initially reproduced a second retreat report during the same appearance;
the five-second perceived-escape grouping fixes it without preventing later
real encounter reports. Artifacts capture the real scene at the sampled frame.

Claude: review actual-sighting accounting and moving-target refresh. The new
browser fixture uses real perception/geometry and manual simulation; screenshots
wait for the wall-clock intro title to fade while simulation stays frozen at the
sampled glimpse. It does not claim a naturally occurring human encounter.
