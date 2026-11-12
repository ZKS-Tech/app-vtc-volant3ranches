-- Volant3ranches VTC — langue du client (français ou anglais).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run).
--
-- L'appli envoie la langue choisie (Profil › Langue, ou celle du téléphone). Chaque course garde la
-- langue du client au moment de la demande : ses notifications et ses emails sont rédigés dans
-- cette langue. Fabrice reçoit toujours tout en français, avec la mention « anglais » quand le
-- client est anglophone. Les bons de commande et factures restent en français (obligation légale).

alter table public.profils add column if not exists langue text not null default 'fr' check (langue in ('fr', 'en'));
alter table public.courses add column if not exists langue text not null default 'fr' check (langue in ('fr', 'en'));

-- Appelée par l'appli au démarrage et à chaque changement de langue.
create or replace function public.definir_langue(p_langue text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  moi uuid := auth.uid();
begin
  if moi is null then raise exception 'Connexion requise'; end if;
  if p_langue not in ('fr', 'en') then raise exception 'Langue inconnue'; end if;
  insert into public.profils (id, langue) values (moi, p_langue)
  on conflict (id) do update set langue = excluded.langue;
  -- Les courses à venir suivent : les prochaines notifications et emails seront dans cette langue.
  update public.courses set langue = p_langue
   where client_id = moi and langue <> p_langue and date_heure > now()
     and statut in ('envoyee', 'acompte_attendu', 'confirmee');
end;
$$;
revoke execute on function public.definir_langue(text) from public, anon;
grant execute on function public.definir_langue(text) to authenticated;

-- Une nouvelle course prend la langue du client (les courses saisies par Fabrice restent en français).
create or replace function public.langue_course()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.client_id is not null then
    new.langue := coalesce((select langue from public.profils where id = new.client_id), new.langue);
  end if;
  return new;
end;
$$;
drop trigger if exists courses_langue on public.courses;
create trigger courses_langue before insert on public.courses
  for each row execute function public.langue_course();

-- ——— Textes en anglais ———
-- « Thu 12 Nov at 09:05 », à l'heure de Paris.
create or replace function public.quand_en(t timestamptz)
returns text
language sql immutable
as $$
  select to_char(t at time zone 'Europe/Paris', 'Dy FMDD Mon "at" HH24:MI');
$$;

-- Lieux connus : « Aéroport Toulouse-Blagnac » → « Toulouse-Blagnac Airport », « Gare de Castres » → « Castres station ».
create or replace function public.lieu_en(l text)
returns text
language sql immutable
as $$
  select regexp_replace(regexp_replace(l, '^Aéroport (.+)$', '\1 Airport'), '^Gare (de |d''|d’)?(.+)$', '\2 station');
$$;

create or replace function public.euros_en(n numeric)
returns text
language sql immutable
as $$
  select '€' || to_char(n, 'FM999990.00');
$$;

-- ——— Notifications : celles du client dans sa langue ———
create or replace function public.notif_courses()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  trajet text := new.depart_libelle || ' → ' || new.arrivee_libelle;
  trajet_en text := public.lieu_en(new.depart_libelle) || ' → ' || public.lieu_en(new.arrivee_libelle);
  en boolean := new.langue = 'en';
  anglophone text := case when new.langue = 'en' then ' (anglais)' else '' end;
begin
  if tg_op = 'INSERT' then
    if new.source = 'appli' and new.statut = 'envoyee' then
      perform public.notifier(public.chauffeurs(), 'Nouvelle demande · ' || new.nom || anglophone,
        format('%s · %s · %s €', public.quand_fr(new.date_heure), trajet, replace(to_char(new.montant, 'FM999990.00'), '.', ',')),
        jsonb_build_object('url', '/mission/' || new.id));
    end if;
    return new;
  end if;

  if new.statut is distinct from old.statut then
    if new.statut = 'acompte_attendu' and new.client_id is not null then
      if en then
        perform public.notifier(array[new.client_id], 'Fabrice can drive you',
          format('Pay the %s deposit before %s to confirm your ride on %s.',
                 public.euros_en(new.acompte_montant), to_char(new.acompte_limite at time zone 'Europe/Paris', 'HH24:MI'), public.quand_en(new.date_heure)),
          jsonb_build_object('url', '/course/' || new.id));
      else
        perform public.notifier(array[new.client_id], 'Fabrice peut vous conduire',
          format('Réglez l''acompte de %s € avant %s pour confirmer la course du %s.',
                 replace(to_char(new.acompte_montant, 'FM999990.00'), '.', ','),
                 to_char(new.acompte_limite at time zone 'Europe/Paris', 'FMHH24"h"MI'), public.quand_fr(new.date_heure)),
          jsonb_build_object('url', '/course/' || new.id));
      end if;
    elsif new.statut = 'confirmee' and new.client_id is not null then
      if en then
        perform public.notifier(array[new.client_id], 'Ride confirmed',
          format('Fabrice will be there on %s · %s', public.quand_en(new.date_heure), trajet_en),
          jsonb_build_object('url', '/course/' || new.id));
      else
        perform public.notifier(array[new.client_id], 'Course confirmée',
          format('Fabrice sera là le %s · %s', public.quand_fr(new.date_heure), trajet),
          jsonb_build_object('url', '/course/' || new.id));
      end if;
    elsif new.statut = 'refusee' and new.client_id is not null then
      if en then
        perform public.notifier(array[new.client_id], 'Request declined',
          format('Fabrice cannot do your ride on %s%s. You will not be charged.',
                 public.quand_en(new.date_heure), coalesce(' (' || new.motif_refus || ')', '')),
          jsonb_build_object('url', '/course/' || new.id));
      else
        perform public.notifier(array[new.client_id], 'Demande refusée',
          format('Fabrice ne peut pas assurer la course du %s%s. Rien ne vous sera facturé.',
                 public.quand_fr(new.date_heure), coalesce(' : ' || lower(new.motif_refus), '')),
          jsonb_build_object('url', '/course/' || new.id));
      end if;
    elsif new.statut = 'expiree' then
      if new.client_id is not null then
        if en then
          perform public.notifier(array[new.client_id], 'Booking not confirmed',
            format('The deposit was not paid in time: the ride on %s is not booked. You can send a new request.', public.quand_en(new.date_heure)),
            jsonb_build_object('url', '/course/' || new.id));
        else
          perform public.notifier(array[new.client_id], 'Réservation non confirmée',
            format('L''acompte n''a pas été réglé à temps : la course du %s n''est pas réservée. Vous pouvez refaire une demande.', public.quand_fr(new.date_heure)),
            jsonb_build_object('url', '/course/' || new.id));
        end if;
      end if;
      perform public.notifier(public.chauffeurs(), 'Acompte non réglé · ' || new.nom,
        format('Le créneau du %s est libéré.', public.quand_fr(new.date_heure)),
        jsonb_build_object('url', '/mission/' || new.id));
    elsif new.statut = 'annulee' then
      if public.est_chauffeur() then
        if new.client_id is not null then
          if en then
            perform public.notifier(array[new.client_id], 'Ride cancelled',
              format('Fabrice has cancelled the ride on %s · %s', public.quand_en(new.date_heure), trajet_en),
              jsonb_build_object('url', '/course/' || new.id));
          else
            perform public.notifier(array[new.client_id], 'Course annulée',
              format('Fabrice a annulé la course du %s · %s', public.quand_fr(new.date_heure), trajet),
              jsonb_build_object('url', '/course/' || new.id));
          end if;
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
  -- Client : rappel la veille (entre 24 h et 2 h avant la course), dans sa langue.
  for c in
    update public.courses set rappel_le = now()
     where statut = 'confirmee' and rappel_le is null and client_id is not null
       and date_heure between now() + interval '2 hours' and now() + interval '24 hours'
    returning *
  loop
    if c.langue = 'en' then
      perform public.notifier(array[c.client_id], 'Reminder: your ride',
        format('Fabrice is picking you up on %s · %s → %s', public.quand_en(c.date_heure), public.lieu_en(c.depart_libelle), public.lieu_en(c.arrivee_libelle)),
        jsonb_build_object('url', '/course/' || c.id));
    else
      perform public.notifier(array[c.client_id], 'Rappel : votre course',
        format('Fabrice vient vous chercher le %s · %s → %s', public.quand_fr(c.date_heure), c.depart_libelle, c.arrivee_libelle),
        jsonb_build_object('url', '/course/' || c.id));
    end if;
  end loop;
  -- Acompte non réglé dans le délai : la demande expire (les notifications partent du déclencheur).
  update public.courses set statut = 'expiree', expiree_le = now()
   where statut = 'acompte_attendu' and acompte_limite < now();
  update public.paiements pa set statut = 'expire'
    from public.courses co where co.id = pa.course_id and co.statut = 'expiree' and pa.statut = 'en_attente';
end;
$$;
revoke execute on function public.relances_notifications() from public, anon, authenticated;

-- ——— Connexion de Fabrice depuis un téléphone où un invité a réservé ———
-- Les courses de l'invité ne doivent jamais être rattachées au compte du chauffeur.
create or replace function public.fusionner_compte(p_jeton uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  f public.fusions_comptes;
  moi uuid := auth.uid();
  n int;
begin
  if moi is null or public.est_anonyme() then raise exception 'Connectez-vous à votre compte'; end if;
  if public.est_chauffeur() then return 0; end if;
  delete from public.fusions_comptes where jeton = p_jeton and cree_le > now() - interval '15 minutes' returning * into f;
  if not found or f.ancien = moi then return 0; end if;
  update public.courses set client_id = moi where client_id = f.ancien;
  get diagnostics n = row_count;
  update public.messages set auteur_id = moi where auteur_id = f.ancien;
  update public.appareils set user_id = moi where user_id = f.ancien;
  update public.fiches_clients set profil_id = moi where profil_id = f.ancien;
  -- Le profil du compte garde ses coordonnées ; celles de l'invité servent s'il n'en a pas.
  insert into public.profils (id, nom, telephone, email, langue)
  select moi, a.nom, a.telephone, coalesce(nullif(auth.jwt() ->> 'email', ''), a.email), a.langue
    from public.profils a where a.id = f.ancien
  on conflict (id) do update
    set nom = coalesce(profils.nom, excluded.nom), telephone = coalesce(profils.telephone, excluded.telephone),
        email = coalesce(profils.email, excluded.email);
  return n;
end;
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.quand_en(timestamptz), public.lieu_en(text), public.euros_en(numeric), public.langue_course() to service_role;
  end if;
end $$;
