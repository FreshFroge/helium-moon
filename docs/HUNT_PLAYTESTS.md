# Hunt playtests: every Helium Voice hunt logged

Two rounds of 10 playtests, both requested by the owner (October 25, 2026).
**Round 2** runs the new hunt rules; **round 1**, kept below, is the build before
them. The same 10 seeds and team mixes are used, so the rounds compare directly.

## Round 2: new hunt rules (owner-approved, October 25)

Rules under test:
- **Close starts.** A hunt starts only within 35 m (`HV.HUNT_START_RANGE`).
  Farther out, he first closes in unseen through cover.
- **The flashlight is the only way out.** Once a hunt starts, the only way to
  call it off is a **flashlight on him while he's within 7 ft** (2.13 m,
  `HV.HUNT_BREAK_LIT_DIST`) of whoever shines it. It can be the target or a
  teammate.
  - Being seen at any other range no longer stops him.
  - Breaking line of sight or outlasting him doesn't either: when he loses
    the player, he re-acquires their real position every 2.5 s.
  - A hunt still ends when he lands a hit, when the target is downed or dead,
    or when the target reaches the spawn area, which he can't enter.
- **Hum.** The hunt hum plays only within 50 m of him.

Bots changed in one way only: cautious players now **stand their ground**.
During a hunt, once they see him within 12 m, they stop, face him and hold the
light. Steady players and rushers keep running. Steady players glance back over
their shoulder while running, which can also put the light on him.

| | Round 1 (old rules) | **Round 2 (new rules)** |
|---|---|---|
| Hunts | 29 (per game 2, 3, 11, 0, 5, 3, 1, 0, 1, 3) | **15** (per game 1, 2, 2, 0, 1, 5, 1, 0, 0, 3) |
| Distance when it started | median 69 m (up to 134 m) | **median 35 m**: 13 at 33–35 m, plus one at 25 m and one at 10 m out of a planned glimpse |
| Closest he got | median 42 m; within 2.2 m in 3 hunts | **median 1.7 m; within 2.2 m in 14 of 15** |
| Length | median 8 s | **median 15 s** (1–19 s) |
| Player realised they were hunted | 7 of 29 | **15 of 15** (12 saw him, 2 heard him right behind, 1 already running) |
| How hunts ended | 18 broke off on a glimpse, 5 broke off unseen, 3 lost them, **3 hits** | **9 flashed off within 7 ft, 6 hits** |
| Helium Voice hits | 3 | **6** |
| Results | 9 escaped, 1 out of time; 0 deaths | 8 escaped, 2 out of time; **1 death** (hit by him at 13:24, downed by SF6 at 15:25, bled out) |
| Total hunt time | 221 s | 218 s |

### What round 2 shows

1. **Every hunt is now a real encounter.** All 15 started within 35 m (13 at
   33–35 m) and he got within arm's reach in 14. Every target knew they were being
   hunted, and the hum no longer plays for far-off false alarms.
2. **The 7-ft flashlight works, and it takes nerve.**
   - **Cautious players** (who stand their ground) flashed him off in **5 of
     6** hunts, always between 1.8 and 2.1 m. The one failure was a player
     working at the mast who never saw him coming.
   - **Steady players** flashed him off twice by looking back over their
     shoulder while running. They were hit three times.
   - **Rushers** were hit every time (2 of 2).
   - In the four-player game he ran past a teammate's beam within 7 ft
     (1.2 m), which ended the hunt on someone else.
3. **There are fewer hunts, because he has to close in first.**
   - He started closing in **27 times**. **16** of those approaches were
     abandoned after a player glimpsed him: outside a hunt, your earlier rule
     still makes him hide when seen.
   - Only **9** became hunts. The other 6 hunts started with him already
     inside 35 m.
   - Three games had no hunts at all; in round 1 it was two.
4. **It's harder but still survivable.** Helium Voice hits doubled (3 → 6) and
   there was one death, from his hit followed by a skunk hit. Most games still
   ended in escape.

### Possible next steps (not done)

- **More hunts:** keep closing in after being glimpsed while approaching,
  e.g. hide, then resume the approach instead of abandoning it. Or shorten the
  director's cooldown between hunts.
