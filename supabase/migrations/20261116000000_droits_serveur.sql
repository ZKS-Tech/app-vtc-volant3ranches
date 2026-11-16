-- Volant3ranches VTC — droits des fonctions serveur (rôle service_role).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run).
--
-- Les fonctions serveur (emails, PDF, SumUp) utilisent la clé secrète du projet, c'est-à-dire le
-- rôle « service_role ». Les projets Supabase récents ne lui donnent plus automatiquement accès aux
-- nouvelles tables : sans ces droits, elles échouent avec « permission denied ».
-- Ce rôle n'est utilisable qu'avec la clé secrète, qui ne quitte jamais Supabase : les clients de
-- l'appli (rôles anon et authenticated) ne gagnent aucun droit.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant execute on all functions in schema public to service_role;
    -- Et pour les tables et fonctions des prochaines migrations :
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant execute on functions to service_role;
  end if;
end $$;
