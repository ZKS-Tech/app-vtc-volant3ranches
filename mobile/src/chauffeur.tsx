import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { Lieu, OffreId, appliquerTarifs, euros, lieu, trajet } from './data';
import {
  Fiche, LigneCourse, ajouterFerie, chargerEspaceChauffeur, chargerTarifs, ecouterEspaceChauffeur, enregistrerFiche,
  majTable, retirerFerie, rpcChauffeur,
  lienAcompte as lienAcompteServeur, rembourserTout, emettreFacture, ModePaiement,
} from './serveur';
import { dansJours, useStore } from './store';

// Espace chauffeur : toutes les courses, le carnet de clients et les réglages de Fabrice.
// Données du serveur, mises à jour en temps réel.

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
  /** Lien de paiement de l'acompte à envoyer au client. */
  lienAcompte: (id: string) => Promise<string | null>;
  rembourser: (id: string) => Promise<number>;
  /** Course effectuée (ou frais d'annulation) : facture émise avec le mode de paiement. */
  facturer: (id: string, mode: ModePaiement) => Promise<void>;
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
  const { recalculerTarifs } = useStore();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string>();
  const [saisie, setSaisie] = useState<Saisie>(saisieVide);
  const [annonce, setAnnonce] = useState<{ id: number; texte: string } | null>(null);
  const annoncer = useCallback((texte: string) => setAnnonce({ id: Date.now(), texte }), []);

  const fusionMission = useCallback((m: Mission) => setMissions((ms) => (ms.some((x) => x.id === m.id) ? ms.map((x) => (x.id === m.id ? m : x)) : [m, ...ms])), []);
  const fusionFiche = useCallback((f: Fiche) => setFiches((fs) => (fs.some((x) => x.id === f.id) ? fs.map((x) => (x.id === f.id ? f : x)) : [...fs, f])), []);

  const recharger = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    recharger();
    const canal = ecouterEspaceChauffeur((c) => fusionMission(versMission(c)), fusionFiche);
    // Retour au premier plan : le temps réel a pu être coupé pendant la mise en veille.
    const abo = AppState.addEventListener('change', (etat) => { if (etat === 'active') recharger(); });
    return () => { canal?.unsubscribe(); abo.remove(); };
  }, []);

  // Mise à jour locale immédiate (le temps réel confirme ensuite).
  const local = (id: string, p: Partial<Mission>) => setMissions((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));
  const maintenant = () => new Date().toISOString();

  const value = useMemo<Ctx>(() => ({
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
      const m = versMission(await rpcChauffeur('repondre_demande', { p_course: id, p_accepter: accepter, p_motif: motif ?? null }));
      const statut = m.statut;
      fusionMission(m);
      annoncer(statut === 'acompte_attendu'
        ? `Demande acceptée : ${nom} doit régler l'acompte pour confirmer. Vous serez prévenu.`
        : statut === 'confirmee'
        ? `Course confirmée : ${nom} voit la confirmation dans l'appli.`
        : `Demande refusée : ${nom} voit le motif « ${motif ?? 'non précisé'} » dans l'appli.`);
    },
    terminer: async (id) => {
      fusionMission(versMission(await rpcChauffeur('terminer_course', { p_course: id })));
    },
    annuler: async (id, frais) => {
      const m = versMission(await rpcChauffeur('annuler_course_chauffeur', { p_course: id, p_frais: frais }));
      fusionMission(m);
      // Annulation par Fabrice : l'acompte est rendu en entier.
      if (m.acompte_paye_le) {
        const r = await rembourserTout(id).catch((e) => { annoncer(`Remboursement à refaire : ${e instanceof Error ? e.message : e}`); return null; });
        if (r) annoncer(`Acompte de ${euros(r)} remboursé à ${m.nom}.`);
      }
    },
    lienAcompte: async (id) => {
      const r = await lienAcompteServeur(id);
      if (r.deja_paye) throw new Error('L’acompte de cette course est déjà réglé.');
      return r.url ?? null;
    },
    facturer: async (id, mode) => {
      const m0 = missions.find((m) => m.id === id);
      const d = await emettreFacture(id, mode);
      if (m0?.statut === 'confirmee') local(id, { statut: 'terminee', terminee_le: maintenant() });
      annoncer(`Facture ${d.numero} émise (${euros(Number(d.total_ttc))}).`);
    },
    rembourser: (id) => rembourserTout(id),
    noter: async (id, note) => {
      fusionMission(versMission(await rpcChauffeur('noter_course', { p_course: id, p_note: note })));
    },
    sauverFiche: async (f) => {
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
      await majTable('offres', id, v);
      appliquerTarifs(await chargerTarifs());
      recalculerTarifs();
    },
    majParametres: async (v) => {
      await majTable('parametres', 1, v);
      appliquerTarifs(await chargerTarifs());
      recalculerTarifs();
    },
    ajouterJourFerie: async (jour) => {
      await ajouterFerie(jour);
      appliquerTarifs(await chargerTarifs());
      recalculerTarifs();
    },
    retirerJourFerie: async (jour) => {
      await retirerFerie(jour);
      appliquerTarifs(await chargerTarifs());
      recalculerTarifs();
    },
  }), [chargement, erreur, missions, fiches, saisie, recharger, annonce]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export const useChauffeur = () => useContext(C)!;
// Hors de l'espace chauffeur (côté client), renvoie null.
export const useChauffeurOptionnel = () => useContext(C);

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
