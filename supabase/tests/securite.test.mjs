// Tests de la base : prix, droits des clients et du chauffeur, sur un PostgreSQL local (PGlite).
// Lancer : cd supabase/tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'ECHEC') + ' ' + msg); if (!cond) process.exitCode = 1; };
const echoue = async (fn, msg) => { try { await fn(); ok(false, msg + ' (aurait dû échouer)'); } catch (e) { ok(true, msg + ' → ' + e.message); } };

// Simulation minimale de Supabase : schéma auth, rôles, publication temps réel.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
`);
await db.exec(readFileSync(process.argv[2], 'utf8'));
ok(true, 'migration 1 appliquée sans erreur');
// une course existante avant la migration 2, pour tester le rattachement des fiches
await db.exec(`insert into auth.users values ('44444444-4444-4444-4444-444444444444');
  insert into public.courses (client_id, depart_libelle, arrivee_libelle, date_heure, passagers, bagages, offre_id, distance_km, montant, prix_km, nom, telephone, email)
  values ('44444444-4444-4444-4444-444444444444','A','B', now() + interval '2 days', 1, 0, 'tesla', 10, 20, 1.8, 'Ancien Client', '+33 6 99 88 77 66', 'ancien@exemple.fr');`);
if (process.argv[3]) { await db.exec(readFileSync(process.argv[3], 'utf8')); ok(true, 'migration 2 appliquée sans erreur'); }
if (process.argv[4]) {
  // Simulation du service d'itinéraire IGN (extension http de Supabase) : distance ≈ vol d'oiseau × 1,3.
  await db.exec(`
    create schema if not exists extensions;
    create type extensions.http_response as (status int, content_type varchar, headers text, content varchar);
    create function extensions.http_set_curlopt(text, text) returns boolean language sql as $$ select true $$;
    create function extensions.http_get(uri varchar) returns extensions.http_response language plpgsql as $f$
    declare m text[]; lon1 float8; lat1 float8; lon2 float8; lat2 float8; km float8;
    begin
      if current_setting('test.ign_panne', true) = 'oui' then return row(503, 'text/plain', '', 'indisponible')::extensions.http_response; end if;
      if uri not like '%resource=bdtopo-valhalla%' and uri not like '%resource=bdtopo-pgr%' and current_setting('test.moteurs_actuels', true) = 'oui' then
        return row(400, 'application/json', '', '{"error":{"message":"Parameter resource is invalid"}}')::extensions.http_response;
      end if;
      m := regexp_match(uri, 'start=([-0-9.]+),([-0-9.]+)&end=([-0-9.]+),([-0-9.]+)');
      lon1 := m[1]::float8; lat1 := m[2]::float8; lon2 := m[3]::float8; lat2 := m[4]::float8;
      km := 1.3 * 111.2 * sqrt(power((lon2 - lon1) * cos(radians((lat1 + lat2) / 2)), 2) + power(lat2 - lat1, 2));
      return row(200, 'application/json', '', json_build_object('distance', round(km::numeric, 2), 'duration', round((km / 70 * 60)::numeric, 1), 'distanceUnit', 'kilometer', 'timeUnit', 'minute')::text)::extensions.http_response;
    end $f$;
    grant usage on schema extensions to anon, authenticated;
  `);
  await db.exec(readFileSync(process.argv[4], 'utf8').replace(/create extension if not exists http[^;]*;/, ''));
  ok(true, 'migration 3 appliquée sans erreur');
  if (process.argv[5]) { await db.exec(readFileSync(process.argv[5], 'utf8')); ok(true, 'migration 4 appliquée sans erreur'); }
  if (process.argv[6]) { await db.exec(readFileSync(process.argv[6], 'utf8')); ok(true, 'migration 5 appliquée sans erreur'); }
  if (process.argv[7]) {
    // Simulation de pg_net (les envois sont notés dans une table) et de pg_cron.
    await db.exec(`
      create schema if not exists net;
      create table net.envois (id serial, url text, body jsonb);
      create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
        returns bigint language sql as $$ insert into net.envois (url, body) values (url, body) returning id::bigint $$;
      create schema if not exists cron;
      create table cron.taches (nom text, quand text, commande text);
      create function cron.schedule(nom text, quand text, commande text) returns bigint language sql as $$ insert into cron.taches values (nom, quand, commande); select 1::bigint $$;
      grant usage on schema net to anon, authenticated;
      grant select, insert, delete on net.envois to anon, authenticated; grant usage on sequence net.envois_id_seq to anon, authenticated;
    `);
    await db.exec(readFileSync(process.argv[7], 'utf8').replace(/create extension if not exists pg_net;/, '').replace(/create extension if not exists pg_cron;/, ''));
    ok(true, 'migration 6 appliquée sans erreur');
  }
  if (process.argv[8]) { await db.exec(readFileSync(process.argv[8], 'utf8')); ok(true, 'migration 7 appliquée sans erreur'); }
  if (process.argv[10]) {
    await db.exec(readFileSync(process.argv[9], 'utf8'));
    await db.exec(readFileSync(process.argv[10], 'utf8'));
    // Les tests précédents supposent une confirmation directe : l'acompte est testé à la fin.
    await db.exec(`update public.parametres set acompte_pourcent = 0`);
    ok(true, 'migration 8 (acompte) appliquée sans erreur');
  }
  if (process.argv[11]) { await db.exec(readFileSync(process.argv[11], 'utf8')); ok(true, 'migration 9 (factures) appliquée sans erreur'); }
  if (process.argv[12]) { await db.exec(readFileSync(process.argv[12], 'utf8')); ok(true, 'migration 10 (mode test) appliquée sans erreur'); }
  if (process.argv[13]) {
    // Simulation de auth.jwt() de Supabase (revendications de la session : email, is_anonymous).
    await db.exec(`create or replace function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
      grant execute on function auth.jwt() to anon, authenticated;`);
    await db.exec(readFileSync(process.argv[13], 'utf8'));
    ok(true, 'migration 11 (comptes) appliquée sans erreur');
  }
  if (process.argv[14]) { await db.exec(readFileSync(process.argv[14], 'utf8')); ok(true, 'migration 12 (emails) appliquée sans erreur'); }
  if (process.argv[15]) {
    await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end $$;`);
    await db.exec(readFileSync(process.argv[15], 'utf8'));
    ok(true, 'migration 13 (droits serveur) appliquée sans erreur');
  }
  if (process.argv[16]) { await db.exec(readFileSync(process.argv[16], 'utf8')); ok(true, 'migration 14 (arrondi) appliquée sans erreur'); }
  if (process.argv[17]) {
    // Colonnes de auth.users utilisées par l'effacement automatique.
    await db.exec(`alter table auth.users add column created_at timestamptz not null default now(),
      add column last_sign_in_at timestamptz, add column is_anonymous boolean not null default false;
      create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade,
        created_at timestamptz default now(), updated_at timestamptz default now(), refreshed_at timestamp without time zone)`);
    await db.exec(readFileSync(process.argv[17], 'utf8'));
    ok(true, 'migration 15 (effacement) appliquée sans erreur');
  }
}



