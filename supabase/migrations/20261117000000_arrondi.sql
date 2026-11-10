-- Volant3ranches VTC — bons de commande et factures : ligne d'arrondi plus claire.
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run).
--
-- Le prix au km HT est désormais affiché au millième (1,636 € au lieu de 1,64 €) : la ligne
-- d'ajustement ne contient plus que le vrai arrondi du tarif à 0,50 €, et s'appelle
-- « Arrondi tarifaire à 0,50 € ». Les pièces déjà émises ne changent pas.

create or replace function public.contenu_document(p_course uuid, p_type text, p_numero text, p_mode text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  c public.courses;
  f public.fiches_clients;
  o public.offres;
  p public.parametres;
  taux numeric;
  ttc numeric;
  ht numeric;
  km numeric;
  pu numeric;
  base numeric;
  ecart numeric;
  lignes jsonb;
  libelle_ecart text;
  acompte numeric := 0;
begin
  select * into c from public.courses where id = p_course;
  select * into f from public.fiches_clients where id = c.fiche_id;
  select * into o from public.offres where id = c.offre_id;
  select * into p from public.parametres where id = 1;
  taux := p.taux_tva;

  if p_type = 'facture' and c.statut = 'annulee' then
    -- Facture des frais d'annulation prévus par les CGV.
    ttc := coalesce(c.frais_annulation, 0);
    ht := round(ttc / (1 + taux / 100), 2);
    lignes := jsonb_build_array(jsonb_build_object(
      'libelle', 'Frais d''annulation (CGV)', 'detail', format('Course du %s annulée', to_char(c.date_heure at time zone 'Europe/Paris', 'DD/MM/YYYY')),
      'quantite', null, 'unite', null, 'prix_unitaire_ht', null, 'total_ht', ht));
  else
    ttc := c.montant;
    ht := round(ttc / (1 + taux / 100), 2);
    km := c.distance_km * case when c.aller_retour then 2 else 1 end;
    -- Prix au km HT au millième : la seule différence restante vient de l'arrondi du tarif à 0,50 €.
    pu := round(c.prix_km / (1 + taux / 100), 3);
    base := round(km * pu, 2);
    ecart := ht - base;
    -- Écart d'un ou deux centimes dû au prix unitaire au millième : intégré à la ligne principale.
    if abs(ecart) < 0.03 then base := ht; ecart := 0; end if;
    lignes := jsonb_build_array(jsonb_build_object(
      'libelle', format('Transfert : %s', o.nom), 'detail', 'Véhicule avec chauffeur · ' || o.vehicule
        || case when c.aller_retour then ' · aller-retour' else '' end
        || case when array_length(c.majorations, 1) > 0 then ' · tarif majoré (' || array_to_string(c.majorations, ', ') || ')' else '' end,
      'quantite', km, 'unite', 'km', 'prix_unitaire_ht', pu, 'total_ht', base));
    if abs(ecart) >= 0.01 then
      libelle_ecart := case
        when c.prix_ajuste then 'Ajustement au prix convenu'
        when ttc <= o.minimum and ecart > 0 then 'Complément minimum de course'
        when c.aller_retour and ecart < 0 then 'Remise aller-retour (-5 %) et arrondi tarifaire'
        else format('Arrondi tarifaire à %s €', replace(to_char(p.arrondi, 'FM990.00'), '.', ',')) end;
      lignes := lignes || jsonb_build_array(jsonb_build_object(
        'libelle', libelle_ecart, 'detail', null, 'quantite', null, 'unite', null, 'prix_unitaire_ht', null, 'total_ht', ecart));
    end if;
    if c.acompte_paye_le is not null then acompte := coalesce(c.acompte_montant, 0); end if;
  end if;

  return jsonb_build_object(
    'type', p_type,
    'numero', p_numero,
    'date', to_char(now() at time zone 'Europe/Paris', 'DD/MM/YYYY'),
    'vendeur', jsonb_build_object('raison_sociale', p.raison_sociale, 'forme', p.forme_juridique, 'siege', p.siege,
      'siren', p.siren, 'tva', p.tva_intracom, 'telephone', p.telephone_chauffeur),
    'client', jsonb_build_object(
      'numero', case when f.numero_client is not null then 'C-' || lpad(f.numero_client::text, 4, '0') end,
      'nom', coalesce(f.nom, c.nom), 'entreprise', f.entreprise, 'adresse', f.adresse,
      'code_postal', f.code_postal, 'ville', f.ville,
      'telephone', coalesce(c.telephone, f.telephone), 'email', coalesce(c.email, f.email)),
    'course', jsonb_build_object(
      'date', to_char(c.date_heure at time zone 'Europe/Paris', 'DD/MM/YYYY'),
      'heure', to_char(c.date_heure at time zone 'Europe/Paris', 'HH24"h"MI'),
      'passagers', c.passagers, 'offre', o.nom, 'offre_id', o.id, 'vehicule', o.vehicule,
      'depart', concat_ws(', ', c.depart_libelle, nullif(c.depart_detail, '')),
      'arrivee', concat_ws(', ', c.arrivee_libelle, nullif(c.arrivee_detail, '')),
      'aller_retour', c.aller_retour, 'numero_vol_train', c.numero_vol_train),
    'lignes', lignes,
    'total_ht', ht,
    'taux_tva', taux,
    'tva', ttc - ht,
    'total_ttc', ttc,
    'acompte', acompte,
    'reste', greatest(0, ttc - acompte),
    'mode_paiement', p_mode,
    'acquittee', p_type = 'facture' and p_mode is not null
  );
end;
$$;

