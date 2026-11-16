-- Volant3ranches VTC — emails (Brevo).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), après les migrations
-- précédentes.
--
-- Chaque événement met un email dans une file d'attente (table emails) ; la fonction serveur
-- « emails » les envoie par Brevo, avec le bon de commande ou la facture en PDF. Elle est réveillée
-- aussitôt (pg_net), et une tâche planifiée la relance toutes les 5 minutes en cas d'échec.
--
--  Client : demande reçue · acompte à régler · course confirmée (+ bon de commande) · demande
--           refusée · acompte non réglé · course annulée · acompte remboursé · facture (+ PDF).
--  Fabrice (copie, si activée) : nouvelle demande · annulation par un client.
--
-- Les emails sont désactivés tant que Brevo n'est pas configuré : Gestion › Emails dans l'appli.

alter table public.parametres add column emails_actifs boolean not null default false;
alter table public.parametres add column emails_copie_chauffeur boolean not null default true;
alter table public.parametres add column email_chauffeur text;
alter table public.parametres add column url_projet text not null default 'https://suenqmidxldsjhzoqmef.supabase.co';

create table public.emails (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('demande_recue', 'acompte', 'confirmation', 'refus', 'expiree', 'annulation',
                                     'remboursement', 'facture', 'chauffeur_demande', 'chauffeur_annulation')),
  course_id uuid references public.courses (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  destinataire text not null check (position('@' in destinataire) > 1),
  nom text,
  donnees jsonb not null default '{}',
  statut text not null default 'a_envoyer' check (statut in ('a_envoyer', 'envoi', 'envoye', 'erreur')),
  tentatives int not null default 0,
  erreur text,
  message_id text,
  cree_le timestamptz not null default now(),
  envoye_le timestamptz
);
create index emails_file_idx on public.emails (statut, cree_le);
create index emails_course_idx on public.emails (course_id);
-- Jamais deux fois le même email pour le même événement.
create unique index emails_unique on public.emails (type, course_id, coalesce(document_id, '00000000-0000-0000-0000-000000000000'::uuid), destinataire);

alter table public.emails enable row level security;
create policy "Fabrice voit les emails" on public.emails for select to authenticated using (public.est_chauffeur());
grant select on public.emails to authenticated;
alter publication supabase_realtime add table public.emails;

-- Réveille la fonction serveur (sans attendre sa réponse).
create or replace function public.reveiller_emails()
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  url text := (select url_projet from public.parametres where id = 1);
begin
  if url is null then return; end if;
  perform net.http_post(url := url || '/functions/v1/emails', body := '{}'::jsonb,
                        headers := '{"Content-Type": "application/json"}'::jsonb);
end;
$$;

-- Met un email en file si les emails sont activés et l'adresse valable.
create or replace function public.mettre_email(p_type text, p_course uuid, p_document uuid, p_destinataire text, p_nom text, p_donnees jsonb default '{}')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not coalesce((select emails_actifs from public.parametres where id = 1), false) then return; end if;
  if p_destinataire is null or p_destinataire !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  insert into public.emails (type, course_id, document_id, destinataire, nom, donnees)
  values (p_type, p_course, p_document, lower(trim(p_destinataire)), p_nom, coalesce(p_donnees, '{}'))
  on conflict do nothing;
  perform public.reveiller_emails();
end;
$$;

-- Adresse du client d'une course : celle de la réservation, sinon celle de sa fiche.
create or replace function public.email_client(c public.courses)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(nullif(trim(c.email), ''), (select nullif(trim(f.email), '') from public.fiches_clients f where f.id = c.fiche_id));
$$;

create or replace function public.email_chauffeur()
returns text
language sql stable security definer set search_path = public
as $$
  select case when p.emails_copie_chauffeur then coalesce(nullif(trim(p.email_chauffeur), ''),
           (select pr.email from public.profils pr where pr.role = 'chauffeur' order by pr.cree_le limit 1)) end
    from public.parametres p where p.id = 1;
$$;

