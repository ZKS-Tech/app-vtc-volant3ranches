# Base de données Supabase

Projet : **Volant3Ranches** (organisation ZKS-Tech, région Paris, offre gratuite).

## Mise en place (une seule fois)

1. **Créer les tables** : tableau de bord Supabase › **SQL Editor** › **New query**, coller tout le
   contenu de [`migrations/20261104000000_fondations.sql`](migrations/20261104000000_fondations.sql),
   puis **Run**. Le message attendu est « Success. No rows returned ».
2. **Autoriser les comptes invités** : **Authentication** › **Sign In / Providers** › activer
   **Allow anonymous sign-ins**, puis **Save**. Chaque téléphone reçoit ainsi un compte invité et
   ne voit que ses propres courses.
3. **Brancher l'appli** : **Project Settings** › **API Keys**, copier la **Publishable key**
   (elle commence par `sb_publishable_`) et la coller dans `mobile/.env` après
   `EXPO_PUBLIC_SUPABASE_KEY=`.
   Ne jamais utiliser la clé **secret** dans l'appli.

Vérification : relancer `npm run telephone`, puis Profil › Prototype › Serveur doit afficher
« Connecté ».

## Espace chauffeur (migration 2)

1. **SQL Editor** › **New query** : coller tout le contenu de
   [`migrations/20261105000000_espace_chauffeur.sql`](migrations/20261105000000_espace_chauffeur.sql), puis **Run**.
   Message attendu : « Success. No rows returned ».
2. **Créer le compte de Fabrice** : **Authentication** › **Users** › **Add user** › **Create new user**.
   Saisir son email et un mot de passe (8 caractères ou plus), cocher **Auto Confirm User**, puis **Create user**.
3. **Lui donner le rôle chauffeur** : **SQL Editor** › **New query**, remplacer l'email puis **Run** :

   ```sql
   insert into public.profils (id, role, nom, email)
   select id, 'chauffeur', 'Fabrice', email from auth.users where email = 'adresse-de-fabrice@exemple.fr'
   on conflict (id) do update set role = 'chauffeur';
   ```

   Message affiché : « Success. No rows returned » (normal : la requête enregistre sans rien afficher).
   Pour vérifier, exécuter :

   ```sql
   select p.email, p.role from public.profils p join auth.users u on u.id = p.id;
   ```

   La ligne de Fabrice doit apparaître avec le rôle `chauffeur`. Si elle n'y est pas, l'email ne
   correspond à aucun compte : vérifier l'orthographe.
4. Dans l'appli : **Profil** › tout en bas, **Espace chauffeur** › email et mot de passe.

Pour essayer vous-même avant Fabrice, faites les étapes 2 et 3 avec votre propre email.

## Vraies adresses et distance par la route (migration 3)

**SQL Editor** › **New query** : coller tout le contenu de
[`migrations/20261106000000_itineraires.sql`](migrations/20261106000000_itineraires.sql), puis **Run**.
Message attendu : « Success. No rows returned ».

Cette migration active l'extension `http` de Supabase : la base interroge elle-même le service
d'itinéraire de l'IGN (gratuit, sans clé) pour calculer la distance et la durée de chaque demande.
La distance envoyée par l'appli n'est plus prise en compte, et un client ne peut pas envoyer plus de
5 demandes par heure.

### Correctif du moteur d'itinéraire (migration 4)

L'IGN a retiré le moteur « bdtopo-osrm » utilisé par la migration 3. **SQL Editor** › **New query** :
coller [`migrations/20261107000000_itineraire_ign_moteurs.sql`](migrations/20261107000000_itineraire_ign_moteurs.sql),
puis **Run**. La base utilise alors « bdtopo-valhalla », avec « bdtopo-pgr » en secours.

## Messagerie client ↔ chauffeur (migration 5)

**SQL Editor** › **New query** : coller [`migrations/20261108000000_messagerie.sql`](migrations/20261108000000_messagerie.sql),
puis **Run**. Une conversation par course, en temps réel, visible uniquement par le client de la course
et par Fabrice. Elle reste ouverte jusqu'à deux jours après la course. Un client sans l'appli (course
saisie par téléphone) ne peut pas recevoir de messages : il faut l'appeler.

