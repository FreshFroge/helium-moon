"""Rebuild credited CC0 ambience assets using Python and ffmpeg."""
import hashlib
from pathlib import Path
import subprocess
import tempfile
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
COMMIT='2686c861bff26bc7da55dd8e4e858f6d66d39a41'
SOURCE_HASHES={'crickets':'e7b0e3b986e8039847827fd845330551f273c81b67f64862d01d803770bee697','wind':'038aa5449ccfe210ca04c73234b02fbfa3a494c995751da60e6be6cb8f2b51ab'}
SOURCES=[
    ('crickets',35,44,'night_crickets',None),
    ('wind',20,28,'tree_leaves','highpass=f=500,lowpass=f=9500,'),
]
with tempfile.TemporaryDirectory() as tmp:
    for source,start,duration,name,filters in SOURCES:
        data=urllib.request.urlopen(f'https://raw.githubusercontent.com/funcoder/omarchy-ambient/{COMMIT}/sounds/{source}.ogg',timeout=60).read()
        expected=SOURCE_HASHES[source]
        if hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('Source checksum mismatch')
        path=Path(tmp)/f'{source}.ogg';path.write_bytes(data)
        from array import array
        channels=1 if source=='wind' else 2
        cmd=['ffmpeg','-v','error','-ss',str(start),'-i',str(path),'-t',str(duration)]
        if filters:cmd+=['-af',filters.rstrip(',')]
        pcm=array('f',subprocess.check_output(cmd+['-ac',str(channels),'-ar','48000','-f','f32le','pipe:1']))
        cross=4*48000*channels
        if len(pcm)<cross*2:raise RuntimeError('Recording decode was too short')
        loop=pcm[cross:]
        for i in range(cross):
            alpha=(i//channels)/(48000*4-1)
            loop[len(loop)-cross+i]=loop[len(loop)-cross+i]*(1-alpha)+pcm[i]*alpha
        subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar','48000','-ac',str(channels),
            '-i','pipe:0','-c:a','libvorbis','-q:a','6',str(ROOT/'assets/audio'/f'{name}.ogg')],input=loop.tobytes(),check=True)
