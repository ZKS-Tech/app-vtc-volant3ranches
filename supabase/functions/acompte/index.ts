// Fonction serveur « acompte » : crée (ou réutilise) la page de paiement SumUp de l'acompte d'une course.
// Appelée par l'application : par le client pour sa course en attente d'acompte, ou par Fabrice
// pour envoyer un lien de paiement à un client qui a réservé par téléphone.
// Réponse : { url, montant, limite } ou { deja_paye: true }.
//
// Secrets (Supabase › Edge Functions › Secrets) : SUMUP_API_KEY, SUMUP_MERCHANT_CODE.
// L'adresse et les clés du projet sont fournies automatiquement par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUMUP = 'https://api.sumup.com';
// Clés du projet fournies par Supabase : anciens noms (ANON / SERVICE_ROLE) ou nouveaux
// (SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS, objets JSON { default: "sb_…" }).
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
    } catch { /* format inattendu : on essaie les autres noms */ }
  }
  const v = Deno.env.get(une) ?? Deno.env.get(ancienne);
  if (!v) throw new Error(`Clé ${type} du projet introuvable`);
  return v;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const cleSumup = Deno.env.get('SUMUP_API_KEY');
    const marchand = Deno.env.get('SUMUP_MERCHANT_CODE');
    if (!cleSumup || !marchand) return reponse({ erreur: 'Paiement en ligne non configuré (clé SumUp manquante)' }, 503);

    const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jeton) return reponse({ erreur: 'Connexion requise' }, 401);
    const { course_id } = await req.json();
    if (typeof course_id !== 'string') return reponse({ erreur: 'Course manquante' }, 400);

    // Avec la session de l'utilisateur : la base vérifie qu'il a le droit de payer cette course.
    const utilisateur = createClient(url, cleProjet('publique'), { global: { headers: { Authorization: `Bearer ${jeton}` } } });
    const { data: lignes, error } = await utilisateur.rpc('acompte_a_payer', { p_course: course_id });
    if (error) return reponse({ erreur: error.message }, 400);
    const a = lignes?.[0];
    if (!a) return reponse({ erreur: 'Course introuvable' }, 404);
    if (a.deja_paye) return reponse({ deja_paye: true, montant: a.montant });

    const admin = createClient(url, cleProjet('secrete'));

    // Un lien encore valable est réutilisé (même montant, pas encore payé).
    const { data: enCours } = await admin.from('paiements').select('*')
      .eq('course_id', course_id).eq('statut', 'en_attente').order('cree_le', { ascending: false }).limit(1);
    if (enCours?.[0]?.lien && Number(enCours[0].montant) === Number(a.montant)) {
      const v = await fetch(`${SUMUP}/v0.1/checkouts/${enCours[0].checkout_id}`, { headers: { Authorization: `Bearer ${cleSumup}` } });
      if (v.ok && (await v.json()).status === 'PENDING') return reponse({ url: enCours[0].lien, montant: a.montant, limite: a.limite });
    }

    const corps: Record<string, unknown> = {
      checkout_reference: `acompte-${course_id}-${Date.now()}`,
      amount: Number(a.montant),
      currency: 'EUR',
      merchant_code: marchand,
      description: String(a.description).slice(0, 255),
      return_url: `${url}/functions/v1/sumup-webhook`, // SumUp y signale chaque changement de statut
      hosted_checkout: { enabled: true },
    };
    if (a.limite) corps.valid_until = new Date(a.limite).toISOString();
    const retour = Deno.env.get('PAIEMENT_RETOUR_URL'); // facultatif : page affichée après le paiement
    if (retour) corps.redirect_url = retour;

    const r = await fetch(`${SUMUP}/v0.1/checkouts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cleSumup}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const checkout = await r.json().catch(() => ({}));
    if (!r.ok || !checkout.id || !checkout.hosted_checkout_url) {
      console.error('SumUp checkout', r.status, JSON.stringify(checkout).slice(0, 500));
      return reponse({ erreur: 'SumUp n’a pas pu créer le paiement. Réessayez dans un instant.' }, 502);
    }

    const { error: e2 } = await admin.rpc('enregistrer_checkout', {
      p_course: course_id, p_montant: Number(a.montant), p_checkout: checkout.id, p_lien: checkout.hosted_checkout_url,
    });
    if (e2) throw new Error(e2.message);
    return reponse({ url: checkout.hosted_checkout_url, montant: a.montant, limite: a.limite });
  } catch (e) {
    console.error('acompte', e);
    return reponse({ erreur: 'Erreur du serveur de paiement' }, 500);
  }
});
