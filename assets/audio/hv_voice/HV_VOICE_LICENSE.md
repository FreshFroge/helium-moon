# Helium Voice: real voice lines

**Source:** a phone recording the owner provided on Oct 25, 2026. The speaker is
the real person Helium Voice is based on. The owner confirmed that he agreed to
his voice being used in the game.

**What's kept:** eight short, neutral lines. The rest of the recording, including
slurs, racial jokes and other speakers, was **not** extracted and is not in this
repository. Each line was checked with an on-device speaker embedding: it
matches his voice cluster with cosine ≥ 0.6, and whisper transcribed it as the
listed text.

| file | line |
|---|---|
| hv_anyone_recording.ogg | "Okay, anyone who's recording?" |
| hv_got_a_wire.ogg | "Okay, I feel like one of you's got a wire or something, dude." |
| hv_dont_care.ogg | "I don't care, y'all. We record on your phones." |
| hv_you_know.ogg | "You know." |
| hv_you_got_a_point.ogg | "You got a point." |
| hv_no_you_cant.ogg | "No, Bryce, you can't." |
| hv_i_can_tell.ogg | "Bryson, I can so tell you recorded…" |
| hv_okay_ace.ogg | "Okay, Ace, you gotta believe me with this one." |

**Processing:** 80 Hz high-pass, light denoise, loudness-normalized to −18 LUFS,
short fades, mono Vorbis.

**Voice profile:** `voice_profile.json` holds his pitch, speaking rate and
per-line timing. No biometric speaker embedding is stored.

If he ever asks for his voice to be removed, delete this folder; the game falls
back to the synthesized vocals automatically.
