import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isoJour } from './data';
import {
  AnnonceServeur, chargerAnnonces, ecouterAnnonces, enregistrerAnnonceServeur, supabase, supprimerAnnonceServeur,
} from './serveur';
import { anglais, t, L } from './i18n';

// Annonces de Fabrice : indisponibilités (vacances…) et informations, visibles côté client.
// Les dates sont des jours « AAAA-MM-JJ », bornes incluses.
export type Annonce = AnnonceServeur;
export type AnnonceSaisie = Omit<Annonce, 'id' | 'cree_le'> & { id?: string };

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const jourEnDate = (iso: string) => new Date(`${iso}T12:00:00`);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const jourLong = (iso: string) => {
  const d = jourEnDate(iso);
  return anglais() ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]}`;
};

// « du 16 au 26 novembre », « du 28 décembre au 4 janvier », « le 11 novembre ».
export function periode(a: Pick<Annonce, 'debut' | 'fin'>) {
  if (a.debut === a.fin) return `${L('le', 'on')} ${jourLong(a.debut)}`;
  const d = jourEnDate(a.debut), f = jourEnDate(a.fin);
  const debut = d.getMonth() === f.getMonth() && d.getFullYear() === f.getFullYear() ? (d.getDate() === 1 && !anglais() ? '1er' : String(d.getDate())) : jourLong(a.debut);
  return L(`du ${debut} au ${jourLong(a.fin)}`, `from ${debut} to ${jourLong(a.fin)}`);
}

export const titreAnnonce = (a: Annonce) => (a.bloquer ? t('Fabrice est absent {periode}', { periode: periode(a) }) : t('Information de Fabrice'));

// Le jour qui suit la fin : « de retour le … ».
export function retourLe(a: Annonce) {
  const d = jourEnDate(a.fin); d.setDate(d.getDate() + 1);
  return jourLong(isoJour(d));
}

type Ctx = {
  annonces: Annonce[]; // toutes (Fabrice) ou en cours et à venir (clients)
  /** Annonces à montrer aux clients aujourd'hui (absences d'abord) : indisponibilités jusqu'à leur dernier jour, infos entre leurs dates. */
  visibles: Annonce[];
  indisponibiliteLe: (jour: Date) => Annonce | undefined;
  enregistrer: (a: AnnonceSaisie) => Promise<void>;
  supprimer: (id: string) => Promise<void>;
};

const Contexte = createContext<Ctx | null>(null);

export function AnnoncesProvider({ children }: { children: ReactNode }) {
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [aujourdhui, setAujourdhui] = useState(() => isoJour(new Date()));

  const recharger = useCallback(() => {
    if (!supabase) return;
    chargerAnnonces().then(setAnnonces).catch((e) => console.warn('Annonces :', e instanceof Error ? e.message : e));
  }, []);

  useEffect(() => {
    recharger();
    const canal = supabase ? ecouterAnnonces(recharger) : null;
    // Le bandeau disparaît de lui-même après le dernier jour, même appli ouverte.
    const t = setInterval(() => setAujourdhui(isoJour(new Date())), 60_000);
    return () => { canal?.unsubscribe(); clearInterval(t); };
  }, [recharger]);

  const value = useMemo<Ctx>(() => {
    const triees = [...annonces].sort((a, b) => a.debut.localeCompare(b.debut));
    return {
      annonces: triees,
      // Les absences passent devant les informations, puis la plus proche d'abord.
      visibles: triees
        .filter((a) => a.fin >= aujourdhui && (a.bloquer || a.debut <= aujourdhui))
        .sort((a, b) => Number(b.bloquer) - Number(a.bloquer) || a.debut.localeCompare(b.debut)),
      indisponibiliteLe: (jour) => { const j = isoJour(jour); return triees.find((a) => a.bloquer && a.debut <= j && j <= a.fin); },
      enregistrer: async (a) => {
        const ligne = await enregistrerAnnonceServeur(a);
        setAnnonces((xs) => [...xs.filter((x) => x.id !== ligne.id), ligne]);
      },
      supprimer: async (id) => {
        await supprimerAnnonceServeur(id);
        setAnnonces((xs) => xs.filter((x) => x.id !== id));
      },
    };
  }, [annonces, aujourdhui]);

  return <Contexte.Provider value={value}>{children}</Contexte.Provider>;
}

export function useAnnonces() {
  const c = useContext(Contexte);
  if (!c) throw new Error('useAnnonces hors de AnnoncesProvider');
  return c;
}
