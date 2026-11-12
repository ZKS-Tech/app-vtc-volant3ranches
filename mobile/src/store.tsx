import { activerNotifications, oublierTelephone } from './notifications';
import { evenement, oublierIdentifiant } from './stats';
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { OffreId, appliquerTarifs, lieu, offre, prix, trajet } from './data';
import {
  annulerCourse, chargerTarifs, lienAcompte, payerAcompteTest, rembourserTout,
  Profil, reinitialiserMotDePasse as reinitialiserServeur, connecterClient as connecterClientServeur, creerCompte as creerCompteServeur, majProfil as majProfilServeur, monProfil, sessionActuelle, connexionInvite, creerDemande, deconnexion, supprimerCompte as supprimerCompteServeur, ecouterMesCourses,
  estChauffeur, mesCourses, supabase,
} from './serveur';

export type Statut = 'envoyee' | 'acompte_attendu' | 'confirmee' | 'refusee' | 'expiree' | 'terminee' | 'annulee';

export type Course = {
  id: string;
  departId: string;
  arriveeId: string;
  date: Date; // jour + heure
  heure: string;
  allerRetour: boolean;
  passagers: number;
  bagages: number;
  numero?: string;
  offreId: OffreId;
  montant: number;
  km: number;
  minutes: number;
  nom: string;
  statut: Statut;
  envoyeeLe?: Date; // heure d'envoi de la demande : sert au délai de confirmation
  motifRefus?: string; // raison donnée par Fabrice quand il refuse
  acompteMontant?: number; // acompte demandé quand Fabrice accepte (10 % par défaut)
  acompteLimite?: Date; // à régler avant cette heure, sinon la demande expire
  acomptePaye?: boolean;
  demo?: boolean;
};

export type Brouillon = {
  departId?: string;
  arriveeId?: string;
  jour: Date;
  heure: string;
  allerRetour: boolean;
  passagers: number;
  bagages: number;
  numero: string;
  offreId: OffreId;
  nom: string;
  telephone: string;
  email: string;
  commentaire: string;
  cgv: boolean;
};

