import { ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold, useFonts } from '@expo-google-fonts/archivo-narrow';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnnoncesProvider } from '../src/annonces';
import { ChauffeurProvider } from '../src/chauffeur';
import { MessagerieProvider } from '../src/messagerie';
import { useNotifications } from '../src/notifications';
import { StoreProvider, useStore } from '../src/store';
import { useTheme } from '../src/useTheme';

// Version navigateur uniquement : react-native-svg transmet « collapsable » au DOM, sans conséquence.
LogBox.ignoreLogs(['Received `false` for a non-boolean attribute `collapsable`']);

export default function Racine() {
  // Ionicons préchargée ici : sinon chaque icône lance son propre chargement et un délai réseau
  // (WSL, Expo Go en Wi-Fi) remonte en « Uncaught Error ». En cas d'échec, on affiche quand même l'app.
  const [pret, erreur] = useFonts({ ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold, ...Ionicons.font });
  if (erreur) console.warn('Polices non chargées :', erreur.message);
  if (!pret && !erreur) return null;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Navigation />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

// Deux interfaces dans la même appli : celle des clients et l'espace de Fabrice.
// Stack.Protected n'ouvre que celle qui correspond au compte connecté.
function Navigation() {
  const { c, estSombre } = useTheme();
  const { role, demoChauffeur, serveur } = useStore();
  const chauffeur = role === 'chauffeur' || demoChauffeur;
  useNotifications(serveur.etat === 'connecte' ? role : null);
  // À chaque bascule client ↔ chauffeur, on ouvre l'accueil de l'interface qui vient d'être autorisée.
  const precedent = useRef(chauffeur);
  useEffect(() => {
    if (precedent.current === chauffeur) return;
    precedent.current = chauffeur;
    const t = setTimeout(() => router.replace(chauffeur ? '/chauffeur' : '/'), 0);
    return () => clearTimeout(t);
  }, [chauffeur]);
  const pile = (
    <Stack
      screenOptions={{
        headerTintColor: c.accent,
        headerStyle: { backgroundColor: c.sol },
        headerShadowVisible: false,
        headerTitleStyle: { color: c.encre, fontWeight: '700' },
        headerBackTitle: 'Retour',
        contentStyle: { backgroundColor: c.sol },
      }}
    >
      <Stack.Protected guard={!chauffeur}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Accueil' }} />
        <Stack.Screen name="adresse" options={{ presentation: 'modal', title: 'Adresse' }} />
        <Stack.Screen name="trajet" options={{ title: 'Votre trajet' }} />
        <Stack.Screen name="offre" options={{ title: 'Choisir un véhicule' }} />
        <Stack.Screen name="coordonnees" options={{ title: 'Vos coordonnées' }} />
        <Stack.Screen name="envoyee" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="course/[id]" options={{ title: 'Votre course' }} />
        <Stack.Screen name="panneau" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="connexion-chauffeur" options={{ presentation: 'modal', title: 'Espace chauffeur' }} />
        <Stack.Screen name="annonce/[id]" options={{ title: 'Annonce' }} />
        <Stack.Screen name="paiement-test" options={{ presentation: 'modal', title: 'Paiement (test)' }} />
      </Stack.Protected>
      <Stack.Protected guard={chauffeur}>
        <Stack.Screen name="chauffeur" options={{ headerShown: false, title: 'Tableau de bord' }} />
        <Stack.Screen name="mission/[id]" options={{ title: 'Course' }} />
        <Stack.Screen name="fiche/[id]" options={{ title: 'Client' }} />
        <Stack.Screen name="saisie" options={{ title: 'Nouvelle course' }} />
        <Stack.Screen name="choix-lieu" options={{ presentation: 'modal', title: 'Lieu' }} />
        <Stack.Screen name="tarifs" options={{ title: 'Tarifs et jours fériés' }} />
        <Stack.Screen name="chiffre-affaires" options={{ title: "Chiffre d'affaires" }} />
        <Stack.Screen name="gestion" options={{ title: 'Gestion' }} />
        <Stack.Screen name="annonces" options={{ title: 'Annonces' }} />
        <Stack.Screen name="documents" options={{ title: 'Factures et bons' }} />
        <Stack.Screen name="annonce-edition" options={{ title: 'Annonce' }} />
      </Stack.Protected>
      <Stack.Screen name="conversation/[id]" options={{ title: 'Messages' }} />
    </Stack>
  );
  return (
    <>
      <StatusBar style={estSombre ? 'light' : 'dark'} />
      <AnnoncesProvider key={demoChauffeur ? 'demo' : chauffeur ? 'chauffeur' : 'client'} demo={demoChauffeur}>
        <MessagerieProvider key={chauffeur ? 'chauffeur' : 'client'}>
          {chauffeur ? <ChauffeurProvider key={demoChauffeur ? 'demo' : 'serveur'}>{pile}</ChauffeurProvider> : pile}
        </MessagerieProvider>
      </AnnoncesProvider>
    </>
  );
}
