# Hunt playtests: 10 sessions, every Helium Voice hunt logged

Requested by the owner (October 25, 2026): "do 10 playtests documenting all
times that Helium Voice hunts". Run by Claude on build `4571318` (shared branch
tip, includes Codex's encounter/route/glimpse passes and the hunt hum).

**What counts as a hunt:** the director's chase window, from `chase` on to
`chase` off. That's exactly when the client plays the hunt hum. Times are the
game clock from session start (the opening dread period ends at 3:39).

## Summary

| | |
|---|---|
| Playtests | 10: 4 solo, 3 duos, 2 trios, 1 four-player; ~219 minutes of play |
| Results | **9 escaped** (13–27 min), 1 ran out of the 30-min cap with all 3 objectives done; **0 deaths** |
| Hunts | **29 in total**; per game 2, 3, 11, 0, 5, 3, 1, 0, 1, 3 (two games had none) |
| First hunt | median 6:20 (earliest 4:18, latest 17:03) |
| Length | median 8 s (1–20 s); 221 s of hunting in 219 min (≈1.7% of play) |
| Distance when it started | median **69 m**; only 5 of 29 started within 40 m |
| Closest he got | median **42 m**; only 3 hunts came within 5 m |
| What started it | 28 from stalking, 1 from a planned glimpse |
| How hunts ended | 16: target saw him, so he broke off to hide · 2: a teammate saw him, so he broke off · 5: broke off unseen · 3: lost them and searched · **3: hit** (0 downs, 0 kills) |
| Did the player realise? | 7 of 29 (4 saw him, 2 heard him right behind, 1 already running). The other 22: the hum was the only sign |
| Hunts per 5-min window (all games) | 0–5: 2 · 5–10: 8 · 10–15: 4 · 15–20: 5 · 20–25: 5 · 25–30: 5. Per game still running, that's 0.2 · 0.8 · 0.4 · 0.6 · 1.1 · 3.4 per 5 min |
| Other pressure | 32 planned glimpses, 4 skunk hits, 3 Helium Voice hits (all inside hunts) |

## What this shows

1. **Most hunts are false alarms.** A typical hunt:
   - he's stalking ~70 m away and commits;
   - the hum swells;
   - within about 8 s he breaks off.

   The player never sees or hears him in 22 of 29 hunts, so what they get is
   a hum that comes and goes.
2. **The "stay out of sight" rule cancels hunts.** 18 of 29 ended because the
   target or a teammate had him on screen, usually for **0.1–0.2 s at
   30–60 m**. That's far enough away at night that a real player probably
   wouldn't notice him. Owner decision 1 ("stay out of sight if he's on your
   screen") is currently overriding the hunt itself.
3. **Only players who never look back get caught.** Two of the three hits
   were on the rusher in playtest 2, who never glances back. The first time,
   they only noticed him from his footsteps right behind; the second time,
   they were still running from him. The third hit was on the cautious
   player in playtest 3, from a planned glimpse 10 m away. Glancing around
   regularly is nearly complete protection.
4. **It's too easy right now:** 0 deaths in 10 games, and 9 of 10 escaped.
5. **The hum can become a tell.** It fires about 3 times per game, but
   **11 times** in the cautious solo game (all of them in its last 13 minutes,
   roughly every 1–2 minutes), and most of those hums are followed by nothing.
6. **Escalation works for frequency once you allow for games ending.** Per
   game still running, hunts rise from 0.4 (10–15 min) to 0.6, 1.1, then 3.4
   per 5 minutes. The last window covers only two games and is mostly
   playtest 3. What doesn't escalate is how close or committed the hunts are:
   late hunts still start ~60–100 m away and end on a glimpse.
7. **More players means fewer hunts.** Trios and the four-player game got 0,
   1 and 3. His concealment rule triggers more often with more eyes.

## Suggested changes (not made yet)

