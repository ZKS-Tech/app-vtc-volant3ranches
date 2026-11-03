import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { photos } from '../src/data';
import { useStore } from '../src/store';
import { c, f, space } from '../src/theme';

// Le panneau nominatif, sur le téléphone du client : il sait quoi chercher dans le hall.
export default function Panneau() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { courses } = useStore();
  const insets = useSafeAreaInsets();
  const course = courses.find((x) => x.id === id);
  const nom = course?.nom || 'Votre nom';

  return (
    <View style={[s.fond, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }]}>
      <Pressable onPress={() => router.back()} accessibilityLabel="Fermer le panneau" style={s.fermer}>
        <Ionicons name="close" size={26} color={c.surface} />
      </Pressable>
      <View style={s.centre}>
        <Text style={s.consigne}>Fabrice vous attendra avec ce panneau</Text>
        <View style={s.panneau}>
          <Image source={photos.logo} style={{ width: 44, height: 44 }} contentFit="contain" />
          <Text style={s.nom} adjustsFontSizeToFit numberOfLines={2}>
            {nom.toUpperCase()}
          </Text>
          <Text style={s.marque}>VOLANT3RANCHES VTC</Text>
        </View>
        <Text style={s.aide}>Hall des arrivées · attente gratuite 15 min après l’atterrissage</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fond: { flex: 1, backgroundColor: c.cuve, paddingHorizontal: space.l },
  fermer: { alignSelf: 'flex-end', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  centre: { flex: 1, justifyContent: 'center', gap: space.xl },
  consigne: { color: c.surCuve2, fontSize: 17, textAlign: 'center' },
  panneau: { backgroundColor: c.surface, borderRadius: 6, paddingVertical: space.xxl, paddingHorizontal: space.l, alignItems: 'center', gap: space.l },
  nom: { fontFamily: f.display, fontSize: 64, lineHeight: 66, color: c.cuve, textAlign: 'center', letterSpacing: -0.5 },
  marque: { fontSize: 13, fontWeight: '700', letterSpacing: 2, color: c.indigo },
  aide: { color: c.surCuve2, fontSize: 15, textAlign: 'center' },
});
