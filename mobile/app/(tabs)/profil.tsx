import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { contact } from '../../src/data';
import { LigneNotifications } from '../../src/LigneNotifications';
import { useConsentement } from '../../src/stats';
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

// Suppression du compte (ou, pour un invité, de ses données) : expliquée, puis confirmée.
function SuppressionCompte() {
  const { c, type, s } = useTheme(creerStyles);
  const { compte, courses, supprimerCompte } = useStore();
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState(false);
  const titre = compte ? 'Supprimer mon compte' : 'Effacer mes données';
  const aVenir = courses.filter((x) => ['envoyee', 'acompte_attendu', 'confirmee'].includes(x.statut) && x.date.getTime() > Date.now());
  if (fait) {
    return (
      <View style={[s.ligne, s.trait]}>
        <Note ton="feuille" icone="checkmark-circle-outline">
          C’est fait : vos données ont été effacées. Vous pouvez continuer à réserver en invité.
        </Note>
      </View>
    );
  }
  if (!ouvert) {
    return (
      <Text onPress={() => setOuvert(true)} style={[type.body, s.lien, s.trait, { color: c.erreur }]} accessibilityRole="button">
        {titre}
      </Text>
    );
  }
  return (
    <View style={[s.trait, { paddingVertical: space.l, gap: space.m }]}>
      <Text style={type.h3}>{titre} ?</Text>
      <Text style={type.small}>
        {compte ? 'Votre compte, vos coordonnées, vos messages et l’historique de vos courses seront effacés. ' : 'Vos coordonnées, vos messages et l’historique de vos courses sur ce téléphone seront effacés. '}
        Les bons de commande et factures déjà émis sont conservés 10 ans, comme la loi l’impose. C’est définitif.
      </Text>
      {aVenir.length ? (
        <Note ton="alerte" icone="calendar-outline">
          {`Vous avez ${aVenir.length > 1 ? `${aVenir.length} courses prévues` : 'une course prévue'} : annulez-la d’abord (Mes courses), ou appelez Fabrice.`}
        </Note>
      ) : null}
      {erreur ? <Note ton="erreur">{erreur}</Note> : null}
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Bouton titre="Annuler" variante="contour" onPress={() => { setOuvert(false); setErreur(''); }} style={{ flex: 1 }} />
        <Bouton titre="Supprimer" variante="danger" icone="trash-outline" chargement={envoi} desactive={aVenir.length > 0} style={{ flex: 1.4 }}
          onPress={async () => {
            setEnvoi(true); setErreur('');
            try { await supprimerCompte(); setFait(true); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEnvoi(false); }
          }} />
      </View>
    </View>
  );
}

export default function Profil() {
  const { consentement, definir: definirConsentement } = useConsentement();
  const { c, type, s } = useTheme(creerStyles);
  const { apparence, setApparence, serveur } = useStore();
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
          titre="Statistiques d'utilisation"
          sous="Anonymes (Google Analytics), pour améliorer l'application : ni nom, ni téléphone, ni adresse. Désactivées tant que vous ne les acceptez pas."
          valeur={consentement === 'oui'}
          onChange={(v) => definirConsentement(v ? 'oui' : 'non')}
        />
        {serveur.etat === 'connecte' ? <SuppressionCompte /> : null}
      </View>

      <Titre>Informations</Titre>
      <View style={s.bloc}>
        <Lien titre="Conditions générales de vente" url={`${contact.site}/conditions-generales-de-vente/`} />
        <Lien titre="Politique de confidentialité" url={`${contact.site}/politique-de-confidentialite/`} trait />
        <Lien titre="Mentions légales" url={`${contact.site}/mentions-legales/`} trait />
      </View>

      <Text style={[type.small, { marginTop: space.xl }]}>Volant3ranches · version {Constants.expoConfig?.version ?? ''}</Text>
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
