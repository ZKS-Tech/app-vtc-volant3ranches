import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { retourLe, useAnnonces } from '../../src/annonces';
import { CarteAnnonce } from '../../src/BandeauAnnonce';
import { space } from '../../src/theme';
import { useTheme } from '../../src/useTheme';
import { Bouton, appelerFabrice } from '../../src/ui';

// Détail d'une annonce (ou de toutes, depuis le bandeau quand il y en a plusieurs).
export default function AnnonceClient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, type } = useTheme();
  const { visibles } = useAnnonces();
  const liste = id === 'toutes' ? visibles : visibles.filter((a) => a.id === id);
  const indispo = liste.find((a) => a.bloquer);
  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl, gap: space.m }}>
      <Stack.Screen options={{ title: liste.length === 1 ? (liste[0].bloquer ? 'Absence de Fabrice' : 'Information') : 'Annonces' }} />
      {liste.length ? liste.map((a) => <CarteAnnonce key={a.id} a={a} sansLien />) : (
        <Text style={type.body}>Cette annonce n'est plus d'actualité.</Text>
      )}
      {indispo ? (
        <Text style={[type.body, { marginTop: space.s }]}>
          L'application n'accepte pas de demande pour ces jours-là. Vous pouvez déjà réserver une course à partir du {retourLe(indispo)}.
          Pour une urgence, Fabrice reste joignable par téléphone.
        </Text>
      ) : null}
      <Bouton titre="Appeler Fabrice" variante="contour" icone="call-outline" onPress={appelerFabrice} style={{ marginTop: space.m }} />
    </ScrollView>
  );
}
