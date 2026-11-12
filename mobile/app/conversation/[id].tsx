import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChauffeurOptionnel } from '../../src/chauffeur';
import { appeler } from '../../src/chauffeurUi';
import { dateCourte, lieu } from '../../src/data';
import { useMessagerie } from '../../src/messagerie';
import { useStore } from '../../src/store';
import { Couleurs, radius, sansContourWeb, space } from '../../src/theme';
import { appelerFabrice } from '../../src/ui';
import { EcranAvecClavier } from '../../src/Clavier';
import { useTheme } from '../../src/useTheme';
import { t, L, anglais, traduireErreur } from '../../src/i18n';

// Réponses toutes prêtes : un geste suffit, même pour un voyageur qui parle peu français.
const rapidesClient = ['Mon vol a du retard', 'Je suis arrivé(e)', 'Où êtes-vous ?', 'J’ai un bagage en plus', 'Merci !'];
const rapidesChauffeur = ['Je suis arrivé', 'J’ai 10 min de retard', 'Je vous attends à la sortie', 'Bien reçu', 'Merci, à bientôt !'];

const heure = (iso: string) => { const d = new Date(iso); return `${d.getHours()}${L('h', ':')}${String(d.getMinutes()).padStart(2, '0')}`; };
// Réponse rapide d'un client anglophone : affichée en anglais, envoyée avec le français entre
// parenthèses pour que Fabrice la comprenne.
const rapideEnvoye = (fr: string) => (anglais() ? `${t(fr)} (${fr})` : fr);

