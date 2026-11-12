import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './serveur';

// Statistiques (Google Analytics 4), uniquement si le client l'accepte.
// Les événements passent par la fonction serveur « stats » : la clé GA4 reste dans Supabase et
// Google ne reçoit ni l'adresse IP du téléphone, ni nom, téléphone, email ou adresse — seulement un
// identifiant tiré au hasard sur ce téléphone et quelques paramètres (offre, km, prix…).
// Jamais pour Fabrice (espace chauffeur) ni en démonstration.

export type Consentement = 'oui' | 'non' | null; // null : pas encore demandé
const CLE_CONSENTEMENT = 'stats.consentement';
const CLE_CLIENT = 'stats.client_id';

let consentement: Consentement = null;
let charge = false;
let actif = false; // interface client connectée au serveur (pas Fabrice, pas la démo)
let clientId: string | null = null;
let session = Math.floor(Date.now() / 1000);
let dernier = Date.now();
let file: { nom: string; params?: Record<string, unknown> }[] = [];
let minuteur: ReturnType<typeof setTimeout> | null = null;
const abonnes = new Set<(c: Consentement) => void>();

async function lire(cle: string) { try { return await AsyncStorage.getItem(cle); } catch { return null; } }
async function ecrire(cle: string, v: string) { try { await AsyncStorage.setItem(cle, v); } catch { /* sans mémoire : on redemandera */ } }

export async function chargerConsentement(): Promise<Consentement> {
  if (charge) return consentement;
  const v = await lire(CLE_CONSENTEMENT);
  consentement = v === 'oui' || v === 'non' ? v : null;
  clientId = await lire(CLE_CLIENT);
  charge = true;
  abonnes.forEach((f) => f(consentement));
  return consentement;
}

export async function definirConsentement(c: 'oui' | 'non') {
  const avant = consentement;
  consentement = c;
  await ecrire(CLE_CONSENTEMENT, c);
  abonnes.forEach((f) => f(c));
  if (c === 'non') { file = []; return; }
  if (avant !== 'oui') evenement('ouverture_app');
}

export function useConsentement() {
  const [c, setC] = useState<Consentement>(consentement);
  const [pret, setPret] = useState(charge);
  useEffect(() => {
    const f = (v: Consentement) => { setC(v); setPret(true); };
    abonnes.add(f);
    chargerConsentement().then(f);
    return () => { abonnes.delete(f); };
  }, []);
  return { consentement: c, pret, definir: definirConsentement };
}

// Après la suppression du compte : nouvel identifiant de statistiques, sans lien avec l'ancien.
export async function oublierIdentifiant() {
  clientId = null;
  file = [];
  try { await AsyncStorage.removeItem(CLE_CLIENT); } catch { /* rien à oublier */ }
}

// Appelé par la navigation : suivi seulement pour l'interface client reliée au serveur.
export function activerSuivi(oui: boolean) {
  const etait = actif;
  actif = oui && !!supabase && Platform.OS !== 'web';
  if (actif && !etait) chargerConsentement().then((c) => { if (c === 'oui') evenement('ouverture_app'); });
}

export function evenement(nom: string, params?: Record<string, unknown>) {
  if (!actif || consentement !== 'oui') return;
  // Nouvelle session après 30 minutes sans activité (même règle que GA4).
  if (Date.now() - dernier > 30 * 60000) session = Math.floor(Date.now() / 1000);
  dernier = Date.now();
  file.push({ nom, params });
  if (file.length >= 10) envoyer();
  else if (!minuteur) minuteur = setTimeout(envoyer, 2000);
}

async function envoyer() {
  if (minuteur) { clearTimeout(minuteur); minuteur = null; }
  if (!file.length || !supabase) return;
  const lot = file.splice(0, 25);
  if (!clientId) {
    clientId = `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
    await ecrire(CLE_CLIENT, clientId);
  }
  supabase.functions.invoke('stats', { body: { client_id: clientId, session_id: session, evenements: lot } }).catch(() => {});
}
