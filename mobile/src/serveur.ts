import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { TarifsServeur, lieu, lieux } from './data';
import type { Brouillon, Course, Statut } from './store';

// Connexion à Supabase. Adresse du projet et clé publique dans mobile/.env (variables EXPO_PUBLIC_…).
// La clé publique peut être dans l'appli : la sécurité repose sur les règles de la base (RLS).
// Sans ces variables, l'appli reste en mode démonstration.
const URL_PROJET = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const CLE_PUBLIQUE = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export const supabase: SupabaseClient | null =
  URL_PROJET && CLE_PUBLIQUE
    ? createClient(URL_PROJET, CLE_PUBLIQUE, {
        auth: {
          storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

// Chaque téléphone reçoit un compte invité anonyme : il ne voit que ses propres courses.
export async function connexionInvite(): Promise<string> {
  if (!supabase) throw new Error('Serveur non configuré');
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: d, error } = await supabase.auth.signInAnonymously();
  if (error || !d.user) throw new Error(error?.message ?? 'Connexion impossible');
  return d.user.id;
}

export async function chargerTarifs(): Promise<TarifsServeur> {
  if (!supabase) throw new Error('Serveur non configuré');
  const [o, p, j] = await Promise.all([
    supabase.from('offres').select('id, prix_km_jour, prix_km_majore, minimum, passagers_max, bagages_max').eq('active', true),
    supabase.from('parametres').select('*').eq('id', 1).maybeSingle(),
    supabase.from('jours_feries').select('jour'),
  ]);
  const erreur = o.error ?? p.error ?? j.error;
  if (erreur) throw new Error(erreur.message);
  return { offres: o.data ?? [], parametres: p.data, joursFeries: (j.data ?? []).map((x) => x.jour) };
}

type LigneCourse = {
  id: string; depart_ref: string | null; arrivee_ref: string | null; date_heure: string; aller_retour: boolean;
  passagers: number; bagages: number; numero_vol_train: string | null; offre_id: string; montant: number;
  distance_km: number; duree_min: number | null; nom: string; statut: Statut | 'refusee'; envoyee_le: string;
};

const deux = (n: number) => String(n).padStart(2, '0');
export function versCourse(l: LigneCourse): Course | null {
  const connu = (id: string | null) => !!id && lieux.some((x) => x.id === id);
  if (!connu(l.depart_ref) || !connu(l.arrivee_ref)) return null; // adresses hors prototype : étape 2
  const date = new Date(l.date_heure);
  return {
    id: l.id,
    departId: l.depart_ref!,
    arriveeId: l.arrivee_ref!,
    date,
    heure: `${deux(date.getHours())}:${deux(date.getMinutes())}`,
    allerRetour: l.aller_retour,
    passagers: l.passagers,
    bagages: l.bagages,
    numero: l.numero_vol_train ?? undefined,
    offreId: l.offre_id as Course['offreId'],
    montant: Number(l.montant),
    km: Number(l.distance_km),
    minutes: l.duree_min ?? 0,
    nom: l.nom,
    statut: l.statut as Statut,
    envoyeeLe: new Date(l.envoyee_le),
  };
}

export async function mesCourses(): Promise<Course[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('courses').select('*').order('date_heure', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data as LigneCourse[]).map(versCourse).filter((x): x is Course => !!x);
}

const lieuJson = (id: string) => {
  const l = lieu(id);
  return { ref: l.id, libelle: l.nom, detail: l.detail, type: l.type, lat: l.lat, lon: l.lon };
};

export async function creerDemande(b: Brouillon, dateHeure: Date, km: number, minutes: number): Promise<Course> {
  if (!supabase) throw new Error('Serveur non configuré');
  const { data, error } = await supabase.rpc('creer_demande', {
    p_depart: lieuJson(b.departId!),
    p_arrivee: lieuJson(b.arriveeId!),
    p_date_heure: dateHeure.toISOString(),
    p_aller_retour: b.allerRetour,
    p_passagers: b.passagers,
    p_bagages: b.bagages,
    p_numero: b.numero,
    p_offre: b.offreId,
    p_distance_km: km,
    p_duree_min: minutes,
    p_nom: b.nom,
    p_telephone: b.telephone,
    p_email: b.email,
    p_commentaire: b.commentaire,
  });
  if (error) throw new Error(error.message);
  const c = versCourse(data as LigneCourse);
  if (!c) throw new Error('Réponse du serveur inattendue');
  return c;
}

export async function annulerCourse(id: string): Promise<Course> {
  if (!supabase) throw new Error('Serveur non configuré');
  const { data, error } = await supabase.rpc('annuler_course', { p_course: id });
  if (error) throw new Error(error.message);
  return versCourse(data as LigneCourse)!;
}

// Temps réel : la confirmation de Fabrice arrive sans recharger.
export function ecouterMesCourses(uid: string, surChangement: (c: Course) => void): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel(`courses-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `client_id=eq.${uid}` }, (p) => {
      const c = versCourse(p.new as LigneCourse);
      if (c) surChangement(c);
    })
    .subscribe();
}
