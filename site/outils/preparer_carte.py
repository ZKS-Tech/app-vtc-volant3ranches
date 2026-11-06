"""Prépare les données de la carte du trajet à partir des services de l'IGN (Géoplateforme).

- coordonnées des villes (géocodage) ;
- itinéraires réels entre les 15 lieux de l'estimateur (distance, durée, tracé simplifié) ;
- fond de relief : estompage IGN, tuiles assemblées puis teintées pour la nuit.

Données IGN sous Licence Ouverte Etalab 2.0. Usage : python3 outils/preparer_carte.py (depuis site/).
"""
import io, json, math, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image

UA = {'User-Agent': 'Volant3ranchesSite/1.0'}
def get(url, binaire=False):
    for essai in range(4):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
            return r if binaire else json.loads(r)
        except Exception as e:
            print('  nouvel essai', essai, e); time.sleep(2 * (essai + 1))
    raise SystemExit('échec : ' + url)

# lieux de l'estimateur (gares et aéroport : coordonnées du prototype ; villes : géocodées)
LIEUX = {
 'tls': ('Aéroport Toulouse-Blagnac', 43.6293, 1.3638), 'matabiau': ('Gare Toulouse-Matabiau', 43.6114, 1.4537),
 'albi-gare': ("Gare d'Albi-Ville", 43.9206, 2.1425), 'castres-gare': ('Gare de Castres', 43.6007, 2.2329),
 'carca-gare': ('Gare de Carcassonne', 43.2181, 2.3517), 'toulouse': ('Toulouse, Capitole', 43.6045, 1.444),
 'carcassonne': ('Carcassonne, la Cité', 43.2063, 2.3644),
}
VILLES = {'albi': 'Albi', 'castres': 'Castres', 'gaillac': 'Gaillac', 'lavaur': 'Lavaur', 'viterbe': 'Viterbe', 'graulhet': 'Graulhet',
  'mazamet': 'Mazamet', 'revel': 'Revel', 'stsulpice': 'Saint-Sulpice-la-Pointe', 'verfeil': 'Verfeil', 'puylaurens': 'Puylaurens',
  'villefranche': 'Villefranche-de-Lauragais', 'castelnaudary': 'Castelnaudary', 'toulouse-ville': 'Toulouse', 'carcassonne-ville': 'Carcassonne',
  'blagnac': 'Blagnac'}
DEPTS = {'Revel': '31', 'Verfeil': '31', 'Villefranche-de-Lauragais': '31', 'Toulouse': '31', 'Blagnac': '31', 'Castelnaudary': '11', 'Carcassonne': '11'}
RELIEF_SEUL = '--relief' in sys.argv
villes = {}
for cle, nom in ({} if RELIEF_SEUL else VILLES).items():
    q = urllib.parse.urlencode({'q': nom, 'type': 'municipality', 'limit': 5})
    feats = get('https://data.geopf.fr/geocodage/search?' + q)['features']
    dep = DEPTS.get(nom, '81')
    f = next((f for f in feats if f['properties'].get('citycode', '').startswith(dep)), feats[0])
    lon, lat = f['geometry']['coordinates']
    villes[cle] = [round(lat, 5), round(lon, 5), nom]
    print(cle, villes[cle], f['properties'].get('postcode'))
    time.sleep(.15)
for cle, ville in [] if RELIEF_SEUL else [('albi', 'albi'), ('castres', 'castres'), ('gaillac', 'gaillac'), ('lavaur', 'lavaur'), ('viterbe', 'viterbe'), ('graulhet', 'graulhet'), ('mazamet', 'mazamet'), ('revel', 'revel')]:
    LIEUX[cle] = (villes[ville][2], villes[ville][0], villes[ville][1])

# tracés : simplification (Douglas-Peucker) puis codage « polyline » (précision 1e-5)
def simplifier(pts, tol):
    if len(pts) < 3: return pts
    def d(p, a, b):
        ax, ay = a; bx, by = b; px, py = p; dx, dy = bx - ax, by - ay
        if dx == dy == 0: return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)
    garde = [False] * len(pts); garde[0] = garde[-1] = True; pile = [(0, len(pts) - 1)]
    while pile:
        i, j = pile.pop(); m, k = 0, -1
        for x in range(i + 1, j):
            v = d(pts[x], pts[i], pts[j])
            if v > m: m, k = v, x
        if m > tol: garde[k] = True; pile += [(i, k), (k, j)]
    return [p for p, g in zip(pts, garde) if g]
