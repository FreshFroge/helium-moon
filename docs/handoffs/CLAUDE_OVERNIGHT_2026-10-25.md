# Claude → Codex: overnight summary (Oct 25, 2026, ~02:40–13:40 UTC)

Codex has been silent since `294d9ef` (~02:50 UTC). Claude posted a reminder
on issue #2 every 5 minutes, per the owner's request, and kept working. Every
change below is on `codex/early-build-playtest`. All Node suites pass at HEAD.
These browser suites pass: multiplayer, sessions, menu layout, pickup glints,
encounters, reveals, ground contacts, night audio, silhouette and hosted build.
The hosted artifact runs **`0bca041`**.

## Owner requests implemented (Claude)

| Request | What it is | Commit(s) |
|---|---|---|
| Hereditary-style hum during hunts | 31/33 Hz beating sub-bass, active only during a hunt and only within 50 m (10 m hysteresis) | `4556126`, `e28db21` |
| "Teleport" if scarier | **Unseen relocation only.** Rules are in `OWNER_DECISIONS_2026-10-25b_HUNT_HUM_TELEPORT.md`. The only tell is that his footsteps stop for 2.5 s | `e5a7928`, `df45d3a` |
| Only a flashlight within 7 ft calls off a hunt | `HV.HUNT_BREAK_LIT_DIST` 2.13 m (target or teammate). Losing sight and time no longer end a hunt. Hunts start only within 35 m | `e28db21` |
| 10 documented hunt playtests, retest, video | `tests/hunt_playtests.mjs`, `docs/HUNT_PLAYTESTS.md`, `tools/render_hunt_replay.py` | `11fa520`… `64d1531` |

## Bugs fixed

- **#20:** HV froze for 11+ minutes at log walls and trunk gaps. Fixes:
  `STEP_OVER` 0.75, `navBlocks` memory, and tall-log costs for SF6
  (`c197073`, `173af05`; guarded by `tests/nav_stuck.test.mjs`). **Please
  review this and move it to Done.**
- Players hugging a big tree trunk couldn't be hit. Fixed with a collision-based
  final lunge within 4 m (`a27a9c0`).
- Hunts on unreachable players never ended. Added a stuck-hunt fail-safe
  (`959a83c`).
- `browser_reveals` was flaky because of the intro wait (`34be170`).

## Performance (no behavior change)

The 10 hunt playtests give identical results before and after: 27 hunts, 19
flashed off, 8 hits.

| | before | after |
|---|---|---|
| A* plan p99 (3 × 12 min) | 16.4 ms | 4.2 ms (`c50dd3f`) |
| Sim ticks > 25 ms | 7 | 1 |
| Sim garbage per tick | 138 KB | 20 KB (`5b4baf7`: `queryColliders` re-grew a `Set` on every call) |
| Client garbage per frame (Low) | 231 KB | 51 KB |
| Low draw calls per view | — | −8% (`572471f`, far-LOD trees share one mesh per species) |

## Looked at and left alone

- **HV bloom halo.** When he steps into the beam, he blooms pink-white for about
  0.5 s until eye adaptation settles. After that he renders correctly. A bloom
  energy cap barely changed the settled look and would have dimmed the bulbs, so
  I reverted it. If the owner dislikes the transient, adapt faster when the beam
  hits a body (`game.js` exposure, ~line 568).
- **`browser_playthrough.py` and the full `browser_perf_budget.py`** are
  OOM-killed by this sandbox (SwiftShader). That's backlog #3; they need a
  real-GPU machine.

## Open for you

- Backlog #20: review, then Done.
- Backlog #15: the remaining LOD0/LOD1 tree draws.
- If you change the hunt or director flow, keep `chase` on/off as the hunt
  signal. The hum and the playtest harness both key off it.
