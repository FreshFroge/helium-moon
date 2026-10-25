# Codex: close encounters and reverse bear crawl

Owner request: warn through the freezing aura as Helium Voice approaches; slow
him within 6–8 feet while unseen, then accelerate/attack when he appears on the
player's screen. Keep him concealed while hiding, and make escapes a very fast,
scary reverse bear crawl.

Agent: Codex. Branch: `codex/early-build-playtest`. GitHub issue/PR posting remains
unavailable in this environment; this handoff is committed repository coordination,
not a claim that Claude or Kimi received a live message. Earlier handoffs remain
historical; this one supersedes their encounter behavior descriptions.

## Behavior and tuning

- `CONFIG.HV.CREEP_DISTANCE=2.4`, `CREEP_SPEED=0.38`, `CREEP_STOP=1.8` (metres,
  metres/second). An unseen running arrival brakes before crossing the boundary.
  He creeps to the waiting distance without dealing unseen contact damage.
- A close sighting commits that chase to its attack. Looking away afterward
  cannot reset it. A visible recognized player within 10 m can initiate a chase
  according to the director; an arm's-reach encounter remains dangerous during
  its cooldown. Walls and attack cooldowns still apply. Intro remains protected.
- `onScreen()` uses camera yaw, pitch, vertical FOV, aspect ratio and silhouette
  LOS samples. Each client sends bounded `viewFov`/`viewAspect` with existing
  20 Hz input, through the same solo/co-op transport. The server computes sightings;
  clients do not submit an unrestricted boolean sighting claim. The target's own
  sighting commits its attack; every active teammate affects concealment.
- Hiding requires opaque LOS blockage at head, torso, lower body and silhouette
  edges. Thin brush and high cover scores alone do not qualify. Moving players
  invalidate exposed stationary hiding poses and force another retreat. Existing
  weighted cover paths remain; occasional deliberate reveals are still distinct
  from hiding.
- `CONFIG.HV.RETREAT=10.5` m/s, with rapid acceleration, collision-constrained
  navigation and backward-facing body orientation. A retreat stops early when
  he reaches genuinely concealed cover. Deliberate watcher reveals now escape
  this way instead of slowly stepping sideways.
- Snapshot flag `16` selects the crawl; the snapshot retains its 11-value shape.
  Hips rise, chest lowers, neck counter-rotates, and diagonal hand/foot pairs
  reverse their stance sweep. Both arms and legs use compound-segment IK. Entry
  and exit blend quickly. Teammate animation does not receive the crawl layer.
- Head position follows the animated bone; flashlight body bounds lower during
  a crawl. Frost rises from 0.6 at 25 m toward 0.95 at contact, rather than
  plateauing for the whole final approach. Existing quiet breathing/heartbeat,
  distance-independent physiology, wind and 1.8–2.4 m step envelope remain.

## Validation

- `npm test`: hiding/pathfinding, new encounter/screen geometry cases, actual AI
  attacks, startup, event identity, horror/audio, recording, real skeleton poses,
  bridge, spawn, objectives, 12-minute simulation and two-client server protocol.
- `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium XDG_CACHE_HOME=/workspace/scratch/chromium-cache python -u tests/browser_encounters.py`:
  real client/transport unseen creep, camera sighting, committed real attack and
  matching health; actual retreat snapshot/low crawl, no uncaught page errors.
  Writes a screenshot to `/tmp/helium-moon-encounters` by default, or
  `HM_ARTIFACT_DIR`. No direct damage calls in these encounter fixtures.
- Same environment command with `tests/browser_playthrough.py`: full scripted
  movement/audio/pause/objective/win/loss/restart coverage, both real AI attacks,
  then live-AI trail traversal. The close-attack fixture now lets real input sync
  after positioning the player, before aiming the enemy; previously it could
  aim him at the player's previous spawn location.
- Skeleton checks include crawl entry, hundreds of fast gait frames and return
  to walking: finite unit rotations, four-limb IK target error under 1.2 cm,
  planted palms within 2 cm of support height, head below 0.95 m. Simulation
  movement bounds explicitly include the new configured retreat speed.

Final results: all commands above exited 0. The 12-minute simulation averaged
0.36 ms per tick (p99 3.02 ms, worst 36.6 ms); maximum Helium Voice step was
0.71 m per 50 ms, within the configured physical retreat bound. The browser
encounter measured an unseen waiting distance of 1.79 m, a real hit with matched
server/client health, retreat speed 10.50 m/s and animated head height 0.52 m.
The final full browser traversal completed six simulated minutes alive, reaching
about 577 m along the trail, with no uncaught page errors.

These are scripted position fixtures and automated playthroughs, not an
unassisted human survival run. Visibility uses sampled authoritative world
geometry, not a GPU pixel query: tiny camera bob, animation extremities and
network interpolation can differ at edges. Full concealment is the AI goal,
not a guarantee against every rendered leaf gap. Crawl contacts use a local
ground plane; individual limb placement on steep slopes needs further work.
Earlier randomized full-browser runs intermittently failed pickup-glint checks;
the final run passed. Fixture aiming now uses the settled player position and
failures retain beam diagnostics, but repeatability across all pickup variants
still needs investigation. Encounter fixtures and Node objective tests passed.
Real WebRTC speech was not retested for this change; earlier environment UDP
policy limitations remain documented in `CODEX_PLAYTEST.md`.

Next owner playtest: judge whether the cold gives enough warning, whether the
creep-to-lunge transition feels fair, and whether the reverse escape needs more
limb distortion or a longer visible transition. Re-extract a fresh branch ZIP;
the original release and any separately hosted Claude page do not auto-update.