// Conversation d'une course, côté client comme côté Fabrice.
export default function Conversation() {
  const { c, type, s } = useTheme(creerStyles);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { messagesDe, envoyer, marquerLus, nonLus, cote, demo } = useMessagerie();
  const { courses } = useStore();
  const chauffeur = useChauffeurOptionnel();
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  // Infos de la course : depuis l'espace chauffeur ou depuis les courses du client.
  const mission = chauffeur?.missions.find((m) => m.id === id);
  const course = courses.find((x) => x.id === id);
  const interlocuteur = cote === 'chauffeur' ? mission?.nom ?? 'Client' : 'Fabrice';
  const telephone = cote === 'chauffeur' ? mission?.telephone : undefined;
  const sousTitre = mission
    ? `${dateCourte(mission.date)} · ${mission.depart_libelle} → ${mission.arrivee_libelle}`
    : course ? `${dateCourte(course.date)} · ${lieu(course.departId).nom} → ${lieu(course.arriveeId).nom}` : '';

  const messages = messagesDe(id);
  const aLire = nonLus(id);
  useEffect(() => { if (aLire) marquerLus(id); }, [aLire, id]);
  const inverse = useMemo(() => [...messages].reverse(), [messages]);
  const dernierAMoi = [...messages].reverse().find((m) => m.de_chauffeur === (cote === 'chauffeur'));

  const envoyerTexte = async (t: string) => {
    const propre = t.trim();
    if (!propre || envoi) return;
    setEnvoi(true); setErreur('');
    try { await envoyer(id, propre); setTexte(''); } catch (e) { setErreur(traduireErreur(e instanceof Error ? e.message : String(e))); } finally { setEnvoi(false); }
  };

  return (
    <EcranAvecClavier style={{ flex: 1, backgroundColor: c.sol }}>
      <Stack.Screen
        options={{
          title: interlocuteur,
          headerRight: () => (
            <Pressable onPress={() => (cote === 'chauffeur' ? appeler(telephone) : appelerFabrice())} hitSlop={10} accessibilityLabel={`${t('Appeler')} ${interlocuteur}`} style={{ padding: 6 }}>
              <Ionicons name="call-outline" size={22} color={c.accent} />
            </Pressable>
          ),
        }}
      />
      {sousTitre ? <Text style={[type.small, s.sousTitre]} numberOfLines={1}>{sousTitre}</Text> : null}
      <FlatList
        inverted
        data={inverse}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.l, gap: space.s }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: m }) => {
          const moi = m.de_chauffeur === (cote === 'chauffeur');
          return (
            <View style={{ alignItems: moi ? 'flex-end' : 'flex-start' }}>
              <View style={[s.bulle, moi ? s.bulleMoi : s.bulleAutre]}>
                <Text style={[type.body, { color: moi ? c.blanc : c.encre }]}>{m.texte}</Text>
              </View>
              <Text style={[type.label, { fontSize: 11, marginTop: 3, marginHorizontal: 4 }]}>
                {heure(m.envoye_le)}{moi && m.id === dernierAMoi?.id && m.lu_le ? ` · ${t('Lu')}` : ''}
              </Text>
            </View>
          );
        }}
        ListFooterComponent={
          <View style={s.intro}>
            <Ionicons name="chatbubbles-outline" size={26} color={c.bain3} />
            <Text style={[type.small, { textAlign: 'center' }]}>
              {cote === 'chauffeur'
                ? 'Messages gratuits avec votre client, sans SMS. Pour une urgence, appelez-le.'
                : t('Écrivez à Fabrice pour un imprévu : retard, terminal, bagage… Gratuit, sans SMS. Pour une urgence, appelez-le.')}
              {demo ? '\nDémonstration : les messages restent sur ce téléphone.' : ''}
            </Text>
          </View>
        }
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s, paddingBottom: space.s }} keyboardShouldPersistTaps="handled">
        {(cote === 'chauffeur' ? rapidesChauffeur : rapidesClient).map((r) => (
          <Pressable key={r} onPress={() => envoyerTexte(cote === 'chauffeur' ? r : rapideEnvoye(r))} style={({ pressed }) => [s.rapide, pressed && { backgroundColor: c.bain2 }]} disabled={envoi}>
            <Text style={[type.small, { color: c.fort, fontWeight: '600' }]}>{cote === 'chauffeur' ? r : t(r)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {erreur ? <Text style={[type.small, { color: c.erreur, paddingHorizontal: space.l, paddingBottom: space.s }]}>{erreur}</Text> : null}
      <View style={[s.saisie, { paddingBottom: insets.bottom + space.s }]}>
        <TextInput
          value={texte}
          onChangeText={setTexte}
          placeholder={t('Votre message')}
          placeholderTextColor={c.placeholder}
          multiline
          maxLength={1000}
          style={s.champ}
          accessibilityLabel={t('Votre message')}
        />
        <Pressable
          onPress={() => envoyerTexte(texte)}
          disabled={!texte.trim() || envoi}
          accessibilityRole="button"
          accessibilityLabel={t('Envoyer')}
          style={[s.envoyer, (!texte.trim() || envoi) && { opacity: 0.4 }]}
        >
          <Ionicons name="send" size={20} color={c.blanc} />
        </Pressable>
      </View>
    </EcranAvecClavier>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  sousTitre: { paddingHorizontal: space.l, paddingBottom: space.s, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.trait },
  bulle: { maxWidth: '82%', paddingHorizontal: space.m + 2, paddingVertical: space.s + 2, borderRadius: radius.l },
  bulleMoi: { backgroundColor: c.action, borderBottomRightRadius: 6 },
  bulleAutre: { backgroundColor: c.surface, borderBottomLeftRadius: 6 },
  intro: { alignItems: 'center', gap: space.s, paddingVertical: space.xl, paddingHorizontal: space.xl },
  rapide: { borderWidth: 1, borderColor: c.bain2, backgroundColor: c.bain1, borderRadius: 18, paddingHorizontal: space.m, minHeight: 36, justifyContent: 'center' },
  saisie: { flexDirection: 'row', alignItems: 'flex-end', gap: space.s, paddingHorizontal: space.l, paddingTop: space.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait, backgroundColor: c.sol },
  champ: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: c.trait, backgroundColor: c.surface, paddingHorizontal: space.l, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: c.encre, ...sansContourWeb },
  envoyer: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.action, alignItems: 'center', justifyContent: 'center' },
});

