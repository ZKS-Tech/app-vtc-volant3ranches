-- Volant3ranches VTC — remise à zéro AVANT L'OUVERTURE AUX CLIENTS. Une seule fois.
-- À exécuter dans Supabase (SQL Editor › New query › coller › Run), juste avant de publier l'appli.
--
-- Efface tout ce qui vient des essais : courses, messages, paiements, bons de commande, factures,
-- avoirs, emails, fiches clients, comptes clients et invités. La numérotation repart à 0001
-- (BC-…, F-…, AV-…) : obligatoire, une facture réelle ne doit pas suivre des numéros d'essai.
-- Garde : le compte de Fabrice, les tarifs et réglages, les jours fériés, les annonces.
--
-- Sécurité : le script refuse de tourner s'il trouve plus de 100 pièces réelles (signe que l'appli
-- est déjà en service). Tout se fait en une fois : en cas d'erreur, rien n'est effacé.
-- Après : Storage › documents › tout sélectionner › Delete (les anciens PDF).

begin;

do $$
declare
  n int := (select count(*) from public.documents where not test);
begin
  if n > 100 then
    raise exception 'Arrêt : % pièces réelles trouvées. Ce script ne sert qu''avant le lancement.', n;
  end if;
end $$;

-- Les pièces émises sont protégées contre la suppression : protection levée le temps du nettoyage.
alter table public.documents disable trigger documents_figes;
delete from public.emails;
delete from public.documents;
alter table public.documents enable trigger documents_figes;
delete from public.compteurs_documents;

delete from public.messages;
delete from public.paiements;
delete from public.courses;
delete from public.fiches_clients;
delete from public.fusions_comptes;

-- Comptes clients et invités (jamais celui de Fabrice).
delete from auth.users u
 where not exists (select 1 from public.profils p where p.id = u.id and p.role = 'chauffeur');

-- Paiements réels et emails à activer selon le cas ; mode test coupé.
update public.parametres set paiements_test = false where id = 1;

commit;

-- Contrôle : tout doit être à 0, sauf « comptes » (= 1, Fabrice).
select (select count(*) from public.courses) as courses,
       (select count(*) from public.documents) as documents,
       (select count(*) from public.fiches_clients) as fiches,
       (select count(*) from auth.users) as comptes;