- **A. Start hunts closer** (Codex, `heliumVoice.js`): commit only when he's
  within ~30–35 m, approaching unseen before that. Then a hunt is a real
  event.
- **B. Commit once a hunt starts** (needs an owner decision; it modifies
  decision 1): during a hunt, a brief far glimpse shouldn't call it off. For
  example, he only breaks off if he's clearly seen (≥0.7 s, within ~25 m or in
  the flashlight beam), or he never breaks off until he hits or loses the
  player.
- **C. Hum only when he's actually closing** (Claude, `audio.js`): e.g. start
  the hum when he's within ~50 m of his target, so it stops being a far-off
  false alarm.

## Method and limits

- **Harness:** `tests/hunt_playtests.mjs`. It runs the same authoritative
  `GameSim` the server runs, at 20 Hz, with no rendering.
- **The bots** play the real objective chain: memo, gas can, generator, fuse,
  relay, mast, extraction. They:
  - walk the trail and use `findPath` for off-trail legs;
  - split into a generator branch and a relay branch, with extras escorting;
  - revive downed teammates;
  - sprint with real stamina (9 s, regen after 1.2 s).
- **Personalities:**
  - *cautious*: glances every 9–16 s, looks up from repairs every ~5 s, walks;
  - *steady*: glances every 18–32 s, jogs in bursts;
  - *rusher*: never looks back, sprints whenever it can.
- **What they perceive** matches the client:
  - his vocals and footsteps are audible only within 2.4 m;
  - the hum is audible to everyone ~1.5 s into a hunt (cautious and steady
    players then sweep their view; rushers sprint);
  - they flee once they actually **see** him (the same on-screen + line-of-sight
    check the AI uses, within 45 m), hear him close, or get hit.
- **Not human:**
  - bots know where items are;
  - they don't crouch, hide or turn the light off;
  - they don't use voice chat, so mimicry never triggers;
  - their off-trail legs follow nav-grid paths without the client's physics.

  Treat these as consistent comparisons between builds, not as how a person
  would play. Re-run with `HUNT_JSON=out.json node tests/hunt_playtests.mjs`
  (~60 s).

## Every hunt, by playtest

The "Player realised" column is when the target actually saw or heard him,
relative to the hunt start. "Never" means the hum was all they got.

### Playtest 1: solo, seed 2001

Players: p1 (steady, gen branch). Result: **escaped** at 21:00, 3/3 objectives. **2 hunts**; 2 planned glimpses; skunk hits 0.

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 7:36 | 7:56 | 20 s | p1 | heading to River Bend Overlook (relay) | stalk | 104 m | 40 m | trail 1036 m (49 m before Slough Footbridge) | never | lost them → searched last-seen spot |
| 2 | 14:30 | 14:39 | 9 s | p1 | heading to the repeater mast | stalk | 134 m | 104 m | trail 709 m (71 m before Ranger Maintenance Shed) | never | lost them → searched last-seen spot |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 0:13 p1 picked up fuel
- 3:05 p1 completed: Start the backup generator
- 7:00 p1 picked up fuse
- 11:49 p1 completed: Replace the fuse in the trail relay box
- 12:11 planned glimpse (watcher)
- 13:49 planned glimpse (crossing)
- 18:50 p1 completed: Send the distress call from the repeater mast
- 18:50 extraction open

</details>

### Playtest 2: solo, seed 2002

