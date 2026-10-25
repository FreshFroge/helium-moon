# Helium Voice speech and vocal direction

Research and writing brief for the recorded Helium Voice voice, October 25,
2026. This complements `SCARE_RESEARCH.md` and follows the owner's established
rules: cold is the automatic approach warning, long silences matter, speech
must not become a distance meter, and Helium Voice must sound disturbing rather
than funny.

## Recommendation

Helium Voice should speak rarely, clearly enough to be understood, and as if he
is trying to sound like a person rather than performing as a monster. His best
lines are ordinary social phrases used in the wrong place. He should never
deliver lore, speeches, jokes, or a stream of combat barks.

Do alter the recording at close range, but change its **texture**, not its basic
pitch or loudness. Distance and forest occlusion should supply the location
information. A continuous distortion-by-distance curve would become a precise
rangefinder and would undermine uncertainty.

Use three treatments:

| Context | Treatment | Intended effect |
|---|---|---|
| Distant call, usually 35–80 m | Recognizable high voice; light forest reflections; slightly narrowed bandwidth; at most one very quiet delayed whisper double | It may be a lost person or a player until the words register |
| Near presence, roughly 5–15 m and only for selected lines | Much drier and closer; retain the high voice; add faint irregular pitch flutter, breath noise, and a low octave/subharmonic at about 8–12% wet mix; one unstable double delayed 18–35 ms | The same voice suddenly reveals a body underneath it |
| Attack/contact | Nearly dry; no giant reverb tail; short onset; momentary roughness or two competing fundamental periods; never normalized louder than other close vocals | Intimacy and loss of vocal control rather than a jump-scare blast |

The close layer should be nonlinear and irregular. Fixed chorus, robotic ring
modulation, a constant demon octave, or excessive reversed speech will sound
like an audio plug-in. Preserve consonants and the owner's real performance.
Never pitch an entire line upward again if the source already has the correct
Helium Voice identity.

## What he should say

The strongest bank is built from short, plausible phrases. Record several
performances of each line: one neutral and tentative, one smiling, one nearly
breathless. Do not record every line as a sinister whisper; variation keeps the
player from learning the emotional cue.

### Highest-priority recording list

These 18 lines are the recommended first session:

1. “Hello?”
2. “Hey.”
3. “Wait.”
4. “Come here.”
5. “Where are you?”
6. “I heard you.”
7. “Was that you?”
8. “Are you still there?”
9. “I can see you.”
10. “You left me.”
11. “Don’t leave.”
12. “Come back.”
13. “There you are.”
14. “Found you.”
15. “Too slow.”
16. “Hold still.”
17. “Got you.”
18. “Again.”

The first eight are useful distant calls. Lines 9–12 belong to watched,
stalking, or failed-search moments. Lines 13–18 are reserved for hunts and
contact. “Again” should be exceptionally rare and only follows a repeated
escape tactic; without that context it is meaningless.

### Contextual selection

| Situation | Best lines | Frequency |
|---|---|---|
| Distant roam/search | “Hello?”, “Where are you?”, “Was that you?”, “Are you still there?” | One line in only some search cycles; never repeated back-to-back |
| Heard player voice or footsteps | “I heard you.”, “Was that you?”, or an opt-in captured phrase | Acknowledges the real stimulus after a variable delay |
| Watching while concealed | Usually silence; rarely “I can see you.” or a soft “Hey.” | The line should occur after he has already been present, not announce his arrival |
| Player walks away after seeing him | “Don’t leave.”, “Come back.”, “You left me.” | Rare; strongest when he does not immediately chase |
| Hunt begins | Usually the existing nonverbal cry; occasionally “There you are.” | A spoken line on at most roughly one hunt in four |
| Closing the last few metres | Silence or strained inhalation | Speech here must not reliably reveal exact timing |
| Successful strike | “Found you.”, “Got you.”, “Hold still.”, or a clipped laugh | Spoken on about one third of hits; never before every hit |
| Flashlight forces retreat | Breathless laugh, “Too slow.”, or silence | “Too slow” only if he escaped without landing the hit |
| Same counter used repeatedly | “Again.” | Very rare payoff for the learning system |

## Attack direction

The most frightening default attack sound is **not a sentence**. Use a sharp
inhaled onset, a half-formed vowel, then a close broken laugh or breath at the
moment of contact. A complete line should occur on only about one third of
successful strikes. This prevents the phrase from becoming an attack telegraph
and stops repetition from turning it into a catchphrase.

