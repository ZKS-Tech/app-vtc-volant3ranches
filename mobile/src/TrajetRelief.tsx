import { useFocusEffect } from 'expo-router';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Lieu, lieu, lieux } from './data';
import { Couleurs, f } from './theme';

// Le trajet en relief : le Tarn, le Lauragais et la Montagne Noire en 3D stylisée, survolés par la
// caméra pendant que l'itinéraire se dessine en arc d'un point à l'autre.
// Relief stylisé (pas de données d'altitude réelles), positions des villes réelles.

const LON0 = 1.15, LON1 = 2.65, LAT0 = 43.1, LAT1 = 44.05;
const KM = 111 / 10; // 1 unité = 10 km
const COS = Math.cos((43.6 * Math.PI) / 180);
const versMonde = (lon: number, lat: number): [number, number] => [
  (lon - (LON0 + LON1) / 2) * KM * COS,
  -(lat - (LAT0 + LAT1) / 2) * KM,
];

// ——— relief procédural ———
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const bruit = (x: number, y: number) => {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};
const fbm = (x: number, y: number) => {
  let v = 0, a = 0.5;
  for (let i = 0; i < 4; i++) { v += a * bruit(x, y); x = x * 1.9 + 3.1; y = y * 1.9 + 1.7; a *= 0.5; }
  return v;
};
function altitudeGeo(lon: number, lat: number) {
  const collines = fbm(lon * 6, lat * 6) * 0.3; // coteaux du Lauragais et de l'Albigeois
  const montagneNoire = 0.95 * Math.exp(-(((lat - 43.43) / 0.075) ** 2)) * Math.min(1, Math.max(0, (lon - 1.95) / 0.35));
  const sidobre = 0.35 * Math.exp(-(((lon - 2.38) / 0.12) ** 2 + ((lat - 43.67) / 0.07) ** 2));
  const garonne = Math.min(1, Math.hypot(lon - 1.4, (lat - 43.6) * 1.4) / 0.35); // plaine de Toulouse
  return (collines + montagneNoire + sidobre) * (0.35 + 0.65 * garonne);
}
const altitude = (lon: number, lat: number) => altitudeGeo(lon, lat) * 1.5; // relief exagéré

const NX = 110, NZ = 90;
let terrainCache: { pos: Float32Array; nor: Float32Array; h: Float32Array; idx: Uint16Array } | null = null;
function terrain() {
  if (terrainCache) return terrainCache;
  const pos = new Float32Array(NX * NZ * 3), nor = new Float32Array(NX * NZ * 3), h = new Float32Array(NX * NZ);
  const geo = (i: number, j: number): [number, number] => [LON0 + ((LON1 - LON0) * i) / (NX - 1), LAT0 + ((LAT1 - LAT0) * j) / (NZ - 1)];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const [lon, lat] = geo(i, j);
    const [x, z] = versMonde(lon, lat);
    const y = altitude(lon, lat);
    const k = j * NX + i;
    pos.set([x, y, z], k * 3);
    h[k] = y;
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const g = (a: number, b: number) => h[Math.min(NZ - 1, Math.max(0, b)) * NX + Math.min(NX - 1, Math.max(0, a))];
    const dx = (g(i + 1, j) - g(i - 1, j)) / 2, dz = (g(i, j - 1) - g(i, j + 1)) / 2;
    const sx = (KM * COS * (LON1 - LON0)) / (NX - 1), sz = (KM * (LAT1 - LAT0)) / (NZ - 1);
    const n = [-dx / sx, 1, -dz / sz];
    const l = Math.hypot(n[0], n[1], n[2]);
    nor.set([n[0] / l, n[1] / l, n[2] / l], (j * NX + i) * 3);
  }
  const idx = new Uint16Array((NX - 1) * (NZ - 1) * 6);
  let p = 0;
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
    idx.set([a, c, b, b, c, d], p); p += 6;
  }
  terrainCache = { pos, nor, h, idx };
  return terrainCache;
}

