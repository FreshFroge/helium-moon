# Smoother Helium motion and chase routing — Codex claim

Owner request: smooth all Helium Voice animations and fix pathfinding while
he runs toward players. Preserve the current hunt phases, post-grab escape,
concealment rules, creature character and quiet audio mix.

Codex reserves `shared/sim/heliumVoice.js`, `client/entities/animators.js`,
`client/entities/views.js`, `tests/animation.test.mjs`,
`tests/route_legs.test.mjs`, `tests/nav_stuck.test.mjs`, focused browser
motion/encounter checks, and this handoff. Shared physics/world edits will only
be claimed if a reproduced problem requires them; start with Helium's follower.

Inspecting: waypoint-tick pauses, collision steering/stall recovery, speed and
gait consistency, walk/run/crawl/grab/freeze/peek transitions and whole-body
collapse/rise blending. Keep authoritative movement/attacks and grounded IK;
do not reintroduce an artificial low-frame-rate effect.

Claims in the prior post-grab handoff are released. No new commits appeared
on the shared/Claude branches at the start of this session. GitHub API posting
remains unavailable; this published handoff coordinates the work.

Implementation and before/after evidence will be recorded here.
