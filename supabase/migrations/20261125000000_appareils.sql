-- Volant3ranches VTC — jeton de notification non transférable sans preuve (plan de sécurité, point 18).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run).
--
-- Avant : quiconque connaissait le jeton de notification d'un autre téléphone pouvait le rattacher
-- à son compte (le vrai propriétaire ne recevait plus ses notifications, et recevait celles de
-- l'intrus). Désormais :
--  • un téléphone déjà rattaché à un autre compte n'est transféré qu'après une preuve : la base envoie
--    un code par notification silencieuse à CE téléphone ; seule l'appli installée dessus le reçoit
--    et le renvoie (confirmer_appareil). Un intrus sans le téléphone ne reçoit jamais le code.
--  • à la déconnexion, l'appli libère le téléphone (oublier_appareil) : la connexion suivante
--    l'enregistre directement, sans vérification.
--  • un code par téléphone et par minute au plus (pas de rafale de notifications), valable 10 minutes.

create table if not exists public.appareils_verifs (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  cree_le timestamptz not null default now()
);
alter table public.appareils_verifs enable row level security; -- aucune politique : fermée à l'appli

drop function if exists public.enregistrer_appareil(text, text);
create or replace function public.enregistrer_appareil(p_token text, p_plateforme text)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  moi uuid := auth.uid();
  proprietaire uuid;
  v public.appareils_verifs;
  code text := replace(gen_random_uuid()::text, '-', '');
begin
  if moi is null then raise exception 'Connexion requise'; end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[.+\]$' or length(p_token) > 200 then
    raise exception 'Jeton de notification invalide';
  end if;
  select user_id into proprietaire from public.appareils where token = p_token for update;
  if not found then
    insert into public.appareils (token, user_id, plateforme) values (p_token, moi, p_plateforme);
    return 'enregistre';
  end if;
  if proprietaire = moi then
    update public.appareils set plateforme = p_plateforme, maj_le = now() where token = p_token;
    return 'enregistre';
  end if;
  -- Téléphone rattaché à un autre compte : preuve par notification avant tout transfert.
  select * into v from public.appareils_verifs where token = p_token;
  if found and v.user_id = moi and v.cree_le > now() - interval '1 minute' then return 'verification'; end if;
  insert into public.appareils_verifs (token, user_id, code) values (p_token, moi, code)
  on conflict (token) do update set user_id = excluded.user_id, code = excluded.code, cree_le = now();
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := jsonb_build_object('to', p_token, 'priority', 'high', '_contentAvailable', true,
                               'data', jsonb_build_object('type', 'verification_appareil', 'code', code)),
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
  return 'verification';
end;
$$;

-- L'appli renvoie le code reçu par notification : le téléphone passe au compte qui l'a demandé.
create or replace function public.confirmer_appareil(p_token text, p_code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  moi uuid := auth.uid();
  v public.appareils_verifs;
begin
  if moi is null then raise exception 'Connexion requise'; end if;
  select * into v from public.appareils_verifs where token = p_token for update;
  if not found or v.user_id <> moi or v.code <> coalesce(p_code, '') or v.cree_le < now() - interval '10 minutes' then
    return false;
  end if;
  delete from public.appareils_verifs where token = p_token;
  insert into public.appareils (token, user_id, plateforme) values (p_token, moi, null)
  on conflict (token) do update set user_id = moi, maj_le = now();
  return true;
end;
$$;

-- Effacement automatique : codes de plus d'un jour.
create or replace function public.purger_verifs_appareils()
returns void
language sql security definer set search_path = public
as $$
  delete from public.appareils_verifs where cree_le < now() - interval '1 day';
$$;
select cron.schedule('volant3ranches-verifs-appareils', '41 4 * * *', 'select public.purger_verifs_appareils()');

revoke execute on function public.enregistrer_appareil(text, text), public.confirmer_appareil(text, text) from public, anon;
grant execute on function public.enregistrer_appareil(text, text), public.confirmer_appareil(text, text) to authenticated;
revoke execute on function public.purger_verifs_appareils() from public, anon, authenticated;