const client = '11111111-1111-1111-1111-111111111111';
const autre = '22222222-2222-2222-2222-222222222222';
const fabrice = '33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users values ('${client}'), ('${autre}'), ('${fabrice}');
  insert into public.profils (id, role, nom) values ('${fabrice}', 'chauffeur', 'Fabrice');`);
const en = async (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);

// Prix : un mardi 10h (jour), 87,5 km Tesla → 157,50 € comme le prototype.
await en(null);
let r = await q(`select * from public.calculer_prix('tesla', 87.5, '2026-11-10 10:00+01', false)`);
ok(Number(r[0].montant) === 157.5 && r[0].majorations.length === 0, `prix jour Tesla 87,5 km = ${r[0].montant} €`);
r = await q(`select * from public.calculer_prix('tesla', 87.5, '2026-11-10 23:00+01', false)`);
ok(Number(r[0].montant) === 192.5, `prix nuit = ${r[0].montant} € (${r[0].majorations})`);
r = await q(`select * from public.calculer_prix('van', 10, '2026-11-14 10:00+01', false)`);
ok(Number(r[0].montant) === 35, `minimum Van un samedi = ${r[0].montant} € (${r[0].majorations})`);
r = await q(`select * from public.calculer_prix('tesla', 50, '2026-12-25 10:00+01', true)`);
ok(Number(r[0].montant) === 209, `aller-retour un jour férié = ${r[0].montant} € (${r[0].majorations})`);
r = await q(`select count(*)::int n from public.offres`);
ok(r[0].n === 2, 'tarifs lisibles sans compte');
await echoue(() => q(`select * from public.courses`), 'visiteur sans compte ne lit pas les courses');

// Demande par le client.
await en(client);
const demande = (uid, km = 87.5, pass = 2, offre = 'tesla') => q(`select * from public.creer_demande(
  '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6,"lon":2.23,"type":"gare"}',
  '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.63,"lon":1.36,"type":"aeroport"}',
  now() + interval '3 days', false, ${pass}, 1, 'AF 6127', '${offre}', ${km}, 75,
  'Claire Martin', '06 12 34 56 78', 'claire@exemple.fr', null)`);
r = await demande(client);
const id = r[0].id;
ok(r[0].statut === 'envoyee' && Number(r[0].montant) > 0, `demande créée (${r[0].montant} €, statut ${r[0].statut})`);
await echoue(() => demande(client, 87.5, 5, 'tesla'), 'Tesla refusée pour 5 passagers');
await echoue(() => q(`insert into public.courses (depart_libelle, arrivee_libelle, date_heure, passagers, bagages, offre_id, distance_km, montant, prix_km, nom, telephone, email) values ('a','b',now(),1,0,'tesla',10,2,0.2,'x','0','x@y')`), 'insertion directe interdite (prix truqué)');
await echoue(() => q(`update public.courses set statut = 'confirmee' where id = '${id}'`).then((x) => { if (true) throw new Error('aucun droit de mise à jour'); }), 'le client ne peut pas confirmer lui-même');
await echoue(() => q(`select public.repondre_demande('${id}', true)`), 'repondre_demande réservé au chauffeur');
await echoue(() => q(`update public.profils set role = 'chauffeur' where id = '${client}'`), 'le client ne peut pas se donner le rôle chauffeur');
r = await q(`select count(*)::int n from public.courses`);
ok(r[0].n === 1, 'le client voit sa course');

await en(autre);
r = await q(`select count(*)::int n from public.courses`);
ok(r[0].n === 0, 'un autre client ne voit pas cette course');

// Fabrice confirme.
await en(fabrice);
r = await q(`select count(*)::int n from public.courses`);
ok(r[0].n === 2, `Fabrice voit toutes les demandes (${r[0].n})`);
r = await q(`select * from public.repondre_demande('${id}', true)`);
ok(r[0].statut === 'confirmee' && r[0].confirmee_le, 'Fabrice confirme la demande');
await echoue(() => q(`select public.repondre_demande('${id}', false)`), 'une demande déjà traitée ne se retraite pas');
r = await q(`update public.offres set prix_km_jour = 1.90 where id = 'tesla' returning prix_km_jour`);
ok(Number(r[0].prix_km_jour) === 1.9, 'Fabrice modifie un tarif');

// Annulation par le client à plus de 24 h : gratuite.
await en(client);
r = await q(`select * from public.annuler_course('${id}')`);
ok(r[0].statut === 'annulee' && Number(r[0].frais_annulation) === 0, `annulation à J-3 : frais ${r[0].frais_annulation} €`);
await en(client);
await echoue(() => q(`update public.offres set prix_km_jour = 0.10 where id = 'tesla' returning id`).then((x) => { if (!x.length) throw new Error('aucune ligne modifiée'); }), 'un client ne modifie pas les tarifs');

if (process.argv[3]) {
  console.log('--- espace chauffeur');
  await en(fabrice);
  r = await q(`select nom, telephone_norm from public.fiches_clients order by nom`);
  ok(r.some((f) => f.nom === 'Ancien Client' && f.telephone_norm === '0699887766'), 'course existante rattachée à une fiche (+33 normalisé)');
  ok(r.some((f) => f.nom === 'Claire Martin' && f.telephone_norm === '0612345678'), 'demande appli rattachée à la fiche de Claire');
  const nbFiches = r.length;
  await en(client);
  await demande(client);
  await en(fabrice);
  r = await q(`select count(*)::int n from public.fiches_clients`);
  ok(r[0].n === nbFiches, 'un client qui revient garde la même fiche');
  r = await q(`select * from public.creer_course_manuelle(null, 'Jean Dupont', '07 11 22 33 44', null,
    '{"ref":"albi","libelle":"Albi","lat":43.93,"lon":2.15,"type":"ville"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.63,"lon":1.36,"type":"aeroport"}',
    now() + interval '1 day', false, 1, 1, null, 'tesla', 80, 70, null, 'telephone', 'Réservé par téléphone')`);
  ok(r[0].statut === 'confirmee' && r[0].source === 'telephone' && !r[0].prix_ajuste && r[0].client_id === null, `course téléphone saisie et confirmée (${r[0].montant} €)`);
  const ficheJean = r[0].fiche_id;
  r = await q(`select * from public.creer_course_manuelle('${ficheJean}', null, null, null,
    '{"ref":"albi","libelle":"Albi"}', '{"ref":"tls","libelle":"Aéroport"}',
    now() + interval '5 days', false, 1, 1, null, 'tesla', 80, 70, 140, 'telephone', null)`);
  ok(Number(r[0].montant) === 140 && r[0].prix_ajuste, 'prix ajusté par Fabrice (140 €)');
  r = await q(`update public.fiches_clients set notes = 'Client fidèle, siège enfant' where id = '${ficheJean}' returning notes`);
  ok(r[0].notes.startsWith('Client fidèle'), 'Fabrice annote une fiche client');
  r = await q(`select * from public.annuler_course_chauffeur((select id from public.courses where fiche_id = '${ficheJean}' order by date_heure desc limit 1), 70)`);
  ok(r[0].statut === 'annulee' && Number(r[0].frais_annulation) === 70, 'Fabrice annule avec frais');
  await en(client);
  r = await q(`select * from public.fiches_clients`);
  ok(r.length === 0, 'un client ne lit pas le carnet de Fabrice (0 fiche visible)');
  await echoue(() => q(`insert into public.fiches_clients (nom) values ('Pirate') returning id`), 'un client ne crée pas de fiche');
  await echoue(() => q(`select public.creer_course_manuelle(null,'X','0600000000',null,'{}','{}',now(),false,1,0,null,'tesla',10,10,null,'telephone',null)`), 'un client ne saisit pas de course manuelle');
  await echoue(() => q(`select public.fiche_pour('X','0600000000',null,null)`), 'fiche_pour non appelable directement');
}

if (process.argv[4]) {
  console.log('--- itinéraires IGN');
  await db.exec(`select set_config('test.moteurs_actuels', 'oui', false)`);
  await en(autre);
  r = await q(`select * from public.creer_demande(
    '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6007,"lon":2.2329,"type":"gare"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
    now() + interval '3 days', false, 1, 1, null, 'tesla', 5, 5, 'Paul Test', '06 00 00 00 01', 'paul@exemple.fr', null)`);
  ok(Number(r[0].distance_km) > 80 && Number(r[0].distance_km) < 100, `distance recalculée par la base (${r[0].distance_km} km au lieu des 5 km envoyés)`);
  ok(Number(r[0].montant) > 100, `prix calculé sur la vraie distance (${r[0].montant} €)`);
  await echoue(() => q(`select * from public.creer_demande('{"libelle":"Sans position"}', '{"libelle":"Arrivée","lat":43.6,"lon":1.4}',
    now() + interval '3 days', false, 1, 1, null, 'tesla', 5, 5, 'Paul Test', '06 00 00 00 01', 'paul@exemple.fr', null)`), 'adresse sans position refusée');
  await db.exec(`select set_config('test.ign_panne', 'oui', false)`);
  await echoue(() => q(`select * from public.creer_demande(
    '{"libelle":"A","lat":43.6,"lon":2.2}', '{"libelle":"B","lat":43.6,"lon":1.4}',
    now() + interval '3 days', false, 1, 1, null, 'tesla', 50, 40, 'Paul Test', '06 00 00 00 01', 'paul@exemple.fr', null)`), 'IGN en panne : pas de prix inventé, demande refusée');
  await en(fabrice);
  r = await q(`select * from public.creer_course_manuelle(null, 'Client Téléphone', '07 00 00 00 09', null,
    '{"libelle":"A","lat":43.6,"lon":2.2}', '{"libelle":"B","lat":43.6,"lon":1.4}',
    now() + interval '2 days', false, 1, 0, null, 'tesla', 66, 50, null, 'telephone', null)`);
  ok(Number(r[0].distance_km) === 66, 'IGN en panne : la saisie de Fabrice garde sa distance');
  await db.exec(`select set_config('test.ign_panne', 'non', false)`);
  await en(autre);
  let n = 1, bloque = false;
  for (let k = 0; k < 6 && !bloque; k++) {
    try { await q(`select * from public.creer_demande('{"libelle":"A","lat":43.6,"lon":2.2}', '{"libelle":"B","lat":43.6,"lon":1.4}',
      now() + interval '3 days', false, 1, 1, null, 'tesla', 5, 5, 'Paul Test', '06 00 00 00 01', 'paul@exemple.fr', null)`); n++; }
    catch (e) { bloque = /Trop de demandes/.test(e.message); }
  }
  ok(bloque && n === 5, `limite anti-abus : bloqué après ${n} demandes dans l'heure`);
  await echoue(() => q(`select * from public.itineraire_ign(2.2, 43.6, 1.4, 43.6)`), 'le service IGN n\'est pas appelable directement par un client');
}

