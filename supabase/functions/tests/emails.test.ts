// Tests de la fonction « emails » : Brevo, la base et la fonction PDF sont simulés.
// Avec EMAILS_SORTIE=<dossier>, les emails produits sont aussi écrits en HTML pour les regarder.
import { assert, assertEquals } from 'jsr:@std/assert@1';

type Appel = { url: string; methode: string; corps: unknown; entetes: Headers };
let appels: Appel[] = [];
let reponses: Record<string, (a: Appel) => unknown> = {};
const avant = globalThis.fetch;
const simule = (async (entree: string | URL | Request, init?: RequestInit) => {
  const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
  const methode = init?.method ?? (entree instanceof Request ? entree.method : 'GET');
  const brut = init?.body ?? (entree instanceof Request ? await entree.text() : undefined);
  const corps = typeof brut === 'string' && brut ? JSON.parse(brut) : undefined;
  const a = { url, methode, corps, entetes: new Headers(init?.headers ?? (entree instanceof Request ? entree.headers : undefined)) };
  appels.push(a);
  const cle = Object.keys(reponses).find((k) => (k.startsWith(methode + ' ') ? url.includes(k.slice(methode.length + 1)) : !/^(GET|POST|PATCH) /.test(k) && url.includes(k)));
  const r = cle ? reponses[cle](a) : [];
  if (r instanceof Response) return r;
  if (r instanceof Uint8Array) return new Response(r as unknown as BodyInit, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
  return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;
globalThis.fetch = simule;

Deno.env.set('SUPABASE_URL', 'http://supabase.test');
Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: 'sb_secret_test' }));
Deno.env.set('SUPABASE_PUBLISHABLE_KEYS', JSON.stringify({ default: 'sb_publishable_test' }));
Deno.env.set('BREVO_API_KEY', 'xkeysib-test');
Deno.env.set('EMAIL_EXPEDITEUR', 'reservation@volant3ranches-vtc.fr');

const gestionnaires: ((r: Request) => Promise<Response>)[] = [];
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: (r: Request) => Promise<Response>) => { gestionnaires.push(h); return {}; };
const module = await import('../emails/index.ts');
const envoyer = gestionnaires.at(-1)!;
const executer = () => envoyer(new Request('http://local', { method: 'POST', body: '{}' }));

const PARAMS = { id: 1, emails_actifs: true, paiements_test: false, email_chauffeur: 'fabrice@exemple.fr', raison_sociale: 'Volant3ranches', siege: '11 chemin de la baissade, 81220 Viterbe', siren: '932 513 443', telephone_chauffeur: '+33616531491' };
const COURSE = {
  id: 'c1', nom: 'Léa <b>Martin</b>', telephone: '06 11 11 11 11', email: 'lea@exemple.fr', date_heure: '2026-11-12T08:00:00Z',
  depart_libelle: 'Gare de Castres', depart_detail: 'Avenue Albert 1er, 81100 Castres', arrivee_libelle: 'Aéroport Toulouse-Blagnac', arrivee_detail: null,
  aller_retour: false, passagers: 2, bagages: 1, numero_vol_train: 'AF 6127', offre_id: 'tesla', montant: 173, motif_refus: null, frais_annulation: null,
  commentaire: null, acompte_montant: 17.3, acompte_limite: '2026-11-10T10:30:00Z', acompte_paye_le: '2026-11-10T10:00:00Z', source: 'appli',
};
const PDF = new TextEncoder().encode('%PDF-1.7 faux pdf de test');
const base = (file: unknown[]) => ({
  '/rest/v1/parametres': () => PARAMS,
  'rpc/prendre_emails': () => file,
  '/rest/v1/courses': () => COURSE,
  '/rest/v1/documents': () => ({ id: 'd1', numero: 'BC-2026-0012', type: 'commande', total_ttc: 173, test: false }),
  'POST /functions/v1/document-pdf': () => ({ url: 'http://supabase.test/storage/v1/object/sign/documents/bc.pdf?token=x', numero: 'BC-2026-0012' }),
  '/storage/v1/object/sign/': () => PDF,
  'POST api.brevo.com': () => new Response(JSON.stringify({ messageId: '<abc@smtp-relay.brevo.com>' }), { status: 201 }),
  'rpc/email_resultat': () => null,
});