- *Tried and reverted (Oct 25, 07:55 UTC, Claude):* "after being spotted
  while closing in, hide and then resume the approach (up to 3 times)" gave
  **fewer** hunts (11 vs 15) and more abandoned approaches (19 of 27). Each
  resumed approach gives watchful players another chance to spot him.
  Shortening the director's cooldown, or approaching from a flank instead of
  from behind, are the remaining options.
- **Teach the counter:** the bots *know* the 7-ft trick, but real players
  won't. A hint in the kiosk memo or a found note ("it won't stand the light up
  close") would help.

### Every hunt, round 2

#### Playtest 1: solo, seed 2001

Players: p1 (steady, gen branch). Result: **escaped** at 22:48, 3/3 objectives. **1 hunt**; 2 planned glimpses; skunk hits 0. He started closing in 6 times (1 became hunts, 4 gave up after being seen while closing in).

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 11:31 | 11:49 | 19 s | p1 | heading to River Bend Overlook (relay) | stalk | 35 m | 1.1 m | trail 288 m (27 m past River Bend Overlook) | saw him (+2 s) | **caught: hit** |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 0:13 p1 picked up fuel
- 3:05 p1 completed: Start the backup generator
- 7:00 p1 picked up fuse
- 8:09 planned glimpse (watcher)
- 11:49 p1 hit by Helium Voice
- 12:35 p1 completed: Replace the fuse in the trail relay box
- 12:39 planned glimpse (skunk)
- 20:40 p1 completed: Send the distress call from the repeater mast
- 20:40 extraction open

</details>

#### Playtest 2: solo, seed 2002

Players: p1 (rusher, gen branch). Result: **escaped** at 23:30, 3/3 objectives. **2 hunts**; 3 planned glimpses; skunk hits 0. He started closing in 1 time (1 became hunts, 0 gave up after being seen while closing in).

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 9:40 | 9:49 | 9 s | p1 | heading to Old Pump House (gen) | stalk | 25 m | 1.2 m | trail 1299 m (41 m past Fishing Bank) | heard him right behind (+9 s) | **caught: hit** |
| 2 | 19:37 | 19:39 | 1 s | p1 | running from Helium Voice | reveal | 10 m | 1.2 m | trail 1179 m (79 m before Fishing Bank) | already running | **caught: hit** |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 3:52 p1 picked up fuse
- 8:25 p1 picked up fuel
- 9:02 planned glimpse (watcher)
- 9:49 p1 hit by Helium Voice
- 10:47 planned glimpse (skunk)
- 14:32 p1 completed: Start the backup generator
- 18:06 p1 completed: Replace the fuse in the trail relay box
- 19:31 planned glimpse (crossing)
- 19:39 p1 hit by Helium Voice
- 21:27 p1 completed: Send the distress call from the repeater mast
- 21:27 extraction open

</details>

#### Playtest 3: solo, seed 2003

Players: p1 (cautious, gen branch). Result: **time up** at 30:00, 2/3 objectives. **2 hunts**; 6 planned glimpses; skunk hits 0. He started closing in 4 times (1 became hunts, 3 gave up after being seen while closing in).

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 17:03 | 17:17 | 14 s | p1 | heading to Old Pump House (gen) | stalk | 33 m | 2.1 m | trail 719 m (60 m before Ranger Maintenance Shed) | saw him (+3 s) | **flashed off at 2.1 m by the target** |
| 2 | 24:52 | 25:08 | 16 s | p1 | heading to Slough Footbridge (relay) | stalk | 35 m | 2.0 m | trail 931 m (98 m past Abandoned Campsite) | saw him (+2 s) | **flashed off at 2.0 m by the target** |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 4:16 planned glimpse (watcher)
- 6:19 planned glimpse (crossing)
- 7:46 p1 picked up fuse
- 11:59 p1 picked up fuel
- 16:29 planned glimpse (watcher)
- 19:40 p1 completed: Start the backup generator
- 19:41 planned glimpse (crossing)
- 22:43 planned glimpse (skunk)
- 25:53 planned glimpse (watcher)
- 26:16 p1 completed: Replace the fuse in the trail relay box

</details>

#### Playtest 4: solo, seed 2004

Players: p1 (steady, gen branch). Result: **escaped** at 18:18, 3/3 objectives. **0 hunts**; 0 planned glimpses; skunk hits 2. He started closing in 0 times (0 became hunts, 0 gave up after being seen while closing in).

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

#### Playtest 5: 2 players, seed 2005

