import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Annonce, periode, useAnnonces } from '../src/annonces';
import { CarteAnnonce } from '../src/BandeauAnnonce';
import { CalendrierPeriode } from '../src/Calendrier';
import { useChauffeur } from '../src/chauffeur';
import { LigneMission } from '../src/chauffeurUi';
import { EcranAvecClavier } from '../src/Clavier';
import { isoJour } from '../src/data';
import { Couleurs, radius, sansContourWeb, space } from '../src/theme';
import { Bouton, Note, Segment, Titre } from '../src/ui';
import { useTheme } from '../src/useTheme';

const MAX = 500;

// Créer ou modifier une annonce : type, période, message, aperçu côté client.
export default function EditionAnnonce() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { c, type, s } = useTheme(creerStyles);
  const { annonces, enregistrer, supprimer } = useAnnonces();
  const { missions } = useChauffeur();
  const existante = annonces.find((a) => a.id === id);
  const [bloquer, setBloquer] = useState(existante?.bloquer ?? true);
  const [debut, setDebut] = useState<string | null>(existante?.debut ?? null);
  const [fin, setFin] = useState<string | null>(existante?.fin ?? null);
  const [message, setMessage] = useState(existante?.message ?? '');
  const [etat, setEtat] = useState<'enregistrement' | 'suppression' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Courses déjà prévues pendant la période : Fabrice doit les gérer lui-même.
  const prevues = missions.filter((m) => m.statut === 'confirmee' || m.statut === 'envoyee');
  const joursPrevus = useMemo(() => [...new Set(prevues.map((m) => isoJour(m.date)))], [prevues]);
  const touchees = debut && fin ? prevues.filter((m) => { const j = isoJour(m.date); return j >= debut && j <= fin; }).sort((a, b) => +a.date - +b.date) : [];

  const apercu: Annonce | null = debut && fin ? { id: 'apercu', debut, fin, bloquer, message: message.trim() || null, cree_le: '' } : null;

  const valider = async () => {
    if (!debut || !fin) return;
    setEtat('enregistrement'); setErreur(null);
    try {
      await enregistrer({ id: existante?.id, debut, fin, bloquer, message: message.trim() || null });
      router.back();
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEtat(null); }
  };

  const effacer = async () => {
    if (!existante) return;
    const go = async () => {
      setEtat('suppression');
      try { await supprimer(existante.id); router.back(); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEtat(null); }
    };
    if (Platform.OS === 'web') return go();
    Alert.alert('Supprimer l’annonce ?', 'Elle disparaît tout de suite de l’appli des clients.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <EcranAvecClavier style={{ backgroundColor: c.sol }}>
      <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Segment
          options={[{ id: 'absence', titre: 'Absence' }, { id: 'info', titre: 'Information' }]}
          valeur={bloquer ? 'absence' : 'info'}
          onChange={(v) => setBloquer(v === 'absence')}
        />
        <Text style={[type.small, { marginTop: space.s }]}>
          {bloquer
            ? 'Vacances, indisponibilité : l’annonce s’affiche dès maintenant et jusqu’au dernier jour. Les clients ne peuvent pas réserver ces jours-là.'
            : 'Nouveauté, horaires, message : l’annonce s’affiche entre ces deux dates, sans rien bloquer.'}
        </Text>

        <Titre>{bloquer ? 'Jours d’absence' : 'Période d’affichage'}</Titre>
        <CalendrierPeriode debut={debut} fin={fin} onChange={(d, f) => { setDebut(d); setFin(f); }} marques={joursPrevus} />
        {debut && fin ? <Text style={[type.body, { marginTop: space.s, fontWeight: '600', textAlign: 'center' }]}>{periode({ debut, fin })[0].toUpperCase() + periode({ debut, fin }).slice(1)}</Text> : null}

        {bloquer && touchees.length ? (
          <View style={{ marginTop: space.l, gap: space.s }}>
            <Note ton="alerte" icone="warning-outline">
              {touchees.length} course{touchees.length > 1 ? 's' : ''} déjà prévue{touchees.length > 1 ? 's' : ''} pendant cette période. L’annonce ne les annule pas : prévenez
              ces clients ou annulez depuis chaque course.
            </Note>
            <View style={s.bloc}>{touchees.map((m) => <LigneMission key={m.id} m={m} avecDate />)}</View>
          </View>
        ) : null}

        <Titre>Message (facultatif)</Titre>
        <TextInput
          value={message}
          onChangeText={(t) => setMessage(t.slice(0, MAX))}
          placeholder={bloquer ? 'Ex. Vacances en famille. Pour un transfert urgent, mon confrère Jean au 06 …' : 'Ex. Siège enfant disponible sur demande.'}
          placeholderTextColor={c.placeholder}
          multiline
          style={s.message}
          accessibilityLabel="Message de l'annonce"
        />
        <Text style={[type.label, { textAlign: 'right', marginTop: 4 }]}>{message.length}/{MAX}</Text>

        {apercu ? (
          <>
            <Titre>Aperçu pour vos clients</Titre>
            <CarteAnnonce a={apercu} sansLien />
          </>
        ) : null}

        {erreur ? <View style={{ marginTop: space.l }}><Note ton="erreur">{erreur}</Note></View> : null}
        <Bouton titre={existante ? 'Enregistrer' : 'Publier l’annonce'} icone="checkmark" desactive={!debut || !fin} chargement={etat === 'enregistrement'} onPress={valider} style={{ marginTop: space.xl }} />
        {existante ? <Bouton titre="Supprimer l’annonce" variante="texte" icone="trash-outline" chargement={etat === 'suppression'} onPress={effacer} style={{ marginTop: space.s, alignSelf: 'center' }} /> : null}
      </ScrollView>
    </EcranAvecClavier>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.m, paddingVertical: space.xs },
  message: {
    backgroundColor: c.surface, borderRadius: radius.m, borderWidth: 1, borderColor: c.trait, padding: space.m,
    minHeight: 110, fontSize: 16, color: c.encre, textAlignVertical: 'top', ...sansContourWeb,
  },
});
