import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useChauffeur } from '../src/chauffeur';
import { RechercheLieu } from '../src/RechercheLieu';

// Choix du départ ou de l'arrivée pour une course saisie par Fabrice.
export default function ChoixLieu() {
  const { cible } = useLocalSearchParams<{ cible: 'depart' | 'arrivee' }>();
  const { saisie, majSaisie } = useChauffeur();
  return (
    <>
      <Stack.Screen options={{ title: cible === 'depart' ? 'Prise en charge' : 'Destination' }} />
      <RechercheLieu
        exclure={cible === 'depart' ? saisie.arriveeId : saisie.departId}
        onChoisir={(l) => { majSaisie(cible === 'depart' ? { departId: l.id } : { arriveeId: l.id }); router.back(); }}
      />
    </>
  );
}
