# Site de présentation de l'application

Page unique (`index.html`, HTML/CSS/JS sans dépendance) qui présente l'application Volant3ranches VTC,
dans l'esprit de « The Renaissance Edition » de Shopify (hiver 2026), avec les vraies photos du site.

- **Les tableaux** : trois photos plein écran (la flotte dans le Lauragais, la Tesla sur le chemin,
  Fabrice) qui se changent en gravure argentée au défilement (shader WebGL : contours, tailles
  parallèles, paillettes), sous un titre géant et un texte à lettrine.
- **Le papier** : les chapitres arrivent sur un papier bleuté, par un bord déchiré.
- **Le sommaire** fixe en chiffres romains (I à VII), à gauche sur les grands écrans.
- **Deux voix** : Archivo étroit pour les titres sur image, EB Garamond (Garamont, graveur de
  caractères de la Renaissance) en italique pour les titres et le texte.
- **La cuve d'indigo** (shader repris de `mobile/src/CuveIndigo.tsx`) remonte pendant le chapitre
  « La confirmation », comme dans l'application quand Fabrice confirme.
- **Le prix d'abord** : estimateur avec les vrais tarifs (1,80 / 2,20 €/km, 2,60 / 3,00 €/km, minimums,
  aller-retour × 1,90, arrondi à 0,50 €), distance calculée comme dans le prototype.
- **Le trajet** : la carte bascule en 3D sous un ciel étoilé, sur le vrai relief (estompage IGN) ;
  villes à leur position exacte, itinéraires réels par la route (IGN) ; une comète parcourt l'itinéraire choisi dans l'estimateur au rythme du défilement, la
  caméra la suit et zoome, les villes gardent des étiquettes droites, les compteurs (km parcourus,
  temps restant) défilent, une onde marque l'arrivée.
- **L'affiche de Picard** est montrée en entier, comme un tableau accroché : cadre doré, fond flou.
- **Le panneau** : tapez un nom, le panneau se met à jour et se retourne.

Les captures d'écran (`assets/ecrans/`) sont découpées dans `docs/prototype/`. Les photos et le logo
viennent de `mobile/assets/photos/`. Polices : Archivo (variable, axe de largeur) et EB Garamond, auto-hébergées.

## Photos 4K et effets (novembre 2026)

Les originaux sont dans `site/images/` (photos de Fabrice, logo, et quatre photos Pexels). Le site
utilise des copies optimisées dans `assets/photos/` (2560 px pour les tableaux, 2000 px pour les
cartes, vignettes carrées de 640 px pour le garage).

- **Le logo-volant** dans l'en-tête braque quand on fait défiler la page, puis revient droit.
- **La loupe** : quand une photo est devenue gravure, le curseur révèle la vraie photo en couleur
  dans un petit cercle bordé de paillettes.
- **Le téléphone éclaté** (d'après Shopify Editions été 2025) : dans le chapitre I, le téléphone
  arrive en couches séparées (coque, trois tranches d'écran, îlot) avec un liseré indigo, se
  rassemble, puis fait défiler les six écrans du parcours avec une note par étape. Téléphone dessiné
  en CSS (cadre, îlot, boutons, barre d'état à la couleur de l'écran) ; écrans affichés en entier.
- **Plaques d'immatriculation floutées** sur toutes les photos publiées (le flou est appliqué depuis
  les originaux ; les originaux dans `site/images/` restent intacts).
- **Le garage** : une porte sectionnelle en métal (logo peint) se lève au défilement, la lumière
  filtre dessous ; une fois ouverte, les néons du plafond grésillent puis s'allument, et l'enseigne
  néon « Le garage » s'éclaire. Dedans, deux étagères de pochettes (d'après la page d'accueil des
  Shopify Editions) : au survol, la pochette sort ; au clic, la photo s'ouvre en grand (flèches du
  clavier, Échap pour fermer). Les photos du bas se reflètent sur le sol.
- **Les cartes véhicules** s'inclinent sous la souris, avec un reflet.
- Dernière page : un volant Tesla dans la nuit (photo Pexels, Holyson H), sans le présenter comme
  le véhicule de Fabrice.

## Œuvres du domaine public

Récupérées sur Wikimedia Commons, recadrées et converties dans `assets/oeuvres/` :

- Georges Picard, *Femme dans une automobile survolant le Grand Palais*, affiche, 1900. Domaine public.
  Tableau du chapitre « Le trajet ».
- Henri de Toulouse-Lautrec (né à Albi), *L'Automobiliste*, 1896, lithographie, National Gallery of
  Art, Washington. CC0. Fond de papier blanchi pour que le trait se pose sur le papier du site ; il se
  dessine au défilement dans le chapitre des véhicules.

Les crédits figurent en pied de page.

## Données de la carte

`outils/preparer_carte.py` interroge les services de l'IGN (Géoplateforme, Licence Ouverte) :
géocodage des villes, itinéraires réels entre les 15 lieux de l'estimateur (distance, durée, tracé
simplifié, numéros de routes) et estompage du relief, teinté pour la nuit. Le résultat est inséré
dans la page (`<script id="donnees-carte">`) et dans `assets/photos/relief-ign.webp`. L'estimateur
utilise ces distances réelles par la route.

```bash
cd site && python3 outils/preparer_carte.py
```

## Voir le site

```bash
cd site && python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>.

## À vérifier avant une mise en ligne

- « Bientôt sur iOS et Android » : à remplacer par les liens des stores à la publication.
- L'avis de Philippe T. vient du site actuel ; sa source (Google ou autre) reste à confirmer.
- L'estimation utilise la distance à vol d'oiseau × 1,25, comme le prototype (mention affichée).
