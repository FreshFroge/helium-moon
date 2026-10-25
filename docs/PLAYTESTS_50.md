# Fifty back-to-back Helium Moon playtests

Codex ran 50 deterministic playthroughs against the authoritative simulation
at current gameplay commit `e27fe0e`. This is feedback for Claude and Kimi,
with every complaint tied to reproducible seeds rather than a request to lower
the owner's desired encounter frequency.

## Method and limits

The run used `tests/hunt_playtests.mjs`, seeds 2001–2050, a 25-minute limit,
and a balanced continuation of the established solo, two-, three-, and
four-player plan. Bots pursue real objectives and use cautious, steady, or
rusher behavior. Cautious bots were updated for the new Puppet rule: once they
see him within 18 m, they stop and aim at the overhead control.

```bash
HUNT_SESSIONS=50 HUNT_MINUTES=25 HUNT_JSON=/tmp/helium-hunts-50-current.json node tests/hunt_playtests.mjs
```

All 50 sessions completed in 85 seconds. An earlier 50-run baseline at
`6415ccd` completed in 79 seconds; it is used below only to verify Claude's
intervening slip fix. These are simulation playtests. They
measure authoritative pacing, attacks, outcomes, visibility, and movement, but
cannot judge rendered animation, audio quality, voice chat, or human fear. Kimi
has a separate rendered-browser assignment for those questions.

## Follow-up verification: downed-target hunts fixed

The report's P0 stale-focus defect was fixed immediately after this matrix. A
third run with the same 50 seeds and 25-minute cap recorded **0** one-step
downed-target hunts, down from 50. Helium still landed 108 hit/down outcomes
(113 before), while mean objective completion rose from 1.52 to 1.58. The
current post-fix comparison is recorded in
`docs/handoffs/CODEX_50_PLAYTESTS.md`; use that baseline for future balance
work rather than treating the old 388 raw-hunt count as intended pressure.

## Aggregate result

| Measure | Result |
| --- | ---: |
| Sessions | 50 |
| Escaped / time expired / all dead | 9 / 30 / 11 |
| Objectives completed, mean | 1.52 of 3 |
| Sessions with 0 / 1 / 2 / 3 objectives | 12 / 14 / 10 / 14 |
| Recorded hunts | 388, mean 7.76, median 8, range 1–14 |
| Real hunts after removing downed-target starts | 336 |
| Target/team cut strings / Helium landed a hit or down / other | 207 / 113 / 16 |
| Real hunt duration, mean / median / maximum | 35.1 s / 25.3 s / 95.5 s |
| Cut hunt duration, median | 21.5 s |
| Caught hunt duration, median | 67.3 s |
| Planned glimpses | 501, mean 10.0 per session |
| Announced relocations | 508: 207 collapse, 184 ahead, 76 lie, 27 cutoff, 14 slip |
| Puppet freeze / collapse / grab events | 2,300 / 207 / 113 |
| SF6 hits | 84 |

Team outcomes show a major solo imbalance:

| Players | Runs | Escaped | Time expired | All dead | Mean objectives | Mean hunts |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 14 | 0 | 5 | 9 | 0.36 | 5.9 |
| 2 | 13 | 2 | 10 | 1 | 1.54 | 8.8 |
| 3 | 12 | 3 | 8 | 1 | 2.25 | 9.1 |
| 4 | 11 | 4 | 7 | 0 | 2.18 | 7.5 |

## Prioritized complaints

### P0 — the director starts hunts on already downed targets

There were 50 fake hunts across 18 sessions. Each lasted one 50 ms step and
ended `target downed (other cause)`. The worst reproductions are seed 2039
(seven) and seeds 2008 and 2011 (six each). This inflates
encounter counts, restarts chase audio/state on incapacitated players, and can
make Helium look broken directly after a valid down.

The likely path is a stale director/HV focus: `Director.allowChase(p)` and
`HeliumVoiceAI.startChase(p)` do not validate `playerActive(p)`, even though
ordinary target selection does. Claude should reject dead/downed candidates at
both boundaries, retarget an active player, and add a regression assertion that
a hunt cannot open on an inactive player. High hunt frequency should apply to
active players.

### Resolved between runs — concealed tree slipping announced

The first run found nine sessions with a chase step above 2 m in 50 ms without an
`hv_relocate` event: 2009, 2016, 2017, 2019, 2027, 2035, 2039, 2041, and 2048.
Seed 2027 reached 3.92 m. Normal maximum physical retreat speed allows about
0.53 m per step before test tolerance; these discontinuities are large enough
to snap network interpolation and look like cheating.

Claude's intervening `b1f30ff` emits a distinct `reason: 'slip'`. The current
50-run pass recorded 14 announced slips and no unannounced step above 1.6 m, so
the gameplay discontinuity check now passes. One telemetry defect remains:
`slipAround()` captures `fx`/`fz` after `place()`, making the reported departure
equal the arrival. Claude should capture those coordinates before moving; the
existing no-unannounced-jump assertion should stay strict.

