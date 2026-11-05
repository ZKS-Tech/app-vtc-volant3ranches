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

Les 53 vérifications doivent afficher « OK ».
