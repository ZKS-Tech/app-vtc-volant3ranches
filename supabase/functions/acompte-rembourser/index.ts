// Fonction serveur « acompte-rembourser » : rembourse l'acompte d'une course annulée, selon ce que la
// base a décidé (CGV : client à plus de 24 h ou annulation par Fabrice → remboursé ; sinon conservé).
// Appelée par l'application juste après une annulation, et par le bouton « Rembourser » de Fabrice
// si besoin. Sans effet s'il n'y a rien à rembourser.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUMUP = 'https://api.sumup.com';
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
    if (!cleSumup || !marchand) return reponse({ erreur: 'Paiement en ligne non configuré' }, 503);
    const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { course_id } = await req.json();
    if (!jeton || typeof course_id !== 'string') return reponse({ erreur: 'Requête invalide' }, 400);

    // Seuls le client de la course et Fabrice la voient (règles de la base).
    const utilisateur = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${jeton}` } } });
    const { data: course } = await utilisateur.from('courses').select('id').eq('id', course_id).maybeSingle();
    if (!course) return reponse({ erreur: 'Course introuvable' }, 404);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: dus, error } = await admin.rpc('remboursements_dus', { p_course: course_id });
    if (error) throw new Error(error.message);
    let rembourse = 0;
    for (const p of dus ?? []) {
      const montant = Math.round((Number(p.remboursement_du) - Number(p.rembourse)) * 100) / 100;
      const r = await fetch(`${SUMUP}/v1.0/merchants/${marchand}/payments/${p.transaction_id}/refunds`, {
        method: 'POST', headers: { Authorization: `Bearer ${cleSumup}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: montant }),
      });
      if (!r.ok) {
        console.error('SumUp remboursement', r.status, await r.text());
        return reponse({ erreur: 'SumUp a refusé le remboursement. Réessayez plus tard ou remboursez depuis SumUp.', rembourse }, 502);
      }
      await admin.rpc('remboursement_effectue', { p_paiement: p.id, p_montant: montant });
      rembourse += montant;
    }
    return reponse({ rembourse });
  } catch (e) {
    console.error('acompte-rembourser', e);
    return reponse({ erreur: 'Erreur du serveur de paiement' }, 500);
  }
});