### P1 — the Puppet counter is binary and becomes repetitive

Cautious targets cut their own strings in 203 of 213 targeted hunts (95.3%).
Steady and rusher targets never cut their own strings. Cuts formed 62% of real
hunts and had a 21.5-second median, compared with 67.3 seconds when Helium
caught someone. Seeds 2049, 2045, 2031, 2005, and 2030 produced 12–14 cuts in a
single session.

The mechanic distinguishes informed and uninformed players, but the current
gap is too absolute. Once learned, it can turn most hunts into the same stop,
aim, collapse loop. Tune control visibility, required tracking, angle, exposure
window, adaptation, or teammate pressure so knowledge helps without producing
near-perfect repeatability. Kimi should judge its rendered readability before
numbers change: the control may be obvious at long range or the bot may be more
precise than a human.

### P1 — solos rarely progress

No solo escaped. Nine of 14 died, five timed out, and the group averaged only
0.36 objectives. Eight solo runs completed zero objectives. The failure has two
forms: steady/rusher players usually take three Helium hits and die, while
cautious players repeatedly cut the strings but lose most of the session to
new encounters. Seeds 2037, 2045, and 2049 show 10, 13, and 14 successful cuts
without an escape.

Preserve pressure, but give solo players enough objective windows to act. A
short recovery budget after a collapse, encounter scheduling that respects
active objective use, or solo-scaled interaction time would retain hunts while
reducing dead time.

### P1 — ten catches had no visual confirmation

Ten hunts in seeds 2009, 2023 (twice), 2027 (twice), 2031, 2038, 2042, and
2048 (twice) never put Helium on the target's screen. The first actionable detection was “heard him
right behind” after 40.7–52.2 seconds, and every one ended in a hit or down.
This may feel arbitrary rather than frightening, especially with the owner's
intentionally short footstep range.

Kimi should replay seeds 2027 and 2042 in the renderer and check for a fair
Puppet silhouette, environmental response, or other non-directional warning.
Do not restore a large positional terror radius. The warning needs to preserve
uncertainty about his direction and exact distance.

### P2 — encounter presentation may be oversaturated

The simulation emitted 501 planned glimpses, 508 relocations, and 2,300 fresh
look freezes. Those are roughly 10.0 glimpses, 10.2 relocations, and 46.0 freeze
beats per session before other events. Frequent Helium presence matches the
owner's direction, but repeated freeze/collapse/relocate cycles may look jerky
or mechanical. This is a rendered-playtest complaint candidate, not grounds to
reduce hunts from headless data alone. Kimi should record whether the states
read as one continuous creature performance.

### P2 — SF6 can invalidate active Helium hunts

SF6 landed 84 hits, and 52 hunts ended because the target was downed by another
cause. Some overlap is good multiplayer chaos; the subsequent fake hunt starts
are not. After fixing target validity, Claude should check whether SF6 and
Helium need a brief arbitration window around grabs and downs so their attacks
do not overwrite one another.

## All 50 sessions

“False” is a one-step hunt opened on a downed target. “Baseline” means the
automated tags found no severe anomaly; it does not certify presentation quality.

