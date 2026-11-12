// Contenu et règles repris de volant3ranches-vtc.fr (accueil, véhicules, à propos, contact, CGV,
// module de réservation, mars 2026).
import { anglais, t } from './i18n';

export const contact = {
  telephone: '06 16 53 14 91',
  telephoneLien: 'tel:+33616531491',
  email: 'contact@volant3ranches-vtc.fr',
  instagram: 'https://www.instagram.com/volant3ranches/',
  site: 'https://volant3ranches-vtc.fr',
  adresse: '11 chemin de la Baissade, 81220 Viterbe',
  zone: 'Basé à Viterbe (81) : Toulouse, Albi, Castres, Carcassonne et toute la France.',
  societe: 'Volant3ranches, SASU, SIRET 932 513 443',
};

export const photos = {
  logo: require('../assets/photos/logo.png'),
  logoBlanc: require('../assets/photos/logo-blanc.png'),
  fabrice: require('../assets/photos/fabrice.webp'),
  flotte: require('../assets/photos/lauragais-flotte.webp'),
  teslaRoute: require('../assets/photos/tesla-route.webp'),
  teslaInterieurAvant: require('../assets/photos/tesla-interieur-avant.webp'),
  teslaInterieurArriere: require('../assets/photos/tesla-interieur-arriere.webp'),
  vanAvant: require('../assets/photos/van-avant.webp'),
  vanFace: require('../assets/photos/van-face.webp'),
  vanInterieur: require('../assets/photos/van-interieur-1.webp'),
  vanCoffre: require('../assets/photos/van-coffre.webp'),
};

export type OffreId = 'tesla' | 'van';

export type Offre = {
  id: OffreId;
  nom: string;
  vehicule: string;
  categorie: string;
  description: string;
  passagersMax: number;
  bagagesMax: number;
  prixKmJour: number;
  prixKmMajore: number;
  minimum: number;
  equipements: string[];
  photo: number;
  galerie: number[];
};

export const offres: Offre[] = [
  {
    id: 'tesla',
    nom: 'Offre Confort',
    vehicule: 'Tesla Model 3 Performance',
    categorie: 'Berline premium',
    description:
      'Silence, puissance et élégance. Une expérience de transport haut de gamme avec un confort incomparable et zéro émission.',
    passagersMax: 3,
    bagagesMax: 3,
    prixKmJour: 1.8,
    prixKmMajore: 2.2,
    minimum: 20,
    equipements: ['Climatisation', 'Recharge smartphones', '100 % électrique', 'Vitres teintées'],
    photo: photos.teslaRoute,
    galerie: [photos.teslaRoute, photos.teslaInterieurAvant, photos.teslaInterieurArriere],
  },
  {
    id: 'van',
    nom: 'Offre Premium',
    vehicule: 'Van 9 places',
    categorie: 'Transport de groupe',
    description:
      'Idéal pour les groupes, familles ou événements. Espace, confort et convivialité pour tous vos déplacements collectifs.',
    passagersMax: 8,
    bagagesMax: 8,
    prixKmJour: 2.6,
    prixKmMajore: 3.0,
    minimum: 35,
    equipements: ['Climatisation arrière autonome', 'Recharge smartphones', 'Spacieux', 'Confort'],
    photo: photos.vanAvant,
    galerie: [photos.vanAvant, photos.vanInterieur, photos.vanCoffre],
  },
];

export const offre = (id: OffreId) => offres.find((o) => o.id === id)!;

// 'adresse' : une adresse précise trouvée par l'API Adresse (Géoplateforme).
export type LieuType = 'aeroport' | 'gare' | 'ville' | 'adresse';
export type Lieu = { id: string; nom: string; detail: string; type: LieuType; lat: number; lon: number };