if (process.argv[6]) {
  console.log('--- messagerie');
  await en(client);
  r = await q(`select id from public.courses where client_id = '${client}' and statut in ('envoyee','confirmee') order by envoyee_le desc limit 1`);
  const course = r[0].id;
  r = await q(`select * from public.envoyer_message('${course}', '  Mon vol a 20 minutes de retard  ')`);
  ok(r[0].texte === 'Mon vol a 20 minutes de retard' && r[0].de_chauffeur === false, 'le client écrit à Fabrice');
  await en(autre);
  r = await q(`select count(*)::int n from public.messages`);
  ok(r[0].n === 0, 'un autre client ne lit pas la conversation');
  await echoue(() => q(`select public.envoyer_message('${course}', 'intrus')`), 'un autre client ne peut pas écrire dans cette conversation');
  await en(fabrice);
  r = await q(`select count(*)::int n from public.messages where course_id = '${course}' and lu_le is null`);
  ok(r[0].n === 1, 'Fabrice voit le message non lu');
  r = await q(`select public.marquer_lus('${course}') n`);
  ok(r[0].n === 1, 'Fabrice marque le message comme lu');
  r = await q(`select * from public.envoyer_message('${course}', 'Bien reçu, je suis le vol.')`);
  ok(r[0].de_chauffeur === true, 'Fabrice répond');
  await en(client);
  r = await q(`select public.marquer_lus('${course}') n`);
  ok(r[0].n === 1, 'le client lit la réponse (seuls les messages de Fabrice sont marqués)');
  await echoue(() => q(`select public.envoyer_message('${course}', '   ')`), 'message vide refusé');
  await echoue(() => q(`insert into public.messages (course_id, auteur_id, texte) values ('${course}', '${client}', 'direct')`), 'écriture directe dans la table interdite');
  await en(fabrice);
  r = await q(`select id from public.courses where client_id is null limit 1`);
  await echoue(() => q(`select public.envoyer_message('${r[0].id}', 'Bonjour')`), 'client sans l’appli : messagerie impossible, il faut appeler');
}

if (process.argv[7]) {
  console.log('--- notifications');
  const envois = async () => (await db.query(`select body from net.envois order by id`)).rows.map((x) => x.body).flat();
  const vider = () => db.exec(`delete from net.envois`);
  await en(fabrice);
  await q(`select public.enregistrer_appareil('ExponentPushToken[fabrice-tel]', 'android')`);
  await en(client);
  await q(`select public.enregistrer_appareil('ExponentPushToken[client-tel]', 'ios')`);
  await echoue(() => q(`select public.enregistrer_appareil('pas-un-jeton', 'ios')`), 'jeton invalide refusé');
  await en(autre);
  r = await q(`select count(*)::int n from public.appareils`);
  ok(r[0].n === 0, 'un client ne voit pas les téléphones des autres');
  await en(null); await db.exec(`reset role`); await vider();
  await en(client);
  r = await q(`select * from public.creer_demande(
    '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6007,"lon":2.2329,"type":"gare"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
    now() + interval '3 days', false, 1, 1, null, 'tesla', 5, 5, 'Claire Martin', '06 12 34 56 78', 'claire@exemple.fr', null)`).catch(async (e) => {
      // limite anti-abus atteinte par les tests précédents : on passe par un client neuf
      await db.exec(`reset role; insert into auth.users values ('55555555-5555-5555-5555-555555555555')`);
      await en('55555555-5555-5555-5555-555555555555');
      await q(`select public.enregistrer_appareil('ExponentPushToken[client-tel]', 'ios')`);
      return q(`select * from public.creer_demande(
        '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6007,"lon":2.2329,"type":"gare"}',
        '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
        now() + interval '3 days', false, 1, 1, null, 'tesla', 5, 5, 'Claire Martin', '06 12 34 56 78', 'claire@exemple.fr', null)`);
    });
  const idC = r[0].id;
  let e = await envois();
  ok(e.length === 1 && e[0].to === 'ExponentPushToken[fabrice-tel]' && e[0].title.startsWith('Nouvelle demande'), `Fabrice prévenu de la nouvelle demande (« ${e[0]?.title} » · ${e[0]?.body})`);
  await vider();
  await en(fabrice);
  await q(`select public.repondre_demande('${idC}', false, 'Indisponible à cet horaire')`);
  e = await envois();
  ok(e.length === 1 && e[0].to === 'ExponentPushToken[client-tel]' && e[0].body.includes('indisponible'), `client prévenu du refus avec le motif (${e[0]?.body})`);
  ok(e[0]?.data?.url === '/course/' + idC, 'la notification ouvre la bonne course');
  await vider();
  await q(`select * from public.envoyer_message('${idC}', 'Je peux vous proposer 10h à la place ?')`);
  e = await envois();
  ok(e.length === 1 && e[0].to === 'ExponentPushToken[client-tel]' && e[0].title === 'Fabrice', 'message de Fabrice notifié au client');
  await vider();
  // relance après 30 min sans réponse
  await db.exec(`reset role; update public.courses set statut = 'envoyee', envoyee_le = now() - interval '40 minutes', relance_le = null where id = '${idC}'`); await vider();
  await db.exec(`select public.relances_notifications()`);
  e = await envois();
  ok(e.some((x) => x.title.startsWith('Demande en attente')), 'Fabrice relancé après 30 min sans réponse');
  await vider(); await db.exec(`select public.relances_notifications()`);
  e = await envois();
  ok(!e.some((x) => x.title.startsWith('Demande en attente')), 'une seule relance par demande');
  r = await db.query(`select count(*)::int n from cron.taches where commande like '%relances_notifications%'`);
  ok(r.rows[0].n === 1, 'tâche planifiée toutes les 5 minutes');
  await en(client);
  await echoue(() => q(`select public.notifier(array['${client}']::uuid[], 'x', 'y', '{}')`), 'un client ne peut pas envoyer de notification lui-même');
}

if (process.argv[8]) {
  console.log('--- annonces');
  const demande = (jours) => q(`select * from public.creer_demande(
    '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6007,"lon":2.2329,"type":"gare"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
    now() + interval '${jours} days', false, 1, 1, null, 'tesla', 5, 5, 'Paul Durand', '06 22 33 44 55', 'paul@exemple.fr', null)`);
  await db.exec(`reset role; insert into auth.users values ('66666666-6666-6666-6666-666666666666') on conflict do nothing`);
  const voyageur = '66666666-6666-6666-6666-666666666666';
  await en(voyageur);
  await echoue(() => q(`insert into public.annonces (debut, fin) values (current_date, current_date + 3)`), 'un client ne peut pas publier d\'annonce');
  await en(fabrice);
  await q(`insert into public.annonces (debut, fin, message) values (current_date + 10, current_date + 20, 'Vacances, de retour le 27')`);
  await q(`insert into public.annonces (debut, fin, bloquer, message) values (current_date - 30, current_date - 20, true, 'Ancienne')`);
  await q(`insert into public.annonces (debut, fin, bloquer, message) values (current_date, current_date + 5, false, 'Nouveau : siège enfant disponible')`);
  await echoue(() => q(`insert into public.annonces (debut, fin) values (current_date + 5, current_date + 1)`), 'fin avant le début refusée');
  await en(null);
  r = await q(`select message from public.annonces order by debut`);
  ok(r.length === 2 && !r.some((x) => x.message === 'Ancienne'), 'les visiteurs voient les annonces en cours et à venir, pas les anciennes');
  await en(fabrice);
  r = await q(`select count(*)::int n from public.annonces`);
  ok(r[0].n === 3, 'Fabrice voit toutes ses annonces');
  await en(voyageur);
  await echoue(() => demande(15), 'demande pendant les vacances refusée par la base');
  r = await demande(3);
  ok(r[0]?.id, 'demande hors indisponibilité acceptée (l\'annonce d\'information ne bloque rien)');
  await en(voyageur);
  await q(`delete from public.annonces`);
  await en(fabrice);
  r = await q(`select count(*)::int n from public.annonces`);
  ok(r[0].n === 3, 'un client ne peut pas supprimer d\'annonce');
  await en(fabrice);
  r = await q(`select * from public.creer_course_manuelle(null, 'Paul Durand', '06 22 33 44 55', null,
    '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6007,"lon":2.2329,"type":"gare"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
    now() + interval '15 days', false, 1, 1, null, 'tesla', 90, 70, null, 'telephone', null)`).catch((e) => [{ erreur: e.message }]);
  ok(r[0] && !r[0].erreur, `Fabrice peut quand même saisir une course pendant ses vacances${r[0]?.erreur ? ' → ' + r[0].erreur : ''}`);
}

