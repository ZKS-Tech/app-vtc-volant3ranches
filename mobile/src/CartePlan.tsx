import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutChangeEvent, View, ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { lieu } from './data';
import { Couleurs, f } from './theme';

// Carte « plan » : vue du dessus simplifiée du Tarn, de Toulouse et de Carcassonne (grands axes,
// rivières, villes). L'itinéraire est calculé sur ce réseau et se dessine le long des routes.
// Tracés approximatifs, dessinés à la main : ce n'est pas un GPS.

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

const rivieres: { nom: string; points: P[] }[] = [
  { nom: 'Garonne', points: [[1.16, 43.38], [1.3, 43.48], [1.4, 43.56], [1.44, 43.6], [1.4, 43.66], [1.36, 43.74], [1.28, 43.86], [1.2, 43.98]] },
  { nom: 'Tarn', points: [[2.42, 43.98], [2.3, 43.94], [2.146, 43.931], [2.02, 43.9], [1.897, 43.895], [1.78, 43.84], [1.69, 43.79], [1.55, 43.86], [1.42, 43.94], [1.3, 44.02]] },
  { nom: 'Agout', points: [[2.5, 43.64], [2.36, 43.62], [2.24, 43.6], [2.1, 43.66], [1.98, 43.69], [1.82, 43.705], [1.69, 43.775]] },
];

const villes: { id: string; nom: string; importance: 1 | 2 }[] = [
  { id: 'toulouse', nom: 'Toulouse', importance: 1 }, { id: 'albi', nom: 'Albi', importance: 1 },
  { id: 'castres', nom: 'Castres', importance: 1 }, { id: 'carcassonne', nom: 'Carcassonne', importance: 1 },
  { id: 'gaillac', nom: 'Gaillac', importance: 2 }, { id: 'lavaur', nom: 'Lavaur', importance: 2 },
  { id: 'graulhet', nom: 'Graulhet', importance: 2 }, { id: 'mazamet', nom: 'Mazamet', importance: 2 },
  { id: 'revel', nom: 'Revel', importance: 2 }, { id: 'castelnaudary', nom: 'Castelnaudary', importance: 2 },
  { id: 'puylaurens', nom: 'Puylaurens', importance: 2 }, { id: 'viterbe', nom: 'Viterbe', importance: 2 },
];

const COS = Math.cos((43.6 * Math.PI) / 180);
const proj = ([lon, lat]: P): P => [lon * COS * 100, -lat * 100];
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