## Notifications push (migration 6)

**SQL Editor** › **New query** : coller [`migrations/20261109000000_notifications.sql`](migrations/20261109000000_notifications.sql),
puis **Run**. Elle active deux extensions fournies par Supabase (gratuites) : `pg_net` pour envoyer
les notifications au service d'Expo, et `pg_cron` pour la tâche qui tourne toutes les 5 minutes.

| Qui | Quand |
|---|---|
| Fabrice | nouvelle demande · demande sans réponse depuis 30 min · annulation par un client · message d'un client |
| Client | course confirmée · demande refusée (avec le motif) · annulation par Fabrice · message de Fabrice · rappel la veille (entre 24 h et 2 h avant) |

Les téléphones sont enregistrés dans la table `appareils` (un jeton par téléphone, rattaché au compte
connecté). Pour vérifier les envois : **SQL Editor** › `select * from net._http_response order by id desc limit 10;`
(statut 200 = accepté par Expo). Tâche planifiée : **Integrations** › **Cron**.

## Annonces et absences (migration 7)

**SQL Editor** › **New query** : coller [`migrations/20261110000000_annonces.sql`](migrations/20261110000000_annonces.sql),
puis **Run**. Fabrice publie ses annonces depuis l'appli (Gestion › Annonces et absences) :