Players: p1 (rusher, gen branch). Result: **escaped** at 23:42, 3/3 objectives. **3 hunts**; 2 planned glimpses; skunk hits 0.

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 9:40 | 9:49 | 9 s | p1 | heading to Old Pump House (gen) | stalk | 25 m | 1 m | trail 1299 m (41 m past Fishing Bank) | heard him right behind (+9 s) | **caught: hit** |
| 2 | 18:43 | 18:53 | 10 s | p1 | running from Helium Voice | stalk | 40 m | 1 m | trail 1195 m (63 m before Fishing Bank) | already running | **caught: hit** |
| 3 | 21:39 | 21:58 | 19 s | p1 | sending the distress call at the mast | stalk | 46 m | 41 m | at Old Repeater Mast | never | lost them → searched last-seen spot |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 3:52 p1 picked up fuse
- 8:25 p1 picked up fuel
- 9:02 planned glimpse (watcher)
- 9:49 p1 hit by Helium Voice
- 10:47 planned glimpse (skunk)
- 14:32 p1 completed: Start the backup generator
- 18:06 p1 completed: Replace the fuse in the trail relay box
- 18:53 p1 hit by Helium Voice
- 21:41 p1 completed: Send the distress call from the repeater mast
- 21:41 extraction open

</details>

### Playtest 3: solo, seed 2003

Players: p1 (cautious, gen branch). Result: **time up** at 30:00, 3/3 objectives. **11 hunts**; 6 planned glimpses; skunk hits 0.

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 17:03 | 17:06 | 3 s | p1 | heading to Old Pump House (gen) | stalk | 33 m | 21 m | trail 719 m (60 m before Ranger Maintenance Shed) | never | **target saw him** → he broke off to hide |
| 2 | 18:38 | 18:41 | 3 s | p1 | heading to Old Pump House (gen) | stalk | 70 m | 60 m | trail 531 m (52 m before Pond Wildlife Blind) | never | **target saw him** → he broke off to hide |
| 3 | 20:14 | 20:21 | 7 s | p1 | heading to Slough Footbridge (relay) | stalk | 79 m | 54 m | trail 490 m (51 m past Old Pump House) | never | **target saw him** → he broke off to hide |
| 4 | 21:47 | 21:49 | 2 s | p1 | heading to Slough Footbridge (relay) | stalk | 65 m | 58 m | trail 652 m (69 m past Pond Wildlife Blind) | never | **target saw him** → he broke off to hide |
| 5 | 22:55 | 23:03 | 8 s | p1 | heading to Slough Footbridge (relay) | stalk | 68 m | 44 m | at Ranger Maintenance Shed | saw him (+7 s) | **target saw him** → he broke off to hide |
| 6 | 24:06 | 24:07 | 1 s | p1 | heading to Slough Footbridge (relay) | reveal | 10 m | 1 m | trail 921 m (88 m past Abandoned Campsite) | heard him right behind (+1 s) | **caught: hit** |
| 7 | 26:39 | 26:53 | 14 s | p1 | heading to the repeater mast | stalk | 100 m | 32 m | trail 1116 m (31 m past Slough Footbridge) | never | **target saw him** → he broke off to hide |
| 8 | 27:19 | 27:28 | 9 s | p1 | heading to the repeater mast | stalk | 73 m | 41 m | trail 1207 m (51 m before Fishing Bank) | never | broke off unseen |
| 9 | 28:00 | 28:13 | 13 s | p1 | heading to the repeater mast | stalk | 86 m | 42 m | at Fishing Bank | never | **target saw him** → he broke off to hide |
| 10 | 28:34 | 28:48 | 15 s | p1 | heading to the repeater mast | stalk | 83 m | 39 m | trail 1359 m (102 m past Fishing Bank) | never | broke off unseen |
| 11 | 29:29 | 29:38 | 8 s | p1 | sending the distress call at the mast | stalk | 63 m | 20 m | at Old Repeater Mast | never | broke off unseen |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 4:16 planned glimpse (watcher)
- 6:19 planned glimpse (crossing)
- 7:46 p1 picked up fuse
- 11:59 p1 picked up fuel
- 16:29 planned glimpse (watcher)
- 19:45 p1 completed: Start the backup generator
- 20:59 planned glimpse (skunk)
- 23:42 planned glimpse (crossing)
- 24:07 p1 hit by Helium Voice
- 26:26 p1 completed: Replace the fuse in the trail relay box
- 28:08 planned glimpse (skunk)
- 29:39 p1 completed: Send the distress call from the repeater mast
- 29:39 extraction open

