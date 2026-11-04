import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CuveIndigo } from '../src/CuveIndigo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateCourte, euros, offre } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, f, radius, space } from '../src/theme';
import { CartePlan } from '../src/CartePlan';
import { DelaiConfirmation } from '../src/DelaiConfirmation';
import { useTheme } from '../src/useTheme';
import { Bouton, Itineraire, Teinture, appelerFabrice } from '../src/ui';

export default function Envoyee() {
  const { c, type, s } = useTheme(creerStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { courses, changerStatut, reinitialiser, serveur } = useStore();
  const insets = useSafeAreaInsets();
  const course = courses.find((x) => x.id === id);
  const confirmee = course?.statut === 'confirmee';
  const refusee = course?.statut === 'refusee';
  // Le texte change de couleur quand l'encre a recouvert la moitié de l'écran.
  const [fonce, setFonce] = useState(confirmee);
  useEffect(() => {
    const t = setTimeout(() => setFonce(confirmee), 450);
    return () => clearTimeout(t);
  }, [confirmee]);

  if (!course) return null;
  const texte = fonce ? c.blanc : c.fort;
  const texte2 = fonce ? c.surCuve2 : c.pierre;

  const terminer = (route: '/' | '/courses') => {
    reinitialiser();
    router.dismissAll();
    router.replace(route);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bain1 }}>
      <CuveIndigo niveau={confirmee ? 1 : 0} couleurs={{ eau: c.bain1, voile: c.bain3, indigo: c.action, cuve: c.cuve }} />
      <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }}>
        {refusee ? (
          <View style={[s.pastille, { backgroundColor: c.erreurFond }]}>
            <Text style={[type.label, { color: c.erreur }]}>Refusée par Fabrice</Text>
          </View>
        ) : (
          <Teinture statut={course.statut} surFonce={fonce} />
        )}
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[s.titre, { color: texte }]}>
          {refusee ? 'Demande refusée' : fonce ? 'Course confirmée' : 'Demande envoyée'}
        </Text>
        <Text style={[type.body, { color: texte, fontSize: 18, lineHeight: 25 }]}>
          {refusee
            ? `Fabrice ne peut pas assurer cette course du ${dateCourte(course.date)} à ${course.heure.replace(':', 'h')}. Rien ne vous sera facturé.`
            : fonce
            ? `Fabrice sera là ${dateCourte(course.date)} à ${course.heure.replace(':', 'h')}. Vous avez reçu la confirmation par notification, SMS et email.`
            : 'Fabrice vous confirme votre course sous 30 minutes, par notification, SMS et email.'}
        </Text>
        {refusee ? (
          <View style={[s.motif, { backgroundColor: c.surface }]}>
            <Text style={type.label}>Motif indiqué par Fabrice</Text>
            <Text style={[type.body, { fontSize: 18, marginTop: 4 }]}>{course.motifRefus || 'Non précisé'}</Text>
            <Text style={[type.small, { marginTop: space.s }]}>
              Essayez un autre horaire, ou appelez-le : il pourra peut-être vous proposer une solution.
            </Text>
          </View>
        ) : null}

        {!confirmee && !refusee ? (
          <View style={{ marginTop: space.xl }}>
            <DelaiConfirmation course={course} />
          </View>
        ) : null}
        <CartePlan
          departId={course.departId}
          arriveeId={course.arriveeId}
          c={c}
          hauteur={190}
          style={{ borderRadius: radius.l, marginTop: space.xl }}
        />
        <View style={[s.recap, { borderColor: fonce ? 'rgba(255,255,255,0.22)' : c.bain2 }]}>
          <Text style={[s.date, { color: texte }]}>
            {dateCourte(course.date)} · {course.heure.replace(':', 'h')}
          </Text>
          <View style={{ marginVertical: space.l }}>
            <Itineraire departId={course.departId} arriveeId={course.arriveeId} couleur={texte} couleur2={texte2} />
          </View>
          <Text style={[type.small, { color: texte2 }]}>
            {offre(course.offreId).nom} · {offre(course.offreId).vehicule} · {euros(course.montant)}
          </Text>
        </View>

        <View style={{ gap: space.m, marginTop: space.xl }}>
          {refusee ? (
            <Bouton titre="Choisir un autre horaire" icone="time-outline" onPress={() => router.dismissTo('/trajet')} />
          ) : (
            <Bouton titre="Voir mes courses" variante={fonce ? 'clair' : 'plein'} onPress={() => terminer('/courses')} />
          )}
          <Bouton titre="Appeler Fabrice" variante={fonce ? 'clair' : 'contour'} icone="call-outline" onPress={appelerFabrice} />
          <Bouton titre="Retour à l'accueil" variante="texte" surFonce={fonce} onPress={() => terminer('/')} />
        </View>

        {!fonce && !refusee ? (
          <View style={s.compte}>
            <Text style={type.h3}>Retrouver vos courses sur tous vos appareils</Text>
            <Text style={[type.small, { marginTop: 4, marginBottom: space.m }]}>
              Créez un compte avec votre email : vos coordonnées seront préremplies la prochaine fois.
            </Text>
            <Bouton titre="Créer un compte" variante="contour" onPress={() => router.push('/profil')} />
          </View>
        ) : null}

        {serveur.etat !== 'connecte' ? (
        <View style={s.demo}>
          <Text style={[type.label, { color: texte2, marginBottom: space.s }]}>Prototype</Text>
          <Bouton
            titre={fonce || refusee ? 'Revenir à « demande envoyée »' : 'Simuler la confirmation de Fabrice'}
            variante="texte"
            surFonce={fonce}
            onPress={() => changerStatut(course.id, confirmee || refusee ? 'envoyee' : 'confirmee')}
          />
          {!confirmee && !refusee ? (
            <Bouton titre="Simuler un refus de Fabrice" variante="texte" onPress={() => changerStatut(course.id, 'refusee', 'Indisponible à cet horaire')} />
          ) : null}
        </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  pastille: { alignSelf: 'flex-start', paddingHorizontal: space.m, paddingVertical: 6, borderRadius: 14 },
  motif: { borderRadius: radius.l, padding: space.l, marginTop: space.xl },
  titre: { fontFamily: f.display, fontSize: 46, lineHeight: 50, marginTop: space.xxl, marginBottom: space.m },
  recap: { borderWidth: 1, borderRadius: radius.l, padding: space.l, marginTop: space.xl },
  date: { fontFamily: f.display, fontSize: 24 },
  compte: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.l, marginTop: space.xl },
  demo: { marginTop: space.xxl, alignItems: 'flex-start' },
});
