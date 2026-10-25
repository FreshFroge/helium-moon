#!/usr/bin/env python3
"""Build the single-player hosted page (claude.ai artifact) from index.html.

The host wraps the page in its own <html>/<head>/<body>, refuses WebRTC, outside
connections, microphones and some file types, so the hosted page:
  * drops the doctype/head wrapper (keeps title, fonts, stylesheet, importmap),
  * sets window.HM_EMBEDDED (menus explain multiplayer/voice need the download),
  * sets window.HM_BIN_SUFFIX='.wasm' (model .bin files are served as .wasm),
  * records the git commit it was built from (window.HM_BUILD + an HTML comment).

Usage: python3 tools/build_hosted.py OUT_DIR
Writes OUT_DIR/helium-moon.html and OUT_DIR/files.json (published path -> source,
relative to the repo root) for the publisher.
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'build', 'hosted')
os.makedirs(out, exist_ok=True)
commit = subprocess.run(['git', '-C', ROOT, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip() or 'unknown'
dirty = subprocess.run(['git', '-C', ROOT, 'status', '--porcelain', '--', 'client', 'shared', 'vendor', 'assets', 'index.html'], capture_output=True, text=True).stdout.strip()

src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
head = src[src.index('<head>') + 6:src.index('</head>')]
body = src[src.index('<body>') + 6:src.index('</body>')]
keep = [l for l in head.splitlines() if not l.strip().startswith('<meta')]
page = '\n'.join(keep).strip() + f"""
<!-- built from commit {commit}{' (with uncommitted changes)' if dirty else ''} -->
<style>:root {{ color-scheme: dark; }} html, body {{ height: 100%; background: #07080a; color: #d9d4c8; }}</style>
<script>window.HM_EMBEDDED = true; window.HM_BIN_SUFFIX = '.wasm'; window.HM_BUILD = '{commit}';</script>
""" + body.strip() + '\n'
open(os.path.join(out, 'helium-moon.html'), 'w', encoding='utf-8').write(page)

files = {}
for top in ['client', 'shared', 'vendor', 'assets']:
    for d, _, fs in os.walk(os.path.join(ROOT, top)):
        for f in sorted(fs):
            rel = os.path.relpath(os.path.join(d, f), ROOT)
            if f in ('LICENSE',) or f.endswith('.md') or '__pycache__' in rel: continue
            if rel.endswith('.bin'): files[rel + '.wasm'] = {'from': rel, 'contentType': 'application/wasm'}
            elif rel.endswith('.m4a'): continue
            else: files[rel] = rel
json.dump(files, open(os.path.join(out, 'files.json'), 'w'), indent=0)
print(f'built {out}/helium-moon.html from {commit}{" (dirty)" if dirty else ""}; {len(files)} supporting files')
