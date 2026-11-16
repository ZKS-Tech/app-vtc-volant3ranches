-- Volant3ranches VTC — comptes clients (email + mot de passe).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), après les migrations
-- précédentes.
--
--  • Créer un compte : l'appli transforme le compte invité du téléphone en compte permanent
--    (même identifiant) : courses, messages et notifications sont conservés.
--  • Se connecter sur un autre téléphone (ou après une réinstallation) : les courses éventuellement
--    réservées en invité sur ce téléphone sont rattachées au compte (fusion sécurisée par un jeton
--    à usage unique valable 15 minutes).
--  • Les coordonnées du profil (nom, téléphone, email) préremplissent les réservations.

-- Le compte connecté est-il un invité (connexion anonyme) ?
create or replace function public.est_anonyme()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- Coordonnées du client connecté (création ou mise à jour de son profil).
create or replace function public.enregistrer_profil(p_nom text, p_telephone text)
returns public.profils
language plpgsql security definer set search_path = public
as $$
declare
  p public.profils;
  courriel text := nullif(auth.jwt() ->> 'email', '');
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if length(trim(coalesce(p_nom, ''))) < 2 then raise exception 'Indiquez votre nom'; end if;
  if length(regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g')) < 10 then raise exception 'Numéro de téléphone incomplet'; end if;
  insert into public.profils (id, nom, telephone, email)
  values (auth.uid(), trim(p_nom), trim(p_telephone), courriel)
  on conflict (id) do update
    set nom = excluded.nom, telephone = excluded.telephone, email = coalesce(excluded.email, profils.email)
  returning * into p;
  return p;
end;
$$;

-- ——— Fusion d'un invité dans un compte ———
create table public.fusions_comptes (
  jeton uuid primary key default gen_random_uuid(),
  ancien uuid not null references auth.users (id) on delete cascade,
  cree_le timestamptz not null default now()
);
alter table public.fusions_comptes enable row level security; -- aucun accès direct

-- 1. Avant de se connecter, l'invité obtient un jeton qui prouve qu'il est bien ce compte-là.
create or replace function public.preparer_fusion()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  j uuid;
begin
  if auth.uid() is null or not public.est_anonyme() then return null; end if;
  delete from public.fusions_comptes where cree_le < now() - interval '15 minutes';
  insert into public.fusions_comptes (ancien) values (auth.uid()) returning jeton into j;
  return j;
end;
$$;

-- 2. Une fois connecté à son compte, il rattache les données de l'invité. Renvoie le nombre de
--    courses rattachées.
create or replace function public.fusionner_compte(p_jeton uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  f public.fusions_comptes;
  moi uuid := auth.uid();
  n int;
begin
  if moi is null or public.est_anonyme() then raise exception 'Connectez-vous à votre compte'; end if;
  delete from public.fusions_comptes where jeton = p_jeton and cree_le > now() - interval '15 minutes' returning * into f;
  if not found or f.ancien = moi then return 0; end if;
  update public.courses set client_id = moi where client_id = f.ancien;
  get diagnostics n = row_count;
  update public.messages set auteur_id = moi where auteur_id = f.ancien;
  update public.appareils set user_id = moi where user_id = f.ancien;
  update public.fiches_clients set profil_id = moi where profil_id = f.ancien;
  -- Le profil du compte garde ses coordonnées ; celles de l'invité servent s'il n'en a pas.
  insert into public.profils (id, nom, telephone, email)
  select moi, a.nom, a.telephone, coalesce(nullif(auth.jwt() ->> 'email', ''), a.email)
    from public.profils a where a.id = f.ancien
  on conflict (id) do update
    set nom = coalesce(profils.nom, excluded.nom), telephone = coalesce(profils.telephone, excluded.telephone),
        email = coalesce(profils.email, excluded.email);
  return n;
end;
$$;

revoke execute on function public.enregistrer_profil(text, text) from public, anon;
revoke execute on function public.preparer_fusion() from public, anon;
revoke execute on function public.fusionner_compte(uuid) from public, anon;
grant execute on function public.enregistrer_profil(text, text) to authenticated;
grant execute on function public.preparer_fusion() to authenticated;
grant execute on function public.fusionner_compte(uuid) to authenticated;