// ——— matrices (colonnes) ———
type M4 = number[];
const perspective = (fov: number, asp: number, n: number, fa: number): M4 => {
  const t = 1 / Math.tan(fov / 2);
  return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0];
};
const lookAt = (e: number[], c: number[], u: number[]): M4 => {
  const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]);
  const x = norm(cross(u, z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
};
const mul = (a: M4, b: M4): M4 => {
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return o;
};
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const projeter = (m: M4, p: number[]) => {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return { x: x / w, y: y / w, devant: w > 0 };
};

// ——— shaders ———
const vsTerrain = `
attribute vec3 a_pos; attribute vec3 a_nor;
uniform mat4 u_mvp;
varying vec3 v_nor; varying float v_h; varying vec2 v_xz;
void main() { v_nor = a_nor; v_h = a_pos.y; v_xz = a_pos.xz; gl_Position = u_mvp * vec4(a_pos, 1.0); }
`;
const fsTerrain = `
precision mediump float;
varying vec3 v_nor; varying float v_h; varying vec2 v_xz;
uniform vec3 u_bas; uniform vec3 u_haut; uniform vec3 u_trait; uniform vec3 u_fond;
uniform vec2 u_centre; uniform float u_rayon;
void main() {
  vec3 l = normalize(vec3(-0.5, 0.9, 0.35));
  float ombre = 0.52 + 0.48 * max(dot(normalize(v_nor), l), 0.0);
  vec3 col = mix(u_bas, u_haut, smoothstep(0.1, 1.4, v_h)) * ombre;
  float k = fract(v_h * 5.0);
  float courbe = 1.0 - smoothstep(0.0, 0.09, min(k, 1.0 - k));
  col = mix(col, u_trait, courbe * 0.5 * smoothstep(0.25, 0.45, v_h));
  float d = length(v_xz - u_centre) / u_rayon;
  gl_FragColor = vec4(mix(col, u_fond, smoothstep(0.45, 0.85, d)), 1.0);
}
`;
const vsTrait = `
attribute vec3 a_pos; attribute float a_s; attribute float a_v;
uniform mat4 u_mvp;
varying float v_s; varying float v_v;
void main() { v_s = a_s; v_v = a_v; gl_Position = u_mvp * vec4(a_pos, 1.0); }
`;
const fsTrait = `
precision mediump float;
varying float v_s; varying float v_v;
uniform float u_prog; uniform float u_voiture; uniform vec3 u_couleur; uniform vec3 u_lumiere;
void main() {
  if (v_s > u_prog + 0.001) discard;
  float a = 1.0 - v_v * v_v;
  float halo = u_voiture >= 0.0 ? exp(-pow((v_s - u_voiture) / 0.025, 2.0)) : 0.0;
  vec3 col = mix(u_couleur, u_lumiere, halo);
  gl_FragColor = vec4(col, a * (0.85 + 0.15 * halo));
}
`;

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Arc de l'itinéraire, ruban horizontal + pastilles de départ et d'arrivée.
function geometrieTrait(a: Lieu, b: Lieu) {
  const [ax, az] = versMonde(a.lon, a.lat);
  const [bx, bz] = versMonde(b.lon, b.lat);
  const long = Math.hypot(bx - ax, bz - az);
  const N = 80, demi = 0.1;
  const pos: number[] = [], s: number[] = [], v: number[] = [];
  const point = (t: number) => {
    const lon = a.lon + (b.lon - a.lon) * t, lat = a.lat + (b.lat - a.lat) * t;
    const [x, z] = versMonde(lon, lat);
    return [x, altitude(lon, lat) + 0.12 + Math.sin(Math.PI * t) * Math.max(0.8, long * 0.18), z];
  };
  const nx = -(bz - az) / (long || 1), nz = (bx - ax) / (long || 1);
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = point(t);
    pos.push(p[0] + nx * demi, p[1], p[2] + nz * demi, p[0] - nx * demi, p[1], p[2] - nz * demi);
    s.push(t, t); v.push(-1, 1);
  }
  const ruban = pos.length / 3;
  // pastilles : éventails de triangles en bande (centre, bord, centre, bord…)
  const pastille = (lieuP: Lieu, t: number) => {
    const [x, z] = versMonde(lieuP.lon, lieuP.lat);
    const y = altitude(lieuP.lon, lieuP.lat) + 0.1;
    for (let i = 0; i <= 24; i++) {
      const ang = (i / 24) * Math.PI * 2, r = 0.26;
      pos.push(x, y, z, x + Math.cos(ang) * r, y, z + Math.sin(ang) * r);
      s.push(t, t); v.push(0, 1);
    }
  };
  pastille(a, 0);
  const debutB = pos.length / 3;
  pastille(b, 1);
  return {
    pos: new Float32Array(pos), s: new Float32Array(s), v: new Float32Array(v),
    ruban, pastilleA: [ruban, debutB - ruban], pastilleB: [debutB, pos.length / 3 - debutB],
    centre: [(ax + bx) / 2, (az + bz) / 2], long,
  };
}

export type CouleursRelief = { fond: string; bas: string; haut: string; trait: string; route: string; lumiere: string; texte: string; texte2: string };

