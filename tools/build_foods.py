"""Baut foods-de.txt aus dem Open-Food-Facts-Export (ODbL 1.0).

Aufruf (dauert ein paar Minuten, lädt etwa 1,3 GB):
  curl -sL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz | gunzip | python3 tools/build_foods.py

Nimmt alle Produkte, die in Deutschland verkauft werden und brauchbare Nährwerte haben (kaputte Werte und
doppelte Einträge mit gleichen Werten fliegen raus, abweichende Angaben bleiben als eigene Einträge). Eine Zeile pro Produkt, Felder mit Tab getrennt:
  Name, Marke, kcal, Eiweiß, KH, Fett (je 100 g), Portion in g (0 = keine), Barcodes (mit Komma getrennt)

Wichtig: Die Reihenfolge bleibt beim Neubauen erhalten (die App merkt sich Produkte über ihre Zeilennummer).
Produkte aus der alten Datei behalten ihren Platz und bekommen nur neue Werte, neue Produkte kommen hinten dran,
die beliebtesten zuerst. Alle Zeichen bleiben im Bereich Latin-1, damit die Suche auf dem iPhone schnell bleibt.
"""
import sys, json, re, os, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'foods-de.txt')
DACH = {'en:germany', 'en:austria', 'en:switzerland'}
TYPO = str.maketrans({'–': '-', '—': '-', '‐': '-', '‑': '-', '‘': "'", '’': "'", '‚': "'", '′': "'", '“': '"', '”': '"', '„': '"',
                      '…': '...', '•': '-', '€': 'EUR', '™': '', '\t': ' ', '\r': ' ', '\n': ' ', 'ł': 'l', 'Ł': 'L', 'œ': 'oe', 'Œ': 'Oe',
                      'đ': 'd', 'Đ': 'D', 'ı': 'i', 'ẞ': 'SS'})


def num(x):
    try:
        v = float(x); return v if v == v else None
    except Exception:
        return None


def latin1(s):
    """Text auf Latin-1 bringen: Typografie ersetzen, andere Zeichen ohne Akzent, Rest weg."""
    s = unicodedata.normalize('NFC', s).translate(TYPO)
    out = []
    for ch in s:
        if ord(ch) <= 0xFF:
            out.append(ch); continue
        base = ''.join(c for c in unicodedata.normalize('NFD', ch) if not unicodedata.combining(c))
        if base and all(ord(c) <= 0xFF for c in base): out.append(base)
    return re.sub(r'\s+', ' ', ''.join(out)).strip()


def key_of(name, brand):
    return re.sub(r'\s+', ' ', re.sub(r'[^0-9a-zäöüß ]', ' ', (name + '|' + brand).lower())).strip()


def fmtn(v, d=1):
    v = round(v, d)
    return str(int(v)) if v == int(v) else str(v)


def row_of(get):
    """Prüft ein Produkt und gibt (Rang, Felder) zurück oder None."""
    name = get('product_name')
    if len(re.sub(r'\s+', ' ', name).strip()) < 2: return None
    if any(ord(ch) > 0x24F and ch not in '–—‘’‚“”„€…•™‐‑′' for ch in unicodedata.normalize('NFC', name)): return None  # andere Schrift
    name = latin1(name)
    name = re.sub(r'\(?\s*\d+[.,]\d{2}\s*EUR(?:\s*/\s*[\d,.]*\s*\w+)?\s*\)?', ' ', name)  # Preise im Namen
    name = re.sub(r'\s*zzgl\.?\s*Pfand.*$', '', name, flags=re.I)
    name = re.sub(r'\s+', ' ', name).strip(' ,;-')
    if len(name) < 2 or len(name) > 100 or not re.search(r'[A-Za-zÄÖÜäöü]', name): return None
    kcal = num(get('energy-kcal_100g'))
    if kcal is None:
        kj = num(get('energy_100g')); kcal = kj / 4.184 if kj is not None else None
    p, c, fa = num(get('proteins_100g')), num(get('carbohydrates_100g')), num(get('fat_100g'))
    if None in (kcal, p, c, fa): return None
    if not (0 <= kcal <= 950 and 0 <= p <= 100 and 0 <= c <= 100 and 0 <= fa <= 100 and p + c + fa <= 102): return None
    calc = 4 * p + 4 * c + 9 * fa
    if calc > 0 and abs(kcal - calc) > max(30, 0.35 * kcal): return None
    brand = latin1(get('brands').split(',')[0])[:30]
    sg = num(get('serving_quantity')); sg = round(sg) if sg and 1 <= sg <= 1500 else 0
    tags = get('popularity_tags')
    ranks = [int(m.group(1)) for m in re.finditer(r'top-(\d+)-de-scans-(20\d\d)', tags) if int(m.group(2)) >= 2021]
    de_rank = min(ranks) if ranks else 10 ** 7
    cdef = 'top-country-de' in tags
    ctr = set(get('countries_tags').split(','))
    sc = num(get('unique_scans_n')) or 0
    score = (de_rank if de_rank < 10 ** 7 else 300000) - (50000 if cdef else 0) - min(sc, 500) * 100 + (0 if ctr <= DACH else 20000)
    code = re.sub(r'\D', '', get('code'))
    return score, [name, brand, round(kcal), round(p, 1), round(c, 1), round(fa, 1), sg, code]


