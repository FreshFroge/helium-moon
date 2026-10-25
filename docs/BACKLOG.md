# Shared backlog: Claude + Codex

**Owner instruction (October 25, 2026, ~02:03 UTC):** keep working continuously:
find issues and keep improving, without stopping between tasks. To make that
possible without waiting on each other:

- Take the **top unclaimed item** that doesn't overlap the other agent's claimed
  files. Write your name and the files in the "Claimed" column **in the same
  commit you start with** (pull first, push quickly), then work.
- When done: move it to **Done** with the commit and test evidence, and take the
  next item. Add any new issue you find to **Open** immediately, even if you
  can't fix it yet.
- Items marked **(owner)** need an owner decision first. Don't implement them,
  but keep them listed. Respect the owner's direction in the handoffs (quiet mix,
  concealment, unseen creep, visible attack).
- Shared branch rules from `AGENTS.md` apply: rebase before push, never force-push.

## Open

| # | Issue / improvement | Area / likely files | Claimed |
|---|---|---|---|
| 3 | Run every existing browser suite (`browser_playthrough.py`, `browser_encounters.py`, `browser_ground_contacts.py`, `browser_menu_layout.py`, `browser_multiplayer.py`, `browser_sessions.py`) on a second machine and log failures/flakes here | tests only | Claude: `browser_playthrough.py` run alone 4× (Oct 25): all checks through the real-AI attacks pass, once the encounter fixture runs at t=400 (both agents fixed it). The 6-min live-AI traversal + final checks are **OOM-killed by the sandbox memory cgroup** (dmesg: chrome-headless renderer 2.7–3.5 GB anon) in 3/3 runs; JS heap stays ~200 MB flat over 7 min, no GPU resource growth, so it's SwiftShader/headless memory, not a game leak. Needs a real-GPU machine to confirm |
| 15 | (Claude; part 1 done: terrain chunks 64→128 m cut 150–190 draws on every preset; Low tree LOD1 45 m (−15% tris into trees); empty instanced sets hidden; per-frame JS garbage 231 → 96 KB/frame by de-allocating the tree/foliage/terrain update loops; shadow-box culling measured as <0.5% gain, skipped. Far-LOD trees now share one mesh per species instead of three variants: Low −25…−34 draws/view (−8%), −40…−55 GPU geometries, no visible change at the river overlook. Low/Medium now share from LOD1 (`treeShareLod`), and High/Ultra keep per-variant LOD1. Low draw calls per view went from 407/369/341/347 to 317/292/254/269 (−22…−26% in total tonight), with no visible change in the forest side view. Next: LOD0) Low preset still draws ~1.0–1.7 M triangles and 510–600 draw calls per frame at trail views (medium ~2.2 M): likely too heavy for integrated GPUs. Investigate tree/foliage caps and LOD distances for Low | `shared/config.js` presets, `client/render/trees.js`, `foliage.js` | Claude |




| 20 | Helium Voice stuck beside fallen log during late-session approach despite director presence requests | shared creature local avoidance, `heliumVoice.js`/`skunk.js` follow methods, route/browser checks | Claude fixed in `c197073` + `173af05` (STEP_OVER 0.75, navBlocks memory, skunk tall-log costs; `tests/nav_stuck.test.mjs` guards it). Codex: please review and move to Done if you agree |

| 22 | ~~Wading exploit~~ **Not real:** the river spots were deeper than `DEEP_WATER`, which blocks players too. The real gap was **hugging a big tree trunk**: the 2 m nav cell around it was blocked, so he stopped 2.3–3.6 m away and couldn't hit. **Fixed** by a collision-based final lunge within 4 m (`HV.HUNT_LUNGE_DIST`, `followPath` `freeLunge`): 6/6 valid trunk spots are now hit in 4–5 s. The stuck-hunt fail-safe stays as a guard | `heliumVoice.js` | done (Claude) |

## Done

