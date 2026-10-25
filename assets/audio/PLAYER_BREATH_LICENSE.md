# Player breathing recording

- Original: **breath.wav**, Freesound sound **30709**, by **UncleSigmund**.
- Original source: https://freesound.org/people/UncleSigmund/sounds/30709/
- License: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
- License evidence: the per-recording attribution for source 30709 in
  https://github.com/karolpiczak/ESC-50/blob/master/LICENSE identifies it as CC0.
  No audio from the ESC-50 dataset is included here.
- Download source: Jordan Magnuson's public source archive, symbol
  `unclesigmund_breath_edited_looping.wav`, in `assets/sounds.swf` at commit
  `e9738626f6ce2f69a40e26ba915abe9034ee3876` of
  https://github.com/JordanMagnuson/A-Short-History-of-Cambodia.
  Its `readme.txt` credits the original Freesound ID and creator. The prior
  looping edit is acknowledged to Jordan Magnuson.
- Only that sound was extracted; no other audio or code from that game is used.
- Changes: mono PCM conversion, 80 Hz high-pass, 3 kHz low-pass, 0.7 gain,
  and short runtime fades on breath phrases. No formant synthesis or monster
  pitch effect is applied to the player recording.
- Reproduce: `python3 tools/import_player_breath.py` (requires FFmpeg).
  The importer pins the source commit and verifies source/extracted checksums.

The recording is `player_breathing.wav`. Its terms are separate from the
game's source-code license.
