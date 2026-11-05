import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PixelRatio, Text, View, ViewStyle } from 'react-native';
import Reanimated, {
  Easing, cancelAnimation, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { lieu } from './data';
import { Couleurs, clair, f, sombre } from './theme';

// Plan du trajet : la vraie carte de l'IGN (Plan IGN v2, tuiles gratuites sans clé) sous un voile aux
// couleurs de l'appli, et l'itinéraire réel tracé par-dessus. Sans itinéraire réel (hors ligne), le
// tracé suit un réseau simplifié des grands axes du Tarn, ou une ligne droite.

type P = [number, number]; // [lon, lat]

const noeuds: Record<string, P> = {
  tls: [1.3638, 43.6293], toulouse: [1.444, 43.6045], matabiau: [1.4537, 43.6114],
  albi: [2.1464, 43.9289], 'albi-gare': [2.1425, 43.9206],
  castres: [2.241, 43.606], 'castres-gare': [2.2329, 43.6007],
  carcassonne: [2.3644, 43.2063], 'carca-gare': [2.3517, 43.2181],
  gaillac: [1.897, 43.9016], lavaur: [1.819, 43.699], viterbe: [1.733, 43.672], graulhet: [1.989, 43.76],
  mazamet: [2.374, 43.492], revel: [2.004, 43.458], stsulpice: [1.682, 43.775], verfeil: [1.66, 43.656],
  puylaurens: [2.012, 43.571], soual: [2.117, 43.555], villefranche: [1.717, 43.4], castelnaudary: [1.953, 43.318],
  bram: [2.11, 43.244],
};

type Troncon = { a: string; b: string; via?: P[]; type: 'autoroute' | 'route' | 'lien'; nom?: string };
const troncons: Troncon[] = [
  { a: 'tls', b: 'toulouse', via: [[1.4, 43.618]], type: 'route' },
  { a: 'matabiau', b: 'toulouse', type: 'lien' },
  { a: 'toulouse', b: 'stsulpice', via: [[1.5, 43.66], [1.6, 43.72]], type: 'autoroute', nom: 'A68' },
  { a: 'stsulpice', b: 'gaillac', via: [[1.78, 43.84]], type: 'autoroute' },
  { a: 'gaillac', b: 'albi', via: [[2.02, 43.915]], type: 'autoroute' },
  { a: 'albi', b: 'albi-gare', type: 'lien' },
  { a: 'toulouse', b: 'villefranche', via: [[1.5, 43.55], [1.62, 43.47]], type: 'autoroute', nom: 'A61' },
  { a: 'villefranche', b: 'castelnaudary', via: [[1.84, 43.36]], type: 'autoroute' },
  { a: 'castelnaudary', b: 'bram', type: 'autoroute' },
  { a: 'bram', b: 'carcassonne', via: [[2.25, 43.21]], type: 'autoroute' },
  { a: 'carcassonne', b: 'carca-gare', type: 'lien' },
  { a: 'toulouse', b: 'verfeil', via: [[1.55, 43.63]], type: 'route', nom: 'N126' },
  { a: 'verfeil', b: 'puylaurens', via: [[1.85, 43.6]], type: 'route' },
  { a: 'puylaurens', b: 'soual', type: 'route' },
  { a: 'soual', b: 'castres', type: 'route' },
  { a: 'castres', b: 'castres-gare', type: 'lien' },
  { a: 'stsulpice', b: 'lavaur', via: [[1.75, 43.74]], type: 'route' },
  { a: 'lavaur', b: 'viterbe', type: 'route' },
  { a: 'lavaur', b: 'verfeil', via: [[1.74, 43.68]], type: 'route' },
  { a: 'viterbe', b: 'puylaurens', via: [[1.86, 43.62]], type: 'route' },
  { a: 'lavaur', b: 'graulhet', via: [[1.9, 43.73]], type: 'route' },
  { a: 'graulhet', b: 'castres', via: [[2.1, 43.69]], type: 'route' },
  { a: 'gaillac', b: 'graulhet', via: [[1.95, 43.83]], type: 'route' },
  { a: 'albi', b: 'castres', via: [[2.2, 43.8], [2.22, 43.7]], type: 'route' },
  { a: 'castres', b: 'mazamet', via: [[2.3, 43.53]], type: 'route' },
  { a: 'soual', b: 'revel', via: [[2.06, 43.5]], type: 'route' },
  { a: 'revel', b: 'castelnaudary', via: [[1.98, 43.39]], type: 'route' },
  { a: 'revel', b: 'villefranche', via: [[1.86, 43.43]], type: 'route' },
  { a: 'mazamet', b: 'carcassonne', via: [[2.33, 43.38], [2.36, 43.28]], type: 'route' },
];

const proj = ([lon, lat]: P): P => [lon * 72, -lat * 100]; // pour le plus court chemin seulement
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const polyline = (t: Troncon): P[] => [noeuds[t.a], ...(t.via ?? []), noeuds[t.b]];
const longueur = (pts: P[]) => pts.slice(1).reduce((s, p, i) => s + dist(proj(pts[i]), proj(p)), 0);

// Plus court chemin sur le réseau (Dijkstra).
function itineraire(depart: string, arrivee: string): P[] {
  const adj: Record<string, { vers: string; pts: P[]; l: number }[]> = {};
  for (const t of troncons) {
    const pts = polyline(t), l = longueur(pts);
    (adj[t.a] ??= []).push({ vers: t.b, pts, l });
    (adj[t.b] ??= []).push({ vers: t.a, pts: [...pts].reverse(), l });
  }
  const d: Record<string, number> = { [depart]: 0 };
  const prec: Record<string, { de: string; pts: P[] }> = {};
  const vus = new Set<string>();
  while (true) {
    let u: string | null = null;
    for (const k in d) if (!vus.has(k) && (u === null || d[k] < d[u])) u = k;
    if (u === null || u === arrivee) break;
    vus.add(u);
    for (const e of adj[u] ?? []) {
      const nd = d[u] + e.l;
      if (d[e.vers] === undefined || nd < d[e.vers]) { d[e.vers] = nd; prec[e.vers] = { de: u, pts: e.pts }; }
    }
  }
  if (!prec[arrivee]) return [noeuds[depart], noeuds[arrivee]];
  const morceaux: P[][] = [];
  for (let n = arrivee; n !== depart; n = prec[n].de) morceaux.unshift(prec[n].pts);
  return morceaux.reduce<P[]>((acc, m) => [...acc, ...(acc.length ? m.slice(1) : m)], []);
}


// ——— Projection Web Mercator (celle des tuiles), coordonnées normalisées entre 0 et 1 ———
const merc = ([lon, lat]: P): P => {
  const s = Math.sin((lat * Math.PI) / 180);
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
};
const TUILE = (z: number, x: number, y: number) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`
  + `&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=image/png`;

// Le trajet en bleu vif, bordé d'un halo clair : il se détache sur la carte bleu nuit.
const TRAJET = '#3D8BFF';
const TRAJET_HALO = '#CFE0FF';
const RECOUVRE = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
const AnimatedPath = Reanimated.createAnimatedComponent(Path);
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);

export function CartePlan({ departId, arriveeId, c, hauteur = 200, style, itineraireReel }: {
  departId: string; arriveeId: string; c: Couleurs; hauteur?: number; style?: ViewStyle;
  // Tracé réel de l'IGN ([lon, lat]) : prioritaire sur le réseau simplifié.
  itineraireReel?: [number, number][];
}) {
  const [largeur, setLargeur] = useState(0);
  const W = largeur || 358;
  const H = hauteur;

  const trace = useMemo<P[]>(() => {
    if (itineraireReel && itineraireReel.length >= 2) return itineraireReel;
    if (noeuds[departId] && noeuds[arriveeId]) return itineraire(departId, arriveeId);
    const a = lieu(departId), b = lieu(arriveeId);
    return [[a.lon, a.lat], [b.lon, b.lat]];
  }, [departId, arriveeId, itineraireReel]);

  // Cadrage : le trajet au centre avec de la marge, à l'échelle de la carte.
  const cadre = useMemo(() => {
    const ms = trace.map(merc);
    const x0 = Math.min(...ms.map((p) => p[0])), x1 = Math.max(...ms.map((p) => p[0]));
    const y0 = Math.min(...ms.map((p) => p[1])), y1 = Math.max(...ms.map((p) => p[1]));
    const min = 0.00012; // ≈ 5 km : une course courte garde du contexte
    let w = Math.max((x1 - x0) * 1.5, min), h = Math.max((y1 - y0) * 1.7, min * 0.6);
    if (w / h > W / H) h = (w * H) / W; else w = (h * W) / H;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [trace, W, H]);

  // Point géographique → pixel dans la carte.
  const ecran = useCallback((p: P): P => {
    const [x, y] = merc(p);
    return [((x - cadre.x) / cadre.w) * W, ((y - cadre.y) / cadre.h) * H];
  }, [cadre, W, H]);

  // Tuiles IGN couvrant le cadre, au niveau de zoom adapté à la densité de l'écran.
  const tuiles = useMemo(() => {
    const densite = PixelRatio.get() >= 2 ? 2 : 1;
    const z = Math.max(3, Math.min(17, Math.floor(Math.log2((W * densite) / (cadre.w * 256)))));
    const n = 2 ** z;
    const taille = (W / cadre.w) / n; // taille d'une tuile à l'écran
    const liste: { cle: string; uri: string; x: number; y: number; t: number }[] = [];
    for (let tx = Math.floor(cadre.x * n); tx <= Math.floor((cadre.x + cadre.w) * n); tx++) {
      for (let ty = Math.floor(cadre.y * n); ty <= Math.floor((cadre.y + cadre.h) * n); ty++) {
        liste.push({ cle: `${z}-${tx}-${ty}`, uri: TUILE(z, tx, ty), x: (tx / n - cadre.x) * (W / cadre.w), y: (ty / n - cadre.y) * (H / cadre.h), t: taille });
      }
    }
    return liste;
  }, [cadre, W, H]);

  const pts = useMemo(() => trace.map(ecran), [trace, ecran]);
  const d = useMemo(() => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '), [pts]);
  const cumul = useMemo(() => pts.reduce<number[]>((acc, p, i) => [...acc, i ? acc[i - 1] + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0], []), [pts]);
  const L = cumul[cumul.length - 1] || 1;

  const calme = useReducedMotion();
  const dessin = useSharedValue(calme ? 1 : 0);
  const pouls = useSharedValue(0);

  // Le tracé se dessine à l'arrivée sur l'écran (et quand l'itinéraire réel arrive), puis l'arrivée
  // pulse trois fois. Rien ne tourne quand l'écran est caché sous un autre.
  const dessinePour = useRef(-1);
  useFocusEffect(useCallback(() => {
    if (calme) { dessin.value = 1; return; }
    if (dessinePour.current !== L) {
      dessinePour.current = L;
      dessin.value = 0;
      dessin.value = withDelay(250, withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }));
    }
    pouls.value = 0;
    pouls.value = withDelay(1700, withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), 3, false));
    return () => cancelAnimation(pouls);
  }, [L, calme]));

  const propsTrace = useAnimatedProps(() => ({ strokeDashoffset: L * (1 - dessin.value) }));
  const propsTete = useAnimatedProps(() => {
    const dd = dessin.value * L;
    let i = 1;
    while (i < cumul.length - 1 && cumul[i] < dd) i++;
    const seg = cumul[i] - cumul[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (dd - cumul[i - 1]) / seg));
    return {
      cx: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
      cy: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
      opacity: dessin.value > 0.01 && dessin.value < 0.99 ? 1 : 0,
    };
  });
  const propsPouls = useAnimatedProps(() => ({ r: 6 + 16 * pouls.value, opacity: 0.4 * (1 - pouls.value) }));
  const propsArrivee = useAnimatedProps(() => ({ opacity: dessin.value > 0.97 ? 1 : 0 }));

  const a = pts[0], b = pts[pts.length - 1];
  const nomCourt = (id: string) => lieu(id).nom.replace('Aéroport ', '').replace(', Capitole', '').replace(', la Cité', '');
  const etiquette = (p: P, nom: string) => {
    const aDroite = p[0] < W * 0.6;
    return (
      <Text
        numberOfLines={1}
        style={{
          position: 'absolute', top: p[1] - 10, width: 170,
          ...(aDroite ? { left: p[0] + 11 } : { left: p[0] - 181, textAlign: 'right' as const }),
          fontFamily: f.display, fontSize: 14, color: '#FFFFFF',
          textShadowColor: clair.cuve, textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 },
        }}
      >
        {nom}
      </Text>
    );
  };

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setLargeur(e.nativeEvent.layout.width)}
      style={[{ height: H, backgroundColor: clair.cuve, overflow: 'hidden', isolation: 'isolate' }, style]}
      accessible
      accessibilityLabel={`Plan du trajet de ${lieu(departId).nom} à ${lieu(arriveeId).nom}`}
    >
      {largeur ? (
        <>
          {tuiles.map((t) => (
            <Image key={t.cle} source={{ uri: t.uri }} cachePolicy="disk" transition={200}
              style={{ position: 'absolute', left: t.x, top: t.y, width: t.t + 0.5, height: t.t + 0.5 }} />
          ))}
          {/* Carte « bleu nuit » aux couleurs de l'appli : inversée (fond sombre, routes claires),
              teintée d'indigo, puis adoucie. Le trajet garde la vedette. */}
          <View style={[RECOUVRE, { backgroundColor: '#FFFFFF', mixBlendMode: 'difference' }]} />
          <View style={[RECOUVRE, { backgroundColor: clair.indigo, mixBlendMode: 'color' }]} />
          <View style={[RECOUVRE, { backgroundColor: 'rgba(16,27,69,0.35)' }]} />
          <Svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }}>
            <AnimatedPath d={d} stroke={TRAJET_HALO} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[L, L]} animatedProps={propsTrace} opacity={0.9} />
            <AnimatedPath d={d} stroke={TRAJET} strokeWidth={4.5} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[L, L]} animatedProps={propsTrace} />
            <AnimatedCircle r={5} fill="#FFFFFF" stroke={TRAJET} strokeWidth={3} animatedProps={propsTete} />
            <AnimatedCircle cx={b[0]} cy={b[1]} fill={TRAJET} animatedProps={propsPouls} />
            <Circle cx={a[0]} cy={a[1]} r={6} fill="#FFFFFF" stroke={TRAJET} strokeWidth={3} />
            <AnimatedCircle cx={b[0]} cy={b[1]} r={6.5} fill={TRAJET} stroke="#FFFFFF" strokeWidth={2} animatedProps={propsArrivee} />
          </Svg>
          {etiquette(a, nomCourt(departId))}
          {etiquette(b, nomCourt(arriveeId))}
          <Text style={{ position: 'absolute', right: 6, bottom: 3, fontSize: 9, color: sombre.pierre }}>© IGN</Text>
        </>
      ) : null}
    </View>
  );
}
