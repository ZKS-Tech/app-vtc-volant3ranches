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
