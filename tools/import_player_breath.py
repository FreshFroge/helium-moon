"""Import only UncleSigmund's CC0 breath clip; never execute the Flash file.

Requires FFmpeg. See assets/audio/PLAYER_BREATH_LICENSE.md for provenance.
"""
from pathlib import Path
import hashlib
import struct
import subprocess
import tempfile
import urllib.request
import zlib

URL = 'https://raw.githubusercontent.com/JordanMagnuson/A-Short-History-of-Cambodia/e9738626f6ce2f69a40e26ba915abe9034ee3876/assets/sounds.swf'
with urllib.request.urlopen(URL, timeout=30) as response:
    source = response.read(2_000_000)
assert hashlib.sha256(source).hexdigest() == '0440087802471b875b2f14c9e3109d3c4c650bdb4bdf66be2b54e2956b82046a'
body = zlib.decompress(source[8:]) if source[:3] == b'CWS' else source[8:]
assert len(body) < 10_000_000
offset = (5 + 4 * (body[0] >> 3) + 7) // 8 + 4
sounds, names = {}, {}
while offset + 2 <= len(body):
    header = struct.unpack_from('<H', body, offset)[0]
    offset += 2
    kind, length = header >> 6, header & 63
    if length == 63:
        length = struct.unpack_from('<I', body, offset)[0]
        offset += 4
    tag = body[offset:offset + length]
    offset += length
    if kind == 14:
        sounds[struct.unpack_from('<H', tag)[0]] = tag
    elif kind in (56, 76):
        index = 2
        for _ in range(struct.unpack_from('<H', tag)[0]):
            identifier = struct.unpack_from('<H', tag, index)[0]
            index += 2
            end = tag.index(0, index)
            names[identifier] = tag[index:end].decode()
            index = end + 1
identifier = next(key for key, value in names.items() if value == 'unclesigmund_breath_edited_looping.wav')
tag = sounds[identifier]
assert tag[2] >> 4 == 2
mp3 = tag[9:]
assert hashlib.sha256(mp3).hexdigest() == 'f63a39470e8143bcd4afd36641a2dc96b3d0da17e7bb30881200a21d28732c5e'
target = Path(__file__).resolve().parents[1] / 'assets/audio/player_breathing.wav'
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'breath.mp3'
    path.write_bytes(mp3)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(path), '-ac', '1', '-ar', '22050',
                    '-af', 'highpass=f=80,lowpass=f=3000,volume=0.7', '-c:a', 'pcm_s16le', str(target)], check=True)
print('Imported CC0 breathing:', target)