export function TrajetRelief({ departId, arriveeId, couleurs, hauteur = 210, style }: {
  departId: string; arriveeId: string; couleurs: CouleursRelief; hauteur?: number; style?: ViewStyle;
}) {
  const a = lieu(departId), b = lieu(arriveeId);
  const geo = useMemo(() => geometrieTrait(a, b), [departId, arriveeId]);
  // Repères : départ et arrivée, plus les grandes villes qui ne se confondent pas avec eux.
  const reperes = useMemo(() => {
    const proches = (l: Lieu, m: Lieu) => Math.hypot(l.lon - m.lon, l.lat - m.lat) < 0.15;
    const villes = lieux.filter((l) => ['toulouse', 'albi', 'castres', 'carcassonne'].includes(l.id) && !proches(l, a) && !proches(l, b));
    return [
      { lieu: a, fort: true }, { lieu: b, fort: true },
      ...villes.map((l) => ({ lieu: l, fort: false })),
    ].map((r) => ({ ...r, xy: new Animated.ValueXY({ x: -999, y: -999 }) }));
  }, [departId, arriveeId]);

  const etat = useRef({ etiquettes: false, actif: true, calme: false, debut: Date.now(), raf: 0, dernier: 0, couleurs, taille: { w: 0, h: hauteur } }).current;
  etat.couleurs = couleurs;
  const opacite = useRef(new Animated.Value(0)).current;
  // Côté de chaque étiquette : à gauche du point quand il est près du bord droit.
  const [aGauche, setAGauche] = useState<Record<string, boolean>>({});

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { etat.calme = v; }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { etat.calme = v; });
    const app = AppState.addEventListener('change', (st) => { etat.actif = st === 'active'; });
    return () => { sub.remove(); app.remove(); cancelAnimationFrame(etat.raf); };
  }, []);
  useFocusEffect(useCallback(() => { etat.actif = true; return () => { etat.actif = false; }; }, []));
  useEffect(() => { etat.debut = Date.now(); etat.etiquettes = false; opacite.setValue(0); }, [departId, arriveeId]);

  const surContexte = (gl: ExpoWebGLRenderingContext) => {
    const programme = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn('Trajet en relief :', gl.getShaderInfoLog(sh));
        gl.attachShader(p, sh);
      }
      gl.linkProgram(p);
      return p;
    };
    const tampon = (data: Float32Array | Uint16Array, cible: number = gl.ARRAY_BUFFER) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(cible, buf);
      gl.bufferData(cible, data, gl.STATIC_DRAW);
      return buf;
    };
    const lier = (p: WebGLProgram, nom: string, buf: WebGLBuffer | null, n: number) => {
      const loc = gl.getAttribLocation(p, nom);
      if (loc < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
    };

    const t = terrain();
    const pT = programme(vsTerrain, fsTerrain);
    const bPos = tampon(t.pos), bNor = tampon(t.nor), bIdx = tampon(t.idx, gl.ELEMENT_ARRAY_BUFFER);
    const pR = programme(vsTrait, fsTrait);
    const g = geo;
    const rPos = tampon(g.pos), rS = tampon(g.s), rV = tampon(g.v);
    const uT = (n: string) => gl.getUniformLocation(pT, n);
    const uR = (n: string) => gl.getUniformLocation(pR, n);

    const image = (now: number) => {
      etat.raf = requestAnimationFrame(image);
      if (!etat.actif) return;
      if (now - etat.dernier < 32) return;
      etat.dernier = now;
      const ecoule = etat.calme ? 99 : (Date.now() - etat.debut) / 1000;
      const intro = Math.min(1, ecoule / 2.2);
      const ease = 1 - Math.pow(1 - intro, 3);
      const prog = etat.calme ? 1 : Math.min(1, Math.max(0, (ecoule - 0.6) / 1.6));
      const voiture = etat.calme || prog < 1 ? -1 : ((ecoule - 2.2) / 4) % 1;

      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const dist = Math.max(5.5, g.long * 1.25) * (1.55 - 0.55 * ease);
      const lacet = -0.5 + (etat.calme ? 0 : 0.5 * (1 - ease) + 0.1 * Math.sin(ecoule * 0.18));
      const tangage = 0.78;
      const cible = [g.centre[0], 0.2, g.centre[1]];
      const oeil = [
        cible[0] + Math.sin(lacet) * Math.cos(tangage) * dist,
        cible[1] + Math.sin(tangage) * dist,
        cible[2] + Math.cos(lacet) * Math.cos(tangage) * dist,
      ];
      const mvp = mul(perspective((38 * Math.PI) / 180, W / H, 0.1, 100), lookAt(oeil, cible, [0, 1, 0]));
      const c = etat.couleurs;

      gl.viewport(0, 0, W, H);
      const fond = rgb(c.fond);
      gl.clearColor(fond[0], fond[1], fond[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(pT);
      lier(pT, 'a_pos', bPos, 3);
      lier(pT, 'a_nor', bNor, 3);
      gl.uniformMatrix4fv(uT('u_mvp'), false, new Float32Array(mvp));
      gl.uniform3fv(uT('u_bas'), rgb(c.bas));
      gl.uniform3fv(uT('u_haut'), rgb(c.haut));
      gl.uniform3fv(uT('u_trait'), rgb(c.trait));
      gl.uniform3fv(uT('u_fond'), fond);
      gl.uniform2f(uT('u_centre'), g.centre[0], g.centre[1]);
      gl.uniform1f(uT('u_rayon'), Math.max(5.5, g.long * 1.25) * 0.8); // cadrage final : pas de bord visible pendant le survol
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx);
      gl.drawElements(gl.TRIANGLES, t.idx.length, gl.UNSIGNED_SHORT, 0);

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(pR);
      lier(pR, 'a_pos', rPos, 3);
      lier(pR, 'a_s', rS, 1);
      lier(pR, 'a_v', rV, 1);
      gl.uniformMatrix4fv(uR('u_mvp'), false, new Float32Array(mvp));
      gl.uniform1f(uR('u_prog'), prog);
      gl.uniform1f(uR('u_voiture'), voiture);
      gl.uniform3fv(uR('u_couleur'), rgb(c.route));
      gl.uniform3fv(uR('u_lumiere'), rgb(c.lumiere));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, g.ruban);
      gl.uniform1f(uR('u_voiture'), -1);
      gl.drawArrays(gl.TRIANGLE_STRIP, g.pastilleA[0], g.pastilleA[1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, g.pastilleB[0], g.pastilleB[1]);
      gl.flush();
      gl.endFrameEXP();

      // Étiquettes posées sur la projection des villes.
      const { w, h } = etat.taille;
      const cotes: Record<string, boolean> = {};
      for (const r of reperes) {
        const [x, z] = versMonde(r.lieu.lon, r.lieu.lat);
        const p = projeter(mvp, [x, altitude(r.lieu.lon, r.lieu.lat) + 0.1, z]);
        const visible = p.devant && Math.abs(p.x) < 0.92 && Math.abs(p.y) < 0.9;
        const px = (p.x * 0.5 + 0.5) * w;
        cotes[r.lieu.id] = px > w * 0.58;
        r.xy.setValue(visible ? { x: px, y: (0.5 - p.y * 0.5) * h } : { x: -999, y: -999 });
      }
      if (intro >= 1 && !etat.etiquettes) {
        etat.etiquettes = true;
        setAGauche(cotes);
        Animated.timing(opacite, { toValue: 1, duration: 300, useNativeDriver: false }).start();
      }
    };
    etat.raf = requestAnimationFrame(image);
  };

  return (
    <View
      style={[{ height: hauteur, overflow: 'hidden', backgroundColor: couleurs.fond }, style]}
      onLayout={(e) => { etat.taille = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}
      accessible
      accessibilityLabel={`Carte du trajet de ${a.nom} à ${b.nom}`}
    >
      <GLView style={StyleSheet.absoluteFill} onContextCreate={surContexte} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: opacite }]}>
        {reperes.map((r) => (
          <Animated.View key={r.lieu.id} style={{ position: 'absolute', left: aGauche[r.lieu.id] ? -178 : 8, top: -9, width: 170, height: 20, transform: r.xy.getTranslateTransform() }}>
            <Text
              numberOfLines={1}
              style={{
                textAlign: aGauche[r.lieu.id] ? 'right' : 'left',
                fontSize: r.fort ? 13 : 11, fontWeight: r.fort ? '700' : '600',
                fontFamily: r.fort ? f.displayMedium : undefined,
                color: r.fort ? couleurs.texte : couleurs.texte2,
                textShadowColor: couleurs.fond, textShadowRadius: 4,
              }}
            >
              {r.lieu.nom.replace('Aéroport ', '').replace(', Capitole', '').replace(', la Cité', '')}
            </Text>
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

export const couleursRelief = (c: Couleurs, sombre: boolean): CouleursRelief => ({
  fond: c.surface,
  bas: sombre ? c.bain1 : c.bain2,
  haut: sombre ? c.bain3 : c.bain3,
  trait: sombre ? c.bain4 : c.bain4,
  route: sombre ? c.accent : c.action,
  lumiere: c.feuille,
  texte: c.fort,
  texte2: c.pierre,
});
