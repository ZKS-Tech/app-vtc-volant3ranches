# Volant3ranches VTC — application mobile de réservation

Application iOS et Android pour réserver une course auprès de **Volant3ranches VTC**, le service
de chauffeur privé de Fabrice Legouez Ricoce, basé à Viterbe (Tarn) : transferts aéroport et gares
(Toulouse-Blagnac, Albi, Castres, Carcassonne), trajets professionnels, mise à disposition et longues
distances, en Tesla Model 3 Performance ou en Van 9 places.

Site actuel : <https://volant3ranches-vtc.fr>

> **État : prototype de démonstration.** Les écrans et le parcours sont complets, mais les données
> sont fictives et aucune demande n'est réellement envoyée. Il sert à valider l'application avec
> Fabrice avant le développement complet.

![Parcours de réservation](docs/prototype/1-reservation.png)

![Mode sombre](docs/prototype/4-mode-sombre.png)

## Le principe

1. Le client choisit son départ et son arrivée (raccourcis aéroport et gares), la date, l'heure,
   le nombre de passagers et de bagages, et son numéro de vol ou de train.
2. Il voit tout de suite le **prix** des deux offres, calculé au kilomètre avec les tarifs du site
   (majoration nuit, week-end et jours fériés, aller-retour à -5 %, minimum de course).
3. Il envoie une **demande** sans créer de compte. Fabrice la confirme sous 30 minutes ; le client est
   prévenu par notification (email récapitulatif à venir).
4. Il retrouve ses courses, peut appeler Fabrice, annuler (frais selon les CGV) et afficher le
   **panneau à son nom** pour le hall des arrivées.

Pas de paiement en ligne : paiement à bord ou sur facture.

## Identité visuelle

Direction **« Bleu pastel du Lauragais »** : le bleu de la guède, teinture qui a fait la richesse
d'Albi et de Toulouse. Seuls le logo et le nom viennent du site ; couleurs et typographie ont été
redéfinies pour sortir du style « crème et or » jugé trop générique.

- Le statut d'une course **se teinte** comme un tissu à chaque bain : bleu pâle quand la demande est
  envoyée, indigo profond quand Fabrice confirme, bleu délavé quand elle est terminée.
- **Cuve d'indigo vivante** : en fond de l'accueil, un bain de teinture rendu en 3D temps réel
  (shader WebGL, `mobile/src/CuveIndigo.tsx`) dérive lentement et suit l'inclinaison du téléphone.
  Quand Fabrice confirme, l'encre monte du bas et envahit l'écran. L'effet s'arrête hors écran et
  devient une image fixe si « Réduire les animations » est activé.
- **Le plan du trajet** : sur le choix du véhicule et la confirmation, un plan simplifié de la région
  (grands axes A61, A68, N126, rivières, villes ; `mobile/src/CartePlan.tsx`). L'itinéraire est calculé
  sur ce réseau et se dessine le long des routes, puis l'arrivée pulse. Tracés approximatifs.
- **Le délai de confirmation** : sur « Demande envoyée » et le détail d'une course, un anneau se remplit
  pendant les 30 minutes que Fabrice s'est données pour confirmer ; au-delà, l'appli invite à l'appeler.
- **Le panneau qui se retourne** : le panneau à votre nom pivote comme une pancarte qu'on retourne ;
  le toucher le retourne à nouveau.
- **Mode clair et mode sombre.** L'application suit le réglage du téléphone ; on peut aussi forcer
  l'un ou l'autre dans Profil › Apparence.
- Photos réelles de Fabrice et des véhicules, reprises du site.

## Contenu du dépôt

| Chemin | Contenu |
|---|---|
| `mobile/` | Le prototype (Expo / React Native, TypeScript, Expo Router) |
| `mobile/app/` | Les écrans : `(tabs)/` pour les 4 onglets, puis adresse, trajet, offre, coordonnées, confirmation, détail de course, panneau |
| `mobile/src/data.ts` | Contenu repris du site : tarifs, véhicules, prestations, FAQ, avis, CGV, contact |
| `mobile/src/theme.ts` | Les deux palettes (clair et sombre) et la typographie |
| `mobile/assets/photos/` | Logo et photos du site |
| `mobile/src/serveur.ts` | Connexion à Supabase : compte invité, tarifs, demandes, temps réel |
| `supabase/` | Base de données : structure, sécurité, tarifs et tests (voir `supabase/README.md`) |
| `mobile/app/chauffeur/` | Espace de Fabrice : tableau de bord, demandes, messages, planning, clients (Gestion : roue dentée du tableau de bord) |
| `mobile/src/chauffeur.tsx` | Données de l'espace chauffeur (temps réel) et jeu de démonstration |
| `docs/architecture.md` | Architecture et ordre de développement |
| `PRODUCT.md` | Contexte produit : clients, règles métier, contraintes, décisions ouvertes |
| `docs/brief-reservation.md` | Brief de conception du parcours de réservation et plan de statistiques (GA4) |
| `docs/prototype/` | Captures des écrans |

