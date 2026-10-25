# Complete creature routes and recover skunk navigation

Continued owner instruction: keep improving actual encounters. Codex claimed
creature route completion, skunk navigation and relevant browser fixtures.
Baseline shared application commit: `0c5a0e1`.

## Reproduced defects

1. Both creatures split long trips into bounded legs, but reported arrival at
   the first leg endpoint. The calling state discarded the pending final goal.
   A 240 m fixture stopped at 89.4 m for the skunk and 109.4 m for Helium Voice.
   Both failing regressions now complete all legs with bounded physical steps.
2. A walking-player trace showed the skunk oscillating beside (399.9, 434.5)
   for most of a 15-minute session. A different route got stuck against an actual
   fallen log at (388.678, 460.709). The coarse 2 m nav grid omits some geometry
   represented by the real cylinder collision system.
3. A prowl could continue toward an obsolete destination long after its target
   player had walked past it, then linger at that obsolete location.
4. The full browser playthrough attack fixture used sim.time=100, which is now
   inside the protected opening. It correctly received no attack. Moved this
   staged attack fixture to time=400, matching the focused encounter tests;
   opening protection and all actual damage assertions remain intact.

## Changes

- A leg endpoint is complete only when there is no remaining final goal. The
  following tick plans the next leg without dropping the current AI state.
- Skunk navigation measures progress toward a waypoint, rather than treating
  collision jitter as useful movement. Truly stalled routes are discarded.
- If direct motion is physically blocked, sample bounded steps around it. Keep
  one detour direction until a low, brush-independent geometry ray clears the
  route, avoiding left/right oscillation against logs. A detour has a six-second
  attempt limit; unsuccessful attempts return control to replanning. Candidates
  obey nav, collision and padded spawn-segment constraints. Body yaw follows
  actual motion, including detours.
- Refresh a prowl goal when the eligible focus player is more than 110 m away
  from that old goal. New destinations still use existing brush scoring and
  route-ahead selection. No teleport or change to damage, speed, opening length,
  attack cooldowns, recorded ambience or spawn protection.

## Validation

Five meaningful regressions in `tests/route_legs.test.mjs`: complete long routes
for each creature; abandon an impassable route without false arrival and recover
when traversable; physically go around an eight-meter fallen log with bounded
steps; replace a stale prowl destination. Each defect was observed failing before
its corresponding change. All five pass and are included in `npm test`.

Paired pacing, same seeds 1001/1002 across four behaviours, 15 minutes each:

| Measurement | Before (`0c5a0e1`) | After |
| --- | ---: | ---: |
| Helium Voice chase starts | 20 | 20 |
| Helium Voice hits | 17 | 12 |
| Skunk hits | 0 | 4 |
| Sessions ending in loss | 4 | 2 |
| Median longest gap between measured threat events | 344.5 s | 343.5 s |

All pacing invariants pass. These scripted walks/hiding behaviours are diagnostic,
not a human evaluation or a guaranteed encounter rate. The skunk's full real
walking trace now traverses the map rather than remaining against one log.

Full npm suite passes: simulation mean 0.16 ms, p99 1.26 ms, worst 16.3 ms.
Actual Chromium full gameplay passes: real movement/controls, pause, recorded
physiology/proximity mix, notes/pickups, all repairs/equipment sounds/lights,
extraction victory, death/restart, both real enemy attacks and client health,
and six simulated minutes of controller movement with live AI (576.6 m along
the trail, signature/vocal/chase events, no page errors).

Focused Chromium encounters pass first acquisition, unseen damage, on-screen
physical escape, rendered crawl and both skunk approach states. The exact real
fallen-log fixture reaches within 0.508 m of its destination after 20 simulated
seconds; max step 0.233 m, client pose error 0.0046 m. This is actual cylinder
collision and navigation at the traced world coordinates, not only the synthetic
log test. Command: `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium python -u
tests/browser_encounters.py`. All processes exited successfully.

Claude: please review route-arrival semantics, bounded local skunk detours and
stale-goal refresh. Include this pass in your next hosted refresh and record its
source SHA. Helium Voice remains the primary threat; this fixes skunk travel
without changing his encounter/audio tuning.
