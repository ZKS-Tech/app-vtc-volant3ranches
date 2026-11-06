import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Annonce, retourLe, titreAnnonce, useAnnonces } from './annonces';
import { Couleurs, radius, space } from './theme';
import { useTheme } from './useTheme';

// Bandeau de l'accueil client : l'annonce la plus proche, touchable pour lire le détail.
export function BandeauAnnonce() {
  const { visibles } = useAnnonces();
  if (!visibles.length) return null;
  return <CarteAnnonce a={visibles[0]} autres={visibles.length - 1} />;
}

export function CarteAnnonce({ a, autres = 0, sansLien }: { a: Annonce; autres?: number; sansLien?: boolean }) {
  const { c, type, s } = useTheme(creerStyles);
  const fond = a.bloquer ? c.alerteFond : c.bain1;
  const encre = a.bloquer ? c.alerte : c.accent;
  const contenu = (
    <>
      <Ionicons name={a.bloquer ? 'calendar-outline' : 'megaphone-outline'} size={24} color={encre} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontWeight: '700', color: encre }]}>{titreAnnonce(a)}</Text>
        {a.message ? <Text style={[type.small, { color: c.encre, marginTop: 2 }]} numberOfLines={sansLien ? undefined : 2}>{a.message}</Text> : null}
        {a.bloquer ? <Text style={[type.small, { color: c.encre, marginTop: 2 }]}>Réservations possibles à partir du {retourLe(a)}.</Text> : null}
        {autres > 0 ? <Text style={[type.label, { color: encre, marginTop: space.xs }]}>+ {autres} autre{autres > 1 ? 's' : ''} annonce{autres > 1 ? 's' : ''}</Text> : null}
      </View>
      {sansLien ? null : <Ionicons name="chevron-forward" size={18} color={encre} style={{ alignSelf: 'center' }} />}
    </>
  );
  if (sansLien) return <View style={[s.carte, { backgroundColor: fond }]}>{contenu}</View>;
  return (
    <Pressable onPress={() => router.push(autres ? '/annonce/toutes' : `/annonce/${a.id}`)} style={({ pressed }) => [s.carte, { backgroundColor: fond }, pressed && { opacity: 0.75 }]}
      accessibilityRole="button" accessibilityLabel={`${titreAnnonce(a)}. ${a.message ?? ''}`}>
      {contenu}
    </Pressable>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  carte: { flexDirection: 'row', gap: space.m, padding: space.l, borderRadius: radius.l },
});