</details>

### Playtest 4: solo, seed 2004

Players: p1 (steady, gen branch). Result: **escaped** at 18:18, 3/3 objectives. **0 hunts**; 0 planned glimpses; skunk hits 2.

_No hunts._

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 3:36 p1 picked up fuel
- 4:04 p1 hit by SF6
- 5:18 p1 completed: Start the backup generator
- 11:39 p1 picked up fuse
- 13:57 p1 hit by SF6
- 14:30 p1 completed: Replace the fuse in the trail relay box
- 16:07 p1 completed: Send the distress call from the repeater mast
- 16:07 extraction open

</details>

### Playtest 5: 2 players, seed 2005

Players: p1 (cautious, gen branch), p2 (cautious, relay branch). Result: **escaped** at 23:30, 3/3 objectives. **5 hunts**; 8 planned glimpses; skunk hits 2.

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5:03 | 5:11 | 8 s | p1 | heading for the gas can | stalk | 72 m | 43 m | trail 516 m (67 m before Pond Wildlife Blind) | saw him (+8 s) | **target saw him** → he broke off to hide |
| 2 | 6:15 | 6:19 | 4 s | p2 | heading to Pond Wildlife Blind (relay) | stalk | 82 m | 60 m | at Pond Wildlife Blind | never | **target saw him** → he broke off to hide |
| 3 | 7:22 | 7:28 | 6 s | p2 | following p1 | stalk | 67 m | 49 m | at Pond Wildlife Blind | never | **target saw him** → he broke off to hide |
| 4 | 11:22 | 11:27 | 5 s | p2 | heading to Ranger Maintenance Shed (gen) | stalk | 63 m | 41 m | trail 927 m (94 m past Abandoned Campsite) | saw him (+4 s) | **target saw him** → he broke off to hide |
| 5 | 15:02 | 15:06 | 4 s | p1 | heading to the repeater mast | stalk | 79 m | 50 m | at Slough Footbridge | never | broke off unseen |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 4:20 p2 picked up fuse
- 4:21 planned glimpse (crossing)
- 5:45 planned glimpse (watcher)
- 6:09 p2 hit by SF6
- 7:00 p2 completed: Replace the fuse in the trail relay box
- 8:03 planned glimpse (crossing)
- 9:30 planned glimpse (skunk)
- 11:19 p1 picked up fuel
- 12:55 planned glimpse (watcher)
- 13:30 p2 completed: Start the backup generator
- 14:43 planned glimpse (crossing)
- 15:53 p1 hit by SF6
- 17:12 planned glimpse (skunk)
- 19:40 planned glimpse (crossing)
- 19:49 p1 completed: Send the distress call from the repeater mast
- 19:49 extraction open

</details>

### Playtest 6: 2 players, seed 2006

Players: p1 (steady, gen branch), p2 (cautious, relay branch). Result: **escaped** at 22:18, 3/3 objectives. **3 hunts**; 6 planned glimpses; skunk hits 0.

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5:52 | 5:55 | 2 s | p1 | following p2 | stalk | 58 m | 51 m | at Pond Wildlife Blind | never | broke off unseen |
| 2 | 8:17 | 8:30 | 13 s | p1 | following p2 | stalk | 71 m | 27 m | at Abandoned Campsite | never | **teammate saw him** → he broke off to hide |
| 3 | 16:05 | 16:09 | 4 s | p1 | heading to Fishing Bank (relay) | stalk | 83 m | 56 m | trail 1403 m (64 m before Old Repeater Mast) | never | **target saw him** → he broke off to hide |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 2:17 p1 picked up fuel
- 2:57 p1 completed: Start the backup generator
- 7:01 planned glimpse (watcher)
- 12:23 planned glimpse (crossing)
- 14:01 planned glimpse (watcher)
- 14:35 p2 picked up fuse
- 15:28 planned glimpse (crossing)
- 17:56 planned glimpse (skunk)
- 18:09 p1 completed: Replace the fuse in the trail relay box
- 19:06 planned glimpse (watcher)
- 19:46 p1 completed: Send the distress call from the repeater mast
- 19:46 extraction open

