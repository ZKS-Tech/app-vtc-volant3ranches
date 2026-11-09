// Tests des fonctions serveur avec SumUp et la base simulés (aucun appel réel).
// Lancer : cd supabase/functions && deno test --allow-env --allow-net --allow-read tests/
// (ou npx deno test …)
import { assert, assertEquals } from 'jsr:@std/assert@1';

type Appel = { url: string; methode: string; corps: unknown };
let appels: Appel[] = [];
let reponses: Record<string, (a: Appel) => unknown> = {};

// fetch simulé : SumUp (api.sumup.com) et la base (supabase.test, appels rpc / tables).
globalThis.fetch = (async (entree: string | URL | Request, init?: RequestInit) => {
  const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
  const methode = init?.method ?? (entree instanceof Request ? entree.method : 'GET');
  const brut = init?.body ?? (entree instanceof Request ? await entree.text() : undefined);
  const corps = typeof brut === 'string' && brut ? JSON.parse(brut) : undefined;
  const a = { url, methode, corps };
  appels.push(a);
  const cle = Object.keys(reponses).find((k) => url.includes(k) && (!k.startsWith('POST ') || methode === 'POST'));
  const cle2 = Object.keys(reponses).find((k) => k.startsWith(methode + ' ') && url.includes(k.slice(methode.length + 1)));
  const f = reponses[cle2 ?? cle ?? ''];
  if (!f) return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  const r = f(a);
  if (r instanceof Response) return r;
  return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

Deno.env.set('SUPABASE_URL', 'http://supabase.test');
// Nouveau format des clés (projets récents) : objets JSON.
Deno.env.set('SUPABASE_PUBLISHABLE_KEYS', JSON.stringify({ default: 'sb_publishable_test' }));
Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: 'sb_secret_test' }));
Deno.env.set('SUMUP_API_KEY', 'sup_sk_test');
Deno.env.set('SUMUP_MERCHANT_CODE', 'MCTEST');