Players: p1 (cautious, gen branch), p2 (cautious, relay branch). Result: **escaped** at 21:30, 3/3 objectives. **1 hunt**; 4 planned glimpses; skunk hits 1. He started closing in 1 time (1 became hunts, 0 gave up after being seen while closing in).

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 5:21 | 5:39 | 18 s | p1 | heading for the gas can | stalk | 35 m | 2.0 m | trail 548 m (35 m before Pond Wildlife Blind) | saw him (+1 s) | **flashed off at 2.1 m by the target** |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 4:20 p2 picked up fuse
- 4:21 planned glimpse (crossing)
- 6:31 planned glimpse (watcher)
- 7:34 p2 completed: Replace the fuse in the trail relay box
- 11:07 planned glimpse (crossing)
- 11:13 p1 picked up fuel
- 12:39 planned glimpse (skunk)
- 12:54 p2 completed: Start the backup generator
- 16:17 p2 hit by SF6
- 17:30 p1 completed: Send the distress call from the repeater mast
- 17:30 extraction open

</details>

#### Playtest 6: 2 players, seed 2006

Players: p1 (steady, gen branch), p2 (cautious, relay branch). Result: **time up** at 30:00, 3/3 objectives. **5 hunts**; 9 planned glimpses; skunk hits 2. He started closing in 6 times (3 became hunts, 3 gave up after being seen while closing in).

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 6:12 | 6:24 | 13 s | p1 | following p2 | stalk | 35 m | 1.8 m | trail 617 m (34 m past Pond Wildlife Blind) | saw him (+8 s) | **flashed off at 2.1 m by the target** |
| 2 | 8:42 | 9:00 | 18 s | p1 | following p2 | stalk | 35 m | 1.5 m | trail 903 m (71 m past Abandoned Campsite) | saw him (+2 s) | **flashed off at 1.9 m by the target** |
| 3 | 13:06 | 13:24 | 19 s | p1 | following p2 | stalk | 35 m | 1.2 m | trail 1368 m (98 m before Old Repeater Mast) | saw him (+2 s) | **caught: hit** |
| 4 | 17:25 | 17:40 | 15 s | p2 | heading to Fishing Bank (relay) | stalk | 34 m | 1.7 m | at Old Repeater Mast | saw him (+0 s) | **flashed off at 1.8 m by the target** |
| 5 | 26:16 | 26:27 | 12 s | p2 | sending the distress call at the mast | stalk | 33 m | 1.2 m | at Old Repeater Mast | heard him right behind (+11 s) | **caught: hit** |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 2:17 p1 picked up fuel
- 2:57 p1 completed: Start the backup generator
- 7:13 planned glimpse (crossing)
- 8:33 planned glimpse (skunk)
- 10:01 planned glimpse (crossing)
- 12:27 planned glimpse (watcher)
- 13:24 p1 hit by Helium Voice
- 13:48 planned glimpse (crossing)
- 13:57 p2 picked up fuse
- 15:24 p1 downed by SF6
- 16:14 p1 dead
- 18:25 planned glimpse (watcher)
- 22:26 p2 completed: Replace the fuse in the trail relay box
- 23:01 p2 hit by SF6
- 23:56 planned glimpse (crossing)
- 25:19 planned glimpse (skunk)
- 25:54 planned glimpse (watcher)
- 26:24 p2 completed: Send the distress call from the repeater mast
- 26:24 extraction open
- 26:27 p2 hit by Helium Voice

</details>

#### Playtest 7: 2 players, seed 2007

Players: p1 (steady, gen branch), p2 (cautious, relay branch). Result: **escaped** at 16:12, 3/3 objectives. **1 hunt**; 1 planned glimpse; skunk hits 0. He started closing in 2 times (1 became hunts, 1 gave up after being seen while closing in).

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 6:09 | 6:28 | 18 s | p1 | following p2 | stalk | 35 m | 1.2 m | at Pond Wildlife Blind | saw him (+2 s) | **caught: hit** |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 3:38 p1 picked up fuel
- 4:40 planned glimpse (crossing)
- 5:15 p1 completed: Start the backup generator
- 6:28 p1 hit by Helium Voice
- 10:30 p2 picked up fuse
- 12:03 p1 completed: Replace the fuse in the trail relay box
- 13:39 p1 completed: Send the distress call from the repeater mast
- 13:39 extraction open

</details>

#### Playtest 8: 3 players, seed 2008

