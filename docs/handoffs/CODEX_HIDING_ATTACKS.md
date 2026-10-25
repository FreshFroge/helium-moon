# Codex: concealment, attacks and wind

Owner feedback: Helium Voice was staying exposed, neither creature was attacking,
the train horn should be removed, and ambient wind should be more noticeable.

- Weighted A* routes were being simplified into straight walkable shortcuts,
  discarding the visibility/cover costs that selected the route. Weighted routes
  now remove only collinear waypoints, preserving their intended detours.
- Observation spots require real head/torso occlusion from every active teammate.
  Exposed watch/retreat endpoints no longer become prolonged stationary poses.
  Retreats favor concealment and cover routes. Failed reveal travel cannot turn
  into a stationary reveal at the wrong location. Deliberate occasional reveals
  and physical movement remain; no teleporting or invisible-render flags were added.
- A recognized nearby player can trigger Helium Voice's chase before flashlight
  retreat overrides it. Within arm's reach, director cooldown is not immunity.
  Attack cooldown still applies, and damage requires a clear line of sight.
- The skunk used to stop about 3 m away, outside its 1.4 m bite range. Its ambush
  now closes to contact after a short pre-lunge windup, then warns/bites/releases
  gas. Leaving during the windup can avoid damage; walls block bites.
- Removed the train timer, synthesis job, playback trigger and generator.
- Wind baseline gain increased from 0.28 to 0.36, with a slightly broader natural
  swell. It remains independent of monster proximity. The cold-only approach
  cues, 6–8 foot creature steps, quiet player footsteps and quiet physiology remain.

Validation: five hiding/navigation regressions, five actual enemy attack/escape/
occlusion regressions, and the existing Node suite. The browser playthrough now
stages close encounters through the real AI (without calling damagePlayer) and
checks both authoritative and client health, alongside objective/win/loss/restart
and a live-AI trail traversal. See test results in the accompanying commit.

Next feedback to collect: whether his cover use feels unpredictable, whether the
skunk windup gives enough reaction time, and wind level on desktop headphones.
