import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateCourte, estTransfert, heureAffichee, lieu, majoration, offres } from '../src/data';
import { periode, retourLe, useAnnonces } from '../src/annonces';
import { dansJours, useStore } from '../src/store';
import { Couleurs, f, radius, space } from '../src/theme';
import { useTheme } from '../src/useTheme';
import { Bouton, Champ, Compteur, Itineraire, Note, Segment, Titre } from '../src/ui';
import { t } from '../src/i18n';

// Deux mois de dates : une absence de Fabrice ne doit pas empêcher de réserver après son retour.
const jours = Array.from({ length: 60 }, (_, i) => dansJours(i));

const decaler = (heure: string, minutes: number) => {
  const [h, m] = heure.split(':').map(Number);
  const x = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

export default function Trajet() {
  const { c, type, s } = useTheme(creerStyles);
  const { brouillon: b, maj } = useStore();
  const insets = useSafeAreaInsets();
  const { indisponibiliteLe } = useAnnonces();
  if (!b.departId || !b.arriveeId) return null;
  const depart = lieu(b.departId);
  const arrivee = lieu(b.arriveeId);
  const aeroport = depart.type === 'aeroport' || arrivee.type === 'aeroport';
  const transfert = estTransfert(depart) || estTransfert(arrivee);
  const majo = majoration(b.jour, b.heure);
  const maxPassagers = Math.max(...offres.map((o) => o.passagersMax));
  const absence = indisponibiliteLe(b.jour);

  return (
    <View style={{ flex: 1, backgroundColor: c.sol }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}>
        <View style={s.resume}>
          <Itineraire departId={b.departId} arriveeId={b.arriveeId} />
        </View>

        <Titre>{t('Date')}</Titre>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l }} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s }}>
          {jours.map((j, i) => {
            const actif = j.getTime() === b.jour.getTime();
            const ferme = !!indisponibiliteLe(j);
            const [nomJour, num, mois] = dateCourte(j).split(' ');
            return (
              <Pressable key={i} onPress={() => maj({ jour: j })} style={[s.jour, ferme && s.jourFerme, actif && s.jourActif, actif && ferme && { backgroundColor: c.pierre, borderColor: c.pierre }]}
                accessibilityState={{ selected: actif }} accessibilityLabel={`${dateCourte(j)}${ferme ? t(', Fabrice absent') : ''}`}>
                <Text style={[type.label, actif && { color: c.surCuve2 }]}>{i === 0 ? t('auj.') : i === 1 ? t('demain') : nomJour}</Text>
                <Text style={[s.jourNum, ferme && s.jourNumFerme, actif && { color: c.blanc }]}>{num}</Text>
                <Text style={[type.label, actif && { color: c.surCuve2 }]}>{ferme ? t('absent') : mois}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {absence ? (
          <View style={{ marginTop: space.m }}>
            <Note ton="alerte" icone="calendar-outline">
              {t('Fabrice est absent {periode}. Choisissez un jour à partir du {retour}, ou appelez-le.', { periode: periode(absence), retour: retourLe(absence) })}
            </Note>
          </View>
        ) : null}

        <Titre>{t('Heure de prise en charge')}</Titre>
        <View style={s.heure}>
          <Pressable onPress={() => maj({ heure: decaler(b.heure, -15) })} style={s.heureBtn} accessibilityLabel={t('15 minutes plus tôt')}>
            <Ionicons name="remove" size={26} color={c.accent} />
          </Pressable>
          <Text style={s.heureTexte} accessibilityLiveRegion="polite">{heureAffichee(b.heure)}</Text>
          <Pressable onPress={() => maj({ heure: decaler(b.heure, 15) })} style={s.heureBtn} accessibilityLabel={t('15 minutes plus tard')}>
            <Ionicons name="add" size={26} color={c.accent} />
          </Pressable>
        </View>
        {majo.length ? (
          <View style={{ marginTop: space.m }}>
            <Note ton="alerte">{t('Tarif majoré : {raisons}.', { raisons: majo.join(' + ') })}</Note>
          </View>
        ) : (
          <Text style={[type.small, { marginTop: space.s, textAlign: 'center' }]}>{t('Tarif de jour (6h–22h, du lundi au vendredi).')}</Text>
        )}

        <Titre>{t('Type de trajet')}</Titre>
        <Segment
          options={[{ id: 'aller', titre: t('Aller simple') }, { id: 'ar', titre: t('Aller-retour') }]}
          valeur={b.allerRetour ? 'ar' : 'aller'}
          onChange={(v) => maj({ allerRetour: v === 'ar' })}
        />
        {b.allerRetour ? <Text style={[type.small, { marginTop: space.s }]}>{t('Aller-retour : -5 % sur le prix des deux trajets.')}</Text> : null}

        <Titre>{t('Passagers et bagages')}</Titre>
        <View style={s.bloc}>
          <Compteur libelle={t('Passagers')} icone="people-outline" valeur={b.passagers} min={1} max={maxPassagers} onChange={(n) => maj({ passagers: n, offreId: n > 3 ? 'van' : b.offreId })} />
          <View style={s.trait} />
          <Compteur libelle={t('Bagages')} icone="briefcase-outline" valeur={b.bagages} min={0} max={8} onChange={(n) => maj({ bagages: n, offreId: n > 3 ? 'van' : b.offreId })} />
        </View>

        {transfert ? (
          <>
            <Titre>{aeroport ? t('Votre vol') : t('Votre train')}</Titre>
            <Champ
              libelle={aeroport ? t('Numéro de vol (facultatif)') : t('Numéro de train (facultatif)')}
              placeholder={aeroport ? t('Ex. AF 6127') : t('Ex. TER 873402')}
              autoCapitalize="characters"
              value={b.numero}
              onChangeText={(v) => maj({ numero: v })}
            />
            <Note ton="feuille">
              {aeroport
                ? t('Fabrice suit votre vol : en cas de retard, il ajuste la prise en charge sans frais. Attente gratuite : 30 min après l’atterrissage.')
                : t('Fabrice suit votre train : en cas de retard, il ajuste la prise en charge sans frais. Attente gratuite : 15 min en gare.')}
            </Note>
          </>
        ) : null}
      </ScrollView>
      <View style={[s.pied, { paddingBottom: insets.bottom + space.m }]}>
        <Bouton titre={absence ? t('Fabrice est absent ce jour-là') : t('Voir les prix')} icone={absence ? undefined : 'arrow-forward'} desactive={!!absence} onPress={() => router.push('/offre')} />
      </View>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  resume: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.l },
  jour: {
    width: 64, paddingVertical: space.m, borderRadius: radius.m, backgroundColor: c.surface, alignItems: 'center',
    borderWidth: 1, borderColor: c.trait,
  },
  jourActif: { backgroundColor: c.action, borderColor: c.action },
  jourFerme: { backgroundColor: c.sol, borderStyle: 'dashed' },
  jourNumFerme: { color: c.pierre, textDecorationLine: 'line-through' },
  jourNum: { fontFamily: f.display, fontSize: 26, color: c.encre, marginVertical: 2 },
  heure: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface,
    borderRadius: radius.l, padding: space.m,
  },
  heureBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.bain1, alignItems: 'center', justifyContent: 'center' },
  heureTexte: { fontFamily: f.display, fontSize: 56, color: c.fort, letterSpacing: -0.5 },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l, paddingVertical: space.s },
  trait: { height: StyleSheet.hairlineWidth, backgroundColor: c.trait },
  pied: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.l, paddingTop: space.m,
    backgroundColor: c.sol, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait,
  },
});
