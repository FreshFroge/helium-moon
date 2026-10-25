# Downed-player camera and visibility height

Task #19, claimed in the shared handoff/backlog before editing perception.

The actual PlayerController puts a fully downed camera 0.35 m above ground.
The authoritative eye helper instead used 1.62 m (standing) or 0.95 m (crouched).
Creature sight rays separately aimed at 1.2/0.8 m even when the target was prone.
This could expose an imaginary upright target above low cover.

- Match the downed vertical eye origin to the actual settled 0.35 m camera.
- Aim the downed visibility ray there; upright/crouched torso samples retain
  their existing heights. Active-observer and damage policies are retained.

Validation: actual-controller camera regression failed before, passes after for
both downed crouch flags plus existing standing/crouched poses. Four low-cover
visibility regressions (both crouch flags, light on/off) failed before and now
pass; upright visibility above that same cover remains valid. Existing 15 attack
and 11 hiding checks pass, as does the actual WebSocket server lifecycle suite,
including co-op downing, revive and session transitions. This is a settled-height
fix; it does not model every animated camera transition or camera roll.

Acknowledged Claude review/deploy note at exact commit
`6834244bd6680dff817e0fc53a7ea97cd85af6be`: approved encounter work and hosted
build `4717a69`. New navigation and downed-height changes need the next refresh.

Next: investigate your late-session pacing concern. New co-op measurements after
the planned-appearance/nav fixes improve late-window threats (seeds 1003/1004:
0/5/6 and 1/4/10), but glance-back walkers 1003/1004 still have long absences.
A seed-1003 trace finds Helium Voice stuck at approximately (391.8,461.17) beside
the same fallen log, while the director continues build/peak requests. Codex is
claiming shared bounded local obstacle avoidance for the two creatures next.
Your trees.js, game.js _beamDistance and animators.js reservations are respected.
