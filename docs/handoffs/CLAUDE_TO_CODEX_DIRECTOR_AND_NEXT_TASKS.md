# Claude to Codex: director pacing landed; three tasks ready for you now

From: Claude. Date: October 25, 2026 (UTC).
Responds to: owner decisions in `OWNER_DECISIONS_2026-10-25.md` (`82161b5`).

## Owner instruction: don't stop between tasks

The owner has told Claude in chat, twice, that both agents keep stopping and
must **work continuously**. Please adopt this loop for the whole session:
1. Finish a task, then push it with test evidence.
2. Pull, read new handoffs, update `docs/BACKLOG.md`.
3. Immediately start the next task.

Don't end the session after a single fix. If the backlog is empty, find issues
yourself (run suites, read code, play scripted sessions) and add them. Ending
the session should only happen when you're actually blocked.

## What I landed (task C, director only + test fixtures)

`shared/config.js` → new `CONFIG.DIRECTOR`; `shared/sim/director.js`:

- **Dread period:** for `DREAD_TIME` = 210 s after the intro there are no chases,
  no deliberate reveals and no skunk ambush, and `wantsPresence()` is false.
  New hooks: `director.inDread()` and `director.minDistance()`, which returns 55 m
  during dread and 0 after.
- **Escalation:** `director.escalation()` goes 0 to 1 over `ESCALATE_TIME` = 840 s
  after the dread period (objective progress adds 0.08 each). It drives:
  - higher `aggression()` (+0.35 at full escalation),
  - shorter chase and attack cooldowns (70→30 s and 50→22 s),
  - shorter relax and build phases,
  - more frequent reveals,
  - a faster presence trigger,
  - a vocal rate up to ×1.8.
- The first reveal is now scheduled 40–100 s after the dread period ends, on the
  first update after it, so clock-jumping fixtures don't trigger it.
- **Your test fixtures:** I changed `sim.time=100` → `sim.time=400` (after
  intro + dread) in 3 lines of `tests/attacks.test.mjs` and 1 line of
  `tests/encounters.test.mjs`. That's the only change to your files: fixture
  time only, no assertions touched. They were staging mid-session encounters
  inside what is now the dread period.

Evidence: `npm test` exit 0. Pacing, same 16 scripted sessions (`docs/PACING_REPORT.md`):

| | before (`655c05d`) | after |
|---|---|---|
| earliest chase | 1:15 | **4:46** (dread works) |
| median first chase | 9:09 | 7:07 |
| total chases | 9 | 13 |
| HV hits | 2 | 1 |
| first *on-screen* sighting (median) | 1:18 | **1:22, unchanged** |
| threat events per 5-min window (0–5, 5–10, 10–15) | n/a | 14, 13, 8 (**not escalating**) |

**Honest read:** the director part works, but the two owner goals that depend on
Helium Voice's own movement aren't met yet, because `heliumVoice.js` doesn't use
the new hooks. He still roams and stalks close enough to be seen around 1:20,
and later pressure doesn't rise. That's your file, so these are yours:

## Your tasks, in priority order (owner-approved, ready now)

**A. Unseen attacks (decision 1).** He may attack at any time; when on a
player's screen he works to get out of sight. Today `closeCommitted` gates
every hit, and `CREEP_STOP` (1.8 m) > `ATTACK_RANGE` (1.7 m). In the latest
pacing run he "parked" within 2.6 m of a hidden player for **31–33 s** without
attacking. Keep the slow creep as build-up, but it must end in a hit. Suggest a
pacing re-run: never-look-back walkers should now take hits.

**D. Wire the director hooks into `heliumVoice.js` (decisions 2 + 3a).**
- `director.minDistance()`: roam goals, observation spots, `still`/`watch` and
  stalk positions must stay beyond it, and he shouldn't place himself on anyone's
  screen while it's > 0. Expected effect: first on-screen sighting moves from
  ~1:20 to ≥ ~4 min.
- `director.escalation()` (0..1): close the stalk distance (`OBSERVE_MIN/MAX`
  35–70 m → ~15–35 m at full), increase stalk/chase speed and commitment, and
  shorten freeze/retreat durations. Target: the threats-per-5-min windows rise
  over the session instead of falling.

**B. Spawn-area exclusion (decision 3b), wiring part.** I'll now write
`shared/sim/zones.js` (`spawnZone`, `inSpawnZone`, `spawnZoneCost`) plus
`tests/zones.test.mjs`, using the interface in the owner-decisions handoff. You
wire it into roam/observation/retreat/cover choice, `planTo` cost functions and
the skunk's lurk spots. Until it lands, you can start A and D.

Claim them in `docs/BACKLOG.md` when you start. I'll review each push.

## What I'm doing next (claimed)

1. `shared/sim/zones.js` + `tests/zones.test.mjs` (new files) for task B.
2. Backlog #5: `tests/browser_perf_budget.py` + baseline (new files).
3. Re-run `browser_playthrough.py` alone (it crashed with memory pressure from
   my concurrent check). I'll log the result in backlog #3.
