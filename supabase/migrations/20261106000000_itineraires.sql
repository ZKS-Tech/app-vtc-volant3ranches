-- Volant3ranches VTC — vraies adresses et vraie distance par la route.
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), après les migrations
-- « fondations » et « espace_chauffeur ».
--
-- La distance et la durée sont calculées par la base auprès du service d'itinéraire de l'IGN
-- (Géoplateforme, gratuit, sans clé). La distance envoyée par l'appli n'est plus utilisée pour les
-- demandes des clients : un prix ne peut pas être truqué.

create extension if not exists http with schema extensions;

-- ——— Itinéraire IGN (voiture, le plus rapide) ———
create or replace function public.itineraire_ign(p_dep_lon float8, p_dep_lat float8, p_arr_lon float8, p_arr_lat float8)
returns table (distance_km numeric, duree_min int)
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  r extensions.http_response;
  j jsonb;
  d numeric;
  t numeric;
begin
  if p_dep_lon is null or p_dep_lat is null or p_arr_lon is null or p_arr_lat is null then
    raise exception 'Adresse incomplète : position inconnue';
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  select * into r from extensions.http_get(format(
    'https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest'
    '&start=%s,%s&end=%s,%s&distanceUnit=kilometer&timeUnit=minute&geometryFormat=geojson&getSteps=false',
    p_dep_lon, p_dep_lat, p_arr_lon, p_arr_lat));
  if r.status is distinct from 200 then
    raise exception 'Itinéraire indisponible (service IGN : %)', coalesce(r.status::text, 'sans réponse');
  end if;
  j := r.content::jsonb;
  d := (j ->> 'distance')::numeric;
  t := (j ->> 'duration')::numeric;
  -- Unités demandées : km et minutes ; on accepte aussi mètres et secondes si le service les renvoie.
  if coalesce(j ->> 'distanceUnit', 'kilometer') in ('meter', 'm') then d := d / 1000; end if;
  if coalesce(j ->> 'timeUnit', 'minute') in ('second', 's') then t := t / 60; end if;
  if d is null or d <= 0 or d >= 2000 then raise exception 'Itinéraire indisponible'; end if;
  distance_km := round(d, 1);
  duree_min := greatest(1, round(coalesce(t, 0)))::int;
  return next;
end;
$$;

-- ——— Demande d'un client : distance IGN, limite anti-abus ———
create or replace function public.creer_demande(
  p_depart jsonb,
  p_arrivee jsonb,
  p_date_heure timestamptz,
  p_aller_retour boolean,
  p_passagers int,
  p_bagages int,
  p_numero text,
  p_offre text,
  p_distance_km numeric, -- ignorée : la distance est recalculée ci-dessous
  p_duree_min int,       -- ignorée
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
  it record;
  pr record;
  c public.courses;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  -- Au plus 5 demandes par heure et par téléphone : de quoi corriger une erreur, pas de quoi inonder Fabrice.
  if (select count(*) from public.courses where client_id = auth.uid() and envoyee_le > now() - interval '1 hour') >= 5 then
    raise exception 'Trop de demandes en peu de temps. Appelez Fabrice au 06 16 53 14 91';
  end if;
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

  select * into it from public.itineraire_ign(
    (p_depart ->> 'lon')::float8, (p_depart ->> 'lat')::float8,
    (p_arrivee ->> 'lon')::float8, (p_arrivee ->> 'lat')::float8);
  select * into pr from public.calculer_prix(p_offre, it.distance_km, p_date_heure, p_aller_retour);

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
    it.distance_km, it.duree_min, pr.montant, pr.prix_km, pr.majorations,
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

-- ——— Course saisie par Fabrice : distance IGN, ou celle de l'appli si l'IGN ne répond pas ———
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
  it record;
  v_km numeric := p_distance_km;
  v_min int := p_duree_min;
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

  begin
    select * into it from public.itineraire_ign(
      (p_depart ->> 'lon')::float8, (p_depart ->> 'lat')::float8,
      (p_arrivee ->> 'lon')::float8, (p_arrivee ->> 'lat')::float8);
    v_km := it.distance_km;
    v_min := it.duree_min;
  exception when others then
    if v_km is null or v_km <= 0 then raise; end if; -- pas de distance du tout : on refuse
  end;

  select * into pr from public.calculer_prix(p_offre, v_km, p_date_heure, p_aller_retour);

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
    v_km, v_min,
    coalesce(p_montant, pr.montant), p_montant is not null and p_montant <> pr.montant, pr.prix_km, pr.majorations,
    f.nom, coalesce(f.telephone, ''), f.email, nullif(trim(p_commentaire), ''),
    'confirmee', now()
  )
  returning * into c;
  return c;
end;
$$;

revoke execute on function public.itineraire_ign(float8, float8, float8, float8) from public, anon, authenticated;
