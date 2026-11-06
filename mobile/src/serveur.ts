import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { TarifsServeur, enregistrerLieu, lieu, lieux } from './data';
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

export type LigneCourse = {
  id: string; client_id: string | null; fiche_id: string | null; source: 'appli' | 'telephone' | 'email' | 'autre';
  depart_ref: string | null; depart_libelle: string; depart_detail: string | null; depart_type: string | null;
  depart_lat: number | null; depart_lon: number | null;
  arrivee_ref: string | null; arrivee_libelle: string; arrivee_detail: string | null; arrivee_type: string | null;
  arrivee_lat: number | null; arrivee_lon: number | null;
  date_heure: string; aller_retour: boolean;
  passagers: number; bagages: number; numero_vol_train: string | null; offre_id: string; montant: number;
  prix_ajuste: boolean; prix_km: number; majorations: string[];
  distance_km: number; duree_min: number | null; nom: string; telephone: string; email: string | null;
  commentaire: string | null; note_chauffeur: string | null;
  statut: Statut; envoyee_le: string; confirmee_le: string | null; refusee_le: string | null; motif_refus: string | null;
  annulee_le: string | null; frais_annulation: number | null; terminee_le: string | null;
};

export type Fiche = {
  id: string; nom: string; telephone: string | null; email: string | null; notes: string | null;
  profil_id: string | null; cree_le: string; maj_le: string;
};

