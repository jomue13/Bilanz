"""Neue App-Version ausrollen: berechnet die Version im Service Worker neu.

Ohne diesen Schritt merkt die installierte App auf dem iPhone nichts von
Änderungen, weil sie alles aus ihrem eigenen Speicher startet.
Aufruf im Repository-Ordner: python3 tools/release.py
"""
import datetime, hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SW = os.path.join(ROOT, 'sw.js')
sw = open(SW, encoding='utf-8').read()
m_core = re.search(r'^const CORE = (\[.*?\]);$', sw, re.M)
m_ver = re.search(r"^const VERSION = '([0-9]{8})-([0-9a-f]{8})';$", sw, re.M)
if not m_core or not m_ver:
    sys.exit('sw.js hat nicht das erwartete Format (const VERSION / const CORE).')
core = json.loads(m_core.group(1))
h = hashlib.sha1()
for c in core:
    if c == './':
        continue
    p = os.path.join(ROOT, c[2:])
    if not os.path.isfile(p):
        sys.exit(f'Datei aus CORE fehlt: {c}')
    h.update(open(p, 'rb').read())
digest = h.hexdigest()[:8]
if digest == m_ver.group(2):
    print('unverändert', m_ver.group(1) + '-' + digest)
    sys.exit(0)
ver = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d') + '-' + digest
sw = sw.replace(m_ver.group(0), f"const VERSION = '{ver}';")
open(SW, 'w', encoding='utf-8').write(sw)
print('neue Version', ver)
