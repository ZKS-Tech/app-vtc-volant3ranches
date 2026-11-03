// Direction « Bleu pastel du Lauragais » : le bleu de la guède, du bain le plus pâle à la cuve.
export const c = {
  cuve: '#101B45', // indigo le plus profond : en-têtes, panneau
  indigo: '#1E3277', // action principale, course confirmée
  indigoPress: '#16265E',
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
  surCuve: '#FFFFFF',
  surCuve2: '#B9C7EA',
};

export const f = {
  display: 'ArchivoNarrow_700Bold',
  displayMedium: 'ArchivoNarrow_600SemiBold',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 8, m: 12, l: 18 };

export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, color: c.encre, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '700' as const, color: c.encre },
  h3: { fontSize: 17, fontWeight: '600' as const, color: c.encre },
  body: { fontSize: 16, color: c.encre, lineHeight: 22 },
  small: { fontSize: 14, color: c.pierre, lineHeight: 19 },
  label: { fontSize: 13, color: c.pierre, fontWeight: '600' as const },
};
