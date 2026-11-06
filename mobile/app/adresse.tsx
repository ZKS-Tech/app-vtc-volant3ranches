import { Stack, router, useLocalSearchParams } from 'expo-router';
import { RechercheLieu } from '../src/RechercheLieu';
import { useStore } from '../src/store';

// Choix du départ ou de l'arrivée côté client.
export default function Adresse() {
  const { champ } = useLocalSearchParams<{ champ: 'depart' | 'arrivee' }>();
  const { brouillon, maj } = useStore();
  return (
    <>
      <Stack.Screen options={{ title: champ === 'depart' ? 'Adresse de départ' : "Adresse d'arrivée" }} />
      <RechercheLieu
        exclure={champ === 'depart' ? brouillon.arriveeId : brouillon.departId}
        indication="Toutes les adresses de France. Fabrice intervient surtout dans le Tarn, à Toulouse et à Carcassonne, et assure les longues distances."
        onChoisir={(l) => { maj(champ === 'depart' ? { departId: l.id } : { arriveeId: l.id }); router.back(); }}
      />
    </>
  );
}
