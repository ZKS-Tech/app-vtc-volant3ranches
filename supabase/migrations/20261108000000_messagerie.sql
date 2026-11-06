-- Volant3ranches VTC — messagerie client ↔ chauffeur, une conversation par course.
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), après les migrations
-- précédentes.
--
-- Gratuit (pas de SMS) : utile en cas d'imprévu, notamment pour les voyageurs étrangers.
-- Seuls le client de la course et Fabrice lisent la conversation ; on écrit uniquement par la
-- fonction envoyer_message, qui vérifie les droits et limite les envois.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  auteur_id uuid not null references auth.users (id) on delete cascade,
  de_chauffeur boolean not null default false,
  texte text not null check (length(trim(texte)) between 1 and 1000),
  envoye_le timestamptz not null default now(),
  lu_le timestamptz
);

create index messages_course_idx on public.messages (course_id, envoye_le);

-- Participant à une course : son client (compte de l'appli) ou le chauffeur.
create or replace function public.participe_a(p_course uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.est_chauffeur()
      or exists (select 1 from public.courses where id = p_course and client_id = auth.uid());
$$;

create or replace function public.envoyer_message(p_course uuid, p_texte text)
returns public.messages
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
  m public.messages;
begin
  if auth.uid() is null or not public.participe_a(p_course) then
    raise exception 'Conversation introuvable';
  end if;
  select * into c from public.courses where id = p_course;
  if c.client_id is null then
    raise exception 'Ce client n’utilise pas l’application : appelez-le';
  end if;
  -- La conversation reste ouverte jusqu'à deux jours après la course.
  if c.date_heure < now() - interval '2 days' then
    raise exception 'Cette conversation est close';
  end if;
  if length(trim(coalesce(p_texte, ''))) = 0 then raise exception 'Message vide'; end if;
  if length(trim(p_texte)) > 1000 then raise exception 'Message trop long (1 000 caractères au plus)'; end if;
  if (select count(*) from public.messages where auteur_id = auth.uid() and envoye_le > now() - interval '10 minutes') >= 30 then
    raise exception 'Trop de messages en peu de temps : patientez un instant, ou appelez';
  end if;
  insert into public.messages (course_id, auteur_id, de_chauffeur, texte)
  values (p_course, auth.uid(), public.est_chauffeur(), trim(p_texte))
  returning * into m;
  return m;
end;
$$;

-- Marque comme lus les messages reçus de l'autre côté.
create or replace function public.marquer_lus(p_course uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null or not public.participe_a(p_course) then return 0; end if;
  update public.messages set lu_le = now()
   where course_id = p_course and lu_le is null and de_chauffeur <> public.est_chauffeur();
  get diagnostics n = row_count;
  return n;
end;
$$;

alter table public.messages enable row level security;
create policy "Voir les messages de ses courses" on public.messages for select to authenticated
  using (public.participe_a(course_id));

grant select on public.messages to authenticated;
revoke execute on function public.participe_a(uuid) from public, anon;
revoke execute on function public.envoyer_message(uuid, text) from public, anon;
revoke execute on function public.marquer_lus(uuid) from public, anon;
grant execute on function public.participe_a(uuid) to authenticated;
grant execute on function public.envoyer_message(uuid, text) to authenticated;
grant execute on function public.marquer_lus(uuid) to authenticated;

alter publication supabase_realtime add table public.messages;
