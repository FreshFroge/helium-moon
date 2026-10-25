# Codex claim: 50 consecutive playtests and complaint report

Owner request, October 25, 2026: run 50 playtests back to back, document
complaints, and give the results to Claude and Kimi.

Codex claims a reproducible extension to `tests/hunt_playtests.mjs` plus the new
report `docs/PLAYTESTS_50.md`. The run will use the real authoritative simulation
and objective-playing bots across solo and 2–4-player teams. It will preserve
per-seed JSON so Claude and Kimi can reproduce individual failures.

This pass does not claim Puppet simulation, animation, or browser rendering
files. It publishes evidence and prioritized feedback; implementation fixes
remain separated by the active three-agent handoff.

## Result

Complete. Codex ran 50 deterministic, back-to-back authoritative sessions at
current gameplay commit `e27fe0e` (seeds 2001–2050, 25-minute cap), after an
initial 50-run baseline at `6415ccd`. The complete current outcome
table and complaint analysis are in [`docs/PLAYTESTS_50.md`](../PLAYTESTS_50.md).

The most urgent findings for both collaborators are:

1. **50 false hunts in 18 sessions:** the director repeatedly targets players
   who are already downed. These start and end in one 50 ms simulation step.
2. **Slip jump fixed:** baseline seed 2027 reached 3.92 m without an event.
   Claude's `b1f30ff` produced 14 announced slips and zero current jumps above
   1.6 m. Its `fx`/`fz` payload still captures the arrival as the departure.
3. **Binary Puppet counter:** cautious targets cut their own strings in 203 of
   213 hunts (95.3%), while steady/rusher targets never did so themselves.
   Successful cuts took a 21.5-second median; caught hunts took 67.3 seconds.
4. **Solo progression is severely punishing:** 0/14 solo sessions escaped, 9
   ended with the player dead, and solo players averaged 0.36/3 objectives.
5. **Ten unreadable catches:** across seven seeds, targets never saw him and
   only heard him directly behind after 40.7–52.2 seconds; every case ended in
   a hit or down.

### Feedback ownership

- **Claude:** fix downed-target selection and correct the announced `slip`
  event's departure coordinates. Then tune the overhead-control
  counter so awareness is rewarded without making one bot policy nearly
  infallible. Preserve the owner's high hunt frequency and long prowl; improve
  hunt validity and variety instead of simply reducing encounters.
- **Kimi:** use the claimed rendered Puppet test to judge whether the overhead
  control is legible too early, whether repeated freezes look jerky, and whether
  the ten audio-only catches have any visual warning that the headless test
  cannot perceive. Reproduce seeds 2027 and 2042 first.

Validation command:

```bash
HUNT_SESSIONS=50 HUNT_MINUTES=25 HUNT_JSON=/tmp/helium-hunts-50-current.json node tests/hunt_playtests.mjs
```

Result: 50/50 current sessions completed in 85 seconds after the 50/50 baseline
completed in 79 seconds. Both runs are deterministic and can be regenerated;
the roughly 400 KiB raw JSON files remain local test artifacts rather
than repository content.

Full validation at rebased tip: `npm test` passed all Node suites on Node
24.19.0, including the simulation, relocation, server, audio, animation,
bridge, spawn, objectives, ice, and zone checks.

