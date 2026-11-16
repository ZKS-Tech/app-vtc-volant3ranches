import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Lieu, lieux } from './data';
import { enregistrerLieu, useRechercheAdresses } from './geo';
import { Couleurs, radius, sansContourWeb, space } from './theme';
import { IconName, Note } from './ui';
import { useTheme } from './useTheme';
import { t } from './i18n';

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Recherche d'un départ ou d'une arrivée : les raccourcis (aéroport, gares, villes) d'abord,
// puis toutes les adresses de France (API Adresse) dès trois lettres.
export function RechercheLieu({ exclure, onChoisir, indication }: {
  exclure?: string; onChoisir: (l: Lieu) => void; indication?: string;
}) {
  const { c, type, s } = useTheme(creerStyles);
  const [q, setQ] = useState('');
  const { resultats, etat } = useRechercheAdresses(q);

  const sections = useMemo(() => {
    const n = normaliser(q.trim());
    const raccourcis = lieux.filter((l) => l.id !== exclure && (!n || normaliser(`${l.nom} ${l.detail} ${t(l.nom)}`).includes(n)));
    const transferts = raccourcis.filter((l) => l.type === 'aeroport' || l.type === 'gare');
    const villes = raccourcis.filter((l) => l.type === 'ville');
    return [
      { title: t('Aéroport et gares'), data: transferts },
      { title: n.length >= 3 ? t('Adresses') : '', data: n.length >= 3 ? resultats : [] },
      { title: t('Villes desservies'), data: n.length >= 3 ? [] : villes },
    ].filter((x) => x.data.length);
  }, [q, resultats, exclure]);

  const choisir = (l: Lieu) => onChoisir(l.id.startsWith('ban:') ? enregistrerLieu(l) : l);
  const icone = (l: Lieu): IconName => (l.type === 'aeroport' ? 'airplane' : l.type === 'gare' ? 'train' : l.type === 'ville' ? 'business-outline' : 'location');

  return (
    <View style={{ flex: 1, backgroundColor: c.sol }}>
      <View style={{ padding: space.l, paddingBottom: space.s }}>
        <View style={s.recherche}>
          <Ionicons name="search" size={20} color={c.pierre} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder={t('Adresse, ville, gare, aéroport…')}
            placeholderTextColor={c.placeholder}
            style={s.input}
            autoCorrect={false}
            accessibilityLabel={t('Rechercher une adresse')}
          />
          {etat === 'chargement' ? <ActivityIndicator size="small" color={c.accent} /> : null}
          {q && etat !== 'chargement' ? (
            <Pressable onPress={() => setQ('')} accessibilityLabel={t('Effacer')} hitSlop={12}>
              <Ionicons name="close-circle" size={20} color={c.pierre} />
            </Pressable>
          ) : null}
        </View>
        {indication && !q ? <Text style={[type.small, { marginTop: space.s }]}>{indication}</Text> : null}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(l) => l.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.xxl }}
        renderSectionHeader={({ section }) => section.title ? <Text style={[type.label, s.entete]}>{section.title}</Text> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => choisir(item)} style={({ pressed }) => [s.ligne, pressed && { backgroundColor: c.bain1 }]} accessibilityRole="button">
            <View style={s.icone}>
              <Ionicons name={icone(item)} size={18} color={c.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={2}>{t(item.nom)}</Text>
              {item.detail ? <Text style={type.small}>{t(item.detail)}</Text> : null}
            </View>
          </Pressable>
        )}
        ListFooterComponent={() =>
          etat === 'erreur' ? (
            <View style={{ marginTop: space.l }}>
              <Note ton="alerte">{t("La recherche d'adresses ne répond pas. Vérifiez la connexion, ou choisissez un lieu ci-dessus.")}</Note>
            </View>
          ) : q.trim().length >= 3 && etat === 'repos' && !resultats.length ? (
            <Text style={[type.small, { marginTop: space.l }]}>{t('Aucune adresse trouvée pour « {q} ». Essayez avec le nom de la ville.', { q })}</Text>
          ) : q.trim().length > 0 && q.trim().length < 3 ? (
            <Text style={[type.small, { marginTop: space.l }]}>{t("Encore quelques lettres pour chercher l'adresse…")}</Text>
          ) : null
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
  input: { flex: 1, fontSize: 17, color: c.encre, minHeight: 48, ...sansContourWeb },
  entete: { paddingTop: space.l, paddingBottom: space.s, backgroundColor: c.sol },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, borderRadius: radius.s, minHeight: 56 },
  icone: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.bain1, alignItems: 'center', justifyContent: 'center' },
});
