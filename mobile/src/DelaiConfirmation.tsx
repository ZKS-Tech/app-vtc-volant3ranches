import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { Course } from './store';
import { f, space } from './theme';
import { Bouton, appelerFabrice } from './ui';
import { useTheme } from './useTheme';

// Le délai de confirmation : Fabrice s'engage à répondre sous 30 minutes.
// L'anneau se remplit avec le temps écoulé depuis l'envoi ; au-delà, on invite à l'appeler.

const DELAI_MIN = 30;
const TAILLE = 76, EPAISSEUR = 7, R = (TAILLE - EPAISSEUR) / 2, CIRC = 2 * Math.PI * R;
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);

const heure = (d: Date) => `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;

export function DelaiConfirmation({ course }: { course: Course }) {
  const { c, type } = useTheme();
  const envoi = course.envoyeeLe ?? course.date;
  const [maintenant, setMaintenant] = useState(() => new Date());
  const calme = useReducedMotion();
  const progression = useSharedValue(0);
  const souffle = useSharedValue(0);

  useEffect(() => {
    // Le temps restant se compte en minutes : une mise à jour toutes les 15 s suffit.
    const t = setInterval(() => setMaintenant(new Date()), 15000);
    if (!calme) {
      souffle.value = withRepeat(withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      ), -1, false);
    }
    return () => clearInterval(t);
  }, [calme]);

  const ecouleMin = Math.max(0, (maintenant.getTime() - envoi.getTime()) / 60000);
  const part = Math.min(1, ecouleMin / DELAI_MIN);
  const depasse = ecouleMin >= DELAI_MIN;
  const reste = Math.max(0, Math.ceil(DELAI_MIN - ecouleMin));
  const limite = new Date(envoi.getTime() + DELAI_MIN * 60000);

  useEffect(() => {
    progression.value = calme ? part : withTiming(part, { duration: 900, easing: Easing.out(Easing.exp) });
  }, [part, calme]);
  const propsAnneau = useAnimatedProps(() => ({ strokeDashoffset: CIRC * (1 - progression.value) }));
  const stylePoint = useAnimatedStyle(() => ({ opacity: 1 - 0.75 * souffle.value }));

  const couleur = depasse ? c.alerte : c.action;
  return (
    <View
      style={[s.bloc, { backgroundColor: c.surface }]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={depasse
        ? 'Fabrice n’a pas encore répondu. Appelez-le directement.'
        : `En attente de Fabrice. Réponse attendue avant ${heure(limite)}, dans ${reste} minutes.`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.l }}>
        <View style={{ width: TAILLE, height: TAILLE }}>
          <Svg width={TAILLE} height={TAILLE} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={TAILLE / 2} cy={TAILLE / 2} r={R} stroke={c.bain1} strokeWidth={EPAISSEUR} fill="none" />
            <AnimatedCircle
              cx={TAILLE / 2} cy={TAILLE / 2} r={R}
              stroke={couleur} strokeWidth={EPAISSEUR} fill="none" strokeLinecap="round"
              strokeDasharray={[CIRC, CIRC]}
              animatedProps={propsAnneau}
            />
          </Svg>
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            {depasse ? (
              <Text style={[s.chiffre, { color: c.alerte, fontSize: 22 }]}>30+</Text>
            ) : (
              <>
                <Text style={[s.chiffre, { color: c.fort }]}>{reste}</Text>
                <Text style={[type.label, { fontSize: 11, marginTop: -4 }]}>min</Text>
              </>
            )}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <Reanimated.View style={[s.point, { backgroundColor: couleur }, stylePoint]} />
            <Text style={[type.h3, { flex: 1 }]}>{depasse ? 'Toujours en attente' : 'En attente de Fabrice'}</Text>
          </View>
          <Text style={[type.small, { marginTop: 4 }]}>
            Envoyée à {heure(envoi)} · réponse attendue avant {heure(limite)}
          </Text>
        </View>
      </View>
      {depasse ? (
        <View style={{ marginTop: space.m, gap: space.s }}>
          <Text style={[type.small, { color: c.encre }]}>
            Fabrice n’a pas encore répondu, il est peut-être en course. Appelez-le : il répond 24h/24.
          </Text>
          <Bouton titre="Appeler Fabrice" variante="contour" icone="call-outline" onPress={appelerFabrice} />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  bloc: { borderRadius: 18, padding: space.l },
  chiffre: { fontFamily: f.display, fontSize: 28, lineHeight: 30 },
  point: { width: 9, height: 9, borderRadius: 5 },
});
