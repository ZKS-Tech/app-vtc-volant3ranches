import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useChauffeur } from '../src/chauffeur';
import { dateCourte } from '../src/data';
import { heureDe } from '../src/chauffeurUi';
import { EmailEnvoye, ReglagesEmails, chargerEmails, chargerReglagesEmails, majReglagesEmails, renvoyerEmail, supabase } from '../src/serveur';
import { Couleurs, radius, sansContourWeb, space } from '../src/theme';
import { Bouton, Note, Titre, couleursSwitch } from '../src/ui';
import { EcranAvecClavier } from '../src/Clavier';
import { useTheme } from '../src/useTheme';

const LIBELLES: Record<string, string> = {
  demande_recue: 'Demande reçue', acompte: 'Acompte à régler', confirmation: 'Confirmation + bon de commande', refus: 'Demande refusée',
  expiree: 'Acompte non réglé', annulation: 'Annulation', remboursement: 'Remboursement', facture: 'Facture',
  chauffeur_demande: 'Copie : nouvelle demande', chauffeur_annulation: 'Copie : annulation',
};

// Emails envoyés aux clients (Brevo) : activation, copie pour Fabrice, et journal des envois.
export default function Emails() {
  const { c, type, s } = useTheme(creerStyles);
  const { demo, missions } = useChauffeur();
  const [reglages, setReglages] = useState<ReglagesEmails | null>(null);
  const [emailCopie, setEmailCopie] = useState('');
  const [journal, setJournal] = useState<EmailEnvoye[]>([]);
  const [chargement, setChargement] = useState(false);
  const [message, setMessage] = useState<{ ok?: string; erreur?: string } | null>(null);

  const charger = async () => {
    if (demo || !supabase) return;
    setChargement(true);
    try {
      const [r, j] = await Promise.all([chargerReglagesEmails(), chargerEmails()]);
      setReglages(r); setEmailCopie(r?.email_chauffeur ?? ''); setJournal(j);
    } finally { setChargement(false); }
  };
  useEffect(() => { charger(); }, [demo]);
  useEffect(() => {
    if (!supabase || demo) return;
    const canal = supabase.channel('emails').on('postgres_changes', { event: '*', schema: 'public', table: 'emails' }, () => { chargerEmails().then(setJournal); }).subscribe();
    return () => { canal.unsubscribe(); };
  }, [demo]);

  const enregistrer = async (v: Partial<ReglagesEmails>, ok: string) => {
    setMessage(null);
    try { await majReglagesEmails(v); setReglages((r) => (r ? { ...r, ...v } : r)); setMessage({ ok }); } catch (e) { setMessage({ erreur: e instanceof Error ? e.message : String(e) }); }
  };

  if (demo) return <View style={{ padding: space.l }}><Note ton="bain" icone="eye-outline">Démonstration : les emails partent seulement avec le serveur et Brevo configuré.</Note></View>;
  if (!reglages && !chargement) return <View style={{ padding: space.l }}><Note ton="alerte">Emails pas encore installés : exécuter la migration 12 dans Supabase (voir supabase/README.md).</Note></View>;

  const nomClient = (id: string | null) => missions.find((m) => m.id === id)?.nom;
  const enErreur = journal.filter((e) => e.statut === 'erreur').length;

  return (
    <EcranAvecClavier style={{ backgroundColor: c.sol }}>
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={chargement} onRefresh={charger} tintColor={c.accent} />}>
      {reglages ? (
        <View style={s.bloc}>
          <View style={s.ligne}>
            <Ionicons name="mail-outline" size={22} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Text style={type.body}>Envoyer les emails aux clients</Text>
              <Text style={type.small}>Demande reçue, confirmation avec bon de commande, facture, annulation…</Text>
            </View>
            <Switch value={reglages.emails_actifs} {...couleursSwitch(c)} accessibilityLabel="Envoyer les emails"
              onValueChange={(v) => enregistrer({ emails_actifs: v }, v ? 'Emails activés.' : 'Emails désactivés : plus rien n’est envoyé.')} />
          </View>
          <View style={[s.ligne, s.trait]}>
            <Ionicons name="copy-outline" size={22} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Text style={type.body}>Recevoir une copie</Text>
              <Text style={type.small}>Nouvelles demandes et annulations par email, en plus des notifications.</Text>
            </View>
            <Switch value={reglages.emails_copie_chauffeur} {...couleursSwitch(c)} accessibilityLabel="Recevoir une copie"
              onValueChange={(v) => enregistrer({ emails_copie_chauffeur: v }, v ? 'Copie activée.' : 'Copie désactivée.')} />
          </View>
          {reglages.emails_copie_chauffeur ? (
            <View style={[s.trait, { paddingVertical: space.m, gap: space.s }]}>
              <Text style={type.label}>Votre email (copies et réponses des clients)</Text>
              <TextInput value={emailCopie} onChangeText={setEmailCopie} keyboardType="email-address" autoCapitalize="none" placeholder="fabrice@…" placeholderTextColor={c.placeholder} style={s.champ} />
              {emailCopie.trim() !== (reglages.email_chauffeur ?? '') ? (
                <Bouton titre="Enregistrer l'email" variante="contour" desactive={!!emailCopie.trim() && !/.+@.+\..+/.test(emailCopie)}
                  onPress={() => enregistrer({ email_chauffeur: emailCopie.trim() || null }, 'Email enregistré.')} />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      {message ? <View style={{ marginTop: space.m }}><Note ton={message.erreur ? 'erreur' : 'feuille'}>{message.erreur ?? message.ok}</Note></View> : null}

      <Titre>Derniers emails{enErreur ? ` · ${enErreur} en erreur` : ''}</Titre>
      {journal.length ? (
        <View style={s.bloc}>
          {journal.map((e, i) => (
            <Pressable key={e.id} onPress={() => e.course_id && router.push(`/mission/${e.course_id}`)} style={[s.email, i > 0 && s.trait]}>
              <Ionicons name={e.statut === 'envoye' ? 'checkmark-circle' : e.statut === 'erreur' ? 'alert-circle' : 'time-outline'} size={20}
                color={e.statut === 'envoye' ? c.accent : e.statut === 'erreur' ? c.erreur : c.pierre} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontWeight: '600' }]}>{LIBELLES[e.type] ?? e.type}</Text>
                <Text style={type.small} numberOfLines={1}>{nomClient(e.course_id) ? `${nomClient(e.course_id)} · ` : ''}{e.destinataire}</Text>
                <Text style={[type.label, { fontSize: 12 }]}>
                  {dateCourte(new Date(e.cree_le))} {heureDe(new Date(e.cree_le))} · {e.statut === 'envoye' ? 'envoyé' : e.statut === 'erreur' ? 'échec' : e.statut === 'envoi' ? 'en cours' : 'en attente'}
                </Text>
                {e.erreur && e.statut !== 'envoye' ? <Text style={[type.small, { color: c.erreur }]} numberOfLines={2}>{e.erreur}</Text> : null}
              </View>
              {e.statut === 'erreur' ? <Bouton titre="Renvoyer" variante="texte" onPress={() => renvoyerEmail(e.id).then(charger).catch((x) => setMessage({ erreur: String(x.message ?? x) }))} /> : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={type.small}>{reglages?.emails_actifs ? 'Aucun email pour l’instant.' : 'Activez les emails pour qu’ils apparaissent ici.'}</Text>
      )}
    </ScrollView>
    </EcranAvecClavier>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: 64 },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait },
  email: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m, paddingVertical: space.m },
  champ: { borderWidth: 1, borderColor: c.trait, borderRadius: radius.s, paddingHorizontal: space.m, minHeight: 44, fontSize: 16, color: c.encre, ...sansContourWeb },
});
