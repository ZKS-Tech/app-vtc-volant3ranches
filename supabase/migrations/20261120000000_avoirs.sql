-- Volant3ranches VTC — avoirs (factures rectificatives).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run).
--
-- Une facture émise ne se modifie ni ne se supprime : pour la corriger ou rembourser un client,
-- Fabrice émet un avoir qui la référence.
--  • Avoir total : annule toute la facture (erreur de facturation, course à refacturer…). La course
--    peut ensuite être facturée à nouveau, avec un nouveau numéro.
--  • Avoir partiel : un montant TTC (geste commercial, remboursement partiel, attente non due…).
--  Numéro AV-AAAA-0001, suite continue par année. Les montants d'un avoir sont négatifs : additionner
--  factures et avoirs du mois donne directement le chiffre d'affaires facturé net.
--  Le total des avoirs d'une facture ne peut pas dépasser son montant. Motif obligatoire (il figure
--  sur l'avoir) ; mode de remboursement facultatif (sinon : montant à déduire).

-- ——— Types et numérotation ———
alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents add constraint documents_type_check check (type in ('commande', 'facture', 'avoir'));
alter table public.documents add column if not exists facture_id uuid references public.documents (id) on delete set null;
create index if not exists documents_facture_idx on public.documents (facture_id);

alter table public.compteurs_documents drop constraint if exists compteurs_documents_type_check;
alter table public.compteurs_documents add constraint compteurs_documents_type_check
  check (type in ('commande', 'facture', 'avoir', 'commande_test', 'facture_test', 'avoir_test'));

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
                case p_type when 'facture' then 'F' when 'avoir' then 'AV' else 'BC' end, a, lpad(n::text, 4, '0'));
end;
$$;
revoke execute on function public.prochain_numero(text, boolean) from public, anon, authenticated;

