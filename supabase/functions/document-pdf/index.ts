// Fonction serveur « document-pdf » : produit le PDF d'un bon de commande ou d'une facture, à partir
// du contenu figé enregistré dans la base (table documents), avec la mise en page des modèles V2
// de Fabrice. Le PDF est rangé dans l'espace de stockage privé « documents » et un lien de
// téléchargement valable 1 heure est renvoyé : { url, numero }.
// Seuls Fabrice et le client de la course peuvent l'obtenir (règles de la base).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from 'npm:pdf-lib@1.17.1';

// Clés du projet fournies par Supabase : anciens noms (ANON / SERVICE_ROLE) ou nouveaux
// (SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS, objets JSON { default: "sb_…" }).
function cleProjet(type: 'publique' | 'secrete'): string {
  const [liste, une, ancienne] = type === 'publique'
    ? ['SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']
    : ['SUPABASE_SECRET_KEYS', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const brut = Deno.env.get(liste);
  if (brut) {
    try {
      const o = JSON.parse(brut) as Record<string, string>;
      const v = o.default ?? Object.values(o)[0];
      if (v) return v;
    } catch { /* format inattendu : on essaie les autres noms */ }
  }
  const v = Deno.env.get(une) ?? Deno.env.get(ancienne);
  if (!v) throw new Error(`Clé ${type} du projet introuvable`);
  return v;
}

// Logo (volant « 3 ») repris du modèle Word.
const LOGO = 'iVBORw0KGgoAAAANSUhEUgAAAPAAAADwCAMAAAAJixmgAAAAYFBMVEUAAAAyLSkxLCgxLCgxKikxLCgxLCgxLCgxLCg0NC8wMCk3Nxo8HR1VVVU1MCsuLh0eHh5VAABIJCRVVQAzMChVAFUAAH8AVQB/AAAAVVU/Hz9/fwAAAAAAAAAAAAAAAABGJ64wAAAAIHRSTlMA/s8tEq9Nb5AMLAgIA/8PCAMHA0YDAgMCAwgCAAAAAH5owK4AAAyiSURBVHja3V2Hjuu2ErVZhqTtLbcleS///5+R69rksM9Q4hIIAgQbWUdTOXW3G3OclGCs1kLsX44QWlsD8qB23+W4C1IPZ3gW5AvuyWGfJBRAfTkLuWcl9gK2DusXsbWZjdSqGewDtAU1D1q9JzkLoSdQUVRop8C8cPKe/OjN8rYyYs9yhN0imaXdMx4Nx++ppxJkNmpDcMV+wNkKZDcG7uVYNRV1F3fZWmNgOXI5538bY+ucz7WpXAj3cjGQLvrVzlepQtyrMrbUJTal1DH+4aQp8UgFrCW8tsAhjpM1RuwCN1zLLXJzu1f4Jo3enPbKcLMF16sM9Zb4Wpm0W+RoDIDeCpFT5BWU9xuZcs/HEdmkiHui/a1jisxjiKzib8Bzq0lcS8QAdR1VzowegYpDNquxM68DFNeSmvV3nV7NxY1SmZOtpRgpu8WyzKatYW1HL2YOzUjxHeryuIhd5rBPkavCaKc2Isr0qgu3vmKFawtuF6nfBMe7TsQF5zVaxE5s6SIeITLh6ygx3OK3MBwZYtT8mt2axxlGxAexDW1VwNbAxc96AyFx1AsBHn1lN5HoQU1yN+d96K2Jb8b360T8qQf66iTefad2sRtUVznEipRnxMZy04jJ1EfC7yc2l4tHENvmZ02AF0VsqJ4kNllSgyBu0quhvyo2WkKEIG55UzsLXpQXXb/CEhsuEQu1jf2n9sZA77SNtceViiu8McBuNxdi2SfAZrfxY7o8LiCz5cPOP7bjnYMroXabB4ykgaCZocUEeBG9U8zUMJWC7hfEgKHNbpJj2ihlp1NYj6NbZFFSXqjXFuMC5vyp5xTgZvVjZhVgXB51LVPo41yAA6aGyi8kd5MdqNNbcm6GxkgGNX8tJux79N0I8VFBYNhNeKCCS3Wlitvk+UsXs6lP4MOUgCsUkZ7Wp0xroo+yLyOm7U9XhSS205ukiLsYId23IXDob8E3J3BQDiHeCr6KMHJS8iJdA7IkXHBuPZqPrfH6U10Q2FmzCYwwyhMlsdwX/+lMAYC4Ror2UUzlX0Y7bsQpY6u/G+D971JemMrBTPVUFX+ac5voDJmHz0xPqipTWY9JGts2UAXDf6BImz93tcNW9XW+3TjQRT/KxnAszL21IKaSxXOdVJGO3vTYp7opVlDF0dsbB1TGyBGerh4sszD324pgT9VoX3la7RuOWGt4nZON49igwOvYnED3DJ+zeT96Y5g7hzo9wgB/d04PGmOhm8QWv/hJktl1nO7nUZJMY4NGEbaA/T6b+9k/M9IX4joRvhaZ/rRjBFoCMoUJ/+IFr359uzfdJAg6ytxUoBUuttcvrlo07fXNXJu/Au2a27nzADHl2hhZ4lFW/G0xIZaeyk0T3ITeikC4Lk7ow4NJozNoVUoj2/wX1/auVTw+NIgjbc5DM3QcegBYgHs7YY2A2DQt5SMJxp04mZmdZnJ3+PPMiUXErx6/QdjTIgwjjT2/CTKb02fpe9+ljdyin4ZGO3yw6aPPXMUGxS36/2sEbBrwfdKTUhgbXLWWSERCkOmrN2N2Eq86LCFS19l/xsSH2pjkMMDrL9474RNKBBlxqkL5V7kYpU/mFyWpG6+YFedO0nt9cExpobdW76/O3+6Qj1F6ZLYAj29gkBvIQlDKUZcf3i/czJIumxYTai0oyhnGJu2GgC/JGcJhpl885LAvfrMJriz3YoP/ApVXlYCl7ywiU7POhNYpVbwoqcPji+nstT05CgiC17XlmSTs5u0pra80OsTvGR/XC0HE4t8apE7WT8xLXOOlnRwZZFx0Tdo/5Ozb/3HUPoufBG423l6+YCp7pz2msy3hNY8tnKfGRDZS9QtC18F9iSykA2WBrIWcb33iCBVjGVtQV3X0TcxrXrgocxbQRaA6IAQsDgXpoKcn3F3Q82TBYGZaaYWC9p4uWzJn8enoKcB496KPWCJPEIGOKw8VW8+qyLZKlj+R+WU6ka6SRSk/mY8eVw2N9wFDczWpMqnRIWHm0pQpUhPa3a48gG+ITTPgiJ2CCN5Ed5vBDYXpJS5qiE1fQQfijiwXJDBVbeqvluL+ZYAmyeMDtn2Ad+EA2ff35R//Vd+TpfjerfWcowwnWTYWUXmehwe4LRzlLvPek+e3LH8pLIbSvtzCB6wJAHefv3LDuTuioV6v+zYAJyPFnTWQKgVYrJX/NImofycRpgJMMdF4IsA0G2l6ACvZcpRSLpdpg8pr/SDAzXG6+3bDaIoxWPhCN9C4BzDo8xHh0alz2e34/n6P2EYSqy+OBmWd9goyfFLS2Hwe5uF+05alq5XssHeFXjynIy4y1ANv1WqOh5/gRBwKKegr8OWKnhZkNTHD7/uA+29LPYgHTGxO35a4y3EQn9m8jQXcFfGol2Ns0K0cyFV6MGA8bAPjflEX5tK4jMSA7+wH8Zri0uQ3Xxj1g35cmr9nB9LFUPTHTxC/plrEv+vwNF/z7qdfAuAl0/hjPJHwlf4z5ANLn+RyJSFmE2Ppp0sHex7xSzUTc0GQEDdj7VK8gA4GfF8dvAC/XYpWZ/OMGtQBvMNgu6SydbqUx+sDN+ELfHADdvkqSr7PC6GdYNda8RpFza8xJOZ7MZ9PMVKIDWIJzGCtpUcKsUZ4SA7QlQWuFgtgRGcFWkSuB5jeEkvsB9702BjASMAGa/LwtJb9ToA16r3CfuiFaSBghVc1yrFCPBAw4M//Wwy1xAPNko083+5HZsVFpnGMzSh9lQrDSJ4e6FpCrDBZ7QfydBywYeboaKUvr7M17nqo4hJjBvJ0NACgf/FytM7bq7GAyY2Sjj//hx7ne0S7Xf7H/GVVwuccl+sZZ4R16mtwRrZG7QF36WGeepTaik1XdNyiowpt9BidRY/X/7C23GYNEGGGbbc+gX9nRJzN2xq1rNrvnztlWI3LMmEcbR3/75hapcano3kqPAoWsPhDqP8/xuuwbgQj6YJbDMeHD3eT8dg/V7Rhh3+pRWnfPjkj4V3C7GtLXvEKvuHVp8INNZY11XN6LnoXrPO3TGFxASeJn/r1ziNrfgwNMZgOXV5wfni9IADm1oR6bgAA/sG+QQP7R48ybwlavV8bPRa0IJ3iDvTLiouYpghCOIt1eTx3Up4nErER2tXse2TaiOfOc5T83upFlFkmgZqqm7Zl1FvHQzgEhGGI3r5YgtE/p91AhIzoEbTeR/XiZO49rQrbnwG/2DR0FoBiX1wKaFsl28OhWua5G4kobxGyIV8VrPKkv0QAV9jyqFuCvzI+DYg1rrW3R3IBLvuK/AvTI7VpvaEtaCx1CyPHcgxTdyKWzdkMYK/ddrE+gA6uRmbS2WZZII+jGvKcOPINy+mkBLfiUtRJcWwtDfTIGLXiipXyNOZcTsjzqohkudPVhjYtbnubRpRgzt+Sdj78sf3CcWDOWFOWtvyyFOoPseKUiF20eMlS8HOLlrW8iDUVTx/R8fwNvSqIoqd0QCwRTztNZt0Q14WQxoamphZfCwdkmpQOcWKCVh9RepwGxMcXVEGuxAz/iocIGrWXJANwAxadXNJzA0FVCw3i+EacUjUd2eXRp1k/NVcNWQJw2RvL5DjudgcBeyzFPJlewMBVwYi6RAQxxj7A0dU0BFYEr2AHRsCnRmtEpV8its6xAc4yHfHdshBxJ1u32+H4QgWyO3ukLwN4AKf9BmdH9HlFLnM92hra3hsG9bVFVjd3lA2altuSjHe1CeLgeWxZdbMkm3pHSyZmFAvyZEFUdhrry2ytCCe3wukhxRNdfK3rOFolx8TaEWNt+vg6OutBv1UyM2c1e9wCVhdq1LRrZeByNh25xHY+ScItQebhI7eRVvA2wyZEyR4IdJb0iZvbzKW5SxlTu8HKZTkWljaviiq/ZJR/HFbUIt/KcVSPCD9bF1mwUlWMWHycGSQubEltsMnehEtWk9pRWxoyH19nFzPgaJ7p5fL0FbAbdlRuWrw2h2oCP+MtWLZrxy7hyEtYYsu2yran2S2Rt0BdX6rC36/D4FWZTTJVeO0aO1aerhPRrQDWmnA7hcmo2yw/a7lb56jgvLnLqXSyhPlZavfW4WZaoyZe44GHtKgwtjuNUXbaa3OBjGc1F1w/ihCUw2fE104F198nt6jwU43mn4WZ3aLLzk0tL2g11t2RtO2rwL20nB0eG+GMd+ztfPUr3c7FKt+204hY01Lymk+zeon21hCjzM0w20tfmnItEUm7lt09OtV0cvulTqmohoa5FHOBpTKi4+I12XEyEdX4dmgVxCNWDE16K1MWbLz4EN+4NSdQJwObvPcM9LcAe0Zpg07iV/N1NtDfho2dulI2gHxfEHgYBfU/n0xx7UzLVdsAAAAASUVORK5CYII=';

export type Ligne = { libelle: string; detail: string | null; quantite: number | null; unite: string | null; prix_unitaire_ht: number | null; total_ht: number };
export type Contenu = {
  type: 'commande' | 'facture'; numero: string; date: string;
  vendeur: { raison_sociale: string; forme: string; siege: string; siren: string; tva: string; telephone: string };
  client: { numero: string | null; nom: string; entreprise: string | null; adresse: string | null; code_postal: string | null; ville: string | null; telephone: string | null; email: string | null };
  course: { date: string; heure: string; passagers: number; offre: string; offre_id: string; vehicule: string; depart: string; arrivee: string; aller_retour: boolean; numero_vol_train: string | null };
  lignes: Ligne[]; total_ht: number; taux_tva: number; tva: number; total_ttc: number; acompte: number; reste: number;
  mode_paiement: string | null; acquittee: boolean;
};

// Couleurs du modèle
const BEIGE = rgb(237 / 255, 232 / 255, 208 / 255);
const FAUVE = rgb(200 / 255, 173 / 255, 127 / 255);
const BORD = rgb(176 / 255, 152 / 255, 110 / 255);
const ENCRE = rgb(0.1, 0.1, 0.1);
const GRIS = rgb(0.38, 0.38, 0.38);

const euros = (n: number) => {
  const [e, c] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${c} €`;
};
const nombre = (n: number, dec = 2) => n.toFixed(dec).replace('.', ',');
// Prix au km HT : au millième quand il le faut (1,636 €), sinon au centime.
const prixUnitaire = (n: number) => (Math.round(n * 100) === Math.round(n * 1000) / 10 ? euros(n) : `${nombre(n, 3)} €`);
// Polices standard du PDF : on remplace les rares caractères qu'elles ne savent pas écrire.
const propre = (t: string | null | undefined) => (t ?? '').replace(/[  ]/g, ' ').replace(/[→]/g, '>').replace(/[^\x20-\x7E -ÿ€’'«»…·–—]/g, '');

export async function rendrePdf(c: Contenu): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${c.type === 'facture' ? 'Facture' : 'Bon de commande'} ${c.numero}`);
  pdf.setAuthor(c.vendeur.raison_sociale);
  const page = pdf.addPage([595.28, 841.89]);
  const n = await pdf.embedFont(StandardFonts.Helvetica);
  const g = await pdf.embedFont(StandardFonts.HelveticaBold);
  const H = 841.89;
  const t = (p: PDFPage, s: string, x: number, y: number, o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; droite?: number; centre?: number; max?: number } = {}) => {
    const f = o.f ?? n, size = o.size ?? 9;
    let s2 = propre(s);
    if (o.max) while (s2.length > 3 && f.widthOfTextAtSize(s2, size) > o.max) s2 = s2.slice(0, -2).trimEnd() + '…';
    const w = f.widthOfTextAtSize(s2, size);
    const xx = o.droite !== undefined ? o.droite - w : o.centre !== undefined ? o.centre - w / 2 : x;
    p.drawText(s2, { x: xx, y, size, font: f, color: o.color ?? ENCRE });
  };
  const cadre = (x: number, y: number, w: number, h: number, fond?: ReturnType<typeof rgb>) =>
    page.drawRectangle({ x, y, width: w, height: h, color: fond, borderColor: BORD, borderWidth: 0.6 });
  // Coupe un texte long sur plusieurs lignes.
  const couper = (s: string, f: PDFFont, size: number, max: number) => {
    const mots = propre(s).split(' '); const lignes: string[] = []; let l = '';
    for (const m of mots) { const essai = l ? `${l} ${m}` : m; if (f.widthOfTextAtSize(essai, size) > max && l) { lignes.push(l); l = m; } else l = essai; }
    if (l) lignes.push(l);
    return lignes;
  };

  // En-tête : logo, titre, numéro et date
  const logo = await pdf.embedPng(Uint8Array.from(atob(LOGO), (ch) => ch.charCodeAt(0)));
  page.drawImage(logo, { x: 48, y: H - 140, width: 92, height: 92 });
  const facture = c.type === 'facture';
  t(page, facture ? 'FACTURE' : 'BON DE COMMANDE', 0, H - 112, { f: g, size: 22, droite: 545 });
  if (!facture) t(page, 'Réservation', 0, H - 128, { size: 10, color: GRIS, droite: 545 });
  const yN = H - 175;
  cadre(330, yN, 125, 15, BEIGE); cadre(455, yN, 90, 15, BEIGE);
  t(page, facture ? 'N° de Facture' : 'N° de Commande', 335, yN + 4.5, { size: 8.5 });
  t(page, 'Date', 460, yN + 4.5, { size: 8.5 });
  cadre(330, yN - 17, 125, 17); cadre(455, yN - 17, 90, 17);
  t(page, c.numero, 335, yN - 12, { f: g, size: 9.5 });
  t(page, c.date, 460, yN - 12, { size: 9.5 });

  // Bandeau Facturé à / Numéro client / Mode de paiement
  const yB = H - 255;
  cadre(60, yB, 260, 15, BEIGE); cadre(320, yB, 115, 15, BEIGE); cadre(435, yB, 110, 15, BEIGE);
  t(page, 'Facturé à', 65, yB + 4.5, { f: g, size: 9 });
  t(page, 'Numéro client', 325, yB + 4.5, { f: g, size: 9 });
  t(page, 'Mode de paiement', 440, yB + 4.5, { f: g, size: 9 });
  t(page, c.client.numero ?? '—', 325, yB - 14, { size: 9.5 });
  const modes: [string, string][] = [['cb', 'CB'], ['cheque', 'Chèque'], ['especes', 'Espèce'], ['virement', 'Virement'], ['en_ligne', 'CB en ligne']];
  let ym = yB - 16;
  for (const [cle, lib] of modes) {
    if ((cle === 'virement' || cle === 'en_ligne') && c.mode_paiement !== cle && !(cle === 'en_ligne' && c.acompte > 0)) continue;
    // L'acompte payé en ligne est coché en plus du mode de paiement du solde.
    const coche = c.mode_paiement === cle || (cle === 'en_ligne' && c.acompte > 0);
    page.drawRectangle({ x: 445, y: ym - 1, width: 7, height: 7, borderColor: ENCRE, borderWidth: 0.6, color: coche ? ENCRE : undefined });
    t(page, lib, 457, ym, { f: coche ? g : n, size: 9 });
    ym -= 12;
  }

  // Course et client
  let y = yB - 40;
  const champ = (lib: string, val: string | null | undefined) => {
    t(page, lib, 60, y, { f: g, size: 9 });
    t(page, val ?? '', 60 + g.widthOfTextAtSize(propre(lib), 9) + 4, y, { size: 9, max: 360 });
    y -= 11.5;
  };
  champ('Date de la course :', c.course.date);
  champ('Heure de départ :', c.course.heure + (c.course.numero_vol_train ? `   (vol / train ${c.course.numero_vol_train})` : ''));
  champ('Nombre de passager :', String(c.course.passagers));
  y -= 8;
  champ('Nom :', c.client.nom);
  champ("Nom de l'entreprise :", c.client.entreprise);
  champ('Adresse :', c.client.adresse);
  champ('Code postal, Ville :', [c.client.code_postal, c.client.ville].filter(Boolean).join(' '));
  champ('N° de téléphone :', c.client.telephone);
  champ('Email :', c.client.email);

  // Tableau de description
  y -= 14;
  const cols = [60, 232, 335, 440, 545];
  const entetes = ['DESCRIPTION', 'Nombre de kilomètre', "Prix à l'unité (HT)", 'Total HT'];
  for (let i = 0; i < 4; i++) { cadre(cols[i], y, cols[i + 1] - cols[i], 15, BEIGE); t(page, entetes[i], cols[i] + 5, y + 4.5, { f: g, size: 8.5 }); }
  for (const l of c.lignes) {
    const lignesTexte = [propre(l.libelle), ...(l.detail ? couper(l.detail, n, 7.5, cols[1] - cols[0] - 10) : [])];
    const h = 8 + lignesTexte.length * 10;
    y -= h;
    for (let i = 0; i < 4; i++) cadre(cols[i], y, cols[i + 1] - cols[i], h);
    t(page, lignesTexte[0], cols[0] + 5, y + h - 12, { f: g, size: 8.5, max: cols[1] - cols[0] - 10 });
    lignesTexte.slice(1).forEach((d, k) => t(page, d, cols[0] + 5, y + h - 22 - k * 10, { size: 7.5, color: GRIS }));
    if (l.quantite !== null) t(page, `${nombre(Number(l.quantite), 1)} ${l.unite ?? ''}`, 0, y + h - 12, { size: 9, droite: cols[2] - 6 });
    if (l.prix_unitaire_ht !== null) t(page, prixUnitaire(Number(l.prix_unitaire_ht)), 0, y + h - 12, { size: 9, droite: cols[3] - 6 });
    t(page, euros(Number(l.total_ht)), 0, y + h - 12, { size: 9, droite: cols[4] - 6 });
  }
  for (const [lib, val] of [['Lieu de prise en charge :', c.course.depart], ['Lieu de destination :', c.course.arrivee]] as const) {
    y -= 17;
    cadre(cols[0], y, cols[1] - cols[0], 17); cadre(cols[1], y, cols[4] - cols[1], 17);
    t(page, lib, cols[0] + 5, y + 5.5, { f: g, size: 8.5 });
    t(page, val + (c.course.aller_retour && lib.startsWith('Lieu de destination') ? '  (aller-retour)' : ''), cols[1] + 5, y + 5.5, { size: 8.5, max: cols[4] - cols[1] - 10 });
  }

  // Pastille de l'offre (comme sur le modèle)
  const yP = y - 95;
  page.drawRectangle({ x: 60, y: yP, width: 150, height: 58, borderColor: FAUVE, borderWidth: 1.5, color: rgb(0.97, 0.95, 0.9) });
  t(page, c.course.offre, 0, yP + 32, { f: g, size: 13, centre: 135 });
  t(page, c.course.vehicule, 0, yP + 15, { size: 8, color: GRIS, centre: 135, max: 140 });

  // Totaux
  const totaux: [string, string, boolean?][] = [
    ['Total HT :', euros(c.total_ht)],
    ['Taux TVA :', `${nombre(Number(c.taux_tva))}%`],
    ['TVA :', euros(c.tva)],
    ['Total TTC :', euros(c.total_ttc), true],
  ];
  if (c.acompte > 0) {
    totaux.push(['Acompte versé :', `- ${euros(c.acompte)}`]);
    totaux.push([facture && c.acquittee ? 'Solde réglé :' : 'Reste à payer :', euros(c.reste), true]);
  }
  let yT = y - 37;
  for (const [lib, val, fort] of totaux) {
    page.drawRectangle({ x: 345, y: yT, width: 95, height: 16, color: FAUVE });
    page.drawRectangle({ x: 440, y: yT, width: 105, height: 16, color: BEIGE });
    t(page, lib, 350, yT + 5, { f: g, size: 9 });
    t(page, val, 0, yT + 5, { f: fort ? g : n, size: 9.5, droite: 540 });
    yT -= 18;
  }
  if (facture && c.acquittee) {
    const lib = modes.find(([k]) => k === c.mode_paiement)?.[1] ?? '';
    t(page, `Facture acquittée le ${c.date}${lib ? ` (${lib})` : ''}`, 0, yT - 2, { f: g, size: 9, droite: 545 });
  }

  // Pièce émise en mode test : filigrane « sans valeur »
  if (c.numero.startsWith('TEST-')) {
    page.drawText('DOCUMENT DE TEST', { x: 95, y: 300, size: 46, font: g, color: rgb(0.85, 0.2, 0.2), opacity: 0.18, rotate: degrees(35) });
    t(page, 'Document de test émis en mode essai : sans valeur comptable ni fiscale.', 0, 88, { f: g, size: 8, color: rgb(0.7, 0.15, 0.15), centre: 297 });
  }

  // Pied de page : mentions légales
  const v = c.vendeur;
  t(page, `Société :   ${v.raison_sociale}`, 60, 70, { size: 7 });
  t(page, `Siège social :   ${v.siege}`, 60, 61, { size: 7 });
  t(page, `Téléphone :   ${v.telephone.replace(/^\+33/, '0').replace(/(\d{2})(?=\d)/g, '$1 ')}`, 60, 46, { size: 7 });
  t(page, `Siren : ${v.siren}`, 400, 70, { size: 7 });
  t(page, `N° de TVA : ${v.tva}`, 400, 61, { size: 7 });
  t(page, v.forme, 400, 52, { size: 7 });
  if (facture) {
    t(page, 'Clients professionnels : paiement à réception. Pénalités de retard : 3 fois le taux d’intérêt légal ; indemnité forfaitaire pour frais de recouvrement : 40 €.', 60, 30, { size: 6, color: GRIS, max: 485 });
  }
  return await pdf.save();
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { document_id } = await req.json().catch(() => ({}));
    if (typeof document_id !== 'string') return reponse({ erreur: 'Requête invalide' }, 400);
    const admin = createClient(url, cleProjet('secrete'));
    // Appel interne (fonction « emails ») : authentifié par la clé secrète du projet, jamais exposée.
    const interne = req.headers.get('x-cle-interne') === cleProjet('secrete');
    if (!interne && !jeton) return reponse({ erreur: 'Requête invalide' }, 400);

    // Sinon, lecture avec la session de l'utilisateur : la base vérifie qu'il a le droit de voir ce document.
    const lecteur = interne ? admin : createClient(url, cleProjet('publique'), { global: { headers: { Authorization: `Bearer ${jeton}` } } });
    const { data: doc } = await lecteur.from('documents').select('id, numero, type, contenu, pdf_chemin').eq('id', document_id).maybeSingle();
    if (!doc) return reponse({ erreur: 'Document introuvable' }, 404);

    let chemin = doc.pdf_chemin as string | null;
    if (!chemin) {
      chemin = `${doc.type === 'facture' ? 'factures' : 'bons-de-commande'}/${doc.numero}.pdf`;
      const octets = await rendrePdf(doc.contenu as Contenu);
      const { error } = await admin.storage.from('documents').upload(chemin, octets, { contentType: 'application/pdf', upsert: true });
      if (error) throw new Error(error.message);
      await admin.from('documents').update({ pdf_chemin: chemin }).eq('id', doc.id);
    }
    const { data: lien, error: e2 } = await admin.storage.from('documents').createSignedUrl(chemin, 3600, { download: `${doc.numero}.pdf` });
    if (e2 || !lien) throw new Error(e2?.message ?? 'Lien indisponible');
    return reponse({ url: lien.signedUrl, numero: doc.numero });
  } catch (e) {
    console.error('document-pdf', e);
    return reponse({ erreur: 'Impossible de produire le PDF pour le moment' }, 500);
  }
});
