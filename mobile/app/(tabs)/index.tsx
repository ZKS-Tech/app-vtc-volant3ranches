import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lieu, fabrice, lieu, lieux, photos } from '../../src/data';
import { useStore } from '../../src/store';
import { Couleurs, f, radius, space } from '../../src/theme';
import { BandeauAnnonce } from '../../src/BandeauAnnonce';
import { DemandeConsentement } from '../../src/Consentement';
import { CuveIndigo } from '../../src/CuveIndigo';
import { useTheme } from '../../src/useTheme';
import { Bouton, CarteCourse, Titre, appelerFabrice } from '../../src/ui';
import { evenement } from '../../src/stats';

const raccourcis = lieux.filter((l) => l.type !== 'ville');

export default function Accueil() {
  const { c, type, s } = useTheme(creerStyles);
  const { brouillon, maj, courses } = useStore();
  const insets = useSafeAreaInsets();
  const depart = brouillon.departId ? lieu(brouillon.departId) : undefined;
  const arrivee = brouillon.arriveeId ? lieu(brouillon.arriveeId) : undefined;
  const prochaine = courses
    .filter((x) => (x.statut === 'confirmee' || x.statut === 'envoyee') && x.date > new Date())
    .sort((a, b) => +a.date - +b.date)[0];

  const choisirRaccourci = (l: Lieu) => {
    evenement('raccourci_aeroport_gare', { raccourci: l.id, type_lieu: l.type });
    if (!brouillon.departId || brouillon.arriveeId) maj({ departId: l.id, arriveeId: brouillon.arriveeId === l.id ? undefined : brouillon.arriveeId });
    else maj({ arriveeId: l.id });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.sol }} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <View style={[s.cuve, { paddingTop: insets.top + space.m }]}>
        <CuveIndigo niveau={1} couleurs={{ eau: c.cuve, voile: c.bain4, indigo: c.indigo, cuve: c.cuve }} />
        <View style={s.marque}>
          <Image source={photos.logoBlanc} style={{ width: 34, height: 34 }} contentFit="contain" accessibilityLabel="Logo Volant3ranches" />
          <Text style={s.marqueTexte}>Volant3ranches</Text>
          <Pressable onPress={appelerFabrice} accessibilityLabel="Appeler Fabrice" style={s.appel}>
            <Ionicons name="call" size={20} color={c.blanc} />
          </Pressable>
        </View>
        <Text style={s.question}>Où allez-vous ?</Text>
        <Text style={s.sousTitre}>Votre chauffeur privé dans le Tarn, 24h/24.</Text>
      </View>

      <View style={s.fiche}>
        <ChampLieu libelle="Départ" lieu={depart} marque="rond" onPress={() => router.push({ pathname: '/adresse', params: { champ: 'depart' } })} />
        <View style={s.separateur} />
        <ChampLieu libelle="Arrivée" lieu={arrivee} marque="carre" onPress={() => router.push({ pathname: '/adresse', params: { champ: 'arrivee' } })} />
        <Pressable
          accessibilityLabel="Inverser départ et arrivée"
          onPress={() => maj({ departId: brouillon.arriveeId, arriveeId: brouillon.departId })}
          style={s.inverser}
        >
          <Ionicons name="swap-vertical" size={20} color={c.accent} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: space.l }}>
        <View style={{ marginTop: space.l }}>
          <BandeauAnnonce />
        </View>
        <View style={{ marginTop: space.l }}>
          <DemandeConsentement />
        </View>
        {depart && arrivee ? (
          <Bouton titre="Choisir la date et l'heure" icone="arrow-forward" onPress={() => router.push('/trajet')} style={{ marginTop: space.l }} />
        ) : null}

        <Titre>Aéroport et gares</Titre>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s }}>
        {raccourcis.map((l) => {
          const actif = l.id === brouillon.departId || l.id === brouillon.arriveeId;
          return (
            <Pressable key={l.id} onPress={() => choisirRaccourci(l)} style={[s.puce, actif && s.puceActive]} accessibilityState={{ selected: actif }}>
              <Ionicons name={l.type === 'aeroport' ? 'airplane' : 'train'} size={18} color={actif ? c.blanc : c.accent} />
              <Text style={[s.puceTexte, actif && { color: c.blanc }]}>{l.nom}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={[type.small, { paddingHorizontal: space.l, marginTop: space.s }]}>
        Vol ou train suivi en temps réel, accueil avec panneau à votre nom.
      </Text>

      <View style={{ paddingHorizontal: space.l }}>
        {prochaine ? (
          <>
            <Titre>Votre prochaine course</Titre>
            <CarteCourse course={prochaine} onPress={() => router.push(`/course/${prochaine.id}`)} />
          </>
        ) : null}

        <Titre>Votre chauffeur</Titre>
        <View style={s.fabrice}>
          <Image source={photos.fabrice} style={s.fabricePhoto} contentFit="cover" contentPosition="top" accessibilityLabel="Photo de Fabrice" />
          <View style={{ flex: 1 }}>
            <Text style={type.h3}>{fabrice.prenom}</Text>
            <Text style={type.small}>Chauffeur VTC certifié, basé à Viterbe. Toulouse, Albi, Castres et toute la France.</Text>
          </View>
        </View>
        <Bouton titre="Appeler Fabrice" variante="contour" icone="call-outline" onPress={appelerFabrice} style={{ marginTop: space.m }} />
      </View>

      <Pressable onPress={() => router.push('/decouvrir')} style={s.flotte} accessibilityRole="link">
        <Image source={photos.flotte} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="La Tesla et le Van dans les collines du Lauragais" />
        <View style={s.flotteVoile} />
        <Text style={s.flotteTitre}>Tesla Model 3 et Van 9 places</Text>
        <Text style={[type.small, { color: c.surCuve2 }]}>Découvrir les véhicules et les prestations</Text>
      </Pressable>
    </ScrollView>
  );
}

function ChampLieu({ libelle, lieu: l, onPress, marque }: { libelle: string; lieu?: Lieu; onPress: () => void; marque: 'rond' | 'carre' }) {
  const { c, type, s } = useTheme(creerStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.champLieu, pressed && { backgroundColor: c.bain1 }]} accessibilityRole="button" accessibilityLabel={`${libelle} : ${l ? l.nom : 'à choisir'}`}>
      <View style={marque === 'rond' ? s.marqueRond : s.marqueCarre} />
      <View style={{ flex: 1 }}>
        <Text style={type.label}>{libelle}</Text>
        <Text style={[type.body, { fontWeight: '600', color: l ? c.encre : c.pierre }]} numberOfLines={1}>
          {l ? l.nom : libelle === 'Départ' ? 'Adresse de prise en charge' : 'Destination'}
        </Text>
      </View>
    </Pressable>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  cuve: { backgroundColor: c.cuve, paddingHorizontal: space.l, paddingBottom: 64 },
  marque: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  marqueTexte: { color: c.blanc, fontSize: 17, fontWeight: '700', flex: 1, letterSpacing: 0.2 },
  appel: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  question: { fontFamily: f.display, fontSize: 44, color: c.blanc, marginTop: space.xxl, lineHeight: 48 },
  sousTitre: { color: c.surCuve2, fontSize: 16, marginTop: space.xs },
  fiche: {
    marginHorizontal: space.l, marginTop: -44, backgroundColor: c.surface, borderRadius: radius.l, paddingVertical: space.xs,
    shadowColor: c.cuve, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  champLieu: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, paddingRight: 64, minHeight: 64 },
  separateur: { height: StyleSheet.hairlineWidth, backgroundColor: c.trait, marginLeft: 44 },
  marqueRond: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: c.accent },
  marqueCarre: { width: 10, height: 10, backgroundColor: c.accent },
  inverser: {
    position: 'absolute', right: space.l, top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22,
    backgroundColor: c.bain1, alignItems: 'center', justifyContent: 'center',
  },
  puce: {
    flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 44, paddingHorizontal: space.l,
    borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.bain2,
  },
  puceActive: { backgroundColor: c.action, borderColor: c.action },
  puceTexte: { fontSize: 15, fontWeight: '600', color: c.fort },
  fabrice: { flexDirection: 'row', gap: space.l, alignItems: 'center' },
  fabricePhoto: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.bain2 },
  flotte: {
    marginTop: space.xxl, marginHorizontal: space.l, height: 200, borderRadius: radius.l, overflow: 'hidden',
    justifyContent: 'flex-end', padding: space.l,
  },
  flotteVoile: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,69,0.45)' },
  flotteTitre: { fontFamily: f.display, fontSize: 26, color: c.blanc },
});
