# Owner decisions, Oct 25 ~16:45 UTC (relayed and implemented by Claude)

Owner's words: "make him far more active like 2-3x more active and also for some
reason he isnt talking, in addition i want his attack to be more scary, instead of
him just coming up hitting and running really quick i want him to like scream swing
at you and startle the player, also i dont want him to move out of player sight as
fast as he is now when you look at him from a distance"

## 1. More active
- **Director:** chase cooldown 50/22 → 16/8 s; attack cooldown 40/18 → 14/7 s;
  relax and build phases roughly halved; reveal gap 75–130 → 26–45 s; presence
  wait 25 → 12 s. Hazard ×3.5 and base aggression 0.12 → 0.2. Forced relax now
  triggers at intensity 2.4 instead of 1.6, and intensity decays faster.
- **Measured** (same 10 hunt playtests, per minute of play): hunts ×1.6,
  planned glimpses ×2.2, relocations ×1.8, spoken lines ~×6, plus the new stares.
  Solo runs are noticeably deadlier.
- The opening dread time is **unchanged**, per the earlier owner decision.

## 2. He talks
Close vocals were range-gated to 2.4 m, which is why nobody heard him.
- His spoken lines now go out as server-chosen `hv_line` events. Distant calls
  ("Hello?", "Where are you?") and his real recorded chatter are audible to
  ~45 m.
- Chances were raised and the cooldown is now 9–16 s.
- While he stares at you, he sometimes says "I can see you." or "Hey."

## 3. Attack
- **Before the hit:** he stops, **screams**, and winds up with arms thrown up
  and claws forward (`HV.WINDUP` 0.6 s). The scream is heard to 60 m and shakes
  the camera.
- **The swing:** arms come down and across with a whoosh, landing within
  `HV.STRIKE_REACH` 2.3 m.
- **After a hit:** he stays standing over you, staring, for `HV.LINGER` 1.6 s,
  then backs off at walking pace (no sprint-off). On a hit he sometimes says
  "Found you." / "Got you." / "Hold still."
- **Counterplay:** the 7-ft flashlight still breaks the windup.
- **Camera lock:** only on the actual hit, within 4 ft. Locking during the windup
  would aim your flashlight at him and give you a free escape.
- **Snapshot flags:** 32 = windup, 64 = strike (client animator poses).

## 4. Slower to disappear when seen from a distance
- Seen from beyond 10 m, he holds still and **stares back** for 3–6 s (1.8–3.2 s
  if a flashlight is on him), then leaves at **walking pace** (2.4 m/s instead of
  the 10.5 m/s crawl).
- If he was closing in on someone, he slips back into cover and keeps coming.
- Close up, or flashed within 7 ft, he still goes at once.

## Also fixed along the way
- **Roam freeze:** a roam leg could end off-map, freezing him in roam (nav_stuck,
  seed 1003). He now plans the whole trip in that case.
- **Relocation edge case:** relocation now checks jittered spots, so a
  borderline sightline can't let him arrive in view.
