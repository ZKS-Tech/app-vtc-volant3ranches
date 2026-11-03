import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { contact } from '../../src/data';
import { useStore } from '../../src/store';
import { c, radius, space, type } from '../../src/theme';
import { Bouton, couleursSwitch, Titre } from '../../src/ui';

export default function Profil() {
  const { prefs, setPrefs, simulerEchec, setSimulerEchec } = useStore();
  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }}>
      <View style={s.invite}>
        <Text style={type.h2}>Vous réservez en invité</Text>
        <Text style={[type.small, { marginTop: 4, marginBottom: space.l }]}>
          Un compte garde vos coordonnées, vos adresses favorites et l'historique de vos courses sur tous vos appareils.
        </Text>
        <Bouton titre="Créer un compte" />
        <Bouton titre="J'ai déjà un compte" variante="texte" style={{ marginTop: space.xs }} />
      </View>

      <Titre>Confirmations de course</Titre>
      <View style={s.bloc}>
        <Interrupteur titre="Notifications" sous="Dès que Fabrice confirme" valeur={prefs.push} onChange={(v) => setPrefs({ push: v })} />
        <Interrupteur titre="SMS" sous="Même appli fermée" valeur={prefs.sms} onChange={(v) => setPrefs({ sms: v })} trait />
        <Interrupteur titre="Email" sous="Récapitulatif écrit, pratique pour les notes de frais" valeur={prefs.email} onChange={(v) => setPrefs({ email: v })} trait />
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
        <Interrupteur
          titre="Simuler un échec d'envoi"
          sous="Pour montrer à Fabrice l'écran affiché quand la demande ne part pas."
          valeur={simulerEchec}
          onChange={setSimulerEchec}
        />
      </View>
      <Text style={[type.small, { marginTop: space.l }]}>Volant3ranches · prototype de démonstration, version 0.1</Text>
    </ScrollView>
  );
}

function Interrupteur({ titre, sous, valeur, onChange, trait }: { titre: string; sous: string; valeur: boolean; onChange: (v: boolean) => void; trait?: boolean }) {
  return (
    <View style={[s.ligne, trait && s.trait]}>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{titre}</Text>
        <Text style={type.small}>{sous}</Text>
      </View>
      <Switch value={valeur} onValueChange={onChange} {...couleursSwitch} accessibilityLabel={titre} />
    </View>
  );
}

function Lien({ titre, url, trait }: { titre: string; url: string; trait?: boolean }) {
  return (
    <Text onPress={() => Linking.openURL(url)} style={[type.body, s.lien, trait && s.trait]} accessibilityRole="link">
      {titre}
    </Text>
  );
}

const s = StyleSheet.create({
  invite: { backgroundColor: c.bain1, borderRadius: radius.l, padding: space.l },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: 60 },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait },
  lien: { paddingVertical: space.l, color: c.indigo, fontWeight: '600' },
});
