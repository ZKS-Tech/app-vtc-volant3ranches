-- Volant3ranches VTC — bons de commande et factures (modèles V2 de Fabrice).
-- À exécuter une fois dans Supabase (SQL Editor › New query › coller › Run), après les migrations
-- précédentes.
--
--  • Bon de commande : émis automatiquement quand une course est confirmée (acompte payé,
--    confirmation directe ou course saisie par Fabrice). Numéro BC-AAAA-0001.
--  • Facture : émise par Fabrice quand la course est effectuée (il indique le mode de paiement),
--    ou pour des frais d'annulation. Numéro F-AAAA-0001.
--  Numérotation continue par année, sans trou (obligation légale pour les factures).
--  Chaque document est figé à l'émission (contenu complet enregistré) : le modifier ensuite est
--  impossible ; une erreur se corrige par une nouvelle pièce (avoir, à venir).
--  Les prix des offres sont TTC ; TVA du transport de personnes : 10 %.
--  Le PDF est produit par la fonction serveur « document-pdf » à partir du contenu figé.

-- ——— Informations de l'entreprise (en-tête et pied des documents) ———
alter table public.parametres add column raison_sociale text not null default 'Volant3ranches';
alter table public.parametres add column forme_juridique text not null default 'SASU au capital de 100 €';
alter table public.parametres add column siege text not null default '11 chemin de la baissade, 81220 Viterbe';
alter table public.parametres add column siren text not null default '932 513 443';
alter table public.parametres add column tva_intracom text not null default 'FR07932513443';
alter table public.parametres add column taux_tva numeric(4, 2) not null default 10.00 check (taux_tva >= 0 and taux_tva < 50);

-- ——— Coordonnées de facturation sur la fiche client ———
alter table public.fiches_clients add column numero_client int generated always as identity;
alter table public.fiches_clients add column entreprise text;
alter table public.fiches_clients add column adresse text;
alter table public.fiches_clients add column code_postal text;
alter table public.fiches_clients add column ville text;

-- ——— Numérotation sans trou ———
-- Le compteur est incrémenté dans la même transaction que l'émission : si l'émission échoue,
-- le numéro n'est pas consommé.
create table public.compteurs_documents (
  type text not null check (type in ('commande', 'facture')),
  annee int not null,
  dernier int not null,
  primary key (type, annee)
);
alter table public.compteurs_documents enable row level security;

create or replace function public.prochain_numero(p_type text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  a int := extract(year from now() at time zone 'Europe/Paris');
  n int;
begin
  insert into public.compteurs_documents (type, annee, dernier) values (p_type, a, 1)
  on conflict (type, annee) do update set dernier = compteurs_documents.dernier + 1
  returning dernier into n;
  return format('%s-%s-%s', case p_type when 'facture' then 'F' else 'BC' end, a, lpad(n::text, 4, '0'));
end;
$$;

-- ——— Documents émis (figés) ———
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('commande', 'facture')),
  numero text not null unique,
  course_id uuid not null references public.courses (id) on delete restrict,
  emis_le timestamptz not null default now(),
  total_ht numeric(10, 2) not null,
  tva numeric(10, 2) not null,
  total_ttc numeric(10, 2) not null,
  mode_paiement text check (mode_paiement in ('cb', 'cheque', 'especes', 'virement', 'en_ligne')),
  contenu jsonb not null,
  pdf_chemin text
);
create index documents_course_idx on public.documents (course_id);
create index documents_emis_idx on public.documents (type, emis_le);
-- Une seule facture par course.
create unique index documents_une_facture on public.documents (course_id) where type = 'facture';

-- Seul le chemin du PDF (rempli par le serveur) peut changer après l'émission.
create or replace function public.documents_figes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Un document émis ne peut pas être supprimé'; end if;
  if (new.type, new.numero, new.course_id, new.emis_le, new.total_ht, new.tva, new.total_ttc, new.mode_paiement, new.contenu)
     is distinct from (old.type, old.numero, old.course_id, old.emis_le, old.total_ht, old.tva, old.total_ttc, old.mode_paiement, old.contenu) then
    raise exception 'Un document émis ne peut pas être modifié';
  end if;
  return new;
end;
$$;
create trigger documents_figes before update or delete on public.documents
  for each row execute function public.documents_figes();

