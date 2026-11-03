import { useFocusEffect } from 'expo-router';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { Accelerometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native';

// Cuve d'indigo vivante : un bain de teinture rendu en temps réel (shader WebGL).
// niveau 0 = eau claire traversée de volutes ; niveau 1 = la cuve, l'indigo a tout envahi.
// L'encre monte du bas et se diffuse quand le niveau change. Le téléphone incliné déplace le bain.

export type CouleursCuve = { eau: string; voile: string; indigo: string; cuve: string };

const FACTEUR = 3; // calcul en basse définition puis agrandi : le motif est flou par nature

const vertex = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_t;
uniform vec2 u_tilt;
uniform float u_niveau;
uniform vec3 u_eau;
uniform vec3 u_voile;
uniform vec3 u_indigo;
uniform vec3 u_cuve;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  p += u_tilt * 0.22;
  float t = u_t * 0.045;
  vec2 q = vec2(fbm(p * 1.4 + vec2(0.0, t)), fbm(p * 1.4 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p * 1.4 + 2.8 * q + vec2(1.7, 9.2) + 0.7 * t),
                fbm(p * 1.4 + 2.8 * q + vec2(8.3, 2.8) - 0.6 * t));
  float f = fbm(p * 1.4 + 3.0 * r);

  // La cuve : indigo dense, voiles plus clairs, filaments de lumière.
  vec3 dense = mix(u_cuve, u_indigo, smoothstep(0.2, 0.85, f));
  dense = mix(dense, u_voile, 0.38 * smoothstep(0.42, 0.95, r.x * f * 1.6));
  float fil = 1.0 - smoothstep(0.0, 0.04, abs(f - 0.52));
  dense += fil * 0.09;

  // L'eau claire, traversée de volutes de teinture.
  vec3 eau = mix(u_eau, u_voile, 0.75 * smoothstep(0.38, 0.8, f));
  eau = mix(eau, u_indigo, 0.12 * smoothstep(0.55, 0.9, r.y));

  // L'encre monte du bas et se diffuse en suivant les volutes.
  float front = u_niveau * 1.6 - 0.3;
  float m = 1.0 - smoothstep(front - 0.25, front + 0.1, uv.y + (f - 0.5) * 0.8);

  vec3 col = mix(eau, dense, m);
  col *= 1.0 - 0.16 * dot(p, p) * m;
  gl_FragColor = vec4(col, 1.0);
}
`;

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function CuveIndigo({ niveau, couleurs, style }: { niveau: number; couleurs: CouleursCuve; style?: ViewStyle }) {
  const [taille, setTaille] = useState<{ w: number; h: number } | null>(null);
  const etat = useRef({
    niveau: niveau, cible: niveau, couleurs, tilt: [0, 0], tiltCible: [0, 0],
    actif: true, calme: false, debut: Date.now(), raf: 0 as number, dernier: 0,
  }).current;
  etat.cible = niveau;
  etat.couleurs = couleurs;

  // « Réduire les animations » : le bain reste immobile, seul le niveau change.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { etat.calme = v; }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { etat.calme = v; });
    return () => sub.remove();
  }, []);

  // Pause hors écran et en arrière-plan.
  useFocusEffect(useCallback(() => {
    etat.actif = true;
    return () => { etat.actif = false; };
  }, []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { etat.actif = s === 'active'; });
    return () => sub.remove();
  }, []);

  // Inclinaison du téléphone.
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    Accelerometer.isAvailableAsync()
      .then((ok) => {
        if (!ok) return;
        Accelerometer.setUpdateInterval(60);
        sub = Accelerometer.addListener(({ x, y }) => {
          etat.tiltCible = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
        });
      })
      .catch(() => {});
    return () => sub?.remove();
  }, []);

  useEffect(() => () => cancelAnimationFrame(etat.raf), []);

  const surContexte = (gl: ExpoWebGLRenderingContext) => {
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('Cuve indigo :', gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const U = {
      res: u('u_res'), t: u('u_t'), tilt: u('u_tilt'), niveau: u('u_niveau'),
      eau: u('u_eau'), voile: u('u_voile'), indigo: u('u_indigo'), cuve: u('u_cuve'),
    };

    const image = (now: number) => {
      etat.raf = requestAnimationFrame(image);
      if (!etat.actif) return;
      const enMouvement = Math.abs(etat.cible - etat.niveau) > 0.002;
      if (etat.calme && !enMouvement && etat.dernier) return; // image fixe
      if (now - etat.dernier < 32) return; // ~30 images/s suffisent à un bain qui dérive
      const dt = etat.dernier ? Math.min(0.1, (now - etat.dernier) / 1000) : 0.016;
      etat.dernier = now;
      // montée de l'encre : approche exponentielle, ~1,5 s
      etat.niveau = etat.calme ? etat.cible : etat.niveau + (etat.cible - etat.niveau) * (1 - Math.exp(-dt * 2.6));
      etat.tilt = etat.calme ? [0, 0] : etat.tilt.map((v, i) => v + (etat.tiltCible[i] - v) * 0.08);
      const t = etat.calme ? 12 : (Date.now() - etat.debut) / 1000;
      const c = etat.couleurs;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform2f(U.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(U.t, t);
      gl.uniform2f(U.tilt, etat.tilt[0], etat.tilt[1]);
      gl.uniform1f(U.niveau, etat.niveau);
      gl.uniform3fv(U.eau, rgb(c.eau));
      gl.uniform3fv(U.voile, rgb(c.voile));
      gl.uniform3fv(U.indigo, rgb(c.indigo));
      gl.uniform3fv(U.cuve, rgb(c.cuve));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.flush();
      gl.endFrameEXP();
    };
    etat.raf = requestAnimationFrame(image);
  };

  const mesurer = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (!taille || Math.abs(taille.w - w) > 1 || Math.abs(taille.h - h) > 1) setTaille({ w, h });
  };

  return (
    <View
      pointerEvents="none"
      onLayout={mesurer}
      style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: niveau > 0.5 ? couleurs.indigo : couleurs.eau }, style]}
    >
      {taille ? (
        <GLView
          onContextCreate={surContexte}
          style={{
            position: 'absolute',
            width: Math.ceil(taille.w / FACTEUR),
            height: Math.ceil(taille.h / FACTEUR),
            left: (taille.w - taille.w / FACTEUR) / 2,
            top: (taille.h - taille.h / FACTEUR) / 2,
            transform: [{ scale: FACTEUR }],
          }}
        />
      ) : null}
    </View>
  );
}