if (process.argv[10]) {
  console.log('--- acompte');
  await db.exec(`reset role; update public.parametres set acompte_pourcent = 10, acompte_delai_min = 60`);
  let n = 0;
  const nouveauClient = async () => {
    const id = `88888888-8888-8888-8888-${String(++n).padStart(12, '0')}`;
    await db.exec(`reset role; insert into auth.users values ('${id}') on conflict do nothing`);
    await en(id);
    await q(`select public.enregistrer_appareil('ExponentPushToken[tel-${n}]', 'android')`);
    return id;
  };
  const demander = (heures) => q(`select * from public.creer_demande(
    '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6007,"lon":2.2329,"type":"gare"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
    now() + interval '${heures} hours', false, 1, 1, null, 'tesla', 5, 5, 'Léa Petit', '06 33 44 55 66', 'lea@exemple.fr', null)`);
  const serveur = async (sql) => { await db.exec('reset role'); if (sql.includes(';')) { await db.exec(sql); return []; } return (await db.query(sql)).rows; };
  const vider = () => db.exec(`reset role; delete from net.envois`);
  const envois = async () => (await db.query(`select body from net.envois order by id`)).rows.map((x) => x.body).flat();
  const course = async (id) => (await serveur(`select * from public.courses where id = '${id}'`))[0];

  // 1. Acceptation : acompte demandé
  const c1 = await nouveauClient();
  const d1 = (await demander(72))[0];
  await vider(); await en(fabrice);
  r = await q(`select * from public.repondre_demande('${d1.id}', true)`);
  const attendu = Math.max(1, Math.round(Number(d1.montant) * 10) / 100);
  ok(r[0].statut === 'acompte_attendu' && Number(r[0].acompte_montant) === attendu, `acceptation → acompte demandé (${r[0].acompte_montant} € sur ${d1.montant} €)`);
  const delai = (new Date(r[0].acompte_limite) - Date.now()) / 60000;
  ok(delai > 55 && delai <= 61, `délai de paiement d'1 h (${Math.round(delai)} min)`);
  let e = await envois();
  ok(e.some((x) => x.to === `ExponentPushToken[tel-${n}]` && x.title === 'Fabrice peut vous conduire'), `client prévenu (${e[0]?.body})`);

  // 2. Droits
  await en(c1);
  r = await q(`select * from public.acompte_a_payer('${d1.id}')`);
  ok(Number(r[0].montant) === attendu && !r[0].deja_paye, 'le client obtient le montant à régler');
  await echoue(() => q(`select public.confirmer_paiement('x', 'y', 999)`), 'le client ne peut pas se déclarer payé');
  await echoue(() => q(`select public.enregistrer_checkout('${d1.id}', 1, 'x', 'y')`), 'le client ne peut pas créer de paiement lui-même');
  await echoue(() => q(`update public.courses set statut = 'confirmee' where id = '${d1.id}' returning id`).then((x) => { if (!x.length) throw new Error('aucune ligne'); }), 'le client ne peut pas confirmer sa course');
  const autreClient = await nouveauClient();
  await echoue(() => q(`select * from public.acompte_a_payer('${d1.id}')`), 'un autre client ne peut pas payer cette course');

  // 3. Paiement vérifié par le serveur
  await serveur(`select public.enregistrer_checkout('${d1.id}', ${attendu}, 'chk-1', 'https://pay.sumup.com/chk-1')`);
  await echoue(() => serveur(`select public.confirmer_paiement('chk-1', 'tx-1', ${attendu - 0.5})`), 'montant insuffisant refusé');
  await vider();
  await serveur(`select public.confirmer_paiement('chk-1', 'tx-1', ${attendu})`);
  let c = await course(d1.id);
  ok(c.statut === 'confirmee' && c.acompte_paye_le, 'acompte payé → course confirmée');
  e = await envois();
  ok(e.some((x) => x.title === 'Course confirmée') && e.some((x) => x.title.startsWith('Acompte reçu')), 'client et Fabrice prévenus');
  await serveur(`select public.confirmer_paiement('chk-1', 'tx-1', ${attendu})`);
  r = await serveur(`select count(*)::int n from public.paiements where course_id = '${d1.id}' and statut = 'paye'`);
  ok(r[0].n === 1, 'notification SumUp reçue deux fois : un seul paiement');
  await en(autreClient);
  r = await q(`select count(*)::int n from public.paiements`);
  ok(r[0].n === 0, 'un client ne voit pas les paiements des autres');

  // 4. Annulation plus de 24 h avant : acompte remboursé
  await en(c1);
  await q(`select public.annuler_course('${d1.id}')`);
  r = await serveur(`select * from public.remboursements_dus('${d1.id}')`);
  ok(r.length === 1 && Number(r[0].remboursement_du) === attendu, 'annulation à 3 jours : acompte à rembourser');
  await vider();
  await serveur(`select public.remboursement_effectue('${r[0].id}', ${attendu})`);
  r = await serveur(`select statut from public.paiements where course_id = '${d1.id}'`);
  e = await envois();
  ok(r[0].statut === 'rembourse' && e.some((x) => x.title === 'Acompte remboursé'), 'remboursement noté, client prévenu');
  r = await serveur(`select * from public.remboursements_dus('${d1.id}')`);
  ok(r.length === 0, 'pas de second remboursement');

  // 5. Annulation à moins de 24 h : acompte conservé
  const c2 = await nouveauClient();
  const d2 = (await demander(10))[0];
  await en(fabrice); await q(`select public.repondre_demande('${d2.id}', true)`);
  const a2 = Number((await course(d2.id)).acompte_montant);
  await serveur(`select public.enregistrer_checkout('${d2.id}', ${a2}, 'chk-2', 'l'); select public.confirmer_paiement('chk-2', 'tx-2', ${a2})`);
  await en(c2);
  r = await q(`select * from public.annuler_course('${d2.id}')`);
  const dus2 = await serveur(`select * from public.remboursements_dus('${d2.id}')`);
  ok(dus2.length === 0 && Number(r[0].frais_annulation) === Number(d2.montant), `annulation à 10 h : acompte conservé, frais CGV 100 % (${r[0].frais_annulation} €)`);

  // 6. Fabrice annule : remboursement intégral
  const c3 = await nouveauClient();
  const d3 = (await demander(8))[0];
  await en(fabrice); await q(`select public.repondre_demande('${d3.id}', true)`);
  const a3 = Number((await course(d3.id)).acompte_montant);
  await serveur(`select public.enregistrer_checkout('${d3.id}', ${a3}, 'chk-3', 'l'); select public.confirmer_paiement('chk-3', 'tx-3', ${a3})`);
  await en(fabrice); await q(`select public.annuler_course_chauffeur('${d3.id}', 0)`);
  r = await serveur(`select * from public.remboursements_dus('${d3.id}')`);
  ok(r.length === 1 && Number(r[0].remboursement_du) === a3, 'Fabrice annule (même à 8 h) : acompte remboursé en entier');

  // 7. Délai dépassé : la demande expire
  const c4 = await nouveauClient();
  const d4 = (await demander(48))[0];
  await en(fabrice); await q(`select public.repondre_demande('${d4.id}', true)`);
  const a4 = Number((await course(d4.id)).acompte_montant);
  await serveur(`select public.enregistrer_checkout('${d4.id}', ${a4}, 'chk-4', 'l'); update public.courses set acompte_limite = now() - interval '1 minute' where id = '${d4.id}'`);
  await en(c4);
  await echoue(() => q(`select * from public.acompte_a_payer('${d4.id}')`), 'paiement refusé après le délai');
  await vider();
  await serveur(`select public.relances_notifications()`);
  c = await course(d4.id); e = await envois();
  ok(c.statut === 'expiree' && e.some((x) => x.title === 'Réservation non confirmée') && e.some((x) => x.title.startsWith('Acompte non réglé')), 'délai dépassé → expirée, client et Fabrice prévenus');
  await serveur(`select public.confirmer_paiement('chk-4', 'tx-4', ${a4})`);
  c = await course(d4.id);
  r = await serveur(`select * from public.remboursements_dus('${d4.id}')`);
  ok(c.statut === 'expiree' && r.length === 1, 'payé trop tard : la course reste expirée et l\'acompte est à rembourser');

  // 8. Sans acompte, et courses saisies par Fabrice
  await serveur(`update public.parametres set acompte_pourcent = 0`);
  await nouveauClient();
  const d5 = (await demander(30))[0];
  await en(fabrice);
  r = await q(`select * from public.repondre_demande('${d5.id}', true)`);
  ok(r[0].statut === 'confirmee', 'acompte désactivé (0 %) : confirmation directe');
  await serveur(`update public.parametres set acompte_pourcent = 10`);
  await en(fabrice);
  const m = await q(`select * from public.creer_course_manuelle(null, 'Marc Roux', '06 77 88 99 00', null,
    '{"ref":"albi","libelle":"Albi","lat":43.93,"lon":2.15,"type":"ville"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.63,"lon":1.36,"type":"aeroport"}',
    now() + interval '2 days', false, 1, 1, null, 'tesla', 80, 70, null, 'telephone', null)`);
  r = await q(`select * from public.acompte_a_payer('${m[0].id}')`);
  ok(m[0].statut === 'confirmee' && Number(r[0].montant) > 0, `course téléphone : confirmée, lien d'acompte possible (${r[0].montant} €)`);
}

