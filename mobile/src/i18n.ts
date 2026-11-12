import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { EN } from './traductions';

// Langue de l'interface client : français ou anglais.
//  • « auto » (par défaut) : anglais si le téléphone n'est pas réglé en français, sinon français ;
//  • modifiable dans Profil › Langue ;
//  • l'espace de Fabrice reste toujours en français.
// Les textes sont écrits en français dans le code et passent par t('…') : la traduction anglaise est
// cherchée dans traductions.ts (le texte français sert de clé). Un texte sans traduction reste en
// français plutôt que de disparaître.

export type Langue = 'fr' | 'en';
export type ChoixLangue = Langue | 'auto';
const CLE = 'langue';

function langueTelephone(): Langue {
  try {
    const l = Intl.DateTimeFormat().resolvedOptions().locale ?? 'fr';
    return l.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'fr';
  }
}

let choix: ChoixLangue = 'auto';
let langue: Langue = langueTelephone();
let forceFrancais = false; // espace chauffeur
const abonnes = new Set<() => void>();

export const langueActuelle = (): Langue => (forceFrancais ? 'fr' : langue);
/** Langue choisie par le client (indépendante de l'espace chauffeur) : envoyée au serveur. */
export const langueClient = (): Langue => langue;
export const anglais = () => langueActuelle() === 'en';

/** Traduit un texte écrit en français ; {nom} est remplacé par vars.nom. */
export function t(fr: string, vars?: Record<string, string | number>): string {
  let s = anglais() ? EN[fr] ?? fr : fr;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Choix entre deux valeurs (pluriels, phrases construites, formats). */
export const L = <T,>(fr: T, en: T): T => (anglais() ? en : fr);

/** Pluriel simple : n course(s). */
export const pluriel = (n: number, fr: [string, string], en: [string, string]) =>
  `${n} ${(anglais() ? en : fr)[n > 1 || (anglais() && n === 0) ? 1 : 0]}`;

function prevenir() { abonnes.forEach((f) => f()); }

export async function chargerLangue() {
  try {
    const v = await AsyncStorage.getItem(CLE);
    if (v === 'fr' || v === 'en') { choix = v; langue = v; }
  } catch { /* langue du téléphone */ }
  prevenir();
}

export async function definirLangue(c: ChoixLangue) {
  choix = c;
  langue = c === 'auto' ? langueTelephone() : c;
  try { if (c === 'auto') await AsyncStorage.removeItem(CLE); else await AsyncStorage.setItem(CLE, c); } catch { /* sans mémoire */ }
  prevenir();
}

// Appelé pendant l'affichage de la navigation (avant ses écrans) : pas de notification ici.
export function forcerFrancais(oui: boolean) {
  forceFrancais = oui;
}

/** Re-rend le composant (et, à la racine, toute l'appli) quand la langue change. */
export function useLangue() {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    abonnes.add(f);
    return () => { abonnes.delete(f); };
  }, []);
  return { langue: langueActuelle(), choix, definir: definirLangue };
}

// Messages d'erreur venus du serveur (écrits en français) : traduits s'ils sont connus.
const ERREURS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Fabrice est indisponible du (\S+) au (\S+)\./, (m) => `Fabrice is unavailable from ${m[1]} to ${m[2]}. Choose another date or call him on +33 6 16 53 14 91.`],
  [/^Vous avez une course prévue le (.+) : annulez-la/, (m) => `You have a ride booked on ${m[1].replace(' à ', ' at ').replace(/(\d+)h(\d+)/, '$1:$2')}: cancel it first, or call Fabrice.`],
];
export function traduireErreur(message: string): string {
  if (!anglais() || !message) return message;
  if (EN[message]) return EN[message];
  for (const [re, f] of ERREURS) { const m = message.match(re); if (m) return f(m); }
  return message;
}
