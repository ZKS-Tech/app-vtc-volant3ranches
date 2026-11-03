import { ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold, useFonts } from '@expo-google-fonts/archivo-narrow';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '../src/store';
import { useTheme } from '../src/useTheme';

export default function Racine() {
  const [pret] = useFonts({ ArchivoNarrow_600SemiBold, ArchivoNarrow_700Bold });
  if (!pret) return null;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Navigation />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const { c, estSombre } = useTheme();
  return (
    <>
      <StatusBar style={estSombre ? 'light' : 'dark'} />
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Accueil' }} />
        <Stack.Screen name="adresse" options={{ presentation: 'modal', title: 'Adresse' }} />
        <Stack.Screen name="trajet" options={{ title: 'Votre trajet' }} />
        <Stack.Screen name="offre" options={{ title: 'Choisir un véhicule' }} />
        <Stack.Screen name="coordonnees" options={{ title: 'Vos coordonnées' }} />
        <Stack.Screen name="envoyee" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="course/[id]" options={{ title: 'Votre course' }} />
        <Stack.Screen name="panneau" options={{ presentation: 'fullScreenModal', headerShown: false }} />
      </Stack>
    </>
  );
}
