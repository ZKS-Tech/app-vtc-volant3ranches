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
