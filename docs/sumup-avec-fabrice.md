# SumUp : à faire avec Fabrice

Liste à suivre le jour où vous êtes ensemble devant son compte SumUp. Durée : 20 à 30 minutes.
Le détail technique est dans `supabase/README.md` (section « Acompte de 10 % avec SumUp »).

## Avant de commencer

- [ ] Les deux migrations de l'acompte sont exécutées dans Supabase : `20261111000000_acompte_statuts.sql`,
      puis `20261111000001_acompte.sql`. Ça peut se faire sans Fabrice ; l'acompte reste à 0 %
      tant que SumUp n'est pas prêt.
- [ ] Fabrice a ses identifiants SumUp (email et mot de passe du compte qu'il utilise pour son terminal).
- [ ] Vous avez un ordinateur connecté à Supabase (supabase.com, projet de l'appli).

## Sur le compte SumUp de Fabrice

1. [ ] Se connecter à son espace SumUp sur ordinateur (me.sumup.com).
2. [ ] Vérifier que les **paiements en ligne** sont activés sur le compte (liens de paiement /
       paiements en ligne). Si ce n'est pas le cas, les activer ; SumUp peut demander quelques
       informations ou une validation.
3. [ ] Noter le **code marchand** (affiché dans le profil ou les paramètres du compte, souvent
       une suite de lettres et chiffres commençant par `M`). Ce code n'est pas secret.
4. [ ] Créer une **clé API** dans la rubrique développeurs / clés API de l'espace SumUp.
       Elle commence par `sup_sk_`. **Elle est secrète** : elle permet d'encaisser et de rembourser.
       - ne pas l'envoyer par message, email ou capture d'écran ;
       - ne pas l'écrire dans le code ni dans un document ;
       - la copier directement dans Supabase (étape suivante), puis fermer la page.
       SumUp ne la montre souvent qu'une seule fois : si elle est perdue, en créer une nouvelle.

Si une rubrique a changé de nom ou reste introuvable : prendre une capture de l'écran (sans clé
visible) et me l'envoyer, je vous guiderai.

## Dans Supabase

5. [ ] **Edge Functions › Secrets** : ajouter
       - `SUMUP_API_KEY` = la clé `sup_sk_…`
       - `SUMUP_MERCHANT_CODE` = le code marchand
6. [ ] **Edge Functions › Deploy a new function › Via Editor**, trois fois (nom exact, coller le
       fichier, Deploy, puis désactiver « Verify JWT » dans les réglages de la fonction) :
       - `acompte` ← `supabase/functions/acompte/index.ts`
       - `sumup-webhook` ← `supabase/functions/sumup-webhook/index.ts`
       - `acompte-rembourser` ← `supabase/functions/acompte-rembourser/index.ts`

## Dans l'appli (espace chauffeur de Fabrice)

7. [ ] Gestion › Tarifs et jours fériés › **Acompte** : 10 %, délai 1 h › Enregistrer.

## Premier essai réel (avec une vraie carte, petit montant)

8. [ ] Depuis un téléphone client, réserver une course courte, pour une date à plus de 24 h.
9. [ ] Côté Fabrice : **Accepter**.
10. [ ] Côté client : **Payer** l'acompte sur la page SumUp.
11. [ ] Vérifier : la course passe à « Confirmée », Fabrice reçoit « Acompte reçu », et le paiement
        apparaît dans son espace SumUp.
12. [ ] Côté client : annuler la course. Vérifier que l'acompte est remboursé (notification
        « Acompte remboursé », et remboursement visible dans SumUp).

En cas de problème : Supabase › Edge Functions › `sumup-webhook` (ou `acompte`) › **Logs**, et
Table Editor › `paiements`. Pour revenir en arrière à tout moment : remettre l'acompte à 0 % dans l'appli.

## Après l'essai

- [ ] Mettre à jour les **CGV du site** : acompte de 10 % à régler pour confirmer, remboursé si
      annulation plus de 24 h avant ou si Fabrice annule, conservé sinon ; reste payé à bord.
