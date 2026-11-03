import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateCourte, duree, euros, lieu, offre as getOffre, offres, prix, trajet } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, f, radius, space } from '../src/theme';
import { TrajetRelief, couleursRelief } from '../src/TrajetRelief';
import { useTheme } from '../src/useTheme';
import { Bouton } from '../src/ui';

export default function Offre() {
  const { c, type, s, estSombre } = useTheme(creerStyles);
  const { brouillon: b, maj } = useStore();
  const insets = useSafeAreaInsets();
  if (!b.departId || !b.arriveeId) return null;
  const t = trajet(lieu(b.departId), lieu(b.arriveeId));
  const choisie = getOffre(b.offreId);
  const prixChoisi = prix(choisie, t.km, b.jour, b.heure, b.allerRetour);

  return (
    <View style={{ flex: 1, backgroundColor: c.sol }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: 130 }}>
        <View style={s.bandeau}>
          <TrajetRelief departId={b.departId} arriveeId={b.arriveeId} couleurs={couleursRelief(c, estSombre)} hauteur={230} />
          <View style={{ padding: space.l, paddingTop: space.s }}>
          <Text style={s.bandeauRoute} numberOfLines={2}>
            {lieu(b.departId).nom} → {lieu(b.arriveeId).nom}
          </Text>
          <Text style={type.small}>
            {dateCourte(b.jour)} à {b.heure.replace(':', 'h')} · {t.km.toLocaleString('fr-FR')} km · {duree(t.minutes)}
            {b.allerRetour ? ' · aller-retour' : ''}
          </Text>
          </View>
        </View>

        {offres.map((o) => {
          const p = prix(o, t.km, b.jour, b.heure, b.allerRetour);
          const tropPassagers = b.passagers > o.passagersMax;
          const tropBagages = b.bagages > o.bagagesMax;
          const indispo = tropPassagers || tropBagages;
          const actif = !indispo && o.id === b.offreId;
          return (
            <Pressable
              key={o.id}
              disabled={indispo}
              onPress={() => maj({ offreId: o.id })}
              accessibilityRole="radio"
              accessibilityState={{ checked: actif, disabled: indispo }}
              style={[s.offre, actif && s.offreActive, indispo && { opacity: 0.55 }]}
            >
              <Image source={o.photo} style={s.photo} contentFit="cover" accessibilityLabel={o.vehicule} />
              <View style={{ padding: space.l }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.m }}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.h3}>{o.nom}</Text>
                    <Text style={type.small}>{o.vehicule}</Text>
                  </View>
                  <Text style={s.prix}>{euros(p.montant)}</Text>
                </View>
                <View style={s.capacites}>
                  <Capacite icone="people-outline" texte={`${o.passagersMax} passagers`} />
                  <Capacite icone="briefcase-outline" texte={`${o.bagagesMax} bagages`} />
                  <Capacite icone="flash-outline" texte={o.id === 'tesla' ? '100 % électrique' : 'Clim. arrière'} />
                </View>
                {indispo ? (
                  <Text style={[type.small, { color: c.erreur, marginTop: space.m }]}>
                    Jusqu'à {tropPassagers ? `${o.passagersMax} passagers` : `${o.bagagesMax} bagages`} : choisissez l'Offre Premium.
                  </Text>
                ) : (
                  <Text style={[type.small, { marginTop: space.m }]}>
                    {p.auMinimum
                      ? `Course minimum : ${euros(o.minimum)}`
                      : `${t.km.toLocaleString('fr-FR')} km × ${euros(p.prixKm)}${b.allerRetour ? ' × 2 (-5 %)' : ''}`}
                    {p.raisons.length ? ` · tarif majoré (${p.raisons.join(', ')})` : ''}
                  </Text>
                )}
              </View>
              {actif ? (
                <View style={s.coche}>
                  <Ionicons name="checkmark" size={18} color={c.blanc} />
                </View>
              ) : null}
            </Pressable>
          );
        })}

        <Text style={[type.small, { marginTop: space.s }]}>
          Prix indicatif calculé sur la distance, sans frais cachés. Suppléments possibles : attente prolongée, arrêt
          supplémentaire, bagages volumineux. Paiement à bord ou sur facture.
        </Text>
        <Text style={[type.small, { marginTop: space.s, fontStyle: 'italic' }]}>
          Prototype : distance estimée. L'application finale utilisera la distance réelle par la route.
        </Text>
      </ScrollView>
      <View style={[s.pied, { paddingBottom: insets.bottom + space.m }]}>
        <Bouton titre={`Continuer · ${euros(prixChoisi.montant)}`} icone="arrow-forward" onPress={() => router.push('/coordonnees')} />
      </View>
    </View>
  );
}

function Capacite({ icone, texte }: { icone: React.ComponentProps<typeof Ionicons>['name']; texte: string }) {
  const { c, type, s } = useTheme(creerStyles);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name={icone} size={16} color={c.accent} />
      <Text style={[type.small, { color: c.encre }]}>{texte}</Text>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bandeau: { backgroundColor: c.surface, borderRadius: radius.l, overflow: 'hidden', marginBottom: space.l },
  bandeauRoute: { fontFamily: f.displayMedium, fontSize: 22, color: c.fort, marginBottom: 4 },
  offre: {
    backgroundColor: c.surface, borderRadius: radius.l, marginBottom: space.l, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent',
  },
  offreActive: { borderColor: c.accent },
  photo: { width: '100%', height: 150, backgroundColor: c.bain2 },
  prix: { fontFamily: f.display, fontSize: 30, color: c.fort },
  capacites: { flexDirection: 'row', flexWrap: 'wrap', gap: space.l, marginTop: space.m },
  coche: {
    position: 'absolute', top: space.m, right: space.m, width: 30, height: 30, borderRadius: 15, backgroundColor: c.action,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.surface,
  },
  pied: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.l, paddingTop: space.m,
    backgroundColor: c.sol, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait,
  },
});