if (process.argv[11]) {
  console.log('--- factures et bons de commande');
  const annee = new Date().getFullYear();
  const srv = async (sql) => { await db.exec('reset role'); return (await db.query(sql)).rows; };
  const manuelle = async (jours, ar = false, prix = null) => {
    await en(fabrice);
    return (await q(`select * from public.creer_course_manuelle(null, 'Sophie Laurent', '06 44 55 66 77', 'sophie@exemple.fr',
      '{"ref":"albi","libelle":"Albi","lat":43.93,"lon":2.15,"type":"ville"}',
      '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.63,"lon":1.36,"type":"aeroport"}',
      now() + interval '${jours} days', ${ar}, 2, 1, null, 'tesla', 80, 70, ${prix ?? 'null'}, 'telephone', null)`))[0];
  };

  // Bon de commande automatique
  const avant = (await srv(`select count(*)::int n from public.documents where type = 'commande'`))[0].n;
  const c1 = await manuelle(3);
  let docs = await srv(`select * from public.documents where course_id = '${c1.id}'`);
  ok(docs.length === 1 && docs[0].type === 'commande' && docs[0].numero.startsWith(`BC-${annee}-`), `bon de commande émis à la confirmation (${docs[0]?.numero})`);
  const bc = docs[0];
  ok(Number(bc.total_ttc) === Number(c1.montant) && Number(bc.total_ht) === Math.round(Number(c1.montant) / 1.1 * 100) / 100
     && Math.abs(Number(bc.total_ht) + Number(bc.tva) - Number(bc.total_ttc)) < 0.001, `montants : ${bc.total_ht} HT + ${bc.tva} TVA = ${bc.total_ttc} TTC`);
  const somme = bc.contenu.lignes.reduce((t, l) => t + Number(l.total_ht), 0);
  ok(Math.abs(somme - Number(bc.total_ht)) < 0.001, `les lignes font bien le total HT (${bc.contenu.lignes.map((l) => l.libelle).join(' + ')})`);
  ok(bc.contenu.vendeur.siren === '932 513 443' && bc.contenu.taux_tva == 10 && /^C-\d{4}$/.test(bc.contenu.client.numero), `mentions de l'entreprise et n° client (${bc.contenu.client.numero})`);
  r = await srv(`select count(*)::int n from public.documents where type = 'commande'`);
  const num = (x) => Number(x.split('-')[2]);
  const derniers = await srv(`select numero from public.documents where type = 'commande' order by numero`);
  ok(derniers.every((d, i) => num(d.numero) === i + 1), `numérotation continue des bons (${derniers.length} bons, ${derniers[0].numero} → ${derniers.at(-1).numero})`);

  // Aller-retour : remise visible
  const c2 = await manuelle(4, true);
  const bc2 = (await srv(`select * from public.documents where course_id = '${c2.id}'`))[0];
  ok(Number(bc2.contenu.lignes[0].quantite) === 2 * Number(c2.distance_km) && bc2.contenu.lignes.some((l) => l.libelle.startsWith('Remise aller-retour')), `aller-retour : ${bc2.contenu.lignes[0].quantite} km (2 × ${c2.distance_km}) et remise indiquée (${bc2.contenu.lignes.map((l) => `${l.libelle} ${l.total_ht}`).join(' ; ')})`);

  // Facture
  await en(client);
  await echoue(() => q(`select public.emettre_facture('${c1.id}', 'cb')`), 'un client ne peut pas émettre de facture');
  await en(fabrice);
  await echoue(() => q(`select public.emettre_facture('${c1.id}', 'bitcoin')`), 'mode de paiement invalide refusé');
  await q(`update public.fiches_clients set entreprise = 'Laurent Conseil', adresse = '3 rue des Lices', code_postal = '81000', ville = 'Albi' where id = '${c1.fiche_id}'`);
  const f1 = (await q(`select * from public.emettre_facture('${c1.id}', 'cb')`))[0];
  ok(f1.numero.startsWith(`F-${annee}-`) && f1.contenu.acquittee && f1.contenu.client.entreprise === 'Laurent Conseil' && f1.contenu.client.ville === 'Albi', `facture émise avec l'adresse de facturation (${f1.numero})`);
  r = await srv(`select statut from public.courses where id = '${c1.id}'`);
  ok(r[0].statut === 'terminee', 'la course passe à « terminée »');
  await echoue(() => q(`select public.emettre_facture('${c1.id}', 'cb')`), 'pas de seconde facture pour la même course');
  const f2 = (await q(`select * from public.emettre_facture('${c2.id}', 'especes')`))[0];
  ok(num(f2.numero) === num(f1.numero) + 1, `numéros de facture sans trou malgré les refus (${f1.numero}, ${f2.numero})`);

  // Documents figés
  await echoue(() => srv(`update public.documents set total_ttc = 1 where id = '${f1.id}'`), 'une facture émise ne peut pas être modifiée (même par l\'administrateur)');
  await echoue(() => srv(`delete from public.documents where id = '${f1.id}'`), 'une facture émise ne peut pas être supprimée');
  await srv(`update public.documents set pdf_chemin = 'factures/x.pdf' where id = '${f1.id}'`);
  ok((await srv(`select pdf_chemin from public.documents where id = '${f1.id}'`))[0].pdf_chemin === 'factures/x.pdf', 'seul le chemin du PDF peut être renseigné');
  await en(client);
  await echoue(() => q(`insert into public.documents (type, numero, course_id, total_ht, tva, total_ttc, contenu) values ('facture', 'F-0', '${c1.id}', 1, 0, 1, '{}')`), 'un client ne peut pas créer de document');
  const visibles = await q(`select course_id from public.documents`);
  const siens = (await srv(`select id from public.courses where client_id = '${client}'`)).map((x) => x.id);
  ok(visibles.every((v) => siens.includes(v.course_id)) && !visibles.some((v) => v.course_id === c1.id), `un client ne voit que les documents de ses courses (${visibles.length})`);

  // Annulation : facture des frais seulement s'il y en a
  const c3 = await manuelle(5);
  await en(fabrice); await q(`select public.annuler_course_chauffeur('${c3.id}', 40)`);
  const f3 = (await q(`select * from public.emettre_facture('${c3.id}', 'cb')`))[0];
  ok(Number(f3.total_ttc) === 40 && f3.contenu.lignes[0].libelle.startsWith("Frais d'annulation"), `facture des frais d'annulation (${f3.total_ht} HT, ${f3.total_ttc} TTC)`);
  const c4 = await manuelle(6);
  await en(fabrice); await q(`select public.annuler_course_chauffeur('${c4.id}', 0)`);
  await echoue(() => q(`select public.emettre_facture('${c4.id}', 'cb')`), 'pas de facture pour une annulation sans frais');

  // Client de l'appli : voit les documents de ses courses, avec l'acompte déduit
  await srv(`update public.parametres set acompte_pourcent = 10`);
  await db.exec(`reset role; insert into auth.users values ('99999999-9999-9999-9999-999999999999') on conflict do nothing`);
  const cli = '99999999-9999-9999-9999-999999999999';
  await en(cli);
  const d = (await q(`select * from public.creer_demande(
    '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6007,"lon":2.2329,"type":"gare"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
    now() + interval '5 days', false, 1, 1, null, 'tesla', 5, 5, 'Nina Blanc', '06 10 20 30 40', 'nina@exemple.fr', null)`))[0];
  await en(fabrice); await q(`select public.repondre_demande('${d.id}', true)`);
  const ac = (await srv(`select acompte_montant from public.courses where id = '${d.id}'`))[0].acompte_montant;
  await srv(`select public.enregistrer_checkout('${d.id}', ${ac}, 'chk-fac', 'l')`);
  await srv(`select public.confirmer_paiement('chk-fac', 'tx-fac', ${ac})`);
  const bcApp = (await srv(`select * from public.documents where course_id = '${d.id}'`))[0];
  ok(bcApp?.mode_paiement === 'en_ligne' && Number(bcApp.contenu.acompte) === Number(ac) && Number(bcApp.contenu.reste) === Number(d.montant) - Number(ac), `bon de commande après acompte : acompte ${ac} € déduit, reste ${bcApp?.contenu.reste} €`);
  await en(cli);
  r = await q(`select type from public.documents`);
  ok(r.length === 1 && r[0].type === 'commande', 'le client voit le bon de commande de sa course');
}