const chemin = (pts: P[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${proj(p)[0].toFixed(2)},${proj(p)[1].toFixed(2)}`).join(' ');

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function CartePlan({ departId, arriveeId, c, hauteur = 200, style }: {
  departId: string; arriveeId: string; c: Couleurs; hauteur?: number; style?: ViewStyle;
}) {
  const [largeur, setLargeur] = useState(0);
  const trace = useMemo(() => itineraire(departId, arriveeId), [departId, arriveeId]);
  const L = useMemo(() => longueur(trace), [trace]);
  const dessin = useRef(new Animated.Value(0)).current;
  const pouls = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let boucle: Animated.CompositeAnimation | undefined;
    dessin.setValue(0);
    AccessibilityInfo.isReduceMotionEnabled().then((calme) => {
      if (calme) { dessin.setValue(1); return; }
      Animated.timing(dessin, { toValue: 1, duration: 1500, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
        boucle = Animated.loop(Animated.timing(pouls, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: false }));
        boucle.start();
      });
    }).catch(() => dessin.setValue(1));
    return () => boucle?.stop();
  }, [departId, arriveeId]);

  // Cadrage : le trajet au centre, avec du contexte autour.
  const cadre = useMemo(() => {
    const ps = trace.map(proj);
    let x0 = Math.min(...ps.map((p) => p[0])), x1 = Math.max(...ps.map((p) => p[0]));
    let y0 = Math.min(...ps.map((p) => p[1])), y1 = Math.max(...ps.map((p) => p[1]));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const asp = (largeur || 358) / hauteur;
    let w = Math.max((x1 - x0) * 1.45, 26), h = Math.max((y1 - y0) * 1.6, 20);
    if (w / h > asp) h = w / asp; else w = h * asp;
    return { x: cx - w / 2, y: cy - h / 2, w, h, k: (largeur || 358) / w };
  }, [trace, largeur, hauteur]);

  const px = (n: number) => n / cadre.k; // pixels écran → unités de la carte
  const a = proj(trace[0]), b = proj(trace[trace.length - 1]);
  const etiquette = (p: P, nom: string, fort: boolean) => {
    const adroite = (p[0] - cadre.x) / cadre.w < 0.62;
    const commun = {
      x: p[0] + (adroite ? px(10) : -px(10)),
      y: p[1] + px(4.5),
      fontSize: px(fort ? 13 : 11),
      fontFamily: fort ? f.display : f.displayMedium,
      fontWeight: fort ? '700' : '500',
      textAnchor: adroite ? 'start' : 'end',
    } as const;
    // halo de la couleur du fond, puis le texte : lisible par-dessus routes et rivières
    return (
      <G>
        <SvgText {...commun} fill={c.surface} stroke={c.surface} strokeWidth={px(3.5)} strokeLinejoin="round">{nom}</SvgText>
        <SvgText {...commun} fill={fort ? c.fort : c.pierre}>{nom}</SvgText>
      </G>
    );
  };
  const nomCourt = (id: string) => lieu(id).nom.replace('Aéroport ', '').replace(', Capitole', '').replace(', la Cité', '');
  const prochesDuTrajet = (p: P) => dist(p, trace[0]) < 0.11 || dist(p, trace[trace.length - 1]) < 0.11;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setLargeur(e.nativeEvent.layout.width)}
      style={[{ height: hauteur, backgroundColor: c.surface, overflow: 'hidden' }, style]}
      accessible
      accessibilityLabel={`Plan du trajet de ${lieu(departId).nom} à ${lieu(arriveeId).nom}`}
    >
      {largeur ? (
        <Svg width={largeur} height={hauteur} viewBox={`${cadre.x} ${cadre.y} ${cadre.w} ${cadre.h}`}>
          {rivieres.map((r) => (
            <Path key={r.nom} d={chemin(r.points)} stroke={c.bain3} strokeWidth={px(2)} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
          ))}
          {troncons.filter((t) => t.type !== 'lien').map((t, i) => (
            <Path
              key={i}
              d={chemin(polyline(t))}
              stroke={t.type === 'autoroute' ? c.delave : c.trait}
              strokeWidth={px(t.type === 'autoroute' ? 2.6 : 1.6)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {/* l'itinéraire */}
          <AnimatedPath
            d={chemin(trace)}
            stroke={c.bain2}
            strokeWidth={px(9)}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[L, L]}
            strokeDashoffset={dessin.interpolate({ inputRange: [0, 1], outputRange: [L, 0] })}
          />
          <AnimatedPath
            d={chemin(trace)}
            stroke={c.action}
            strokeWidth={px(4)}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[L, L]}
            strokeDashoffset={dessin.interpolate({ inputRange: [0, 1], outputRange: [L, 0] })}
          />
          {troncons.filter((t) => t.nom && !prochesDuTrajet(polyline(t)[Math.floor(polyline(t).length / 2)])).map((t) => {
            const pts = polyline(t);
            const m = proj(pts[Math.floor(pts.length / 2)]);
            return (
              <G key={t.nom}>
                <Rect x={m[0] - px(14)} y={m[1] - px(8)} width={px(28)} height={px(15)} rx={px(4)} fill={c.surface} stroke={c.delave} strokeWidth={px(1)} />
                <SvgText x={m[0]} y={m[1] + px(3.5)} fontSize={px(9.5)} fontFamily={f.display} fontWeight="700" fill={c.pierre} textAnchor="middle">{t.nom}</SvgText>
              </G>
            );
          })}
          {villes.filter((v) => !prochesDuTrajet(noeuds[v.id])).map((v) => {
            const p = proj(noeuds[v.id]);
            return (
              <G key={v.id}>
                <Circle cx={p[0]} cy={p[1]} r={px(v.importance === 1 ? 3.2 : 2.4)} fill={c.pierre} />
                {etiquette(p, v.nom, false)}
              </G>
            );
          })}

          <AnimatedCircle
            cx={b[0]} cy={b[1]}
            r={pouls.interpolate({ inputRange: [0, 1], outputRange: [px(6), px(22)] })}
            fill={c.action}
            opacity={pouls.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] })}
          />
          <Circle cx={a[0]} cy={a[1]} r={px(6)} fill={c.surface} stroke={c.action} strokeWidth={px(3)} />
          <AnimatedCircle cx={b[0]} cy={b[1]} r={px(6.5)} fill={c.action} opacity={dessin.interpolate({ inputRange: [0, 0.9, 1], outputRange: [0, 0, 1] })} />
          {etiquette(a, nomCourt(departId), true)}
          {etiquette(b, nomCourt(arriveeId), true)}
        </Svg>
      ) : null}
    </View>
  );
}