| # | Item | Commit / evidence |
|---|---|---|
| — | First-sighting chase abort fix (Codex), reviewed by Claude | `32c9407`; attacks tests 4 fail before / 9 pass after |
| — | Retreat silhouette search budget (Codex) | `6fb65d8`; worst tick 136–150 → 45 ms |
| — | Pacing timeline + report (Claude) | `03b1dc6`, corrected `102160d` |
| — | Hosted page from shared branch (Claude) | built from `608918f` |
| 1 | Extraction cruiser visibility: **not a bug**. The cruiser is placed on the ground 5 m from the extraction point (−444, −636), visible with flare and a 55-intensity strobe once extraction opens; the earlier render was a bad camera angle into bushes | in-page state check at `2843b71` (Claude) |
| 5 | Performance budget test + baseline (`tests/browser_perf_budget.py`, `tests/perf_budget.json`, `docs/PERFORMANCE.md`) | 16 preset/view measurements at `abbe980` (Claude) |
| 14 | Server hardening: mimic audio is relayed only when it answers a server-issued mimic event to that same sender (≤15 s, once, ≤320 KB); per-connection rate limits (chat 6/5 s, inputs 80/s, actions 30/s, sig 300/10 s, binary 4/10 s, lobby ops 20/10 s) | `server.test.mjs` new checks: forged/non-owner audio blocked, relayed once, chat flood 5/30 (Claude) |
| 8 | Director dread period + escalation (task C) | this commit; `npm test` exit 0; pacing before/after in `PACING_REPORT.md` (Claude) |
| 10 | Optional TURN relay for voice | `9705ad7`; `tests/ice.test.mjs` 3/3 (Claude) |
| 2 | Station placement: **not a bug**. All 7 station variants over 40 seeds have 62–96 standable spots within 2 m, all with clear line of sight, none inside a building collider; the earlier render was a test camera placed inside the shed | Node check at `2843b71` (Claude) |
| 11 | Compact pause panels no longer cover navigation; actual UI layout checks pass five viewports | Codex; browser_menu_layout.py |
| 12 | Restart/quit cancel unsent chat and release movement focus; failing-before actual multiplayer fixture now passes | Codex; browser_sessions.py |
| 13 | Ground-contact screenshot receives a separate 120 s artifact timeout; contact assertions unchanged, local browser pass; second-machine confirmation pending | Codex; browser_ground_contacts.py |
| 4 | Pickup fixture stability: collision settling prevented a transient prompt from being mistaken for a stable approach; 12 seeds / 24 pickups pass, full gameplay passes | Codex; browser_pickup_glints.py and browser_playthrough.py |
| 6 | Align configured standing/crouched camera origins and audit actual rig silhouettes against world depth at three low-preset trail sites, with positive render controls | Codex; camera_perception.test.mjs / browser_silhouette.py; broader pose/quality coverage remains limited |
| 7 | Unseen attacks allowed, on-screen pursuit seeks cover outside contact; owner clarification task A | Codex; Node and actual-browser hits/escapes; reviewed by Claude at abbe980 |
| 8b | Director hooks drive movement; opening paths preserve separation; unseen repositioning no longer keeps director in recovery | Codex; 16-session route check plus controlled 0-to-3 chase before/after profile; review requested |
| 9 | Both creatures stay outside spawn: goals, full/fallback routes, direct lunges and body-padded movement segments; protected focus fallback | Codex; mandatory ten-minute zones test, no TODO, full npm suite |

| 16 | Both creatures complete all long-route legs; skunk recovers from fallen-log stalls and refreshes stale prowl goals | Codex; five route regressions, full npm, actual-browser gameplay and exact-log collision check; CODEX_ROUTE_COMPLETION.md |

| 17 | Planned glimpses report actual sightings once, refresh unseen moving-target plans and face the player | Codex; 11 regressions, full npm, 16-session pacing and actual-browser watcher/crossing glimpse/escape checks; CODEX_PLANNED_APPEARANCES.md |

| 18 | Solid-trunk nav blocking and corner-safe route shortcuts | Codex; 114 reopened trunk cells → 0, five navigation regressions, full npm/objective reachability, 16-session pacing, full browser gameplay and planned glimpses; CODEX_NAVIGATION_BLOCKING.md |

| 19 | Downed camera/visibility sampling matches real 0.35 m pose behind low cover | Codex; failing-before actual-camera and four low-cover checks now pass, attack/hiding/server lifecycle pass; CODEX_DOWNED_PERCEPTION.md |
| 23 | `sim.test` worst-tick check is flaky (33–167 ms on the same commit, also fails on 45dfbf9). Rare spike, not a regression. After the A* speed-up (`c50dd3f`), 3 runs gave worst ticks of 74, 23 and 21 ms, and the p99 is now 2.1–2.7 ms. The remaining outliers look like GC or machine noise | tests | noted by Claude |
| 20 | Helium Voice frozen for 11+ min in 'roam' (Codex trace, seeds 1003/1004): (a) 96 of 569 fallen logs (0.60–0.67 m) were taller than his 0.6 m step and invisible to nav, so he got boxed in → `HV.STEP_OVER` 0.75; (b) wedged in a 0.42 m gap between trunks inside an open 2 m nav cell, and replans kept choosing it → cells he physically can't enter are avoided for `HV.NAV_BLOCK_TIME` 60 s | Claude (took over from Codex while it was away); `tests/nav_stuck.test.mjs`; 16 seeds × 15 min: 0 frozen windows (was 67 in 1003/1004) |
| 20b | SF6 stalled at recurring spots (~11 frozen 20 s windows in 8 sessions) at fallen logs above its 0.5 m step and fence corners the nav grid can't see → its planner treats cells crossed by tall logs/fences as costly (`skunk.js` `tallLogCells`) + the blocked-cell memory. 1 window in 12 seeds remains (recovers) | Claude; `nav_stuck.test.mjs` SF6 cases |
| — | Hunt hum verified in a real browser AudioContext (Claude): with a hunt on, master RMS goes −30 → −23.5 dB (him at 20 m), 25–40 Hz band +13–18 dB, 55–100 Hz +14–18 dB, 200 Hz–2 kHz unchanged (doesn't mask cues), compressor reduction 0 dB (no ducking of other sounds); deeper at 4 m | headless measurement, not a listening test: owner should still listen |
| 24 | Sim tick spikes: worst 30–41 ms in 3×12 min (budget 50 ms), ~1 tick > 25 ms per 2.5 min of play, almost all from A* cover plans (`heliumVoice.planTo` 'cover', ~30–40 ms) and occasionally SF6 planTo. In single-player the sim runs on the main thread, so that's a 2–3 frame hitch. Option: cap `maxExpand` for cover plans or spread planning across ticks. The rare 100+ ms test failures didn't reproduce (GC/load) | `heliumVoice.js` planTo | **Mostly fixed (Claude, Oct 25 ~12:00 UTC):** A* inner loop without destructuring (flat direction tables, hole-sifting heap, sqrt for hypot, early-out in `spawnZoneCost`). Same plans and the same tick count (deterministic). 3×12 min probe: plan p99 16.4 → 4.2 ms, worst plan 44 → 8–23 ms, ticks over 25 ms 7 → 1 |
