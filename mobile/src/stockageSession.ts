import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Stockage de la session Supabase dans le coffre chiffré du téléphone (Keychain iOS, Keystore
// Android) au lieu du stockage ordinaire de l'appli, lisible sur un téléphone compromis ou une
// sauvegarde. Le coffre limite la taille d'une valeur : la session est découpée en morceaux.
// Les sessions déjà enregistrées dans l'ancien stockage sont déplacées au premier accès : personne
// n'est déconnecté par la mise à jour.

// 500 caractères au plus par morceau : moins de 2 048 octets même si tous sont accentués ou des emojis.
const TAILLE = 500;
const nomSur = (cle: string) => cle.replace(/[^A-Za-z0-9._-]/g, '_'); // caractères acceptés par le coffre

async function lireMorceaux(cle: string): Promise<string | null> {
  const n = Number(await SecureStore.getItemAsync(`${nomSur(cle)}.n`));
  if (!n) return null;
  let valeur = '';
  for (let i = 0; i < n; i++) {
    const morceau = await SecureStore.getItemAsync(`${nomSur(cle)}.${i}`);
    if (morceau === null) return null; // session incomplète : on repart de zéro
    valeur += morceau;
  }
  return valeur;
}

async function effacerMorceaux(cle: string) {
  const n = Number(await SecureStore.getItemAsync(`${nomSur(cle)}.n`)) || 0;
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${nomSur(cle)}.${i}`);
  await SecureStore.deleteItemAsync(`${nomSur(cle)}.n`);
}

async function ecrireMorceaux(cle: string, valeur: string) {
  await effacerMorceaux(cle);
  const morceaux = valeur.match(new RegExp(`[\\s\\S]{1,${TAILLE}}`, 'g')) ?? [''];
  for (let i = 0; i < morceaux.length; i++) await SecureStore.setItemAsync(`${nomSur(cle)}.${i}`, morceaux[i]);
  await SecureStore.setItemAsync(`${nomSur(cle)}.n`, String(morceaux.length));
}

export const stockageSession = Platform.OS === 'web' ? AsyncStorage : {
  async getItem(cle: string) {
    const v = await lireMorceaux(cle);
    if (v !== null) return v;
    // Ancienne version de l'appli : session en clair dans AsyncStorage → déplacée dans le coffre.
    const ancienne = await AsyncStorage.getItem(cle);
    if (ancienne !== null) {
      await ecrireMorceaux(cle, ancienne);
      await AsyncStorage.removeItem(cle);
    }
    return ancienne;
  },
  setItem: (cle: string, valeur: string) => ecrireMorceaux(cle, valeur),
  async removeItem(cle: string) {
    await effacerMorceaux(cle);
    await AsyncStorage.removeItem(cle).catch(() => {});
  },
};
