import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useChauffeur } from '../../src/chauffeur';
import { useTheme } from '../../src/useTheme';

const icone = (nom: React.ComponentProps<typeof Ionicons>['name']) =>
  ({ color, size }: { color: import('react-native').ColorValue; size: number }) => <Ionicons name={nom} color={color as string} size={size} />;

// Espace de Fabrice : cinq onglets, pensés pour un usage rapide entre deux courses.
export default function OngletsChauffeur() {
  const { c } = useTheme();
  const { missions } = useChauffeur();
  const aTraiter = missions.filter((m) => m.statut === 'envoyee').length;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.pierre,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.trait },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: c.sol },
        headerShadowVisible: false,
        headerTitleStyle: { color: c.encre, fontWeight: '700', fontSize: 20 },
        sceneStyle: { backgroundColor: c.sol },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Tableau de bord', tabBarLabel: 'Tableau', headerShown: false, tabBarIcon: icone('speedometer-outline') }} />
      <Tabs.Screen
        name="demandes"
        options={{
          title: 'Demandes', tabBarIcon: icone('notifications-outline'),
          tabBarBadge: aTraiter || undefined, tabBarBadgeStyle: { backgroundColor: c.alerte, color: c.blanc, fontSize: 11 },
        }}
      />
      <Tabs.Screen name="planning" options={{ title: 'Planning', tabBarIcon: icone('calendar-outline') }} />
      <Tabs.Screen name="clients" options={{ title: 'Clients', tabBarIcon: icone('people-outline') }} />
      <Tabs.Screen name="gestion" options={{ title: 'Gestion', tabBarIcon: icone('options-outline') }} />
    </Tabs>
  );
}
