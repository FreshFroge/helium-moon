# Pacing report: session timeline measurements

Author: Claude. Measured at commit `655c05d` on `codex/early-build-playtest`
(includes Codex's first-sighting fix, retreat-search budget and terrain contacts).
Command: `PACING_JSON=/tmp/pacing.json node tests/pacing.test.mjs`
(4 scripted behaviours × 4 seeds × 15 simulated minutes = 4 h of play, ~150 s
wall time). Linux cloud container, Node v22.23.4.

These are **measurements of the real authoritative simulation with scripted
players**, not a human playtest. The players only walk, look and hide. They don't
do objectives (whose noisy repairs draw him in), sprint, talk or react. Read the
numbers as "what the AI does to a predictable player", and judge feel by playing.

"On screen" uses `perception.onScreen`, the same camera-frustum + line-of-sight
check the AI uses (75° FOV, 16:9), not a GPU pixel test. "Quiet" means no chase,
hit, signature line, twig snap, mimicry, gas, reveal, and Helium Voice not
within the critical ring (10 m). Cold, distant vocals and ambience don't
interrupt quiet.

## Results (per session, player 1)

| Behaviour | First cold (80 m) | First on screen | Chases | HV hits | Skunk hits | Longest quiet |
|---|---|---|---|---|---|---|
| Walker, never looks back | 1:03–2:27 | 1:08–2:38 | 0, 1, 0, 4 | **0** in all 4 | 0 | 3:57–13:46 |
| Walker, glances back every 20 s | 1:03–2:27 | 1:08–2:38 | 0, 1, 1, 0 | 0, **1, 1**, 0 | 0 | 7:11–13:35 |
| Crouched in brush, light off | 0:36–1:18 | never | 0 | 0 | 0, 1, 1, 0 | 9:41–14:51 |
| Co-op pair + straggler 30 m back | 0:41–2:46 | 1:03–2:50 | 1, 0, 1, 0 | **0** | 0, 0, 0, 1 | 3:31–14:51 |

Across all 16 sessions:
- **Helium Voice landed 2 hits in 4 hours of play**, both on the player who
  glances back. 5 chases against players who never look back produced no hit.
  The longest he stayed within creep distance of anyone was 1.8 s. He doesn't
  park behind them; the chase brakes into the creep and the walker leaves.
- The skunk bit 3 times (brush hider ×2, co-op ×1, and 0 for walkers on the
  trail). The skunk is currently the more dangerous creature.
- The **signature line played in 11 of 16 sessions**, usually within the first
  2–3 minutes. Helium Voice vocals: 6–17 per 15-minute session.
- He first appears **on screen about 5–15 s after the cold first arrives**. The
  cold works as a warning, but the first sighting follows it almost immediately.
- The **longest quiet stretch is usually 8–15 minutes**, so in most sessions
  nothing perceptible happens for most of the session, after an early sighting.
- Reveals seen: watcher ×3, crossing ×1, skunk ×2. Many sessions had none.
- Invariants held: no NaN positions, ordered events, no chase/hit during the
  intro, and he is never inside the outer ring before the intro ends.

## What this suggests (decisions for the owner and Codex, not implemented)

1. **Never looking back is a safe strategy against Helium Voice.** This follows
   from the owner's "slow down until he's on screen, then attack" rule. If that's
   the intended rule, it's working. If the owner wants him to still be lethal
   to someone fleeing blindly, it needs an owner-approved change (Codex has the
   AI files).
2. **The middle of the session is very quiet.** Long quiet stretches build
   dread, but 10+ minutes with no threat event may read as "nothing happens".
   This should be checked against the brief's 15–25 minute arc in a human
   playtest with objectives, which add noise and stops that these scripts lack.
3. **First contact comes early and all at once.** Cold, then an on-screen
   sighting seconds later, then often the signature line. If the owner wants
   longer dread before the first sighting, the director's early-session
   behaviour is where to look.

## Re-running

`node tests/pacing.test.mjs` takes about 2.5 minutes. `PACING_SEEDS` and
`PACING_MINUTES` shorten it, and `PACING_JSON=path` writes raw per-session data
(state durations, every reveal, per-player ring entry times). It isn't part of
`npm test` (runtime). Hard assertions cover invariants only.

## Correction (Claude, after Codex's independent run at `bfcc538`)

The first version of this report's summary bullets used counts from an earlier
run on older code (`43f3a90`): 7 never-look-back chases, 4 skunk bites, 5
watcher reveals. The table was already from `655c05d`. The bullets now match
the table: 5 chases, 3 bites, 3 watcher reveals (checked against the raw `PACING_JSON` output). Codex's independent run (Node 24)
reproduced these numbers, so the simulation is deterministic per seed across
both machines. The difference was my reporting error, not runtime variance.

## Update: director pacing per owner decisions (Claude, after `9705ad7`)

The owner decided (`docs/handoffs/OWNER_DECISIONS_2026-10-25.md`):
- he may attack at any time,
- dread should build longer before he appears,
- he should grow more aggressive as the night goes on,
- he must never enter the spawn area.

`CONFIG.DIRECTOR` + `director.js` now add a 210 s dread period (no chases,
reveals or skunk ambush) and time-based escalation. Same 16 sessions:

| | before (`655c05d`) | after director change |
|---|---|---|
| earliest chase | 1:15 | 4:46 |
| median first chase | 9:09 | 7:07 |
| chases / HV hits / skunk hits | 9 / 2 / 3 | 13 / 1 / 1 |
| median first on-screen sighting | 1:18 | 1:22 (unchanged) |
| median longest quiet | 12:14 | 10:58 |
| threat events per 5-min window | — | 14 / 13 / 8 |

The director alone delays chases and adds more of them, but it doesn't delay the
first sighting or make pressure rise over time. Both depend on Helium Voice's
own movement choices. Codex task D wires `director.minDistance()` and
`director.escalation()` into `heliumVoice.js`; task A enables unseen attacks.
Re-measure after those land. The test now prints a "threats per 5 min" column.

## Update: after Codex tasks A + D (`f43c871`)

Same 16 sessions. HV hits 1 → 5, including 3 on never-look-back walkers (owner
decision 1). Median first on-screen sighting 1:22 → 3:57; he's never seen in
9/16 sessions; earliest 1:51. Threat events per 5-min window 9 / 13 / 11.
Losses 0 → 3. Three sightings still fall inside the 210 s dread period (seed
1002 reproduces); see `docs/handoffs/CLAUDE_REVIEW_CODEX_A_D.md`.
