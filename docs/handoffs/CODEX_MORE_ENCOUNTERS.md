# More Helium Voice encounters after opening dread

Owner request: increase encounters with Helium Voice. Codex claimed director,
DIRECTOR tuning and Helium Voice approach logic before editing; Claude retains
Low-preset performance work.

Opening protection remains 210 seconds after the 9-second intro (3:39 total).
The protected spawn area, quiet mix and contact damage are unchanged.

- Presence begins after 25 -> 8 safe seconds as escalation rises (was 50 -> 15).
- Presence destinations move toward 28–48 m early / 18–32 m late, instead of
  remaining 55–110 m away during deliberate approaches. Opening-only separation still overrides these ranges.
- During deliberate approach, he can catch a walking player instead of hovering
  near the old speed threshold. A protected focus player no longer dictates the
  approach speed used for an eligible target outside spawn.
- First deliberate reveal is scheduled 20–45 s after dread ends (was 40–100).
  Subsequent reveal intervals are 75–130 s early / 45–80 s late.
- Chase cooldown falls from 50 to 22 s over escalation; post-attack recovery
  falls from 40 to 18 s. Relax phases are 30–55 s early / 15–25 s late.

Paired measurement: two seeds per four scripted behaviours, 15 minutes each
(8 sessions / 12 players), same command and seeds before/after:

| Measurement | Before | After |
| --- | ---: | ---: |
| Chase starts | 14 | 20 |
| Seconds with Helium Voice geometrically on-screen, all players | 6.2 | 14.8 |
| Players with an on-screen sighting | 5 | 5 |
| Median longest quiet stretch per session | 475 s | 344.5 s |
| Helium Voice hits | 10 | 17 |
| Sessions ending in loss | 2 | 4 |
| Earliest sighting | 4:05 | 4:05 |
| Earliest chase | 4:26 | 4:19 |

Command: `PACING_SEEDS=2 PACING_JSON=/tmp/encounters.json node tests/pacing.test.mjs`.
Baseline was the shared tree at `6c418b1`; the after run includes this tuning.
These are scripted walking/hiding behaviours without objectives, not human
playtests or a guarantee of exactly 43% more chases for every player.
More visual time is a measurement, not a count of distinct sightings. Losses
also matter when evaluating the shorter quiet time; they are reported explicitly.
The owner can use the existing playtest checklist to judge actual game feel.

## Follow-up defects found and fixed

- Hidden presence at 40 m reset the old safety timer, cancelling the approach
  without an encounter. A separate presence timer now resets on an actual
  observer, active pursuit or close cold presence (inside 25 m).
- Lulls keep roam goals 55–85 m from the eligible focus, rather than randomly
  drifting far down the trail. Overdue appearances prioritize Helium Voice over
  skunk reveals; protected co-op focus players do not block eligible targets.
- Planned appearances were cancelled by the global concealment reaction on
  their first visible frame, including a second flashlight cancellation in
  watcher-show logic. These intentional glimpses now permit 0.9 seconds of
  cumulative exposure before physical escape. Ordinary hiding/visible chase
  retreat still reacts immediately. Reveal target is explicitly assigned.
- A real seed-1002 trap at (356.662, 202.615) repeatedly discarded a 0.315 m tree
  collision correction and stayed motionless as the player left. Existing
  penetration now resolves gradually within the movement step, preserving spawn
  and opening constraints; no teleport. A regression covers overlap recovery.
- Failed roam/retreat plans have short retry delays after dread, and a chase
  respects its existing scheduled replan interval even when its path is null.
  Opening escape planning retains immediate retries: delaying it caused an early
  co-op sighting in an intermediate experiment, which was not published.
- Weighted A* was recalculating expensive view/safety costs from each neighbouring
  cell. Cache each cell cost once per synchronous search; a regression ensures
  no duplicate evaluations and fresh costs on the next search.
- The skunk fled lit players before prowl/investigate attack acquisition ran,
  and its 12 m flashlight flee radius exceeded its 7.5 m attack trigger. A ready
  ambush now acquires a lit player throughout that reaction range before flee
  logic. Dread, spawn exclusion, cooldowns, windup and physical contact remain.
  Four new attack regressions reproduced failures at 6/10 m and now pass.

Final full pacing run: 16 fifteen-minute scenarios / 24 players, 41 chases,
28 Helium Voice hits, one skunk hit, six losses; all invariants pass. Earliest
sighting 4:05 / chase 4:19. The paired table above uses only seeds 1001/1002,
matching the eight-session baseline. Scripted walkers are still not guaranteed
visual contact, especially when never looking back. The skunk's natural attack
frequency remains low in this sample; staged actual-browser checks establish
working attacks, not an assertion that encounter balance is finished.

Claude review requested: compare encounter readability and fairness in a real
headphone playtest, prioritize Helium Voice as the central threat, and refresh
the hosted page from the resulting shared tip with a recorded build SHA.
Acknowledged your review at `00477cb1df218b1299a01c57e589ef0151428f11`
and Low LOD optimization at `f8ebf0bd91c5508cb93e48d2615321de5a0ff77b`.

Validation: full `npm test` passes, including both enemies' actual damage,
opening protection, spawn zones and navigation regressions. Final simulation
cost: mean 0.14 ms / p99 1.18 ms / worst 11.3 ms. Actual Chromium encounter
harness verifies first acquisition, unseen damage, seen physical escape, crawl
rendering and skunk prowl/investigate attacks with matching client health.

Co-op follow-up: the ambush-vs-flashlight arbitration applies when **any** nearby
teammate lights the skunk, not only when the final light observer in iteration
order happens to be the nearest player. Added a two-player regression: unlit
nearest player at 10 m, lit teammate farther away; nearest player takes real
damage. All 15 attack checks pass. After rebasing Claude's Low-preset work,
28 focused AI/opening/navigation tests and both actual-browser ambience and
encounter harnesses pass. Hosted manifest includes all new audio/helper files.
