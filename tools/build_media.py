"""Baut media-de.txt (Filme und Serien) aus den IMDb-Datensätzen.

Aufruf (lädt etwa 1,2 GB, dauert ein bis zwei Minuten):
  python3 tools/build_media.py

Daten: IMDb Non-Commercial Datasets (https://developer.imdb.com/non-commercial-datasets/),
nur für privaten, nicht-kommerziellen Gebrauch. Die App nennt die Quelle.

Nimmt alle Filme und Serien mit mindestens 3.000 Bewertungen, dazu den deutschen Titel, Regie, Staffeln
und die Plätze in den Top-100-Listen (gewichtete Bewertung wie bei IMDb). Eine Zeile pro Titel, Felder mit Tab:
  Nummer (tt…), Art (f = Film, s = Serie), deutscher Titel, Originaltitel (leer wenn gleich), Jahr, Endjahr,
  Minuten, Genres, Bewertung × 10, Stimmen, Regie, Staffeln, Platz Top 100 (0 = keiner)
Sortiert nach Stimmen, die bekanntesten zuerst.
"""
import gzip, io, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'media-de.txt')
BASE = 'https://datasets.imdbws.com/'
MIN_VOTES = 3000
GENRES = {'Drama': 'Drama', 'Comedy': 'Komödie', 'Action': 'Action', 'Adventure': 'Abenteuer', 'Crime': 'Krimi', 'Thriller': 'Thriller',
          'Romance': 'Romantik', 'Sci-Fi': 'Science-Fiction', 'Fantasy': 'Fantasy', 'Horror': 'Horror', 'Mystery': 'Mystery',
          'Animation': 'Animation', 'Family': 'Familie', 'Biography': 'Biografie', 'History': 'Geschichte', 'War': 'Krieg',
          'Western': 'Western', 'Music': 'Musik', 'Musical': 'Musical', 'Sport': 'Sport', 'Documentary': 'Doku',
          'Film-Noir': 'Film noir', 'Reality-TV': 'Reality', 'Talk-Show': 'Talkshow', 'Game-Show': 'Spielshow', 'News': 'Nachrichten'}


def rows(name):
    """Zeilen einer IMDb-Datei als Listen, direkt aus dem Netz entpackt."""
    p = subprocess.Popen(['curl', '-sS', '--fail', BASE + name], stdout=subprocess.PIPE)
    for i, l in enumerate(io.TextIOWrapper(gzip.GzipFile(fileobj=p.stdout), encoding='utf-8')):
        if i: yield l.rstrip('\n').split('\t')
    p.wait()


def latin(s):
    return bool(s) and all(ord(c) < 0x2000 for c in s) and not re.search(r'[Ͱ-῿]', s)


def clean(s):
    return re.sub(r'\s+', ' ', s.replace('\t', ' ')).strip()


def main():
    rat = {}
    for f in rows('title.ratings.tsv.gz'):
        v = int(f[2])
        if v >= MIN_VOTES: rat[f[0]] = (float(f[1]), v)
    print('Bewertungen', len(rat), file=sys.stderr)
    T = {}
    for f in rows('title.basics.tsv.gz'):
        if f[0] not in rat or f[4] == '1' or f[1] not in ('movie', 'tvSeries', 'tvMiniSeries'): continue
        T[f[0]] = {'k': 'f' if f[1] == 'movie' else 's', 'pt': clean(f[2]), 'ot': clean(f[3]), 'y': f[5] if f[5].isdigit() else '', 'e': f[6] if f[6].isdigit() else '',
                   'm': f[7] if f[7].isdigit() else '', 'g': [GENRES[g] for g in f[8].split(',') if g in GENRES], 'r': rat[f[0]][0], 'v': rat[f[0]][1]}
    print('Titel', len(T), file=sys.stderr)
    best = {}
    for f in rows('title.akas.tsv.gz'):
        t = f[0]
        if t not in T: continue
        reg, lang, types, attrs = f[3], f[4], f[5], f[6]
        if reg not in ('DE', 'AT', 'XWG') and lang != 'de': continue
        sc = {'DE': 6, 'XWG': 4, 'AT': 2}.get(reg, 0) + (3 if 'imdbDisplay' in types else 1 if types == '\\N' else -2 if re.search('working|festival|video|tv|dvd|alternative', types) else 0)
        if re.search('literal|informal|short|alternative|promotional|complete|copyright|dubbed version', attrs, re.I): sc -= 5
        if f[7] == '1': sc -= 3
        cur = best.get(t)
        if cur is None or sc > cur[0] or (sc == cur[0] and int(f[1]) < cur[1]): best[t] = (sc, int(f[1]), clean(f[2]))
    crew = {}
    for f in rows('title.crew.tsv.gz'):
        if f[0] in T and T[f[0]]['k'] == 'f' and f[1] != '\\N': crew[f[0]] = f[1].split(',')[:2]
    need = {n for v in crew.values() for n in v}
    names = {}
    for f in rows('name.basics.tsv.gz'):
        if f[0] in need: names[f[0]] = clean(f[1])
    seas = {}
    for f in rows('title.episode.tsv.gz'):
        if f[1] in T and f[2].isdigit() and int(f[2]) < 100: seas[f[1]] = max(seas.get(f[1], 0), int(f[2]))

    def top(kind, m, minv):
        c = [t for t, x in T.items() if x['k'] == kind and x['v'] >= minv]
        C = sum(T[t]['r'] for t in c) / len(c)
        return sorted(c, key=lambda t: -((T[t]['v'] / (T[t]['v'] + m)) * T[t]['r'] + (m / (T[t]['v'] + m)) * C))[:100]
    rank = {}
    for i, t in enumerate(top('f', 25000, 25000)): rank[t] = i + 1
    for i, t in enumerate(top('s', 50000, 50000)): rank[t] = i + 1
    lines = []
    for t, x in sorted(T.items(), key=lambda kv: -kv[1]['v']):
        orig = x['ot'] if latin(x['ot']) else x['pt']
        de = best[t][2] if t in best and best[t][0] > 0 else x['pt']
        if not latin(de): de = x['pt']
        by = ', '.join(names[n] for n in crew.get(t, []) if n in names)
        f = [t[2:], x['k'], de, '' if orig.lower() == de.lower() else orig, x['y'], x['e'] if x['k'] == 's' else '', x['m'], ','.join(x['g']),
             str(round(x['r'] * 10)), str(x['v']), by, str(seas.get(t, '')) if x['k'] == 's' else '', str(rank.get(t, 0))]
        lines.append('\t'.join(f))
    open(OUT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(len(lines), 'Titel geschrieben nach', OUT, f'({os.path.getsize(OUT) / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
