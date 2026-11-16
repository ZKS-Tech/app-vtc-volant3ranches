-- Volant3ranches VTC — renforcement de la sécurité avant publication.
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run).
--
-- 1. FAILLE CORRIGÉE : sur Supabase, toutes les tables de « public » sont ouvertes par défaut en
--    écriture aux comptes connectés ; seule la RLS filtre les lignes. Le rôle « chauffeur » n'était
--    protégé que par un droit par colonne, annulé par ces droits par défaut : un client pouvait se
--    donner le rôle chauffeur. Désormais : droits stricts sur profils + déclencheur qui refuse tout
--    changement de rôle venant de l'appli.
-- 2. Droits par défaut resserrés (TRUNCATE, REFERENCES, TRIGGER retirés aux comptes de l'appli).
-- 3. Mode test supprimé : plus de faux paiement possible, même par erreur de réglage.
-- 4. Limites anti-abus : nombre de demandes et de messages par client.

-- ——— 1. Rôle chauffeur ———
revoke insert, update, delete, truncate, references, trigger on public.profils from anon, authenticated;
grant update (nom, telephone, email) on public.profils to authenticated;

create or replace function public.proteger_role()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and new.role <> 'client' then
      raise exception 'Rôle non autorisé';
    elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
      raise exception 'Le rôle ne se modifie pas depuis l''appli';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profils_role on public.profils;
create trigger profils_role before insert or update on public.profils
  for each row execute function public.proteger_role();

-- ——— 2. Droits par défaut ———
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
-- Les nouvelles fonctions ne sont plus appelables par défaut : chaque migration donne les droits utiles.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ——— 3. Fin du mode test ———
drop function if exists public.payer_acompte_test(uuid);
drop function if exists public.rembourser_test(uuid);
drop function if exists public.effacer_documents_test();
update public.parametres set paiements_test = false where paiements_test;
alter table public.parametres drop constraint if exists parametres_sans_test;
alter table public.parametres add constraint parametres_sans_test check (paiements_test = false);

-- ——— 4. Limites anti-abus ———
-- Demandes depuis l'appli : au plus 5 en attente à la fois, et 10 par 24 h, par client.
-- (Protège Fabrice des demandes en rafale, et empêche d'envoyer des emails en masse à des inconnus.)
create or replace function public.limiter_demandes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.source = 'appli' and new.client_id is not null then
    if (select count(*) from public.courses where client_id = new.client_id
         and statut in ('envoyee', 'acompte_attendu') and date_heure > now()) >= 5 then
      raise exception 'Vous avez déjà 5 demandes en attente : attendez la réponse de Fabrice ou appelez-le.';
    end if;
    if (select count(*) from public.courses where client_id = new.client_id
         and envoyee_le > now() - interval '24 hours') >= 10 then
      raise exception 'Trop de demandes aujourd''hui : appelez Fabrice au 06 16 53 14 91.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists courses_limite on public.courses;
create trigger courses_limite before insert on public.courses
  for each row execute function public.limiter_demandes();

-- Messages des clients : au plus 20 par heure.
create or replace function public.limiter_messages()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not new.de_chauffeur and (select count(*) from public.messages
       where auteur_id = new.auteur_id and envoye_le > now() - interval '1 hour') >= 20 then
    raise exception 'Trop de messages en peu de temps : appelez Fabrice si c''est urgent.';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_limite on public.messages;
create trigger messages_limite before insert on public.messages
  for each row execute function public.limiter_messages();

revoke execute on function public.proteger_role(), public.limiter_demandes(), public.limiter_messages() from public, anon, authenticated;
-- Calcul interne (utilisé par les fonctions de la base, jamais par l'appli).
revoke execute on function public.montant_acompte(numeric) from authenticated;
