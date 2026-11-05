-- Volant3ranches VTC — correctif : le moteur d'itinéraire « bdtopo-osrm » n'existe plus à l'IGN.
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), après « itineraires ».
-- On utilise « bdtopo-valhalla », puis « bdtopo-pgr » en secours (liste : /navigation/getcapabilities).

create or replace function public.itineraire_ign(p_dep_lon float8, p_dep_lat float8, p_arr_lon float8, p_arr_lat float8)
returns table (distance_km numeric, duree_min int)
language plpgsql volatile security definer set search_path = public, extensions
as $$
declare
  moteur text;
  r extensions.http_response;
  j jsonb;
  d numeric;
  t numeric;
  derniere_erreur text := 'sans réponse';
begin
  if p_dep_lon is null or p_dep_lat is null or p_arr_lon is null or p_arr_lat is null then
    raise exception 'Adresse incomplète : position inconnue';
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  foreach moteur in array array['bdtopo-valhalla', 'bdtopo-pgr'] loop
    begin
      select * into r from extensions.http_get(format(
        'https://data.geopf.fr/navigation/itineraire?resource=%s&profile=car&optimization=fastest'
        '&start=%s,%s&end=%s,%s&distanceUnit=kilometer&timeUnit=minute&geometryFormat=geojson&getSteps=false',
        moteur, p_dep_lon, p_dep_lat, p_arr_lon, p_arr_lat));
    exception when others then
      derniere_erreur := sqlerrm;
      continue;
    end;
    if r.status is distinct from 200 then
      derniere_erreur := coalesce(r.status::text, 'sans réponse');
      continue;
    end if;
    j := r.content::jsonb;
    d := (j ->> 'distance')::numeric;
    t := (j ->> 'duration')::numeric;
    if coalesce(j ->> 'distanceUnit', 'kilometer') in ('meter', 'm') then d := d / 1000; end if;
    if coalesce(j ->> 'timeUnit', 'minute') in ('second', 's') then t := t / 60; end if;
    if d is null or d <= 0 or d >= 2000 then
      derniere_erreur := 'réponse sans distance';
      continue;
    end if;
    distance_km := round(d, 1);
    duree_min := greatest(1, round(coalesce(t, 0)))::int;
    return next;
    return;
  end loop;
  raise exception 'Itinéraire indisponible (service IGN : %)', derniere_erreur;
end;
$$;

revoke execute on function public.itineraire_ign(float8, float8, float8, float8) from public, anon, authenticated;