if (process.argv[12]) {
  console.log('--- mode test (faux argent)');
  const srv = async (sql) => { await db.exec('reset role'); return (await db.query(sql)).rows; };
  const annee = new Date().getFullYear();
  await srv(`update public.parametres set acompte_pourcent = 10, paiements_test = false`);
  await db.exec(`reset role; insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001') on conflict do nothing`);
  const testeur = 'aaaaaaaa-0000-0000-0000-000000000001';
  const demande = async () => {
    await en(testeur);
    return (await q(`select * from public.creer_demande(
      '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6007,"lon":2.2329,"type":"gare"}',
      '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
      now() + interval '4 days', false, 1, 1, null, 'tesla', 5, 5, 'Evan Test', '06 00 00 00 01', 'test@exemple.fr', null)`))[0];
  };
  const d1 = await demande();
  await en(fabrice); await q(`select public.repondre_demande('${d1.id}', true)`);
  await en(testeur);
  await echoue(() => q(`select public.payer_acompte_test('${d1.id}')`), 'faux paiement refusé tant que le mode test est désactivé');

  const derniereVraie = (await srv(`select max(numero) n from public.documents where type = 'facture' and not test`))[0].n;
  await srv(`update public.parametres set paiements_test = true`);
  await en(testeur);
  await q(`select public.payer_acompte_test('${d1.id}')`);
  let c = (await srv(`select statut, acompte_paye_le from public.courses where id = '${d1.id}'`))[0];
  ok(c.statut === 'confirmee' && c.acompte_paye_le, 'faux paiement → course confirmée par le vrai circuit');
  let docs = await srv(`select * from public.documents where course_id = '${d1.id}'`);
  ok(docs.length === 1 && docs[0].test && docs[0].numero === `TEST-BC-${annee}-0001` && docs[0].contenu.test === true, `bon de commande de test (${docs[0]?.numero})`);
  await en(testeur);
  await echoue(() => q(`select public.payer_acompte_test('${d1.id}')`), 'pas de double paiement');
  const autre = 'aaaaaaaa-0000-0000-0000-000000000002';
  await db.exec(`reset role; insert into auth.users values ('${autre}') on conflict do nothing`);
  await en(autre);
  await echoue(() => q(`select public.payer_acompte_test('${d1.id}')`), 'un autre client ne peut pas payer cette course');
  await echoue(() => q(`select public.rembourser_test('${d1.id}')`), 'un autre client ne peut pas déclencher de remboursement');

  // Facture de test et numéros réels intacts
  await en(fabrice);
  const f = (await q(`select * from public.emettre_facture('${d1.id}', 'cb')`))[0];
  ok(f.test && f.numero === `TEST-F-${annee}-0001`, `facture de test (${f.numero})`);
  const apres = (await srv(`select max(numero) n from public.documents where type = 'facture' and not test`))[0].n;
  ok(apres === derniereVraie, `les vrais numéros de facture ne bougent pas (dernier : ${apres})`);

  // Annulation + faux remboursement
  const d2 = await demande();
  await en(fabrice); await q(`select public.repondre_demande('${d2.id}', true)`);
  await en(testeur); await q(`select public.payer_acompte_test('${d2.id}')`);
  await q(`select public.annuler_course('${d2.id}')`);
  r = await q(`select public.rembourser_test('${d2.id}') as m`);
  const p2 = (await srv(`select statut, rembourse from public.paiements where course_id = '${d2.id}' and statut <> 'expire'`))[0];
  ok(Number(r[0].m) > 0 && p2.statut === 'rembourse', `annulation à 4 jours : faux acompte remboursé (${r[0].m} €)`);
  r = await q(`select public.rembourser_test('${d2.id}') as m`);
  ok(Number(r[0].m) === 0, 'pas de second remboursement');

  // Effacer les pièces de test, jamais les vraies
  const vraies = (await srv(`select count(*)::int n from public.documents where not test`))[0].n;
  await en(testeur);
  await echoue(() => q(`select public.effacer_documents_test()`), 'un client ne peut pas effacer de pièces');
  await en(fabrice);
  r = await q(`select public.effacer_documents_test() as n`);
  const reste = await srv(`select count(*)::int n, count(*) filter (where test)::int t from public.documents`);
  ok(r[0].n >= 2 && reste[0].t === 0 && reste[0].n === vraies, `pièces de test effacées (${r[0].n}), vraies pièces intactes (${vraies})`);
  await echoue(() => srv(`delete from public.documents where not test`), 'une vraie pièce reste impossible à supprimer');
  await srv(`update public.parametres set paiements_test = false`);
}

if (process.argv[13]) {
  console.log('--- comptes clients');
  const srv = async (sql) => { await db.exec('reset role'); return (await db.query(sql)).rows; };
  // Session : utilisateur, invité ou non, email.
  const session = async (uid, anonyme, email = null) => {
    await en(uid);
    await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, is_anonymous: anonyme, email })}', false)`);
  };
  const invite = 'bbbbbbbb-0000-0000-0000-000000000001';
  const compte = 'bbbbbbbb-0000-0000-0000-000000000002';
  const intrus = 'bbbbbbbb-0000-0000-0000-000000000003';
  await db.exec(`reset role; insert into auth.users values ('${invite}'), ('${compte}'), ('${intrus}') on conflict do nothing`);
  await srv(`update public.parametres set acompte_pourcent = 0, paiements_test = false`);

  // Profil
  await session(compte, false, 'evan@exemple.fr');
  await echoue(() => q(`select public.enregistrer_profil('E', '06 11 22 33 44')`), 'nom trop court refusé');
  r = await q(`select * from public.enregistrer_profil('Evan Legouez', '06 11 22 33 44')`);
  ok(r[0].nom === 'Evan Legouez' && r[0].email === 'evan@exemple.fr' && r[0].role === 'client', 'profil enregistré avec l\'email du compte, rôle client');
  await echoue(() => q(`update public.profils set role = 'chauffeur' where id = '${compte}'`), 'un client ne peut toujours pas devenir chauffeur');

  // Un invité réserve, puis se connecte à son compte : la course le suit
  await session(invite, true);
  const d = (await q(`select * from public.creer_demande(
    '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6007,"lon":2.2329,"type":"gare"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
    now() + interval '6 days', false, 1, 1, null, 'tesla', 5, 5, 'Evan L', '06 11 22 33 44', 'evan@exemple.fr', null)`))[0];
  await q(`select public.envoyer_message('${d.id}', 'Bonjour, vol AF 6127')`);
  await q(`select public.enregistrer_appareil('ExponentPushToken[tel-evan]', 'android')`);
  const jeton = (await q(`select public.preparer_fusion() as j`))[0].j;
  ok(!!jeton, 'l\'invité obtient un jeton de fusion');
  await echoue(() => q(`select public.fusionner_compte('${jeton}')`), 'un invité ne peut pas fusionner vers lui-même');
  await session(compte, false, 'evan@exemple.fr');
  ok((await q(`select public.preparer_fusion() as j`))[0].j === null, 'pas de jeton pour un compte permanent');
  r = await q(`select public.fusionner_compte('${jeton}') as n`);
  ok(r[0].n === 1, 'connexion au compte : la course réservée en invité est rattachée');
  r = await q(`select id from public.courses where id = '${d.id}'`);
  ok(r.length === 1, 'le compte voit la course');
  r = await q(`select count(*)::int n from public.messages where course_id = '${d.id}' and auteur_id = '${compte}'`);
  ok(r[0].n === 1, 'ses messages le suivent');
  r = await srv(`select user_id from public.appareils where token = 'ExponentPushToken[tel-evan]'`);
  ok(r[0].user_id === compte, 'les notifications arrivent sur le compte');
  r = await q(`select public.fusionner_compte('${jeton}') as n`);
  ok(r[0].n === 0, 'un jeton ne sert qu\'une fois');
  await session(invite, true);
  r = await q(`select count(*)::int n from public.courses`);
  ok(r[0].n === 0, 'l\'ancien invité ne voit plus la course');
  // Jeton expiré
  const j2 = (await q(`select public.preparer_fusion() as j`))[0].j;
  await srv(`update public.fusions_comptes set cree_le = now() - interval '20 minutes' where jeton = '${j2}'`);
  await session(intrus, false, 'intrus@exemple.fr');
  r = await q(`select public.fusionner_compte('${j2}') as n`);
  ok(r[0].n === 0, 'jeton expiré (15 min) : rien n\'est rattaché');
  await session(intrus, false);
  await echoue(() => q(`select * from public.fusions_comptes`), 'personne ne lit les jetons directement');
}