- **Absence** : bandeau sur l'accueil des clients dès la publication et jusqu'au dernier jour, jours
  barrés dans le choix de la date, et la base refuse toute demande envoyée pour ces jours-là. Les
  courses que Fabrice saisit lui-même restent possibles, et les courses déjà prévues ne sont pas
  annulées (l'appli les lui signale).
- **Information** : bandeau affiché entre les deux dates, sans rien bloquer.

Table `annonces` ; visible par tous pour les annonces en cours et à venir, modifiable par Fabrice seul.

## Acompte de 10 % avec SumUp (migration 8 et fonctions serveur)

Quand Fabrice accepte une demande, le client doit régler un acompte (10 % par défaut, 1 h pour payer)
sur la page de paiement sécurisée de SumUp ; la course n'est confirmée qu'à réception. Sans paiement
dans le délai, la demande expire. Annulation : acompte remboursé si le client annule plus de 24 h
avant ou si Fabrice annule, conservé sinon (CGV). Pour une course saisie par Fabrice, il peut envoyer
un lien de paiement (partage ou email). Réglages : espace chauffeur › Gestion › Tarifs › Acompte
(0 % = pas d'acompte).

### 1. Base de données (deux fichiers, dans cet ordre)

**SQL Editor** › **New query** : coller [`migrations/20261111000000_acompte_statuts.sql`](migrations/20261111000000_acompte_statuts.sql),
**Run**. Puis une **nouvelle** requête avec [`migrations/20261111000001_acompte.sql`](migrations/20261111000001_acompte.sql),
**Run**. (PostgreSQL refuse d'utiliser un nouveau statut dans la même exécution que sa création.)

L'acompte est à **0 %** après la migration : rien ne change pour les clients tant que SumUp n'est pas
prêt. Une fois les étapes 2 et 3 faites, le passer à 10 % dans l'appli (Gestion › Tarifs › Acompte).

### 2. Clés SumUp (dans l'espace SumUp de Fabrice)

- **Clé API secrète** : rubrique développeurs / clés API de l'espace SumUp (elle commence par
  `sup_sk_`). Elle donne accès aux paiements : **ne jamais l'envoyer par message ni la mettre dans le
  code**, la coller uniquement dans Supabase (ci-dessous).
- **Code marchand** : visible dans le profil SumUp (commence souvent par `M`).
- Vérifier que les **paiements en ligne** sont activés sur le compte.

Dans Supabase : **Edge Functions** › **Secrets** (ou Project Settings › Edge Functions) › ajouter
`SUMUP_API_KEY` et `SUMUP_MERCHANT_CODE`.

### 3. Fonctions serveur (trois, depuis le tableau de bord)

**Edge Functions** › **Deploy a new function** › **Via Editor**, pour chacune : nom **exact**, coller
le contenu du fichier, **Deploy**, puis dans ses réglages **désactiver « Verify JWT »** (les fonctions
vérifient elles-mêmes la session ; SumUp n'envoie pas de jeton).

| Nom | Fichier | Rôle |
|---|---|---|
| `acompte` | [`functions/acompte/index.ts`](functions/acompte/index.ts) | crée la page de paiement SumUp |
| `sumup-webhook` | [`functions/sumup-webhook/index.ts`](functions/sumup-webhook/index.ts) | reçoit l'avis de SumUp, vérifie le paiement, confirme la course |
| `acompte-rembourser` | [`functions/acompte-rembourser/index.ts`](functions/acompte-rembourser/index.ts) | rembourse selon les CGV après une annulation |

Avec la CLI Supabase, c'est équivalent : `supabase functions deploy` (les réglages sont dans `config.toml`).

### 4. Premier essai

Réserver une course courte depuis l'appli, l'accepter côté Fabrice, payer l'acompte avec une vraie
carte (1 € minimum), vérifier que la course passe à « Confirmée », puis l'annuler côté client
(plus de 24 h avant) : l'acompte doit être remboursé. Contrôles : **Table Editor** › `paiements`, et
**Edge Functions** › `sumup-webhook` › **Logs**.

Sécurité : le message de SumUp n'est pas signé, la fonction relit donc toujours le paiement chez SumUp
avant de confirmer ; un client ne peut ni se déclarer payé, ni confirmer sa course, ni déclencher un
remboursement non prévu par les CGV (vérifié par les tests).

## Factures et bons de commande (migration 9 et fonction document-pdf)

D'après les modèles V2 de Fabrice (logo, mentions légales, TVA 10 %) :

- **Bon de commande** (BC-AAAA-0001) : émis automatiquement à chaque course confirmée (acompte payé,
  confirmation directe ou course saisie par Fabrice).
- **Facture** (F-AAAA-0001) : émise par Fabrice quand il marque la course « effectuée » et choisit le
  mode de paiement (carte, espèces, chèque, virement), ou pour des frais d'annulation. L'acompte payé
  en ligne est déduit.
- Numérotation continue par année, sans trou ; une pièce émise ne peut être ni modifiée ni supprimée
  (même depuis le tableau de bord Supabase). Une erreur se corrigera par un avoir (à venir).
- Adresse de facturation et entreprise : sur la fiche du client (espace chauffeur › Clients). Chaque
  fiche a un numéro client (C-0001).
- Suivi : Gestion › **Factures et bons de commande** (totaux HT, TVA, TTC du mois, répartition par
  mode de paiement, courses effectuées non facturées, export tableur). Le client retrouve ses pièces
  dans le détail de sa course.

Mise en place :

1. **SQL Editor** › coller [`migrations/20261112000000_factures.sql`](migrations/20261112000000_factures.sql) › **Run**.
   Elle crée aussi l'espace de stockage privé `documents` (vérifier dans **Storage** ; sinon le créer
   à la main : nom `documents`, **non public**).
2. **Edge Functions** › Deploy a new function › Via Editor › nom `document-pdf`, coller
   [`functions/document-pdf/index.ts`](functions/document-pdf/index.ts), **Deploy**, puis désactiver
   « Verify JWT ». Le PDF est créé à la première ouverture puis conservé.

Ligne d'arrondi (migration 14, [`migrations/20261117000000_arrondi.sql`](migrations/20261117000000_arrondi.sql)) :
le prix au km HT est affiché au millième, et la seule différence restante est l'« Arrondi tarifaire
à 0,50 € » (les écarts d'un centime sont intégrés à la ligne principale).

Les informations de l'entreprise (raison sociale, siège, SIREN, n° de TVA, taux de TVA) sont dans
**Table Editor** › `parametres` ; elles sont recopiées dans chaque pièce au moment de l'émission.

## Mode test : faux argent (migration 10) — supprimé

Le mode test a été retiré avant la publication (migration 18) : plus aucun faux paiement possible,
même par erreur de réglage. Les anciennes pièces TEST-… disparaissent avec la remise à zéro.

## Comptes clients (migration 11)

**SQL Editor** › coller [`migrations/20261114000000_comptes.sql`](migrations/20261114000000_comptes.sql) › **Run**.

Dans l'appli : Profil › **Créer un compte** (nom, téléphone, email, mot de passe). Le compte invité du
téléphone devient un compte permanent : les courses déjà réservées sont conservées. **J'ai déjà un
compte** : sur un autre téléphone, les courses réservées en invité y sont rattachées. Les coordonnées
sont préremplies à chaque réservation.

Réglage Supabase à faire une fois : **Authentication** › **Sign In / Providers** › **Email** :
- « Email » activé (c'est déjà le cas pour le compte de Fabrice) ;
- **« Confirm email » désactivé pour l'instant** : le service d'email intégré de Supabase n'envoie
  qu'aux membres de l'équipe et quelques messages par heure. On le réactivera avec l'envoi d'emails
  par Brevo (prochaine étape), en même temps que « mot de passe oublié ».

## Droits des fonctions serveur (migration 13) — à faire avant les emails, les PDF et SumUp

**SQL Editor** › coller [`migrations/20261116000000_droits_serveur.sql`](migrations/20261116000000_droits_serveur.sql) › **Run**.
Les projets Supabase récents ne donnent plus automatiquement accès aux tables au rôle des fonctions
serveur (`service_role`) : sans cette migration, elles échouent avec « permission denied ». Les
clients de l'appli ne gagnent aucun droit.

## Emails avec Brevo (migration 12 et fonction emails)

Envoyés au client : demande reçue, acompte à régler, confirmation avec le **bon de commande en PDF**,
refus, acompte non réglé, annulation, remboursement, **facture en PDF**. À Fabrice (copie, désactivable) :
nouvelle demande, annulation par un client. La base met chaque email en file d'attente ; la fonction
`emails` les envoie par Brevo, réessaie en cas d'échec (5 tentatives) et ne renvoie jamais deux fois
le même. Journal et réglages : espace chauffeur › Gestion › **Emails**.

1. **SQL Editor** › coller [`migrations/20261115000000_emails.sql`](migrations/20261115000000_emails.sql) › **Run**.
   Les emails restent désactivés tant qu'on ne les active pas dans l'appli.
2. **Compte Brevo** (brevo.com, offre gratuite : 300 emails par jour) créé avec l'email de l'entreprise.
3. **Expéditeur**, dans Brevo › *Senders, Domains & Dedicated IPs* :
   - pour tester tout de suite : ajouter une adresse d'expéditeur et la valider avec le lien reçu ;
   - pour de vrai : **ajouter le domaine** `volant3ranches-vtc.fr`. Brevo donne 3 ou 4 enregistrements
     DNS (code Brevo, DKIM, DMARC) à ajouter chez l'hébergeur du domaine, puis « Authenticate ». Sans
     cela, les emails risquent d'arriver dans les spams.
4. **Clé API** : Brevo › *SMTP & API* › *API Keys* › Generate. Dans Supabase › Edge Functions ›
   **Secrets**, ajouter :
   - `BREVO_API_KEY` = la clé (`xkeysib-…`) — secrète, à ne jamais envoyer par message ;
   - `EMAIL_EXPEDITEUR` = l'adresse d'expéditeur validée (ex. `reservation@volant3ranches-vtc.fr`) ;
   - facultatif : `EMAIL_NOM` (par défaut « Volant3ranches VTC ») et `EMAIL_REPONSE` (adresse des réponses).
5. **Fonctions** : redéployer `document-pdf` (nouveau code : elle fournit les PDF à la fonction
   d'emails), puis déployer **`emails`** ([`functions/emails/index.ts`](functions/emails/index.ts)),
   « Verify JWT » désactivé.
6. **Dans l'appli** (Fabrice) : Gestion › Emails › activer, et indiquer son email pour les copies.

### Mot de passe oublié (code par email)

Les clients reçoivent un **code à 6 chiffres** (pas de lien à ouvrir). Ces emails-là sont envoyés par
Supabase lui-même, il faut donc lui donner Brevo comme serveur d'envoi :

1. Brevo › *SMTP & API* › onglet **SMTP** : noter le serveur (`smtp-relay.brevo.com`), le port (587),
   l'identifiant, et générer une **clé SMTP**.
2. Supabase › **Authentication** › **Emails** (ou Settings › SMTP) › **Enable custom SMTP** : ces valeurs,
   l'expéditeur (même adresse que ci-dessus) et le nom « Volant3ranches VTC ».
3. Supabase › Authentication › **Emails** › modèle **Magic Link** : remplacer le contenu par

   ```html
   <h2>Votre code Volant3ranches</h2>
   <p>Pour choisir un nouveau mot de passe, saisissez ce code dans l'application :</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>Il est valable une heure. Si vous n'avez rien demandé, ignorez cet email.</p>
   ```

   et le sujet par « Votre code Volant3ranches ».

**À surveiller** : la clé SMTP de Brevo expire au bout d'un an (date choisie à sa création, ici
novembre 2027) et après 90 jours sans aucun email de code. Si un client ne reçoit plus son code :
Brevo › SMTP et API › SMTP › générer une nouvelle clé, puis la coller dans Supabase (SMTP Settings ›
Password). La clé API des autres emails (`BREVO_API_KEY`) expire seulement après 90 jours sans envoi.

## Statistiques GA4 (fonction stats)

Seulement pour les clients qui acceptent (question posée une fois sur l'accueil, modifiable dans
Profil) ; jamais pour Fabrice. L'appli envoie ses événements à la fonction `stats`, qui les relaie à
Google Analytics depuis Supabase : la clé GA4 reste secrète et Google ne reçoit ni l'adresse IP du
téléphone, ni nom, téléphone, email ou adresse. Événements : `ouverture_app`, `raccourci_aeroport_gare`,
`adresse_saisie`, `estimation_affichee`, `offre_choisie`, `coordonnees_saisies`, `demande_envoyee`,
`demande_echec_envoi`, `demande_confirmee`, `demande_refusee`, `acompte_paye`, `annulation`,
`appel_chauffeur`, `message_envoye`, `compte_cree`, `connexion_compte`, `document_ouvert`.

1. **Propriété GA4 dédiée à l'appli** (créée avec le compte Google de l'entreprise) : Admin › Créer ›
   Propriété « Volant3ranches – Application », France, euro. Plateforme : **Web** (le relais utilise un
   identifiant de flux Web, pas l'outil Firebase), URL du site, flux « Application », **Mesure
   améliorée désactivée**. Noter l'**ID de mesure** (`G-…`). (La propriété du site peut aussi servir ;
   les deux se comparent ensuite dans Looker Studio.)
2. Dans ce flux › **Measurement Protocol API secrets** › Créer (nom « Appli VTC ») : noter le secret.
3. Supabase › Edge Functions › **Secrets** : `GA4_MEASUREMENT_ID` = `G-…`, `GA4_API_SECRET` = le secret.
4. Déployer la fonction **`stats`** ([`functions/stats/index.ts`](functions/stats/index.ts)),
   « Verify JWT » désactivé.
5. GA4 › Admin › **Conservation des données** : 14 mois (comme annoncé dans la politique de
   confidentialité). Admin › **Définitions personnalisées** : déclarer les paramètres utiles comme
   dimensions (`offre`, `type_lieu`, `raccourci`, `majoration`, `statut`) et métriques (`prix`, `km`).
6. Vérifier : GA4 › Rapports › **Temps réel** après avoir accepté les statistiques et fait une
   réservation (quelques minutes de délai possibles).

Sans les secrets, la fonction ignore simplement les événements : l'appli n'est jamais gênée.

## Suppression de compte et effacement automatique (migration 15 et fonction supprimer-compte)

Obligatoire pour les stores (Google Play et Apple exigent la suppression du compte depuis l'appli) et
pour respecter les durées annoncées dans la politique de confidentialité.

1. SQL Editor : exécuter [`20261118000000_effacement.sql`](migrations/20261118000000_effacement.sql).
2. Edge Functions › Deploy a new function › **`supprimer-compte`**, coller
   [`functions/supprimer-compte/index.ts`](functions/supprimer-compte/index.ts), **« Verify JWT »
   désactivé**. Aucun secret à ajouter (elle utilise les clés du projet, déjà présentes).
3. Essai : dans l'appli, en invité, faire une demande puis l'annuler ; Profil › Confidentialité ›
   **Effacer mes données** › Supprimer. Dans Table Editor › `courses`, la course porte maintenant
   « Client supprimé » ; dans Authentication › Users, l'ancien invité a disparu (un nouveau l'a remplacé).

Ce que fait la suppression : refus s'il reste une course à venir (à annuler d'abord) ; courses
passées anonymisées (nom, téléphone, email, adresses personnelles, commentaire, vol/train) mais
gardées pour le chiffre d'affaires (date, offre, km, prix, villes, aéroports, gares) ; messages,
téléphone (notifications), profil, fiche client et accès effacés. Bons de commande et factures déjà
émis : conservés 10 ans (ils sont figés). Le compte de Fabrice ne peut pas être supprimé ainsi.

Chaque nuit à 3 h 17 (`purger_donnees`, tâche `volant3ranches-effacement`) : courses de plus de 3 ans
et fiches clients sans course depuis 3 ans anonymisées ; journal des emails de plus d'un an effacé ;
téléphones inactifs depuis un an oubliés ; invités sans aucune course après 30 jours et comptes
inactifs depuis 3 ans supprimés ; pièces comptables et paiements de plus de 10 ans effacés. Pour
lancer l'effacement à la main et voir le bilan : `select public.purger_donnees();`

## Version anglaise (migration 16)

L'appli client s'affiche en anglais quand le téléphone n'est pas en français (modifiable dans
Profil › Langue). Ses notifications et ses emails suivent la langue du client ; Fabrice reçoit tout
en français, avec la mention « anglais » sur la demande. Bons de commande et factures : en français.

1. SQL Editor : exécuter [`20261119000000_langue.sql`](migrations/20261119000000_langue.sql).
2. Edge Functions › **`emails`** › remplacer le code par
   [`functions/emails/index.ts`](functions/emails/index.ts) › Deploy (« Verify JWT » toujours désactivé).
3. Essai : téléphone réglé en anglais (ou Profil › Langue › English), faire une demande : la
   notification de confirmation et l'email arrivent en anglais.

Ajouter un texte dans l'appli : l'écrire en français dans `t('…')`, puis sa traduction dans
`mobile/src/traductions.ts` ; `node scripts/verifier-traductions.mjs` (dans `mobile/`) liste les oublis.

## Avoirs (migration 17)

Une facture émise ne se modifie pas : pour la corriger ou rembourser un client, Fabrice émet un
**avoir** depuis la course (Documents › « Avoir sur F-… »).
- **Partiel** : un montant TTC (geste commercial, attente non due…).
- **Total** : annule la facture ; la course peut ensuite être refacturée avec un nouveau numéro.
- Motif obligatoire (imprimé sur l'avoir) ; remboursement par carte, espèces, chèque ou virement, ou
  « à valoir » sur une prochaine course. Fabrice rembourse lui-même : l'avoir ne déclenche aucun
  paiement.
- Numéro AV-AAAA-0001, montants négatifs : dans Factures et bons, le total du mois est net des avoirs.
- Le client reçoit l'avoir en PDF par email (en anglais si son appli est en anglais).

1. SQL Editor : exécuter [`20261120000000_avoirs.sql`](migrations/20261120000000_avoirs.sql).
2. Edge Functions : remplacer le code de **`document-pdf`** et de **`emails`** par les nouvelles
   versions ([`functions/document-pdf/index.ts`](functions/document-pdf/index.ts),
   [`functions/emails/index.ts`](functions/emails/index.ts)) › Deploy.

## Sécurité (migration 18) — à faire avant la publication

1. SQL Editor : exécuter [`20261121000000_securite.sql`](migrations/20261121000000_securite.sql).
   - **Faille corrigée** : un client pouvait se donner le rôle « chauffeur » (Supabase ouvre par
     défaut toutes les tables en écriture ; seule la RLS filtrait, et le rôle n'était protégé que
     par un droit par colonne). Désormais un déclencheur refuse tout changement de rôle venant de
     l'appli. Seul le SQL Editor (ou le tableau de bord) peut donner le rôle chauffeur.
   - Mode test supprimé (fonctions de faux paiement effacées, réglage verrouillé).
   - Limites anti-abus : 5 demandes en attente et 10 demandes par 24 h par client ; 20 messages
     par heure.
   - Les nouvelles fonctions ne sont plus appelables par défaut depuis l'appli.
2. Edge Functions : redéployer **`acompte`** et **`acompte-rembourser`** (message d'erreur sans
   détail du compte marchand, diagnostic SumUp retiré).
3. Contrôle : Supabase › **Advisors › Security Advisor** : aucune alerte « RLS disabled » ni
   « security definer » ouverte inattendue.
4. Réglages du tableau de bord :
   - Authentication › Rate Limits : laisser les limites par défaut (inscriptions anonymes,
     emails, codes).
   - Authentication › Attack Protection : **ne pas activer le CAPTCHA** sans mise à jour de
     l'appli (elle n'envoie pas encore de jeton CAPTCHA : toutes les connexions seraient refusées).
5. Google Cloud (projet Firebase) › API et services › Identifiants › clé « Android key » :
   **restreindre aux applications Android** `fr.volant3ranches.app` (+ empreinte SHA-1 donnée par
   `npx eas-cli credentials`). La clé est dans l'appli par conception, la restriction empêche de
   l'utiliser ailleurs.

Les tests de la base (`npm test` dans `supabase/tests`) reproduisent les droits par défaut de
Supabase et vérifient : RLS active sur toutes les tables, liste exacte des fonctions appelables par
un visiteur et par un client, impossibilité de devenir chauffeur.

## Authentification : réglages Supabase (avant publication)

Authentication › **Sign In / Providers › Email** :
- **Confirm email** : activé. Sans lui, un invité peut prendre l'adresse de quelqu'un d'autre en
  créant son compte (l'adresse n'est jamais vérifiée). L'appli gère déjà l'email de confirmation.
- **Secure email change** : activé (changement d'email confirmé sur l'ancienne ET la nouvelle adresse).
- **Secure password change** : activé (une session ouverte depuis longtemps doit se reconnecter
  avant de changer le mot de passe).
- **Minimum password length** : **8** ; **Password requirements** : « Letters and digits ».
  (L'appli demande aussi 8 caractères ; c'est la règle de Supabase qui fait foi.)
- **Email OTP Expiration** : **900** secondes (15 minutes, comme l'annonce l'appli).
- **Email OTP Length** : **8** (code plus long, plus difficile à deviner ; l'appli accepte 6 à 8 chiffres).

Authentication › **Sessions** : laisser **Detect and revoke compromised refresh tokens** activé.
Authentication › **Rate Limits** : garder les valeurs par défaut.

Non disponibles en offre gratuite (Pro) : protection contre les mots de passe divulgués
(« Leaked password protection », base HaveIBeenPwned), durée maximale et inactivité des sessions.
À activer en passant à l'offre Pro.

## Limites anti-abus (migration 20)

1. SQL Editor : exécuter [`20261123000000_limites.sql`](migrations/20261123000000_limites.sql).
   - Emails : 3 par jour au plus vers une même adresse (demande reçue, annulation) ; au-delà de
     200 emails dans la journée (réglage `emails_plafond_jour`), seuls les emails importants partent,
     jusqu'à 280 ; Fabrice est prévenu. Les emails retenus apparaissent « retenu » dans Gestion › Emails.
   - Demandes depuis l'appli : 20 par heure au plus, tous comptes confondus (`demandes_plafond_heure`).
   - Saisies validées par la base (format d'email, téléphone, longueurs, type de lieu, date ≤ 1 an).
   - Profil modifiable uniquement par la fonction prévue.
   - Compteur d'appels pour la fonction `stats` (60 par heure et par compte).
2. Edge Functions : redéployer **les 7 fonctions** (version de `supabase-js` figée), en particulier
   `sumup-webhook` (ne relit chez SumUp que les paiements connus) et `stats` (limite d'appels).
   **Après** la migration : sinon `stats` refuse tout (compteur absent).

## Paiements sûrs (migration 21) — avant d'activer SumUp

1. SQL Editor : exécuter [`20261124000000_paiements_surs.sql`](migrations/20261124000000_paiements_surs.sql).
   - Double paiement d'un même acompte : le second est remboursé automatiquement, Fabrice est prévenu.
   - Remboursements sans doublon : réservés en base avant l'appel à SumUp, comptés une seule fois.
   - Rattrapage toutes les 15 minutes (tâche `volant3ranches-paiements`) : relit chez SumUp les
     paiements restés en attente et relance les remboursements non faits.
2. Edge Functions :
   - créer **`paiements-rattrapage`** ([`functions/paiements-rattrapage/index.ts`](functions/paiements-rattrapage/index.ts)),
     « Verify JWT » désactivé. Aucun secret à ajouter : elle utilise ceux de SumUp déjà en place, et
     n'obéit qu'à la base (jeton interne tiré au hasard par la migration, jamais visible dans l'appli).
   - redéployer **`sumup-webhook`** (erreur 503 quand la base ou SumUp est indisponible, pour que
     SumUp renvoie l'avis) et **`acompte-rembourser`**.

## Téléphone non transférable sans preuve (migration 22)

1. SQL Editor : exécuter [`20261125000000_appareils.sql`](migrations/20261125000000_appareils.sql).
2. Rien à redéployer côté fonctions. L'appli doit être mise à jour (prochaine version EAS) : elle
   reçoit le code de vérification par notification silencieuse et le renvoie.

Comportement : un téléphone déjà rattaché à un compte ne passe à un autre compte qu'après un code
envoyé par notification à CE téléphone (preuve qu'il est bien en main). La déconnexion libère le
téléphone, la connexion suivante l'enregistre directement. Tant que l'ancienne version de l'appli
est installée, seul le cas « réinstallation sans déconnexion » garde l'ancien compte (rare) ;
tout le reste fonctionne comme avant.

## Avant l'ouverture aux clients : remise à zéro (une seule fois)

Les essais ont consommé de vrais numéros (BC-…, F-…, AV-…) : les factures réelles doivent
commencer à 0001, sans trou.
1. SQL Editor : exécuter [`scripts/remise-a-zero-lancement.sql`](scripts/remise-a-zero-lancement.sql).
   Il efface courses, pièces, emails, fiches et comptes d'essai ; il garde le compte de Fabrice,
   les tarifs, les réglages et les annonces. Il refuse de tourner s'il trouve plus de 100 pièces
   réelles (appli déjà en service).
2. Storage › `documents` › tout sélectionner › Delete (anciens PDF).
3. Sur les téléphones d'essai : se déconnecter, ou désinstaller et réinstaller l'appli.

## Tester la confirmation en temps réel

Avec deux téléphones (ou un téléphone et le navigateur) : envoyez une demande côté client, puis
confirmez-la depuis l'espace chauffeur. L'écran « Demande envoyée » passe à l'indigo instantanément.
On peut aussi changer le `statut` directement dans **Table Editor** › `courses`.

## Modifier un tarif

Depuis l'appli : espace chauffeur › **Gestion** › **Tarifs et jours fériés**. Ou dans **Table Editor**
› `offres` / `parametres` / `jours_feries`. La base calcule toujours le prix final avec ces valeurs.

## Tests de la base

Les règles de prix et de sécurité sont vérifiées sur un PostgreSQL local, sans toucher au projet :

```bash
cd supabase/tests && npm install && npm test
```

Les 178 vérifications doivent afficher « OK ».

Fonctions serveur (SumUp et la base simulés, aucun appel réel) :

```bash
cd supabase/functions && npx deno test --allow-env --allow-net --allow-read tests/
```
