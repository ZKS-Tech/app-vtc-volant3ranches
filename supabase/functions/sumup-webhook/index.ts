// Fonction serveur « sumup-webhook » : SumUp y envoie { event_type, id } à chaque changement de
// statut d'un paiement. Ce message n'est pas signé : on ne lui fait pas confiance et on relit
// toujours le paiement directement chez SumUp avant de confirmer la course.
// À déployer SANS vérification du jeton (« Verify JWT » désactivé) : SumUp n'en envoie pas.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

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

const ok = () => new Response('ok', { status: 200 });
// Erreur passagère (base ou SumUp indisponible) : on répond en erreur pour que SumUp renvoie
// l'avis plus tard ; le rattrapage toutes les 15 minutes reprend aussi le paiement s'il le faut.
const reessayer = (raison: string) => { console.error('sumup-webhook :', raison); return new Response('réessayer', { status: 503 }); };

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok();
  let id: unknown;
  try { ({ id } = await req.json()); } catch { return ok(); } // message illisible : rien à réessayer
  if (typeof id !== 'string' || !/^[\w-]{6,64}$/.test(id)) return ok();
  try {
    const cleSumup = Deno.env.get('SUMUP_API_KEY')!;
    const marchand = Deno.env.get('SUMUP_MERCHANT_CODE')!;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, cleProjet('secrete'));

    // Seuls les paiements créés par l'appli sont relus chez SumUp : un identifiant inventé ne coûte
    // qu'une lecture en base (sinon, des milliers d'appels feraient bloquer la clé SumUp).
    const { data: connu, error: e0 } = await admin.from('paiements').select('id, statut').eq('checkout_id', id).maybeSingle();
    if (e0) return reessayer(`lecture du paiement : ${e0.message}`);
    if (!connu) return ok();

    const r = await fetch(`${SUMUP}/v0.1/checkouts/${id}`, { headers: { Authorization: `Bearer ${cleSumup}` } });
    if (!r.ok) return reessayer(`lecture SumUp ${id} : ${r.status}`);
    const checkout = await r.json();
    if (checkout.merchant_code && checkout.merchant_code !== marchand) return ok();

    if (checkout.status === 'PAID') {
      const tx = (checkout.transactions ?? []).find((t: { status?: string }) => t.status === 'SUCCESSFUL') ?? checkout.transactions?.[0];
      const { data: p, error } = await admin.rpc('confirmer_paiement', {
        p_checkout: id, p_transaction: tx?.id ?? null, p_montant: Number(checkout.amount),
      });
      if (error) {
        // Refus métier (montant insuffisant…) : définitif, inutile de réessayer.
        if (/insuffisant|inconnu/i.test(error.message)) { console.error('confirmer_paiement', error.message); return ok(); }
        return reessayer(`confirmer_paiement : ${error.message}`);
      }
      // Payé en double, après expiration ou annulation : remboursé tout de suite.
      if (p && Number(p.remboursement_du) > Number(p.rembourse)) await rembourser(admin, p.id, cleSumup, marchand);
    } else if (checkout.status === 'FAILED' || checkout.status === 'EXPIRED') {
      const { error } = await admin.rpc('paiement_echoue', { p_checkout: id });
      if (error) return reessayer(`paiement_echoue : ${error.message}`);
    }
    return ok();
  } catch (e) {
    return reessayer(e instanceof Error ? e.message : String(e));
  }
});