export const lieux: Lieu[] = [
  { id: 'tls', nom: 'Aéroport Toulouse-Blagnac', detail: 'Terminal, 31700 Blagnac', type: 'aeroport', lat: 43.6293, lon: 1.3638 },
  { id: 'albi-gare', nom: "Gare d'Albi-Ville", detail: 'Place Stalingrad, 81000 Albi', type: 'gare', lat: 43.9206, lon: 2.1425 },
  { id: 'castres-gare', nom: 'Gare de Castres', detail: 'Avenue Albert 1er, 81100 Castres', type: 'gare', lat: 43.6007, lon: 2.2329 },
  { id: 'carca-gare', nom: 'Gare de Carcassonne', detail: 'Avenue du Maréchal Joffre, 11000 Carcassonne', type: 'gare', lat: 43.2181, lon: 2.3517 },
  { id: 'matabiau', nom: 'Gare Toulouse-Matabiau', detail: 'Boulevard Pierre Semard, 31500 Toulouse', type: 'gare', lat: 43.6114, lon: 1.4537 },
  { id: 'albi', nom: 'Albi', detail: 'Centre-ville, 81000', type: 'ville', lat: 43.9289, lon: 2.1464 },
  { id: 'castres', nom: 'Castres', detail: 'Centre-ville, 81100', type: 'ville', lat: 43.606, lon: 2.241 },
  { id: 'gaillac', nom: 'Gaillac', detail: 'Centre-ville, 81600', type: 'ville', lat: 43.9016, lon: 1.897 },
  { id: 'lavaur', nom: 'Lavaur', detail: 'Centre-ville, 81500', type: 'ville', lat: 43.699, lon: 1.819 },
  { id: 'viterbe', nom: 'Viterbe', detail: '81220', type: 'ville', lat: 43.672, lon: 1.733 },
  { id: 'graulhet', nom: 'Graulhet', detail: 'Centre-ville, 81300', type: 'ville', lat: 43.76, lon: 1.989 },
  { id: 'mazamet', nom: 'Mazamet', detail: 'Centre-ville, 81200', type: 'ville', lat: 43.492, lon: 2.374 },
  { id: 'revel', nom: 'Revel', detail: 'Centre-ville, 31250', type: 'ville', lat: 43.458, lon: 2.004 },
  { id: 'toulouse', nom: 'Toulouse, Capitole', detail: 'Place du Capitole, 31000 Toulouse', type: 'ville', lat: 43.6045, lon: 1.444 },
  { id: 'carcassonne', nom: 'Carcassonne, la Cité', detail: '11000 Carcassonne', type: 'ville', lat: 43.2063, lon: 2.3644 },
];

// Les lieux du raccourci (aéroport, gares, villes) plus tous ceux rencontrés : adresses choisies
// dans la recherche, départs et arrivées des courses chargées depuis le serveur.
const lieuxConnus = new Map<string, Lieu>();
export const enregistrerLieu = (l: Lieu) => { lieuxConnus.set(l.id, l); return l; };
export const lieu = (id: string): Lieu =>
  lieux.find((l) => l.id === id) ?? lieuxConnus.get(id) ?? { id, nom: 'Adresse', detail: '', type: 'adresse', lat: 0, lon: 0 };
export const estTransfert = (l?: Lieu) => !!l && (l.type === 'aeroport' || l.type === 'gare');

