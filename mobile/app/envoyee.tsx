import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Reanimated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { CuveIndigo } from '../src/CuveIndigo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateCourte, euros, itineraireEnCache, lieu, offre } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, f, radius, space } from '../src/theme';
import { CartePlan } from '../src/CartePlan';
import { DelaiConfirmation } from '../src/DelaiConfirmation';
import { BlocAcompte } from '../src/Acompte';
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
  const acompte = course?.statut === 'acompte_attendu';
  const expiree = course?.statut === 'expiree';
  const ferme = refusee || expiree;
  // Le texte change de couleur quand l'encre a recouvert la moitié de l'écran (signal de la cuve).
  // Filet de sécurité si le rendu 3D n'est pas disponible : bascule après 1,6 s.
  const [fonce, setFonce] = useState(confirmee);
  useEffect(() => {
    const t = setTimeout(() => setFonce(confirmee), 1600);
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
      <CuveIndigo niveau={confirmee ? 1 : 0} couleurs={{ eau: c.bain1, voile: c.bain3, indigo: c.action, cuve: c.cuve }} onMiHauteur={setFonce} />
      <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }}>
        {ferme ? (
          <View style={[s.pastille, { backgroundColor: c.erreurFond }]}>
            <Text style={[type.label, { color: c.erreur }]}>{refusee ? 'Refusée par Fabrice' : 'Acompte non réglé'}</Text>
          </View>
        ) : (
          <Teinture statut={course.statut} surFonce={fonce} />
        )}
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[s.titre, { color: texte }]}>
          {refusee ? 'Demande refusée' : expiree ? 'Demande expirée' : fonce ? 'Course confirmée' : acompte ? 'Fabrice peut vous conduire' : 'Demande envoyée'}
        </Text>
        <Text style={[type.body, { color: texte, fontSize: 18, lineHeight: 25 }]}>
          {refusee
            ? `Fabrice ne peut pas assurer cette course du ${dateCourte(course.date)} à ${course.heure.replace(':', 'h')}. Rien ne vous sera facturé.`
            : expiree
            ? "L'acompte n'a pas été réglé à temps : la course n'est pas réservée et rien ne vous a été facturé."
            : fonce
            ? `Fabrice sera là ${dateCourte(course.date)} à ${course.heure.replace(':', 'h')}. Vous recevrez un rappel la veille.`
            : acompte
            ? 'Il a accepté votre demande. Réglez l’acompte pour confirmer la réservation.'
            : 'Fabrice vous répond sous 30 minutes. Vous serez prévenu par notification.'}
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

        {course.statut === 'envoyee' ? (
          <Reanimated.View exiting={FadeOut.duration(250)} style={{ marginTop: space.xl }}>
            <DelaiConfirmation course={course} />
          </Reanimated.View>
        ) : null}
        {acompte ? (
          <Reanimated.View exiting={FadeOut.duration(250)} style={{ marginTop: space.xl }}>
            <BlocAcompte course={course} />
          </Reanimated.View>
        ) : null}
        {/* le reste glisse à sa place quand l'anneau disparaît */}
        <Reanimated.View layout={LinearTransition.duration(450)}>
        <CartePlan
          departId={course.departId}
          arriveeId={course.arriveeId}
          itineraireReel={itineraireEnCache(lieu(course.departId), lieu(course.arriveeId))?.coords}
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
          {ferme ? (
            <Bouton titre={refusee ? 'Choisir un autre horaire' : 'Refaire une demande'} icone="time-outline" onPress={() => router.dismissTo('/trajet')} />
          ) : (
            <Bouton titre="Voir mes courses" variante={fonce ? 'clair' : 'plein'} onPress={() => terminer('/courses')} />
          )}
          <Bouton titre="Appeler Fabrice" variante={fonce ? 'clair' : 'contour'} icone="call-outline" onPress={appelerFabrice} />
          <Bouton titre="Retour à l'accueil" variante="texte" surFonce={fonce} onPress={() => terminer('/')} />
        </View>
        </Reanimated.View>

        {!fonce && !ferme ? (
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
          {course.statut === 'envoyee' ? (
            <>
              <Bouton titre="Simuler l'acceptation de Fabrice (acompte)" variante="texte"
                onPress={() => changerStatut(course.id, 'acompte_attendu', undefined, { acompteMontant: Math.max(1, Math.round(course.montant * 10) / 100), acompteLimite: new Date(Date.now() + 3600000) })} />
              <Bouton titre="Simuler un refus de Fabrice" variante="texte" onPress={() => changerStatut(course.id, 'refusee', 'Indisponible à cet horaire')} />
            </>
          ) : (
            <Bouton titre="Revenir à « demande envoyée »" variante="texte" surFonce={fonce} onPress={() => changerStatut(course.id, 'envoyee', undefined, { acomptePaye: false })} />
          )}
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