const aujourdhui = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const dansJours = (n: number) => {
  const d = aujourdhui();
  d.setDate(d.getDate() + n);
  return d;
};
const avecHeure = (jour: Date, heure: string) => {
  const d = new Date(jour);
  const [h, m] = heure.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

function coursesDemo(): Course[] {
  const make = (
    id: string, departId: string, arriveeId: string, jours: number, heure: string,
    offreId: OffreId, statut: Statut, numero?: string, passagers = 1, bagages = 1,
  ): Course => {
    const t = trajet(lieu(departId), lieu(arriveeId));
    const jour = dansJours(jours);
    return {
      id, departId, arriveeId, heure, offreId, statut, numero, passagers, bagages,
      date: avecHeure(jour, heure), allerRetour: false, km: t.km, minutes: t.minutes,
      montant: prix(offre(offreId), t.km, jour, heure, false).montant,
      nom: 'Claire Martin', demo: true,
    };
  };
  return [
    make('d1', 'tls', 'castres', 3, '18:40', 'tesla', 'confirmee', 'AF 6127', 2, 2),
    make('d2', 'albi', 'matabiau', -12, '07:15', 'tesla', 'terminee'),
    make('d3', 'lavaur', 'tls', -40, '05:30', 'van', 'terminee', 'U2 4421', 6, 6),
  ];
}

const brouillonVide = (): Brouillon => ({
  jour: dansJours(1),
  heure: '09:00',
  allerRetour: false,
  passagers: 1,
  bagages: 1,
  numero: '',
  offreId: 'tesla',
  nom: '',
  telephone: '',
  email: '',
  commentaire: '',
  cgv: false,
});

type Store = {
  brouillon: Brouillon;
  maj: (p: Partial<Brouillon>) => void;
  reinitialiser: () => void;
  courses: Course[];
  envoyer: () => Promise<Course>;
  changerStatut: (id: string, s: Statut, motif?: string, extra?: Partial<Course>) => void;
  /** Adresse de la page de paiement de l'acompte (null en démonstration : payé aussitôt). */
  payerAcompte: (id: string) => Promise<string | null>;
  /** Mode test : faux paiement de l'acompte (même circuit que le vrai, sans argent). */
  payerAcompteTest: (id: string) => Promise<void>;
  annuler: (id: string) => Promise<void>;
  serveur: EtatServeur;
  tarifsVersion: number;
  recalculerTarifs: () => void;
  // Espace chauffeur : rôle du compte connecté, ou démonstration sans serveur.
  role: 'client' | 'chauffeur';
  demoChauffeur: boolean;
  deconnecterChauffeur: () => Promise<void>;
  entrerDemoChauffeur: () => void;
  simulerEchec: boolean;
  setSimulerEchec: (v: boolean) => void;
  prefs: { push: boolean; sms: boolean; email: boolean; stats: boolean };
  setPrefs: (p: Partial<Store['prefs']>) => void;
  apparence: Apparence;
  setApparence: (a: Apparence) => void;
  // Compte client : null = invité (compte anonyme du téléphone).
  compte: (Profil & { email: string | null }) | null;
  creerCompte: (p: { nom: string; telephone: string; email: string; motDePasse: string }) => Promise<'ok' | 'confirmation'>;
  connecterClient: (email: string, motDePasse: string) => Promise<number>;
  /** Mot de passe oublié : code reçu par email + nouveau mot de passe ; connecte le compte. */
  reinitialiserMotDePasse: (email: string, code: string, motDePasse: string) => Promise<number>;
  deconnecterClient: () => Promise<void>;
  /** Supprime le compte (ou les données de l'invité) et repart en invité tout neuf. */
  supprimerCompte: () => Promise<number>;
  majProfil: (nom: string, telephone: string) => Promise<void>;
  /** Recharge les courses du client depuis le serveur. */
  rafraichir: () => Promise<void>;
  /** Change à chaque changement de compte (sert à réenregistrer le téléphone pour les notifications). */
  cleSession: string;
};

export type Apparence = 'auto' | 'clair' | 'sombre';
// non-configure : pas de clés Supabase, l'appli tourne en démonstration.
export type EtatServeur = { etat: 'non-configure' | 'connexion' | 'connecte' | 'erreur'; message?: string };

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [brouillon, setBrouillon] = useState<Brouillon>(brouillonVide);
  const [courses, setCourses] = useState<Course[]>(coursesDemo);
  const [simulerEchec, setSimulerEchec] = useState(false);
  const [prefs, setP] = useState({ push: true, sms: true, email: true, stats: false });
  const [apparence, setApparence] = useState<Apparence>('auto');
  const [serveur, setServeur] = useState<EtatServeur>({ etat: supabase ? 'connexion' : 'non-configure' });
  const [tarifsVersion, setTarifsVersion] = useState(0);
  const [role, setRole] = useState<'client' | 'chauffeur'>('client');
  const [demoChauffeur, setDemoChauffeur] = useState(false);
  const [compte, setCompte] = useState<Store['compte']>(null);
  const [cleSession, setCleSession] = useState('');
  const canal = useRef<ReturnType<typeof ecouterMesCourses>>(null);

  // Côté client : les courses de ce téléphone, puis la confirmation de Fabrice en temps réel.
  const uidClient = useRef<string | null>(null);
  const coursesRef = useRef(courses);
  coursesRef.current = courses;
  const relance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demarrerClient = async (uid: string) => {
    uidClient.current = uid;
    canal.current?.unsubscribe();
    canal.current = null;
    const liste = await mesCourses();
    if (uidClient.current !== uid) return; // compte changé entre-temps
    setCourses(liste);
    canal.current = ecouterMesCourses(
      uid,
      (c) => {
        // Statistiques : réponse de Fabrice vue par le client.
        const avant = coursesRef.current.find((x) => x.id === c.id);
        if (avant && avant.statut !== c.statut) {
          if (c.statut === 'confirmee') evenement(avant.statut === 'acompte_attendu' ? 'acompte_paye' : 'demande_confirmee', { offre: c.offreId, prix: c.montant });
          else if (c.statut === 'refusee') evenement('demande_refusee');
        }
        setCourses((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [c, ...cs]));
      },
      // Connexion temps réel coupée : on recharge et on se réabonne quelques secondes plus tard.
      () => {
        if (relance.current) clearTimeout(relance.current);
        relance.current = setTimeout(() => { if (uidClient.current === uid) demarrerClient(uid).catch(() => {}); }, 3000);
      },
    );
  };
  // Recharge les courses (retour au premier plan, notification reçue, « tirer pour actualiser »).
  const rafraichirClient = async () => {
    if (!supabase || !uidClient.current) return;
    await demarrerClient(uidClient.current);
  };

  // L'appli en arrière-plan ou l'écran verrouillé coupent le temps réel : au retour, on recharge.
  useEffect(() => {
    const abo = AppState.addEventListener('change', (etat) => {
      if (etat === 'active' && role === 'client' && !demoChauffeur) rafraichirClient().catch(() => {});
    });
    // Notification reçue appli ouverte (confirmation, refus…) : la course a changé, on recharge.
    const notif = Platform.OS === 'web' ? null : Notifications.addNotificationReceivedListener(() => {
      if (role === 'client' && !demoChauffeur) rafraichirClient().catch(() => {});
    });
    return () => { abo.remove(); notif?.remove(); };
  }, [role, demoChauffeur]);

  // Profil du compte (ou de l'invité) : préremplit les coordonnées de réservation.
  const chargerProfil = async () => {
    const [sess, p] = await Promise.all([sessionActuelle(), monProfil()]);
    setCleSession(sess?.uid ?? '');
    setCompte(sess && !sess.anonyme ? { nom: p?.nom ?? null, telephone: p?.telephone ?? null, email: sess.email ?? p?.email ?? null } : null);
    if (p) setBrouillon((b) => ({ ...b, nom: b.nom || p.nom || '', telephone: b.telephone || p.telephone || '', email: b.email || p.email || sess?.email || '' }));
  };

  // Connexion au démarrage : compte invité (ou session de Fabrice), tarifs à jour.
  useEffect(() => {
    if (!supabase) return;
    let actif = true;
    (async () => {
      try {
        const uid = await connexionInvite();
        appliquerTarifs(await chargerTarifs());
        const chauffeur = await estChauffeur();
        if (!actif) return;
        setTarifsVersion((v) => v + 1);
        if (chauffeur) setRole('chauffeur');
        else { await demarrerClient(uid); await chargerProfil().catch(() => {}); }
        setServeur({ etat: 'connecte' });
      } catch (e) {
        if (actif) setServeur({ etat: 'erreur', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { actif = false; canal.current?.unsubscribe(); };
  }, []);

  const value = useMemo<Store>(
    () => ({
      brouillon,
      maj: (p) => setBrouillon((b) => ({ ...b, ...p })),
      reinitialiser: () => setBrouillon((b) => ({ ...brouillonVide(), nom: b.nom, telephone: b.telephone, email: b.email })),
      courses,
      envoyer: async () => {
        if (supabase && serveur.etat === 'connecte') {
          const b = brouillon;
          const t = trajet(lieu(b.departId!), lieu(b.arriveeId!));
          const c = await creerDemande(b, avecHeure(b.jour, b.heure), t.km, t.minutes);
          setCourses((cs) => [c, ...cs.filter((x) => x.id !== c.id)]);
          activerNotifications(); // la demande d'autorisation arrive au moment où elle a un sens
          return c;
        }
        return new Promise<Course>((resolve, reject) => {
          setTimeout(() => {
            if (simulerEchec) return reject(new Error('reseau'));
            const b = brouillon;
            const t = trajet(lieu(b.departId!), lieu(b.arriveeId!));
            const c: Course = {
              id: String(Date.now()),
              departId: b.departId!, arriveeId: b.arriveeId!,
              date: avecHeure(b.jour, b.heure), heure: b.heure, allerRetour: b.allerRetour,
              passagers: b.passagers, bagages: b.bagages, numero: b.numero || undefined,
              offreId: b.offreId, km: t.km, minutes: t.minutes,
              montant: prix(offre(b.offreId), t.km, b.jour, b.heure, b.allerRetour).montant,
              nom: b.nom, statut: 'envoyee', envoyeeLe: new Date(),
            };
            setCourses((cs) => [c, ...cs]);
            resolve(c);
          }, 1400);
        });
      },
      changerStatut: (id, s, motif, extra) => setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, statut: s, motifRefus: motif, ...extra } : c))),
      payerAcompteTest: async (id) => {
        if (supabase && serveur.etat === 'connecte' && !courses.find((c) => c.id === id)?.demo) {
          await payerAcompteTest(id);
          setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, statut: c.statut === 'acompte_attendu' ? 'confirmee' : c.statut, acomptePaye: true } : c)));
        } else setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, statut: 'confirmee', acomptePaye: true } : c)));
      },
      payerAcompte: async (id) => {
        if (supabase && serveur.etat === 'connecte' && !courses.find((c) => c.id === id)?.demo) {
          const r = await lienAcompte(id);
          if (r.deja_paye) return null;
          return r.url ?? null;
        }
        // Démonstration : paiement accepté aussitôt.
        setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, statut: 'confirmee', acomptePaye: true } : c)));
        return null;
      },
      annuler: async (id) => {
        const c0 = courses.find((c) => c.id === id);
        if (c0) evenement('annulation', { delai_h: Math.round((c0.date.getTime() - Date.now()) / 3600000), statut: c0.statut });
        if (supabase && serveur.etat === 'connecte' && !courses.find((c) => c.id === id)?.demo) {
          const c = await annulerCourse(id);
          setCourses((cs) => cs.map((x) => (x.id === id ? c : x)));
          // Acompte remboursé si les CGV le prévoient (le serveur décide, rien sinon).
          if (c.acomptePaye) rembourserTout(id).catch((e) => console.warn('Remboursement :', e instanceof Error ? e.message : e));
        } else {
          setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, statut: 'annulee' } : c)));
        }
      },
      serveur,
      tarifsVersion,
      recalculerTarifs: () => setTarifsVersion((v) => v + 1),
      role,
      demoChauffeur,
      deconnecterChauffeur: async () => {
        if (demoChauffeur) { setDemoChauffeur(false); return; }
        await oublierTelephone().catch(() => {});
        const uid = await deconnexion();
        setRole('client');
        await demarrerClient(uid);
        await chargerProfil().catch(() => {});
      },
      entrerDemoChauffeur: () => setDemoChauffeur(true),
      compte,
      cleSession,
      rafraichir: rafraichirClient,
      creerCompte: async (p) => {
        const r = await creerCompteServeur(p);
        evenement('compte_cree');
        setBrouillon((b) => ({ ...b, nom: p.nom, telephone: p.telephone, email: p.email }));
        await chargerProfil();
        activerNotifications();
        return r;
      },
      reinitialiserMotDePasse: async (email, code, motDePasse) => {
        const r = await reinitialiserServeur(email, code, motDePasse);
        if (r.chauffeur) { canal.current?.unsubscribe(); setCourses([]); setRole('chauffeur'); activerNotifications(); return 0; }
        setBrouillon((b) => ({ ...b, nom: '', telephone: '', email: '' }));
        await demarrerClient(r.uid);
        await chargerProfil();
        activerNotifications();
        return r.rattachees;
      },
      connecterClient: async (email, motDePasse) => {
        await oublierTelephone().catch(() => {});
        const r = await connecterClientServeur(email, motDePasse);
        if (!r.chauffeur) evenement('connexion_compte');
        if (r.chauffeur) { canal.current?.unsubscribe(); setCourses([]); setRole('chauffeur'); activerNotifications(); return 0; }
        setBrouillon((b) => ({ ...b, nom: '', telephone: '', email: '' }));
        await demarrerClient(r.uid);
        await chargerProfil();
        activerNotifications();
        return r.rattachees;
      },
      deconnecterClient: async () => {
        await oublierTelephone().catch(() => {});
        const uid = await deconnexion();
        setCompte(null);
        setBrouillon((b) => ({ ...b, nom: '', telephone: '', email: '' }));
        await demarrerClient(uid);
        setCleSession(uid);
      },
      supprimerCompte: async () => {
        const { uid, courses: n } = await supprimerCompteServeur();
        await oublierIdentifiant();
        canal.current?.unsubscribe();
        setCompte(null);
        setCourses([]);
        setBrouillon(brouillonVide());
        await demarrerClient(uid);
        setCleSession(uid);
        return n;
      },
      majProfil: async (nom, telephone) => {
        await majProfilServeur(nom, telephone);
        setBrouillon((b) => ({ ...b, nom, telephone }));
        await chargerProfil();
      },
      simulerEchec,
      setSimulerEchec,
      prefs,
      setPrefs: (p) => setP((x) => ({ ...x, ...p })),
      apparence,
      setApparence,
    }),
    [brouillon, courses, simulerEchec, prefs, apparence, serveur, tarifsVersion, role, demoChauffeur, compte, cleSession],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx)!;
export { dansJours, aujourdhui };
