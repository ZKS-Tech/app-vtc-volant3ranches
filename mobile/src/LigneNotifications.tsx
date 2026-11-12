import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { libelleNotifications, pushPossible, useEtatNotifications } from './notifications';
import { space } from './theme';
import { Bouton } from './ui';
import { useTheme } from './useTheme';
import { t } from './i18n';

// « Notifications » dans les réglages : état réel sur ce téléphone et action utile.
export function LigneNotifications({ sous }: { sous: string }) {
  const { c, type } = useTheme();
  const { etat, agir } = useEtatNotifications();
  const action = etat === 'a-demander' ? t('Activer') : etat === 'refusees' ? t('Réglages') : etat === 'indisponibles' && pushPossible ? t('Réessayer') : null;
  return (
    <View style={styles.ligne}>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{t('Notifications')}</Text>
        <Text style={type.small}>{sous}</Text>
        {etat ? (
          <Text style={[type.small, { marginTop: 2, fontWeight: '600', color: etat === 'actives' ? c.accent : etat === 'refusees' ? c.alerte : c.pierre }]}>
            {t(libelleNotifications(etat))}
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
