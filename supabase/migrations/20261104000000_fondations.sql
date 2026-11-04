-- Volant3ranches VTC — fondations de la base de données.
-- À exécuter une fois dans Supabase : SQL Editor › New query › coller ce fichier › Run.
--
-- Principes :
--  * Les tarifs sont en base : Fabrice les modifie sans nouvelle version de l'application.
--  * Le prix est toujours recalculé par la base (fonction calculer_prix), jamais pris tel quel de l'appli.
--  * Les clients ne lisent que leurs courses ; seul le chauffeur (Fabrice) confirme ou refuse.
--  * Aucune écriture directe dans les tables : tout passe par des fonctions qui vérifient les règles.

-- ——— Types ———
create type public.statut_course as enum ('envoyee', 'confirmee', 'refusee', 'annulee', 'terminee');

-- ——— Tables ———
create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'client' check (role in ('client', 'chauffeur')),
  nom text,
  telephone text,
  email text,
  cree_le timestamptz not null default now()
);

create table public.offres (
  id text primary key,
  nom text not null,
  vehicule text not null,
  passagers_max int not null,
  bagages_max int not null,
  prix_km_jour numeric(6, 2) not null,
  prix_km_majore numeric(6, 2) not null,
  minimum numeric(8, 2) not null,
  ordre int not null default 0,
  active boolean not null default true
);

create table public.parametres (
  id int primary key default 1 check (id = 1),
  nuit_debut int not null default 22,
  nuit_fin int not null default 6,
  majoration_weekend boolean not null default true,
  coef_aller_retour numeric(4, 2) not null default 1.90,
  arrondi numeric(4, 2) not null default 0.50,
  attente_standard_min int not null default 10,
  attente_aeroport_min int not null default 30,
  attente_gare_min int not null default 15,
  delai_confirmation_min int not null default 30,
  telephone_chauffeur text not null default '+33616531491'
);

create table public.jours_feries (
  jour date primary key
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  depart_ref text,
  depart_libelle text not null,
  depart_detail text,
  depart_type text,
  depart_lat double precision,
  depart_lon double precision,
  arrivee_ref text,
  arrivee_libelle text not null,
  arrivee_detail text,
  arrivee_type text,
  arrivee_lat double precision,
  arrivee_lon double precision,
  date_heure timestamptz not null,
  aller_retour boolean not null default false,
  passagers int not null check (passagers between 1 and 8),
  bagages int not null check (bagages between 0 and 8),
  numero_vol_train text,
  offre_id text not null references public.offres (id),
  distance_km numeric(7, 1) not null check (distance_km > 0 and distance_km < 2000),
  duree_min int,
  montant numeric(8, 2) not null,
  prix_km numeric(6, 2) not null,
  majorations text[] not null default '{}',
  nom text not null,
  telephone text not null,
  email text not null,
  commentaire text,
  statut public.statut_course not null default 'envoyee',
  envoyee_le timestamptz not null default now(),
  confirmee_le timestamptz,
  refusee_le timestamptz,
  motif_refus text,
  annulee_le timestamptz,
  frais_annulation numeric(8, 2),
  terminee_le timestamptz
);

create index courses_client_idx on public.courses (client_id, date_heure desc);
create index courses_statut_idx on public.courses (statut, date_heure);

-- ——— Rôle chauffeur ———
create or replace function public.est_chauffeur()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'chauffeur');
$$;

-- ——— Prix : mêmes règles que le site (module de réservation) ———
create or replace function public.calculer_prix(
  p_offre text, p_km numeric, p_date_heure timestamptz, p_aller_retour boolean
)
returns table (montant numeric, prix_km numeric, majorations text[])
language plpgsql stable security definer set search_path = public
as $$
declare
  o public.offres;
  pa public.parametres;
  t timestamp;
  h int;
  j int;
  raisons text[] := '{}';
  p numeric;
begin
  select * into o from public.offres where id = p_offre and active;
  if not found then raise exception 'Offre inconnue'; end if;
  select * into pa from public.parametres where id = 1;

  t := p_date_heure at time zone 'Europe/Paris';
  h := extract(hour from t);
  j := extract(dow from t);
  if h >= pa.nuit_debut or h < pa.nuit_fin then
    raisons := raisons || format('nuit (%sh–%sh)', pa.nuit_debut, pa.nuit_fin);
  end if;
  if pa.majoration_weekend and j = 6 then raisons := raisons || 'samedi'::text; end if;
  if pa.majoration_weekend and j = 0 then raisons := raisons || 'dimanche'::text; end if;
  if exists (select 1 from public.jours_feries f where f.jour = t::date) then
    raisons := raisons || 'jour férié'::text;
  end if;

  prix_km := case when cardinality(raisons) > 0 then o.prix_km_majore else o.prix_km_jour end;
  p := p_km * prix_km;
  if p_aller_retour then p := p * pa.coef_aller_retour; end if;
  p := greatest(p, o.minimum);
  montant := round(p / pa.arrondi) * pa.arrondi;
  majorations := raisons;
  return next;
