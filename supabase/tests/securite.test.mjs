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
