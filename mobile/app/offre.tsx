import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateCourte, duree, euros, heureAffichee, kilometres, lieu, offre as getOffre, offres, prix } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, f, radius, space } from '../src/theme';
import { CartePlan } from '../src/CartePlan';
import { useTheme } from '../src/useTheme';
import { Bouton, Note, appelerFabrice } from '../src/ui';
import { useItineraire } from '../src/geo';
import { evenement } from '../src/stats';
import { t } from '../src/i18n';

export default function Offre() {
  const { c, type, s } = useTheme(creerStyles);
  const { brouillon: b, maj } = useStore();
  const insets = useSafeAreaInsets();
  // Distance et durée réelles par la route (IGN). Pas de prix tant qu'elles ne sont pas connues.
  const it = useItineraire(b.departId ? lieu(b.departId) : undefined, b.arriveeId ? lieu(b.arriveeId) : undefined);
  const pret = it.etat === 'ok';
  const dist = pret ? { km: it.itineraire.km, minutes: it.itineraire.minutes } : { km: 0, minutes: 0 };
  const choisie = getOffre(b.offreId);
  const prixChoisi = prix(choisie, dist.km, b.jour, b.heure, b.allerRetour);
  // Les hooks restent avant tout « return » anticipé : React exige qu'ils soient appelés à chaque affichage.
  useEffect(() => {
    if (pret && b.departId && b.arriveeId) evenement('estimation_affichee', { offre: choisie.id, km: dist.km, prix: prixChoisi.montant, majoration: prixChoisi.raisons.join(', ') || 'aucune', aller_retour: b.allerRetour, passagers: b.passagers });
  }, [pret, dist.km]);
  if (!b.departId || !b.arriveeId) return null;

  return (
    <View style={{ flex: 1, backgroundColor: c.sol }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: 130 }}>
        <View style={s.bandeau}>
          {pret ? (
            <CartePlan departId={b.departId} arriveeId={b.arriveeId} c={c} hauteur={210} itineraireReel={it.itineraire.coords} />
          ) : (
            <View style={[s.attente, { height: 210 }]}>
              {it.etat === 'erreur' ? <Ionicons name="cloud-offline-outline" size={30} color={c.pierre} /> : <ActivityIndicator color={c.accent} />}
              <Text style={type.small}>{it.etat === 'erreur' ? t('Itinéraire indisponible') : t('Calcul de l’itinéraire par la route…')}</Text>
            </View>
          )}
          <View style={{ padding: space.l, paddingTop: space.s }}>
          <Text style={s.bandeauRoute} numberOfLines={2}>
            {t(lieu(b.departId).nom)} → {t(lieu(b.arriveeId).nom)}
          </Text>
          <Text style={type.small}>
            {dateCourte(b.jour)} {t('à')} {heureAffichee(b.heure)}{pret ? ` · ${kilometres(dist.km)} · ${duree(dist.minutes)}` : ''}
            {b.allerRetour ? ` · ${t('aller-retour')}` : ''}
          </Text>
          </View>
        </View>

        {it.etat === 'erreur' ? (
          <View style={{ gap: space.s, marginBottom: space.l }}>
            <Note ton="erreur">
              {t("Le calcul de l'itinéraire n'a pas abouti. Sans la distance réelle, nous ne pouvons pas vous donner de prix : réessayez dans un instant, ou appelez Fabrice.")}
            </Note>
            <Text style={[type.small, { fontSize: 11 }]} selectable>{t('Détail technique :')} {it.message}</Text>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Bouton titre={t('Réessayer')} variante="contour" icone="refresh" onPress={it.reessayer} style={{ flex: 1 }} />
              <Bouton titre={t('Appeler')} variante="contour" icone="call-outline" onPress={appelerFabrice} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
        {offres.map((o) => {
          const p = prix(o, dist.km, b.jour, b.heure, b.allerRetour);
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
              <Image source={o.photo} style={s.photo} contentFit="cover" accessibilityLabel={t(o.vehicule)} />
              <View style={{ padding: space.l }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.m }}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.h3}>{t(o.nom)}</Text>
                    <Text style={type.small}>{t(o.vehicule)}</Text>
                  </View>
                  <Text style={[s.prix, !pret && { color: c.bain3 }]}>{pret ? euros(p.montant) : '— €'}</Text>
                </View>
                <View style={s.capacites}>
                  <Capacite icone="people-outline" texte={t('{n} passagers', { n: o.passagersMax })} />
                  <Capacite icone="briefcase-outline" texte={t('{n} bagages', { n: o.bagagesMax })} />
                  <Capacite icone="flash-outline" texte={o.id === 'tesla' ? t('100 % électrique') : t('Clim. arrière')} />
                </View>
                {indispo ? (
                  <Text style={[type.small, { color: c.erreur, marginTop: space.m }]}>
                    {t("Jusqu'à {capacite} : choisissez l'Offre Premium.", { capacite: tropPassagers ? t('{n} passagers', { n: o.passagersMax }) : t('{n} bagages', { n: o.bagagesMax }) })}
                  </Text>
                ) : !pret ? null : (
                  <Text style={[type.small, { marginTop: space.m }]}>
                    {p.auMinimum
                      ? t('Course minimum : {prix}', { prix: euros(o.minimum) })
                      : `${kilometres(dist.km)} × ${euros(p.prixKm)}${b.allerRetour ? ' × 2 (-5 %)' : ''}`}
                    {p.raisons.length ? ` · ${t('tarif majoré ({raisons})', { raisons: p.raisons.join(', ') })}` : ''}
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
          {t('Prix calculé sur la distance réelle par la route (IGN), sans frais cachés. Suppléments possibles : attente prolongée, arrêt supplémentaire, bagages volumineux. Paiement à bord ou sur facture.')}
        </Text>
      </ScrollView>
      <View style={[s.pied, { paddingBottom: insets.bottom + space.m }]}>
        <Bouton
          titre={pret ? `${t('Continuer')} · ${euros(prixChoisi.montant)}` : it.etat === 'erreur' ? t('Itinéraire indisponible') : t('Calcul du prix…')}
          icone={pret ? 'arrow-forward' : undefined}
          desactive={!pret}
          onPress={() => { evenement('offre_choisie', { offre: choisie.id, prix: prixChoisi.montant, km: dist.km }); router.push('/coordonnees'); }}
        />
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
  attente: { alignItems: 'center', justifyContent: 'center', gap: space.s, backgroundColor: c.bain1 },
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
