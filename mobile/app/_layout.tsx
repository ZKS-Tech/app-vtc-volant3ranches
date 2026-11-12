import { ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold, useFonts } from '@expo-google-fonts/archivo-narrow';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnnoncesProvider } from '../src/annonces';
import { ChauffeurProvider } from '../src/chauffeur';
import { MessagerieProvider } from '../src/messagerie';
import { useNotifications } from '../src/notifications';
import { chargerLangue, forcerFrancais, t, useLangue } from '../src/i18n';
import { activerSuivi } from '../src/stats';
import { StoreProvider, useStore } from '../src/store';
import { useTheme } from '../src/useTheme';

// Version navigateur uniquement : react-native-svg transmet « collapsable » au DOM, sans conséquence.
LogBox.ignoreLogs(['Received `false` for a non-boolean attribute `collapsable`']);

export default function Racine() {
  // Ionicons préchargée ici : sinon chaque icône lance son propre chargement et un délai réseau
  // (WSL, Expo Go en Wi-Fi) remonte en « Uncaught Error ». En cas d'échec, on affiche quand même l'app.
  const [pret, erreur] = useFonts({ ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold, ...Ionicons.font });
  const [langueChargee, setLangueChargee] = useState(false);
  useEffect(() => { chargerLangue().finally(() => setLangueChargee(true)); }, []);
  if (erreur) console.warn('Polices non chargées :', erreur.message);
  if ((!pret && !erreur) || !langueChargee) return null;
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
  const { role, demoChauffeur, serveur, cleSession } = useStore();
  const chauffeur = role === 'chauffeur' || demoChauffeur;
  // L'espace de Fabrice est toujours en français ; l'interface client suit la langue choisie.
  forcerFrancais(chauffeur);
  useLangue();
  useNotifications(serveur.etat === 'connecte' ? `${role}:${cleSession}` : null);
  // Statistiques : seulement l'interface client reliée au serveur (jamais Fabrice ni la démo).
  useEffect(() => { activerSuivi(serveur.etat === 'connecte' && !chauffeur); }, [serveur.etat, chauffeur]);
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
        headerBackTitle: t('Retour'),
        contentStyle: { backgroundColor: c.sol },
      }}
    >
      <Stack.Protected guard={!chauffeur}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('Accueil') }} />
        <Stack.Screen name="adresse" options={{ presentation: 'modal', title: t('Adresse') }} />
        <Stack.Screen name="trajet" options={{ title: t('Votre trajet') }} />
        <Stack.Screen name="offre" options={{ title: t('Choisir un véhicule') }} />
        <Stack.Screen name="coordonnees" options={{ title: t('Vos coordonnées') }} />
        <Stack.Screen name="envoyee" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="course/[id]" options={{ title: t('Votre course') }} />
        <Stack.Screen name="panneau" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="compte" options={{ presentation: 'modal', title: t('Mon compte') }} />
        <Stack.Screen name="annonce/[id]" options={{ title: t('Annonce') }} />
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
        <Stack.Screen name="emails" options={{ title: 'Emails' }} />
        <Stack.Screen name="annonce-edition" options={{ title: 'Annonce' }} />
      </Stack.Protected>
      <Stack.Screen name="conversation/[id]" options={{ title: t('Messages') }} />
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
