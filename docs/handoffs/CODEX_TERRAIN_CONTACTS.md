# Codex: ground Helium Voice's crawl and walking on uneven terrain

Part of the owner-requested collaboration. Task ownership and the one-line
constructor interface change were published in `CODEX_COLLABORATION_ACTIVE.md`.
Claude accepted separate pacing tests and independently reviewed the attack
fix in `e8dbc10` on `claude/pacing-timeline`; those are separate contributions.

## Change

Previously hand and foot IK solved against a flat plane at the actor origin,
so contacts could float above or sink into sloped terrain. The view now converts
each local contact coordinate into world coordinates and samples `groundAt`,
including the bridge deck and ramps. This is passed as an optional animator
callback; existing teammate avatars retain their previous behavior.

Walking feet follow their own terrain heights, with pelvis adjustment toward
the downhill support. The crawl torso follows the local ground normal. Hands
and feet resample their support after shortening a stride to fit limb reach;
shoe and wrist orientation follows the local surface. Crawl entry/exit and the
standing head-tracking layers remain intact. No attack or audio tuning changed.

Files: `client/entities/animators.js`, `client/entities/views.js`, one
`HeliumView.create` argument in `client/game/game.js`, `tests/animation.test.mjs`
and new `tests/browser_ground_contacts.py`.

## Validation

- `node tests/animation.test.mjs`: real skeleton poses remain finite, flat-ground
  placement and teammate isolation pass, and walking/crawling contacts remain
  within 1.2 cm for feet / 2 cm for palms on four uphill/downhill/cross-slope planes.
- `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium XDG_CACHE_HOME=/workspace/scratch/chromium-cache python -u tests/browser_ground_contacts.py`:
  actual loaded character/view tested at three real refuge slopes and on the
  bridge, each in three body orientations and both walking/crawl poses. 3,791
  planted-contact checks stayed below 2.5 cm error; a rendered bridge crawl is
  captured under `/tmp/helium-moon-ground-contacts` (override `HM_ARTIFACT_DIR`).
- Same environment with `tests/browser_encounters.py`: first acquisition and
  actual hits, unseen waiting then visible commitment, and rendered crawl pass.
- `npm test` passed after the ground-contact changes. Existing simulation
  performance thresholds are unchanged; Claude's separate machine reported
  slow concealment-search ticks, addressed in the subsequent retreat-search fix.

These are pose fixtures, not an unassisted playthrough. Extreme ledges can exceed
limb reach; this does not add footstep-aware routing or full world-space planted
limb locks. The skunk uses its existing animation. Screenshots on software
Chromium do not establish visual polish on a real GPU.

Claude: the constructor edit is complete; review the animation/interface on
the playable branch. Your claimed pacing files have not been edited by Codex.
