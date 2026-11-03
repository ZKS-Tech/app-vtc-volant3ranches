# Volant3ranches — prototype mobile (Expo)

Prototype de l'application de réservation, style « Bleu pastel du Lauragais »
(voir `../docs/brief-reservation.md`). Données de démonstration, aucun envoi réel.

## Lancer sur son téléphone

1. Installer l'application **Expo Go** (App Store / Play Store).
2. Sur l'ordinateur (Node 20+) :

```bash
cd mobile
npm install
npx expo start
```

3. Scanner le QR code affiché avec l'appareil photo (iPhone) ou Expo Go (Android).

Version navigateur : `npx expo start --web`.

## À savoir

- Lieux limités à une sélection (Tarn, Toulouse, Carcassonne) et distance estimée :
  l'application finale utilisera Google pour les adresses et la distance par la route.
- Profil › Prototype › « Simuler un échec d'envoi » montre l'écran d'erreur.
- Sur l'écran « Demande envoyée », « Simuler la confirmation de Fabrice » montre le
  changement de teinte de la course.
- Photos et textes repris de volant3ranches-vtc.fr.
