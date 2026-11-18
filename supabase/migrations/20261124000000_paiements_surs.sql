-- Volant3ranches VTC — circuit de paiement sûr (plan de sécurité, priorité 1 bis).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), AVANT d'activer SumUp.
-- Puis déployer la nouvelle fonction « paiements-rattrapage » et redéployer « sumup-webhook » et
-- « acompte-rembourser » (voir supabase/README.md).

-- ═══ Point 11 — Double paiement remboursé automatiquement ═══
-- Une course peut avoir deux liens de paiement ouverts (lien de l'appli et lien envoyé par Fabrice,
-- deux appuis rapides…). Si le client paie les deux, le second est marqué « à rembourser » : le
-- webhook (ou le rattrapage) le rembourse aussitôt, et Fabrice en est prévenu.
create or replace function public.confirmer_paiement(p_checkout text, p_transaction text, p_montant numeric)
returns public.paiements
language plpgsql security definer set search_path = public
as $$
declare
  p public.paiements;
  c public.courses;
  doublon boolean;
begin
  select * into p from public.paiements where checkout_id = p_checkout for update;
  if not found then raise exception 'Paiement inconnu'; end if;
  if p.statut = 'paye' or p.statut = 'rembourse' then return p; end if;
  if p_montant < p.montant then raise exception 'Montant payé insuffisant'; end if;

  select * into c from public.courses where id = p.course_id for update;
  doublon := c.acompte_paye_le is not null;
  update public.paiements set statut = 'paye', paye_le = now(), transaction_id = p_transaction,
         -- à rembourser : acompte déjà réglé par un autre paiement (doublon), ou payé trop tard
         -- (course expirée, refusée ou annulée entre-temps)
         remboursement_du = case when doublon or c.statut not in ('acompte_attendu', 'confirmee') then p.montant else 0 end
   where id = p.id returning * into p;

  if doublon then
    perform public.notifier(public.chauffeurs(), 'Acompte payé deux fois · ' || c.nom,
      format('Second paiement de %s € remboursé automatiquement · course du %s',
             replace(to_char(p.montant, 'FM999990.00'), '.', ','), public.quand_fr(c.date_heure)),
      jsonb_build_object('url', '/mission/' || c.id));
    return p;
  end if;

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

-- ═══ Point 14 — Remboursements sans doublon ═══
-- Avant d'appeler SumUp, le serveur « réserve » le remboursement (verrou + référence unique). Un
-- second appel simultané (webhook en double, deux appuis, rattrapage) ne trouve rien à rembourser.
-- Le remboursement n'est compté qu'avec la bonne référence, une seule fois ; en cas d'échec chez
-- SumUp la réservation est libérée, et une réservation oubliée expire au bout de 10 minutes.
alter table public.paiements add column if not exists remboursement_reserve uuid;
alter table public.paiements add column if not exists remboursement_reserve_le timestamptz;

create or replace function public.reserver_remboursement(p_paiement uuid)
returns table (reservation uuid, montant numeric, transaction_id text)
language plpgsql security definer set search_path = public
as $$
declare
  p public.paiements;
  ref uuid := gen_random_uuid();
begin
  select * into p from public.paiements where id = p_paiement for update;
  if not found or p.statut <> 'paye' or p.transaction_id is null or p.remboursement_du <= p.rembourse then return; end if;
  if p.remboursement_reserve is not null and p.remboursement_reserve_le > now() - interval '10 minutes' then return; end if;
  update public.paiements set remboursement_reserve = ref, remboursement_reserve_le = now() where id = p.id;
  return query select ref, least(p.remboursement_du, p.montant) - p.rembourse, p.transaction_id;
end;
$$;