Deno.test('confirmation : envoyée par Brevo avec le bon de commande en PDF', async () => {
  appels = [];
  reponses = base([{ id: 'e1', type: 'confirmation', course_id: 'c1', document_id: 'd1', destinataire: 'lea@exemple.fr', nom: 'Léa Martin', donnees: {} }]);
  const r = await executer();
  assertEquals((await r.json()).envoyes, 1);
  const pdf = appels.find((a) => a.url.endsWith('/functions/v1/document-pdf'))!;
  assertEquals(pdf.entetes.get('x-cle-interne'), 'sb_secret_test');
  const b = appels.find((a) => a.url.includes('api.brevo.com'))!;
  const c = b.corps as Record<string, any>;
  assertEquals(b.entetes.get('api-key'), 'xkeysib-test');
  assertEquals(c.to[0].email, 'lea@exemple.fr');
  assertEquals(c.sender.email, 'reservation@volant3ranches-vtc.fr');
  assertEquals(c.replyTo.email, 'fabrice@exemple.fr');
  assert(c.subject.startsWith('Course confirmée'), c.subject);
  assertEquals(c.attachment[0].name, 'Bon de commande BC-2026-0012.pdf');
  assertEquals(atob(c.attachment[0].content), '%PDF-1.7 faux pdf de test');
  assert(!c.htmlContent.includes('<b>Martin'), 'aucun HTML injecté par le nom du client');
  assert(c.htmlContent.includes('17,30 €') && c.htmlContent.includes('155,70 €'), 'acompte et reste à payer');
  assert(c.htmlContent.includes('src="http://supabase.test/functions/v1/emails?logo=1"'), 'logo dans le bandeau');
  const fin = appels.find((a) => a.url.includes('email_resultat'))!;
  assertEquals((fin.corps as Record<string, unknown>).p_ok, true);
  const sortie = Deno.env.get('EMAILS_SORTIE');
  if (sortie) await Deno.writeTextFile(`${sortie}/confirmation.html`, c.htmlContent);
});

Deno.test('refus de Brevo : email remis en file avec la raison', async () => {
  appels = [];
  reponses = { ...base([{ id: 'e2', type: 'refus', course_id: 'c1', document_id: null, destinataire: 'lea@exemple.fr', nom: 'Léa', donnees: {} }]),
    'POST api.brevo.com': () => new Response(JSON.stringify({ code: 'unauthorized', message: 'Key not found' }), { status: 401 }) };
  await executer();
  const fin = appels.find((a) => a.url.includes('email_resultat'))!.corps as Record<string, unknown>;
  assertEquals(fin.p_ok, false);
  assert(String(fin.p_erreur).includes('Brevo 401'), String(fin.p_erreur));
});

Deno.test('emails désactivés ou Brevo non configuré : rien n’est pris dans la file', async () => {
  appels = [];
  reponses = { ...base([]), '/rest/v1/parametres': () => ({ ...PARAMS, emails_actifs: false }) };
  await executer();
  assert(!appels.some((a) => a.url.includes('prendre_emails')));
  Deno.env.delete('BREVO_API_KEY');
  appels = [];
  const r = await executer();
  assertEquals(r.status, 503);
  assertEquals(appels.length, 0);
  Deno.env.set('BREVO_API_KEY', 'xkeysib-test');
});

Deno.test('le HTML fourni par un client est neutralisé', () => {
  const x = { type: 'chauffeur_demande', course: { ...COURSE, nom: '<img src=x onerror=alert(1)>', commentaire: '<script>x</script>' }, offre: 'Offre',
    donnees: {}, document: null, vendeur: { raison_sociale: 'V', siege: 'S', siren: '1', telephone: '+33616531491' }, test: false };
  const { html } = module.assembler(module.composer(x), x);
  assert(!html.includes('<script>x') && !html.includes('<img src=x') && html.includes('&lt;script&gt;'));
});

