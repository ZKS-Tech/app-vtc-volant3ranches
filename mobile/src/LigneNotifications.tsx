import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { libelleNotifications, useEtatNotifications } from './notifications';
import { space } from './theme';
import { Bouton } from './ui';
import { useTheme } from './useTheme';

// « Notifications » dans les réglages : état réel sur ce téléphone et action utile.
export function LigneNotifications({ sous }: { sous: string }) {
  const { c, type } = useTheme();
  const { etat, agir } = useEtatNotifications();
  const action = etat === 'a-demander' ? 'Activer' : etat === 'refusees' ? 'Réglages' : null;
  return (
    <View style={styles.ligne}>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>Notifications</Text>
        <Text style={type.small}>{sous}</Text>
        {etat ? (
          <Text style={[type.small, { marginTop: 2, fontWeight: '600', color: etat === 'actives' ? c.accent : etat === 'refusees' ? c.alerte : c.pierre }]}>
            {libelleNotifications[etat]}
          </Text>
        ) : null}
      </View>
      {etat === null ? <ActivityIndicator color={c.accent} /> : action ? (
        <Bouton titre={action} variante="texte" onPress={agir} style={{ minHeight: 44 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: 60 },
});