const deux = (n: number) => String(n).padStart(2, '0');
export function versCourse(l: LigneCourse): Course | null {
  // Départ et arrivée : raccourcis connus, ou adresses enregistrées dans le registre des lieux.
  const enregistrer = (cote: 'depart' | 'arrivee') => {
    const ref = l[`${cote}_ref`] ?? `srv:${l.id}:${cote}`;
    if (lieux.some((x) => x.id === ref)) return ref;
    const type = l[`${cote}_type`];
    enregistrerLieu({
      id: ref, nom: l[`${cote}_libelle`], detail: l[`${cote}_detail`] ?? '',
      type: type === 'aeroport' || type === 'gare' || type === 'ville' ? type : 'adresse',
      lat: l[`${cote}_lat`] ?? 0, lon: l[`${cote}_lon`] ?? 0,
    });
    return ref;
  };
  const date = new Date(l.date_heure);
  return {
    id: l.id,
    departId: enregistrer('depart'),
    arriveeId: enregistrer('arrivee'),
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
    motifRefus: l.motif_refus ?? undefined,
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

// ——— Espace chauffeur ———

export async function estChauffeur(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('est_chauffeur');
  if (error) return false;
  return !!data;
}

// Connexion de Fabrice : email + mot de passe. Un compte sans le rôle chauffeur est refusé.
export async function connexionChauffeur(email: string, motDePasse: string): Promise<string> {
  if (!supabase) throw new Error('Serveur non configuré');
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
  if (error || !data.user) {
    throw new Error(error?.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect' : error?.message ?? 'Connexion impossible');
  }
  if (!(await estChauffeur())) {
    await supabase.auth.signOut();
    await connexionInvite();
    throw new Error('Ce compte n’a pas accès à l’espace chauffeur');
  }
  return data.user.id;
}

// Déconnexion : le téléphone redevient un client invité.
export async function deconnexion(): Promise<string> {
  if (!supabase) throw new Error('Serveur non configuré');
  await supabase.auth.signOut();
  return connexionInvite();
}

export async function emailConnecte(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

const verifier = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export async function chargerEspaceChauffeur(): Promise<{ courses: LigneCourse[]; fiches: Fiche[] }> {
  if (!supabase) throw new Error('Serveur non configuré');
  const [c, f] = await Promise.all([
    supabase.from('courses').select('*').order('date_heure', { ascending: false }).limit(1000),
    supabase.from('fiches_clients').select('*').order('nom'),
  ]);
  return { courses: verifier(c) as LigneCourse[], fiches: verifier(f) as Fiche[] };
}

export async function rpcChauffeur(nom: string, params: Record<string, unknown>): Promise<LigneCourse> {
  if (!supabase) throw new Error('Serveur non configuré');
  return verifier(await supabase.rpc(nom, params)) as LigneCourse;
}

export async function enregistrerFiche(f: Partial<Fiche> & { nom: string }): Promise<Fiche> {
  if (!supabase) throw new Error('Serveur non configuré');
  const ligne = {
    nom: f.nom.trim(),
    telephone: f.telephone?.trim() || null,
    telephone_norm: normaliserTelephone(f.telephone),
    email: f.email?.trim() || null,
    notes: f.notes?.trim() || null,
    maj_le: new Date().toISOString(),
  };
  const r = f.id
    ? await supabase.from('fiches_clients').update(ligne).eq('id', f.id).select().single()
    : await supabase.from('fiches_clients').insert(ligne).select().single();
  if (r.error?.code === '23505') throw new Error('Un client avec ce numéro de téléphone existe déjà');
  return verifier(r) as Fiche;
}

export async function majTable(table: 'offres' | 'parametres', id: string | number, valeurs: Record<string, unknown>) {
  if (!supabase) throw new Error('Serveur non configuré');
  verifier(await supabase.from(table).update(valeurs).eq('id', id).select().single());
}

export async function ajouterFerie(jour: string) {
  if (!supabase) throw new Error('Serveur non configuré');
  const r = await supabase.from('jours_feries').insert({ jour });
  if (r.error && r.error.code !== '23505') throw new Error(r.error.message);
}

export async function retirerFerie(jour: string) {
  if (!supabase) throw new Error('Serveur non configuré');
  verifier(await supabase.from('jours_feries').delete().eq('jour', jour));
}

export function ecouterEspaceChauffeur(
  surCourse: (c: LigneCourse) => void,
  surFiche: (f: Fiche) => void,
): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel('espace-chauffeur')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, (p) => { if (p.new && 'id' in p.new) surCourse(p.new as LigneCourse); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fiches_clients' }, (p) => { if (p.new && 'id' in p.new) surFiche(p.new as Fiche); })
    .subscribe();
}

// Même règle que la fonction normaliser_telephone de la base.
export function normaliserTelephone(t?: string | null): string | null {
  const d = (t ?? '').replace(/\D/g, '');
  if (!d) return null;
  return /^33\d{9}$/.test(d) ? '0' + d.slice(2) : d;
}

// ——— Messagerie client ↔ chauffeur ———

export type Message = {
  id: string; course_id: string; auteur_id: string; de_chauffeur: boolean; texte: string; envoye_le: string; lu_le: string | null;
};

export async function chargerMessages(): Promise<Message[]> {
  if (!supabase) return [];
  const r = await supabase.from('messages').select('*').order('envoye_le', { ascending: true }).limit(2000);
  return verifier(r) as Message[];
}

export async function envoyerMessageServeur(courseId: string, texte: string): Promise<Message> {
  if (!supabase) throw new Error('Serveur non configuré');
  return verifier(await supabase.rpc('envoyer_message', { p_course: courseId, p_texte: texte })) as Message;
}

export async function marquerLusServeur(courseId: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('marquer_lus', { p_course: courseId });
}

export function ecouterMessages(surMessage: (m: Message) => void): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel(`messages-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p) => { if (p.new && 'id' in p.new) surMessage(p.new as Message); })
    .subscribe();
}

// ——— Annonces et indisponibilités (migration 7) ———
export type AnnonceServeur = { id: string; debut: string; fin: string; bloquer: boolean; message: string | null; cree_le: string };

export async function chargerAnnonces(): Promise<AnnonceServeur[]> {
  if (!supabase) return [];
  return verifier(await supabase.from('annonces').select('*').order('debut')) as AnnonceServeur[];
}

export async function enregistrerAnnonceServeur(a: Omit<AnnonceServeur, 'id' | 'cree_le'> & { id?: string }): Promise<AnnonceServeur> {
  if (!supabase) throw new Error('Serveur non configuré');
  const { id, ...valeurs } = a;
  const r = id
    ? await supabase.from('annonces').update(valeurs).eq('id', id).select().single()
    : await supabase.from('annonces').insert(valeurs).select().single();
  return verifier(r) as AnnonceServeur;
}

export async function supprimerAnnonceServeur(id: string) {
  if (!supabase) throw new Error('Serveur non configuré');
  verifier(await supabase.from('annonces').delete().eq('id', id));
}

export function ecouterAnnonces(surChangement: () => void): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase
    .channel('annonces')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'annonces' }, surChangement)
    .subscribe();
}
