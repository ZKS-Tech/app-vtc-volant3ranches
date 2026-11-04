import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bilan, estAujourdhui, useChauffeur } from '../../src/chauffeur';
import { Chiffre, DemandeCarte, LigneMission, TrajetLibre, appeler, dansCombien, heureDe, ouvrirGps, useMaintenant } from '../../src/chauffeurUi';
import { CuveIndigo } from '../../src/CuveIndigo';
import { euros, offre } from '../../src/data';
import { Couleurs, f, radius, space } from '../../src/theme';
import { Bouton, Note, Titre } from '../../src/ui';
import { useTheme } from '../../src/useTheme';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Tableau de bord : ce qui demande une action, la prochaine course, la journée, le mois.
export default function TableauDeBord() {
  const { c, type, s } = useTheme(creerStyles);
  const insets = useSafeAreaInsets();
  const { missions, demo, chargement, erreur, recharger } = useChauffeur();
  const maintenant = useMaintenant();

  const aTraiter = missions.filter((m) => m.statut === 'envoyee').sort((a, b) => +new Date(a.envoyee_le) - +new Date(b.envoyee_le));
  const aVenir = missions.filter((m) => m.statut === 'confirmee' && m.date.getTime() > maintenant.getTime() - 30 * 60000).sort((a, b) => +a.date - +b.date);
  const prochaine = aVenir[0];
  const aujourdhui = aVenir.filter((m) => estAujourdhui(m.date) && m.id !== prochaine?.id);
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  const finMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
  const mois = bilan(missions, debutMois, finMois);
  const nbAujourdhui = missions.filter((m) => m.statut === 'confirmee' && estAujourdhui(m.date)).length;

  return (
    <ScrollView
      style={{ backgroundColor: c.sol }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={recharger} tintColor={c.accent} />}
    >
      <View style={[s.entete, { paddingTop: insets.top + space.l }]}>
        <CuveIndigo niveau={1} couleurs={{ eau: c.cuve, voile: c.bain4, indigo: c.indigo, cuve: c.cuve }} />
        <Text style={s.date}>{JOURS[maintenant.getDay()][0].toUpperCase() + JOURS[maintenant.getDay()].slice(1)} {maintenant.getDate()} {MOIS[maintenant.getMonth()]}</Text>
        <Text style={s.bonjour}>Bonjour Fabrice</Text>
        <Text style={s.resume}>
          {aTraiter.length ? `${aTraiter.length} demande${aTraiter.length > 1 ? 's' : ''} à traiter · ` : 'Aucune demande en attente · '}
          {nbAujourdhui ? `${nbAujourdhui} course${nbAujourdhui > 1 ? 's' : ''} aujourd'hui` : "pas de course aujourd'hui"}
        </Text>
        <Bouton titre="Nouvelle course" icone="add" variante="clair" onPress={() => router.push('/saisie')} style={{ alignSelf: 'flex-start', marginTop: space.l, minHeight: 44 }} />
      </View>

      <View style={{ paddingHorizontal: space.l }}>
        {demo ? (
          <View style={{ marginTop: space.l }}>
            <Note ton="bain" icone="eye-outline">Démonstration : clients et courses fictifs. Rien n'est enregistré.</Note>
          </View>
        ) : null}
        {erreur ? (
          <View style={{ marginTop: space.l }}>
            <Note ton="erreur">Impossible de charger les données : {erreur}. Tirez vers le bas pour réessayer.</Note>
          </View>
        ) : null}
        {chargement ? <Text style={[type.small, { marginTop: space.l }]}>Chargement…</Text> : null}

        {aTraiter.length ? (
          <>
            <Titre>À traiter</Titre>
            <View style={{ gap: space.m }}>
              {aTraiter.slice(0, 2).map((m) => <DemandeCarte key={m.id} m={m} />)}
            </View>
            {aTraiter.length > 2 ? (
              <Bouton titre={`Voir les ${aTraiter.length} demandes`} variante="texte" onPress={() => router.navigate('/chauffeur/demandes')} style={{ alignSelf: 'flex-start', marginTop: space.s }} />
            ) : null}
          </>
        ) : null}

        <Titre>Prochaine course</Titre>
        {prochaine ? (
          <Pressable onPress={() => router.push(`/mission/${prochaine.id}`)} style={s.prochaine} accessibilityRole="button">
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={s.prochaineHeure}>{heureDe(prochaine.date)}</Text>
              <Text style={[s.compte, { color: c.surCuve2 }]}>{estAujourdhui(prochaine.date) ? '' : `${prochaine.date.getDate()}/${prochaine.date.getMonth() + 1} · `}{dansCombien(prochaine.date, maintenant)}</Text>
            </View>
            <View style={{ marginVertical: space.l }}>
              <TrajetLibre m={prochaine} couleur={c.blanc} couleur2={c.surCuve2} />
            </View>
            <Text style={[type.small, { color: c.surCuve2 }]}>
              {prochaine.nom} · {offre(prochaine.offre_id as 'tesla' | 'van').vehicule} · {prochaine.passagers} pass. · {prochaine.bagages} bag.
              {prochaine.numero_vol_train ? ` · ${prochaine.numero_vol_train}` : ''} · {euros(prochaine.montant)}
            </Text>
            {prochaine.commentaire ? <Text style={[type.small, { color: c.blanc, marginTop: 6 }]}>« {prochaine.commentaire} »</Text> : null}
            <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.l }}>
              <Bouton titre="Waze" icone="navigate-outline" variante="clair" onPress={() => ouvrirGps('waze', prochaine.depart_lat, prochaine.depart_lon, prochaine.depart_libelle)} style={{ flex: 1, minHeight: 44, paddingHorizontal: space.s }} />
              <Bouton titre="Maps" icone="map-outline" variante="clair" onPress={() => ouvrirGps('maps', prochaine.depart_lat, prochaine.depart_lon, prochaine.depart_libelle)} style={{ flex: 1, minHeight: 44, paddingHorizontal: space.s }} />
              <Bouton titre="Appeler" icone="call-outline" variante="clair" onPress={() => appeler(prochaine.telephone)} style={{ flex: 1, minHeight: 44, paddingHorizontal: space.s }} />
            </View>
          </Pressable>
        ) : (
          <View style={s.bloc}>
            <Text style={type.small}>Aucune course confirmée à venir.</Text>
          </View>
        )}

        {aujourdhui.length ? (
          <>
            <Titre>Plus tard aujourd'hui</Titre>
            <View style={s.bloc}>{aujourdhui.map((m) => <LigneMission key={m.id} m={m} />)}</View>
          </>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: space.xxl, marginBottom: space.m }}>
          <Text accessibilityRole="header" style={[type.h2, { flex: 1 }]}>{MOIS[maintenant.getMonth()][0].toUpperCase() + MOIS[maintenant.getMonth()].slice(1)}</Text>
          <Pressable onPress={() => router.push('/chiffre-affaires')} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[type.body, { color: c.accent, fontWeight: '600' }]}>Détail</Text>
            <Ionicons name="chevron-forward" size={16} color={c.accent} />
          </Pressable>
        </View>
        <View style={[s.bloc, { flexDirection: 'row', paddingVertical: space.l, gap: space.m }]}>
          <Chiffre valeur={euros(mois.ca).replace(',00', '')} libelle="encaissé" fort />
          <Chiffre valeur={euros(mois.aVenir).replace(',00', '')} libelle="à venir" />
          <Chiffre valeur={String(mois.courses)} libelle="courses" />
        </View>
      </View>
    </ScrollView>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  entete: { backgroundColor: c.cuve, paddingHorizontal: space.l, paddingBottom: space.xl, overflow: 'hidden' },
  date: { color: c.surCuve2, fontSize: 15 },
  bonjour: { fontFamily: f.display, fontSize: 40, color: c.blanc, marginTop: 2 },
  resume: { color: c.surCuve2, fontSize: 16, marginTop: space.xs },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.m, paddingVertical: space.s },
  prochaine: { backgroundColor: c.action, borderRadius: radius.l, padding: space.l },
  prochaineHeure: { fontFamily: f.display, fontSize: 44, color: c.blanc, lineHeight: 48 },
  compte: { fontSize: 15, fontWeight: '600' },
});