end;
$$;

-- ——— Demande de course (client) ———
-- Étape 2 : la distance sera calculée côté serveur (Google Routes) au lieu d'être transmise par l'appli.
create or replace function public.creer_demande(
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
  p_nom text,
  p_telephone text,
  p_email text,
  p_commentaire text
)
returns public.courses
language plpgsql security definer set search_path = public
as $$
declare
  o public.offres;
  pr record;
  c public.courses;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into o from public.offres where id = p_offre and active;
  if not found then raise exception 'Offre inconnue'; end if;
  if p_passagers > o.passagers_max or p_bagages > o.bagages_max then
    raise exception 'Capacité du véhicule dépassée';
  end if;
  if p_date_heure < now() - interval '5 minutes' then raise exception 'La date est passée'; end if;
  if length(trim(coalesce(p_nom, ''))) < 2
     or length(regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g')) < 10
     or position('@' in coalesce(p_email, '')) = 0 then
    raise exception 'Coordonnées incomplètes';
  end if;

  select * into pr from public.calculer_prix(p_offre, p_distance_km, p_date_heure, p_aller_retour);

  insert into public.courses (
    client_id,
    depart_ref, depart_libelle, depart_detail, depart_type, depart_lat, depart_lon,
    arrivee_ref, arrivee_libelle, arrivee_detail, arrivee_type, arrivee_lat, arrivee_lon,
    date_heure, aller_retour, passagers, bagages, numero_vol_train, offre_id,
    distance_km, duree_min, montant, prix_km, majorations,
    nom, telephone, email, commentaire
  ) values (
    auth.uid(),
    p_depart ->> 'ref', p_depart ->> 'libelle', p_depart ->> 'detail', p_depart ->> 'type',
    (p_depart ->> 'lat')::float8, (p_depart ->> 'lon')::float8,
    p_arrivee ->> 'ref', p_arrivee ->> 'libelle', p_arrivee ->> 'detail', p_arrivee ->> 'type',
    (p_arrivee ->> 'lat')::float8, (p_arrivee ->> 'lon')::float8,
    p_date_heure, p_aller_retour, p_passagers, p_bagages, nullif(trim(p_numero), ''), p_offre,
    p_distance_km, p_duree_min, pr.montant, pr.prix_km, pr.majorations,
    trim(p_nom), trim(p_telephone), trim(p_email), nullif(trim(p_commentaire), '')
  )
  returning * into c;

  insert into public.profils (id, nom, telephone, email)
  values (auth.uid(), trim(p_nom), trim(p_telephone), trim(p_email))
  on conflict (id) do update
    set nom = excluded.nom, telephone = excluded.telephone, email = excluded.email;

  return c;
end;
$$;

-- ——— Réponse du chauffeur ———
create or replace function public.repondre_demande(p_course uuid, p_accepter boolean, p_motif text default null)
returns public.courses
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  update public.courses
     set statut = case when p_accepter then 'confirmee' else 'refusee' end::public.statut_course,
         confirmee_le = case when p_accepter then now() end,
         refusee_le = case when p_accepter then null else now() end,
         motif_refus = case when p_accepter then null else p_motif end
   where id = p_course and statut = 'envoyee'
  returning * into c;
  if not found then raise exception 'Demande introuvable ou déjà traitée'; end if;
  return c;
end;
$$;

create or replace function public.terminer_course(p_course uuid)
returns public.courses
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  update public.courses set statut = 'terminee', terminee_le = now()
   where id = p_course and statut = 'confirmee'
  returning * into c;
  if not found then raise exception 'Course introuvable ou non confirmée'; end if;
  return c;
end;
$$;

-- ——— Annulation par le client (frais selon les CGV, art. 8) ———
create or replace function public.annuler_course(p_course uuid)
returns public.courses
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
  heures numeric;
  taux numeric;
begin
  select * into c from public.courses
   where id = p_course and client_id = auth.uid() and statut in ('envoyee', 'confirmee')
   for update;
  if not found then raise exception 'Course introuvable ou déjà terminée'; end if;

  heures := extract(epoch from (c.date_heure - now())) / 3600;
  -- Une demande pas encore confirmée s'annule toujours sans frais.
  taux := case
    when c.statut = 'envoyee' then 0
    when heures > 24 then 0
    when heures > 12 then 0.5
    else 1
  end;

  update public.courses
     set statut = 'annulee', annulee_le = now(), frais_annulation = round(c.montant * taux, 2)
   where id = p_course
  returning * into c;
  return c;
end;
$$;

-- ——— Sécurité (Row Level Security) ———
alter table public.profils enable row level security;
alter table public.offres enable row level security;
alter table public.parametres enable row level security;
alter table public.jours_feries enable row level security;
alter table public.courses enable row level security;

create policy "Tarifs lisibles par tous" on public.offres for select to anon, authenticated using (true);
create policy "Tarifs modifiables par le chauffeur" on public.offres for update to authenticated
  using (public.est_chauffeur()) with check (public.est_chauffeur());

create policy "Paramètres lisibles par tous" on public.parametres for select to anon, authenticated using (true);
create policy "Paramètres modifiables par le chauffeur" on public.parametres for update to authenticated
  using (public.est_chauffeur()) with check (public.est_chauffeur());

create policy "Jours fériés lisibles par tous" on public.jours_feries for select to anon, authenticated using (true);
create policy "Jours fériés ajoutés par le chauffeur" on public.jours_feries for insert to authenticated
  with check (public.est_chauffeur());
create policy "Jours fériés retirés par le chauffeur" on public.jours_feries for delete to authenticated
  using (public.est_chauffeur());

create policy "Voir son profil" on public.profils for select to authenticated
  using (id = auth.uid() or public.est_chauffeur());
create policy "Modifier son profil" on public.profils for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Voir ses courses" on public.courses for select to authenticated
  using (client_id = auth.uid() or public.est_chauffeur());
-- Pas de politique d'écriture sur courses : uniquement via les fonctions ci-dessus.

-- ——— Droits d'accès de l'API (les nouvelles tables ne sont pas exposées automatiquement) ———
grant usage on schema public to anon, authenticated;
grant select on public.offres, public.parametres, public.jours_feries to anon, authenticated;
grant update on public.offres, public.parametres to authenticated;
grant insert, delete on public.jours_feries to authenticated;
grant select on public.profils to authenticated;
grant update (nom, telephone, email) on public.profils to authenticated; -- jamais le rôle
grant select on public.courses to authenticated;

revoke execute on function public.est_chauffeur() from public, anon;
revoke execute on function public.calculer_prix(text, numeric, timestamptz, boolean) from public;
revoke execute on function public.creer_demande(jsonb, jsonb, timestamptz, boolean, int, int, text, text, numeric, int, text, text, text, text) from public, anon;
revoke execute on function public.repondre_demande(uuid, boolean, text) from public, anon;
revoke execute on function public.terminer_course(uuid) from public, anon;
revoke execute on function public.annuler_course(uuid) from public, anon;

grant execute on function public.est_chauffeur() to authenticated;
grant execute on function public.calculer_prix(text, numeric, timestamptz, boolean) to anon, authenticated;
grant execute on function public.creer_demande(jsonb, jsonb, timestamptz, boolean, int, int, text, text, numeric, int, text, text, text, text) to authenticated;
grant execute on function public.repondre_demande(uuid, boolean, text) to authenticated;
grant execute on function public.terminer_course(uuid) to authenticated;
grant execute on function public.annuler_course(uuid) to authenticated;

-- ——— Temps réel : l'appli voit la confirmation de Fabrice instantanément ———
alter publication supabase_realtime add table public.courses;

-- ——— Données de départ (tarifs du site, mars 2026) ———
insert into public.offres (id, nom, vehicule, passagers_max, bagages_max, prix_km_jour, prix_km_majore, minimum, ordre) values
  ('tesla', 'Offre Confort', 'Tesla Model 3 Performance', 3, 3, 1.80, 2.20, 20.00, 1),
  ('van', 'Offre Premium', 'Van 9 places', 8, 8, 2.60, 3.00, 35.00, 2);

insert into public.parametres (id) values (1);

insert into public.jours_feries (jour) values
  ('2026-01-01'), ('2026-04-06'), ('2026-05-01'), ('2026-05-08'), ('2026-05-14'), ('2026-05-25'),
  ('2026-07-14'), ('2026-08-15'), ('2026-11-01'), ('2026-11-11'), ('2026-12-25'),
  ('2027-01-01'), ('2027-03-29'), ('2027-05-01'), ('2027-05-06'), ('2027-05-08'), ('2027-05-17'),
  ('2027-07-14'), ('2027-08-15'), ('2027-11-01'), ('2027-11-11'), ('2027-12-25'),
  ('2028-01-01'), ('2028-04-17'), ('2028-05-01'), ('2028-05-08'), ('2028-05-25'), ('2028-06-05'),
  ('2028-07-14'), ('2028-08-15'), ('2028-11-01'), ('2028-11-11'), ('2028-12-25');
