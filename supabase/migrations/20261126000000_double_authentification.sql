-- Volant3ranches VTC — double authentification du compte de Fabrice (plan de sécurité, point 15).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run).
--
-- Le compte de Fabrice donne accès à toutes les données des clients. Une fois la double
-- authentification activée (Gestion › Sécurité du compte), ses droits de chauffeur exigent une
-- session validée par le code à 6 chiffres de son application d'authentification (niveau « aal2 »
-- de Supabase) : le mot de passe seul ne suffit plus, pour toute la base (lectures, actions, RLS).
-- Tant qu'elle n'est pas activée, rien ne change.
--
-- Téléphone perdu (plus d'accès au code) : dans le SQL Editor,
--   delete from auth.mfa_factors where user_id = (select id from public.profils where role = 'chauffeur');
-- puis se reconnecter avec le mot de passe et réactiver la double authentification.

-- Rôle chauffeur ET, si un code est activé sur le compte, session validée par ce code.
create or replace function public.est_chauffeur()
returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'chauffeur')
     and (coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
          or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'));
$$;

-- Rôle seul, sans regarder la session : pour les garde-fous qui doivent protéger le compte de Fabrice
-- même quand il n'est connecté qu'avec son mot de passe (sinon un intrus avec le mot de passe seul
-- pourrait supprimer le compte ou lui rattacher des courses).
create or replace function public.a_le_role_chauffeur()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'chauffeur');
$$;

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
  if public.a_le_role_chauffeur() then raise exception 'Le compte du chauffeur ne se supprime pas depuis l''appli'; end if;
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
  if public.a_le_role_chauffeur() then return 0; end if;
  delete from public.fusions_comptes where jeton = p_jeton and cree_le > now() - interval '15 minutes' returning * into f;
  if not found or f.ancien = moi then return 0; end if;
  update public.courses set client_id = moi where client_id = f.ancien;
  get diagnostics n = row_count;
  update public.messages set auteur_id = moi where auteur_id = f.ancien;
  update public.appareils set user_id = moi where user_id = f.ancien;
  update public.fiches_clients set profil_id = moi where profil_id = f.ancien;
  -- Le profil du compte garde ses coordonnées ; celles de l'invité servent s'il n'en a pas.
  insert into public.profils (id, nom, telephone, email, langue)
  select moi, a.nom, a.telephone, coalesce(nullif(auth.jwt() ->> 'email', ''), a.email), a.langue
    from public.profils a where a.id = f.ancien
  on conflict (id) do update
    set nom = coalesce(profils.nom, excluded.nom), telephone = coalesce(profils.telephone, excluded.telephone),
        email = coalesce(profils.email, excluded.email);
  return n;
end;
$$;

revoke execute on function public.a_le_role_chauffeur() from public, anon, authenticated;
grant execute on function public.est_chauffeur() to anon, authenticated;