| # | Seed | Players | Outcome | Minutes | Objectives | Hunts | Cuts | False | Primary complaint |
| ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 2001 | 1 | all dead | 12.9 | 1/3 | 2 | 0 | 0 | baseline |
| 2 | 2002 | 1 | all dead | 13.6 | 0/3 | 2 | 0 | 0 | no objectives |
| 3 | 2003 | 1 | all dead | 14.4 | 0/3 | 6 | 6 | 0 | no objectives |
| 4 | 2004 | 1 | all dead | 14.1 | 0/3 | 3 | 0 | 0 | no objectives |
| 5 | 2005 | 2 | time up | 25.0 | 2/3 | 12 | 12 | 0 | 12 cuts |
| 6 | 2006 | 2 | time up | 25.0 | 1/3 | 12 | 5 | 3 | 3 false |
| 7 | 2007 | 2 | time up | 25.0 | 1/3 | 9 | 3 | 3 | 3 false |
| 8 | 2008 | 3 | time up | 25.0 | 2/3 | 11 | 1 | 6 | 6 false |
| 9 | 2009 | 3 | all dead | 23.4 | 2/3 | 10 | 0 | 1 | 1 false; late audio-only notice |
| 10 | 2010 | 4 | time up | 25.0 | 1/3 | 6 | 3 | 0 | baseline |
| 11 | 2011 | 3 | time up | 25.0 | 1/3 | 14 | 1 | 6 | 6 false |
| 12 | 2012 | 4 | time up | 25.0 | 0/3 | 9 | 7 | 0 | no objectives |
| 13 | 2013 | 1 | time up | 25.0 | 0/3 | 10 | 7 | 0 | no objectives |
| 14 | 2014 | 2 | time up | 25.0 | 1/3 | 10 | 10 | 0 | 10 cuts |
| 15 | 2015 | 3 | time up | 25.0 | 3/3 | 13 | 7 | 3 | 3 false |
| 16 | 2016 | 4 | time up | 25.0 | 3/3 | 5 | 2 | 0 | baseline |
| 17 | 2017 | 1 | all dead | 14.2 | 0/3 | 2 | 0 | 0 | no objectives |
| 18 | 2018 | 2 | escaped | 15.9 | 3/3 | 2 | 0 | 0 | baseline |
| 19 | 2019 | 3 | escaped | 13.8 | 3/3 | 5 | 0 | 3 | 3 false |
| 20 | 2020 | 4 | escaped | 13.0 | 3/3 | 2 | 0 | 0 | baseline |
| 21 | 2021 | 1 | all dead | 9.6 | 0/3 | 3 | 0 | 0 | no objectives |
| 22 | 2022 | 2 | time up | 25.0 | 2/3 | 9 | 8 | 0 | 8 cuts |
| 23 | 2023 | 3 | time up | 25.0 | 1/3 | 10 | 1 | 3 | 3 false; two late audio-only notices |
| 24 | 2024 | 4 | escaped | 22.6 | 3/3 | 10 | 4 | 1 | 1 false |
| 25 | 2025 | 1 | time up | 25.0 | 1/3 | 9 | 9 | 0 | 9 cuts |
| 26 | 2026 | 2 | time up | 25.0 | 1/3 | 8 | 8 | 0 | 8 cuts |
| 27 | 2027 | 3 | time up | 25.0 | 2/3 | 7 | 1 | 1 | 1 false; two late audio-only notices |
| 28 | 2028 | 4 | escaped | 21.3 | 3/3 | 9 | 7 | 0 | baseline |
| 29 | 2029 | 1 | all dead | 7.1 | 0/3 | 1 | 1 | 0 | no objectives |
| 30 | 2030 | 2 | time up | 25.0 | 1/3 | 12 | 12 | 0 | 12 cuts |
| 31 | 2031 | 3 | time up | 25.0 | 3/3 | 14 | 13 | 0 | 13 cuts; late audio-only notice |
| 32 | 2032 | 4 | time up | 25.0 | 1/3 | 8 | 8 | 0 | 8 cuts |
| 33 | 2033 | 1 | all dead | 10.4 | 0/3 | 3 | 0 | 0 | no objectives |
| 34 | 2034 | 2 | time up | 25.0 | 3/3 | 11 | 4 | 4 | 4 false |
| 35 | 2035 | 3 | escaped | 11.3 | 3/3 | 3 | 0 | 0 | baseline |
| 36 | 2036 | 4 | time up | 25.0 | 3/3 | 4 | 1 | 0 | baseline |
| 37 | 2037 | 1 | time up | 25.0 | 0/3 | 10 | 10 | 0 | 10 cuts; no objectives |
| 38 | 2038 | 2 | all dead | 19.0 | 0/3 | 6 | 0 | 1 | 1 false; late audio-only notice; no objectives |
| 39 | 2039 | 3 | time up | 25.0 | 2/3 | 12 | 1 | 7 | 7 false |
| 40 | 2040 | 4 | time up | 25.0 | 2/3 | 10 | 3 | 2 | 2 false |
| 41 | 2041 | 1 | all dead | 12.1 | 0/3 | 3 | 0 | 0 | no objectives |
| 42 | 2042 | 2 | time up | 25.0 | 1/3 | 13 | 7 | 2 | 2 false; late audio-only notice |
| 43 | 2043 | 3 | time up | 25.0 | 2/3 | 8 | 6 | 0 | baseline |
| 44 | 2044 | 4 | time up | 25.0 | 2/3 | 11 | 7 | 1 | 1 false |
| 45 | 2045 | 1 | time up | 25.0 | 1/3 | 13 | 13 | 0 | 13 cuts |
| 46 | 2046 | 2 | time up | 25.0 | 1/3 | 6 | 4 | 0 | baseline |
| 47 | 2047 | 3 | escaped | 11.4 | 3/3 | 2 | 0 | 0 | baseline |
| 48 | 2048 | 4 | escaped | 21.8 | 3/3 | 9 | 1 | 1 | 1 false; two late audio-only notices |
| 49 | 2049 | 1 | time up | 25.0 | 2/3 | 14 | 14 | 0 | 14 cuts |
| 50 | 2050 | 2 | escaped | 18.5 | 3/3 | 5 | 0 | 2 | 2 false |

## Direct handoff

Claude owns the remaining P0 target-selection fix, slip event payload
correction, and counter tuning. Kimi owns the rendered verification of counter
legibility, freeze continuity, and audio-only catches. After both changes land,
rerun this same 50-seed matrix and compare valid hunts, solo objective progress,
and the outcome spread; do not compare raw hunt count until fake downed-target
starts are removed.
