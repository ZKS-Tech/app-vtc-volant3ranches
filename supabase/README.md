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

Les informations de l'entreprise (raison sociale, siège, SIREN, n° de TVA, taux de TVA) sont dans
**Table Editor** › `parametres` ; elles sont recopiées dans chaque pièce au moment de l'émission.

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

Les 119 vérifications doivent afficher « OK ».

Fonctions serveur (SumUp et la base simulés, aucun appel réel) :

```bash
cd supabase/functions && npx deno test --allow-env --allow-net --allow-read tests/
```
