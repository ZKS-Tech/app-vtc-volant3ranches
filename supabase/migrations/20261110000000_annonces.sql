-- Volant3ranches VTC — annonces et indisponibilités de Fabrice.
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), après les migrations
-- précédentes.
--
-- Fabrice publie une annonce depuis Gestion :
--  • indisponibilité (vacances…) : bandeau côté client dès la publication et jusqu'au dernier jour,
--    jours grisés dans le choix de la date, et la base refuse les demandes sur ces jours ;
--  • simple information : bandeau affiché entre les deux dates, sans rien bloquer.

create table public.annonces (
  id uuid primary key default gen_random_uuid(),
  debut date not null,
  fin date not null,
  bloquer boolean not null default true,
  message text check (message is null or char_length(message) <= 500),
  cree_le timestamptz not null default now(),
  check (fin >= debut)
);
create index annonces_fin_idx on public.annonces (fin);

alter table public.annonces enable row level security;
-- Les clients ne voient que les annonces en cours ou à venir ; Fabrice voit tout.
create policy "Annonces visibles" on public.annonces for select to anon, authenticated
  using (fin >= (now() at time zone 'Europe/Paris')::date);
create policy "Fabrice voit tout" on public.annonces for select to authenticated using (public.est_chauffeur());
create policy "Fabrice publie" on public.annonces for insert to authenticated with check (public.est_chauffeur());
create policy "Fabrice modifie" on public.annonces for update to authenticated using (public.est_chauffeur()) with check (public.est_chauffeur());
create policy "Fabrice supprime" on public.annonces for delete to authenticated using (public.est_chauffeur());
grant select on public.annonces to anon, authenticated;
grant insert, update, delete on public.annonces to authenticated;

alter publication supabase_realtime add table public.annonces;

-- Indisponibilité qui couvre une date donnée (heure de Paris), s'il y en a une.
create or replace function public.indisponibilite_le(p_date timestamptz)
returns public.annonces
language sql stable security definer set search_path = public
as $$
  select * from public.annonces
   where bloquer and (p_date at time zone 'Europe/Paris')::date between debut and fin
   order by debut limit 1;
$$;

-- Les demandes envoyées depuis l'appli sur une période d'indisponibilité sont refusées par la base,
-- même si l'appli n'est pas à jour. Les courses que Fabrice saisit lui-même restent possibles.
create or replace function public.verifier_disponibilite()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  a public.annonces;
begin
  if new.source = 'appli' then
    a := public.indisponibilite_le(new.date_heure);
    if a.id is not null then
      raise exception 'Fabrice est indisponible du % au %. Choisissez une autre date ou appelez-le au 06 16 53 14 91',
        to_char(a.debut, 'DD/MM'), to_char(a.fin, 'DD/MM');
    end if;
  end if;
  return new;
end;
$$;

create trigger courses_disponibilite
  before insert on public.courses
  for each row execute function public.verifier_disponibilite();

revoke execute on function public.indisponibilite_le(timestamptz) from public, anon, authenticated;
