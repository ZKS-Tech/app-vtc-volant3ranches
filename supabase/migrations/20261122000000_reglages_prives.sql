-- Volant3ranches VTC — réglages privés de Fabrice illisibles avec la clé publique.
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run).
--
-- La table « parametres » est lisible par tous (tarifs, majorations, mentions légales : l'appli en a
-- besoin avant toute connexion). Mais elle contient aussi l'email personnel de Fabrice et les
-- réglages d'envoi des emails : n'importe qui pouvait les lire avec la clé publique de l'appli.
-- Désormais seules les colonnes publiques sont lisibles ; Fabrice lit les siennes par une fonction.

revoke select on public.parametres from anon, authenticated;
grant select (id, nuit_debut, nuit_fin, majoration_weekend, coef_aller_retour, arrondi,
              attente_standard_min, attente_aeroport_min, attente_gare_min, delai_confirmation_min,
              telephone_chauffeur, acompte_pourcent, acompte_delai_min, raison_sociale, forme_juridique,
              siege, siren, tva_intracom, taux_tva, paiements_test)
  on public.parametres to anon, authenticated;

-- Réglages des emails (écran Emails de Fabrice).
create or replace function public.reglages_emails()
returns table (emails_actifs boolean, emails_copie_chauffeur boolean, email_chauffeur text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  return query select p.emails_actifs, p.emails_copie_chauffeur, p.email_chauffeur from public.parametres p where p.id = 1;
end;
$$;
revoke execute on function public.reglages_emails() from public, anon;
grant execute on function public.reglages_emails() to authenticated;
