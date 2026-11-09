import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { memeJour, useChauffeur } from '../../src/chauffeur';
import { LigneMission, Vide } from '../../src/chauffeurUi';
import { dateCourte, euros } from '../../src/data';
import { dansJours } from '../../src/store';
import { Couleurs, f, radius, space } from '../../src/theme';
import { Bouton } from '../../src/ui';
import { useTheme } from '../../src/useTheme';

const jours = Array.from({ length: 21 }, (_, i) => dansJours(i - 1));

// Planning : un jour à la fois, de la veille à trois semaines.
export default function Planning() {
  const { c, type, s } = useTheme(creerStyles);
  const { missions, viderSaisie } = useChauffeur();
  const [jour, setJour] = useState(() => dansJours(0));
  const actives = missions.filter((m) => m.statut === 'confirmee' || m.statut === 'envoyee' || m.statut === 'acompte_attendu' || m.statut === 'terminee');
  const duJour = missions.filter((m) => memeJour(m.date, jour)).sort((a, b) => +a.date - +b.date);
  const total = duJour.filter((m) => m.statut === 'confirmee' || m.statut === 'terminee').reduce((t, m) => t + m.montant, 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.sol }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: space.l, paddingVertical: space.m, gap: space.s }}>
        {jours.map((j, i) => {
          const actif = memeJour(j, jour);
          const n = actives.filter((m) => memeJour(m.date, j)).length;
          const [nomJour, num] = dateCourte(j).split(' ');
          return (
            <Pressable key={i} onPress={() => setJour(j)} style={[s.jour, actif && s.jourActif]} accessibilityState={{ selected: actif }} accessibilityLabel={`${dateCourte(j)}, ${n} course${n > 1 ? 's' : ''}`}>
              <Text style={[type.label, actif && { color: c.surCuve2 }]}>{i === 1 ? 'auj.' : i === 0 ? 'hier' : nomJour}</Text>
              <Text style={[s.jourNum, actif && { color: c.blanc }]}>{num}</Text>
              <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
                {Array.from({ length: Math.min(n, 4) }, (_, k) => <View key={k} style={[s.point, { backgroundColor: actif ? c.surCuve2 : c.accent }]} />)}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.xxl }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginVertical: space.m }}>
          <Text style={[type.h2, { flex: 1 }]}>{dateCourte(jour)[0].toUpperCase() + dateCourte(jour).slice(1)}</Text>
          {duJour.length ? <Text style={type.small}>{duJour.length} course{duJour.length > 1 ? 's' : ''} · {euros(total)}</Text> : null}
        </View>
        {duJour.length ? (
          <View style={s.bloc}>{duJour.map((m) => <LigneMission key={m.id} m={m} />)}</View>
        ) : (
          <Vide icone="calendar-clear-outline" titre="Journée libre" texte="Aucune course prévue ce jour-là." />
        )}
        <Bouton
          titre="Ajouter une course ce jour"
          variante="contour"
          icone="add"
          onPress={() => { viderSaisie({ jour: new Date(jour) }); router.push('/saisie'); }}
          style={{ marginTop: space.l }}
        />
      </ScrollView>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  jour: { width: 58, paddingVertical: space.s, borderRadius: radius.m, backgroundColor: c.surface, alignItems: 'center', borderWidth: 1, borderColor: c.trait, gap: 2 },
  jourActif: { backgroundColor: c.action, borderColor: c.action },
  jourNum: { fontFamily: f.display, fontSize: 22, color: c.encre },
  point: { width: 5, height: 5, borderRadius: 3 },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.s },
});
