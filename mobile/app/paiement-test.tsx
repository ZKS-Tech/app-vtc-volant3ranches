import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { euros } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, f, radius, space } from '../src/theme';
import { Bouton, Note } from '../src/ui';
import { useTheme } from '../src/useTheme';

// Mode test : remplace la page de paiement SumUp. Aucune carte, aucun argent réel ; la base suit
// pourtant exactement le vrai circuit (confirmation, notifications, bon de commande).
export default function PaiementTest() {
  const { c, type, s } = useTheme(creerStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { courses, payerAcompteTest } = useStore();
  const course = courses.find((x) => x.id === id);
  const [etat, setEtat] = useState<'envoi' | 'paye' | null>(null);
  const [erreur, setErreur] = useState('');
  if (!course) return null;
  const montant = course.acompteMontant ?? 0;

  const payer = async () => {
    setEtat('envoi'); setErreur('');
    try {
      await payerAcompteTest(course.id);
      setEtat('paye');
      setTimeout(() => router.back(), 1200);
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); setEtat(null); }
  };

  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, gap: space.l }}>
      <Note ton="alerte" icone="flask-outline">Mode test : paiement simulé, aucun argent réel. Remplace la page SumUp tant que le mode test est activé.</Note>
      <View style={s.carte}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[type.label, { color: c.surCuve2 }]}>CARTE DE TEST</Text>
          <Ionicons name="card" size={26} color={c.blanc} />
        </View>
        <Text style={s.numero}>4242 4242 4242 4242</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[type.small, { color: c.surCuve2 }]}>{course.nom.toUpperCase()}</Text>
          <Text style={[type.small, { color: c.surCuve2 }]}>12/30</Text>
        </View>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Text style={type.label}>Acompte à régler</Text>
        <Text style={s.montant}>{euros(montant)}</Text>
        <Text style={type.small}>Volant3ranches VTC · reste {euros(Math.max(0, course.montant - montant))} à bord</Text>
      </View>
      {erreur ? <Note ton="erreur">{erreur}</Note> : null}
      {etat === 'paye' ? (
        <Note ton="feuille" icone="checkmark-circle-outline">Paiement de test accepté. Retour à votre course…</Note>
      ) : (
        <>
          <Bouton titre={`Payer ${euros(montant)} (test)`} icone="lock-closed-outline" chargement={etat === 'envoi'} onPress={payer} />
          <Bouton titre="Abandonner le paiement" variante="texte" onPress={() => router.back()} />
        </>
      )}
    </ScrollView>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  carte: { backgroundColor: c.cuve, borderRadius: radius.l, padding: space.l, gap: space.l, aspectRatio: 1.6 },
  numero: { fontFamily: f.display, fontSize: 26, color: c.blanc, letterSpacing: 2 },
  montant: { fontFamily: f.display, fontSize: 48, color: c.fort },
});
