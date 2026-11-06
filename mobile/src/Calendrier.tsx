import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isoJour } from './data';
import { Couleurs, radius, space } from './theme';
import { useTheme } from './useTheme';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Choix d'une période : un premier toucher fixe le début, le second la fin (un seul jour si on
// touche deux fois le même). Toucher à nouveau recommence. Dates « AAAA-MM-JJ ».
export function CalendrierPeriode({ debut, fin, onChange, marques = [] }: {
  debut: string | null; fin: string | null; onChange: (debut: string | null, fin: string | null) => void;
  /** Jours signalés d'un point (courses déjà prévues, par exemple). */
  marques?: string[];
}) {
  const { c, type, s } = useTheme(creerStyles);
  const aujourdhui = isoJour(new Date());
  const [mois, setMois] = useState(() => { const d = debut ? new Date(`${debut}T12:00:00`) : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [enCours, setEnCours] = useState(false); // début choisi, fin attendue

  const premier = (mois.getDay() + 6) % 7; // lundi = 0
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const cases: (string | null)[] = [
    ...Array.from({ length: premier }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => isoJour(new Date(mois.getFullYear(), mois.getMonth(), i + 1))),
  ];
  while (cases.length % 7) cases.push(null);
  const decaler = (n: number) => setMois((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const moisPasse = mois.getFullYear() * 12 + mois.getMonth() <= new Date().getFullYear() * 12 + new Date().getMonth();

  const toucher = (j: string) => {
    if (!enCours || !debut || j < debut) { onChange(j, j); setEnCours(true); return; }
    onChange(debut, j); setEnCours(false);
  };

  return (
    <View style={s.cadre}>
      <View style={s.entete}>
        <Pressable onPress={() => decaler(-1)} disabled={moisPasse} style={[s.fleche, moisPasse && { opacity: 0.3 }]} accessibilityLabel="Mois précédent" hitSlop={6}>
          <Ionicons name="chevron-back" size={22} color={c.accent} />
        </Pressable>
        <Text style={[type.h3, { flex: 1, textAlign: 'center' }]} accessibilityLiveRegion="polite">{MOIS[mois.getMonth()]} {mois.getFullYear()}</Text>
        <Pressable onPress={() => decaler(1)} style={s.fleche} accessibilityLabel="Mois suivant" hitSlop={6}>
          <Ionicons name="chevron-forward" size={22} color={c.accent} />
        </Pressable>
      </View>
      <View style={s.ligne}>
        {JOURS.map((j, i) => <Text key={i} style={[type.label, s.cellule, { textAlign: 'center' }]}>{j}</Text>)}
      </View>
      {Array.from({ length: cases.length / 7 }, (_, l) => (
        <View key={l} style={s.ligne}>
          {cases.slice(l * 7, l * 7 + 7).map((j, i) => {
            if (!j) return <View key={i} style={s.cellule} />;
            const passe = j < aujourdhui;
            const dedans = !!debut && !!fin && j >= debut && j <= fin;
            const borne = j === debut || j === fin;
            return (
              <Pressable
                key={i}
                disabled={passe}
                onPress={() => toucher(j)}
                style={[s.cellule, dedans && { backgroundColor: c.bain2 }, (j === debut || i === 0) && s.gauche, (j === fin || i === 6) && s.droite]}
                accessibilityRole="button"
                accessibilityState={{ selected: dedans, disabled: passe }}
                accessibilityLabel={`${Number(j.slice(8))} ${MOIS[mois.getMonth()]}`}
              >
                <View style={[s.jour, borne && { backgroundColor: c.action }]}>
                  <Text style={[type.body, { color: borne ? c.blanc : passe ? c.trait : c.encre, fontWeight: j === aujourdhui || borne ? '700' : '400' }]}>{Number(j.slice(8))}</Text>
                  {marques.includes(j) ? <View style={[s.point, { backgroundColor: borne ? c.blanc : c.alerte }]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={[type.small, { marginTop: space.s, textAlign: 'center' }]}>
        {enCours ? 'Touchez le dernier jour (ou le même jour pour une seule journée).' : 'Touchez le premier jour, puis le dernier.'}
      </Text>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  cadre: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.m },
  entete: { flexDirection: 'row', alignItems: 'center', marginBottom: space.s },
  fleche: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ligne: { flexDirection: 'row' },
  cellule: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  gauche: { borderTopLeftRadius: 22, borderBottomLeftRadius: 22 },
  droite: { borderTopRightRadius: 22, borderBottomRightRadius: 22 },
  jour: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  point: { position: 'absolute', bottom: 4, width: 5, height: 5, borderRadius: 3 },
});
