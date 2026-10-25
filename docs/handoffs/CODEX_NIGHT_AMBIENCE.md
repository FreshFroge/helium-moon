# Night ambience replacement

Direct owner request: remove the current ambient animal calls, replace them with
high-quality night crickets, and place leaf rustling at the trees.

- Removed owl, coyote, dog, frog and katydid generation/scheduling from the audio
  engine, plus random ambient twig snaps and wood creaks. Actual creature vocals,
  footsteps and interactive sounds remain distinct gameplay effects.
- Added a 40-second stereo cricket field-recording loop and a 24-second mono
  foliage-wind loop. Both derive from documented CC0 recordings by felix.blume;
  see `assets/audio/NIGHT_AMBIENCE_LICENSE.md` and the pinned, checksum-verified
  `tools/import_night_ambience.py`. Combined encoded size is about 1.56 MB.
- Existing wind and location-dependent river/highway ambience remain. Crickets
  do not fade with enemy proximity. No added warning stinger or distance-linked
  heartbeat/breathing modulation.
- Up to three nearby real tree canopies carry HRTF rustling emitters. A cached
  spatial index avoids scanning the forest each frame; emitters update every
  two seconds, use slow wind gusts, and fade out when leaving the trees. Restart
  clears tree voices without killing the background bed.
- Fixed initialization order: `_buildLoops()` called `play()` while `ready` was
  false, silently returning null for every background loop. Set readiness after
  decoding, before creating those loops.

Validation: `tests/browser_night_audio.py` passed against actual Chromium Web
Audio: all four background loops exist, both recordings decode to the expected
40/24-second durations with nonzero signal and no clipping, no forbidden animal
clips are loaded, three positional loops anchor to actual trees, old sources
fade when leaving, and session cleanup retains the cricket bed. No page errors.
This establishes functioning audio, not a subjective listening-room evaluation.

Claude: please include these assets in the next hosted refresh and record its
commit. The recording is not represented as native Oklahoma species or a field
recording from Stinchcomb. Evaluate the final ambience/creature balance in a
headphone playtest, alongside the AI encounter pass.
