import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateCourte, euros, offre } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, f, radius, space } from '../src/theme';
import { TrajetRelief, couleursRelief } from '../src/TrajetRelief';
import { useTheme } from '../src/useTheme';
import { Bouton, Itineraire, Teinture, appelerFabrice } from '../src/ui';

export default function Envoyee() {
  const { c, type, s, estSombre } = useTheme(creerStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { courses, changerStatut, reinitialiser } = useStore();
  const insets = useSafeAreaInsets();
  const course = courses.find((x) => x.id === id);
  const confirmee = course?.statut === 'confirmee';
  const bain = useRef(new Animated.Value(confirmee ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(bain, { toValue: confirmee ? 1 : 0, duration: 900, useNativeDriver: false }).start();
  }, [confirmee]);

  if (!course) return null;
  const fond = bain.interpolate({ inputRange: [0, 1], outputRange: [c.bain1, c.action] });
  const texte = confirmee ? c.blanc : c.fort;
  const texte2 = confirmee ? c.surCuve2 : c.pierre;

  const terminer = (route: '/' | '/courses') => {
    reinitialiser();
    router.dismissAll();
    router.replace(route);
  };

  return (
    <Animated.View style={{ flex: 1, backgroundColor: fond }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }}>
        <Teinture statut={course.statut} surFonce={confirmee} />
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[s.titre, { color: texte }]}>
          {confirmee ? 'Course confirmée' : 'Demande envoyée'}
        </Text>
        <Text style={[type.body, { color: texte, fontSize: 18, lineHeight: 25 }]}>
          {confirmee
            ? `Fabrice sera là ${dateCourte(course.date)} à ${course.heure.replace(':', 'h')}. Vous avez reçu la confirmation par notification, SMS et email.`
            : 'Fabrice vous confirme votre course sous 30 minutes, par notification, SMS et email.'}
        </Text>

        <TrajetRelief
          departId={course.departId}
          arriveeId={course.arriveeId}
          couleurs={couleursRelief(c, estSombre)}
          hauteur={190}
          style={{ borderRadius: radius.l, marginTop: space.xl }}
        />
        <View style={[s.recap, { borderColor: confirmee ? 'rgba(255,255,255,0.22)' : c.bain2 }]}>
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
          <Bouton titre="Voir mes courses" variante={confirmee ? 'clair' : 'plein'} onPress={() => terminer('/courses')} />
          <Bouton titre="Appeler Fabrice" variante={confirmee ? 'clair' : 'contour'} icone="call-outline" onPress={appelerFabrice} />
          <Bouton titre="Retour à l'accueil" variante="texte" surFonce={confirmee} onPress={() => terminer('/')} />
        </View>

        {!confirmee ? (
          <View style={s.compte}>
            <Text style={type.h3}>Retrouver vos courses sur tous vos appareils</Text>
            <Text style={[type.small, { marginTop: 4, marginBottom: space.m }]}>
              Créez un compte avec votre email : vos coordonnées seront préremplies la prochaine fois.
            </Text>
            <Bouton titre="Créer un compte" variante="contour" onPress={() => router.push('/profil')} />
          </View>
        ) : null}

        <View style={s.demo}>
          <Text style={[type.label, { color: texte2, marginBottom: space.s }]}>Prototype</Text>
          <Bouton
            titre={confirmee ? 'Revenir à « demande envoyée »' : 'Simuler la confirmation de Fabrice'}
            variante="texte"
            surFonce={confirmee}
            onPress={() => changerStatut(course.id, confirmee ? 'envoyee' : 'confirmee')}
          />
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  titre: { fontFamily: f.display, fontSize: 46, lineHeight: 50, marginTop: space.xxl, marginBottom: space.m },
  recap: { borderWidth: 1, borderRadius: radius.l, padding: space.l, marginTop: space.xl },
  date: { fontFamily: f.display, fontSize: 24 },
  compte: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.l, marginTop: space.xl },
  demo: { marginTop: space.xxl, alignItems: 'flex-start' },
});
