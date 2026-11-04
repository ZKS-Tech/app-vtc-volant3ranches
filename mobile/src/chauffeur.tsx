import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Lieu, OffreId, appliquerTarifs, joursFeries, lieu, lieux, offre, prix, regles, trajet } from './data';
import {
  Fiche, LigneCourse, ajouterFerie, chargerEspaceChauffeur, chargerTarifs, ecouterEspaceChauffeur, enregistrerFiche,
  majTable, normaliserTelephone, retirerFerie, rpcChauffeur,
} from './serveur';
import { dansJours, useStore } from './store';

// Espace chauffeur : toutes les courses, le carnet de clients et les réglages de Fabrice.
// Données du serveur (temps réel) ou, sans compte, un jeu de démonstration local.

export type Mission = LigneCourse & { date: Date };
export type Source = LigneCourse['source'];

export type Saisie = {
  ficheId?: string;
  nom: string;
  telephone: string;
  email: string;
  departId?: string;
  arriveeId?: string;
  jour: Date;
  heure: string;
  allerRetour: boolean;
  passagers: number;
  bagages: number;
  numero: string;
  offreId: OffreId;
  source: Source;
  prixAjuste: string;
  commentaire: string;
};

const saisieVide = (): Saisie => ({
  nom: '', telephone: '', email: '', jour: dansJours(1), heure: '09:00', allerRetour: false, passagers: 1, bagages: 1,
  numero: '', offreId: 'tesla', source: 'telephone', prixAjuste: '', commentaire: '',
});

const versMission = (l: LigneCourse): Mission => ({ ...l, montant: Number(l.montant), distance_km: Number(l.distance_km), date: new Date(l.date_heure) });

export const lieuJson = (l: Lieu) => ({ ref: l.id, libelle: l.nom, detail: l.detail, type: l.type, lat: l.lat, lon: l.lon });

type Ctx = {
  demo: boolean;
  chargement: boolean;
  erreur?: string;
  missions: Mission[];
  fiches: Fiche[];
  fiche: (id?: string | null) => Fiche | undefined;
  missionsDe: (ficheId: string) => Mission[];
  recharger: () => Promise<void>;
  annonce: { id: number; texte: string } | null;
  annoncer: (texte: string) => void;
  repondre: (id: string, accepter: boolean, motif?: string) => Promise<void>;
  terminer: (id: string) => Promise<void>;
  annuler: (id: string, frais: number) => Promise<void>;
  noter: (id: string, note: string) => Promise<void>;
  sauverFiche: (f: Partial<Fiche> & { nom: string }) => Promise<Fiche>;
  saisie: Saisie;
  majSaisie: (p: Partial<Saisie>) => void;
  viderSaisie: (p?: Partial<Saisie>) => void;
  enregistrerSaisie: () => Promise<Mission>;
  majOffre: (id: OffreId, valeurs: { prix_km_jour: number; prix_km_majore: number; minimum: number }) => Promise<void>;
  majParametres: (valeurs: Record<string, number | boolean>) => Promise<void>;
  ajouterJourFerie: (jour: string) => Promise<void>;
  retirerJourFerie: (jour: string) => Promise<void>;
};

const C = createContext<Ctx | null>(null);

