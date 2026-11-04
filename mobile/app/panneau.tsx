import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { photos } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, clair, f, space } from '../src/theme';
import { useTheme } from '../src/useTheme';

// Le panneau nominatif, sur le téléphone du client : il sait quoi chercher dans le hall.
// À l'ouverture, la pancarte se retourne comme celle que Fabrice tient à la main.
export default function Panneau() {
  const { c, s } = useTheme(creerStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { courses } = useStore();
  const insets = useSafeAreaInsets();
  const course = courses.find((x) => x.id === id);
  const nom = course?.nom || 'Votre nom';
  const tour = useRef(new Animated.Value(0)).current;

  const retourner = (calme = false) => {
    tour.setValue(0);
    if (calme) return tour.setValue(1);
    Animated.timing(tour, { toValue: 1, duration: 1100, delay: 250, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  };
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => retourner(v)).catch(() => retourner(true));
  }, []);

  const dos = {
    opacity: tour.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [1, 1, 0, 0] }),
    transform: [
      { perspective: 1200 },
      { rotateY: tour.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '90deg'] }) },
      { scale: tour.interpolate({ inputRange: [0, 0.5], outputRange: [0.9, 0.96], extrapolate: 'clamp' }) },
    ],
  };
  const face = {
    opacity: tour.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] }),
    transform: [
      { perspective: 1200 },
      { rotateY: tour.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-90deg', '-90deg', '0deg'] }) },
      { scale: tour.interpolate({ inputRange: [0.5, 1], outputRange: [0.96, 1], extrapolate: 'clamp' }) },
    ],
  };

  return (
    <View style={[s.fond, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }]}>
      <Pressable onPress={() => router.back()} accessibilityLabel="Fermer le panneau" style={s.fermer}>
        <Ionicons name="close" size={26} color={c.blanc} />
      </Pressable>
      <View style={s.centre}>
        <Text style={s.consigne}>Fabrice vous attendra avec ce panneau</Text>
        <Pressable onPress={() => retourner()} accessibilityLabel={`Panneau au nom de ${nom}. Toucher pour le retourner.`}>
          <View>
            <Animated.View style={[s.panneau, s.dos, dos]}>
              <Image source={photos.logoBlanc} style={{ width: 64, height: 64 }} contentFit="contain" />
              <Text style={s.dosTexte}>VOLANT3RANCHES VTC</Text>
            </Animated.View>
            <Animated.View style={[s.panneau, StyleSheet.absoluteFill, face]}>
              <Image source={photos.logo} style={{ width: 44, height: 44 }} contentFit="contain" />
              <Text style={s.nom} adjustsFontSizeToFit numberOfLines={2}>
                {nom.toUpperCase()}
              </Text>
              <Text style={s.marque}>VOLANT3RANCHES VTC</Text>
            </Animated.View>
          </View>
        </Pressable>
        <Text style={s.aide}>Hall des arrivées · attente gratuite 30 min après l’atterrissage</Text>
      </View>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  fond: { flex: 1, backgroundColor: c.cuve, paddingHorizontal: space.l },
  fermer: { alignSelf: 'flex-end', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  centre: { flex: 1, justifyContent: 'center', gap: space.xl },
  consigne: { color: c.surCuve2, fontSize: 17, textAlign: 'center' },
  panneau: {
    backgroundColor: c.blanc, borderRadius: 6, paddingVertical: space.xxl, paddingHorizontal: space.l,
    alignItems: 'center', justifyContent: 'center', gap: space.l, minHeight: 260, backfaceVisibility: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10,
  },
  dos: { backgroundColor: clair.indigo, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  dosTexte: { fontSize: 13, fontWeight: '700', letterSpacing: 3, color: c.surCuve2 },
  nom: { fontFamily: f.display, fontSize: 64, lineHeight: 66, color: clair.cuve, textAlign: 'center', letterSpacing: -0.5 },
  marque: { fontSize: 13, fontWeight: '700', letterSpacing: 2, color: clair.indigo },
  aide: { color: c.surCuve2, fontSize: 15, textAlign: 'center' },
});
