import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { EtatDoubleAuth, commencerDoubleAuth, confirmerDoubleAuth, desactiverDoubleAuth, etatDoubleAuth } from './serveur';
import { Couleurs, radius, space } from './theme';
import { Bouton, Champ, Note } from './ui';
import { useTheme } from './useTheme';

// Double authentification du compte de Fabrice (Gestion › Sécurité du compte).
// Une fois activée, le mot de passe seul ne donne plus accès à l'espace chauffeur : il faut aussi le
// code à 6 chiffres de l'application d'authentification (Google Authenticator, Microsoft Authenticator…).
export function DoubleAuth() {
  const { c, type, s } = useTheme(creerStyles);
  const [etat, setEtat] = useState<EtatDoubleAuth | null>(null);
  const [activation, setActivation] = useState<{ facteur: string; qrSvg: string; cle: string; lien: string } | null>(null);
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [confirmerRetrait, setConfirmerRetrait] = useState(false);

  const charger = () => etatDoubleAuth().then(setEtat).catch(() => setEtat({ active: false }));
  useEffect(() => { charger(); }, []);
  const faire = async (fn: () => Promise<void>) => {
    setEnvoi(true); setErreur('');
    try { await fn(); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEnvoi(false); }
  };

  if (!etat) return null;

  if (etat.active) {
    return (
      <View style={[s.bloc, { gap: space.m }]}>
        <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
          <Ionicons name="shield-checkmark" size={26} color={c.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '700' }]}>Double authentification activée</Text>
            <Text style={type.small}>À chaque connexion, le code de votre application d’authentification est demandé après le mot de passe.</Text>
          </View>
        </View>
        {erreur ? <Note ton="erreur">{erreur}</Note> : null}
        {confirmerRetrait ? (
          <>
            <Note ton="alerte">Sans elle, votre mot de passe seul suffira de nouveau pour accéder à toutes les données des clients.</Note>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Bouton titre="Garder" variante="contour" onPress={() => setConfirmerRetrait(false)} style={{ flex: 1 }} />
              <Bouton titre="Désactiver" variante="danger" chargement={envoi} style={{ flex: 1 }}
                onPress={() => faire(async () => { await desactiverDoubleAuth(etat.facteur!); setConfirmerRetrait(false); await charger(); })} />
            </View>
          </>
        ) : (
          <Bouton titre="Désactiver" variante="texte" onPress={() => setConfirmerRetrait(true)} style={{ alignSelf: 'flex-start' }} />
        )}
      </View>
    );
  }

  if (activation) {
    return (
      <View style={[s.bloc, { gap: space.m }]}>
        <Text style={type.h3}>Activer la double authentification</Text>
        <Text style={type.small}>
          1. Installez une application d’authentification (Google Authenticator, Microsoft Authenticator…).{'\n'}
          2. Ajoutez un compte : scannez ce QR code depuis un autre appareil, ou touchez « Ouvrir l’application » si elle est sur ce téléphone, ou recopiez la clé.{'\n'}
          3. Saisissez le code à 6 chiffres qu’elle affiche.
        </Text>
        <View style={s.qr}><SvgXml xml={activation.qrSvg} width={190} height={190} /></View>
        <Bouton titre="Ouvrir l’application d’authentification" variante="contour" icone="open-outline"
          onPress={() => Linking.openURL(activation.lien).catch(() => setErreur('Aucune application d’authentification trouvée sur ce téléphone : scannez le QR code ou recopiez la clé.'))} />
        <View style={s.cle}>
          <Ionicons name="key-outline" size={18} color={c.accent} />
          <Text style={[type.small, { flex: 1, fontFamily: 'monospace', color: c.encre }]} selectable>{activation.cle.replace(/(.{4})/g, '$1 ').trim()}</Text>
        </View>
        <Text style={[type.small, { marginTop: -space.s }]}>Clé à recopier si besoin (appui long pour la copier).</Text>
        <Champ libelle="Code à 6 chiffres" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="123456" />
        {erreur ? <Note ton="erreur">{erreur}</Note> : null}
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Bouton titre="Annuler" variante="contour" onPress={() => { setActivation(null); setCode(''); setErreur(''); }} style={{ flex: 1 }} />
          <Bouton titre="Activer" desactive={code.length !== 6} chargement={envoi} style={{ flex: 1.4 }}
            onPress={() => faire(async () => { await confirmerDoubleAuth(activation.facteur, code); setActivation(null); setCode(''); await charger(); })} />
        </View>
        <Text style={type.small}>Téléphone perdu ou changé : la double authentification se retire depuis le tableau de bord Supabase (voir le guide).</Text>
      </View>
    );
  }

  return (
    <View style={[s.bloc, { gap: space.m }]}>
      <View style={{ flexDirection: 'row', gap: space.m, alignItems: 'center' }}>
        <Ionicons name="shield-outline" size={26} color={c.alerte} />
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '700' }]}>Double authentification désactivée</Text>
          <Text style={type.small}>Votre compte donne accès à toutes les données des clients : protégez-le avec un code en plus du mot de passe.</Text>
        </View>
      </View>
      {erreur ? <Note ton="erreur">{erreur}</Note> : null}
      <Bouton titre="Activer" icone="shield-checkmark-outline" chargement={envoi} onPress={() => faire(async () => setActivation(await commencerDoubleAuth()))} />
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.l },
  qr: { alignSelf: 'center', backgroundColor: '#FFFFFF', padding: space.m, borderRadius: radius.m },
  cle: { flexDirection: 'row', alignItems: 'center', gap: space.s, padding: space.m, borderRadius: radius.m, borderWidth: 1, borderColor: c.trait },
});
