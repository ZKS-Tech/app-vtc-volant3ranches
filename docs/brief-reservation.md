# Brief de conception : parcours de réservation (application mobile)

Produit par `/impeccable shape`. Contexte produit : [PRODUCT.md](../PRODUCT.md).
Statut : **à valider** par le porteur du projet et Fabrice avant maquette et code.

## 1. Public et mission

- **Qui** : le voyageur aéroport/gare (Toulouse-Blagnac, gares d'Albi, Castres, Carcassonne).
  Réserve souvent la veille, parfois à l'arrivée, valise à la main, fatigué, horaire de vol incertain.
- **Ce qu'il fait** : obtenir un prix fiable et une confirmation qu'un chauffeur nommé l'attendra.
- **Mode d'écran** : *Operate* (outil de tâche). La lisibilité et les contrôles natifs passent avant
  l'expression visuelle ; la marque s'exprime par la couleur, la typographie, la densité et un seul
  « moment signature ».

## 2. Résultat attendu

- Action principale : **envoyer une demande de course complète** (avec prix) en moins de 2 minutes.
- Succès : la demande est reçue (jamais perdue), Fabrice la confirme, le client est prévenu par
  notification push, SMS et email, et n'a pas besoin d'appeler pour se rassurer.
- Preuves réelles à montrer : Fabrice (photo réelle), les deux véhicules (photos réelles), les prix
  au km, les règles d'attente et d'annulation des CGV. Pas d'avis, notes ou chiffres inventés.

## 3. Direction visuelle choisie : « Bleu pastel du Lauragais »

Le bleu de la guède (le *pastel*), teinture qui a fait la fortune d'Albi et de Toulouse à la
Renaissance. Une identité ancrée dans le territoire de Volant3ranches, et non le
« crème + or + serif » générique reproché à la maquette Figma.

- **Couleur** : bleu indigo profond pour l'en-tête, la barre d'action et les boutons principaux ;
  gamme de bleus pâles (bains successifs de teinture) pour les fonds et états ; gris pierre pour le
  texte secondaire ; vert-jaune de la feuille de pastel réservé aux informations utiles (attente
  gratuite, vol suivi). Rouge et ambre uniquement pour les erreurs et alertes. Mode sombre prévu.
- **Typographie** : police système (SF Pro / Roboto) pour toute l'interface, respectant la taille de
  texte choisie par l'utilisateur ; une police de caractère distinctive uniquement pour les grands
  moments (prix, nom du client, titre de confirmation). À choisir pendant la conception, hors des
  polices « par défaut IA » (pas de Playfair, DM Sans, Inter…).
- **Densité** : aérée sur la saisie (on réserve en marchant), dense et tabulaire sur le récapitulatif
  et l'historique.
- **Moment signature** : **la course se teinte**. Le statut d'une réservation s'affiche comme un
  tissu qui fonce à chaque bain : *Demande envoyée* = bleu très pâle, *Confirmée par Fabrice* =
  indigo profond, *Terminée* = bleu délavé. Le même code couleur sert partout (liste des courses,
  notification, écran de détail). À l'arrivée aéroport, un écran « panneau » affiche le nom du
  client en très grand, comme le panneau nominatif de Fabrice.
- **Ce qui reste standard** : barre d'onglets, navigation, champs, sélecteurs date/heure, feuilles
  modales, boutons : composants natifs iOS et Android, thématisés, jamais réinventés.
- Risque honnête : sans vraies photos et textes soignés, la direction peut se réduire à « une appli
  bleue ». Les photos réelles des véhicules et de Fabrice sont indispensables.

## 4. Périmètre

Fidélité visée : maquette haute fidélité puis prototype codé (Expo), parcours complet.

Écrans :
1. **Accueil / Où allez-vous ?** : départ, arrivée (autocomplétion), raccourcis Aéroport
   Toulouse-Blagnac / Gare d'Albi / Gare de Castres / Gare de Carcassonne, réservations à venir.
2. **Trajet** : date, heure, aller simple / aller-retour, passagers, bagages, **numéro de vol ou de
   train** (facultatif mais mis en avant si départ ou arrivée = aéroport/gare).
3. **Choix de l'offre** : Offre Confort (Tesla, 3 places) / Offre Premium (Van, 8 places), avec
   prix calculé, distance, durée, et le motif de majoration le cas échéant (nuit, week-end, férié).
   Une offre incompatible (ex. 5 passagers → Tesla) est désactivée avec la raison.
4. **Coordonnées et récapitulatif** : nom, téléphone, email, commentaire (siège enfant, arrêt),
   rappel attente gratuite et conditions d'annulation, acceptation des CGV, « Envoyer la demande ».
5. **Demande envoyée** : statut teinté « en attente », délai de confirmation annoncé, bouton
   « Appeler Fabrice », proposition de créer un compte (facultatif).
6. **Mes courses** : à venir / passées, statut teinté, détail, annulation avec frais affichés
   selon le délai (gratuit > 24 h, 50 % 24–12 h, 100 % < 12 h).
7. **Profil** (après création de compte) : coordonnées, adresses favorites, préférences de
   notification, consentement statistiques.

Hors périmètre v1 : paiement en ligne, suivi GPS du chauffeur en direct, application chauffeur
(outil de confirmation de Fabrice : décision ouverte).

Anti-objectifs : écrans en cartes empilées interchangeables, icônes dans des carrés arrondis,
dégradés, crème et or, slogans génériques (« expérience premium », « en quelques clics »).

## 5. États et volumes réalistes

- Adresses longues (« Aéroport Toulouse-Blagnac, Terminal 1, 31700 Blagnac ») : retour à la ligne,
  jamais tronquées au point d'être ambiguës.
- Prix : de 20 € (minimum Tesla) à plus de 1 500 € (longue distance en Van).
- Distance : 3 km à 900 km ; durée de quelques minutes à plus de 8 h.
- États à concevoir : premier lancement (aucune course), saisie d'adresse sans résultat, calcul de
  distance impossible (**pas de prix inventé** : message + appel), hors ligne, envoi en cours, envoi
  échoué (réessayer, **jamais « envoyé » à tort**), demande en attente au-delà de 30 min (relance /
  appel), confirmée, annulée par le client, refusée/indisponible, terminée.
- Horaire de nuit / week-end / férié : majoration visible avant l'envoi.

## 6. Interaction et mise en page

- Navigation : 2–3 onglets (Réserver, Mes courses, Profil) ; la réservation est un parcours en
  pile avec retour natif (geste de bord iOS, retour système Android).
- Le prix apparaît dès que départ, arrivée, date et offre sont connus, avant les coordonnées.
- Une seule action principale par écran, dans la zone du pouce.
- Le bouton « Appeler Fabrice » est accessible depuis toute course en cours ou en attente.
- Transitions natives ; le changement de teinte du statut est la seule animation de marque, et
  devient un simple fondu si « Réduire les animations » est activé.

## 7. Contraintes et décisions ouvertes

- Plateformes : iOS et Android (Expo / React Native), conventions HIG et Material 3 respectées.
- Accessibilité : taille de texte système, cibles 44 pt / 48 dp, contrastes AA, VoiceOver/TalkBack ;
  le statut ne doit pas reposer sur la couleur seule (libellé texte toujours présent).
- Langue : français ; anglais à décider pour les voyageurs étrangers.
- **Statistiques (Firebase Analytics / GA4)**, après consentement. Entonnoir à mesurer :
  `ouverture_app` → `adresse_saisie` → `estimation_affichee` (offre, km, prix, majoration) →
  `offre_choisie` → `coordonnees_saisies` → `demande_envoyee` → `demande_confirmee` ;
  plus `demande_echec_envoi`, `annulation` (délai, frais), `appel_chauffeur`, `compte_cree`,
  `raccourci_aeroport_gare` (lequel). Propriété GA4 commune avec le site pour comparer web et appli.
- Décisions ouvertes :
  - outil de confirmation pour Fabrice (application chauffeur, back-office web, lien email/SMS) ;
  - attente gratuite aéroport : 30 min (site) ou 15 min (CGV) ;
  - majoration week-end : appliquée par le module web mais absente des CGV ;
  - police de caractère des grands moments ;
  - version anglaise.
