# Night ambience recordings

Both recordings are CC0 1.0 (public domain dedication):
https://creativecommons.org/publicdomain/zero/1.0/

Recordist: **felix.blume**, https://freesound.org/people/felix.blume/.

- `night_crickets.ogg`: “Crickets (close recording)”, Freesound 476672,
  https://freesound.org/s/476672/.
- `tree_leaves.ogg`: foliage texture from “Wind on bushes with muffled gust of
  wind, twig branch, close to desert ground”, Freesound 711106,
  https://freesound.org/s/711106/. This is recorded wind through bushes, spatially
  placed at the game's tree canopies; it is not a recording from this refuge.

Downloaded from the openly distributed CC0 sound assets of
https://github.com/funcoder/omarchy-ambient at commit
`2686c861bff26bc7da55dd8e4e858f6d66d39a41`, paths `sounds/crickets.ogg`
and `sounds/wind.ogg`. That commit's `CREDITS.md` explicitly documents CC0,
recordist, original links and prior edits. Its `tools/sources.json` records
segments and processing; the code's MIT license does not replace the sound's CC0.
Original Freesound hosting was inaccessible from this development environment.

Prior processing by the mirror: lossless field originals, engine noise omitted
from the cricket recording, loudness matched, crossfaded, Vorbis quality 7.
Game edits: crickets use source seconds 35–79, leaves 20–48; the first four
seconds are moved to the end and crossfaded over the preceding four seconds,
creating continuous 40/24-second loops. Leaves high-pass 500 Hz / low-pass
9500 Hz, mono. Both 48 kHz Vorbis quality 6. No owl, dog, frog or coyote layers
are added. These are natural recordings, not a claim of Oklahoma species accuracy.

Source SHA-256 and reproducible import: `tools/import_night_ambience.py`.
