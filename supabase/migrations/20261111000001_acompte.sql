-- Volant3ranches VTC — acompte, partie 2 : paiement en ligne de 10 % pour confirmer une course.
-- À exécuter après 20261111000000_acompte_statuts.sql (SQL Editor › New query › coller › Run).
--
-- Déroulé (décisions de Fabrice, 05/11/2026) :
--  1. Le client envoie sa demande (rien n'est payé).
--  2. Fabrice accepte : la course passe à « acompte_attendu ». Le client a 1 h (au plus tard
--     l'heure de la course) pour régler l'acompte sur la page de paiement SumUp.
--  3. SumUp prévient le serveur, qui vérifie le paiement auprès de SumUp puis appelle
--     confirmer_paiement : la course passe à « confirmee ».
--  4. Sans paiement dans le délai, la course passe à « expiree » (tâche toutes les 5 minutes).
--  Annulation : on garde les CGV. Acompte remboursé si le client annule plus de 24 h avant,
--  conservé en dessous ; remboursement intégral si Fabrice annule.
--  Courses saisies par Fabrice (téléphone…) : confirmées directement ; il peut envoyer un lien
--  de paiement d'acompte au client.
--
-- Les paiements ne sont jamais écrits par l'application : seules les fonctions serveur
-- (supabase/functions, clé de service) appellent les fonctions de cette migration qui les modifient.

-- ——— Réglage : pourcentage d'acompte (0 = pas d'acompte) ———
alter table public.parametres add column acompte_pourcent int not null default 10 check (acompte_pourcent between 0 and 100);
alter table public.parametres add column acompte_delai_min int not null default 60 check (acompte_delai_min between 10 and 1440);

-- ——— Suivi de l'acompte sur la course ———
alter table public.courses add column acompte_montant numeric(8, 2);
alter table public.courses add column acompte_limite timestamptz;
alter table public.courses add column acompte_paye_le timestamptz;
alter table public.courses add column expiree_le timestamptz;

-- ——— Paiements (un par tentative : lien SumUp) ———
create table public.paiements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  montant numeric(8, 2) not null check (montant > 0),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'paye', 'echoue', 'expire', 'rembourse')),
  checkout_id text unique,
  transaction_id text,
  lien text,
  cree_le timestamptz not null default now(),
  paye_le timestamptz,
  remboursement_du numeric(8, 2) not null default 0,
  rembourse numeric(8, 2) not null default 0,
  rembourse_le timestamptz
);
create index paiements_course_idx on public.paiements (course_id);

alter table public.paiements enable row level security;
create policy "Voir les paiements de ses courses" on public.paiements for select to authenticated
  using (exists (select 1 from public.courses c where c.id = course_id and c.client_id = auth.uid()));
create policy "Fabrice voit les paiements" on public.paiements for select to authenticated using (public.est_chauffeur());
grant select on public.paiements to authenticated;
alter publication supabase_realtime add table public.paiements;

-- Montant de l'acompte pour un prix donné (arrondi au centime, 1 € au minimum).
create or replace function public.montant_acompte(p_montant numeric)
returns numeric
language sql stable security definer set search_path = public
as $$
  select case when p.acompte_pourcent = 0 then 0
              else greatest(1, round(p_montant * p.acompte_pourcent / 100.0, 2)) end
    from public.parametres p where p.id = 1;
$$;

-- ——— Fabrice accepte : acompte demandé (si activé) au lieu de la confirmation directe ———
create or replace function public.repondre_demande(p_course uuid, p_accepter boolean, p_motif text default null)
returns public.courses
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
  acompte numeric;
  delai int;
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  select * into c from public.courses where id = p_course and statut = 'envoyee' for update;
  if not found then raise exception 'Demande introuvable ou déjà traitée'; end if;

  if not p_accepter then
    update public.courses set statut = 'refusee', refusee_le = now(), motif_refus = p_motif
     where id = p_course returning * into c;
    return c;
  end if;

  acompte := case when c.client_id is not null then public.montant_acompte(c.montant) else 0 end;
  if acompte > 0 then
    select acompte_delai_min into delai from public.parametres where id = 1;
    update public.courses
       set statut = 'acompte_attendu', acompte_montant = acompte,
           acompte_limite = least(now() + make_interval(mins => delai), date_heure)
     where id = p_course returning * into c;
  else
    update public.courses set statut = 'confirmee', confirmee_le = now() where id = p_course returning * into c;
  end if;
  return c;
end;
$$;

