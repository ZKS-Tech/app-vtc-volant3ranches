import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Annonce, periode, useAnnonces } from '../src/annonces';
import { Vide } from '../src/chauffeurUi';
import { isoJour } from '../src/data';
import { Couleurs, radius, space } from '../src/theme';
import { Bouton, Note, Titre } from '../src/ui';
import { useTheme } from '../src/useTheme';

// Annonces de Fabrice : en cours et à venir, puis passées.
export default function Annonces() {
  const { c, type, s } = useTheme(creerStyles);
  const { annonces, demo } = useAnnonces();
  const aujourdhui = isoJour(new Date());
  const actuelles = annonces.filter((a) => a.fin >= aujourdhui);
  const passees = annonces.filter((a) => a.fin < aujourdhui).reverse().slice(0, 10);

  const Ligne = ({ a, trait }: { a: Annonce; trait?: boolean }) => {
    const enCours = a.debut <= aujourdhui && a.fin >= aujourdhui;
    return (
      <Pressable onPress={() => router.push({ pathname: '/annonce-edition', params: { id: a.id } })} style={({ pressed }) => [s.ligne, trait && s.trait, pressed && { opacity: 0.6 }]} accessibilityRole="button">
        <Ionicons name={a.bloquer ? 'calendar-outline' : 'megaphone-outline'} size={22} color={a.bloquer ? c.alerte : c.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '600' }]}>{a.bloquer ? 'Absence' : 'Information'} {periode(a)}</Text>
          {a.message ? <Text style={type.small} numberOfLines={2}>{a.message}</Text> : null}
          {enCours ? <Text style={[type.label, { color: c.accent, marginTop: 2 }]}>En cours</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.pierre} />
      </Pressable>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }}>
      <Text style={type.small}>
        Vos clients voient l'annonce en haut de l'accueil. Pendant une absence, les jours sont fermés à la réservation dans l'appli
        (vous pouvez toujours saisir une course vous-même).
      </Text>
      {demo ? <View style={{ marginTop: space.m }}><Note ton="bain" icone="eye-outline">Démonstration : rien n'est enregistré.</Note></View> : null}
      <Bouton titre="Nouvelle annonce" icone="add" onPress={() => router.push('/annonce-edition')} style={{ marginTop: space.l }} />

      <Titre>En cours et à venir</Titre>
      {actuelles.length ? (
        <View style={s.bloc}>{actuelles.map((a, i) => <Ligne key={a.id} a={a} trait={i > 0} />)}</View>
      ) : (
        <Vide icone="calendar-clear-outline" titre="Aucune annonce" texte="Prévenez vos clients de vos vacances ou d'une nouveauté." />
      )}

      {passees.length ? (
        <>
          <Titre>Passées</Titre>
          <View style={[s.bloc, { opacity: 0.75 }]}>{passees.map((a, i) => <Ligne key={a.id} a={a} trait={i > 0} />)}</View>
        </>
      ) : null}
    </ScrollView>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: 60 },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait },
});
