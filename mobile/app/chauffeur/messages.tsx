import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Mission, useChauffeur } from '../../src/chauffeur';
import { Vide, heureDe } from '../../src/chauffeurUi';
import { dateCourte } from '../../src/data';
import { useMessagerie } from '../../src/messagerie';
import { Couleurs, radius, sansContourWeb, space } from '../../src/theme';
import { useTheme } from '../../src/useTheme';

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Moment d'un message : l'heure aujourd'hui, « hier », sinon la date.
function quand(iso: string) {
  const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return heureDe(d);
  const hier = new Date(n); hier.setDate(n.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return 'hier';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

const initiales = (nom: string) => nom.split(/\s+/).filter((x) => /^[A-ZÀ-Ý]/i.test(x)).slice(0, 2).map((x) => x[0].toUpperCase()).join('');

// Boîte de réception de Fabrice : toutes les conversations, la plus récente en haut, les non-lues
// en évidence ; puis les clients des prochaines courses, pour leur écrire en premier.
export default function Messages() {
  const { c, type, s } = useTheme(creerStyles);
  const { missions } = useChauffeur();
  const { conversations, estAMoi } = useMessagerie();
  const [q, setQ] = useState('');

  const sections = useMemo(() => {
    const n = normaliser(q.trim());
    const correspond = (m?: Mission) => !n || (m && normaliser(`${m.nom} ${m.depart_libelle} ${m.arrivee_libelle}`).includes(n));
    const parId = new Map(missions.map((m) => [m.id, m]));
    const fils = conversations
      .map((cv) => ({ ...cv, mission: parId.get(cv.courseId) }))
      .filter((cv) => cv.mission && correspond(cv.mission));
    // Un client = une ligne (sa prochaine course), même s'il a plusieurs réservations.
    const cle = (m: Mission) => m.client_id ?? m.fiche_id ?? m.nom;
    const clientsAvecConversation = new Set(fils.map((cv) => cle(cv.mission!)));
    const maintenant = Date.now();
    const parClient = new Map<string, { m: Mission; n: number }>();
    missions
      .filter((m) => m.client_id && (m.statut === 'confirmee' || m.statut === 'envoyee' || m.statut === 'acompte_attendu') && m.date.getTime() > maintenant - 3600000)
      .filter(correspond)
      .sort((a, b) => +a.date - +b.date)
      .forEach((m) => {
        const k = cle(m);
        if (clientsAvecConversation.has(k)) return;
        const deja = parClient.get(k);
        if (deja) deja.n += 1; else parClient.set(k, { m, n: 1 });
      });
    const aEcrire = [...parClient.values()].slice(0, 15)
      .map(({ m, n }) => ({ courseId: m.id, mission: m, dernier: null, nonLus: 0, autres: n - 1 }));
    return [
      { title: '', data: fils },
      { title: 'Écrire à un client', data: aEcrire },
    ].filter((x) => x.data.length);
  }, [conversations, missions, q]);

  const nonLuesTotal = conversations.reduce((t, cv) => t + cv.nonLus, 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.sol }}>
      <View style={{ padding: space.l, paddingBottom: space.s, gap: space.s }}>
        <View style={s.recherche}>
          <Ionicons name="search" size={20} color={c.pierre} />
          <TextInput value={q} onChangeText={setQ} placeholder="Client, lieu…" placeholderTextColor={c.placeholder} style={s.input} accessibilityLabel="Rechercher une conversation" />
        </View>
        {nonLuesTotal ? <Text style={[type.label, { color: c.alerte }]}>{nonLuesTotal} message{nonLuesTotal > 1 ? 's' : ''} non lu{nonLuesTotal > 1 ? 's' : ''}</Text> : null}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(x) => x.courseId}
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.xxl }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => section.title ? <Text style={[type.label, { paddingTop: space.xl, paddingBottom: space.s }]}>{section.title}</Text> : null}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.trait, marginLeft: 64 }} />}
        renderItem={({ item }) => {
          const m = item.mission!;
          const fort = item.nonLus > 0;
          return (
            <Pressable onPress={() => router.push(`/conversation/${item.courseId}`)} style={({ pressed }) => [s.ligne, pressed && { backgroundColor: c.bain1 }]} accessibilityRole="button"
              accessibilityLabel={`${m.nom}${fort ? `, ${item.nonLus} non lu` : ''}`}>
              <View style={[s.avatar, fort && { backgroundColor: c.action }]}>
                <Text style={[type.label, { fontSize: 14, color: fort ? c.blanc : c.fort }]}>{initiales(m.nom)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
                  <Text style={[type.body, { flex: 1, fontWeight: fort ? '800' : '600' }]} numberOfLines={1}>{m.nom}</Text>
                  {item.dernier ? <Text style={[type.label, { fontSize: 12, color: fort ? c.alerte : c.pierre }]}>{quand(item.dernier.envoye_le)}</Text> : null}
                </View>
                <Text style={[type.small, { fontSize: 12 }]} numberOfLines={1}>{dateCourte(m.date)} {heureDe(m.date)} · {m.depart_libelle} → {m.arrivee_libelle}</Text>
                {item.dernier ? (
                  <Text style={[type.small, { color: fort ? c.encre : c.pierre, fontWeight: fort ? '600' : '400', marginTop: 2 }]} numberOfLines={2}>
                    {estAMoi(item.dernier) ? 'Vous : ' : ''}{item.dernier.texte}
                  </Text>
                ) : (
                  <Text style={[type.small, { color: c.accent, marginTop: 2 }]}>
                    Démarrer la conversation{(() => { const n = 'autres' in item ? Number(item.autres) : 0; return n ? ` · ${n} autre${n > 1 ? 's' : ''} course${n > 1 ? 's' : ''} à venir` : ''; })()}
                  </Text>
                )}
              </View>
              {fort ? <View style={s.badge}><Text style={{ color: c.blanc, fontSize: 12, fontWeight: '700' }}>{item.nonLus}</Text></View> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Vide icone="chatbubbles-outline" titre={q ? 'Aucune conversation trouvée' : 'Pas encore de message'} texte={q ? `Rien ne correspond à « ${q} ».` : 'Les messages de vos clients apparaîtront ici. Vous pouvez aussi leur écrire depuis une course.'} />
        }
      />
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  recherche: { flexDirection: 'row', alignItems: 'center', gap: space.s, backgroundColor: c.surface, borderRadius: radius.m, borderWidth: 1, borderColor: c.trait, paddingHorizontal: space.m, minHeight: 46 },
  input: { flex: 1, fontSize: 16, color: c.encre, minHeight: 44, ...sansContourWeb },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, paddingHorizontal: space.s, borderRadius: radius.s },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.bain1, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: c.alerte, alignItems: 'center', justifyContent: 'center' },
});