-- ——— Événements des courses ———
create or replace function public.emails_courses()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  dest text := public.email_client(new);
begin
  if tg_op = 'INSERT' then
    if new.source = 'appli' and new.statut = 'envoyee' then
      perform public.mettre_email('demande_recue', new.id, null, dest, new.nom);
      perform public.mettre_email('chauffeur_demande', new.id, null, public.email_chauffeur(), 'Fabrice');
    end if;
    return new;
  end if;
  if new.statut is not distinct from old.statut then return new; end if;
  if new.statut = 'acompte_attendu' then
    perform public.mettre_email('acompte', new.id, null, dest, new.nom);
  elsif new.statut = 'refusee' then
    perform public.mettre_email('refus', new.id, null, dest, new.nom);
  elsif new.statut = 'expiree' then
    perform public.mettre_email('expiree', new.id, null, dest, new.nom);
  elsif new.statut = 'annulee' then
    perform public.mettre_email('annulation', new.id, null, dest, new.nom,
      jsonb_build_object('par_chauffeur', public.est_chauffeur()));
    if not public.est_chauffeur() then
      perform public.mettre_email('chauffeur_annulation', new.id, null, public.email_chauffeur(), 'Fabrice');
    end if;
  end if;
  return new;
end;
$$;
create trigger courses_emails
  after insert or update of statut on public.courses
  for each row execute function public.emails_courses();

-- ——— Bon de commande (= confirmation) et facture : avec le PDF ———
create or replace function public.emails_documents()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  select * into c from public.courses where id = new.course_id;
  perform public.mettre_email(case new.type when 'facture' then 'facture' else 'confirmation' end,
    c.id, new.id, public.email_client(c), c.nom);
  return new;
end;
$$;
create trigger documents_emails
  after insert on public.documents
  for each row execute function public.emails_documents();

-- ——— Acompte remboursé ———
create or replace function public.emails_paiements()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  if new.rembourse > old.rembourse then
    select * into c from public.courses where id = new.course_id;
    perform public.mettre_email('remboursement', c.id, null, public.email_client(c), c.nom,
      jsonb_build_object('montant', new.rembourse - old.rembourse));
  end if;
  return new;
end;
$$;
create trigger paiements_emails
  after update of rembourse on public.paiements
  for each row execute function public.emails_paiements();

-- ——— Utilisées par la fonction serveur (clé secrète) ———
-- Prend des emails à envoyer, sans risque qu'un autre envoi parallèle prenne les mêmes.
create or replace function public.prendre_emails(p_nombre int default 20)
returns setof public.emails
language sql security definer set search_path = public
as $$
  update public.emails set statut = 'envoi', tentatives = tentatives + 1
   where id in (select id from public.emails
                 where (statut = 'a_envoyer' or (statut = 'envoi' and cree_le < now() - interval '10 minutes'))
                   and tentatives < 5
                 order by cree_le limit p_nombre for update skip locked)
  returning *;
$$;

create or replace function public.email_resultat(p_email uuid, p_ok boolean, p_message_id text, p_erreur text)
returns void
language sql security definer set search_path = public
as $$
  update public.emails
     set statut = case when p_ok then 'envoye' when tentatives >= 5 then 'erreur' else 'a_envoyer' end,
         envoye_le = case when p_ok then now() end, message_id = p_message_id, erreur = left(p_erreur, 500)
   where id = p_email;
$$;

-- Fabrice : renvoyer un email (ou en envoyer un en échec).
create or replace function public.renvoyer_email(p_email uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  update public.emails set statut = 'a_envoyer', tentatives = 0, erreur = null where id = p_email;
  perform public.reveiller_emails();
end;
$$;

-- ——— Relance toutes les 5 minutes (emails restés en file) ———
create or replace function public.relancer_emails()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.emails where statut = 'a_envoyer' and tentatives < 5) then
    perform public.reveiller_emails();
  end if;
end;
$$;
select cron.schedule('volant3ranches-emails', '*/5 * * * *', 'select public.relancer_emails()');

revoke execute on function public.reveiller_emails() from public, anon, authenticated;
revoke execute on function public.mettre_email(text, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.email_client(public.courses) from public, anon, authenticated;
revoke execute on function public.email_chauffeur() from public, anon, authenticated;
revoke execute on function public.prendre_emails(int) from public, anon, authenticated;
revoke execute on function public.email_resultat(uuid, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.relancer_emails() from public, anon, authenticated;
revoke execute on function public.renvoyer_email(uuid) from public, anon;
grant execute on function public.renvoyer_email(uuid) to authenticated;
