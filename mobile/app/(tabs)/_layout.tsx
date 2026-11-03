import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { c } from '../../src/theme';

const icone = (nom: React.ComponentProps<typeof Ionicons>['name']) =>
  ({ color, size }: { color: import("react-native").ColorValue; size: number }) => <Ionicons name={nom} color={color as string} size={size} />;

export default function Onglets() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.indigo,
        tabBarInactiveTintColor: c.pierre,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.trait },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        headerStyle: { backgroundColor: c.sol },
        headerShadowVisible: false,
        headerTitleStyle: { color: c.encre, fontWeight: '700', fontSize: 20 },
        sceneStyle: { backgroundColor: c.sol },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Réserver', headerShown: false, tabBarIcon: icone('car-sport-outline') }} />
      <Tabs.Screen name="courses" options={{ title: 'Mes courses', tabBarIcon: icone('receipt-outline') }} />
      <Tabs.Screen name="decouvrir" options={{ title: 'Volant3ranches', tabBarLabel: 'Découvrir', tabBarIcon: icone('compass-outline') }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: icone('person-circle-outline') }} />
    </Tabs>
  );
}
