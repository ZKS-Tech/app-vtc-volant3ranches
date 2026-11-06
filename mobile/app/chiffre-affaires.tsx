import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { bilan, libelleSource, recette, useChauffeur } from '../src/chauffeur';
import { Chiffre } from '../src/chauffeurUi';
import { euros, offre } from '../src/data';
import { Couleurs, radius, space } from '../src/theme';
import { Ligne, Segment, Titre } from '../src/ui';
import { useTheme } from '../src/useTheme';

type Periode = 'semaine' | 'mois' | 'annee';
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

// Chiffre d'affaires : encaissé (courses terminées et frais d'annulation), à venir, et sa répartition.
export default function ChiffreAffaires() {
  const { c, type, s } = useTheme(creerStyles);
  const { missions } = useChauffeur();
  const [periode, setPeriode] = useState<Periode>('mois');

  const { debut, fin, barres, titre } = useMemo(() => {
    const n = new Date();
    if (periode === 'semaine') {
      const d = new Date(n); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const f = new Date(d); f.setDate(f.getDate() + 7);
      const barres = Array.from({ length: 7 }, (_, i) => { const a = new Date(d); a.setDate(a.getDate() + i); const b = new Date(a); b.setDate(b.getDate() + 1); return { libelle: JOURS[a.getDay()], a, b }; });
      return { debut: d, fin: f, barres, titre: 'Cette semaine' };
    }
    if (periode === 'mois') {
      const d = new Date(n.getFullYear(), n.getMonth(), 1), f = new Date(n.getFullYear(), n.getMonth() + 1, 1);
      const nbJours = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
      const barres = Array.from({ length: nbJours }, (_, i) => ({ libelle: (i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '', a: new Date(n.getFullYear(), n.getMonth(), i + 1), b: new Date(n.getFullYear(), n.getMonth(), i + 2) }));
      return { debut: d, fin: f, barres, titre: `${MOIS[n.getMonth()]} ${n.getFullYear()}` };
    }
    const d = new Date(n.getFullYear(), 0, 1), f = new Date(n.getFullYear() + 1, 0, 1);
    const barres = Array.from({ length: 12 }, (_, i) => ({ libelle: MOIS[i].slice(0, 1).toUpperCase(), a: new Date(n.getFullYear(), i, 1), b: new Date(n.getFullYear(), i + 1, 1) }));
    return { debut: d, fin: f, barres, titre: String(n.getFullYear()) };
  }, [periode]);

  const b = bilan(missions, debut, fin);
  const valeurs = barres.map((x) => missions.filter((m) => m.date >= x.a && m.date < x.b).reduce((t, m) => t + recette(m), 0));
  const max = Math.max(1, ...valeurs);
  const totalOffres = b.parOffre.reduce((t, x) => t + x.ca, 0);
  const totalSources = b.parSource.reduce((t, x) => t + x.n, 0);

  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }}>
      <Segment options={[{ id: 'semaine', titre: 'Semaine' }, { id: 'mois', titre: 'Mois' }, { id: 'annee', titre: 'Année' }]} valeur={periode} onChange={setPeriode} />
      <Text style={[type.h2, { marginTop: space.xl, textTransform: 'capitalize' }]}>{titre}</Text>

      <View style={[s.bloc, { flexDirection: 'row', paddingVertical: space.l, gap: space.m, marginTop: space.m }]}>
        <Chiffre valeur={euros(b.ca).replace(',00', '')} libelle="encaissé" fort />
        <Chiffre valeur={euros(b.aVenir).replace(',00', '')} libelle="à venir (confirmé)" />
      </View>

      <View style={[s.bloc, { paddingVertical: space.l, marginTop: space.m }]} accessible accessibilityLabel={`Recettes par ${periode === 'annee' ? 'mois' : 'jour'}`}>
        <View style={s.graphe}>
          {valeurs.map((v, i) => (
            <View key={i} style={s.colonne}>
              <View style={[s.barre, { height: `${(v / max) * 100}%`, backgroundColor: barres[i].a <= new Date() ? c.action : c.bain2 }]} />
            </View>
          ))}
        </View>
        <View style={{ height: 14, marginTop: 6 }}>
          {barres.map((x, k) => x.libelle ? (
            <Text key={k} style={[type.label, { position: 'absolute', left: `${((k + 0.5) / barres.length) * 100}%`, width: 30, marginLeft: -15, fontSize: 10, textAlign: 'center' }]}>{x.libelle}</Text>
          ) : null)}
        </View>
        <Text style={[type.small, { marginTop: space.s }]}>Plus haut : {euros(max === 1 && !valeurs.some(Boolean) ? 0 : max)}</Text>
      </View>

      <Titre>Activité</Titre>
      <View style={s.bloc}>
        <Ligne libelle="Courses effectuées" valeur={String(b.courses)} />
        <Ligne libelle="Kilomètres" valeur={`${Math.round(b.km).toLocaleString('fr-FR')} km`} />
        <Ligne libelle="Prix moyen d'une course" valeur={b.courses ? euros(b.panier) : '—'} />
        <Ligne libelle="Annulations" valeur={`${b.annulees}${b.frais ? ` · ${euros(b.frais)} de frais` : ''}`} />
      </View>

      <Titre>Par véhicule</Titre>
      <View style={[s.bloc, { paddingVertical: space.m, gap: space.m }]}>
        {b.parOffre.map((x) => (
          <Repartition key={x.offre} libelle={offre(x.offre).vehicule} valeur={euros(x.ca)} part={totalOffres ? x.ca / totalOffres : 0} s={s} c={c} type={type} />
        ))}
      </View>

      <Titre>Origine des réservations</Titre>
      <View style={[s.bloc, { paddingVertical: space.m, gap: space.m }]}>
        {b.parSource.map((x) => (
          <Repartition key={x.source} libelle={libelleSource[x.source]} valeur={`${x.n}`} part={totalSources ? x.n / totalSources : 0} s={s} c={c} type={type} />
        ))}
      </View>
      <Text style={[type.small, { marginTop: space.m }]}>Encaissé = courses terminées + frais d’annulation. Montants TTC.</Text>
    </ScrollView>
  );
}

function Repartition({ libelle, valeur, part, s, c, type }: { libelle: string; valeur: string; part: number; s: ReturnType<typeof creerStyles>; c: Couleurs; type: ReturnType<typeof useTheme>['type'] }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={type.body}>{libelle}</Text>
        <Text style={[type.body, { fontWeight: '700' }]}>{valeur} <Text style={type.small}>({Math.round(part * 100)} %)</Text></Text>
      </View>
      <View style={[s.jauge, { backgroundColor: c.bain1 }]}><View style={{ width: `${part * 100}%`, height: '100%', borderRadius: 4, backgroundColor: c.action }} /></View>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  graphe: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 },
  colonne: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barre: { borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 1 },
  jauge: { height: 8, borderRadius: 4, overflow: 'hidden' },
});
