import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useChauffeur } from '../../src/chauffeur';
import { DemandeCarte, LigneMission, Vide } from '../../src/chauffeurUi';
import { radius, space } from '../../src/theme';
import { Segment } from '../../src/ui';
import { useTheme } from '../../src/useTheme';

// Demandes envoyées depuis l'appli : à traiter (les plus anciennes d'abord), puis l'historique.
export default function Demandes() {
  const { c } = useTheme();
  const { missions, recharger } = useChauffeur();
  const [onglet, setOnglet] = useState<'attente' | 'traitees'>('attente');
  const attente = missions.filter((m) => m.statut === 'envoyee').sort((a, b) => +new Date(a.envoyee_le) - +new Date(b.envoyee_le));
  const traitees = missions
    .filter((m) => m.source === 'appli' && m.statut !== 'envoyee')
    .sort((a, b) => +new Date(b.confirmee_le ?? b.refusee_le ?? b.annulee_le ?? b.envoyee_le) - +new Date(a.confirmee_le ?? a.refusee_le ?? a.annulee_le ?? a.envoyee_le))
    .slice(0, 40);

  return (
    <ScrollView
      style={{ backgroundColor: c.sol }}
      contentContainerStyle={{ padding: space.l, gap: space.m }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={recharger} tintColor={c.accent} />}
    >
      <Segment
        options={[{ id: 'attente', titre: `À traiter (${attente.length})` }, { id: 'traitees', titre: 'Traitées' }]}
        valeur={onglet}
        onChange={setOnglet}
      />
      {onglet === 'attente' ? (
        attente.length ? attente.map((m) => <DemandeCarte key={m.id} m={m} />) : (
          <Vide icone="checkmark-done-outline" titre="Tout est à jour" texte="Les nouvelles demandes envoyées depuis l'appli apparaîtront ici." />
        )
      ) : traitees.length ? (
        <View style={{ backgroundColor: c.surface, borderRadius: radius.l, padding: space.s }}>
          {traitees.map((m) => <LigneMission key={m.id} m={m} avecDate />)}
        </View>
      ) : (
        <Vide icone="time-outline" titre="Pas encore d'historique" texte="Les demandes confirmées ou refusées s'afficheront ici." />
      )}
    </ScrollView>
  );
}