Players: p1 (rusher, gen branch), p2 (rusher, relay branch), p3 (steady, escort). Result: **escaped** at 22:48, 3/3 objectives. **0 hunts**; 2 planned glimpses; skunk hits 0. He started closing in 0 times (0 became hunts, 0 gave up after being seen while closing in).

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

#### Playtest 9: 3 players, seed 2009

Players: p1 (steady, gen branch), p2 (steady, relay branch), p3 (rusher, escort). Result: **escaped** at 14:12, 3/3 objectives. **0 hunts**; 1 planned glimpse; skunk hits 0. He started closing in 2 times (0 became hunts, 2 gave up after being seen while closing in).

_No hunts._

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 3:31 p1 picked up fuel
- 3:46 p2 picked up fuse
- 4:10 planned glimpse (watcher)
- 4:52 p1 completed: Start the backup generator
- 6:04 p2 completed: Replace the fuse in the trail relay box
- 11:48 p1 completed: Send the distress call from the repeater mast
- 11:48 extraction open

</details>

#### Playtest 10: 4 players, seed 2010

Players: p1 (cautious, gen branch), p2 (rusher, relay branch), p3 (rusher, escort), p4 (steady, escort). Result: **escaped** at 24:42, 3/3 objectives. **3 hunts**; 8 planned glimpses; skunk hits 1. He started closing in 5 times (1 became hunts, 3 gave up after being seen while closing in).

| # | Start | End | Length | Target | Target was | He was | Distance at start | Closest | Where | Player realised | How it ended |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 6:46 | 7:00 | 14 s | p4 | following p1 | stalk | 34 m | 17.9 m | trail 649 m (66 m past Pond Wildlife Blind) | saw him (+3 s) | **flashed off at 1.2 m by teammate p3** |
| 2 | 12:50 | 13:04 | 15 s | p1 | following p2 | stalk | 35 m | 1.7 m | trail 1170 m (86 m past Slough Footbridge) | saw him (+3 s) | **flashed off at 2.0 m by the target** |
| 3 | 13:37 | 13:54 | 18 s | p1 | following p2 | stalk | 35 m | 1.8 m | trail 1199 m (59 m before Fishing Bank) | saw him (+3 s) | **flashed off at 2.1 m by the target** |

<details><summary>Session timeline</summary>

- 0:00 p1 picked up the memo
- 6:24 p2 picked up fuse
- 8:41 planned glimpse (crossing)
- 9:49 p2 completed: Replace the fuse in the trail relay box
- 11:12 planned glimpse (watcher)
- 12:31 p1 picked up fuel
- 13:06 planned glimpse (skunk)
- 16:02 p2 completed: Start the backup generator
- 16:06 planned glimpse (crossing)
- 16:55 planned glimpse (skunk)
- 18:00 planned glimpse (crossing)
- 18:50 planned glimpse (skunk)
- 20:13 p4 hit by SF6
- 20:57 planned glimpse (crossing)
- 21:31 p1 completed: Send the distress call from the repeater mast
- 21:31 extraction open

</details>

---

## Round 1: before the new rules (build `4571318`)

Requested by the owner (October 25, 2026): "do 10 playtests documenting all
times that Helium Voice hunts". Run by Claude on build `4571318` (shared branch
tip, includes Codex's encounter/route/glimpse passes and the hunt hum).

**What counts as a hunt:** the director's chase window, from `chase` on to
`chase` off. That's exactly when the client plays the hunt hum. Times are the
game clock from session start (the opening dread period ends at 3:39).

### Summary

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

### What this shows

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

### Suggested changes (made for round 2; B became the 7-ft flashlight rule)

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

### Method and limits

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

### Every hunt, by playtest

The "Player realised" column is when the target actually saw or heard him,
relative to the hunt start. "Never" means the hum was all they got.

#### Playtest 1: solo, seed 2001

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

#### Playtest 2: solo, seed 2002

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

#### Playtest 3: solo, seed 2003

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

#### Playtest 4: solo, seed 2004

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

#### Playtest 5: 2 players, seed 2005

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

#### Playtest 6: 2 players, seed 2006

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

#### Playtest 7: 2 players, seed 2007

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

#### Playtest 8: 3 players, seed 2008

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

#### Playtest 9: 3 players, seed 2009

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

#### Playtest 10: 4 players, seed 2010

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