When a line is selected, “Found you” is the best primary line. It confirms that
the long unseen search has resolved and makes the encounter personal without
sounding theatrical. “Got you” is shorter and more physical. “Hold still” is
the cruelest option and should therefore be rare. Avoid “I’m going to kill
you,” “You can’t escape,” name-calling, profanity, and long threats; familiar
villain writing makes him feel scripted and less intelligent.

The spoken consonant may begin during the reach animation, but the recognizable
word should complete at or just after authoritative damage. That keeps network
latency from producing a spoken hit on an attack the player actually avoided.

## Why this should work

- *Alien: Isolation* creates tension by giving its creature understandable
  senses and spatial sounds while withholding exact decisions. The game uses a
  director to bring danger into the player's area, then lets the creature find
  them. Helium Voice's speech should reveal intent in hindsight, not provide a
  constant tactical readout. See Tommy Thompson's analysis summarized by
  [Game Developer](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation).
- Frictional's horror guidance emphasizes that imagination needs space and that
  repeated, legible systems lose their power. Sparse lines with multiple valid
  meanings preserve that uncertainty. See Thomas Grip's
  [discussion of *Amnesia* and horror design](https://www.avclub.com/amnesias-creative-director-on-what-makes-a-scary-video-1845392257).
- *P.T.* gets enormous value from ordinary domestic speech, repetition with
  altered context, and a voice source the player cannot safely inspect. The
  lesson is to make language mundane and placement wrong, rather than writing
  overt monster dialogue.
- *Resident Evil 7* makes Jack Baker memorable through contextual human taunts,
  but frequent combat lines also make him readable and can become entertaining.
  Helium Voice should borrow the personal directness while using a much smaller
  frequency.
- *Hellblade: Senua's Sacrifice* demonstrates how close, layered voices can
  create intimacy and unstable spatial attention. It also shows why constant
  overlapping speech is a distinct stylistic commitment. For Helium Moon, use
  a single faint double only on selected near lines, never a permanent chorus.
- Bioacoustic work summarized in Blumstein and Kaye's film-score study found
  that horror uses nonlinear vocal features such as roughness, subharmonics,
  and abrupt frequency changes because they resemble alarm calls produced by a
  stressed vocal system. This supports subtle close-range roughness, not a
  generic low monster filter. See the
  [research summary](https://www.nbcnews.com/id/wbna40383410).
- Research on recreational fear finds an inverted-U relationship: moderate,
  recoverable spikes are more enjoyable than sustained maximum arousal. Sparse
  vocal events and real silence protect the recovery periods. See the
  [Association for Psychological Science overview](https://www.psychologicalscience.org/observer/playing-with-fear).

## Implementation rules for Claude

1. Keep the source recordings immutable and make nondestructive treatment
   variants at load time or offline during the asset build.
2. Select the line server-side from the authoritative AI event and send a line
   ID, treatment ID, seed, and position. All players must hear the same act.
3. Do not let a line fire merely because a distance threshold was crossed.
   Require an AI event: investigated sound, witnessed target, hunt start,
   damage, retreat, or repeated player counter.
4. Apply the close treatment only to selected events inside 15 m. Randomly leave
   some close lines almost clean so the processing itself cannot become a ruler.
5. Use normal 3D attenuation and occlusion. Keep near processed peaks at or
   below the present vocal peak; fear should come from proximity and texture,
   not a volume jump.
6. Block a new phrase while another is playing and keep at least 18–30 seconds
   between ordinary spoken lines. Attack lines may bypass that cooldown only
   when actual damage occurs.
7. Never play the same line twice consecutively. Weight the least recently used
   lines and cap any single line at one use per several minutes.
8. Keep opt-in player mimicry separate. A captured teammate phrase is more
   powerful than authored dialogue and should remain rare.

## Validation

- Blind headphone test: listeners should distinguish far/near context better
  than chance, but should not estimate exact distance from processing alone.
- Verify intelligibility of every line on laptop speakers and ordinary
  headphones at the shipped mix level.
- Ten 15-minute seeded playthroughs: count spoken lines, consecutive repeats,
  attack-line rate, and lines that play without a matching AI event.
- Browser test: a dodged attack emits no successful-hit line; an authoritative
  hit emits the same line ID for all connected players.
- Mix test: no line clips, ducks voice chat, or raises the overall peak above
  the existing signature recording.

