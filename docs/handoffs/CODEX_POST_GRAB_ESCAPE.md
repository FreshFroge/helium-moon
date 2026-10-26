# Post-grab chase ending — Codex claim

Owner request: when Helium grabs a player during a chase, he must run away and
the chase must end. Apply this after the grab animation finishes and releases
the player; retain its existing damage and final-grab consequences.

Codex reserves `shared/sim/heliumVoice.js`, `tests/attacks.test.mjs`, focused
post-grab browser checks in `tests/browser_encounters.py`, and this handoff.
Also reserved: `tests/hush.test.mjs`. The new escape/recovery changes the number
of approaches in its fixed six-session sample (two hushes rather than the old
minimum of three). Preserve the cue settings and validate its probability and
once-per-approach behavior directly instead of depending on that incidental
session count. Retain the end-to-end timing/distance checks.
The prior continuation's reservations are released. No director/audio/rig
rewrite is proposed.

Current finding: `releaseGrab()` ends the director chase but enters `watch`
with a linger timer. He stays beside the victim and can reacquire them. Ordinary
retreats also slow down when watched, which would not satisfy this escape.

Implementation target: one completed grab releases/deals damage, ends the hunt,
and starts a fast physical retreat even while watched. Do not restart a hunt
during that retreat. Preserve dodged/missed reaches and deadline cancellation.
Check solo survival, cooperative downing, release/chase-end events, movement,
and actual browser animation/cue state before publication.

GitHub issue posting remains unavailable through the session's GitHub API;
this published repository handoff is the coordination record.