-- ——— Reste d'une facture : son montant moins ses avoirs ———
create or replace function public.reste_facture(p_facture uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select f.total_ttc + coalesce((select sum(a.total_ttc) from public.documents a where a.facture_id = f.id and a.type = 'avoir'), 0)
    from public.documents f where f.id = p_facture and f.type = 'facture';
$$;

-- Plusieurs factures par course deviennent possibles : une nouvelle seulement si les précédentes
-- sont entièrement annulées par des avoirs.
drop index if exists public.documents_une_facture;

create or replace function public.emettre_facture(p_course uuid, p_mode text)
returns public.documents
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  if p_mode is null or p_mode not in ('cb', 'cheque', 'especes', 'virement', 'en_ligne') then raise exception 'Mode de paiement invalide'; end if;
  select * into c from public.courses where id = p_course for update;
  if not found then raise exception 'Course introuvable'; end if;
  if exists (select 1 from public.documents f where f.course_id = p_course and f.type = 'facture' and public.reste_facture(f.id) > 0) then
    raise exception 'Cette course a déjà une facture (pour la corriger : avoir total, puis nouvelle facture)';
  end if;
  if c.statut = 'confirmee' then
    update public.courses set statut = 'terminee', terminee_le = now() where id = p_course;
  elsif c.statut = 'annulee' then
    if coalesce(c.frais_annulation, 0) <= 0 then raise exception 'Pas de frais d''annulation à facturer'; end if;
  elsif c.statut <> 'terminee' then
    raise exception 'Seule une course effectuée (ou annulée avec frais) peut être facturée';
  end if;
  return public.emettre_document(p_course, 'facture', p_mode);
end;
$$;

-- ——— Émission d'un avoir (Fabrice) ———
-- p_montant : montant TTC à créditer ; null = avoir total (tout le reste de la facture).
create or replace function public.emettre_avoir(p_facture uuid, p_montant numeric, p_motif text, p_mode text)
returns public.documents
language plpgsql security definer set search_path = public
as $$
declare
  f public.documents;
  reste numeric;
  ttc numeric;
  ht numeric;
  taux numeric;
  total boolean;
  numero text;
  lignes jsonb;
  contenu jsonb;
  d public.documents;
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  select * into f from public.documents where id = p_facture for update;
  if not found or f.type <> 'facture' then raise exception 'Facture introuvable'; end if;
  if length(trim(coalesce(p_motif, ''))) < 3 then raise exception 'Indiquez le motif de l''avoir'; end if;
  if p_mode is not null and p_mode not in ('cb', 'cheque', 'especes', 'virement', 'en_ligne') then raise exception 'Mode de remboursement invalide'; end if;
  reste := public.reste_facture(f.id);
  if reste <= 0 then raise exception 'Cette facture est déjà entièrement annulée par un avoir'; end if;
  ttc := coalesce(round(p_montant, 2), reste);
  if ttc <= 0 then raise exception 'Le montant de l''avoir doit être positif'; end if;
  if ttc > reste then
    raise exception 'L''avoir ne peut pas dépasser le reste de la facture : % €', replace(to_char(reste, 'FM999990.00'), '.', ',');
  end if;
  total := ttc = f.total_ttc;
  taux := coalesce((f.contenu->>'taux_tva')::numeric, 10);
  ht := case when total then f.total_ht else round(ttc / (1 + taux / 100), 2) end;

  if total then
    -- Avoir total : les lignes de la facture, en négatif.
    select coalesce(jsonb_agg(l || jsonb_build_object('total_ht', -((l->>'total_ht')::numeric))), '[]'::jsonb)
      into lignes from jsonb_array_elements(f.contenu->'lignes') l;
  else
    lignes := jsonb_build_array(jsonb_build_object(
      'libelle', 'Avoir partiel sur la facture ' || f.numero, 'detail', trim(p_motif),
      'quantite', null, 'unite', null, 'prix_unitaire_ht', null, 'total_ht', -ht));
  end if;

  numero := public.prochain_numero('avoir', f.test);
  contenu := f.contenu || jsonb_build_object(
    'type', 'avoir',
    'numero', numero,
    'date', to_char(now() at time zone 'Europe/Paris', 'DD/MM/YYYY'),
    'facture', jsonb_build_object('numero', f.numero, 'date', to_char(f.emis_le at time zone 'Europe/Paris', 'DD/MM/YYYY'), 'total_ttc', f.total_ttc),
    'motif', trim(p_motif),
    'avoir_total', total,
    'lignes', lignes,
    'total_ht', -ht,
    'tva', -(ttc - ht),
    'total_ttc', -ttc,
    'acompte', 0,
    'reste', 0,
    'mode_paiement', p_mode,
    'acquittee', p_mode is not null,
    'test', f.test);
  insert into public.documents (type, numero, course_id, total_ht, tva, total_ttc, mode_paiement, contenu, test, facture_id)
  values ('avoir', numero, f.course_id, -ht, -(ttc - ht), -ttc, p_mode, contenu, f.test, f.id)
  returning * into d;
  return d;
end;
$$;

-- ——— Email au client avec l'avoir en PDF ———
alter table public.emails drop constraint if exists emails_type_check;
alter table public.emails add constraint emails_type_check check (type in ('demande_recue', 'acompte', 'confirmation', 'refus', 'expiree',
  'annulation', 'remboursement', 'facture', 'avoir', 'chauffeur_demande', 'chauffeur_annulation'));

create or replace function public.emails_documents()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  select * into c from public.courses where id = new.course_id;
  perform public.mettre_email(case new.type when 'facture' then 'facture' when 'avoir' then 'avoir' else 'confirmation' end,
    c.id, new.id, public.email_client(c), c.nom);
  return new;
end;
$$;

-- ——— Droits ———
revoke execute on function public.reste_facture(uuid) from public, anon, authenticated;
revoke execute on function public.emettre_avoir(uuid, numeric, text, text) from public, anon;
grant execute on function public.emettre_avoir(uuid, numeric, text, text) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.reste_facture(uuid), public.emettre_avoir(uuid, numeric, text, text) to service_role;
  end if;
end $$;
