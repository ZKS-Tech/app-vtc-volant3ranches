import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Lieu, lieux } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, radius, space } from '../src/theme';
import { useTheme } from '../src/useTheme';
import { Note } from '../src/ui';

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Adresse() {
  const { c, type, s } = useTheme(creerStyles);
  const { champ } = useLocalSearchParams<{ champ: 'depart' | 'arrivee' }>();
  const { brouillon, maj } = useStore();
  const [q, setQ] = useState('');

  const sections = useMemo(() => {
    const n = normaliser(q.trim());
    const ok = (l: Lieu) => !n || normaliser(`${l.nom} ${l.detail}`).includes(n);
    const autre = champ === 'depart' ? brouillon.arriveeId : brouillon.departId;
    const dispo = lieux.filter((l) => ok(l) && l.id !== autre);
    return [
      { title: 'Aéroport et gares', data: dispo.filter((l) => l.type !== 'ville') },
      { title: 'Villes', data: dispo.filter((l) => l.type === 'ville') },
    ].filter((x) => x.data.length);
  }, [q, champ, brouillon]);

  const choisir = (l: Lieu) => {
    maj(champ === 'depart' ? { departId: l.id } : { arriveeId: l.id });
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.sol }}>
      <Stack.Screen options={{ title: champ === 'depart' ? 'Adresse de départ' : "Adresse d'arrivée" }} />
      <View style={{ padding: space.l, paddingBottom: space.s }}>
        <View style={s.recherche}>
          <Ionicons name="search" size={20} color={c.pierre} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder="Ville, gare, aéroport, adresse…"
            placeholderTextColor={c.placeholder}
            style={s.input}
            accessibilityLabel="Rechercher une adresse"
          />
          {q ? (
            <Pressable onPress={() => setQ('')} accessibilityLabel="Effacer" hitSlop={12}>
              <Ionicons name="close-circle" size={20} color={c.pierre} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(l) => l.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.xxl }}
        renderSectionHeader={({ section }) => <Text style={[type.label, s.entete]}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => choisir(item)} style={({ pressed }) => [s.ligne, pressed && { backgroundColor: c.bain1 }]}>
            <View style={s.icone}>
              <Ionicons name={item.type === 'aeroport' ? 'airplane' : item.type === 'gare' ? 'train' : 'location'} size={18} color={c.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontWeight: '600' }]}>{item.nom}</Text>
              <Text style={type.small}>{item.detail}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ marginTop: space.l }}>
            <Note ton="bain">
              Aucun lieu ne correspond à « {q} ». Dans l'application finale, toutes les adresses de France seront proposées.
            </Note>
          </View>
        }
        ListFooterComponent={
          <Text style={[type.small, { marginTop: space.xl }]}>
            Prototype : une sélection de lieux du Tarn, de Toulouse et de Carcassonne. La recherche d'adresses complète
            (Google) sera branchée dans l'application finale.
          </Text>
        }
      />
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  recherche: {
    flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: c.surface, borderRadius: radius.m,
    borderWidth: 2, borderColor: c.accent, paddingHorizontal: space.m, minHeight: 50,
  },
  input: { flex: 1, fontSize: 17, color: c.encre, minHeight: 48, outlineStyle: 'none' } as object,
  entete: { paddingTop: space.l, paddingBottom: space.s, backgroundColor: c.sol },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, borderRadius: radius.s, minHeight: 56 },
  icone: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.bain1, alignItems: 'center', justifyContent: 'center' },
});
