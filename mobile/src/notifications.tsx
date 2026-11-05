import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { supabase } from './serveur';

// Notifications push : service gratuit d'Expo. La base (migration 6) les envoie elle-même à chaque
// événement ; l'appli se contente d'enregistrer le téléphone et d'ouvrir le bon écran au toucher.
//
// Limites : rien dans le navigateur ni sur simulateur, et Expo Go sur Android ne reçoit plus de
// notifications push (depuis le SDK 53) : il faut la version de développement (voir README).

const projectId: string | undefined =
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

const expoGoAndroid = Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const pushPossible = Platform.OS !== 'web' && Device.isDevice && !expoGoAndroid && !!projectId && !!supabase;

export type EtatNotifications = 'actives' | 'refusees' | 'a-demander' | 'indisponibles';

if (Platform.OS !== 'web') {
  // Une notification reçue appli ouverte s'affiche quand même en bannière.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

let jetonEnregistre: string | null = null;

async function enregistrer(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('courses', {
      name: 'Courses et messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#1E3277',
    });
  }
  const { data: jeton } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase!.rpc('enregistrer_appareil', { p_token: jeton, p_plateforme: Platform.OS });
  if (error) throw new Error(error.message);
  jetonEnregistre = jeton;
}

export async function etatNotifications(): Promise<EtatNotifications> {
  if (!pushPossible) return 'indisponibles';
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'actives';
  return canAskAgain ? 'a-demander' : 'refusees';
}

// Demande l'autorisation (une seule fois, au bon moment), puis enregistre le téléphone pour le
// compte connecté. Sans risque si on l'appelle plusieurs fois.
export async function activerNotifications(): Promise<EtatNotifications> {
  if (!pushPossible) return 'indisponibles';
  try {
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && canAskAgain) ({ status, canAskAgain } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return canAskAgain ? 'a-demander' : 'refusees';
    await enregistrer();
    return 'actives';
  } catch (e) {
    console.warn('Notifications non activées :', e instanceof Error ? e.message : e);
    return 'indisponibles';
  }
}

// À la déconnexion : ce téléphone ne doit plus recevoir les notifications du compte qui part.
export async function oublierTelephone(): Promise<void> {
  if (!jetonEnregistre || !supabase) return;
  await supabase.rpc('oublier_appareil', { p_token: jetonEnregistre });
  jetonEnregistre = null;
}

// Monté une fois dans la navigation : réenregistre le téléphone pour le compte actuel (si déjà
// autorisé : on ne demande rien ici) et ouvre l'écran visé quand on touche une notification.
export function useNotifications(compte: string | null) {
  useEffect(() => {
    if (!pushPossible || !compte) return;
    Notifications.getPermissionsAsync()
      .then(({ status }) => (status === 'granted' ? enregistrer() : undefined))
      .catch((e) => console.warn('Notifications :', e instanceof Error ? e.message : e));
  }, [compte]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const ouvrir = (r: Notifications.NotificationResponse | null) => {
      const url = r?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) setTimeout(() => router.push(url as never), 50);
    };
    // Appli lancée en touchant une notification.
    Notifications.getLastNotificationResponseAsync().then(ouvrir).catch(() => {});
    const abo = Notifications.addNotificationResponseReceivedListener(ouvrir);
    return () => abo.remove();
  }, []);
}

// Ligne « Notifications » des réglages (Profil côté client, Gestion côté Fabrice) : montre l'état
// réel de l'autorisation et propose la bonne action.
export function useEtatNotifications() {
  const [etat, setEtat] = useState<EtatNotifications | null>(null);
  useEffect(() => {
    let actif = true;
    const lire = () => etatNotifications().then((e) => actif && setEtat(e)).catch(() => actif && setEtat('indisponibles'));
    lire();
    // Au retour des réglages du téléphone, l'autorisation a pu changer.
    const abo = AppState.addEventListener('change', (s) => s === 'active' && lire());
    return () => { actif = false; abo.remove(); };
  }, []);
  const agir = async () => {
    if (etat === 'refusees' || etat === 'actives') return Linking.openSettings();
    setEtat(await activerNotifications());
  };
  return { etat, agir };
}

export const libelleNotifications: Record<EtatNotifications, string> = {
  actives: 'Activées sur ce téléphone',
  'a-demander': 'Pas encore activées',
  refusees: 'Refusées : à réactiver dans les réglages du téléphone',
  indisponibles: Platform.OS === 'web'
    ? 'Uniquement dans l\'application mobile'
    : 'Pas disponibles dans cette version de test (Expo Go)',
};
