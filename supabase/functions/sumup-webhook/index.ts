// Fonction serveur « sumup-webhook » : SumUp y envoie { event_type, id } à chaque changement de
// statut d'un paiement. Ce message n'est pas signé : on ne lui fait pas confiance et on relit
// toujours le paiement directement chez SumUp avant de confirmer la course.
// À déployer SANS vérification du jeton (« Verify JWT » désactivé) : SumUp n'en envoie pas.
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

const ok = () => new Response('ok', { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok();
  try {
    const { id } = await req.json().catch(() => ({}));
    if (typeof id !== 'string' || !/^[\w-]{6,64}$/.test(id)) return ok();
    const cleSumup = Deno.env.get('SUMUP_API_KEY')!;
    const marchand = Deno.env.get('SUMUP_MERCHANT_CODE')!;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, cleProjet('secrete'));

    const r = await fetch(`${SUMUP}/v0.1/checkouts/${id}`, { headers: { Authorization: `Bearer ${cleSumup}` } });
    if (!r.ok) { console.error('SumUp lecture', id, r.status); return ok(); }
    const checkout = await r.json();
    if (checkout.merchant_code && checkout.merchant_code !== marchand) return ok();

    if (checkout.status === 'PAID') {
      const tx = (checkout.transactions ?? []).find((t: { status?: string }) => t.status === 'SUCCESSFUL') ?? checkout.transactions?.[0];
      const { data: p, error } = await admin.rpc('confirmer_paiement', {
        p_checkout: id, p_transaction: tx?.id ?? null, p_montant: Number(checkout.amount),
      });
      if (error) { console.error('confirmer_paiement', error.message); return ok(); }
      // Payé après expiration ou annulation : remboursé tout de suite.
      if (p && Number(p.remboursement_du) > Number(p.rembourse) && p.transaction_id) {
        const montant = Number(p.remboursement_du) - Number(p.rembourse);
        const rb = await fetch(`${SUMUP}/v1.0/merchants/${marchand}/payments/${p.transaction_id}/refunds`, {
          method: 'POST', headers: { Authorization: `Bearer ${cleSumup}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: montant }),
        });
        if (rb.ok) await admin.rpc('remboursement_effectue', { p_paiement: p.id, p_montant: montant });
        else console.error('SumUp remboursement', rb.status, await rb.text());
      }
    } else if (checkout.status === 'FAILED' || checkout.status === 'EXPIRED') {
      await admin.rpc('paiement_echoue', { p_checkout: id });
    }
    return ok();
  } catch (e) {
    console.error('sumup-webhook', e);
    return ok(); // SumUp réessaie en cas d'erreur ; on ne bloque pas sur un message mal formé
  }
});
