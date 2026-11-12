import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useStore } from '../../src/store';
import { space } from '../../src/theme';
import { useTheme } from '../../src/useTheme';
import { Bouton, CarteCourse, Segment } from '../../src/ui';
import { t } from '../../src/i18n';

export default function Courses() {
  const { c, type } = useTheme();
  const { courses, rafraichir } = useStore();
  const [actualisation, setActualisation] = useState(false);
  const [onglet, setOnglet] = useState<'avenir' | 'passees'>('avenir');
  const maintenant = new Date();
  const liste = courses
    .filter((x) => {
      const active = (x.statut === 'envoyee' || x.statut === 'acompte_attendu' || x.statut === 'confirmee') && x.date >= maintenant;
      return onglet === 'avenir' ? active : !active;
    })
    .sort((a, b) => (onglet === 'avenir' ? +a.date - +b.date : +b.date - +a.date));

  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, gap: space.l }}
      refreshControl={<RefreshControl refreshing={actualisation} tintColor={c.accent}
        onRefresh={async () => { setActualisation(true); try { await rafraichir(); } finally { setActualisation(false); } }} />}>
      <Segment
        options={[{ id: 'avenir', titre: t('À venir') }, { id: 'passees', titre: t('Passées') }]}
        valeur={onglet}
        onChange={setOnglet}
      />
      {liste.length ? (
        liste.map((x) => <CarteCourse key={x.id} course={x} onPress={() => router.push(`/course/${x.id}`)} />)
      ) : (
        <View style={{ paddingVertical: space.xxl, gap: space.m }}>
          <Text style={type.h2}>{onglet === 'avenir' ? t('Aucune course prévue') : t('Pas encore de course passée')}</Text>
          <Text style={type.small}>
            {onglet === 'avenir'
              ? t('Réservez votre prochain transfert : Fabrice vous confirme sous 30 minutes.')
              : t('Vos courses terminées apparaîtront ici, avec leur montant.')}
          </Text>
          {onglet === 'avenir' ? <Bouton titre={t('Réserver une course')} onPress={() => router.navigate('/')} /> : null}
        </View>
      )}
    </ScrollView>
  );
}
