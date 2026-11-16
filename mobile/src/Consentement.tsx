import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useConsentement } from './stats';
import { useStore } from './store';
import { Couleurs, radius, space } from './theme';
import { Bouton } from './ui';
import { useTheme } from './useTheme';
import { t } from './i18n';

// Demande de consentement aux statistiques, posée une seule fois sur l'accueil. Refuser est aussi
// simple qu'accepter (recommandation de la CNIL) ; le choix se modifie dans Profil.
export function DemandeConsentement() {
  const { c, type, s } = useTheme(creerStyles);
  const { serveur } = useStore();
  const { consentement, pret, definir } = useConsentement();
  if (!pret || consentement !== null || serveur.etat !== 'connecte' || Platform.OS === 'web') return null;
  return (
    <View style={s.carte} accessibilityRole="summary">
      <View style={{ flexDirection: 'row', gap: space.m }}>
        <Ionicons name="bar-chart-outline" size={22} color={c.accent} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '700' }]}>{t("Nous aider à améliorer l'appli ?")}</Text>
          <Text style={[type.small, { marginTop: 4 }]}>
            {t("Statistiques d'utilisation anonymes (Google Analytics) : quels écrans servent, où le parcours bloque. Ni votre nom, ni votre téléphone, ni vos adresses ne sont transmis. Modifiable à tout moment dans Profil.")}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.m }}>
        <Bouton titre={t('Refuser')} variante="contour" onPress={() => definir('non')} style={{ flex: 1, minHeight: 44 }} />
        <Bouton titre={t('Accepter')} onPress={() => definir('oui')} style={{ flex: 1, minHeight: 44 }} />
      </View>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  carte: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.l, borderWidth: 1, borderColor: c.bain2 },
});