alter table public.documents enable row level security;
create policy "Fabrice voit les documents" on public.documents for select to authenticated using (public.est_chauffeur());
create policy "Client voit les documents de ses courses" on public.documents for select to authenticated
  using (exists (select 1 from public.courses c where c.id = course_id and c.client_id = auth.uid()));
grant select on public.documents to authenticated;
alter publication supabase_realtime add table public.documents;

-- ——— Contenu figé d'un document ———
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
    pu := round(c.prix_km / (1 + taux / 100), 2);
    base := round(km * pu, 2);
    ecart := ht - base;
    lignes := jsonb_build_array(jsonb_build_object(
      'libelle', format('Transfert : %s', o.nom), 'detail', 'Véhicule avec chauffeur · ' || o.vehicule
        || case when c.aller_retour then ' · aller-retour' else '' end
        || case when array_length(c.majorations, 1) > 0 then ' · tarif majoré (' || array_to_string(c.majorations, ', ') || ')' else '' end,
      'quantite', km, 'unite', 'km', 'prix_unitaire_ht', pu, 'total_ht', base));
    if abs(ecart) >= 0.01 then
      libelle_ecart := case
        when c.prix_ajuste then 'Ajustement au prix convenu'
        when ttc <= o.minimum and ecart > 0 then 'Complément minimum de course'
        when c.aller_retour and ecart < 0 then 'Remise aller-retour (-5 %) et arrondi'
        else 'Arrondi' end;
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

create or replace function public.emettre_document(p_course uuid, p_type text, p_mode text)
returns public.documents
language plpgsql security definer set search_path = public
as $$
declare
  numero text := public.prochain_numero(p_type);
  contenu jsonb := public.contenu_document(p_course, p_type, numero, p_mode);
  d public.documents;
begin
  insert into public.documents (type, numero, course_id, total_ht, tva, total_ttc, mode_paiement, contenu)
  values (p_type, numero, p_course, (contenu->>'total_ht')::numeric, (contenu->>'tva')::numeric,
          (contenu->>'total_ttc')::numeric, p_mode, contenu)
  returning * into d;
  return d;
end;
$$;

-- ——— Bon de commande automatique à la confirmation ———
create or replace function public.bon_a_la_confirmation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.statut = 'confirmee' and (tg_op = 'INSERT' or old.statut is distinct from 'confirmee')
     and not exists (select 1 from public.documents where course_id = new.id and type = 'commande') then
    perform public.emettre_document(new.id, 'commande', case when new.acompte_paye_le is not null then 'en_ligne' end);
  end if;
  return new;
end;
$$;
create trigger courses_bon_de_commande
  after insert or update of statut on public.courses
  for each row execute function public.bon_a_la_confirmation();

-- ——— Facture (Fabrice) : course effectuée, ou frais d'annulation ———
create or replace function public.emettre_facture(p_course uuid, p_mode text)
returns public.documents
language plpgsql security definer set search_path = public
as $$
declare
  c public.courses;
begin
  if not public.est_chauffeur() then raise exception 'Réservé au chauffeur'; end if;
  if p_mode is null or p_mode not in ('cb', 'cheque', 'especes', 'virement', 'en_ligne') then raise exception 'Mode de paiement invalide'; end if;
  select * into c from public.courses where id = p_course for update;
  if not found then raise exception 'Course introuvable'; end if;
  if exists (select 1 from public.documents where course_id = p_course and type = 'facture') then
    raise exception 'Cette course a déjà une facture';
  end if;
  if c.statut = 'confirmee' then
    update public.courses set statut = 'terminee', terminee_le = now() where id = p_course;
  elsif c.statut = 'annulee' then
    if coalesce(c.frais_annulation, 0) <= 0 then raise exception 'Pas de frais d''annulation à facturer'; end if;
  elsif c.statut <> 'terminee' then
    raise exception 'Seule une course effectuée (ou annulée avec frais) peut être facturée';
  end if;
  return public.emettre_document(p_course, 'facture', p_mode);
end;
$$;

-- ——— Fichiers PDF : espace de stockage privé (lu uniquement via la fonction serveur) ———
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
  end if;
end $$;

-- ——— Droits ———
revoke execute on function public.prochain_numero(text) from public, anon, authenticated;
revoke execute on function public.contenu_document(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.emettre_document(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.emettre_facture(uuid, text) from public, anon;
grant execute on function public.emettre_facture(uuid, text) to authenticated;
