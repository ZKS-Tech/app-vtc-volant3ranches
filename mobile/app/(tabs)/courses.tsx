import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useStore } from '../../src/store';
import { space } from '../../src/theme';
import { useTheme } from '../../src/useTheme';
import { Bouton, CarteCourse, Segment } from '../../src/ui';

export default function Courses() {
  const { c, type } = useTheme();
  const { courses } = useStore();
  const [onglet, setOnglet] = useState<'avenir' | 'passees'>('avenir');
  const maintenant = new Date();
  const liste = courses
    .filter((x) => {
      const active = (x.statut === 'envoyee' || x.statut === 'confirmee') && x.date >= maintenant;
      return onglet === 'avenir' ? active : !active;
    })
    .sort((a, b) => (onglet === 'avenir' ? +a.date - +b.date : +b.date - +a.date));

  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, gap: space.l }}>
      <Segment
        options={[{ id: 'avenir', titre: 'À venir' }, { id: 'passees', titre: 'Passées' }]}
        valeur={onglet}
        onChange={setOnglet}
      />
      {liste.length ? (
        liste.map((x) => <CarteCourse key={x.id} course={x} onPress={() => router.push(`/course/${x.id}`)} />)
      ) : (
        <View style={{ paddingVertical: space.xxl, gap: space.m }}>
          <Text style={type.h2}>{onglet === 'avenir' ? 'Aucune course prévue' : 'Pas encore de course passée'}</Text>
          <Text style={type.small}>
            {onglet === 'avenir'
              ? 'Réservez votre prochain transfert : Fabrice vous confirme sous 30 minutes.'
              : 'Vos courses terminées apparaîtront ici, avec leur montant.'}
          </Text>
          {onglet === 'avenir' ? <Bouton titre="Réserver une course" onPress={() => router.navigate('/')} /> : null}
        </View>
      )}
      <Text style={type.small}>Prototype : les courses de Claire Martin sont des exemples.</Text>
    </ScrollView>
  );
}
