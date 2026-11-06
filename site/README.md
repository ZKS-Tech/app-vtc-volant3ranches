# Site de présentation de l'application

Page unique (`index.html`, HTML/CSS/JS sans dépendance) qui présente l'application Volant3ranches VTC,
dans l'esprit des pages « Shopify Editions » : une ouverture plein écran, un sommaire du parcours,
puis un chapitre par fonctionnalité.

- **La cuve d'indigo** (shader WebGL repris de `mobile/src/CuveIndigo.tsx`) est fixée derrière la page :
  l'encre se vide quand on quitte l'ouverture, puis remonte pendant le chapitre « La confirmation »,
  comme dans l'application quand Fabrice confirme.
- **L'ouverture** trace le réseau routier (A68, A61, N126, Tarn, Agout) autour du titre, avec l'exemple
  du prototype : Gare de Castres → Toulouse-Blagnac.
- **Le prix d'abord** : estimateur avec les vrais tarifs (1,80 / 2,20 €/km, 2,60 / 3,00 €/km, minimums,
  aller-retour × 1,90, arrondi à 0,50 €), distance calculée comme dans le prototype.
- **Le trajet** : le plan suit le départ et l'arrivée choisis dans l'estimateur.
- **Le panneau** : tapez un nom, le panneau se met à jour et se retourne.

Les captures d'écran (`assets/ecrans/`) sont découpées dans `docs/prototype/`. Les photos et le logo
viennent de `mobile/assets/photos/`. Police : Archivo (variable, axe de largeur), auto-hébergée.

## Voir le site

```bash
cd site && python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>.

## À vérifier avant une mise en ligne

- « Bientôt sur iOS et Android » : à remplacer par les liens des stores à la publication.
- L'avis de Philippe T. vient du site actuel ; sa source (Google ou autre) reste à confirmer.
- L'estimation utilise la distance à vol d'oiseau × 1,25, comme le prototype (mention affichée).