-- ——— Ce que la fonction serveur doit facturer (appelée avec la session de l'utilisateur) ———
-- Le client pour sa course en attente d'acompte ; Fabrice pour n'importe quelle course à venir
-- (lien envoyé à un client qui a réservé par téléphone).
create or replace function public.acompte_a_payer(p_course uuid)
returns table (course_id uuid, montant numeric, limite timestamptz, description text, deja_paye boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  c public.courses;
  chauffeur boolean := public.est_chauffeur();
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select * into c from public.courses where id = p_course;
  if not found or (not chauffeur and c.client_id is distinct from auth.uid()) then raise exception 'Course introuvable'; end if;
  if c.acompte_paye_le is not null then
    return query select c.id, c.acompte_montant, c.acompte_limite, ''::text, true;
    return;
  end if;
  if chauffeur then
    if c.statut not in ('acompte_attendu', 'confirmee') or c.date_heure < now() then raise exception 'Course passée ou non confirmée'; end if;
  else
    if c.statut <> 'acompte_attendu' then raise exception 'Aucun acompte à régler pour cette course'; end if;
    if c.acompte_limite < now() then raise exception 'Le délai pour régler l''acompte est dépassé'; end if;
  end if;
  return query select c.id,
    coalesce(c.acompte_montant, public.montant_acompte(c.montant)),
    c.acompte_limite,
    format('Acompte course %s · %s → %s', to_char(c.date_heure at time zone 'Europe/Paris', 'DD/MM HH24"h"MI'), c.depart_libelle, c.arrivee_libelle),
    false;
end;
$$;

-- ——— Fonctions réservées au serveur (clé de service) ———
create or replace function public.enregistrer_checkout(p_course uuid, p_montant numeric, p_checkout text, p_lien text)
returns public.paiements
language plpgsql security definer set search_path = public
as $$
declare
  p public.paiements;
begin
  -- Le montant de l'acompte est figé à la première demande de paiement.
  update public.courses set acompte_montant = coalesce(acompte_montant, p_montant) where id = p_course;
  update public.paiements set statut = 'expire' where course_id = p_course and statut = 'en_attente';
  insert into public.paiements (course_id, montant, checkout_id, lien) values (p_course, p_montant, p_checkout, p_lien)
  returning * into p;
  return p;
end;
$$;

-- Paiement vérifié auprès de SumUp : la course est confirmée. Sans effet si déjà traité.
create or replace function public.confirmer_paiement(p_checkout text, p_transaction text, p_montant numeric)
returns public.paiements
language plpgsql security definer set search_path = public
as $$
declare
  p public.paiements;
  c public.courses;
begin
  select * into p from public.paiements where checkout_id = p_checkout for update;
  if not found then raise exception 'Paiement inconnu'; end if;
  if p.statut = 'paye' or p.statut = 'rembourse' then return p; end if;
  if p_montant < p.montant then raise exception 'Montant payé insuffisant'; end if;

  select * into c from public.courses where id = p.course_id for update;
  update public.paiements set statut = 'paye', paye_le = now(), transaction_id = p_transaction,
         -- payé trop tard (course expirée, refusée ou annulée entre-temps) : à rembourser
         remboursement_du = case when c.statut in ('acompte_attendu', 'confirmee') then 0 else p.montant end
   where id = p.id returning * into p;

  update public.courses set acompte_paye_le = now() where id = c.id;
  if c.statut = 'acompte_attendu' then
    update public.courses set statut = 'confirmee', confirmee_le = now() where id = c.id;
  end if;
  perform public.notifier(public.chauffeurs(), 'Acompte reçu · ' || c.nom,
    format('%s € · course du %s', replace(to_char(p.montant, 'FM999990.00'), '.', ','), public.quand_fr(c.date_heure)),
    jsonb_build_object('url', '/mission/' || c.id));
  return p;
end;
$$;

create or replace function public.paiement_echoue(p_checkout text)
returns void
language sql security definer set search_path = public
as $$
  update public.paiements set statut = 'echoue' where checkout_id = p_checkout and statut = 'en_attente';
$$;

-- Remboursements à effectuer pour une course (lu par la fonction serveur de remboursement).
create or replace function public.remboursements_dus(p_course uuid)
returns setof public.paiements
language sql stable security definer set search_path = public
as $$
  select * from public.paiements
   where course_id = p_course and statut = 'paye' and remboursement_du > rembourse and transaction_id is not null;
$$;

create or replace function public.remboursement_effectue(p_paiement uuid, p_montant numeric)
returns public.paiements
language plpgsql security definer set search_path = public
as $$
declare
  p public.paiements;
  c public.courses;
begin
  update public.paiements
     set rembourse = rembourse + p_montant, rembourse_le = now(),
         statut = case when rembourse + p_montant >= montant then 'rembourse' else statut end
   where id = p_paiement returning * into p;
  select * into c from public.courses where id = p.course_id;
  if c.client_id is not null then
    perform public.notifier(array[c.client_id], 'Acompte remboursé',
      format('%s € remboursés sur votre carte (course du %s). Le délai dépend de votre banque.',
             replace(to_char(p_montant, 'FM999990.00'), '.', ','), public.quand_fr(c.date_heure)),
      jsonb_build_object('url', '/course/' || c.id));
  end if;
  return p;
end;
$$;

-- Décide du remboursement de l'acompte après une annulation ou un refus.
create or replace function public.marquer_remboursement(p_course uuid, p_par_chauffeur boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  select * into c from public.courses where id = p_course;
  update public.paiements
     set remboursement_du = case
       when p_par_chauffeur then montant                                       -- Fabrice annule : tout est rendu
       when c.date_heure - coalesce(c.annulee_le, now()) > interval '24 hours' then montant  -- CGV : plus de 24 h avant
       else 0 end                                                              -- moins de 24 h : acompte conservé
   where course_id = p_course and statut = 'paye';
  update public.paiements set statut = 'expire' where course_id = p_course and statut = 'en_attente';
end;
$$;

-- ——— Annulations : l'acompte suit les CGV ———
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
   where id = p_course and client_id = auth.uid() and statut in ('envoyee', 'acompte_attendu', 'confirmee')
   for update;
  if not found then raise exception 'Course introuvable ou déjà terminée'; end if;

  heures := extract(epoch from (c.date_heure - now())) / 3600;
  -- Une demande pas encore confirmée s'annule toujours sans frais.
  taux := case
    when c.statut <> 'confirmee' then 0
    when heures > 24 then 0
    when heures > 12 then 0.5
    else 1
  end;

  update public.courses
     set statut = 'annulee', annulee_le = now(), frais_annulation = round(c.montant * taux, 2)
   where id = p_course
  returning * into c;
  perform public.marquer_remboursement(p_course, false);
  return c;
end;
$$;

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
   where id = p_course and statut in ('envoyee', 'acompte_attendu', 'confirmee')
  returning * into c;
  if not found then raise exception 'Course introuvable ou déjà terminée'; end if;
  perform public.marquer_remboursement(p_course, true);
  return c;
end;
$$;

-- ——— Notifications : acompte demandé et délai dépassé ———
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
    if new.statut = 'acompte_attendu' and new.client_id is not null then
      perform public.notifier(array[new.client_id], 'Fabrice peut vous conduire',
        format('Réglez l''acompte de %s € avant %s pour confirmer la course du %s.',
               replace(to_char(new.acompte_montant, 'FM999990.00'), '.', ','),
               to_char(new.acompte_limite at time zone 'Europe/Paris', 'FMHH24"h"MI'), public.quand_fr(new.date_heure)),
        jsonb_build_object('url', '/course/' || new.id));
    elsif new.statut = 'confirmee' and new.client_id is not null then
      perform public.notifier(array[new.client_id], 'Course confirmée',
        format('Fabrice sera là le %s · %s', public.quand_fr(new.date_heure), trajet),
        jsonb_build_object('url', '/course/' || new.id));
    elsif new.statut = 'refusee' and new.client_id is not null then
      perform public.notifier(array[new.client_id], 'Demande refusée',
        format('Fabrice ne peut pas assurer la course du %s%s. Rien ne vous sera facturé.',
               public.quand_fr(new.date_heure), coalesce(' : ' || lower(new.motif_refus), '')),
        jsonb_build_object('url', '/course/' || new.id));
    elsif new.statut = 'expiree' then
      if new.client_id is not null then
        perform public.notifier(array[new.client_id], 'Réservation non confirmée',
          format('L''acompte n''a pas été réglé à temps : la course du %s n''est pas réservée. Vous pouvez refaire une demande.', public.quand_fr(new.date_heure)),
          jsonb_build_object('url', '/course/' || new.id));
      end if;
      perform public.notifier(public.chauffeurs(), 'Acompte non réglé · ' || new.nom,
        format('Le créneau du %s est libéré.', public.quand_fr(new.date_heure)),
        jsonb_build_object('url', '/mission/' || new.id));
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

-- ——— Tâche toutes les 5 minutes : relances, rappels, et délais d'acompte dépassés ———
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
  -- Acompte non réglé dans le délai : la demande expire (les notifications partent du déclencheur).
  update public.courses set statut = 'expiree', expiree_le = now()
   where statut = 'acompte_attendu' and acompte_limite < now();
  update public.paiements pa set statut = 'expire'
    from public.courses co where co.id = pa.course_id and co.statut = 'expiree' and pa.statut = 'en_attente';
end;
$$;

-- ——— Droits ———
revoke execute on function public.montant_acompte(numeric) from public, anon;
revoke execute on function public.acompte_a_payer(uuid) from public, anon;
revoke execute on function public.enregistrer_checkout(uuid, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.confirmer_paiement(text, text, numeric) from public, anon, authenticated;
revoke execute on function public.paiement_echoue(text) from public, anon, authenticated;
revoke execute on function public.remboursements_dus(uuid) from public, anon, authenticated;
revoke execute on function public.remboursement_effectue(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.marquer_remboursement(uuid, boolean) from public, anon, authenticated;
grant execute on function public.montant_acompte(numeric) to authenticated;
grant execute on function public.acompte_a_payer(uuid) to authenticated;