// Deno.serve simulé : on récupère le gestionnaire de chaque fonction.
const gestionnaires: ((r: Request) => Promise<Response>)[] = [];
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: (r: Request) => Promise<Response>) => { gestionnaires.push(h); return {}; };
await import('../acompte/index.ts');
await import('../sumup-webhook/index.ts');
await import('../acompte-rembourser/index.ts');
const [acompte, webhook, rembourser] = gestionnaires;
const requete = (corps: unknown, jeton = 'jeton-client') =>
  new Request('http://local', { method: 'POST', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
const COURSE = '11111111-2222-3333-4444-555555555555';

Deno.test('acompte : crée la page de paiement SumUp et l’enregistre', async () => {
  appels = [];
  reponses = {
    'rpc/acompte_a_payer': () => [{ course_id: COURSE, montant: 17.3, limite: '2026-11-12T10:00:00Z', description: 'Acompte course', deja_paye: false }],
    '/rest/v1/paiements': () => [],
    'POST /v0.1/checkouts': () => ({ id: 'chk-123', status: 'PENDING', hosted_checkout_url: 'https://checkout.sumup.com/pay/chk-123' }),
    'rpc/enregistrer_checkout': () => ({ id: 'p1' }),
  };
  const r = await acompte(requete({ course_id: COURSE }));
  const corps = await r.json();
  assertEquals(r.status, 200);
  assertEquals(corps.url, 'https://checkout.sumup.com/pay/chk-123');
  const creation = appels.find((a) => a.url.endsWith('/v0.1/checkouts'))!;
  const c = creation.corps as Record<string, unknown>;
  assertEquals(c.amount, 17.3);
  assertEquals(c.currency, 'EUR');
  assertEquals(c.merchant_code, 'MCTEST');
  assertEquals(c.return_url, 'http://supabase.test/functions/v1/sumup-webhook');
  assertEquals(c.valid_until, '2026-11-12T10:00:00.000Z');
  assertEquals((c.hosted_checkout as { enabled: boolean }).enabled, true);
  assert(String(c.checkout_reference).length <= 64);
  const enreg = appels.find((a) => a.url.includes('enregistrer_checkout'))!;
  assertEquals((enreg.corps as Record<string, unknown>).p_checkout, 'chk-123');
});

Deno.test('acompte : refusé si la base refuse (autre client, délai dépassé…)', async () => {
  reponses = { 'rpc/acompte_a_payer': () => new Response(JSON.stringify({ message: 'Course introuvable' }), { status: 400, headers: { 'Content-Type': 'application/json' } }) };
  appels = [];
  const r = await acompte(requete({ course_id: COURSE }));
  assertEquals(r.status, 400);
  assert(!appels.some((a) => a.url.includes('sumup.com')), 'aucun appel à SumUp');
});

Deno.test('acompte : sans session, rien n’est fait', async () => {
  appels = [];
  const r = await acompte(new Request('http://local', { method: 'POST', body: JSON.stringify({ course_id: COURSE }) }));
  assertEquals(r.status, 401);
  assertEquals(appels.length, 0);
});

Deno.test('acompte : un lien encore valable est réutilisé', async () => {
  appels = [];
  reponses = {
    'rpc/acompte_a_payer': () => [{ course_id: COURSE, montant: 17.3, limite: null, description: 'x', deja_paye: false }],
    '/rest/v1/paiements': () => [{ checkout_id: 'chk-ancien', lien: 'https://checkout.sumup.com/pay/chk-ancien', montant: 17.3 }],
    'GET /v0.1/checkouts/chk-ancien': () => ({ id: 'chk-ancien', status: 'PENDING' }),
  };
  const r = await acompte(requete({ course_id: COURSE }));
  assertEquals((await r.json()).url, 'https://checkout.sumup.com/pay/chk-ancien');
  assert(!appels.some((a) => a.methode === 'POST' && a.url.endsWith('/v0.1/checkouts')), 'pas de nouveau paiement');
});

Deno.test('webhook : relit le paiement chez SumUp avant de confirmer', async () => {
  appels = [];
  reponses = {
    'GET /v0.1/checkouts/chk-123': () => ({ id: 'chk-123', status: 'PAID', amount: 17.3, merchant_code: 'MCTEST', transactions: [{ id: 'tx-9', status: 'SUCCESSFUL' }] }),
    'rpc/confirmer_paiement': () => ({ id: 'p1', remboursement_du: 0, rembourse: 0, transaction_id: 'tx-9' }),
  };
  const r = await webhook(new Request('http://local', { method: 'POST', body: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'chk-123' }) }));
  assertEquals(r.status, 200);
  const conf = appels.find((a) => a.url.includes('confirmer_paiement'))!;
  assertEquals(conf.corps, { p_checkout: 'chk-123', p_transaction: 'tx-9', p_montant: 17.3 });
  assert(!appels.some((a) => a.url.includes('/refunds')));
});

Deno.test('webhook : un faux message « payé » ne confirme rien', async () => {
  appels = [];
  reponses = { 'GET /v0.1/checkouts/chk-faux': () => ({ id: 'chk-faux', status: 'PENDING', amount: 17.3 }) };
  await webhook(new Request('http://local', { method: 'POST', body: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: 'chk-faux', status: 'PAID' }) }));
  assert(!appels.some((a) => a.url.includes('confirmer_paiement')));
});

Deno.test('webhook : payé trop tard → remboursé aussitôt', async () => {
  appels = [];
  reponses = {
    'GET /v0.1/checkouts/chk-tard': () => ({ id: 'chk-tard', status: 'PAID', amount: 17.3, transactions: [{ id: 'tx-tard', status: 'SUCCESSFUL' }] }),
    'rpc/confirmer_paiement': () => ({ id: 'p2', remboursement_du: 17.3, rembourse: 0, transaction_id: 'tx-tard' }),
    'POST /refunds': () => ({}),
    'rpc/remboursement_effectue': () => ({}),
  };
  await webhook(new Request('http://local', { method: 'POST', body: JSON.stringify({ id: 'chk-tard' }) }));
  const rb = appels.find((a) => a.url.includes('/refunds'))!;
  assertEquals(rb.url, 'https://api.sumup.com/v1.0/merchants/MCTEST/payments/tx-tard/refunds');
  assertEquals(rb.corps, { amount: 17.3 });
  assert(appels.some((a) => a.url.includes('remboursement_effectue')));
});

