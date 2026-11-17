-- Volant3ranches VTC — limites contre les abus (plan de sécurité, priorité 1).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run).

-- ═══ Point 4 — Budget d'emails ═══
-- Brevo (offre gratuite) envoie 300 emails par jour, codes de connexion compris. Sans budget, un
-- script qui enchaîne des demandes avec des comptes invités vide ce quota en 30 minutes et envoie
-- des centaines d'emails à des inconnus.
--  • Emails déclenchés par un client (« demande reçue », « annulation ») : 3 par jour au plus vers
--    une même adresse.
--  • Plafond quotidien : au-delà de 200 emails dans la journée, seuls partent encore les emails
--    importants (acompte, confirmation, refus, expiration, remboursement, facture, avoir), jusqu'à
--    280 ; les 20 derniers restent pour les codes de connexion (envoyés par Supabase via Brevo).
--  • Fabrice est prévenu par notification la première fois que le plafond est atteint dans la journée.
--  • Un email retenu est noté « ignoré » dans le journal, avec la raison : rien n'est perdu de vue.

alter table public.parametres add column if not exists emails_plafond_jour int not null default 200
  check (emails_plafond_jour between 10 and 280);

alter table public.emails drop constraint if exists emails_statut_check;
alter table public.emails add constraint emails_statut_check
  check (statut in ('a_envoyer', 'envoi', 'envoye', 'erreur', 'ignore'));

create or replace function public.mettre_email(p_type text, p_course uuid, p_document uuid, p_destinataire text, p_nom text, p_donnees jsonb default '{}')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  dest text := lower(trim(p_destinataire));
  plafond int := coalesce((select emails_plafond_jour from public.parametres where id = 1), 200);
  debut_jour timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  du_jour int;
  par_client boolean := p_type in ('demande_recue', 'annulation', 'chauffeur_demande', 'chauffeur_annulation');
  raison text;
begin
  if not coalesce((select emails_actifs from public.parametres where id = 1), false) then return; end if;
  if dest is null or dest !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;

  select count(*) into du_jour from public.emails where cree_le >= debut_jour and statut <> 'ignore';
  if par_client and p_type in ('demande_recue', 'annulation')
     and (select count(*) from public.emails where destinataire = dest and cree_le > now() - interval '24 hours'
            and type in ('demande_recue', 'annulation') and statut <> 'ignore') >= 3 then
    raison := 'Limite : 3 emails par jour vers cette adresse';
  elsif par_client and du_jour >= plafond then
    raison := format('Plafond quotidien atteint (%s emails)', plafond);
  elsif du_jour >= 280 then
    raison := 'Plafond Brevo presque atteint : places gardées pour les codes de connexion';
  end if;

  if raison is not null then
    -- Fabrice prévenu une seule fois par jour quand le plafond commence à retenir des emails.
    if raison like 'Plafond%' and not exists (
         select 1 from public.emails where statut = 'ignore' and erreur like 'Plafond%' and cree_le >= debut_jour) then
      perform public.notifier(public.chauffeurs(), 'Emails : plafond du jour atteint',
        format('%s emails envoyés aujourd''hui. Les emails non urgents sont retenus jusqu''à demain (voir Gestion › Emails).', du_jour),
        jsonb_build_object('url', '/emails'));
    end if;
    insert into public.emails (type, course_id, document_id, destinataire, nom, donnees, statut, erreur)
    values (p_type, p_course, p_document, dest, p_nom, coalesce(p_donnees, '{}'), 'ignore', raison)
    on conflict do nothing;
    return;
  end if;

  insert into public.emails (type, course_id, document_id, destinataire, nom, donnees)
  values (p_type, p_course, p_document, dest, p_nom, coalesce(p_donnees, '{}'))
  on conflict do nothing;
  perform public.reveiller_emails();
end;
$$;
revoke execute on function public.mettre_email(text, uuid, uuid, text, text, jsonb) from public, anon, authenticated;

-- ═══ Point 5 — Plafond global de demandes depuis l'appli ═══
-- Les limites par compte (5 en attente, 10 par jour) se contournent en créant des comptes invités.
-- Toutes appli confondues : au plus 20 demandes par heure (réglable). Au-delà, le client est invité à
-- appeler Fabrice ; les courses saisies par Fabrice ne sont jamais bloquées.
alter table public.parametres add column if not exists demandes_plafond_heure int not null default 20
  check (demandes_plafond_heure between 5 and 200);

create or replace function public.limiter_demandes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.source = 'appli' and new.client_id is not null then
    if (select count(*) from public.courses where source = 'appli' and envoyee_le > now() - interval '1 hour')
       >= coalesce((select demandes_plafond_heure from public.parametres where id = 1), 20) then
      raise exception 'Beaucoup de demandes en ce moment : appelez Fabrice au 06 16 53 14 91.';
    end if;
    if (select count(*) from public.courses where client_id = new.client_id
         and statut in ('envoyee', 'acompte_attendu') and date_heure > now()) >= 5 then
      raise exception 'Vous avez déjà 5 demandes en attente : attendez la réponse de Fabrice ou appelez-le.';
    end if;
    if (select count(*) from public.courses where client_id = new.client_id
         and envoyee_le > now() - interval '24 hours') >= 10 then
      raise exception 'Trop de demandes aujourd''hui : appelez Fabrice au 06 16 53 14 91.';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.limiter_demandes() from public, anon, authenticated;

