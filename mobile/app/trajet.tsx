import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateCourte, estTransfert, lieu, majoration, offres } from '../src/data';
import { dansJours, useStore } from '../src/store';
import { c, f, radius, space, type } from '../src/theme';
import { Bouton, Champ, Compteur, Itineraire, Note, Segment, Titre } from '../src/ui';

const jours = Array.from({ length: 14 }, (_, i) => dansJours(i));

const decaler = (heure: string, minutes: number) => {
  const [h, m] = heure.split(':').map(Number);
  const t = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export default function Trajet() {
  const { brouillon: b, maj } = useStore();
  const insets = useSafeAreaInsets();
  if (!b.departId || !b.arriveeId) return null;
  const depart = lieu(b.departId);
  const arrivee = lieu(b.arriveeId);
  const aeroport = depart.type === 'aeroport' || arrivee.type === 'aeroport';
  const transfert = estTransfert(depart) || estTransfert(arrivee);
  const majo = majoration(b.jour, b.heure);
  const maxPassagers = Math.max(...offres.map((o) => o.passagersMax));

  return (
    <View style={{ flex: 1, backgroundColor: c.sol }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: 120 }}>
        <View style={s.resume}>
          <Itineraire departId={b.departId} arriveeId={b.arriveeId} />
        </View>

        <Titre>Date</Titre>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l }} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s }}>
          {jours.map((j, i) => {
            const actif = j.getTime() === b.jour.getTime();
            const [nomJour, num, mois] = dateCourte(j).split(' ');
            return (
              <Pressable key={i} onPress={() => maj({ jour: j })} style={[s.jour, actif && s.jourActif]} accessibilityState={{ selected: actif }} accessibilityLabel={dateCourte(j)}>
                <Text style={[type.label, actif && { color: c.surCuve2 }]}>{i === 0 ? 'auj.' : i === 1 ? 'demain' : nomJour}</Text>
                <Text style={[s.jourNum, actif && { color: c.surface }]}>{num}</Text>
                <Text style={[type.label, actif && { color: c.surCuve2 }]}>{mois}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Titre>Heure de prise en charge</Titre>
        <View style={s.heure}>
          <Pressable onPress={() => maj({ heure: decaler(b.heure, -15) })} style={s.heureBtn} accessibilityLabel="15 minutes plus tôt">
            <Ionicons name="remove" size={26} color={c.indigo} />
          </Pressable>
          <Text style={s.heureTexte} accessibilityLiveRegion="polite">{b.heure.replace(':', 'h')}</Text>
          <Pressable onPress={() => maj({ heure: decaler(b.heure, 15) })} style={s.heureBtn} accessibilityLabel="15 minutes plus tard">
            <Ionicons name="add" size={26} color={c.indigo} />
          </Pressable>
        </View>
        {majo.length ? (
          <View style={{ marginTop: space.m }}>
            <Note ton="alerte">Tarif majoré : {majo.join(' + ')}.</Note>
          </View>
        ) : (
          <Text style={[type.small, { marginTop: space.s, textAlign: 'center' }]}>Tarif de jour (6h–22h, du lundi au vendredi).</Text>
        )}

        <Titre>Type de trajet</Titre>
        <Segment
          options={[{ id: 'aller', titre: 'Aller simple' }, { id: 'ar', titre: 'Aller-retour' }]}
          valeur={b.allerRetour ? 'ar' : 'aller'}
          onChange={(v) => maj({ allerRetour: v === 'ar' })}
        />
        {b.allerRetour ? <Text style={[type.small, { marginTop: space.s }]}>Aller-retour : -5 % sur le prix des deux trajets.</Text> : null}

        <Titre>Passagers et bagages</Titre>
        <View style={s.bloc}>
          <Compteur libelle="Passagers" icone="people-outline" valeur={b.passagers} min={1} max={maxPassagers} onChange={(n) => maj({ passagers: n, offreId: n > 3 ? 'van' : b.offreId })} />
          <View style={s.trait} />
          <Compteur libelle="Bagages" icone="briefcase-outline" valeur={b.bagages} min={0} max={8} onChange={(n) => maj({ bagages: n, offreId: n > 3 ? 'van' : b.offreId })} />
        </View>

        {transfert ? (
          <>
            <Titre>{aeroport ? 'Votre vol' : 'Votre train'}</Titre>
            <Champ
              libelle={aeroport ? 'Numéro de vol (facultatif)' : 'Numéro de train (facultatif)'}
              placeholder={aeroport ? 'Ex. AF 6127' : 'Ex. TER 873402'}
              autoCapitalize="characters"
              value={b.numero}
              onChangeText={(t) => maj({ numero: t })}
            />
            <Note ton="feuille">
              {aeroport
                ? 'Fabrice suit votre vol : en cas de retard, il ajuste la prise en charge sans frais. Attente gratuite : 15 min après l’atterrissage.'
                : 'Fabrice suit votre train : en cas de retard, il ajuste la prise en charge sans frais. Attente gratuite : 15 min en gare.'}
            </Note>
          </>
        ) : null}
      </ScrollView>
      <View style={[s.pied, { paddingBottom: insets.bottom + space.m }]}>
        <Bouton titre="Voir les prix" icone="arrow-forward" onPress={() => router.push('/offre')} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  resume: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.l },
  jour: {
    width: 64, paddingVertical: space.m, borderRadius: radius.m, backgroundColor: c.surface, alignItems: 'center',
    borderWidth: 1, borderColor: c.trait,
  },
  jourActif: { backgroundColor: c.indigo, borderColor: c.indigo },
  jourNum: { fontFamily: f.display, fontSize: 26, color: c.encre, marginVertical: 2 },
  heure: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface,
    borderRadius: radius.l, padding: space.m,
  },
  heureBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.bain1, alignItems: 'center', justifyContent: 'center' },
  heureTexte: { fontFamily: f.display, fontSize: 56, color: c.cuve, letterSpacing: -0.5 },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l, paddingVertical: space.s },
  trait: { height: StyleSheet.hairlineWidth, backgroundColor: c.trait },
  pied: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.l, paddingTop: space.m,
    backgroundColor: c.sol, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait,
  },
});
