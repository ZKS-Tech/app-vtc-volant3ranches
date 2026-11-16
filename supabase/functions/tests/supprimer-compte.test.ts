// Tests de la fonction « supprimer-compte » : Supabase (session, base, administration) est simulé.
import { assert, assertEquals } from 'jsr:@std/assert@1';

let appels: { url: string; methode: string; auth: string | null; cle: string | null }[] = [];
let sessionValide = true;
let erreurBase: string | null = null;
globalThis.fetch = (async (entree: string | URL | Request, init?: RequestInit) => {
  const req = new Request(entree, init);
  const url = req.url;
  appels.push({ url, methode: req.method, auth: req.headers.get('Authorization'), cle: req.headers.get('apikey') });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/auth/v1/user')) return sessionValide ? json({ id: '0b5d6c1e-1111-4222-8333-444455556666', aud: 'authenticated' }) : json({ message: 'invalid' }, 401);
  if (url.includes('/rest/v1/rpc/supprimer_mes_donnees')) return erreurBase ? json({ message: erreurBase, code: 'P0001' }, 400) : json(3);
  if (url.includes('/auth/v1/admin/users/0b5d6c1e-1111-4222-8333-444455556666')) return json({});
  return json({}, 404);
}) as typeof fetch;
Deno.env.set('SUPABASE_URL', 'http://supabase.test');
Deno.env.set('SUPABASE_PUBLISHABLE_KEYS', JSON.stringify({ default: 'sb_publishable_test' }));
Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: 'sb_secret_test' }));

const gestionnaires: ((r: Request) => Promise<Response>)[] = [];
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: (r: Request) => Promise<Response>) => { gestionnaires.push(h); return {}; };
await import('../supprimer-compte/index.ts');
const fonction = gestionnaires.at(-1)!;
const appeler = (jeton = 'jeton-client') => fonction(new Request('http://local', { method: 'POST', headers: { Authorization: `Bearer ${jeton}` } }));

Deno.test('données effacées en tant que le client, puis accès supprimé avec la clé secrète', async () => {
  appels = []; sessionValide = true; erreurBase = null;
  const r = await appeler();
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { ok: true, courses: 3 });
  const rpc = appels.find((a) => a.url.includes('/rpc/supprimer_mes_donnees'))!;
  assertEquals(rpc.auth, 'Bearer jeton-client');
  const admin = appels.find((a) => a.url.includes('/admin/users/0b5d6c1e-1111-4222-8333-444455556666') && a.methode === 'DELETE')!;
  assert(admin, 'accès supprimé');
  assertEquals(admin.auth, 'Bearer sb_secret_test');
  assert(appels.indexOf(rpc) < appels.indexOf(admin), 'les données sont effacées avant l’accès');
});

Deno.test('course à venir : refus expliqué, le compte reste', async () => {
  appels = []; sessionValide = true; erreurBase = 'Vous avez une course prévue le 15/11 à 12h00 : annulez-la d\'abord, ou appelez Fabrice.';
  const r = await appeler();
  assertEquals(r.status, 400);
  assert((await r.json()).erreur.startsWith('Vous avez une course prévue'));
  assert(!appels.some((a) => a.url.includes('/admin/users') && a.methode === 'DELETE'));
});

Deno.test('sans session valide : rien n’est supprimé', async () => {
  appels = []; sessionValide = false; erreurBase = null;
  const r = await appeler('faux');
  assertEquals(r.status, 401);
  assert(!appels.some((a) => a.url.includes('/rpc/') || a.url.includes('/admin/')));
});