if (process.argv[14]) {
  console.log('--- emails');
  const srv = async (sql) => { await db.exec('reset role'); if (sql.includes(';')) { await db.exec(sql); return []; } return (await db.query(sql)).rows; };
  const file = async (courseId) => srv(`select type, destinataire, document_id, statut from public.emails where course_id = '${courseId}' order by cree_le, type`);
  await srv(`update public.parametres set acompte_pourcent = 0, paiements_test = false, emails_actifs = false`);
  const cli = 'cccccccc-0000-0000-0000-000000000001';
  await db.exec(`reset role; insert into auth.users values ('${cli}') on conflict do nothing`);
  const demander = async (nom = 'Léa Martin', email = 'lea@exemple.fr') => {
    await en(cli);
    return (await q(`select * from public.creer_demande(
      '{"ref":"castres-gare","libelle":"Gare de Castres","lat":43.6007,"lon":2.2329,"type":"gare"}',
      '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
      now() + interval '5 days', false, 1, 1, null, 'tesla', 5, 5, '${nom}', '06 11 11 11 11', '${email}', null)`))[0];
  };

  const d0 = await demander();
  ok((await file(d0.id)).length === 0, 'emails désactivés : rien en file');

  await srv(`update public.parametres set emails_actifs = true, email_chauffeur = 'fabrice@exemple.fr'; delete from net.envois`);
  const d1 = await demander();
  let f = await file(d1.id);
  ok(f.some((x) => x.type === 'demande_recue' && x.destinataire === 'lea@exemple.fr') && f.some((x) => x.type === 'chauffeur_demande' && x.destinataire === 'fabrice@exemple.fr'),
    `demande : email au client et copie à Fabrice (${f.map((x) => x.type).join(', ')})`);
  r = await srv(`select count(*)::int n from net.envois where url like '%/functions/v1/emails'`);
  ok(r[0].n >= 1, 'la fonction d\'envoi est réveillée aussitôt');

  await en(fabrice); await q(`select public.repondre_demande('${d1.id}', true)`);
  f = await file(d1.id);
  const conf = f.find((x) => x.type === 'confirmation');
  ok(conf && conf.document_id, 'confirmation envoyée avec le bon de commande joint');
  await en(fabrice); await q(`select public.emettre_facture('${d1.id}', 'cb')`);
  f = await file(d1.id);
  ok(f.some((x) => x.type === 'facture' && x.document_id), 'facture envoyée avec son PDF');

  const d2 = await demander();
  await en(fabrice); await q(`select public.repondre_demande('${d2.id}', false, 'Indisponible à cet horaire')`);
  ok((await file(d2.id)).some((x) => x.type === 'refus'), 'refus : email au client');

  const d3 = await demander();
  await en(cli); await q(`select public.annuler_course('${d3.id}')`);
  f = await file(d3.id);
  ok(f.some((x) => x.type === 'annulation') && f.some((x) => x.type === 'chauffeur_annulation'), 'annulation par le client : client et Fabrice prévenus');

  // Pas d'adresse : rien ; pas de doublon
  await en(fabrice);
  const m = (await q(`select * from public.creer_course_manuelle(null, 'Sans Email', '06 99 99 99 99', null,
    '{"ref":"albi","libelle":"Albi","lat":43.93,"lon":2.15,"type":"ville"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.63,"lon":1.36,"type":"aeroport"}',
    now() + interval '3 days', false, 1, 1, null, 'tesla', 80, 70, null, 'telephone', null)`))[0];
  ok((await file(m.id)).length === 0, 'client sans email : rien en file (et pas d\'erreur)');
  await srv(`select public.mettre_email('refus', '${d2.id}', null, 'lea@exemple.fr', 'Léa')`);
  ok((await file(d2.id)).filter((x) => x.type === 'refus').length === 1, 'jamais deux fois le même email');

  // File : prise, échecs, relance
  const pris = await srv(`select * from public.prendre_emails(100)`);
  const repris = await srv(`select * from public.prendre_emails(100)`);
  ok(pris.length >= 6 && repris.length === 0, `emails pris une seule fois (${pris.length})`);
  const e1 = pris[0].id;
  await srv(`select public.email_resultat('${e1}', false, null, 'Brevo 500')`);
  ok((await srv(`select statut from public.emails where id = '${e1}'`))[0].statut === 'a_envoyer', 'échec : remis en file pour une nouvelle tentative');
  await srv(`update public.emails set tentatives = 5 where id = '${e1}'; select public.email_resultat('${e1}', false, null, 'Brevo 500')`);
  ok((await srv(`select statut from public.emails where id = '${e1}'`))[0].statut === 'erreur', 'après 5 échecs : marqué en erreur');
  await srv(`select public.email_resultat('${pris[1].id}', true, '<msg@brevo>', null)`);
  ok((await srv(`select statut, envoye_le from public.emails where id = '${pris[1].id}'`))[0].statut === 'envoye', 'envoi réussi noté');

  // Droits
  await en(cli);
  await echoue(() => q(`select * from public.emails`).then((x) => { if (!x.length) throw new Error('aucun'); }), 'un client ne lit pas les emails');
  await echoue(() => q(`select public.renvoyer_email('${e1}')`), 'un client ne peut pas renvoyer d\'email');
  await echoue(() => q(`select public.prendre_emails(10)`), 'un client ne peut pas vider la file');
  await en(fabrice);
  await q(`select public.renvoyer_email('${e1}')`);
  ok((await srv(`select statut, tentatives from public.emails where id = '${e1}'`))[0].tentatives === 0, 'Fabrice peut renvoyer un email en erreur');
  r = await q(`select count(*)::int n from public.emails`);
  ok(r[0].n > 0, 'Fabrice voit le journal des emails');
  await srv(`update public.parametres set emails_actifs = false`);
}

if (process.argv[15]) {
  console.log('--- droits des fonctions serveur');
  const comme = async (role, sql) => { await db.exec(`reset role; set role ${role}`); try { return (await db.query(sql)).rows; } finally { await db.exec('reset role'); } };
  r = await comme('service_role', `select emails_actifs from public.parametres where id = 1`);
  ok(r.length === 1, 'le serveur lit les réglages (la panne des emails)');
  r = await comme('service_role', `select count(*)::int n from public.prendre_emails(0)`);
  ok(r.length === 1, 'le serveur peut prendre les emails en file');
  r = await comme('service_role', `select count(*)::int n from public.courses`);
  ok(r[0].n > 0, 'le serveur lit les courses (emails, PDF, SumUp)');
  await db.exec(`reset role; create table public.table_future (id int); `);
  r = await comme('service_role', `select count(*)::int n from public.table_future`);
  ok(r[0].n === 0, 'les tables des prochaines migrations lui sont aussi accessibles');
  await db.exec(`reset role; drop table public.table_future`);
  await en(client);
  await echoue(() => q(`select public.prendre_emails(1)`), 'un client n\'a toujours aucun accès aux fonctions du serveur');
}

if (process.argv[16]) {
  console.log('--- ligne d\'arrondi');
  const srv = async (sql) => { await db.exec('reset role'); return (await db.query(sql)).rows; };
  await srv(`update public.parametres set acompte_pourcent = 0, paiements_test = false`);
  await en(fabrice);
  const m = (await q(`select * from public.creer_course_manuelle(null, 'Arrondi Test', '06 12 12 12 12', null,
    '{"ref":"lavaur","libelle":"Lavaur","lat":43.6989,"lon":1.8191,"type":"ville"}',
    '{"ref":"tls","libelle":"Aéroport Toulouse-Blagnac","lat":43.6293,"lon":1.3638,"type":"aeroport"}',
    now() + interval '9 days' + interval '3 hours', false, 1, 1, null, 'tesla', 50, 45, null, 'telephone', null)`))[0];
  const bc = (await srv(`select contenu from public.documents where course_id = '${m.id}' and type = 'commande'`))[0].contenu;
  const l0 = bc.lignes[0];
  ok(Number(l0.prix_unitaire_ht) === Math.round(Number(m.prix_km) / 1.1 * 1000) / 1000, `prix au km HT au millième (${l0.prix_unitaire_ht} € pour ${m.prix_km} € TTC)`);
  const somme = bc.lignes.reduce((t, l) => t + Number(l.total_ht), 0);
  ok(Math.abs(somme - Number(bc.total_ht)) < 0.001, `les lignes font toujours le total HT (${bc.lignes.map((l) => `${l.libelle} ${l.total_ht}`).join(' + ')} = ${bc.total_ht})`);
  ok(bc.lignes.length === 1 || bc.lignes[1].libelle.startsWith('Arrondi tarifaire à 0,50 €') || bc.lignes[1].libelle.startsWith('Complément'), `libellé explicite (${bc.lignes[1]?.libelle ?? 'aucune ligne d\'arrondi'})`);
  // Le cas du bon BC-2026-0003 : 63,5 km à 1,80 € TTC = 114,30 € arrondi à 114,50 €.
  await srv(`update public.courses set distance_km = 63.5, prix_km = 1.80, montant = 114.50, prix_ajuste = false, aller_retour = false where id = '${m.id}'`);
  const c2 = (await srv(`select public.contenu_document('${m.id}', 'commande', 'BC-X', null) as c`))[0].c;
  ok(Number(c2.lignes[0].prix_unitaire_ht) === 1.636 && c2.lignes[1]?.libelle === 'Arrondi tarifaire à 0,50 €' && Number(c2.lignes[1].total_ht) === 0.2 && Number(c2.total_ht) === 104.09,
    `cas réel : ${c2.lignes.map((l) => `${l.libelle} ${l.total_ht}`).join(' + ')} = ${c2.total_ht} HT`);
}

