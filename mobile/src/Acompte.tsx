import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { euros, regles } from './data';
import { Course, useStore } from './store';
import { Couleurs, f, radius, space } from './theme';
import { Bouton, Note, heureCourte } from './ui';
import { useTheme } from './useTheme';

function useMinute() {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setMaintenant(new Date()), 15000); return () => clearInterval(t); }, []);
  return maintenant;
}

// Acompte à régler : montant, heure limite et accès à la page de paiement sécurisée SumUp.
// Une fois payé, la base confirme la course et l'écran passe à « Confirmée » en temps réel.
export function BlocAcompte({ course, surFonce }: { course: Course; surFonce?: boolean }) {
  const { c, type, s } = useTheme(creerStyles);
  const { payerAcompte } = useStore();
  const maintenant = useMinute();
  const [etat, setEtat] = useState<'ouverture' | 'ouvert' | null>(null);
  const [erreur, setErreur] = useState('');
  const montant = course.acompteMontant ?? 0;
  const reste = Math.max(0, course.montant - montant);
  const minutes = course.acompteLimite ? Math.ceil((course.acompteLimite.getTime() - maintenant.getTime()) / 60000) : null;
  const depasse = minutes !== null && minutes <= 0;

  const payer = async () => {
    // Mode test : écran de paiement simulé dans l'appli au lieu de la page SumUp.
    if (regles.paiementsTest) { router.push({ pathname: '/paiement-test', params: { id: course.id } }); return; }
    setEtat('ouverture'); setErreur('');
    try {
      const url = await payerAcompte(course.id);
      if (url) { await Linking.openURL(url); setEtat('ouvert'); } else setEtat(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setEtat(null);
    }
  };

  return (
    <View style={[s.carte, surFonce && { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
        <Text style={[type.label, { flex: 1, color: surFonce ? c.surCuve2 : c.pierre }]}>Acompte pour confirmer</Text>
        <Text style={[s.montant, { color: surFonce ? c.blanc : c.fort }]}>{euros(montant)}</Text>
      </View>
      <Text style={[type.small, { color: surFonce ? c.surCuve2 : c.encre, marginTop: space.xs }]}>
        {depasse
          ? 'Le délai est dépassé : la demande va expirer. Refaites une demande ou appelez Fabrice.'
          : `À régler avant ${course.acompteLimite ? heureCourte(course.acompteLimite) : 'le départ'}${minutes !== null && minutes <= 60 ? ` (reste ${minutes} min)` : ''}. Le reste, ${euros(reste)}, se règle à bord par carte ou en espèces.`}
      </Text>
      {erreur ? <View style={{ marginTop: space.m }}><Note ton="erreur">{erreur}</Note></View> : null}
      {!depasse ? (
        <Bouton
          titre={etat === 'ouvert' ? 'Rouvrir la page de paiement' : `Payer ${euros(montant)}`}
          icone="card-outline"
          chargement={etat === 'ouverture'}
          variante={surFonce ? 'clair' : 'plein'}
          onPress={payer}
          style={{ marginTop: space.l }}
        />
      ) : null}
      {etat === 'ouvert' ? (
        <Text style={[type.small, { marginTop: space.s, color: surFonce ? c.surCuve2 : c.pierre }]}>
          Une fois le paiement validé, revenez ici : la course se confirme toute seule.
        </Text>
      ) : null}
      <View style={s.securite}>
        <Ionicons name="lock-closed-outline" size={14} color={surFonce ? c.surCuve2 : c.pierre} />
        <Text style={[type.label, { color: surFonce ? c.surCuve2 : c.pierre, flex: 1 }]}>
          {regles.paiementsTest ? 'Mode test : paiement simulé, aucun argent réel.' : 'Paiement sécurisé par SumUp. Remboursé si vous annulez plus de 24 h avant (CGV).'}
        </Text>
      </View>
    </View>
  );
}

// Récapitulatif une fois l'acompte payé (détail de course).
export function ResteAPayer({ course }: { course: Course }) {
  const { c, type } = useTheme();
  if (!course.acomptePaye || !course.acompteMontant) return null;
  return (
    <Note ton="feuille" icone="checkmark-circle-outline">
      Acompte de {euros(course.acompteMontant)} réglé. Reste à payer à bord : {euros(Math.max(0, course.montant - course.acompteMontant))}.
    </Note>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  carte: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.l },
  montant: { fontFamily: f.display, fontSize: 30 },
  securite: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.m },
});
