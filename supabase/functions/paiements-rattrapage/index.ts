// Fonction serveur « paiements-rattrapage » : appelée par la base toutes les 15 minutes (pg_cron).
//  • relit chez SumUp les paiements restés « en attente » (webhook perdu, panne passagère) et
//    confirme la course ou marque l'échec ;
//  • relance les remboursements dus qui n'ont pas abouti (SumUp indisponible, appli hors ligne…).
// Elle ne répond qu'à la base : l'appel doit porter le jeton interne (table jetons_internes, lisible
// seulement par le serveur). Sans lui, aucune requête n'est faite chez SumUp.
// À déployer SANS « Verify JWT » (la base n'envoie pas de session).
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const SUMUP = 'https://api.sumup.com';
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

// Rembourse ce que la base a décidé, sans doublon (réservation avant l'appel à SumUp).
// deno-lint-ignore no-explicit-any
export async function rembourser(admin: any, paiementId: string, cleSumup: string, marchand: string) {
  const { data: res } = await admin.rpc('reserver_remboursement', { p_paiement: paiementId });
  const r0 = (res as { reservation: string; montant: number; transaction_id: string }[] | null)?.[0];
  if (!r0) return 0;
  const montant = Math.round(Number(r0.montant) * 100) / 100;
  const rb = await fetch(`${SUMUP}/v1.0/merchants/${marchand}/payments/${r0.transaction_id}/refunds`, {
    method: 'POST', headers: { Authorization: `Bearer ${cleSumup}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: montant }),
  });
  if (!rb.ok) {
    console.error('SumUp remboursement', rb.status, await rb.text());
    await admin.rpc('liberer_remboursement', { p_paiement: paiementId, p_reservation: r0.reservation });
    return 0; // retenté par le rattrapage
  }
  await admin.rpc('remboursement_effectue', { p_paiement: paiementId, p_montant: montant, p_reservation: r0.reservation });
  return montant;
}

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, cleProjet('secrete'));
    const recu = req.headers.get('x-jeton-interne') ?? '';
    const { data: j } = await admin.from('jetons_internes').select('valeur').eq('nom', 'rattrapage').maybeSingle();
    if (!j?.valeur || recu.length !== j.valeur.length || recu !== j.valeur) return json({ erreur: 'Non autorisé' }, 401);

    const cleSumup = Deno.env.get('SUMUP_API_KEY');
    const marchand = Deno.env.get('SUMUP_MERCHANT_CODE');
    if (!cleSumup || !marchand) return json({ erreur: 'Paiement en ligne non configuré' }, 503);

    const { data: liste, error } = await admin.rpc('paiements_a_verifier');
    if (error) throw new Error(error.message);
    const bilan = { verifies: 0, confirmes: 0, echoues: 0, rembourse: 0 };
    for (const p of (liste ?? []) as { id: string; checkout_id: string; statut: string; a_rembourser: boolean }[]) {
      if (p.a_rembourser) { bilan.rembourse += await rembourser(admin, p.id, cleSumup, marchand); continue; }
      bilan.verifies++;
      const r = await fetch(`${SUMUP}/v0.1/checkouts/${encodeURIComponent(p.checkout_id)}`, { headers: { Authorization: `Bearer ${cleSumup}` } });
      if (!r.ok) { console.error('rattrapage : lecture SumUp', p.checkout_id, r.status); continue; }
      const c = await r.json();
      if (c.merchant_code && c.merchant_code !== marchand) continue;
      if (c.status === 'PAID') {
        const tx = (c.transactions ?? []).find((t: { status?: string }) => t.status === 'SUCCESSFUL') ?? c.transactions?.[0];
        const { data: paye, error: e2 } = await admin.rpc('confirmer_paiement', { p_checkout: p.checkout_id, p_transaction: tx?.id ?? null, p_montant: Number(c.amount) });
        if (e2) { console.error('rattrapage : confirmer_paiement', e2.message); continue; }
        bilan.confirmes++;
        if (paye && Number(paye.remboursement_du) > Number(paye.rembourse)) bilan.rembourse += await rembourser(admin, paye.id, cleSumup, marchand);
      } else if ((c.status === 'FAILED' || c.status === 'EXPIRED') && p.statut === 'en_attente') {
        await admin.rpc('paiement_echoue', { p_checkout: p.checkout_id });
        bilan.echoues++;
      }
    }
    console.log('rattrapage', JSON.stringify(bilan));
    return json(bilan);
  } catch (e) {
    console.error('paiements-rattrapage', e);
    return json({ erreur: 'Erreur du rattrapage' }, 500);
  }
});
