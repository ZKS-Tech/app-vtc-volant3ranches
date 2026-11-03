# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

React Native avec Expo (iOS + Android, une seule base de code). Choix confirmé par le porteur du projet.
Statistiques : Firebase Analytics (GA4 pour applications), dans la même propriété GA4 que le site si possible.

## Users

**Utilisateur principal (prioritaire, confirmé) : le voyageur aéroport / gare.**
Une personne qui doit rejoindre ou quitter l'aéroport de Toulouse-Blagnac ou les gares d'Albi, Castres
ou Carcassonne. Elle réserve à l'avance (souvent la veille ou quelques jours avant), parfois depuis un
autre téléphone que celui d'un habitué des applis VTC, parfois à l'arrivée, valise à la main, fatiguée,
avec un vol ou un train dont l'horaire peut bouger. Son besoin : savoir que quelqu'un l'attendra, à
quelle heure, pour combien, sans mauvaise surprise.

Autres clients existants (non prioritaires pour la première version, à ne pas exclure) : professionnels
(facturation entreprise), groupes et événements (van 9 places, mariages, mise à disposition),
particuliers locaux et longues distances.

Utilisateur secondaire : Fabrice Legouez Ricoce, le chauffeur et gérant, qui reçoit les demandes et
les confirme.

## Product Purpose

Permettre de demander une course Volant3ranches VTC depuis un téléphone, avec une estimation de prix
immédiate et transparente, puis de suivre la confirmation et ses réservations.

Modèle de réservation (confirmé) : **demande puis confirmation par Fabrice**, comme sur le site
(confirmation annoncée sous 30 minutes). Pas de paiement en ligne dans la première version : paiement
à bord ou sur facture.

Succès : un voyageur obtient un prix et envoie une demande complète en moins de deux minutes, reçoit la
confirmation, et n'a jamais besoin d'appeler pour se rassurer. Aucune demande ne se perd.

## Positioning

Ce n'est pas une plateforme avec des chauffeurs anonymes : c'est **un chauffeur identifié, Fabrice**,
basé à Viterbe (Tarn), avec deux véhicules électriques précis (Tesla Model 3 Performance et Van
9 places), qui suit le vol du client et l'attend avec un panneau nominatif. L'application réserve
*ce* chauffeur, pas « une voiture ».

## Operating Context

- Réservation à l'avance (« uniquement sur réservation préalable » selon les CGV), disponible 24h/24, 7j/7.
- Zone : Tarn (Albi, Castres, Gaillac, Lavaur), Toulouse, Carcassonne ; longues distances partout en France.
- Transferts : suivi du vol ou du train si le numéro est fourni, accueil avec panneau nominatif, aide aux bagages.
- Aujourd'hui : formulaire web en 2 étapes (module iframe sur le site), téléphone 06 16 53 14 91,
  email contact@volant3ranches-vtc.fr. La demande web part vers `send-reservation.php` (email).

## Capabilities and Constraints

**Tarification (source : module de réservation du site, mars 2026)**

| Offre | Véhicule | Capacité | Jour (6h–22h) | Majoré* | Minimum |
|---|---|---|---|---|---|
| Offre Confort | Tesla Model 3 Performance | 3 passagers, 3 bagages | 1,80 €/km | 2,20 €/km | 20 € |
| Offre Premium | Van 9 places | 8 passagers, 8 bagages | 2,60 €/km | 3,00 €/km | 35 € |

\* Majoré : nuit (22h–6h), samedi, dimanche, jours fériés. Aller-retour = aller × 1,90 (-5 %).
Arrondi aux 0,50 €. Distance réelle par la route (Google Distance Matrix). Le tarif est indicatif ;
suppléments possibles (attente prolongée, arrêt supplémentaire, bagages volumineux).

**Informations demandées à la réservation (CGV art. 4)** : nom, prénom, date et heure, adresse de
départ, destination, nombre de passagers, bagages, téléphone. Plus : email, commentaire (siège bébé,
arrêt intermédiaire), acceptation des CGV, aller simple / aller-retour.

**Règles métier (CGV)**
- Attente gratuite : 10 min standard, 15 min aéroport (après atterrissage), 15 min gare.
- Annulation : gratuite à plus de 24 h ; 50 % entre 24 h et 12 h ; 100 % à moins de 12 h ou absence.
- Interdits à bord : fumer, alcool, substances illicites, objets dangereux.

