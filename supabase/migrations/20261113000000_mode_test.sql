-- Volant3ranches VTC — mode test : paiements simulés (faux argent) pour essayer tout le parcours.
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), après la migration 9.
--
-- Quand Fabrice active « Mode test » (Gestion › Tarifs › Acompte) :
--  • l'acompte se « paie » dans l'appli, sans SumUp ni carte : la base enregistre un faux paiement et
--    suit exactement le vrai circuit (confirmation, notifications, bon de commande, facture) ;
--  • les remboursements sont simulés de la même façon ;
--  • les bons de commande et factures émis pendant le test ont leur propre numérotation
--    (TEST-BC-…, TEST-F-…) : les vrais numéros restent continus. Ils portent la mention « sans valeur »
--    et peuvent être effacés (bouton « Effacer les pièces de test »).

alter table public.parametres add column paiements_test boolean not null default false;
alter table public.documents add column test boolean not null default false;

alter table public.compteurs_documents drop constraint if exists compteurs_documents_type_check;
alter table public.compteurs_documents add constraint compteurs_documents_type_check
  check (type in ('commande', 'facture', 'commande_test', 'facture_test'));

create or replace function public.prochain_numero(p_type text, p_test boolean)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  a int := extract(year from now() at time zone 'Europe/Paris');
  cle text := p_type || case when p_test then '_test' else '' end;
  n int;
begin
  insert into public.compteurs_documents (type, annee, dernier) values (cle, a, 1)
  on conflict (type, annee) do update set dernier = compteurs_documents.dernier + 1
  returning dernier into n;
  return format('%s%s-%s-%s', case when p_test then 'TEST-' else '' end,
                case p_type when 'facture' then 'F' else 'BC' end, a, lpad(n::text, 4, '0'));
end;
$$;

create or replace function public.emettre_document(p_course uuid, p_type text, p_mode text)
returns public.documents
language plpgsql security definer set search_path = public
as $$
declare
  test boolean := coalesce((select paiements_test from public.parametres where id = 1), false);
  numero text := public.prochain_numero(p_type, test);
  contenu jsonb := public.contenu_document(p_course, p_type, numero, p_mode) || jsonb_build_object('test', test);
  d public.documents;
begin
  insert into public.documents (type, numero, course_id, total_ht, tva, total_ttc, mode_paiement, contenu, test)
  values (p_type, numero, p_course, (contenu->>'total_ht')::numeric, (contenu->>'tva')::numeric,
          (contenu->>'total_ttc')::numeric, p_mode, contenu, test)
  returning * into d;
  return d;
end;
$$;

-- Les pièces de test (et elles seules) peuvent être effacées.
create or replace function public.documents_figes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.test then return old; end if;
    raise exception 'Un document émis ne peut pas être supprimé';
  end if;
  if (new.type, new.numero, new.course_id, new.emis_le, new.total_ht, new.tva, new.total_ttc, new.mode_paiement, new.contenu, new.test)
     is distinct from (old.type, old.numero, old.course_id, old.emis_le, old.total_ht, old.tva, old.total_ttc, old.mode_paiement, old.contenu, old.test) then
    raise exception 'Un document émis ne peut pas être modifié';
  end if;
  return new;
end;
$$;

-- ——— Faux paiement de l'acompte (client de la course, ou Fabrice à sa place) ———
create or replace function public.payer_acompte_test(p_course uuid)
returns public.paiements
language plpgsql security definer set search_path = public
as $$
declare
  a record;
  ref text := 'test-' || gen_random_uuid();
begin
  if not coalesce((select paiements_test from public.parametres where id = 1), false) then
    raise exception 'Le mode test n''est pas activé';
  end if;
  select * into a from public.acompte_a_payer(p_course);  -- mêmes contrôles que pour un vrai paiement
  if a.deja_paye then raise exception 'L''acompte est déjà réglé'; end if;
  perform public.enregistrer_checkout(p_course, a.montant, ref, null);
  return public.confirmer_paiement(ref, ref, a.montant);
end;
$$;

-- ——— Faux remboursement (uniquement des faux paiements) ———
create or replace function public.rembourser_test(p_course uuid)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  p public.paiements;
  total numeric := 0;
  du numeric;
begin
  if not public.est_chauffeur() and not exists (select 1 from public.courses where id = p_course and client_id = auth.uid()) then
    raise exception 'Course introuvable';
  end if;
  for p in select * from public.remboursements_dus(p_course) where transaction_id like 'test-%' loop
    du := p.remboursement_du - p.rembourse;
    perform public.remboursement_effectue(p.id, du);
    total := total + du;
  end loop;
  return total;
end;
$$;

-- ——— Effacer les pièces de test (Fabrice) ———
create or replace function public.effacer_documents_test()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  n int;
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  delete from public.documents where test;
  get diagnostics n = row_count;
  delete from public.compteurs_documents where type like '%\_test';
  return n;
end;
$$;

revoke execute on function public.prochain_numero(text, boolean) from public, anon, authenticated;
revoke execute on function public.payer_acompte_test(uuid) from public, anon;
revoke execute on function public.rembourser_test(uuid) from public, anon;
revoke execute on function public.effacer_documents_test() from public, anon;
grant execute on function public.payer_acompte_test(uuid) to authenticated;
grant execute on function public.rembourser_test(uuid) to authenticated;
grant execute on function public.effacer_documents_test() to authenticated;
