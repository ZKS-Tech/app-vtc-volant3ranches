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

## Tester la confirmation en temps réel

Tant que le mode chauffeur n'existe pas (étape 3), on peut jouer le rôle de Fabrice depuis le
tableau de bord : **Table Editor** › `courses` › changer le `statut` d'une course de `envoyee` à
`confirmee`. L'écran « Demande envoyée » du téléphone passe à l'indigo instantanément.

## Donner le rôle chauffeur à Fabrice (étape 3)

Une fois son compte créé dans l'appli, dans **SQL Editor** :

```sql
update public.profils set role = 'chauffeur' where email = 'adresse-de-fabrice@exemple.fr';
```

## Modifier un tarif

**Table Editor** › `offres` (prix au km, minimum) ou `parametres` (heures de nuit, majoration
week-end, attentes). L'appli prend les nouveaux tarifs à son prochain démarrage, et la base calcule
toujours le prix final avec ces valeurs.
