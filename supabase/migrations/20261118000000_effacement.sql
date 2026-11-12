-- Volant3ranches VTC — suppression de compte et effacement automatique des données anciennes.
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run).
--
-- Ce que dit la politique de confidentialité, appliqué par la base :
--  • Supprimer son compte (Profil) : les courses à venir doivent d'abord être annulées ; les courses
--    passées restent dans le chiffre d'affaires de Fabrice mais sont anonymisées (nom, téléphone,
--    email, adresses personnelles, commentaire, messages) ; téléphone, profil et compte sont supprimés.
--    Les bons de commande et factures déjà émis sont conservés 10 ans (obligation comptable).
--  • Chaque nuit : courses de plus de 3 ans anonymisées, fiches clients inactives depuis 3 ans
--    anonymisées, journal des emails de plus d'un an effacé, téléphones inactifs depuis un an oubliés,
--    comptes invités vides de plus de 30 jours et comptes inactifs depuis 3 ans supprimés, pièces
--    comptables et paiements de plus de 10 ans effacés.

-- Supprimer un compte ne doit plus supprimer ses courses (chiffre d'affaires, factures liées) :
-- elles restent, détachées et anonymisées.
alter table public.courses drop constraint if exists courses_client_id_fkey;
alter table public.courses add constraint courses_client_id_fkey
  foreign key (client_id) references auth.users (id) on delete set null;

-- Les pièces comptables de plus de 10 ans peuvent être effacées (les pièces de test toujours).
create or replace function public.documents_figes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.test or old.emis_le < now() - interval '10 years' then return old; end if;
    raise exception 'Un document émis ne peut pas être supprimé';
  end if;
  if (new.type, new.numero, new.course_id, new.emis_le, new.total_ht, new.tva, new.total_ttc, new.mode_paiement, new.contenu, new.test)
     is distinct from (old.type, old.numero, old.course_id, old.emis_le, old.total_ht, old.tva, old.total_ttc, old.mode_paiement, old.contenu, old.test) then
    raise exception 'Un document émis ne peut pas être modifié';
  end if;
  return new;
end;
$$;

-- ——— Anonymisation ———
-- Une course : on garde ce qui sert au chiffre d'affaires (date, offre, distance, prix, statut, villes,
-- aéroports et gares), on efface ce qui désigne la personne.
create or replace function public.anonymiser_course(p_course uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.messages where course_id = p_course;
  delete from public.emails where course_id = p_course;
  update public.courses set
    nom = 'Client supprimé', telephone = '', email = null, commentaire = null, numero_vol_train = null,
    note_chauffeur = null, client_id = null,
    depart_ref = case when coalesce(depart_type, 'adresse') = 'adresse' then null else depart_ref end,
    arrivee_ref = case when coalesce(arrivee_type, 'adresse') = 'adresse' then null else arrivee_ref end,
    depart_libelle = case when coalesce(depart_type, 'adresse') = 'adresse' then 'Adresse effacée' else depart_libelle end,
    depart_detail = case when coalesce(depart_type, 'adresse') = 'adresse' then null else depart_detail end,
    depart_lat = case when coalesce(depart_type, 'adresse') = 'adresse' then null else depart_lat end,
    depart_lon = case when coalesce(depart_type, 'adresse') = 'adresse' then null else depart_lon end,
    arrivee_libelle = case when coalesce(arrivee_type, 'adresse') = 'adresse' then 'Adresse effacée' else arrivee_libelle end,
    arrivee_detail = case when coalesce(arrivee_type, 'adresse') = 'adresse' then null else arrivee_detail end,
    arrivee_lat = case when coalesce(arrivee_type, 'adresse') = 'adresse' then null else arrivee_lat end,
    arrivee_lon = case when coalesce(arrivee_type, 'adresse') = 'adresse' then null else arrivee_lon end
   where id = p_course;
end;
$$;

create or replace function public.anonymiser_fiche(p_fiche uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.fiches_clients set
    nom = 'Client supprimé', telephone = null, telephone_norm = null, email = null, notes = null,
    entreprise = null, adresse = null, code_postal = null, ville = null, profil_id = null, maj_le = now()
   where id = p_fiche;
$$;

-- ——— Suppression de compte, demandée par le client (appelée par la fonction serveur
--     « supprimer-compte », qui supprime ensuite l'accès lui-même) ———
create or replace function public.supprimer_mes_donnees()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  moi uuid := auth.uid();
  prochaine public.courses;
  c record;
  n int := 0;
begin
  if moi is null then raise exception 'Connexion requise'; end if;
  if public.est_chauffeur() then raise exception 'Le compte du chauffeur ne se supprime pas depuis l''appli'; end if;
  select * into prochaine from public.courses
   where client_id = moi and statut in ('envoyee', 'acompte_attendu', 'confirmee') and date_heure > now()
   order by date_heure limit 1;
  if found then
    raise exception 'Vous avez une course prévue le % : annulez-la d''abord, ou appelez Fabrice.',
      to_char(prochaine.date_heure at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI');
  end if;
  for c in select id, fiche_id from public.courses where client_id = moi loop
    perform public.anonymiser_course(c.id);
    if c.fiche_id is not null then perform public.anonymiser_fiche(c.fiche_id); end if;
    n := n + 1;
  end loop;
  perform public.anonymiser_fiche(f.id) from public.fiches_clients f where f.profil_id = moi;
  delete from public.messages where auteur_id = moi;
  delete from public.appareils where user_id = moi;
  delete from public.fusions_comptes where ancien = moi;
  delete from public.profils where id = moi;
  return n;
end;
$$;

-- ——— Effacement automatique (chaque nuit) ———
create or replace function public.purger_donnees()
returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare
  c record;
  n_courses int := 0;
  n_fiches int := 0;
  n_comptes int := 0;
begin
  -- Courses de plus de 3 ans : anonymisées.
  for c in select id from public.courses where date_heure < now() - interval '3 years' and nom <> 'Client supprimé' loop
    perform public.anonymiser_course(c.id);
    n_courses := n_courses + 1;
  end loop;
  -- Fiches clients sans course depuis 3 ans.
  for c in select f.id from public.fiches_clients f
            where f.nom <> 'Client supprimé' and f.cree_le < now() - interval '3 years'
              and not exists (select 1 from public.courses co where co.fiche_id = f.id and co.date_heure > now() - interval '3 years') loop
    perform public.anonymiser_fiche(c.id);
    n_fiches := n_fiches + 1;
  end loop;
  -- Journal des emails : 1 an. Téléphones inactifs : 1 an. Jetons de fusion périmés.
  delete from public.emails where cree_le < now() - interval '1 year';
  delete from public.appareils where maj_le < now() - interval '1 year';
  delete from public.fusions_comptes where cree_le < now() - interval '1 day';
  -- Pièces comptables et paiements : 10 ans.
  delete from public.documents where emis_le < now() - interval '10 years';
  delete from public.paiements where cree_le < now() - interval '10 years';
  -- Comptes : invités sans aucune course depuis 30 jours, comptes inactifs depuis 3 ans (jamais Fabrice).
  -- Activité = création, dernière connexion ou dernier rafraîchissement de session (l'appli reste
  -- connectée sans redemander le mot de passe).
  begin
    for c in select u.id from auth.users u
              cross join lateral (select greatest(u.created_at, u.last_sign_in_at,
                                    (select max(coalesce(se.refreshed_at::timestamptz, se.updated_at, se.created_at))
                                       from auth.sessions se where se.user_id = u.id)) as le) act
              where not exists (select 1 from public.profils p where p.id = u.id and p.role = 'chauffeur')
                and ((coalesce(u.is_anonymous, false) and act.le < now() - interval '30 days'
                      and not exists (select 1 from public.courses co where co.client_id = u.id))
                  or (act.le < now() - interval '3 years'
                      and not exists (select 1 from public.courses co where co.client_id = u.id and co.date_heure > now() - interval '3 years'))) loop
      perform public.anonymiser_course(co.id) from public.courses co where co.client_id = c.id;
      delete from public.messages where auteur_id = c.id;
      delete from auth.users where id = c.id;
      n_comptes := n_comptes + 1;
    end loop;
  exception when insufficient_privilege then
    raise warning 'purger_donnees : suppression des comptes non autorisée (%)', sqlerrm;
  end;
  return jsonb_build_object('courses_anonymisees', n_courses, 'fiches_anonymisees', n_fiches, 'comptes_supprimes', n_comptes);
end;
$$;

select cron.schedule('volant3ranches-effacement', '17 3 * * *', 'select public.purger_donnees()');

revoke execute on function public.anonymiser_course(uuid) from public, anon, authenticated;
revoke execute on function public.anonymiser_fiche(uuid) from public, anon, authenticated;
revoke execute on function public.purger_donnees() from public, anon, authenticated;
revoke execute on function public.supprimer_mes_donnees() from public, anon;
grant execute on function public.supprimer_mes_donnees() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.anonymiser_course(uuid), public.anonymiser_fiche(uuid), public.purger_donnees() to service_role;
  end if;
end $$;
