# Site web de réservation (aperçu visuel)

Site statique, sans étape de build, dans l'univers de l'application (« Bleu pastel du Lauragais »).

```bash
cd web && python3 -m http.server 4173
```

Puis ouvrir http://localhost:4173.

- `index.html`, `styles.css`, `main.js` : la page.
- `main.js` contient trois moteurs : la réservation (mêmes règles de prix que `mobile/src/data.ts`),
  le bain d'indigo (shader repris de `mobile/src/CuveIndigo.tsx`) et la Tesla 3D (maillage procédural).
- `vendor/three.module.min.js` : three.js 0.170, embarqué. `fonts/`, `img/` : polices et photos
  (copies de `mobile/assets/photos`).

Aperçu seulement : l'envoi de la demande n'est pas branché, et l'estimation est calculée à vol
d'oiseau (× 1,25), comme l'application hors ligne. Le prix exact viendra de l'itinéraire routier.