// Itinéraires réels (IGN) déjà calculés, par couple de positions.
export type Itineraire = { km: number; minutes: number; coords: [number, number][] };
const itineraires = new Map<string, Itineraire>();
const cle = (a: Lieu, b: Lieu) => `${a.lat.toFixed(5)},${a.lon.toFixed(5)}>${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;
export const itineraireEnCache = (a: Lieu, b: Lieu) => itineraires.get(cle(a, b));
export const memoriserItineraire = (a: Lieu, b: Lieu, it: Itineraire) => { itineraires.set(cle(a, b), it); return it; };

// Distance et durée : l'itinéraire IGN s'il est connu, sinon une estimation (vol d'oiseau × 1,25)
// qui ne sert qu'en démonstration hors ligne. Pour une vraie demande, la base recalcule toujours.
export function trajet(a: Lieu, b: Lieu) {
  const it = itineraireEnCache(a, b);
  if (it) return { km: it.km, minutes: it.minutes };
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  const km = Math.max(3, Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.25 * 10) / 10);
  const minutes = Math.round(km / (km > 30 ? 75 : 45) * 60 + 5);
  return { km, minutes };
}

// Règles de prix. Valeurs du site par défaut ; remplacées par celles de la base (table parametres)
// dès que l'appli est connectée, pour que Fabrice puisse les changer sans nouvelle version.
export const regles = {
  nuitDebut: 22,
  nuitFin: 6,
  majorationWeekend: true,
  coefAllerRetour: 1.9,
  arrondi: 0.5,
  attenteAeroportMin: 30,
  attenteGareMin: 15,
  attenteStandardMin: 10,
  delaiConfirmationMin: 30,
  acomptePourcent: 10, // acompte demandé à l'acceptation (0 = aucun)
  acompteDelaiMin: 60, // délai pour le régler
  paiementsTest: false, // mode test : paiements simulés, faux argent
};

export const joursFeries = [
  '2026-01-01', '2026-04-06', '2026-05-01', '2026-05-08', '2026-05-14', '2026-05-25', '2026-07-14',
  '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25', '2027-01-01', '2027-03-29', '2027-05-01',
  '2027-05-06', '2027-05-08', '2027-05-17', '2027-07-14', '2027-08-15', '2027-11-01', '2027-11-11',
  '2027-12-25',
];

// Tarifs reçus de la base : met à jour les offres, les règles et les jours fériés en place.
export type TarifsServeur = {
  offres: { id: string; prix_km_jour: number; prix_km_majore: number; minimum: number; passagers_max: number; bagages_max: number }[];
  parametres: {
    nuit_debut: number; nuit_fin: number; majoration_weekend: boolean; coef_aller_retour: number; arrondi: number;
    attente_aeroport_min: number; attente_gare_min: number; attente_standard_min: number; delai_confirmation_min: number;
    acompte_pourcent?: number; acompte_delai_min?: number; paiements_test?: boolean;
  } | null;
  joursFeries: string[];
};
export function appliquerTarifs(t: TarifsServeur) {
  for (const o of t.offres) {
    const locale = offres.find((x) => x.id === o.id);
    if (!locale) continue;
    locale.prixKmJour = Number(o.prix_km_jour);
    locale.prixKmMajore = Number(o.prix_km_majore);
    locale.minimum = Number(o.minimum);
    locale.passagersMax = o.passagers_max;
    locale.bagagesMax = o.bagages_max;
  }
  const p = t.parametres;
  if (p) {
    Object.assign(regles, {
      nuitDebut: p.nuit_debut, nuitFin: p.nuit_fin, majorationWeekend: p.majoration_weekend,
      coefAllerRetour: Number(p.coef_aller_retour), arrondi: Number(p.arrondi),
      attenteAeroportMin: p.attente_aeroport_min, attenteGareMin: p.attente_gare_min,
      attenteStandardMin: p.attente_standard_min, delaiConfirmationMin: p.delai_confirmation_min,
    });
    // Sans la migration 8, la base ne connaît pas l'acompte : aucun n'est demandé.
    regles.acomptePourcent = p.acompte_pourcent ?? 0;
    if (p.acompte_delai_min) regles.acompteDelaiMin = p.acompte_delai_min;
    regles.paiementsTest = !!p.paiements_test;
  }
  if (t.joursFeries.length) joursFeries.splice(0, joursFeries.length, ...t.joursFeries);
}

export const isoJour = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function majoration(date: Date, heure: string) {
  const h = parseInt(heure.split(':')[0], 10);
  const raisons: string[] = [];
  if (h >= regles.nuitDebut || h < regles.nuitFin) raisons.push(t('nuit ({debut}h–{fin}h)', { debut: regles.nuitDebut, fin: regles.nuitFin }));
  const j = date.getDay();
  if (regles.majorationWeekend && j === 6) raisons.push(t('samedi'));
  if (regles.majorationWeekend && j === 0) raisons.push(t('dimanche'));
  if (joursFeries.includes(isoJour(date))) raisons.push(t('jour férié'));
  return raisons;
}

// Même calcul que la fonction calculer_prix de la base : l'appli affiche, la base fait foi.
export function prix(o: Offre, km: number, date: Date, heure: string, allerRetour: boolean) {
  const raisons = majoration(date, heure);
  const prixKm = raisons.length ? o.prixKmMajore : o.prixKmJour;
  let p = km * prixKm;
  if (allerRetour) p *= regles.coefAllerRetour;
  const auMinimum = p < o.minimum;
  p = Math.max(p, o.minimum);
  p = Math.round(p / regles.arrondi) * regles.arrondi;
  return { montant: p, prixKm, raisons, auMinimum };
}

// Formats : français (93,50 €, « lun. 12 nov. », 14h30) ou anglais (€93.50, « Mon 12 Nov », 14:30).
const nombre = (n: number, decimales: number) =>
  n.toLocaleString(anglais() ? 'en-GB' : 'fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
export const euros = (n: number) => (anglais() ? `€${nombre(n, 2)}` : `${nombre(n, 2)} €`);
export const kilometres = (km: number) => `${km.toLocaleString(anglais() ? 'en-GB' : 'fr-FR')} km`;

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateCourte = (d: Date) =>
  anglais() ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` : `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
/** « 14:30 » (heure saisie) affichée « 14h30 » en français, « 14:30 » en anglais. */
export const heureAffichee = (h: string) => (anglais() ? h : h.replace(':', 'h'));
export const duree = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;

export const prestations = [
  {
    titre: 'Transferts aéroports et gares',
    icone: 'airplane-outline',
    texte:
      'Prise en charge à Toulouse-Blagnac et aux gares d’Albi, Castres et Carcassonne. Votre vol est suivi en temps réel.',
    points: ['Suivi des vols en temps réel', 'Accueil avec panneau nominatif', 'Aide aux bagages', 'Attente gratuite de 30 min'],
    reservable: true,
  },
  {
    titre: 'Transport professionnel',
    icone: 'briefcase-outline',
    texte: 'Un bureau mobile climatisé pour vos déplacements d’affaires, entre deux rendez-vous.',
    points: ['Ponctualité garantie', 'Discrétion et confidentialité', 'Wi-Fi à bord sur demande', 'Facturation entreprise'],
    reservable: true,
  },
  {
    titre: 'Mise à disposition',
    icone: 'time-outline',
    texte: 'Votre chauffeur reste à disposition pour votre événement : mariage, gala, séminaire, shopping.',
    points: ['Véhicule dédié journée ou soirée', 'Itinéraire flexible', 'Devis personnalisé', 'Décoration du véhicule (mariages)'],
    reservable: false,
  },
  {
    titre: 'Longue distance',
    icone: 'map-outline',
    texte: 'Vol annulé, achat de véhicule, déplacement prévu : partout en France, dans le meilleur confort.',
    points: ['Trajets partout en France', 'Arrêts intermédiaires possibles', 'Tarif dégressif selon distance', 'Confort longue durée'],
    reservable: true,
  },
] as const;

export const valeurs = [
  { titre: 'Ponctualité', texte: 'Toujours en avance, pour que vous n’ayez jamais à attendre.' },
  { titre: 'Excellence', texte: 'Véhicules impeccables, conduite souple, attention aux détails.' },
  { titre: 'Confiance', texte: 'Transparence tarifaire, discrétion totale, relation fondée sur le respect.' },
];

// Avis affichés sur volant3ranches-vtc.fr (source à confirmer avec Fabrice).
export const avis = [
  {
    nom: 'Marie G.',
    contexte: 'Transfert aéroport Toulouse',
    texte:
      'Service impeccable du début à la fin. Véhicule parfaitement propre, chauffeur ponctuel et très professionnel. Je recommande sans hésitation.',
  },
  {
    nom: 'Philippe T.',
    contexte: 'Mise à disposition entreprise',
    texte:
      'Fabrice est toujours disponible et arrangeant. Le Van est parfait pour nos déplacements en groupe. Tarifs transparents, aucune mauvaise surprise.',
  },
  {
    nom: 'Sophie C.',
    contexte: 'Transport professionnel, Albi',
    texte:
      'Première expérience en Tesla pour un trajet pro et je suis conquis. Silencieux, confortable, et un chauffeur aux petits soins. Top !',
  },
];

export const faq = [
  {
    q: 'Comment réserver un trajet ?',
    r: 'Depuis l’application, par téléphone ou par email. Fabrice confirme votre réservation sous 30 minutes.',
  },
  {
    q: 'Quels sont vos tarifs ?',
    r: 'Au kilomètre : à partir de 1,80 €/km pour la Tesla Model 3 (minimum 20 €) et 2,60 €/km pour le Van 9 places (minimum 35 €). Majoration la nuit (22h–6h), le week-end et les jours fériés. Aucun frais caché.',
  },
  {
    q: 'Quelle est votre zone d’intervention ?',
    r: 'Principalement le Tarn (Albi, Castres, Gaillac, Lavaur) et Toulouse. Longues distances partout en France.',
  },
  {
    q: 'Combien de temps le chauffeur m’attend-il ?',
    r: 'Attente gratuite : 10 minutes pour une prise en charge standard, 30 minutes après l’atterrissage à l’aéroport et 15 minutes en gare. Au-delà, des frais d’attente peuvent s’appliquer.',
  },
  {
    q: 'Mon vol ou mon train a du retard ?',
    r: 'Indiquez votre numéro de vol ou de train : Fabrice suit l’horaire et ajuste la prise en charge sans frais, dans la limite des disponibilités.',
  },
  {
    q: 'Puis-je annuler ?',
    r: 'Gratuit plus de 24 h avant la course, 50 % du montant entre 24 h et 12 h, 100 % à moins de 12 h ou en cas d’absence.',
  },
  {
    q: 'Que peut-on faire à bord ?',
    r: 'Il est interdit de fumer, de consommer de l’alcool ou des substances illicites et de transporter des objets dangereux.',
  },
];

export const fabrice = {
  nom: 'Fabrice Legouez Ricoce',
  prenom: 'Fabrice',
  bio: 'Chauffeur VTC certifié et passionné, Fabrice met son expérience et son sens du service au profit de chaque client. Basé dans le Tarn, il dessert Albi, Castres, Toulouse et toute la région Occitanie.',
  objectif:
    'Son objectif : offrir une expérience de transport irréprochable, alliant ponctualité, discrétion et confort.',
};

export function fraisAnnulation(depart: Date, maintenant = new Date()) {
  const heures = (depart.getTime() - maintenant.getTime()) / 36e5;
  if (heures > 24) return { taux: 0, texte: t('Annulation gratuite (plus de 24 h avant la course).') };
  if (heures > 12) return { taux: 0.5, texte: t('Annulation entre 24 h et 12 h : 50 % du montant.') };
  return { taux: 1, texte: t('Moins de 12 h avant la course : 100 % du montant.') };
}

// Montant de l'acompte pour un prix (même calcul que la fonction montant_acompte de la base).
export const montantAcompte = (prixCourse: number) =>
  regles.acomptePourcent > 0 ? Math.max(1, Math.round(prixCourse * regles.acomptePourcent) / 100) : 0;