if (process.argv[17]) {
  console.log('--- suppression de compte et effacement');
  const srv = async (sql) => { await db.exec('reset role'); return (await db.query(sql)).rows; };
  const parti = '77777777-7777-7777-7777-777777777777';
  await srv(`insert into auth.users (id) values ('${parti}')`);
  await srv(`insert into public.profils (id, nom, telephone, email) values ('${parti}', 'Claire Partie', '06 70 70 70 70', 'claire@exemple.fr')`);
  const nouvelle = async (quand, statut) => (await srv(`insert into public.courses (client_id, depart_libelle, depart_type, depart_detail, depart_lat, depart_lon,
      arrivee_libelle, arrivee_type, arrivee_lat, arrivee_lon, date_heure, passagers, bagages, offre_id, distance_km, montant, prix_km,
      nom, telephone, email, commentaire, numero_vol_train, statut, source)
    values ('${parti}', '3 rue des Lilas, Lavaur', 'adresse', 'Portail vert', 43.7, 1.8, 'Aéroport Toulouse-Blagnac', 'aeroport', 43.63, 1.36,
      ${quand}, 1, 1, 'tesla', 50, 90, 1.8, 'Claire Partie', '06 70 70 70 70', 'claire@exemple.fr', 'Siège bébé', 'AF123', '${statut}', 'telephone')
    returning id, fiche_id`))[0];
  const passee = await nouvelle(`now() - interval '20 days'`, 'terminee');
  const future = await nouvelle(`now() + interval '5 days'`, 'confirmee');
  await srv(`insert into public.messages (course_id, auteur_id, texte) values ('${passee.id}', '${parti}', 'Je suis devant la gare')`);
  await en(parti);
  await echoue(() => q(`select public.supprimer_mes_donnees()`), 'impossible de supprimer son compte avec une course à venir');
  await srv(`update public.courses set statut = 'annulee', annulee_le = now() where id = '${future.id}'`);
  const voisin = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  await srv(`insert into auth.users (id) values ('${voisin}')`);
  await en(voisin);
  r = await q(`select public.supprimer_mes_donnees() n`);
  ok(r[0].n === 0, 'un autre client ne supprime que ses propres données');
  r = await srv(`select count(*)::int n from public.courses where client_id = '${parti}'`);
  ok(r[0].n === 2, 'les courses de Claire sont intactes après la suppression d\'un autre compte');
  await en(parti);
  r = await q(`select public.supprimer_mes_donnees() n`);
  ok(r[0].n === 2, `suppression demandée par le client : ${r[0].n} courses anonymisées`);
  const c = (await srv(`select * from public.courses where id = '${passee.id}'`))[0];
  ok(c.nom === 'Client supprimé' && c.telephone === '' && c.email === null && c.commentaire === null && c.numero_vol_train === null && c.client_id === null,
    'nom, téléphone, email, commentaire et vol effacés');
  ok(c.depart_libelle === 'Adresse effacée' && c.depart_lat === null && c.depart_detail === null, 'adresse personnelle effacée');
  ok(c.arrivee_libelle === 'Aéroport Toulouse-Blagnac' && Number(c.montant) === 90 && c.statut === 'terminee', 'aéroport, prix et statut gardés (chiffre d\'affaires)');
  r = await srv(`select count(*)::int n from public.messages where course_id = '${passee.id}'`);
  ok(r[0].n === 0, 'messages effacés');
  r = await srv(`select count(*)::int n from public.profils where id = '${parti}'`);
  ok(r[0].n === 0, 'profil effacé');
  if (passee.fiche_id) {
    const f = (await srv(`select * from public.fiches_clients where id = '${passee.fiche_id}'`))[0];
    ok(f.nom === 'Client supprimé' && f.telephone === null && f.email === null, 'fiche client anonymisée');
  }
  await srv(`delete from auth.users where id = '${parti}'`);
  r = await srv(`select count(*)::int n from public.courses where id in ('${passee.id}', '${future.id}')`);
  ok(r[0].n === 2, 'supprimer l\'accès ne supprime plus les courses (chiffre d\'affaires, factures)');
  await en(fabrice);
  await echoue(() => q(`select public.supprimer_mes_donnees()`), 'le compte de Fabrice ne se supprime pas depuis l\'appli');
  await en(null);
  await echoue(() => q(`select public.supprimer_mes_donnees()`), 'sans connexion : refusé');
  await en(client);
  await echoue(() => q(`select public.purger_donnees()`), 'un client ne lance pas l\'effacement automatique');

  // Effacement automatique.
  const vieux = '88888888-8888-8888-8888-888888888888';
  const invite = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const recent = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const fidele = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'; // invité créé il y a 2 mois, appli toujours utilisée
  await srv(`insert into auth.users (id, created_at, last_sign_in_at) values ('${vieux}', now() - interval '5 years', now() - interval '4 years')`);
  await srv(`insert into auth.users (id, created_at, is_anonymous) values ('${invite}', now() - interval '40 days', true), ('${recent}', now() - interval '2 days', true), ('${fidele}', now() - interval '60 days', true)`);
  await srv(`insert into auth.sessions (user_id, created_at, updated_at, refreshed_at) values ('${fidele}', now() - interval '60 days', now() - interval '60 days', (now() - interval '1 day')::timestamp)`);
  const ancienne = (await srv(`insert into public.courses (client_id, depart_libelle, arrivee_libelle, date_heure, passagers, bagages, offre_id, distance_km, montant, prix_km, nom, telephone, email, statut, source)
    values ('${vieux}', '5 place du Marché', 'Gare de Toulouse', now() - interval '4 years', 1, 0, 'tesla', 30, 54, 1.8, 'Ancien Client', '06 01 01 01 01', 'ancien@exemple.fr', 'terminee', 'telephone') returning id`))[0];
  await srv(`insert into public.emails (type, course_id, destinataire, cree_le, statut) values ('facture', null, 'x@exemple.fr', now() - interval '2 years', 'envoye')`);
  r = await srv(`select public.purger_donnees() p`);
  ok(r[0].p.courses_anonymisees >= 1, `courses de plus de 3 ans anonymisées (${JSON.stringify(r[0].p)})`);
  r = await srv(`select nom from public.courses where id = '${ancienne.id}'`);
  ok(r[0].nom === 'Client supprimé', 'la course de 4 ans est anonymisée');
  r = await srv(`select id from auth.users where id in ('${vieux}', '${invite}', '${recent}', '${fidele}', '${fabrice}', '${client}') order by id`);
  const restants = r.map((x) => x.id);
  ok(!restants.includes(vieux) && !restants.includes(invite), 'compte inactif depuis 3 ans et invité vide de 40 jours supprimés');
  ok(restants.includes(recent) && restants.includes(fabrice) && restants.includes(client), 'invité récent, clients actifs et Fabrice gardés');
  ok(restants.includes(fidele), 'invité ancien mais qui utilise encore l\'appli (session rafraîchie hier) gardé');
  r = await srv(`select count(*)::int n from public.emails where cree_le < now() - interval '1 year'`);
  ok(r[0].n === 0, 'journal des emails de plus d\'un an effacé');
  r = await srv(`select count(*)::int n from public.courses where nom <> 'Client supprimé' and date_heure > now() - interval '3 years'`);
  ok(r[0].n > 0, 'les courses récentes ne sont pas touchées');
  r = await srv(`select count(*)::int n from cron.taches where nom = 'volant3ranches-effacement'`);
  ok(r[0].n === 1, 'effacement programmé chaque nuit');
}
