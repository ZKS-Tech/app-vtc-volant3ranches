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
  acompte_montant?: number | null; acompte_limite?: string | null; acompte_paye_le?: string | null; expiree_le?: string | null;
};

export type Fiche = {
  id: string; nom: string; telephone: string | null; email: string | null; notes: string | null;
  profil_id: string | null; cree_le: string; maj_le: string;
  // Facturation (migration 9)
  numero_client?: number | null; entreprise?: string | null; adresse?: string | null; code_postal?: string | null; ville?: string | null;
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
    acompteMontant: l.acompte_montant != null ? Number(l.acompte_montant) : undefined,
    acompteLimite: l.acompte_limite ? new Date(l.acompte_limite) : undefined,
    acomptePaye: !!l.acompte_paye_le,
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
export function ecouterMesCourses(uid: string, surChangement: (c: Course) => void, surCoupure?: () => void): RealtimeChannel | null {
  if (!supabase) return null;
  // Nom unique : réabonner le même sujet juste après l'avoir quitté peut être ignoré par le serveur.
  return supabase
    .channel(`courses-${uid}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `client_id=eq.${uid}` }, (p) => {
      const c = versCourse(p.new as LigneCourse);
      if (c) surChangement(c);
    })
    .subscribe((etat) => {
      if (etat === 'CHANNEL_ERROR' || etat === 'TIMED_OUT') surCoupure?.();
    });
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
    // Coordonnées de facturation : envoyées seulement si renseignées (base sans la migration 9 : ignorées).
    ...Object.fromEntries((['entreprise', 'adresse', 'code_postal', 'ville'] as const)
      .filter((k) => f[k] !== undefined && (f[k]?.trim() || f[k] === ''))
      .map((k) => [k, f[k]?.trim() || null])),
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

// ——— Acompte (migration 8 et fonctions serveur SumUp) ———
export type Paiement = {
  id: string; course_id: string; montant: number; statut: 'en_attente' | 'paye' | 'echoue' | 'expire' | 'rembourse';
  lien: string | null; cree_le: string; paye_le: string | null; remboursement_du: number; rembourse: number; rembourse_le: string | null;
};

async function fonction<T>(nom: string, corps: Record<string, unknown>, defaut = 'Paiement indisponible pour le moment. Réessayez ou appelez Fabrice.'): Promise<T> {
  if (!supabase) throw new Error('Serveur non configuré');
  const { data, error } = await supabase.functions.invoke(nom, { body: corps });
  if (error) {
    // Le message utile est dans le corps de la réponse ({ erreur }).
    const ctx = (error as { context?: Response }).context;
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error(detail?.erreur ?? defaut);
  }
  if (data?.erreur) throw new Error(data.erreur);
  return data as T;
}

// Page de paiement SumUp de l'acompte (créée ou réutilisée par le serveur).
export const lienAcompte = (courseId: string) =>
  fonction<{ url?: string; montant: number; limite: string | null; deja_paye?: boolean }>('acompte', { course_id: courseId });

// Rembourse ce que la base a décidé après une annulation (rien si l'acompte est conservé).
export const rembourserAcompte = (courseId: string) => fonction<{ rembourse: number }>('acompte-rembourser', { course_id: courseId });

export async function paiementsDe(courseId: string): Promise<Paiement[]> {
  if (!supabase) return [];
  return verifier(await supabase.from('paiements').select('*').eq('course_id', courseId).order('cree_le')) as Paiement[];
}

// ——— Bons de commande et factures (migration 9 et fonction document-pdf) ———
export type ModePaiement = 'cb' | 'cheque' | 'especes' | 'virement' | 'en_ligne';
export const libelleMode: Record<ModePaiement, string> = { cb: 'Carte bancaire', cheque: 'Chèque', especes: 'Espèces', virement: 'Virement', en_ligne: 'CB en ligne' };
export type DocumentEmis = {
  id: string; type: 'commande' | 'facture'; numero: string; course_id: string; emis_le: string;
  total_ht: number; tva: number; total_ttc: number; mode_paiement: ModePaiement | null;
  contenu: { client?: { nom?: string; entreprise?: string | null }; course?: { date?: string; depart?: string; arrivee?: string }; acompte?: number };
};

export async function chargerDocuments(filtre?: { courseId?: string; depuis?: Date; jusqua?: Date }): Promise<DocumentEmis[]> {
  if (!supabase) return [];
  let r = supabase.from('documents').select('id, type, numero, course_id, emis_le, total_ht, tva, total_ttc, mode_paiement, contenu').order('emis_le', { ascending: false });
  if (filtre?.courseId) r = r.eq('course_id', filtre.courseId);
  if (filtre?.depuis) r = r.gte('emis_le', filtre.depuis.toISOString());
  if (filtre?.jusqua) r = r.lt('emis_le', filtre.jusqua.toISOString());
  const { data, error } = await r;
  if (error) {
    if (/documents/.test(error.message) && /exist|schema cache/.test(error.message)) return []; // migration 9 pas encore faite
    throw new Error(error.message);
  }
  return (data ?? []).map((d) => ({ ...d, total_ht: Number(d.total_ht), tva: Number(d.tva), total_ttc: Number(d.total_ttc) })) as DocumentEmis[];
}

export async function emettreFacture(courseId: string, mode: ModePaiement): Promise<DocumentEmis> {
  if (!supabase) throw new Error('Serveur non configuré');
  const { data, error } = await supabase.rpc('emettre_facture', { p_course: courseId, p_mode: mode });
  if (error) throw new Error(error.message);
  return data as DocumentEmis;
}

// Lien de téléchargement du PDF (valable 1 h).
export const lienPdf = (documentId: string) => fonction<{ url: string; numero: string }>('document-pdf', { document_id: documentId }, 'PDF indisponible pour le moment. Réessayez dans un instant.');

export function ecouterDocuments(surDocument: () => void): RealtimeChannel | null {
  if (!supabase) return null;
  return supabase.channel('documents').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'documents' }, surDocument).subscribe();
}

// ——— Mode test (migration 10) : paiements et remboursements simulés ———
async function rpc<T>(nom: string, params: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Serveur non configuré');
  const { data, error } = await supabase.rpc(nom, params);
  if (error) throw new Error(error.message);
  return data as T;
}
export const payerAcompteTest = (courseId: string) => rpc<unknown>('payer_acompte_test', { p_course: courseId });
export const effacerDocumentsTest = () => rpc<number>('effacer_documents_test', {});

// Rembourse les faux paiements (mode test) puis les vrais (SumUp) ; renvoie le total remboursé.
export async function rembourserTout(courseId: string): Promise<number> {
  let total = 0;
  try { total += Number(await rpc<number>('rembourser_test', { p_course: courseId })) || 0; } catch { /* base sans la migration 10 */ }
  const dus = (await paiementsDe(courseId)).filter((p) => p.statut === 'paye' && Number(p.remboursement_du) > Number(p.rembourse));
  if (dus.length) total += (await rembourserAcompte(courseId)).rembourse;
  return total;
}

// ——— Comptes clients (migration 11) ———
export type Profil = { nom: string | null; telephone: string | null; email: string | null };
export type Session = { uid: string; anonyme: boolean; email: string | null };

export async function sessionActuelle(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  return u ? { uid: u.id, anonyme: !!u.is_anonymous, email: u.email ?? null } : null;
}

export async function monProfil(): Promise<Profil | null> {
  if (!supabase) return null;
  const s = await sessionActuelle();
  if (!s) return null;
  const { data } = await supabase.from('profils').select('nom, telephone, email').eq('id', s.uid).maybeSingle();
  return data as Profil | null;
}

const messageAuth = (m?: string) =>
  !m ? 'Opération impossible pour le moment'
  : /invalid login credentials/i.test(m) ? 'Email ou mot de passe incorrect'
  : /already (been )?registered|already exists|email_exists/i.test(m) ? 'Un compte existe déjà avec cet email : connectez-vous.'
  : /password should be at least|weak/i.test(m) ? 'Mot de passe trop court (6 caractères au moins).'
  : /email.*invalid|invalid.*email/i.test(m) ? 'Adresse email invalide.'
  : /rate limit|too many/i.test(m) ? 'Trop de tentatives, réessayez dans quelques minutes.'
  : /not confirmed/i.test(m) ? 'Email pas encore confirmé : ouvrez le lien reçu par email.'
  : m;

// Transforme le compte invité de ce téléphone en compte permanent (même identifiant : les courses
// restent). Renvoie « confirmation » si Supabase demande de valider l'email avant le mot de passe.
export async function creerCompte(p: { nom: string; telephone: string; email: string; motDePasse: string }): Promise<'ok' | 'confirmation'> {
  if (!supabase) throw new Error('Serveur non configuré');
  await connexionInvite();
  const email = p.email.trim().toLowerCase();
  const r1 = await supabase.auth.updateUser({ email });
  if (r1.error) throw new Error(messageAuth(r1.error.message));
  if ((r1.data.user?.email ?? '').toLowerCase() !== email) {
    // Confirmation d'email activée : le mot de passe se définira après le clic sur le lien.
    await supabase.rpc('enregistrer_profil', { p_nom: p.nom, p_telephone: p.telephone });
    return 'confirmation';
  }
  const r2 = await supabase.auth.updateUser({ password: p.motDePasse });
  if (r2.error) throw new Error(messageAuth(r2.error.message));
  await supabase.auth.refreshSession(); // nouveau jeton : n'est plus « invité »
  const r3 = await supabase.rpc('enregistrer_profil', { p_nom: p.nom, p_telephone: p.telephone });
  if (r3.error) throw new Error(r3.error.message);
  return 'ok';
}

// Connexion à un compte existant ; les courses réservées en invité sur ce téléphone le suivent.
export async function connecterClient(email: string, motDePasse: string): Promise<{ uid: string; chauffeur: boolean; rattachees: number }> {
  if (!supabase) throw new Error('Serveur non configuré');
  const avant = await sessionActuelle();
  let jeton: string | null = null;
  if (avant?.anonyme) jeton = ((await supabase.rpc('preparer_fusion')).data as string | null) ?? null;
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: motDePasse });
  if (error || !data.user) throw new Error(messageAuth(error?.message));
  let rattachees = 0;
  if (jeton) rattachees = Number((await supabase.rpc('fusionner_compte', { p_jeton: jeton })).data ?? 0);
  return { uid: data.user.id, chauffeur: await estChauffeur(), rattachees };
}

export async function majProfil(nom: string, telephone: string): Promise<Profil> {
  if (!supabase) throw new Error('Serveur non configuré');
  const { data, error } = await supabase.rpc('enregistrer_profil', { p_nom: nom, p_telephone: telephone });
  if (error) throw new Error(messageAuth(error.message));
  return data as Profil;
}

// ——— Emails (migration 12 et fonction emails) ———
export type EmailEnvoye = {
  id: string; type: string; destinataire: string; statut: 'a_envoyer' | 'envoi' | 'envoye' | 'erreur';
  erreur: string | null; tentatives: number; cree_le: string; envoye_le: string | null; course_id: string | null;
};
export type ReglagesEmails = { emails_actifs: boolean; emails_copie_chauffeur: boolean; email_chauffeur: string | null };

export async function chargerReglagesEmails(): Promise<ReglagesEmails | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('parametres').select('emails_actifs, emails_copie_chauffeur, email_chauffeur').eq('id', 1).maybeSingle();
  if (error) return null; // migration 12 pas encore faite
  return data as ReglagesEmails;
}
export async function majReglagesEmails(v: Partial<ReglagesEmails>) {
  if (!supabase) throw new Error('Serveur non configuré');
  verifier(await supabase.from('parametres').update(v).eq('id', 1));
}
export async function chargerEmails(): Promise<EmailEnvoye[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('emails').select('id, type, destinataire, statut, erreur, tentatives, cree_le, envoye_le, course_id')
    .order('cree_le', { ascending: false }).limit(60);
  if (error) return [];
  return data as EmailEnvoye[];
}
export const renvoyerEmail = (id: string) => rpc<null>('renvoyer_email', { p_email: id });

// ——— Mot de passe oublié : code à 6 chiffres reçu par email ———
export async function envoyerCodeConnexion(email: string) {
  if (!supabase) throw new Error('Serveur non configuré');
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false } });
  if (error) throw new Error(/signups? not allowed|not found|user/i.test(error.message) ? 'Aucun compte avec cet email.' : messageAuth(error.message));
}
// Vérifie le code, connecte le compte (les courses de l'invité le suivent) et change le mot de passe.
export async function reinitialiserMotDePasse(email: string, code: string, motDePasse: string): Promise<{ uid: string; chauffeur: boolean; rattachees: number }> {
  if (!supabase) throw new Error('Serveur non configuré');
  const avant = await sessionActuelle();
  let jeton: string | null = null;
  if (avant?.anonyme) jeton = ((await supabase.rpc('preparer_fusion')).data as string | null) ?? null;
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
  if (error || !data.user) throw new Error(/expired|invalid/i.test(error?.message ?? '') ? 'Code incorrect ou expiré.' : messageAuth(error?.message));
  const r = await supabase.auth.updateUser({ password: motDePasse });
  if (r.error) throw new Error(messageAuth(r.error.message));
  let rattachees = 0;
  if (jeton) rattachees = Number((await supabase.rpc('fusionner_compte', { p_jeton: jeton })).data ?? 0);
  return { uid: data.user.id, chauffeur: await estChauffeur(), rattachees };
}
