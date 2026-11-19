# Plan de corrections de sécurité

Issu des audits du 16 novembre 2026 : secrets, authentification, règles d'accès, entrées utilisateur,
coûts et abus, paiement, dépendances. À traiter dans l'ordre. **Toi** = réglage dans un tableau de
bord ; **Code** = correction dans le dépôt (migration, fonction serveur ou appli).

Déjà corrigé pendant les audits : rôle chauffeur verrouillé (migration 18), démo et mode test
retirés, limites anti-abus par compte, réglages privés de Fabrice illisibles (migration 19),
`.gitignore` des secrets, pas de découverte des comptes au « mot de passe oublié », autres sessions
fermées au changement de mot de passe, clé Firebase restreinte.

## Priorité 0 — tout de suite (réglages, 15 minutes, aucun code)

| # | Qui | Quoi | Pourquoi |
|---|---|---|---|
| 1 | Toi | Vérifier que l'acompte est à **0 %** (`select acompte_pourcent from parametres;`) tant que SumUp n'est pas activé | Sinon chaque course acceptée expire au bout de 60 min, sans paiement possible |
| 2 | Toi | Supabase › Auth › Email : **Confirm email**, **Secure email change**, **Secure password change** activés ; mot de passe **8** caractères, lettres et chiffres ; code **8** chiffres valable **900 s** | Empêche de prendre l'email de quelqu'un ; code impossible à deviner |
| 3 | Toi | Supabase › Auth › Rate Limits : comptes invités **10/h par IP**, emails d'Auth **~20/h** | Freine la création d'invités en masse, porte d'entrée de tous les abus |

## Priorité 1 — avant la publication (code, ~1 journée) — ✅ fait le 17/11 (migration 20)

| # | Qui | Quoi | Pourquoi | Effort |
|---|---|---|---|---|
| 4 | ✅ Code | **Budget d'emails** : 3 emails/jour max vers une même adresse, plafond global quotidien (≈ 200) en gardant les confirmations, factures et codes prioritaires, alerte à Fabrice | Un script peut vider le quota Brevo (300/jour) en 30 min et spammer des inconnus | moyen |
| 5 | ✅ Code | **Plafond global** de demandes venant de l'appli (≈ 20/h) | Rafale de fausses demandes et de notifications chez Fabrice | petit |
| 6 | ✅ Code | **Validation serveur des saisies** : vrai format d'email, longueurs max (nom 100, téléphone 30, email 254, commentaire 500, vol 20, adresses 200), téléphone en chiffres/espaces/+, type de lieu fermé, date ≤ 1 an ; encoder l'email dans les liens `mailto:` de Fabrice | Injection de destinataire caché dans l'email d'acompte ; textes géants | moyen |
| 7 | ✅ Code | `profils.email` non modifiable depuis l'appli | Incohérence de données | petit |
| 8 | ✅ Code | `sumup-webhook` : vérifier que le paiement existe en base **avant** d'interroger SumUp | 100 000 appels = 100 000 requêtes SumUp avec ta clé | petit |
| 9 | ✅ Code | `stats` : limite par compte (≈ 60 appels/h) | Quota des fonctions et statistiques faussées | petit |
| 10 | ✅ Code | Dépendances : mises à jour correctives d'Expo (`npm update`, 8 → 3 alertes, restantes dans un outil de build sans correctif) ; `supabase-js` figé en 2.119.0 dans les 7 fonctions (pas de `deno.lock` : le déploiement depuis le tableau de bord ne l'utilise pas) | 8 alertes modérées (outils de build) ; mise à jour non maîtrisée de code qui manipule les clés | petit |

## Priorité 1 bis — avant d'activer SumUp (code, ~½ journée) — ✅ fait le 18/11 (migration 21)

| # | Qui | Quoi | Pourquoi | Effort |
|---|---|---|---|---|
| 11 | ✅ Code | **Double paiement** : si l'acompte est déjà payé, le second paiement est remboursé automatiquement | Prouvé : un client peut payer 2 fois, rien n'est rendu | petit |
| 12 | ✅ Code | Webhook : répondre en **erreur 500** quand la base ou SumUp échoue (SumUp réessaie) | Aujourd'hui un incident = client débité, course expirée, pas remboursé | petit |
| 13 | ✅ Code | **Rattrapage** toutes les 15 min : relire chez SumUp les paiements en attente, relancer les remboursements dus | Webhook perdu = même conséquence | moyen |
| 14 | ✅ Code | **Remboursements sans doublon** : réservation en base avant l'appel SumUp + référence unique | Deux appels simultanés = remboursement compté deux fois | petit |

## Priorité 2 — renforcement (nouvelle version de l'appli, rebuild EAS)

| # | Qui | Quoi | Pourquoi | Effort |
|---|---|---|---|---|
| 15 | Code | **Double authentification** (TOTP, gratuite chez Supabase) pour le compte de Fabrice | Son compte donne accès à toutes les données clients | moyen |
| 16 | Code | **Session chiffrée** sur le téléphone (expo-secure-store) | Session stockée en clair aujourd'hui | petit |
| 17 | Code + Toi | **CAPTCHA** (Cloudflare Turnstile, gratuit) à la création des invités, puis activation dans Supabase | Bloque les robots ; **ne pas activer côté Supabase avant la nouvelle version** | moyen |
| 18 | ✅ Code | Jeton de notification non transférable : un téléphone rattaché à un autre compte ne change de compte qu'avec un code reçu par notification sur ce téléphone (migration 22 + appli) | Détournement des notifications (suppose un jeton volé) | fait le 19/11 |

## Priorité 3 — optionnel

| # | Qui | Quoi |
|---|---|---|
| 19 | Code | Surveiller `pdf-lib` (non maintenu depuis 2021, aucune faille connue) |
| 20 | Code | Fonction `emails` : n'accepter que les appels de la base |
| 21 | Toi | Retirer le dossier `.claude/` du dépôt s'il ne sert plus ; vérifier que le dépôt GitHub est **privé** |

## À la publication sur Google Play

- Ajouter sur la clé Firebase « Android key » la **2e empreinte SHA-1** (Play Console › Intégrité
  de l'application), sinon pas de notifications dans la version du Play Store.
- Lancer une fois `supabase/scripts/remise-a-zero-lancement.sql` juste avant d'ouvrir aux clients.
- Passer Supabase en offre Pro : sauvegardes, pas de mise en pause, et protection contre les mots
  de passe divulgués (à activer alors dans Auth).