**Exigences techniques**
- Une demande qui échoue à l'envoi doit être signalée et réessayée, jamais affichée comme envoyée
  (défaut constaté sur le module web actuel).
- Si le calcul de distance échoue, on ne montre pas de prix inventé (le module web actuel affiche une
  distance aléatoire de secours).
- Statistiques : Firebase Analytics (GA4). Consentement requis avant toute mesure (RGPD / CNIL).
  Événements clés à prévoir : estimation demandée, véhicule choisi, demande envoyée, demande
  confirmée, annulation, appel au chauffeur.

**Compte (confirmé)** : première réservation en invité (nom, téléphone, email) ; création de compte
proposée ensuite pour retrouver ses courses.

**Confirmation au client (confirmé)** : notification push + SMS + email récapitulatif.

**Décisions ouvertes**
- Outil de Fabrice pour confirmer les demandes (application chauffeur, back-office web, lien dans
  l'email/SMS).
- Statuts de course au-delà de « en attente / confirmée / terminée / annulée ».
- Incohérence à arbitrer avec Fabrice : le site annonce 30 min d'attente gratuite à l'aéroport,
  les CGV 15 min ; la majoration week-end figure dans le module mais pas dans les CGV.

## Brand Commitments

- Nom : **Volant3ranches VTC**. Logo existant (`transparent_logo_noir.webp`, icône `cropped-6.webp`
  sur le site).
- Noms d'offres : « Offre Confort » (Tesla), « Offre Premium » (Van).
- Voix : vouvoiement, sobre et rassurante ; valeurs affichées : ponctualité, excellence (discrétion,
  confort), confiance (transparence tarifaire, aucun frais caché).
- **Seuls le logo et le nom sont imposés** pour l'application (confirmé). Le style du site (fond
  crème, accent or `#8B6914`, Playfair Display + DM Sans) n'est pas repris : le porteur du projet
  juge la maquette Figma qui en découle « trop IA », à cause des couleurs/du style et des mises en
  page (cartes empilées, écrans interchangeables). Couleurs, polices et composition sont à redéfinir.

## Evidence on Hand

Sur volant3ranches-vtc.fr (wp-content/uploads/2026/02 et 2026/03) :
- Logo et icône : `transparent_logo_noir.webp`, `cropped-6.webp`.
- Photo du chauffeur : `Photo-Fab-1.webp`.
- Photos réelles des véhicules : `tesla_avant`, `tesla_arriere`, `tesla_dos`, `tesla_plaque`,
  `van_face`, `van_avant`, `van_arriere`, `van_coffre`, `Van_interieur_1`, `van_interieur_2`.
- Image d'en-tête : `section-hero-scaled.webp`.
- Trois avis clients affichés sur le site (Marie G., Philippe T., Sophie C.) ; leur source
  (Google, autre) n'est pas vérifiée. Ne pas inventer d'autres avis, notes ou nombres de courses.
- Maquette Figma existante, non encore partagée dans ce dépôt.

## Product Principles

1. **Le prix d'abord, et vrai.** Le client voit un prix calculé sur la distance réelle avant de
   donner ses coordonnées ; jamais de prix approximatif présenté comme exact.
2. **Une demande ne se perd jamais.** Chaque étape d'envoi a un état visible (envoi, envoyé, échec,
   confirmé) ; en cas de doute, le client peut appeler Fabrice en un geste.
3. **Un chauffeur, pas une plateforme.** Fabrice, ses deux véhicules et leurs vraies photos sont
   présents ; l'application ne simule pas une flotte ou une disponibilité qu'elle n'a pas.
4. **Pensée pour l'aéroport.** Numéro de vol ou de train, bagages, heure d'arrivée et attente
   gratuite sont des données de premier rang, pas des options cachées.
5. **Mesurer pour améliorer.** Le parcours de réservation est suivi de bout en bout (GA4), avec
   consentement, pour savoir où les clients abandonnent.

## Accessibility & Inclusion

Clients de tous âges, parfois peu à l'aise avec les applis : respect de la taille de texte système
(Dynamic Type / échelle de police Android), cibles tactiles 44 pt / 48 dp, contrastes WCAG AA,
lecteurs d'écran (VoiceOver, TalkBack). Interface en français ; anglais à prévoir pour les voyageurs
étrangers arrivant à l'aéroport (décision ouverte).
