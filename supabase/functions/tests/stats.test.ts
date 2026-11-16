// Tests de la fonction « stats » : GA4 et la session Supabase sont simulés.
import { assert, assertEquals } from 'jsr:@std/assert@1';

let appels: { url: string; corps: any }[] = [];
let sessionValide = true;
globalThis.fetch = (async (entree: string | URL | Request, init?: RequestInit) => {
  const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
  const brut = init?.body ?? (entree instanceof Request ? await entree.text() : undefined);
  appels.push({ url, corps: typeof brut === 'string' && brut ? JSON.parse(brut) : undefined });
  if (url.includes('/auth/v1/user')) return new Response(JSON.stringify(sessionValide ? { id: 'u1', aud: 'authenticated' } : { message: 'invalid' }), { status: sessionValide ? 200 : 401, headers: { 'Content-Type': 'application/json' } });
  return new Response(null, { status: 204 });
}) as typeof fetch;
Deno.env.set('SUPABASE_URL', 'http://supabase.test');
Deno.env.set('SUPABASE_PUBLISHABLE_KEYS', JSON.stringify({ default: 'sb_publishable_test' }));
Deno.env.set('GA4_MEASUREMENT_ID', 'G-TEST123');
Deno.env.set('GA4_API_SECRET', 'secret-ga4');

const gestionnaires: ((r: Request) => Promise<Response>)[] = [];
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: (r: Request) => Promise<Response>) => { gestionnaires.push(h); return {}; };
const module = await import('../stats/index.ts');
const stats = gestionnaires.at(-1)!;
const envoyer = (corps: unknown, jeton = 'jeton') => stats(new Request('http://local', { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: JSON.stringify(corps) }));

Deno.test('événements relayés vers le serveur européen de GA4, filtrés', async () => {
  appels = []; sessionValide = true;
  const r = await envoyer({ client_id: 'abc12345.678', session_id: 1700000000, evenements: [
    { nom: 'estimation_affichee', params: { offre: 'tesla', km: 51.83, prix: 93, email: 'lea@exemple.fr', nom: 'Léa', telephone: '0611' } },
    { nom: 'evenement_inconnu', params: { offre: 'x' } },
    { nom: 'demande_envoyee', params: { aller_retour: true, offre: '<script>van</script>' } },
  ] });
  assertEquals(r.status, 204);
  const ga = appels.find((a) => a.url.includes('google-analytics.com'))!;
  assert(ga.url.startsWith('https://region1.google-analytics.com/mp/collect?measurement_id=G-TEST123&api_secret=secret-ga4'));
  assertEquals(ga.corps.client_id, 'abc12345.678');
  assertEquals(ga.corps.events.length, 2);
  const p = ga.corps.events[0].params;
  assertEquals([p.offre, p.km, p.prix, p.session_id], ['tesla', 51.83, 93, 1700000000]);
  assert(!('email' in p) && !('nom' in p) && !('telephone' in p), 'aucune donnée personnelle');
  assertEquals(ga.corps.events[1].params.aller_retour, 'oui');
  assertEquals(ga.corps.events[1].params.offre, 'scriptvanscript');
});

Deno.test('sans session valide de l’appli : rien n’est envoyé à Google', async () => {
  appels = []; sessionValide = false;
  const r = await envoyer({ client_id: 'abc12345.678', evenements: [{ nom: 'ouverture_app' }] }, 'faux');
  assertEquals(r.status, 401);
  assert(!appels.some((a) => a.url.includes('google-analytics')));
});

Deno.test('GA4 pas encore configuré : l’appli n’est jamais gênée', async () => {
  appels = []; sessionValide = true;
  Deno.env.delete('GA4_API_SECRET');
  const r = await envoyer({ client_id: 'abc12345.678', evenements: [{ nom: 'ouverture_app' }] });
  assertEquals(r.status, 204);
  assertEquals(appels.length, 0);
  Deno.env.set('GA4_API_SECRET', 'secret-ga4');
});

Deno.test('au plus 25 événements par envoi', () => {
  const evts = Array.from({ length: 40 }, () => ({ nom: 'adresse_saisie' }));
  assertEquals(module.nettoyer(evts, 1).length, 25);
});
