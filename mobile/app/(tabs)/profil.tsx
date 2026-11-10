import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { contact } from '../../src/data';
import { LigneNotifications } from '../../src/LigneNotifications';
import { useStore } from '../../src/store';
import { Couleurs, radius, space } from '../../src/theme';
import { useTheme } from '../../src/useTheme';
import { Bouton, Champ, Note, couleursSwitch, Segment, Titre } from '../../src/ui';

function BlocCompte() {
  const { c, type, s } = useTheme(creerStyles);
  const { compte, majProfil, deconnecterClient } = useStore();
  const [edition, setEdition] = useState(false);
  const [f, setF] = useState({ nom: '', telephone: '' });
  const [etat, setEtat] = useState<'envoi' | 'sortie' | null>(null);
  const [erreur, setErreur] = useState('');
  if (!compte) {
    return (
      <View style={s.invite}>
        <Text style={type.h2}>Vous réservez en invité</Text>
        <Text style={[type.small, { marginTop: 4, marginBottom: space.l }]}>
          Un compte garde vos coordonnées (plus besoin de les retaper) et vos courses sur tous vos appareils.
        </Text>
        <Bouton titre="Créer un compte" onPress={() => router.push({ pathname: '/compte', params: { mode: 'creer' } })} />
        <Bouton titre="J'ai déjà un compte" variante="texte" onPress={() => router.push({ pathname: '/compte', params: { mode: 'connexion' } })} style={{ marginTop: space.xs }} />
      </View>
    );
  }
  return (
    <View style={s.invite}>
      <Text style={type.label}>Mon compte</Text>
      {edition ? (
        <View style={{ marginTop: space.m }}>
          <Champ libelle="Nom et prénom" value={f.nom} onChangeText={(v) => setF((x) => ({ ...x, nom: v }))} />
          <Champ libelle="Téléphone" value={f.telephone} onChangeText={(v) => setF((x) => ({ ...x, telephone: v }))} keyboardType="phone-pad" />
          {erreur ? <View style={{ marginBottom: space.m }}><Note ton="erreur">{erreur}</Note></View> : null}
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Bouton titre="Annuler" variante="contour" onPress={() => { setEdition(false); setErreur(''); }} style={{ flex: 1 }} />
            <Bouton titre="Enregistrer" chargement={etat === 'envoi'} style={{ flex: 1.4 }}
              onPress={async () => { setEtat('envoi'); setErreur(''); try { await majProfil(f.nom, f.telephone); setEdition(false); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEtat(null); } }} />
          </View>
        </View>
      ) : (
        <>
          <Text style={[type.h2, { marginTop: 4 }]}>{compte.nom || 'Mon compte'}</Text>
          <Text style={type.small}>{compte.email}{compte.telephone ? ` · ${compte.telephone}` : ''}</Text>
          <Text style={[type.small, { marginTop: space.s, marginBottom: space.l }]}>Vos coordonnées sont préremplies à chaque réservation.</Text>
          <Bouton titre="Modifier mes coordonnées" variante="contour" icone="create-outline" onPress={() => { setF({ nom: compte.nom ?? '', telephone: compte.telephone ?? '' }); setEdition(true); }} />
          <Bouton titre="Se déconnecter" variante="texte" icone="log-out-outline" chargement={etat === 'sortie'} style={{ marginTop: space.xs }}
            onPress={async () => { setEtat('sortie'); try { await deconnecterClient(); } finally { setEtat(null); } }} />
        </>
      )}
    </View>
  );
}

export default function Profil() {
  const { c, type, s } = useTheme(creerStyles);
  const { prefs, setPrefs, simulerEchec, setSimulerEchec, apparence, setApparence, serveur } = useStore();
  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }}>
      <BlocCompte />

      <Titre>Apparence</Titre>
      <Segment
        options={[{ id: 'auto', titre: 'Automatique' }, { id: 'clair', titre: 'Clair' }, { id: 'sombre', titre: 'Sombre' }]}
        valeur={apparence}
        onChange={setApparence}
      />
      <Text style={[type.small, { marginTop: space.s }]}>Automatique : suit le réglage du téléphone.</Text>

      <Titre>Être prévenu</Titre>
      <View style={s.bloc}>
        <LigneNotifications sous="Confirmation, refus, messages de Fabrice et rappel la veille" />
        <View style={[s.ligne, s.trait]}>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>Emails</Text>
            <Text style={type.small}>Confirmation avec bon de commande, puis facture en PDF : envoyés à l’adresse de vos réservations</Text>
          </View>
        </View>
      </View>

      <Titre>Confidentialité</Titre>
      <View style={s.bloc}>
        <Interrupteur
          titre="Mesure d'audience"
          sous="Statistiques anonymes (Google Analytics) pour améliorer l'application. Désactivées tant que vous ne les acceptez pas."
          valeur={prefs.stats}
          onChange={(v) => setPrefs({ stats: v })}
        />
      </View>

      <Titre>Informations</Titre>
      <View style={s.bloc}>
        <Lien titre="Conditions générales de vente" url={`${contact.site}/conditions-generales-de-vente/`} />
        <Lien titre="Politique de confidentialité" url={`${contact.site}/politique-de-confidentialite/`} trait />
        <Lien titre="Mentions légales" url={`${contact.site}/mentions-legales/`} trait />
      </View>

      <Titre>Prototype</Titre>
      <View style={s.bloc}>
        <View style={[s.ligne]}>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>Serveur</Text>
            <Text style={type.small}>
              {serveur.etat === 'connecte' ? 'Connecté : tarifs et courses enregistrés dans Supabase'
                : serveur.etat === 'connexion' ? 'Connexion en cours…'
                : serveur.etat === 'erreur' ? `Erreur : ${serveur.message}`
                : 'Non configuré : mode démonstration (clé Supabase absente)'}
            </Text>
          </View>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: serveur.etat === 'connecte' ? c.feuille : serveur.etat === 'erreur' ? c.erreur : c.trait }} />
        </View>
        <Interrupteur
          titre="Simuler un échec d'envoi"
          sous="Pour montrer à Fabrice l'écran affiché quand la demande ne part pas."
          valeur={simulerEchec}
          onChange={setSimulerEchec}
        />
      </View>
      <Bouton titre="Espace chauffeur" variante="texte" icone="car-outline" onPress={() => router.push('/connexion-chauffeur')} style={{ alignSelf: 'flex-start', marginTop: space.xl, marginLeft: -space.s }} />
      <Text style={[type.small, { marginTop: space.s }]}>Volant3ranches · version 0.2</Text>
    </ScrollView>
  );
}

function Interrupteur({ titre, sous, valeur, onChange, trait }: { titre: string; sous: string; valeur: boolean; onChange: (v: boolean) => void; trait?: boolean }) {
  const { c, type, s } = useTheme(creerStyles);
  return (
    <View style={[s.ligne, trait && s.trait]}>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{titre}</Text>
        <Text style={type.small}>{sous}</Text>
      </View>
      <Switch value={valeur} onValueChange={onChange} {...couleursSwitch(c)} accessibilityLabel={titre} />
    </View>
  );
}

function Lien({ titre, url, trait }: { titre: string; url: string; trait?: boolean }) {
  const { c, type, s } = useTheme(creerStyles);
  return (
    <Text onPress={() => Linking.openURL(url)} style={[type.body, s.lien, trait && s.trait]} accessibilityRole="link">
      {titre}
    </Text>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  invite: { backgroundColor: c.bain1, borderRadius: radius.l, padding: space.l },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: 60 },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait },
  lien: { paddingVertical: space.l, color: c.accent, fontWeight: '600' },
});
