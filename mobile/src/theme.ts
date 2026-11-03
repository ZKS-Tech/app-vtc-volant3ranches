import { Platform } from 'react-native';

// Direction « Bleu pastel du Lauragais » : le bleu de la guède, du bain le plus pâle à la cuve.
// Deux palettes de même structure : clair (jour) et sombre (nuit, cuve d'indigo).

export const clair = {
  cuve: '#101B45', // fond des en-têtes de marque
  indigo: '#1E3277', // bleu de marque (référence)
  action: '#1E3277', // fond des boutons principaux, course confirmée
  actionPress: '#16265E',
  accent: '#1E3277', // textes, icônes et bordures interactifs
  fort: '#101B45', // grands titres et chiffres
  blanc: '#FFFFFF', // texte sur fond indigo ou photo
  bain1: '#EAF0FA', // premier bain : demande envoyée
  bain2: '#D3E0F4',
  bain3: '#A9C0E6',
  bain4: '#5F7FC0',
  delave: '#8E9DB8', // course terminée : bleu délavé
  delaveFond: '#EEF1F5',
  sol: '#F3F5F9', // fond général, froid
  surface: '#FFFFFF',
  encre: '#121A33',
  pierre: '#5B6273',
  trait: '#DCE1EA',
  feuille: '#C9D45C', // feuille de pastel : informations utiles
  feuilleFond: '#F1F4D6',
  feuilleEncre: '#4A540E',
  erreur: '#B3261E',
  erreurFond: '#FBEAE8',
  alerte: '#7A4F00',
  alerteFond: '#FFF1D2',
  surCuve2: '#B9C7EA', // texte secondaire sur fond indigo
  placeholder: '#7E8496',
};

export type Couleurs = typeof clair;

export const sombre: Couleurs = {
  cuve: '#16245F',
  indigo: '#1E3277',
  action: '#3954B5',
  actionPress: '#2D4596',
  accent: '#A8BCF7',
  fort: '#F1F4FF',
  blanc: '#FFFFFF',
  bain1: '#1C2754',
  bain2: '#273573',
  bain3: '#4A63B0',
  bain4: '#7C95DA',
  delave: '#6D7A99',
  delaveFond: '#161D38',
  sol: '#0A1029',
  surface: '#131B3A',
  encre: '#E6EAF5',
  pierre: '#A1A9BF',
  trait: '#283157',
  feuille: '#C9D45C',
  feuilleFond: '#252A10',
  feuilleEncre: '#DDE58A',
  erreur: '#FF9C90',
  erreurFond: '#3A1614',
  alerte: '#F5C870',
  alerteFond: '#33260B',
  surCuve2: '#C3CFF2',
  placeholder: '#8790AB',
};

export const f = {
  display: 'ArchivoNarrow_700Bold',
  displayMedium: 'ArchivoNarrow_600SemiBold',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 8, m: 12, l: 18 };

export const typo = (c: Couleurs) => ({
  title: { fontSize: 28, fontWeight: '700' as const, color: c.encre, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '700' as const, color: c.encre },
  h3: { fontSize: 17, fontWeight: '600' as const, color: c.encre },
  body: { fontSize: 16, color: c.encre, lineHeight: 22 },
  small: { fontSize: 14, color: c.pierre, lineHeight: 19 },
  label: { fontSize: 13, color: c.pierre, fontWeight: '600' as const },
});

export const typos = { clair: typo(clair), sombre: typo(sombre) };

// Retire le contour bleu du navigateur sur les champs (le focus est dessiné par la bordure).
// Web uniquement : la valeur 'none' n'existe pas sur iOS et Android.
export const sansContourWeb = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;