export function ChauffeurProvider({ children }: { children: ReactNode }) {
  const { demoChauffeur, recalculerTarifs } = useStore();
  const demo = demoChauffeur;
  const [missions, setMissions] = useState<Mission[]>(() => (demo ? donneesDemo().missions : []));
  const [fiches, setFiches] = useState<Fiche[]>(() => (demo ? donneesDemo().fiches : []));
  const [chargement, setChargement] = useState(!demo);
  const [erreur, setErreur] = useState<string>();
  const [saisie, setSaisie] = useState<Saisie>(saisieVide);
  const [annonce, setAnnonce] = useState<{ id: number; texte: string } | null>(null);
  const annoncer = useCallback((texte: string) => setAnnonce({ id: Date.now(), texte }), []);

  const fusionMission = useCallback((m: Mission) => setMissions((ms) => (ms.some((x) => x.id === m.id) ? ms.map((x) => (x.id === m.id ? m : x)) : [m, ...ms])), []);
  const fusionFiche = useCallback((f: Fiche) => setFiches((fs) => (fs.some((x) => x.id === f.id) ? fs.map((x) => (x.id === f.id ? f : x)) : [...fs, f])), []);

  const recharger = useCallback(async () => {
    if (demo) return;
    try {
      const d = await chargerEspaceChauffeur();
      setMissions(d.courses.map(versMission));
      setFiches(d.fiches);
      setErreur(undefined);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  }, [demo]);

  useEffect(() => {
    if (demo) return;
    recharger();
    const canal = ecouterEspaceChauffeur((c) => fusionMission(versMission(c)), fusionFiche);
    return () => { canal?.unsubscribe(); };
  }, [demo]);

  // En démonstration, les actions modifient les données locales.
  const local = (id: string, p: Partial<Mission>) => setMissions((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));
  const maintenant = () => new Date().toISOString();

  const value = useMemo<Ctx>(() => ({
    demo,
    chargement,
    erreur,
    missions,
    fiches,
    fiche: (id) => fiches.find((f) => f.id === id),
    missionsDe: (ficheId) => missions.filter((m) => m.fiche_id === ficheId).sort((a, b) => +b.date - +a.date),
    recharger,
    annonce,
    annoncer,
    repondre: async (id, accepter, motif) => {
      const nom = missions.find((m) => m.id === id)?.nom ?? 'le client';
      if (demo) local(id, accepter ? { statut: 'confirmee', confirmee_le: maintenant() } : { statut: 'refusee', refusee_le: maintenant(), motif_refus: motif ?? null });
      else fusionMission(versMission(await rpcChauffeur('repondre_demande', { p_course: id, p_accepter: accepter, p_motif: motif ?? null })));
      annoncer(accepter
        ? `Course confirmée : ${nom} voit la confirmation dans l'appli.`
        : `Demande refusée : ${nom} voit le motif « ${motif ?? 'non précisé'} » dans l'appli.`);
    },
    terminer: async (id) => {
      if (demo) return local(id, { statut: 'terminee', terminee_le: maintenant() });
      fusionMission(versMission(await rpcChauffeur('terminer_course', { p_course: id })));
    },
    annuler: async (id, frais) => {
      if (demo) return local(id, { statut: 'annulee', annulee_le: maintenant(), frais_annulation: frais });
      fusionMission(versMission(await rpcChauffeur('annuler_course_chauffeur', { p_course: id, p_frais: frais })));
    },
    noter: async (id, note) => {
      if (demo) return local(id, { note_chauffeur: note.trim() || null });
      fusionMission(versMission(await rpcChauffeur('noter_course', { p_course: id, p_note: note })));
    },
    sauverFiche: async (f) => {
      if (demo) {
        const norm = normaliserTelephone(f.telephone);
        if (norm && fiches.some((x) => x.id !== f.id && normaliserTelephone(x.telephone) === norm)) {
          throw new Error('Un client avec ce numéro de téléphone existe déjà');
        }
        const existante = fiches.find((x) => x.id === f.id);
        const nouvelle: Fiche = {
          id: f.id ?? `demo-f-${Date.now()}`, nom: f.nom.trim(), telephone: f.telephone?.trim() || null, email: f.email?.trim() || null,
          notes: f.notes?.trim() || null, profil_id: existante?.profil_id ?? null, cree_le: existante?.cree_le ?? maintenant(), maj_le: maintenant(),
        };
        fusionFiche(nouvelle);
        return nouvelle;
      }
      const r = await enregistrerFiche(f);
      fusionFiche(r);
      return r;
    },
    saisie,
    majSaisie: (p) => setSaisie((s) => ({ ...s, ...p })),
    viderSaisie: (p) => setSaisie({ ...saisieVide(), ...p }),
    enregistrerSaisie: async () => {
      const s = saisie;
      if (!s.departId || !s.arriveeId) throw new Error('Choisissez le départ et l’arrivée');
      if (!s.ficheId && s.nom.trim().length < 2) throw new Error('Indiquez le nom du client');
      const [h, mi] = s.heure.split(':').map(Number);
      const d = new Date(s.jour); d.setHours(h, mi, 0, 0);
      const t = trajet(lieu(s.departId), lieu(s.arriveeId));
      const ajuste = s.prixAjuste.trim() ? Number(s.prixAjuste.replace(',', '.')) : null;
      if (ajuste !== null && !(ajuste > 0)) throw new Error('Le prix ajusté doit être un montant positif');
      if (demo) {
        let f = fiches.find((x) => x.id === s.ficheId);
        if (!f) f = await value.sauverFiche({ nom: s.nom, telephone: s.telephone, email: s.email });
        const calc = prix(offre(s.offreId), t.km, s.jour, s.heure, s.allerRetour);
        const m = ligneDemo({
          id: `demo-${Date.now()}`, fiche: f, depart: lieu(s.departId), arrivee: lieu(s.arriveeId), date: d, offreId: s.offreId,
          statut: 'confirmee', source: s.source, passagers: s.passagers, bagages: s.bagages, numero: s.numero, allerRetour: s.allerRetour,
          montant: ajuste ?? calc.montant, commentaire: s.commentaire,
        });
        m.prix_ajuste = ajuste !== null && ajuste !== calc.montant;
        fusionMission(m);
        return m;
      }
      const r = versMission(await rpcChauffeur('creer_course_manuelle', {
        p_fiche: s.ficheId ?? null, p_nom: s.nom, p_telephone: s.telephone, p_email: s.email,
        p_depart: lieuJson(lieu(s.departId)), p_arrivee: lieuJson(lieu(s.arriveeId)), p_date_heure: d.toISOString(),
        p_aller_retour: s.allerRetour, p_passagers: s.passagers, p_bagages: s.bagages, p_numero: s.numero, p_offre: s.offreId,
        p_distance_km: t.km, p_duree_min: t.minutes, p_montant: ajuste, p_source: s.source, p_commentaire: s.commentaire,
      }));
      fusionMission(r);
      return r;
    },
    majOffre: async (id, v) => {
      if (!demo) await majTable('offres', id, v);
      const o = offre(id);
      o.prixKmJour = v.prix_km_jour; o.prixKmMajore = v.prix_km_majore; o.minimum = v.minimum;
      if (!demo) appliquerTarifs(await chargerTarifs());
      recalculerTarifs();
    },
    majParametres: async (v) => {
      if (!demo) { await majTable('parametres', 1, v); appliquerTarifs(await chargerTarifs()); }
      else Object.assign(regles, {
        nuitDebut: v.nuit_debut ?? regles.nuitDebut, nuitFin: v.nuit_fin ?? regles.nuitFin,
        majorationWeekend: v.majoration_weekend ?? regles.majorationWeekend,
        attenteAeroportMin: v.attente_aeroport_min ?? regles.attenteAeroportMin,
        attenteGareMin: v.attente_gare_min ?? regles.attenteGareMin,
        attenteStandardMin: v.attente_standard_min ?? regles.attenteStandardMin,
      });
      recalculerTarifs();
    },
    ajouterJourFerie: async (jour) => {
      if (!demo) { await ajouterFerie(jour); appliquerTarifs(await chargerTarifs()); }
      else if (!joursFeries.includes(jour)) { joursFeries.push(jour); joursFeries.sort(); }
      recalculerTarifs();
    },
    retirerJourFerie: async (jour) => {
      if (!demo) { await retirerFerie(jour); appliquerTarifs(await chargerTarifs()); }
      else if (joursFeries.includes(jour)) joursFeries.splice(joursFeries.indexOf(jour), 1);
      recalculerTarifs();
    },
  }), [demo, chargement, erreur, missions, fiches, saisie, recharger, annonce]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export const useChauffeur = () => useContext(C)!;

// ——— Calculs pour le tableau de bord et le chiffre d'affaires ———

export const estAujourdhui = (d: Date) => new Date().toDateString() === d.toDateString();
export const memeJour = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// Recette d'une course : son prix si elle est terminée, les frais si elle a été annulée.
export const recette = (m: Mission) =>
  m.statut === 'terminee' ? m.montant : m.statut === 'annulee' ? Number(m.frais_annulation ?? 0) : 0;

export function bilan(missions: Mission[], debut: Date, fin: Date) {
  const dans = missions.filter((m) => m.date >= debut && m.date < fin);
  const faites = dans.filter((m) => m.statut === 'terminee');
  const aVenir = dans.filter((m) => m.statut === 'confirmee');
  const annulees = dans.filter((m) => m.statut === 'annulee');
  const ca = dans.reduce((s, m) => s + recette(m), 0);
  return {
    ca,
    aVenir: aVenir.reduce((s, m) => s + m.montant, 0),
    courses: faites.length,
    km: faites.reduce((s, m) => s + m.distance_km * (m.aller_retour ? 2 : 1), 0),
    panier: faites.length ? faites.reduce((s, m) => s + m.montant, 0) / faites.length : 0,
    annulees: annulees.length,
    frais: annulees.reduce((s, m) => s + Number(m.frais_annulation ?? 0), 0),
    parOffre: (['tesla', 'van'] as OffreId[]).map((o) => ({ offre: o, ca: faites.filter((m) => m.offre_id === o).reduce((s, m) => s + m.montant, 0) })),
    parSource: (['appli', 'telephone', 'email', 'autre'] as Source[]).map((src) => ({ source: src, n: dans.filter((m) => m.source === src && m.statut !== 'refusee').length })),
  };
}

export const libelleSource: Record<Source, string> = { appli: 'Appli', telephone: 'Téléphone', email: 'Email', autre: 'Autre' };

// ——— Jeu de démonstration (sans compte) ———

function ligneDemo(p: {
  id: string; fiche: Fiche; depart: Lieu; arrivee: Lieu; date: Date; offreId: OffreId; statut: Mission['statut'];
  source: Source; passagers?: number; bagages?: number; numero?: string; allerRetour?: boolean; montant?: number;
  commentaire?: string; envoyeeIlYaMin?: number; frais?: number;
}): Mission {
  const t = trajet(p.depart, p.arrivee);
  const heure = `${String(p.date.getHours()).padStart(2, '0')}:${String(p.date.getMinutes()).padStart(2, '0')}`;
  const calc = prix(offre(p.offreId), t.km, p.date, heure, !!p.allerRetour);
  const envoi = new Date(p.envoyeeIlYaMin !== undefined ? Date.now() - p.envoyeeIlYaMin * 60000 : p.date.getTime() - 3 * 864e5);
  return {
    id: p.id, client_id: p.fiche.profil_id, fiche_id: p.fiche.id, source: p.source,
    depart_ref: p.depart.id, depart_libelle: p.depart.nom, depart_detail: p.depart.detail, depart_type: p.depart.type, depart_lat: p.depart.lat, depart_lon: p.depart.lon,
    arrivee_ref: p.arrivee.id, arrivee_libelle: p.arrivee.nom, arrivee_detail: p.arrivee.detail, arrivee_type: p.arrivee.type, arrivee_lat: p.arrivee.lat, arrivee_lon: p.arrivee.lon,
    date_heure: p.date.toISOString(), date: p.date, aller_retour: !!p.allerRetour, passagers: p.passagers ?? 1, bagages: p.bagages ?? 1,
    numero_vol_train: p.numero || null, offre_id: p.offreId, montant: p.montant ?? calc.montant, prix_ajuste: false, prix_km: calc.prixKm,
    majorations: calc.raisons, distance_km: t.km, duree_min: t.minutes, nom: p.fiche.nom, telephone: p.fiche.telephone ?? '', email: p.fiche.email,
    commentaire: p.commentaire || null, note_chauffeur: null, statut: p.statut, envoyee_le: envoi.toISOString(),
    confirmee_le: ['confirmee', 'terminee'].includes(p.statut) ? new Date(envoi.getTime() + 12 * 60000).toISOString() : null,
    refusee_le: null, motif_refus: null, annulee_le: p.statut === 'annulee' ? envoi.toISOString() : null,
    frais_annulation: p.statut === 'annulee' ? p.frais ?? 0 : null, terminee_le: p.statut === 'terminee' ? p.date.toISOString() : null,
  };
}

let cacheDemo: { missions: Mission[]; fiches: Fiche[] } | null = null;
function donneesDemo() {
  if (cacheDemo) return cacheDemo;
  const f = (id: string, nom: string, telephone: string, email: string | null, notes: string | null, appli = true): Fiche => ({
    id, nom, telephone, email, notes, profil_id: appli ? `p-${id}` : null, cree_le: dansJours(-90).toISOString(), maj_le: dansJours(-2).toISOString(),
  });
  const fiches = [
    f('f1', 'Claire Martin', '06 12 34 56 78', 'claire.martin@exemple.fr', 'Voyage souvent pour le travail, préfère la Tesla.'),
    f('f2', 'Thomas Bernard', '06 23 45 67 89', 'thomas.bernard@exemple.fr', null),
    f('f3', 'Société Agri-Tarn (M. Roux)', '05 63 00 11 22', 'contact@agri-tarn.exemple.fr', 'Facturation entreprise en fin de mois.', false),
    f('f4', 'Famille Garcia', '07 34 56 78 90', null, 'Siège enfant (3 ans) à prévoir.', false),
    f('f5', 'Hélène Dubois', '06 45 67 89 01', 'helene.dubois@exemple.fr', null),
    f('f6', 'Julien Moreau', '06 56 78 90 12', 'julien.moreau@exemple.fr', null),
    f('f7', 'Mariage Lacombe', '06 67 89 01 23', 'lacombe.mariage@exemple.fr', 'Mise à disposition le 19 décembre, devis envoyé.', false),
  ];
  const quand = (jours: number, h: number, m = 0) => { const d = dansJours(jours); d.setHours(h, m, 0, 0); return d; };
  const L = (id: string) => lieux.find((x) => x.id === id)!;
  const missions: Mission[] = [];
  let n = 0;
  const ajout = (fi: number, a: string, b: string, date: Date, offreId: OffreId, statut: Mission['statut'], source: Source, extra: Partial<Parameters<typeof ligneDemo>[0]> = {}) =>
    missions.push(ligneDemo({ id: `demo-${++n}`, fiche: fiches[fi], depart: L(a), arrivee: L(b), date, offreId, statut, source, ...extra }));

  // À traiter
  ajout(4, 'castres', 'tls', quand(2, 6, 15), 'tesla', 'envoyee', 'appli', { numero: 'AF 6129', envoyeeIlYaMin: 7, bagages: 2 });
  ajout(5, 'albi-gare', 'gaillac', quand(1, 19, 30), 'tesla', 'envoyee', 'appli', { envoyeeIlYaMin: 24 });
  // Aujourd'hui et à venir
  const hNow = new Date().getHours();
  ajout(0, 'albi', 'tls', quand(0, Math.min(22, hNow + 2), 30), 'tesla', 'confirmee', 'appli', { numero: 'AF 6131', bagages: 2 });
  ajout(2, 'castres-gare', 'matabiau', quand(0, Math.min(23, hNow + 5), 0), 'tesla', 'confirmee', 'telephone');
  ajout(3, 'lavaur', 'tls', quand(1, 5, 45), 'van', 'confirmee', 'telephone', { passagers: 5, bagages: 6, numero: 'U2 4421', commentaire: 'Siège enfant' });
  ajout(1, 'tls', 'albi', quand(3, 22, 10), 'tesla', 'confirmee', 'appli', { numero: 'AF 7782' });
  ajout(6, 'albi', 'castres', quand(5, 14, 0), 'van', 'confirmee', 'email', { passagers: 7, bagages: 2 });
  ajout(0, 'tls', 'albi', quand(6, 21, 40), 'tesla', 'confirmee', 'appli');
  // Passé : terminées, annulées
  const trajets: [number, string, string, OffreId][] = [
    [0, 'albi', 'tls', 'tesla'], [1, 'castres', 'tls', 'tesla'], [2, 'castres', 'carcassonne', 'tesla'], [3, 'lavaur', 'matabiau', 'van'],
    [4, 'albi-gare', 'albi', 'tesla'], [5, 'gaillac', 'tls', 'tesla'], [2, 'castres', 'albi', 'tesla'], [0, 'tls', 'albi', 'tesla'],
    [1, 'mazamet', 'tls', 'van'], [5, 'graulhet', 'castres-gare', 'tesla'], [2, 'castres', 'tls', 'tesla'], [4, 'revel', 'tls', 'tesla'],
  ];
  for (let j = 1; j <= 40; j++) {
    if (j % 3 === 0) continue;
    const [fi, a, b, o] = trajets[j % trajets.length];
    ajout(fi, a, b, quand(-j, 6 + ((j * 5) % 15), (j * 7) % 60), o, 'terminee', j % 4 === 0 ? 'telephone' : 'appli');
  }
  ajout(5, 'albi', 'tls', quand(-6, 8, 0), 'tesla', 'annulee', 'appli', { frais: 0 });
  ajout(1, 'castres', 'tls', quand(-15, 5, 30), 'tesla', 'annulee', 'appli', { frais: 64 });
  cacheDemo = { missions, fiches };
  return cacheDemo;
}
