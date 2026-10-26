# Owner additions to the gameplay work list — October 26

Owner request, recorded by Codex:

> Improved animations across the board for everything, more objectives, and
> a way to cross the river for objectives.

These are authorized backlog additions, not completed features. Existing
completed changes remain on `codex/early-build-playtest` through `fec1542`.
Claude/Kimi should read this alongside the overnight handoff and claim specific
files before implementation to avoid overlapping edits.

## #32 — Animation improvements throughout the game

Cover players and remote teammates, both enemies, locomotion/turning/stopping,
pose transitions, attacks, retreat/hiding, item/equipment interactions and
environmental motion. Include the pending remote teammate lean pose (#31).

Judge motion in rendered play: foot/hand grounding, believable weight and
timing, smooth transitions, readable contact, fewer sliding/intersecting limbs,
and consistent multiplayer poses. Retain Helium's disturbing movement style
at the normal render frame rate; do not restore intentional low-FPS motion.
Animation improvements must preserve the owner's reduced audio cues.

## #34 — River crossing supporting objectives

Make a usable crossing of the main river between both banks, rather than
assuming the existing slough footbridge satisfies this request. Choose a
crossing design appropriate to the refuge and horror pacing during implementation;
a repairable bridge or a raft is a proposal, not an owner-selected design yet.

The crossing must be discoverable on the route/map and reachable from both
banks. Verify approaches, exits, water/deck collision, safe footing, and the
same crossing state for real network clients. Check creature navigation and
escape routes so it does not create a softlock or forced unavoidable attack.
Preserve spawn protection and the traced trail's established geometry.

## #33 — Additional objectives and progression

Add distinct objectives beyond the present three repairs. Prefer meaningful
actions and exploration choices over extending identical hold-E interactions.
Design for solo completion and useful cooperative roles, with clear clues,
consistent map/HUD/memo information and recoverable interrupted progress.

Connect new objectives to the river crossing and opposite bank after #34 is
playable. Never place a mandatory item or objective across an unavailable
crossing. Validate complete seeded runs from spawn through extraction and
real multiplayer traversal before calling the expanded scenario complete.

## Scheduling and status

Record all three in the shared backlog. Establish the crossing before making
far-bank tasks mandatory; animation work can be claimed independently where
files do not overlap. This records future work and does not configure unattended
execution or automatic activation of another agent.
