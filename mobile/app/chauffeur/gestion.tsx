import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useChauffeur } from '../../src/chauffeur';
import { emailConnecte } from '../../src/serveur';
import { useStore } from '../../src/store';
import { Couleurs, radius, space } from '../../src/theme';
import { Bouton, IconName, Segment, Titre } from '../../src/ui';
import { useTheme } from '../../src/useTheme';

export default function Gestion() {
  const { c, type, s } = useTheme(creerStyles);
  const { apparence, setApparence, deconnecterChauffeur } = useStore();
  const { demo } = useChauffeur();
  const [email, setEmail] = useState<string | null>(null);
  const [sortie, setSortie] = useState(false);
  useEffect(() => { if (!demo) emailConnecte().then(setEmail); }, [demo]);

  const Lien = ({ icone, titre, sous, vers, trait }: { icone: IconName; titre: string; sous: string; vers: '/chiffre-affaires' | '/tarifs'; trait?: boolean }) => (
    <Pressable onPress={() => router.push(vers)} style={({ pressed }) => [s.lien, trait && s.trait, pressed && { opacity: 0.6 }]} accessibilityRole="button">
      <Ionicons name={icone} size={22} color={c.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontWeight: '600' }]}>{titre}</Text>
        <Text style={type.small}>{sous}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.pierre} />
    </Pressable>
  );

  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }}>
      <View style={s.bloc}>
        <Lien icone="stats-chart-outline" titre="Chiffre d'affaires" sous="Recettes, courses, kilomètres, annulations" vers="/chiffre-affaires" />
        <Lien icone="pricetags-outline" titre="Tarifs et jours fériés" sous="Prix au km, minimums, nuit, week-end, attentes" vers="/tarifs" trait />
      </View>

      <Titre>Apparence</Titre>
      <Segment
        options={[{ id: 'auto', titre: 'Automatique' }, { id: 'clair', titre: 'Clair' }, { id: 'sombre', titre: 'Sombre' }]}
        valeur={apparence}
        onChange={setApparence}
      />

      <Titre>Compte</Titre>
      <View style={[s.bloc, { padding: space.l, gap: space.m }]}>
        <Text style={type.body}>{demo ? 'Démonstration (sans compte)' : email ?? 'Compte chauffeur'}</Text>
        <Text style={type.small}>
          {demo ? 'Les données sont fictives et rien n’est enregistré.' : 'Ce téléphone reste connecté à l’espace chauffeur jusqu’à la déconnexion.'}
        </Text>
        <Bouton
          titre={demo ? 'Quitter la démonstration' : 'Se déconnecter'}
          variante="contour"
          icone="log-out-outline"
          chargement={sortie}
          onPress={async () => { setSortie(true); try { await deconnecterChauffeur(); } finally { setSortie(false); } }}
        />
      </View>
    </ScrollView>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  lien: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.l, minHeight: 64 },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait },
});
