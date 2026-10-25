# Codex: first-sighting chase aborted before attacking

Owner priority: Helium Voice still is not attacking in play.
Agent: Codex. Branch: `codex/early-build-playtest`.

## Reproduction and cause

The earlier damage tests commonly assigned a target and awareness, or started
an existing chase. They proved the damage path but missed first acquisition.

In the real refuge at trail distance 500 m, place an active roaming Helium Voice
6 m from a stationary player facing him. Start with no target, no awareness and
the normal director, using session seed 2. The same problem occurs with the
flashlight on or off. The observer reaction chooses a chase, sets the target,
and enters the chase branch in the same update. However, `tp` was resolved before
that reaction and is still null. The chase immediately calls `retreatFrom`.
He escapes without damage despite remaining aware of the player. A previously
selected downed teammate causes the same stale-target failure on switching.

The aborted chase also left `director.chasing=true`. This blocked normal
director phase transitions and retained the chase cooldown despite the failed
encounter. Merely raising attack damage or chase probability would not fix it.

## Fix

- Resolve the target again after reactive state transitions, before executing
  the new state's logic. Head tracking follows the newly selected chase target.
- End an active director chase when it is interrupted by retreat. Completed hits
  already end it through `onAttack`; the new guard avoids duplicate end events.
- No changes to detection range, damage, pursuit probability, cover, sound mix,
  unseen close creep, screen-triggered commitment or reverse crawl settings.

## Regression coverage

Four new Node tests failed on the previous implementation and passed after the
fix: first acquisition with flashlight on/off (eight seeds each), acquisition
of a living teammate while the previous target is downed, and director cleanup
after a chase target becomes invalid. The sixteen first-acquisition encounters
must reach actual damage within eight simulated seconds without an aborting
retreat. No target, awareness, chase state or damage is injected into them.

`tests/browser_encounters.py` now also exercises three first-acquisition cases
through the real game/client input transport (seeds 2 and 7, light on/off).
The fixtures control session seed and physical starting positions, isolate the
other creature/mimic, and activate ordinary roaming; they leave acquisition,
director decisions, pursuit and damage to the real simulation. Each must show
a chase, no pre-hit retreat, reduced authoritative/client health and a cleared
director chase flag afterward. Existing unseen-creep/sighting/attack and crawl
render checks remain enabled.

Commands used:

```sh
npm test
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium XDG_CACHE_HOME=/workspace/scratch/chromium-cache python -u tests/browser_encounters.py
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium XDG_CACHE_HOME=/workspace/scratch/chromium-cache python -u tests/browser_playthrough.py
```

All three commands exited 0. All sixteen Node first-acquisition cases reached
a hit without an aborting retreat. All three new browser cases reached health
1 on both simulation and client, with the director chase flag cleared after
the hit; existing creep and crawl checks also passed. The full browser run
completed objective/win/loss/restart checks, both AI attacks, and six simulated
minutes of live-AI trail traversal without uncaught page errors. The 12-minute
Node simulation stayed within its existing performance and movement budgets.

These are staged encounters and scripted browser playthroughs, not an unassisted
human survival test. This fixes a reproduced chase cancellation; it does not
make every distant sighting an immediate attack or eliminate intentional rest
periods. Owner confirmation of encounter feel remains necessary. Earlier
visibility/terrain, pickup-glint repeatability and voice-test limitations remain
documented in the previous handoffs.

Claude: review this failure path and the new tests before changing chase pacing.
Use the current branch tip rather than the older gameplay commit linked in the
initial collaboration message. Task ownership was published before the code
edit; no live acknowledgment from Claude is assumed.
