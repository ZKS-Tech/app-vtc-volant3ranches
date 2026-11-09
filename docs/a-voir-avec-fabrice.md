# À voir avec Fabrice

Liste préparée avant l'étape des emails. Pour SumUp, la liste détaillée est dans
`docs/sumup-avec-fabrice.md` (à faire pendant la même rencontre).

## 1. Emails (Brevo, gratuit jusqu'à 300 emails par jour)

- [ ] **Qui gère le nom de domaine** `volant3ranches-vtc.fr` (OVH, Hostinger, Ionos, Google…) et les
      identifiants de ce compte, ou la personne qui peut y ajouter des enregistrements DNS.
      Indispensable : Brevo demande d'ajouter 3 ou 4 lignes (SPF, DKIM, DMARC) pour que les emails
      partent au nom du domaine et n'arrivent pas dans les spams.
- [ ] **L'adresse d'expédition** souhaitée, par exemple `reservation@volant3ranches-vtc.fr` ou
      `contact@…`. Une boîte existe-t-elle déjà sur ce domaine ?
- [ ] **L'adresse où arrivent les réponses** des clients (son email habituel ?).
- [ ] **Créer le compte Brevo** avec lui, avec l'email de l'entreprise (brevo.com, offre gratuite).
      Ne pas m'envoyer la clé API : elle se colle directement dans Supabase, comme pour SumUp.
- [ ] **Quels emails il veut envoyer**, et lesquels il veut recevoir en copie :
  - demande bien reçue ;
  - acompte à régler (avec le lien de paiement) ;
  - course confirmée, avec le bon de commande en PDF ;
  - rappel la veille ;
  - facture après la course ;
  - annulation, avec le remboursement éventuel ;
  - mot de passe oublié (comptes clients) ;
  - pour lui : nouvelle demande par email, en plus de la notification ?
- [ ] **Signature et ton** : vouvoiement, « Fabrice » ou « Volant3ranches VTC », numéro de téléphone
      en bas de chaque email.

## 2. À faire valider (décisions prises pour avancer)

- [ ] Les prix affichés dans l'appli sont **TTC**, avec une **TVA de 10 %** (le HT est calculé à
      partir du TTC).
- [ ] La mention ajoutée en bas des factures pour les **clients professionnels** (pénalités de
      retard, indemnité forfaitaire de 40 €), absente de ses modèles.
- [ ] Les factures émises ne se modifient plus : une erreur se corrigera par un **avoir** (à faire).
- [ ] **CGV du site** à mettre à jour : acompte de 10 % à régler pour confirmer, remboursé si
      annulation plus de 24 h avant ou si Fabrice annule, conservé sinon ; reste payé à bord.

## 3. SumUp

Voir `docs/sumup-avec-fabrice.md` : activer les paiements en ligne, code marchand, clé API à coller
dans Supabase, puis un essai réel.