-- ═══ Point 6 — Validation des saisies par la base ═══
-- L'appli contrôle déjà les champs, mais la base ne doit pas lui faire confiance : un script peut
-- appeler l'API directement. Formats et longueurs maximales vérifiés à chaque nouvelle course et à
-- chaque enregistrement de profil (appli et saisie de Fabrice).
--  • Email : un vrai format d'adresse, sans « ? », « & », « , »… (empêche d'ajouter un destinataire
--    caché quand Fabrice écrit au client depuis son téléphone).
--  • Téléphone : chiffres, espaces, + . - ( ) seulement.
--  • Longueurs : nom 100, téléphone 30, email 254, commentaire 500, vol/train 20, adresses 200.
--  • Type de lieu : aéroport, gare, ville ou adresse. Date : au plus un an à l'avance.
create or replace function public.email_valide(e text)
returns boolean
language sql immutable
as $$
  select e is not null and length(e) <= 254
     and e ~* '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$';
$$;

create or replace function public.telephone_valide(t text)
returns boolean
language sql immutable
as $$
  select t is not null and length(t) <= 30 and t ~ '^[0-9 +.()-]+$'
     and length(regexp_replace(t, '\D', '', 'g')) between 6 and 15;
$$;

create or replace function public.valider_course()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if length(trim(coalesce(new.nom, ''))) not between 2 and 100 then raise exception 'Nom invalide (2 à 100 caractères)'; end if;
  if nullif(trim(new.telephone), '') is not null and not public.telephone_valide(trim(new.telephone)) then
    raise exception 'Numéro de téléphone invalide';
  end if;
  if nullif(trim(new.email), '') is not null and not public.email_valide(trim(new.email)) then
    raise exception 'Adresse email invalide';
  end if;
  if length(coalesce(new.commentaire, '')) > 500 then raise exception 'Commentaire trop long (500 caractères au plus)'; end if;
  if new.numero_vol_train is not null and (length(new.numero_vol_train) > 20 or new.numero_vol_train !~ '^[A-Za-z0-9 -]+$') then
    raise exception 'Numéro de vol ou de train invalide';
  end if;
  if greatest(length(new.depart_libelle), length(new.arrivee_libelle), length(coalesce(new.depart_detail, '')),
              length(coalesce(new.arrivee_detail, '')), length(coalesce(new.depart_ref, '')), length(coalesce(new.arrivee_ref, ''))) > 200 then
    raise exception 'Adresse trop longue';
  end if;
  if coalesce(new.depart_type, 'adresse') not in ('aeroport', 'gare', 'ville', 'adresse')
     or coalesce(new.arrivee_type, 'adresse') not in ('aeroport', 'gare', 'ville', 'adresse') then
    raise exception 'Type de lieu inconnu';
  end if;
  if new.date_heure > now() + interval '1 year' then raise exception 'Date trop lointaine (un an au plus)'; end if;
  new.nom := trim(new.nom);
  new.telephone := trim(new.telephone);
  new.email := nullif(lower(trim(new.email)), '');
  return new;
end;
$$;
drop trigger if exists courses_valider on public.courses;
create trigger courses_valider before insert on public.courses
  for each row execute function public.valider_course();

create or replace function public.valider_profil()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.nom is not null and length(trim(new.nom)) > 100 then raise exception 'Nom trop long (100 caractères au plus)'; end if;
  if nullif(trim(new.telephone), '') is not null and not public.telephone_valide(trim(new.telephone)) then
    raise exception 'Numéro de téléphone invalide';
  end if;
  if nullif(trim(new.email), '') is not null and not public.email_valide(trim(new.email)) then
    raise exception 'Adresse email invalide';
  end if;
  return new;
end;
$$;
drop trigger if exists profils_valider on public.profils;
create trigger profils_valider before insert or update of nom, telephone, email on public.profils
  for each row execute function public.valider_profil();

-- ═══ Point 7 — Profil modifiable seulement par la fonction prévue ═══
-- L'appli enregistre le profil par enregistrer_profil (l'email vient alors du compte, vérifié par
-- Supabase). Plus aucune modification directe : on ne peut plus y écrire l'email de quelqu'un d'autre.
revoke update on public.profils from anon, authenticated;

revoke execute on function public.valider_course(), public.valider_profil(),
  public.email_valide(text), public.telephone_valide(text) from public, anon, authenticated;

-- ═══ Point 9 — Compteur d'appels par compte (fonction « stats ») ═══
-- Les fonctions serveur ne gardent rien en mémoire d'un appel à l'autre : le compteur vit ici, une
-- ligne par compte, par usage et par heure. Fermée à tous en lecture et écriture directes.
create table if not exists public.compteurs_appels (
  user_id uuid not null references auth.users (id) on delete cascade,
  cle text not null,
  heure timestamptz not null,
  n int not null default 0,
  primary key (user_id, cle, heure)
);
alter table public.compteurs_appels enable row level security;

-- Compte un appel et dit s'il reste dans la limite (p_max appels par heure).
create or replace function public.autoriser_appel(p_cle text, p_max int)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  moi uuid := auth.uid();
  n int;
begin
  if moi is null or p_cle not in ('stats') or p_max not between 1 and 1000 then return false; end if;
  insert into public.compteurs_appels (user_id, cle, heure, n) values (moi, p_cle, date_trunc('hour', now()), 1)
  on conflict (user_id, cle, heure) do update set n = compteurs_appels.n + 1
  returning compteurs_appels.n into n;
  delete from public.compteurs_appels where user_id = moi and heure < now() - interval '1 day';
  return n <= p_max;
end;
$$;
revoke execute on function public.autoriser_appel(text, int) from public, anon;
grant execute on function public.autoriser_appel(text, int) to authenticated;