def coder(pts):
    out, plat, plon = [], 0, 0
    for lat, lon in pts:
        for v, prev in ((round(lat * 1e5), plat), (round(lon * 1e5), plon)):
            v2 = v - prev; v2 = ~(v2 << 1) if v2 < 0 else (v2 << 1)
            while v2 >= 0x20: out.append(chr((0x20 | (v2 & 0x1f)) + 63)); v2 >>= 5
            out.append(chr(v2 + 63))
        plat, plon = round(lat * 1e5), round(lon * 1e5)
    return ''.join(out)
def refs(steps):
    km = {}
    for s in steps:
        n = s.get('attributes', {}).get('name', {}); n = n.get('name', '') if isinstance(n, dict) else str(n)
        n = {'Autoroute du Pastel': 'A68'}.get(n, n)
        m = re.match(r'^(A|N|RN|D|RD)\s?(\d+)', n)
        if m: c = m.group(1)[-1] + m.group(2); km[c] = km.get(c, 0) + float(s.get('distance', 0))
    tri = sorted(km.items(), key=lambda kv: (-('A' == kv[0][0]) - ('N' == kv[0][0]) * .5, -kv[1]))
    return [c for c, v in tri if v > 3][:3]

ids = [] if RELIEF_SEUL else list(LIEUX); trajets = {}
for a in range(len(ids)):
    for b in range(a + 1, len(ids)):
        A, B = LIEUX[ids[a]], LIEUX[ids[b]]
        q = urllib.parse.urlencode({'resource': 'bdtopo-osrm', 'start': f'{A[2]},{A[1]}', 'end': f'{B[2]},{B[1]}', 'profile': 'car',
            'optimization': 'fastest', 'geometryFormat': 'geojson', 'getSteps': 'true', 'distanceUnit': 'kilometer', 'timeUnit': 'minute', 'waysAttributes': 'name'})
        r = get('https://data.geopf.fr/navigation/itineraire?' + q)
        pts = [(lat, lon) for lon, lat in r['geometry']['coordinates']]
        pts = simplifier(pts, .0007)
        steps = [s for p in r['portions'] for s in p.get('steps', [])]
        trajets[f'{ids[a]}|{ids[b]}'] = {'km': round(float(r['distance']), 1), 'min': round(float(r['duration'])), 'p': coder(pts), 'r': refs(steps)}
        print(ids[a], '→', ids[b], trajets[f'{ids[a]}|{ids[b]}']['km'], 'km', len(pts), 'pts', trajets[f'{ids[a]}|{ids[b]}']['r'])
        time.sleep(.2)

if not RELIEF_SEUL: json.dump({'lieux': {k: [v[1], v[2], v[0]] for k, v in LIEUX.items()}, 'villes': villes, 'trajets': trajets},
          open('outils/carte.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# fond de relief : estompage IGN (Web Mercator), zoom 11, recadré sur l'emprise de la carte
LON0, LON1, LAT0, LAT1 = 1.2, 2.56, 43.12, 44.06
Z = 11; n = 2 ** Z
tx = lambda lon: (lon + 180) / 360 * n
ty = lambda lat: (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
x0, x1, y0, y1 = tx(LON0), tx(LON1), ty(LAT1), ty(LAT0)
if os.path.exists('outils/relief-gris.png'):
    img = Image.open('outils/relief-gris.png')
else:
  img = Image.new('L', ((int(x1) - int(x0) + 1) * 256, (int(y1) - int(y0) + 1) * 256))
  for X in range(int(x0), int(x1) + 1):
    for Y in range(int(y0), int(y1) + 1):
        url = ('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW'
               f'&STYLE=estompage_grayscale&TILEMATRIXSET=PM&TILEMATRIX={Z}&TILEROW={Y}&TILECOL={X}&FORMAT=image/png')
        t = Image.open(io.BytesIO(get(url, True))).convert('LA')
        fond = Image.new('L', t.size, 235); fond.paste(t.getchannel('L'), mask=t.getchannel('A'))
        img.paste(fond, ((X - int(x0)) * 256, (Y - int(y0)) * 256))
  img = img.crop((int((x0 - int(x0)) * 256), int((y0 - int(y0)) * 256), int((x1 - int(x0)) * 256), int((y1 - int(y0)) * 256)))
  img.save('outils/relief-gris.png')
print('relief', img.size)
# teinte de nuit : le plat devient bleu nuit, les versants éclairés s'allument, les ombres s'enfoncent
lut = []
for v in range(256):
    c = (v - 236) / 45.0
    lut.append(max(0, min(1, .42 + c * 1.1)))
r = img.point(lambda v: int(14 + 92 * lut[v] ** 1.15))
g = img.point(lambda v: int(22 + 112 * lut[v] ** 1.15))
b = img.point(lambda v: int(56 + 170 * lut[v] ** 1.05))
Image.merge('RGB', (r, g, b)).save('assets/photos/relief-ign.webp', 'WEBP', quality=82, method=6)
print('ok')
