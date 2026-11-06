import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { recette, useChauffeur } from '../../src/chauffeur';
import { Vide } from '../../src/chauffeurUi';
import { euros } from '../../src/data';
import { Couleurs, radius, sansContourWeb, space } from '../../src/theme';
import { useTheme } from '../../src/useTheme';

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Le carnet de clients : recherche par nom, téléphone ou email ; les plus récents en premier.
export default function Clients() {
  const { c, type, s } = useTheme(creerStyles);
  const { fiches, missions } = useChauffeur();
  const [q, setQ] = useState('');

  const lignes = useMemo(() => {
    const n = normaliser(q.trim());
    return fiches
      .map((f) => {
        const ms = missions.filter((m) => m.fiche_id === f.id);
        const derniere = ms.reduce<Date | null>((d, m) => (!d || m.date > d ? m.date : d), null);
        return { f, n: ms.filter((m) => m.statut === 'terminee').length, total: ms.reduce((t, m) => t + recette(m), 0), derniere };
      })
      .filter(({ f }) => !n || normaliser(`${f.nom} ${f.telephone ?? ''} ${f.email ?? ''}`).includes(n) || (f.telephone ?? '').replace(/\D/g, '').includes(n.replace(/\D/g, '') || '§'))
      .sort((a, b) => (b.derniere?.getTime() ?? 0) - (a.derniere?.getTime() ?? 0));
  }, [fiches, missions, q]);

  return (
    <FlatList
      style={{ backgroundColor: c.sol }}
      contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }}
      data={lignes}
      keyExtractor={(l) => l.f.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: space.m, marginBottom: space.m }}>
          <View style={s.recherche}>
            <Ionicons name="search" size={20} color={c.pierre} />
            <TextInput value={q} onChangeText={setQ} placeholder="Nom, téléphone, email…" placeholderTextColor={c.placeholder} style={s.input} accessibilityLabel="Rechercher un client" />
          </View>
          <Pressable onPress={() => router.push('/fiche/nouveau')} style={s.ajout} accessibilityRole="button">
            <Ionicons name="person-add-outline" size={20} color={c.accent} />
            <Text style={[type.body, { color: c.accent, fontWeight: '600' }]}>Nouveau client</Text>
          </Pressable>
          <Text style={type.label}>{lignes.length} client{lignes.length > 1 ? 's' : ''}</Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.trait, marginLeft: 56 }} />}
      renderItem={({ item: { f, n, total, derniere } }) => (
        <Pressable onPress={() => router.push(`/fiche/${f.id}`)} style={({ pressed }) => [s.ligne, pressed && { backgroundColor: c.bain1 }]} accessibilityRole="button">
          <View style={s.initiales}>
            <Text style={[type.label, { color: c.fort, fontSize: 14 }]}>{f.nom.split(/\s+/).filter((x) => /^[A-ZÀ-Ý]/i.test(x)).slice(0, 2).map((x) => x[0].toUpperCase()).join('')}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{f.nom}</Text>
            <Text style={type.small} numberOfLines={1}>
              {f.telephone ?? f.email ?? 'Sans coordonnées'}{f.notes ? ' · note' : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[type.body, { fontWeight: '700' }]}>{euros(total).replace(',00', '')}</Text>
            <Text style={type.small}>{n} course{n > 1 ? 's' : ''}{derniere ? '' : ''}</Text>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={<Vide icone="people-outline" titre={q ? 'Aucun client trouvé' : 'Pas encore de client'} texte={q ? `Rien ne correspond à « ${q} ».` : 'Chaque demande crée automatiquement la fiche du client.'} />}
    />
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  recherche: { flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: c.surface, borderRadius: radius.m, borderWidth: 1, borderColor: c.trait, paddingHorizontal: space.m, minHeight: 48 },
  input: { flex: 1, fontSize: 17, color: c.encre, minHeight: 46, ...sansContourWeb },
  ajout: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 44 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, paddingHorizontal: space.s, borderRadius: radius.s, backgroundColor: c.surface },
  initiales: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.bain1, alignItems: 'center', justifyContent: 'center' },
});
