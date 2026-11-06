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
- **Le trajet** : le plan suit le départ et l'arrivée choisis dans l'estimateur.
- **Le panneau** : tapez un nom, le panneau se met à jour et se retourne.

Les captures d'écran (`assets/ecrans/`) sont découpées dans `docs/prototype/`. Les photos et le logo
viennent de `mobile/assets/photos/`. Polices : Archivo (variable, axe de largeur) et EB Garamond, auto-hébergées.

## Œuvres du domaine public

Récupérées sur Wikimedia Commons, recadrées et converties dans `assets/oeuvres/` :

- Georges Picard, *Femme dans une automobile survolant le Grand Palais*, affiche, 1900. Domaine public.
  Tableau du chapitre « Le trajet ».
- Henri de Toulouse-Lautrec (né à Albi), *L'Automobiliste*, 1896, lithographie, National Gallery of
  Art, Washington. CC0. Fond de papier blanchi pour que le trait se pose sur le papier du site ; il se
  dessine au défilement dans le chapitre des véhicules.

Les crédits figurent en pied de page.

## Voir le site

```bash
cd site && python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>.

## À vérifier avant une mise en ligne

- « Bientôt sur iOS et Android » : à remplacer par les liens des stores à la publication.
- L'avis de Philippe T. vient du site actuel ; sa source (Google ou autre) reste à confirmer.
- L'estimation utilise la distance à vol d'oiseau × 1,25, comme le prototype (mention affichée).
