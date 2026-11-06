-- Volant3ranches VTC — espace chauffeur : fiches clients, courses saisies par Fabrice, gestion.
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), après la migration
-- « fondations ».

-- ——— Fiches clients (le carnet de Fabrice) ———
-- Une fiche par client, qu'il ait réservé dans l'appli ou par téléphone. Le téléphone (chiffres seuls)
-- sert à reconnaître un client qui revient.
create table public.fiches_clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  telephone text,
  telephone_norm text unique,
  email text,
  notes text,
  profil_id uuid references auth.users (id) on delete set null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create or replace function public.normaliser_telephone(t text)
returns text
language sql immutable
as $$
  -- « 06 12 34 56 78 », « +33 6 12 34 56 78 » et « 0612345678 » donnent tous « 0612345678 ».
  select case
    when t is null or regexp_replace(t, '\D', '', 'g') = '' then null
    when regexp_replace(t, '\D', '', 'g') ~ '^33\d{9}$' then '0' || substr(regexp_replace(t, '\D', '', 'g'), 3)
    else regexp_replace(t, '\D', '', 'g')
  end;
$$;

-- Trouve la fiche d'un client par son téléphone, ou la crée.
create or replace function public.fiche_pour(p_nom text, p_telephone text, p_email text, p_profil uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_norm text := public.normaliser_telephone(p_telephone);
begin
  if v_norm is not null then
    select id into v_id from public.fiches_clients where telephone_norm = v_norm;
  end if;
  if v_id is null then
    insert into public.fiches_clients (nom, telephone, telephone_norm, email, profil_id)
    values (trim(p_nom), nullif(trim(p_telephone), ''), v_norm, nullif(trim(p_email), ''), p_profil)
    returning id into v_id;
  else
    update public.fiches_clients
       set email = coalesce(nullif(trim(p_email), ''), email),
           profil_id = coalesce(p_profil, profil_id),
           maj_le = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;

-- ——— Courses : client sans compte, origine de la réservation, note de Fabrice ———
alter table public.courses alter column client_id drop not null;
alter table public.courses alter column client_id drop default;
alter table public.courses alter column email drop not null;
alter table public.courses add column fiche_id uuid references public.fiches_clients (id) on delete set null;
alter table public.courses add column source text not null default 'appli'
  check (source in ('appli', 'telephone', 'email', 'autre'));
alter table public.courses add column prix_ajuste boolean not null default false;
alter table public.courses add column note_chauffeur text;
create index courses_fiche_idx on public.courses (fiche_id);

-- Les courses déjà enregistrées reçoivent leur fiche.
update public.courses c
   set fiche_id = public.fiche_pour(c.nom, c.telephone, c.email, c.client_id)
 where c.fiche_id is null;

-- ——— Demande depuis l'appli : rattachée à la fiche du client ———
create or replace function public.rattacher_fiche()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.fiche_id is null then
    new.fiche_id := public.fiche_pour(new.nom, new.telephone, new.email, new.client_id);
  end if;
  return new;
end;
$$;

create trigger courses_rattacher_fiche
  before insert on public.courses
  for each row execute function public.rattacher_fiche();

-- ——— Course saisie par Fabrice (réservation par téléphone, email…) ———
-- Directement confirmée. Le prix est calculé par la base ; Fabrice peut l'ajuster (prix négocié).
create or replace function public.creer_course_manuelle(
  p_fiche uuid,
  p_nom text,
  p_telephone text,
  p_email text,
  p_depart jsonb,
  p_arrivee jsonb,
  p_date_heure timestamptz,
  p_aller_retour boolean,
  p_passagers int,
  p_bagages int,
  p_numero text,
  p_offre text,
  p_distance_km numeric,
  p_duree_min int,
  p_montant numeric,
  p_source text,
  p_commentaire text
)
returns public.courses
language plpgsql security definer set search_path = public
as $$
declare
  o public.offres;
  pr record;
  f public.fiches_clients;
  v_fiche uuid := p_fiche;
  c public.courses;
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  select * into o from public.offres where id = p_offre and active;
  if not found then raise exception 'Offre inconnue'; end if;
  if p_passagers > o.passagers_max or p_bagages > o.bagages_max then
    raise exception 'Capacité du véhicule dépassée';
  end if;
  if v_fiche is null then
    if length(trim(coalesce(p_nom, ''))) < 2 then raise exception 'Nom du client manquant'; end if;
    v_fiche := public.fiche_pour(p_nom, p_telephone, p_email, null);
  end if;
  select * into f from public.fiches_clients where id = v_fiche;
  if not found then raise exception 'Client introuvable'; end if;

  select * into pr from public.calculer_prix(p_offre, p_distance_km, p_date_heure, p_aller_retour);

  insert into public.courses (
    client_id, fiche_id, source,
    depart_ref, depart_libelle, depart_detail, depart_type, depart_lat, depart_lon,
    arrivee_ref, arrivee_libelle, arrivee_detail, arrivee_type, arrivee_lat, arrivee_lon,
    date_heure, aller_retour, passagers, bagages, numero_vol_train, offre_id,
    distance_km, duree_min, montant, prix_ajuste, prix_km, majorations,
    nom, telephone, email, commentaire,
    statut, confirmee_le
  ) values (
    f.profil_id, f.id, coalesce(p_source, 'telephone'),
    p_depart ->> 'ref', p_depart ->> 'libelle', p_depart ->> 'detail', p_depart ->> 'type',
    (p_depart ->> 'lat')::float8, (p_depart ->> 'lon')::float8,
    p_arrivee ->> 'ref', p_arrivee ->> 'libelle', p_arrivee ->> 'detail', p_arrivee ->> 'type',
    (p_arrivee ->> 'lat')::float8, (p_arrivee ->> 'lon')::float8,
    p_date_heure, p_aller_retour, p_passagers, p_bagages, nullif(trim(p_numero), ''), p_offre,
    p_distance_km, p_duree_min,
    coalesce(p_montant, pr.montant), p_montant is not null and p_montant <> pr.montant, pr.prix_km, pr.majorations,
    f.nom, coalesce(f.telephone, ''), f.email, nullif(trim(p_commentaire), ''),
    'confirmee', now()
  )
  returning * into c;
  return c;
end;
$$;

-- ——— Annulation par Fabrice (client qui prévient par téléphone…) ———
create or replace function public.annuler_course_chauffeur(p_course uuid, p_frais numeric default 0)
returns public.courses
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  update public.courses
     set statut = 'annulee', annulee_le = now(), frais_annulation = greatest(0, coalesce(p_frais, 0))
   where id = p_course and statut in ('envoyee', 'confirmee')
  returning * into c;
  if not found then raise exception 'Course introuvable ou déjà terminée'; end if;
  return c;
end;
$$;

-- Note privée de Fabrice sur une course.
create or replace function public.noter_course(p_course uuid, p_note text)
returns public.courses
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  update public.courses set note_chauffeur = nullif(trim(p_note), '') where id = p_course returning * into c;
  return c;
end;
$$;

-- ——— Sécurité ———
alter table public.fiches_clients enable row level security;
create policy "Fiches réservées au chauffeur" on public.fiches_clients for all to authenticated
  using (public.est_chauffeur()) with check (public.est_chauffeur());

grant select, insert, update, delete on public.fiches_clients to authenticated;

revoke execute on function public.fiche_pour(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.rattacher_fiche() from public, anon, authenticated;
revoke execute on function public.creer_course_manuelle(uuid, text, text, text, jsonb, jsonb, timestamptz, boolean, int, int, text, text, numeric, int, numeric, text, text) from public, anon;
revoke execute on function public.annuler_course_chauffeur(uuid, numeric) from public, anon;
revoke execute on function public.noter_course(uuid, text) from public, anon;
grant execute on function public.creer_course_manuelle(uuid, text, text, text, jsonb, jsonb, timestamptz, boolean, int, int, text, text, numeric, int, numeric, text, text) to authenticated;
grant execute on function public.annuler_course_chauffeur(uuid, numeric) to authenticated;
grant execute on function public.noter_course(uuid, text) to authenticated;

alter publication supabase_realtime add table public.fiches_clients;
