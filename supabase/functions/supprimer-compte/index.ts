// Fonction serveur « supprimer-compte » : le client supprime son compte depuis l'appli
// (Profil › Supprimer mon compte, ou « Effacer mes données » pour un invité).
//  1. la session de l'appli est vérifiée ;
//  2. la base efface ses données (supprimer_mes_donnees : refuse s'il reste une course à venir,
//     anonymise les courses passées, efface messages, téléphone, profil) ;
//  3. l'accès (email, mot de passe) est supprimé avec la clé secrète, qui ne quitte jamais Supabase.
// Les bons de commande et factures déjà émis restent 10 ans (obligation comptable).
// À déployer SANS « Verify JWT » : la fonction vérifie elle-même la session.
import { createClient } from 'npm:@supabase/supabase-js@2';

function cleProjet(type: 'publique' | 'secrete'): string {
  const [liste, une, ancienne] = type === 'publique'
    ? ['SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']
    : ['SUPABASE_SECRET_KEYS', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const brut = Deno.env.get(liste);
  if (brut) {
    try {
      const o = JSON.parse(brut) as Record<string, string>;
      const v = o.default ?? Object.values(o)[0];
      if (v) return v;
    } catch { /* format inattendu */ }
  }
  const v = Deno.env.get(une) ?? Deno.env.get(ancienne);
  if (!v) throw new Error(`Clé ${type} du projet introuvable`);
  return v;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reponse = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reponse({ erreur: 'Méthode non autorisée' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jeton) return reponse({ erreur: 'Connexion requise' }, 401);
    const { data: u } = await createClient(url, cleProjet('publique')).auth.getUser(jeton);
    const id = u?.user?.id;
    if (!id) return reponse({ erreur: 'Session expirée : rouvrez l\'appli et réessayez.' }, 401);

    // Effacement des données, en tant que le client lui-même (la base vérifie tout).
    const commeClient = createClient(url, cleProjet('publique'), {
      global: { headers: { Authorization: `Bearer ${jeton}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: n, error } = await commeClient.rpc('supprimer_mes_donnees');
    if (error) return reponse({ erreur: error.message }, 400);

    // Suppression de l'accès (email, mot de passe, session).
    const admin = createClient(url, cleProjet('secrete'), { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: e2 } = await admin.auth.admin.deleteUser(id);
    if (e2) {
      console.error('supprimer-compte : données effacées mais accès non supprimé', id, e2.message);
      return reponse({ erreur: 'Vos données sont effacées, mais la fermeture du compte a échoué. Réessayez dans un instant.' }, 500);
    }
    console.log('supprimer-compte : compte supprimé', id, `${n ?? 0} course(s) anonymisée(s)`);
    return reponse({ ok: true, courses: n ?? 0 });
  } catch (e) {
    console.error('supprimer-compte :', e instanceof Error ? e.message : e);
    return reponse({ erreur: 'Erreur du serveur, réessayez plus tard.' }, 500);
  }
});