def read_input():
    """CSV von stdin oder --jsonl Datei (Zeilen mit denselben Feldnamen)."""
    if len(sys.argv) > 2 and sys.argv[1] == '--jsonl':
        for l in open(sys.argv[2], encoding='utf-8'):
            r = json.loads(l)
            yield lambda k, r=r: str(r.get(k) or '')
        return
    hdr = sys.stdin.readline().rstrip('\n').split('\t'); ix = {k: i for i, k in enumerate(hdr)}
    for line in sys.stdin:
        if 'en:germany' not in line: continue
        f = line.rstrip('\n').split('\t')
        get = lambda k, f=f: f[ix[k]] if k in ix and ix[k] < len(f) else ''
        if 'en:germany' not in get('countries_tags').split(','): continue
        yield get


def old_rows():
    """Bisherige Reihenfolge: foods-de.txt, sonst die alte foods-de.json."""
    if os.path.isfile(OUT):
        for l in open(OUT, encoding='utf-8'):
            f = l.rstrip('\n').split('\t')
            if len(f) >= 8: yield [f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7]]
        return
    old = os.path.join(ROOT, 'foods-de.json')
    if os.path.isfile(old):
        for r in json.load(open(old, encoding='utf-8')): yield [latin1(r[0]), latin1(r[1] or '')[:30], r[2], r[3], r[4], r[5], r[6], str(r[7] or '')]


def main():
    best = {}
    for get in read_input():
        x = row_of(get)
        if not x: continue
        sc, row = x; k = key_of(row[0], row[1]) + '|' + str(round(row[2] / 5))  # gleiche Werte = gleiches Produkt
        cur = best.get(k)
        if cur is None:
            best[k] = [sc, row, [row[7]] if row[7] else []]
        else:
            if row[7] and row[7] not in cur[2]: cur[2].append(row[7])
            if sc < cur[0]:
                cur[0], cur[1] = sc, row
                if row[7]: cur[2].remove(row[7]); cur[2].insert(0, row[7])
    by_code = {}
    for k, v in best.items():
        for c in v[2]: by_code.setdefault(c, k)
    out, used = [], set()
    for r in old_rows():
        codes = [c for c in str(r[7]).split(',') if c]
        k = next((by_code[c] for c in codes if c in by_code), None) or key_of(r[0], r[1]) + '|' + str(round(float(r[2]) / 5))
        if k in best and k not in used:
            v = best[k]; used.add(k)
            out.append(v[1][:7] + [','.join(dict.fromkeys(codes + v[2]))])
        else:
            out.append(r[:7] + [','.join(codes)])  # alte Zeile bleibt stehen, damit die Nummern passen
    for k, v in sorted(best.items(), key=lambda kv: kv[1][0]):
        if k in used: continue
        out.append(v[1][:7] + [','.join(v[2])])
    lines = []
    for r in out:
        f = [str(r[0]), str(r[1]), fmtn(float(r[2]), 0), fmtn(float(r[3])), fmtn(float(r[4])), fmtn(float(r[5])), fmtn(float(r[6] or 0), 0), str(r[7])]
        lines.append('\t'.join(x.replace('\t', ' ').replace('\n', ' ') for x in f))
    txt = '\n'.join(lines) + '\n'
    assert all(ord(ch) <= 0xFF for ch in txt), 'Zeichen außerhalb von Latin-1'
    open(OUT, 'w', encoding='utf-8').write(txt)
    print(len(lines), 'Produkte geschrieben nach', OUT, f'({len(txt.encode()) / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
