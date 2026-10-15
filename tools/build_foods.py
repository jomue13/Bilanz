"""Baut foods-de.json aus dem Open-Food-Facts-Export (ODbL 1.0).

Aufruf (dauert ein paar Minuten, lädt etwa 1,3 GB):
  curl -sL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz | gunzip | python3 tools/build_foods.py

Behält Produkte, die in Deutschland verkauft werden, vollständige Nährwerte haben und in Deutschland
oft gescannt werden. Format pro Zeile: [Name, Marke, kcal, Eiweiß, KH, Fett, Portion g, Barcode] je 100 g.
"""
import sys, json, re, os
LIMIT = 60000
DACH = {'en:germany', 'en:austria', 'en:switzerland'}
FR = re.compile(r"\b(au|aux|avec|sans|goût|saveur|lait|fromage|beurre|pâtes|confiture|yaourt|jus d|eau minérale|riz|crème|fraîche|légumes|poulet|nature|à la|de la|des|du|le|la|les|et)\b", re.I)
IT = re.compile(r"\b(con|di|della|alla|al|gusto|formaggio|latte|biscotti|pomodoro|integrale|senza|yogur|sabor|leche|queso|zumo|galletas|azúcar|y)\b", re.I)
DE = re.compile(r"[äöüß]|\b(mit|und|ohne|aus|vom|für|natur|vollkorn|käse|milch|joghurt|quark|wurst|schinken|brot|brötchen|nudeln|kartoffel|hähnchen|rind|schwein|soße|sauce|salat|gemüse|obst|apfel|beere|schoko|nuss|müsli|kekse|riegel|getränk|saft|limonade|wasser|bier|tee|kaffee|sahne|butter|öl|essig|senf|ketchup|gewürz|mehl|zucker|honig|marmelade|aufstrich|frischkäse|skyr|protein|eiweiß|light|bio)\b", re.I)
def num(x):
    try:
        v = float(x); return v if v == v else None
    except Exception: return None
def nrm(s): return re.sub(r'\s+', ' ', re.sub(r'[^0-9a-zäöüß ]', ' ', s.lower())).strip()
hdr = sys.stdin.readline().rstrip('\n').split('\t'); ix = {k: i for i, k in enumerate(hdr)}
g = lambda f, k: f[ix[k]] if k in ix and ix[k] < len(f) else ''
cands = {}
for line in sys.stdin:
    if 'en:germany' not in line: continue
    f = line.rstrip('\n').split('\t')
    ctr = set(g(f, 'countries_tags').split(','))
    if 'en:germany' not in ctr: continue
    tags = g(f, 'popularity_tags')
    ranks = [int(m.group(1)) for m in re.finditer(r'top-(\d+)-de-scans-(20\d\d)', tags) if int(m.group(2)) >= 2021]
    de_rank = min(ranks) if ranks else 10**7
    cdef = 'top-country-de' in tags
    sc = num(g(f, 'unique_scans_n')) or 0
    if de_rank > 100000 and not (ctr <= DACH and sc >= 1) and not cdef: continue
    name = re.sub(r'\s+', ' ', g(f, 'product_name')).strip()
    if len(name) < 2 or len(name) > 80 or not re.search(r'[A-Za-zÄÖÜäöü]', name): continue
    if (FR.search(name) or IT.search(name)) and not DE.search(name) and not (cdef and de_rank <= 50000): continue
    kcal = num(g(f, 'energy-kcal_100g'))
    if kcal is None:
        kj = num(g(f, 'energy_100g')); kcal = kj / 4.184 if kj is not None else None
    p, c, fa = num(g(f, 'proteins_100g')), num(g(f, 'carbohydrates_100g')), num(g(f, 'fat_100g'))
    if None in (kcal, p, c, fa): continue
    if not (0 <= kcal <= 950 and 0 <= p <= 100 and 0 <= c <= 100 and 0 <= fa <= 100 and p + c + fa <= 102): continue
    calc = 4 * p + 4 * c + 9 * fa
    if calc > 0 and abs(kcal - calc) > max(30, 0.35 * kcal): continue
    brand = g(f, 'brands').split(',')[0].strip()[:30]
    sg = num(g(f, 'serving_quantity')); sg = round(sg) if sg and 1 <= sg <= 1500 else 0
    score = (de_rank if de_rank < 10**7 else 200000) - (50000 if cdef else 0) - min(sc, 500) * 100
    key = nrm(name) + '|' + nrm(brand)
    if key in cands and cands[key][0] <= score: continue
    cands[key] = (score, [name, brand, round(kcal), round(p, 1), round(c, 1), round(fa, 1), sg, g(f, 'code')])
rows = [x[1] for x in sorted(cands.values(), key=lambda x: x[0])[:LIMIT]]
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'foods-de.json')
open(out, 'w', encoding='utf-8').write(json.dumps(rows, ensure_ascii=False, separators=(',', ':')))
print(len(rows), 'Produkte geschrieben nach', out)