## Tester sur un téléphone

### Ce qu'il faut

- Un ordinateur avec [Node.js](https://nodejs.org) 20 ou plus récent et Git.
- Un iPhone ou un téléphone Android avec l'application **Expo Go**
  ([App Store](https://apps.apple.com/app/expo-go/id982107779) ·
  [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)), à jour.

### Étapes

1. Récupérer le projet :

   ```bash
   git clone https://github.com/ZKS-Tech/app-vtc-volant3ranches.git
   ```

   ```bash
   cd app-vtc-volant3ranches/mobile
   ```

   Tant que le travail n'est pas fusionné dans la branche principale, se placer sur la branche du
   prototype :

   ```bash
   git checkout claude/trusting-cannon-qpd5r6
   ```

2. Installer les dépendances (une seule fois) :

   ```bash
   npm install
   ```

3. Lancer le serveur de développement :

   ```bash
   npm run telephone
   ```

   Cette commande (`npx expo start --tunnel ngrok`) passe par un tunnel : elle marche quel que soit
   le réseau, y compris sous WSL, sans compte Expo. Sur un même Wi-Fi sans WSL, `npx expo start`
   suffit et se recharge plus vite.

4. Un QR code s'affiche dans le terminal :
   - **iPhone** : le scanner avec l'appareil photo, puis ouvrir dans Expo Go ;
   - **Android** : le scanner depuis Expo Go.

L'ordinateur et le téléphone doivent être sur le **même réseau Wi-Fi**. Si le téléphone n'arrive pas
à se connecter (Wi-Fi d'entreprise, partage de connexion…), lancer plutôt :

```bash
npx expo start --tunnel
```

Chaque modification du code s'affiche immédiatement sur le téléphone.

### Dépannage : « Something went wrong » dans Expo Go

- **Sous Windows avec WSL**, le QR code pointe vers une adresse interne à WSL (souvent `172.x.x.x`)
  que le téléphone ne peut pas joindre. Utiliser le tunnel :

  ```bash
  npx expo login
  ```

  ```bash
  npx expo start --tunnel
  ```

  Le tunnel demande d'être connecté à un compte Expo (gratuit). Sans compte, utiliser
  `npx expo start --tunnel ngrok` et accepter l'installation de `@expo/ngrok`.
  En se connectant aussi dans Expo Go avec le même compte, le projet apparaît directement dans
  l'application, sans QR code.
- Vérifier que le téléphone et l'ordinateur sont sur le même Wi-Fi et que le pare-feu Windows
  autorise Node.js sur les réseaux privés.
- Mettre à jour Expo Go : le projet utilise Expo SDK 58.
- Dans Expo Go, « View error log » donne le message exact ; le terminal d'`npx expo start` aussi.

### Recevoir les notifications (version de développement)

Expo Go ne reçoit plus les notifications push sur Android. Pour les tester, on installe une fois sur
le téléphone une **version de développement** : une vraie appli Volant3ranches (APK), qui se connecte
ensuite à l'ordinateur comme Expo Go et se met à jour à chaque modification du code. Gratuit avec un
compte Expo (offre gratuite d'EAS Build), sans compte Google Play.

1. Une seule fois, relier le projet au compte Expo (le numéro du projet s'ajoute dans `app.json`,
   à committer) :

   ```bash
   npx eas-cli login
   ```

   ```bash
   npx eas-cli init
   ```

2. Construire l'APK (environ 15 minutes sur les serveurs d'Expo, file d'attente comprise) :

   ```bash
   npx eas-cli build -p android --profile development
   ```

   À la question sur les identifiants Android, accepter de **générer un nouveau keystore**. À la fin,
   un lien et un QR code permettent de télécharger l'APK sur le téléphone ; autoriser l'installation
   d'applications inconnues quand Android le demande.

3. Lancer le serveur pour cette version (au lieu de `npm run telephone`) :

   ```bash
   npm run appli
   ```

   puis ouvrir l'appli Volant3ranches et scanner le QR code.

À la première demande envoyée, l'appli demande l'autorisation d'envoyer des notifications ; côté
Fabrice, à la connexion. L'état se voit dans Profil › Être prévenu (ou Gestion côté Fabrice).
Il faut aussi avoir exécuté la migration 6 dans Supabase (voir `supabase/README.md`).

Sur iPhone, une version installable demande un compte Apple Developer (99 €/an) ; on le fera à la
publication.

`npm run telephone` continue d'ouvrir Expo Go pour tout le reste.

### Autres façons de l'essayer

- **Dans le navigateur** : `npx expo start --web` (pratique pour un aperçu rapide, mais le rendu
  final est celui du téléphone).
- **Simulateur** : dans le terminal d'`npx expo start`, touche `i` pour le simulateur iOS (Mac avec
  Xcode) ou `a` pour l'émulateur Android (Android Studio).

### Scénario à dérouler avec Fabrice

1. Accueil : choisir « Gare de Castres » en départ, puis le raccourci « Aéroport Toulouse-Blagnac ».
2. Choisir la date et l'heure ; essayer une heure après 22h pour voir la majoration de nuit.
3. Passer à 4 passagers : la Tesla devient indisponible, le Van est proposé.
4. Remplir les coordonnées, accepter les CGV, envoyer la demande.
5. Sur « Demande envoyée », toucher **« Simuler la confirmation de Fabrice »** : l'écran passe à
   l'indigo.
6. Mes courses › ouvrir la course › « Afficher le panneau à mon nom », puis « Annuler la course »
   pour voir les frais.
7. Profil › Prototype › **« Simuler un échec d'envoi »**, puis refaire une réservation pour voir
   l'écran d'erreur.
8. Profil › Apparence › « Sombre » pour voir le mode sombre.

## Limites du prototype

- Adresses : toutes les adresses de France (API Adresse de l'IGN), plus les raccourcis aéroport et
  gares. Distance et durée : itinéraire réel par la route (IGN), recalculé par la base à chaque demande.
  Sans réponse de l'IGN, aucun prix n'est affiché.
- **Sans clé Supabase** dans `mobile/.env`, l'appli tourne en démonstration : les courses de
  « Claire Martin » sont des exemples et rien n'est enregistré. **Avec la clé**, les tarifs viennent de
  la base, les demandes y sont enregistrées et la confirmation arrive en temps réel
  (voir `supabase/README.md`).
- **Espace chauffeur** : Profil › tout en bas › Espace chauffeur. Fabrice s'y connecte avec son email
  et son mot de passe (compte à créer : voir `supabase/README.md`). « Voir la démonstration » le montre
  sans compte, avec des clients et des courses fictifs.
- **Notifications** : pas dans Expo Go sur Android, ni dans le navigateur. Voir « Recevoir les
  notifications » ci-dessus. L'email récapitulatif n'est pas encore branché.

## Prochaines étapes

- ~~Messagerie client ↔ chauffeur~~ : faite (détail d'une course › « Écrire à Fabrice » ; côté Fabrice,
  onglet « Messages » de l'espace chauffeur).
- ~~Notifications push~~ : faites (voir `supabase/README.md`, migration 6). Prochaine étape : l'email
  récapitulatif (Brevo, gratuit).
- ~~Valider la maquette avec Fabrice~~ : validée. Décisions : mode chauffeur dans l'application,
  30 min d'attente gratuite à l'aéroport, majoration du week-end maintenue (CGV à mettre à jour).
- Serveur de réservation et outil de confirmation pour Fabrice.
- SMS (plus tard, payant).
- Statistiques **Firebase Analytics (GA4)**, avec consentement, sur le parcours décrit dans
  `docs/brief-reservation.md`.
- Version installable sans ordinateur pour les testeurs (EAS Build, TestFlight / test interne
  Google Play), puis publication sur les stores.

## Outils

- [Expo](https://expo.dev) SDK 58, React Native, Expo Router, TypeScript.
- Le skill de conception [Impeccable](https://github.com/pbakaus/impeccable) est installé dans
  `.claude/skills/` pour Claude Code (`/impeccable critique`, `/impeccable polish`…).

Vérifier le code avant un commit :

```bash
cd mobile && npx tsc --noEmit
```
