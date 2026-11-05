-- Volant3ranches VTC — notifications push (service gratuit d'Expo).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), après les migrations
-- précédentes.
--
-- Qui est prévenu, et quand :
--  • Fabrice : nouvelle demande, demande sans réponse depuis 30 min, annulation par un client, message reçu ;
--  • le client : course confirmée, demande refusée (avec le motif), annulation par Fabrice, message
--    reçu, rappel la veille de la course.
-- La base envoie elle-même les notifications (extension pg_net, sans attendre la réponse), et une
-- tâche planifiée (pg_cron) s'occupe des relances et des rappels toutes les 5 minutes.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ——— Téléphones enregistrés (jeton Expo par appareil) ———
create table public.appareils (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plateforme text,
  maj_le timestamptz not null default now()
);
create index appareils_user_idx on public.appareils (user_id);
alter table public.appareils enable row level security;
create policy "Voir ses appareils" on public.appareils for select to authenticated using (user_id = auth.uid());
grant select on public.appareils to authenticated;

create or replace function public.enregistrer_appareil(p_token text, p_plateforme text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[.+\]$' then raise exception 'Jeton de notification invalide'; end if;
  -- Un téléphone appartient au dernier compte connecté (invité, puis Fabrice par exemple).
  insert into public.appareils (token, user_id, plateforme) values (p_token, auth.uid(), p_plateforme)
  on conflict (token) do update set user_id = auth.uid(), plateforme = excluded.plateforme, maj_le = now();
end;
$$;

create or replace function public.oublier_appareil(p_token text)
returns void
language sql security definer set search_path = public
as $$
  delete from public.appareils where token = p_token and user_id = auth.uid();
$$;

-- ——— Envoi (service push d'Expo, 100 messages au plus par appel) ———
create or replace function public.notifier(p_users uuid[], p_titre text, p_corps text, p_donnees jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  lot jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', token, 'title', p_titre, 'body', p_corps, 'data', coalesce(p_donnees, '{}'::jsonb),
           'sound', 'default', 'channelId', 'courses', 'priority', 'high'))
    into lot
    from (select token from public.appareils where user_id = any (p_users) limit 100) t;
  if lot is null then return; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := lot,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
end;
$$;

create or replace function public.chauffeurs()
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(id), '{}') from public.profils where role = 'chauffeur';
$$;

-- « 06/11 à 9h05 », à l'heure de Paris.
create or replace function public.quand_fr(t timestamptz)
returns text
language sql immutable
as $$
  select to_char(t at time zone 'Europe/Paris', 'DD/MM "à" FMHH24"h"MI');
$$;

-- ——— Courses : nouvelle demande, confirmation, refus, annulation ———
alter table public.courses add column relance_le timestamptz;
alter table public.courses add column rappel_le timestamptz;

create or replace function public.notif_courses()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  trajet text := new.depart_libelle || ' → ' || new.arrivee_libelle;
begin
  if tg_op = 'INSERT' then
    if new.source = 'appli' and new.statut = 'envoyee' then
      perform public.notifier(public.chauffeurs(), 'Nouvelle demande · ' || new.nom,
        format('%s · %s · %s €', public.quand_fr(new.date_heure), trajet, replace(to_char(new.montant, 'FM999990.00'), '.', ',')),
        jsonb_build_object('url', '/mission/' || new.id));
    end if;
    return new;
  end if;

  if new.statut is distinct from old.statut then
    if new.statut = 'confirmee' and new.client_id is not null then
      perform public.notifier(array[new.client_id], 'Course confirmée',
        format('Fabrice sera là le %s · %s', public.quand_fr(new.date_heure), trajet),
        jsonb_build_object('url', '/course/' || new.id));
    elsif new.statut = 'refusee' and new.client_id is not null then
      perform public.notifier(array[new.client_id], 'Demande refusée',
        format('Fabrice ne peut pas assurer la course du %s%s. Rien ne vous sera facturé.',
               public.quand_fr(new.date_heure), coalesce(' : ' || lower(new.motif_refus), '')),
        jsonb_build_object('url', '/course/' || new.id));
    elsif new.statut = 'annulee' then
      if public.est_chauffeur() then
        if new.client_id is not null then
          perform public.notifier(array[new.client_id], 'Course annulée',
            format('Fabrice a annulé la course du %s · %s', public.quand_fr(new.date_heure), trajet),
            jsonb_build_object('url', '/course/' || new.id));
        end if;
      else
        perform public.notifier(public.chauffeurs(), 'Course annulée · ' || new.nom,
          format('%s · %s', public.quand_fr(new.date_heure), trajet),
          jsonb_build_object('url', '/mission/' || new.id));
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger courses_notifications
  after insert or update of statut on public.courses
  for each row execute function public.notif_courses();

-- ——— Messages : prévenir l'autre côté de la conversation ———
create or replace function public.notif_messages()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  select * into c from public.courses where id = new.course_id;
  if new.de_chauffeur then
    if c.client_id is not null then
      perform public.notifier(array[c.client_id], 'Fabrice', left(new.texte, 180),
        jsonb_build_object('url', '/conversation/' || new.course_id, 'conversation', new.course_id));
    end if;
  else
    perform public.notifier(public.chauffeurs(), c.nom, left(new.texte, 180),
      jsonb_build_object('url', '/conversation/' || new.course_id, 'conversation', new.course_id));
  end if;
  return new;
end;
$$;

create trigger messages_notifications
  after insert on public.messages
  for each row execute function public.notif_messages();

-- ——— Relances et rappels (toutes les 5 minutes) ———
create or replace function public.relances_notifications()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  -- Fabrice : demande toujours en attente après 30 minutes.
  for c in
    update public.courses set relance_le = now()
     where statut = 'envoyee' and relance_le is null and envoyee_le < now() - interval '30 minutes'
    returning *
  loop
    perform public.notifier(public.chauffeurs(), 'Demande en attente · ' || c.nom,
      format('Sans réponse depuis 30 min · %s · %s → %s', public.quand_fr(c.date_heure), c.depart_libelle, c.arrivee_libelle),
      jsonb_build_object('url', '/mission/' || c.id));
  end loop;
  -- Client : rappel la veille (entre 24 h et 2 h avant la course).
  for c in
    update public.courses set rappel_le = now()
     where statut = 'confirmee' and rappel_le is null and client_id is not null
       and date_heure between now() + interval '2 hours' and now() + interval '24 hours'
    returning *
  loop
    perform public.notifier(array[c.client_id], 'Rappel : votre course',
      format('Fabrice vient vous chercher le %s · %s → %s', public.quand_fr(c.date_heure), c.depart_libelle, c.arrivee_libelle),
      jsonb_build_object('url', '/course/' || c.id));
  end loop;
end;
$$;

select cron.schedule('volant3ranches-relances', '*/5 * * * *', 'select public.relances_notifications()');

-- ——— Droits ———
revoke execute on function public.enregistrer_appareil(text, text) from public, anon;
revoke execute on function public.oublier_appareil(text) from public, anon;
revoke execute on function public.notifier(uuid[], text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.chauffeurs() from public, anon, authenticated;
revoke execute on function public.relances_notifications() from public, anon, authenticated;
grant execute on function public.enregistrer_appareil(text, text) to authenticated;
grant execute on function public.oublier_appareil(text) to authenticated;