</details>

### Playtest 7: 2 players, seed 2007

Players: p1 (steady, gen branch), p2 (cautious, relay branch). Result: **escaped** at 16:23, 3/3 objectives. **1 hunt**; 2 planned glimpses; skunk hits 0.

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4:18 | 4:26 | 9 s | p2 | heading for the orange fuse kit | stalk | 75 m | 52 m | at Old Pump House | never | **target saw him** → he broke off to hide |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 3:38 p1 picked up fuel
- 5:15 p1 completed: Start the backup generator
- 5:54 planned glimpse (skunk)
- 7:30 planned glimpse (watcher)
- 10:43 p2 picked up fuse
- 12:19 p1 completed: Replace the fuse in the trail relay box
- 13:55 p1 completed: Send the distress call from the repeater mast
- 13:55 extraction open

</details>

### Playtest 8: 3 players, seed 2008

Players: p1 (rusher, gen branch), p2 (rusher, relay branch), p3 (steady, escort). Result: **escaped** at 22:48, 3/3 objectives. **0 hunts**; 2 planned glimpses; skunk hits 0.

_No hunts._

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 4:13 p2 picked up fuse
- 6:06 p2 completed: Replace the fuse in the trail relay box
- 8:32 p1 picked up fuel
- 11:41 planned glimpse (crossing)
- 14:39 p2 completed: Start the backup generator
- 17:21 planned glimpse (watcher)
- 20:23 p1 completed: Send the distress call from the repeater mast
- 20:23 extraction open

</details>

### Playtest 9: 3 players, seed 2009

Players: p1 (steady, gen branch), p2 (steady, relay branch), p3 (rusher, escort). Result: **escaped** at 13:18, 3/3 objectives. **1 hunt**; 2 planned glimpses; skunk hits 0.

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 4:31 | 4:34 | 3 s | p1 | heading to Old Pump House (gen) | stalk | 40 m | 33 m | at Old Pump House | saw him (+3 s) | **target saw him** → he broke off to hide |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 3:31 p1 picked up fuel
- 3:46 p2 picked up fuse
- 4:10 planned glimpse (watcher)
- 5:07 p1 completed: Start the backup generator
- 5:50 p2 completed: Replace the fuse in the trail relay box
- 6:26 planned glimpse (skunk)
- 10:59 p1 completed: Send the distress call from the repeater mast
- 10:59 extraction open

</details>

### Playtest 10: 4 players, seed 2010

Players: p1 (cautious, gen branch), p2 (rusher, relay branch), p3 (rusher, escort), p4 (steady, escort). Result: **escaped** at 27:24, 3/3 objectives. **3 hunts**; 2 planned glimpses; skunk hits 0.

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 6:46 | 6:47 | 2 s | p4 | following p1 | stalk | 34 m | 30 m | trail 649 m (66 m past Pond Wildlife Blind) | never | **teammate saw him** → he broke off to hide |
| 2 | 12:39 | 12:41 | 2 s | p4 | following p2 | stalk | 57 m | 53 m | trail 986 m (99 m before Slough Footbridge) | never | **target saw him** → he broke off to hide |
| 3 | 13:47 | 13:55 | 8 s | p4 | following p2 | stalk | 66 m | 47 m | trail 1111 m (26 m past Slough Footbridge) | never | **target saw him** → he broke off to hide |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 6:24 p2 picked up fuse
- 9:43 planned glimpse (crossing)
- 9:49 p2 completed: Replace the fuse in the trail relay box
- 13:53 p1 picked up fuel
- 18:03 p2 completed: Start the backup generator
- 19:48 planned glimpse (watcher)
- 25:03 p1 completed: Send the distress call from the repeater mast
- 25:03 extraction open

</details>
