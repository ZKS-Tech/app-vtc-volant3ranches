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