Deno.test('chaque type d’email a un contenu complet', async () => {
  const types = ['demande_recue', 'acompte', 'confirmation', 'refus', 'expiree', 'annulation', 'remboursement', 'facture', 'chauffeur_demande', 'chauffeur_annulation'];
  const sortie = Deno.env.get('EMAILS_SORTIE');
  for (const type of types) {
    const x = { type, course: { ...COURSE, nom: 'Léa Martin', motif_refus: 'Indisponible à cet horaire', frais_annulation: 0 }, offre: 'Offre Confort · Tesla Model 3',
      donnees: { montant: 17.3, par_chauffeur: false }, document: { numero: 'F-2026-0004', type: 'facture', total_ttc: 173 },
      vendeur: { raison_sociale: 'Volant3ranches', siege: 'Viterbe', siren: '932 513 443', telephone: '+33616531491' }, test: false };
    const e = module.composer(x);
    assert(e.sujet.length > 5 && e.titre && e.paragraphes.length && e.details.length, type);
    const { html, texte } = module.assembler(e, x);
    assert(html.includes('06 16 53 14 91') && texte.includes(e.titre), type);
    if (sortie) await Deno.writeTextFile(`${sortie}/${type}.html`, html);
  }
  assertEquals(module.quand('2026-11-12T08:00:00Z'), 'jeudi 12 novembre à 9h00');
  assertEquals(module.de('Evan Legouez'), 'd’Evan Legouez');
  assertEquals(module.de('Léa Martin'), 'de Léa Martin');
});

Deno.test('client anglophone : emails en anglais, Fabrice reste en français', async () => {
  const sortie = Deno.env.get('EMAILS_SORTIE');
  for (const type of ['demande_recue', 'acompte', 'confirmation', 'refus', 'expiree', 'annulation', 'remboursement', 'facture']) {
    const x = { type, course: { ...COURSE, nom: 'John Smith', langue: 'en', motif_refus: 'Not available at that time', frais_annulation: 0 }, offre: 'Offre Confort · Tesla Model 3',
      donnees: { montant: 17.3, par_chauffeur: false }, document: { numero: 'F-2026-0004', type: 'facture', total_ttc: 173 },
      vendeur: { raison_sociale: 'Volant3ranches', siege: 'Viterbe', siren: '932 513 443', telephone: '+33616531491' }, test: false };
    const e = module.composer(x);
    assert(e.paragraphes[0] === 'Hello John,', type);
    const { html, texte } = module.assembler(e, x);
    assert(html.includes('lang="en"') && html.includes('+33 6 16 53 14 91') && html.includes('€173.00 incl. VAT'), type);
    assert(html.includes('Castres station') && html.includes('Toulouse-Blagnac Airport'), type);
    assert(!/Bonjour|Départ|Véhicule/.test(texte), `${type} : reste du français`);
    if (sortie) await Deno.writeTextFile(`${sortie}/en-${type}.html`, html);
  }
  assertEquals(module.quandEn('2026-11-12T08:00:00Z'), 'Thursday 12 November at 09:00');
  const pourFabrice = { type: 'chauffeur_demande', course: { ...COURSE, nom: 'John Smith', langue: 'en' }, offre: 'Offre Confort · Tesla Model 3',
    donnees: {}, document: null, vendeur: { raison_sociale: 'V', siege: 'S', siren: '1', telephone: '+33616531491' }, test: false };
  assert(module.composer(pourFabrice).titre.startsWith('Nouvelle demande'));
});

globalThis.addEventListener('unload', () => { globalThis.fetch = avant; });

Deno.test('le logo du bandeau est servi en PNG, mis en cache, sans toucher à la file', async () => {
  appels = [];
  const r = await envoyer(new Request('http://local/functions/v1/emails?logo=1'));
  assertEquals(r.headers.get('Content-Type'), 'image/png');
  const octets = new Uint8Array(await r.arrayBuffer());
  assertEquals([...octets.slice(1, 4)].map((b) => String.fromCharCode(b)).join(''), 'PNG');
  assertEquals(appels.length, 0);
});
