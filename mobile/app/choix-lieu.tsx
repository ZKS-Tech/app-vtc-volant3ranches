import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useChauffeur } from '../src/chauffeur';
import { Lieu, lieux } from '../src/data';
import { Couleurs, radius, sansContourWeb, space } from '../src/theme';
import { useTheme } from '../src/useTheme';

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Choix du départ ou de l'arrivée pour une course saisie par Fabrice.
// Étape suivante : toutes les adresses de France (API Adresse).
export default function ChoixLieu() {
  const { c, type, s } = useTheme(creerStyles);
  const { cible } = useLocalSearchParams<{ cible: 'depart' | 'arrivee' }>();
  const { saisie, majSaisie } = useChauffeur();
  const [q, setQ] = useState('');
  const sections = useMemo(() => {
    const n = normaliser(q.trim());
    const autre = cible === 'depart' ? saisie.arriveeId : saisie.departId;
    const dispo = lieux.filter((l) => l.id !== autre && (!n || normaliser(`${l.nom} ${l.detail}`).includes(n)));
    return [
      { title: 'Aéroport et gares', data: dispo.filter((l) => l.type !== 'ville') },
      { title: 'Villes', data: dispo.filter((l) => l.type === 'ville') },
    ].filter((x) => x.data.length);
  }, [q, cible, saisie]);
  const choisir = (l: Lieu) => { majSaisie(cible === 'depart' ? { departId: l.id } : { arriveeId: l.id }); router.back(); };

  return (
    <View style={{ flex: 1, backgroundColor: c.sol }}>
      <Stack.Screen options={{ title: cible === 'depart' ? 'Prise en charge' : 'Destination' }} />
      <View style={{ padding: space.l, paddingBottom: space.s }}>
        <View style={s.recherche}>
          <Ionicons name="search" size={20} color={c.pierre} />
          <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Ville, gare, aéroport…" placeholderTextColor={c.placeholder} style={s.input} />
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(l) => l.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.xxl }}
        renderSectionHeader={({ section }) => <Text style={[type.label, { paddingTop: space.l, paddingBottom: space.s, backgroundColor: c.sol }]}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => choisir(item)} style={({ pressed }) => [s.ligne, pressed && { backgroundColor: c.bain1 }]}>
            <Ionicons name={item.type === 'aeroport' ? 'airplane' : item.type === 'gare' ? 'train' : 'location'} size={18} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontWeight: '600' }]}>{item.nom}</Text>
              <Text style={type.small}>{item.detail}</Text>
            </View>
          </Pressable>
        )}
        ListFooterComponent={<Text style={[type.small, { marginTop: space.xl }]}>Sélection de lieux du prototype. Toutes les adresses de France arrivent à l’étape suivante.</Text>}
      />
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  recherche: { flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: c.surface, borderRadius: radius.m, borderWidth: 2, borderColor: c.accent, paddingHorizontal: space.m, minHeight: 50 },
  input: { flex: 1, fontSize: 17, color: c.encre, minHeight: 48, ...sansContourWeb },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, borderRadius: radius.s, minHeight: 56 },
});
