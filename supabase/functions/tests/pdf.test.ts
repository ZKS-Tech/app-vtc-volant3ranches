// Rendu des PDF à partir d'un contenu figé (sans base ni réseau).
// Les fichiers produits sont écrits dans PDF_SORTIE (si défini) pour les regarder.
import { assert } from 'jsr:@std/assert@1';

// deno-lint-ignore no-explicit-any
(Deno as any).serve = () => ({});
const { rendrePdf } = await import('../document-pdf/index.ts');

const base = {
  date: '09/11/2026',
  vendeur: { raison_sociale: 'Volant3ranches', forme: 'SASU au capital de 100 €', siege: '11 chemin de la baissade, 81220 Viterbe', siren: '932 513 443', tva: 'FR07932513443', telephone: '+33616531491' },
  client: { numero: 'C-0012', nom: 'Sophie Laurent', entreprise: 'Laurent Conseil', adresse: '3 rue des Lices', code_postal: '81000', ville: 'Albi', telephone: '06 44 55 66 77', email: 'sophie@exemple.fr' },
  course: { date: '12/11/2026', heure: '06h15', passagers: 2, offre: 'Offre Confort', offre_id: 'tesla', vehicule: 'Tesla Model 3 Performance', depart: 'Albi, Place du Vigan, 81000 Albi', arrivee: 'Aéroport Toulouse-Blagnac, Terminal, 31700 Blagnac', aller_retour: false, numero_vol_train: 'AF 6127' },
  lignes: [
    { libelle: 'Transfert : Offre Confort', detail: 'Véhicule avec chauffeur · Tesla Model 3 Performance', quantite: 85.4, unite: 'km', prix_unitaire_ht: 1.636, total_ht: 139.71 },
    { libelle: 'Arrondi tarifaire à 0,50 €', detail: null, quantite: null, unite: null, prix_unitaire_ht: null, total_ht: 0.43 },
  ],
  total_ht: 140.14, taux_tva: 10, tva: 14.01, total_ttc: 154.15,
};

Deno.test('facture acquittée avec acompte : PDF valide', async () => {
  const octets = await rendrePdf({ ...base, type: 'facture', numero: 'F-2026-0007', acompte: 15.42, reste: 138.73, mode_paiement: 'cb', acquittee: true });
  assert(octets.length > 3000 && new TextDecoder().decode(octets.slice(0, 5)) === '%PDF-');
  const sortie = Deno.env.get('PDF_SORTIE');
  if (sortie) await Deno.writeFile(`${sortie}/facture.pdf`, octets);
});

Deno.test('bon de commande sans acompte : PDF valide', async () => {
  const octets = await rendrePdf({ ...base, type: 'commande', numero: 'BC-2026-0011', acompte: 0, reste: 154.15, mode_paiement: null, acquittee: false,
    course: { ...base.course, offre: 'Offre Premium', offre_id: 'van', vehicule: 'Van 9 places', aller_retour: true, numero_vol_train: null } });
  assert(new TextDecoder().decode(octets.slice(0, 5)) === '%PDF-');
  const sortie = Deno.env.get('PDF_SORTIE');
  if (sortie) await Deno.writeFile(`${sortie}/bon.pdf`, octets);
});

Deno.test('pièce de test : PDF avec filigrane', async () => {
  const octets = await rendrePdf({ ...base, type: 'facture', numero: 'TEST-F-2026-0001', acompte: 0, reste: 154.15, mode_paiement: 'especes', acquittee: true });
  assert(new TextDecoder().decode(octets.slice(0, 5)) === '%PDF-');
  const sortie = Deno.env.get('PDF_SORTIE');
  if (sortie) await Deno.writeFile(`${sortie}/test.pdf`, octets);
});

Deno.test('avoirs total et partiel : PDF valides', async () => {
  const facture = { numero: 'F-2026-0007', date: '12/11/2026', total_ttc: 154.15 };
  const total = await rendrePdf({ ...base, type: 'avoir', numero: 'AV-2026-0001', facture, motif: 'Erreur de facturation', avoir_total: true,
    lignes: base.lignes.map((l) => ({ ...l, total_ht: -l.total_ht })), total_ht: -140.14, tva: -14.01, total_ttc: -154.15,
    acompte: 0, reste: 0, mode_paiement: 'cb', acquittee: true });
  const partiel = await rendrePdf({ ...base, type: 'avoir', numero: 'AV-2026-0002', facture, motif: 'Attente non due à l’aéroport', avoir_total: false,
    lignes: [{ libelle: 'Avoir partiel sur la facture F-2026-0007', detail: 'Attente non due à l’aéroport', quantite: null, unite: null, prix_unitaire_ht: null, total_ht: -9.09 }],
    total_ht: -9.09, tva: -0.91, total_ttc: -10, acompte: 0, reste: 0, mode_paiement: null, acquittee: false });
  for (const o of [total, partiel]) assert(new TextDecoder().decode(o.slice(0, 5)) === '%PDF-');
  const sortie = Deno.env.get('PDF_SORTIE');
  if (sortie) { await Deno.writeFile(`${sortie}/avoir-total.pdf`, total); await Deno.writeFile(`${sortie}/avoir-partiel.pdf`, partiel); }
});