Deno.test('rembourser : rembourse ce que la base a décidé, rien de plus', async () => {
  appels = [];
  reponses = {
    '/rest/v1/courses': () => ({ id: COURSE }),
    'rpc/remboursements_dus': () => [{ id: 'p1', transaction_id: 'tx-9', remboursement_du: 17.3, rembourse: 0 }],
    'POST /refunds': () => ({}),
    'rpc/remboursement_effectue': () => ({}),
  };
  const r = await rembourser(requete({ course_id: COURSE }));
  assertEquals((await r.json()).rembourse, 17.3);
  assertEquals(appels.filter((a) => a.url.includes('/refunds')).length, 1);

  appels = [];
  reponses['rpc/remboursements_dus'] = () => [];
  const r2 = await rembourser(requete({ course_id: COURSE }));
  assertEquals((await r2.json()).rembourse, 0);
  assert(!appels.some((a) => a.url.includes('/refunds')), 'acompte conservé : aucun remboursement');
});

Deno.test('rembourser : course invisible pour l’utilisateur → refusé', async () => {
  appels = [];
  reponses = { '/rest/v1/courses': () => new Response('null', { status: 406 }) };
  const r = await rembourser(requete({ course_id: COURSE }, 'jeton-autre'));
  assertEquals(r.status, 404);
  assert(!appels.some((a) => a.url.includes('sumup.com')));
});

Deno.test('les appels à la base utilisent la clé secrète pour le serveur, la clé publique pour l’utilisateur', async () => {
  const entetes: { url: string; apikey: string | null; auth: string | null }[] = [];
  const avant = globalThis.fetch;
  globalThis.fetch = (async (e: string | URL | Request, init?: RequestInit) => {
    const url = typeof e === 'string' ? e : e instanceof URL ? e.href : e.url;
    const h = new Headers(init?.headers ?? (e instanceof Request ? e.headers : undefined));
    entetes.push({ url, apikey: h.get('apikey'), auth: h.get('Authorization') });
    return avant(e, init);
  }) as typeof fetch;
  reponses = {
    'rpc/acompte_a_payer': () => [{ course_id: COURSE, montant: 5, limite: null, description: 'x', deja_paye: false }],
    '/rest/v1/paiements': () => [],
    'POST /v0.1/checkouts': () => ({ id: 'chk-k', hosted_checkout_url: 'https://checkout.sumup.com/pay/chk-k' }),
    'rpc/enregistrer_checkout': () => ({}),
  };
  await acompte(requete({ course_id: COURSE }));
  globalThis.fetch = avant;
  const util = entetes.find((x) => x.url.includes('acompte_a_payer'))!;
  const admin = entetes.find((x) => x.url.includes('enregistrer_checkout'))!;
  assertEquals(util.apikey, 'sb_publishable_test');
  assertEquals(util.auth, 'Bearer jeton-client');
  assertEquals(admin.apikey, 'sb_secret_test');
});

Deno.test('acompte : la raison du refus de SumUp est transmise (sans la clé)', async () => {
  reponses = {
    'rpc/acompte_a_payer': () => [{ course_id: COURSE, montant: 1, limite: null, description: 'x', deja_paye: false }],
    '/rest/v1/paiements': () => [],
    'POST /v0.1/checkouts': () => new Response(JSON.stringify({ error_code: 'INVALID', message: 'Validation error', param: 'merchant_code' }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
  };
  const r = await acompte(requete({ course_id: COURSE }));
  const corps = await r.json();
  assertEquals(r.status, 502);
  assert(corps.erreur.includes('400') && corps.erreur.includes('merchant_code') && !corps.erreur.includes('sup_sk'));
});