create or replace function public.liberer_remboursement(p_paiement uuid, p_reservation uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.paiements set remboursement_reserve = null, remboursement_reserve_le = null
   where id = p_paiement and remboursement_reserve = p_reservation;
$$;

drop function if exists public.remboursement_effectue(uuid, numeric);
create or replace function public.remboursement_effectue(p_paiement uuid, p_montant numeric, p_reservation uuid)
returns public.paiements
language plpgsql security definer set search_path = public
as $$
declare
  p public.paiements;
  c public.courses;
begin
  update public.paiements
     set rembourse = least(montant, rembourse + p_montant), rembourse_le = now(),
         statut = case when rembourse + p_montant >= montant then 'rembourse' else statut end,
         remboursement_reserve = null, remboursement_reserve_le = null
   where id = p_paiement and remboursement_reserve = p_reservation
  returning * into p;
  if not found then return null; end if; -- déjà compté (ou réservation inconnue) : rien de plus
  select * into c from public.courses where id = p.course_id;
  if c.client_id is not null then
    perform public.notifier(array[c.client_id],
      case when c.langue = 'en' then 'Deposit refunded' else 'Acompte remboursé' end,
      case when c.langue = 'en'
        then format('%s refunded to your card (ride on %s). Timing depends on your bank.', public.euros_en(p_montant), public.quand_en(c.date_heure))
        else format('%s € remboursés sur votre carte (course du %s). Le délai dépend de votre banque.',
                    replace(to_char(p_montant, 'FM999990.00'), '.', ','), public.quand_fr(c.date_heure)) end,
      jsonb_build_object('url', '/course/' || c.id));
  end if;
  return p;
end;
$$;

-- ═══ Point 13 — Rattrapage automatique ═══
-- Toutes les 15 minutes, la base réveille la fonction « paiements-rattrapage », qui relit chez SumUp
-- les paiements restés en attente et relance les remboursements dus. Elle ne répond qu'à la base :
-- un jeton interne, tiré au hasard ici et lisible seulement par le serveur, accompagne l'appel.
create table if not exists public.jetons_internes (
  nom text primary key,
  valeur text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
alter table public.jetons_internes enable row level security; -- aucune politique : fermée à l'appli
insert into public.jetons_internes (nom) values ('rattrapage') on conflict (nom) do nothing;

-- Paiements à relire chez SumUp : encore en attente (ou remplacés par un nouveau lien) depuis plus de
-- 10 minutes et moins de 3 jours ; et paiements dont le remboursement n'est pas encore fait.
create or replace function public.paiements_a_verifier()
returns table (id uuid, checkout_id text, statut text, a_rembourser boolean)
language sql stable security definer set search_path = public
as $$
  select p.id, p.checkout_id, p.statut, false
    from public.paiements p
   where p.statut in ('en_attente', 'expire', 'echoue') and p.checkout_id is not null
     and p.cree_le < now() - interval '10 minutes' and p.cree_le > now() - interval '3 days'
  union all
  select p.id, p.checkout_id, p.statut, true
    from public.paiements p
   where p.statut = 'paye' and p.remboursement_du > p.rembourse and p.transaction_id is not null
   limit 100;
$$;

create or replace function public.reveiller_rattrapage()
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  url text := (select url_projet from public.parametres where id = 1);
  jeton text := (select valeur from public.jetons_internes where nom = 'rattrapage');
begin
  if url is null or jeton is null then return; end if;
  if not exists (select 1 from public.paiements_a_verifier()) then return; end if; -- rien à faire
  perform net.http_post(url := url || '/functions/v1/paiements-rattrapage', body := '{}'::jsonb,
                        headers := jsonb_build_object('Content-Type', 'application/json', 'x-jeton-interne', jeton));
end;
$$;

select cron.schedule('volant3ranches-paiements', '*/15 * * * *', 'select public.reveiller_rattrapage()');

-- ═══ Droits : tout ceci est réservé au serveur ═══
revoke execute on function public.reserver_remboursement(uuid), public.liberer_remboursement(uuid, uuid),
  public.remboursement_effectue(uuid, numeric, uuid), public.paiements_a_verifier(), public.reveiller_rattrapage()
  from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.reserver_remboursement(uuid), public.liberer_remboursement(uuid, uuid),
      public.remboursement_effectue(uuid, numeric, uuid), public.paiements_a_verifier(), public.confirmer_paiement(text, text, numeric)
      to service_role;
    grant select on public.jetons_internes to service_role;
  end if;
end $$;
