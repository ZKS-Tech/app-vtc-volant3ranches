import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { EcranAvecClavier } from '../src/Clavier';
import { envoyerCodeConnexion } from '../src/serveur';
import { useStore } from '../src/store';
import { space } from '../src/theme';
import { Bouton, Champ, Note, Segment } from '../src/ui';
import { useTheme } from '../src/useTheme';

// Créer un compte (le compte invité du téléphone devient permanent : rien n'est perdu) ou se
// connecter (les courses réservées en invité sur ce téléphone suivent le compte).
export default function Compte() {
  const { c, type } = useTheme();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { brouillon, creerCompte, connecterClient, reinitialiserMotDePasse, serveur } = useStore();
  const [mode, setMode] = useState<'creer' | 'connexion'>(params.mode === 'connexion' ? 'connexion' : 'creer');
  // Mot de passe oublié : null, puis « code » (email envoyé), le formulaire passe à code + nouveau mot de passe.
  const [oubli, setOubli] = useState<'email' | 'code' | null>(null);
  const [code, setCode] = useState('');
  const [f, setF] = useState({ nom: brouillon.nom, telephone: brouillon.telephone, email: brouillon.email, motDePasse: '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState<string | null>(null);
  const maj = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const emailOk = /.+@.+\..+/.test(f.email.trim());
  const telOk = f.telephone.replace(/\D/g, '').length >= 10;
  const valide = emailOk && f.motDePasse.length >= 6 && (mode === 'connexion' || (f.nom.trim().length > 1 && telOk));

  const valider = async () => {
    setEnvoi(true); setErreur('');
    try {
      if (mode === 'creer') {
        const r = await creerCompte(f);
        if (r === 'confirmation') { setFait('Un email de confirmation vous a été envoyé. Ouvrez le lien qu’il contient, puis revenez ici et touchez à nouveau « Créer mon compte » avec le même email pour choisir votre mot de passe.'); return; }
        router.back();
      } else {
        const n = await connecterClient(f.email, f.motDePasse);
        if (n > 0) setFait(`Connecté. ${n} course${n > 1 ? 's' : ''} réservée${n > 1 ? 's' : ''} sur ce téléphone ${n > 1 ? 'ont été ajoutées' : 'a été ajoutée'} à votre compte.`);
        else router.back();
      }
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEnvoi(false); }
  };

  if (serveur.etat !== 'connecte') {
    return <View style={{ padding: space.l }}><Note ton="bain">Les comptes nécessitent la connexion au serveur (indisponible en démonstration).</Note></View>;
  }
  if (fait) {
    return (
      <View style={{ flex: 1, backgroundColor: c.sol, padding: space.l, gap: space.l }}>
        <Note ton="feuille" icone="checkmark-circle-outline">{fait}</Note>
        <Bouton titre="Continuer" onPress={() => router.back()} />
      </View>
    );
  }

  if (oubli) {
    const envoyerCode = async () => {
      setEnvoi(true); setErreur('');
      try { await envoyerCodeConnexion(f.email); setOubli('code'); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEnvoi(false); }
    };
    const changer = async () => {
      setEnvoi(true); setErreur('');
      try {
        const n = await reinitialiserMotDePasse(f.email, code, f.motDePasse);
        setFait(`Mot de passe changé, vous êtes connecté.${n > 0 ? ` ${n} course${n > 1 ? 's' : ''} de ce téléphone ajoutée${n > 1 ? 's' : ''} à votre compte.` : ''}`);
      } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEnvoi(false); }
    };
    return (
      <EcranAvecClavier style={{ backgroundColor: c.sol }}>
        <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          <Text style={[type.h2, { marginBottom: space.s }]}>Mot de passe oublié</Text>
          <Text style={[type.small, { marginBottom: space.l }]}>
            {oubli === 'email' ? 'Indiquez l’email de votre compte : vous allez recevoir un code à 6 chiffres.' : `Code envoyé à ${f.email.trim()}. Il est valable une heure ; pensez à regarder dans les spams.`}
          </Text>
          <Champ libelle="Email" value={f.email} onChangeText={(v) => maj({ email: v })} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={oubli === 'email'} />
          {oubli === 'code' ? (
            <>
              <Champ libelle="Code reçu par email" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="123456" />
              <Champ libelle="Nouveau mot de passe" value={f.motDePasse} onChangeText={(v) => maj({ motDePasse: v })} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="6 caractères au moins" />
            </>
          ) : null}
          {erreur ? <View style={{ marginBottom: space.l }}><Note ton="erreur">{erreur}</Note></View> : null}
          {oubli === 'email'
            ? <Bouton titre="Recevoir un code" desactive={!emailOk} chargement={envoi} onPress={envoyerCode} />
            : <Bouton titre="Changer le mot de passe" desactive={code.length < 6 || f.motDePasse.length < 6} chargement={envoi} onPress={changer} />}
          {oubli === 'code' ? <Bouton titre="Renvoyer un code" variante="texte" onPress={envoyerCode} style={{ marginTop: space.s, alignSelf: 'center' }} /> : null}
          <Bouton titre="Retour à la connexion" variante="texte" onPress={() => { setOubli(null); setErreur(''); }} style={{ marginTop: space.s, alignSelf: 'center' }} />
        </ScrollView>
      </EcranAvecClavier>
    );
  }

  return (
    <EcranAvecClavier style={{ backgroundColor: c.sol }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Segment options={[{ id: 'creer', titre: 'Créer un compte' }, { id: 'connexion', titre: 'Se connecter' }]} valeur={mode} onChange={(m) => { setMode(m); setErreur(''); }} />
        <Text style={[type.small, { marginVertical: space.l }]}>
          {mode === 'creer'
            ? 'Vos coordonnées seront préremplies à chaque réservation, et vous retrouverez vos courses sur tous vos appareils. Les courses déjà réservées sur ce téléphone sont conservées.'
            : 'Les courses réservées sur ce téléphone sans compte seront ajoutées à votre compte.'}
        </Text>
        {mode === 'creer' ? (
          <>
            <Champ libelle="Nom et prénom" value={f.nom} onChangeText={(v) => maj({ nom: v })} placeholder="Claire Martin" autoComplete="name" textContentType="name" />
            <Champ libelle="Téléphone" value={f.telephone} onChangeText={(v) => maj({ telephone: v })} placeholder="06 12 34 56 78" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
          </>
        ) : null}
        <Champ libelle="Email" value={f.email} onChangeText={(v) => maj({ email: v })} placeholder="claire.martin@email.fr" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
        <Champ libelle="Mot de passe" value={f.motDePasse} onChangeText={(v) => maj({ motDePasse: v })} placeholder={mode === 'creer' ? '6 caractères au moins' : ''} secureTextEntry
          autoComplete={mode === 'creer' ? 'new-password' : 'current-password'} textContentType={mode === 'creer' ? 'newPassword' : 'password'} />
        {erreur ? <View style={{ marginBottom: space.l }}><Note ton="erreur">{erreur}</Note></View> : null}
        <Bouton titre={mode === 'creer' ? 'Créer mon compte' : 'Se connecter'} desactive={!valide} chargement={envoi} onPress={valider} />
        {mode === 'connexion' ? (
          <Bouton titre="Mot de passe oublié ?" variante="texte" onPress={() => { setOubli('email'); setErreur(''); }} style={{ marginTop: space.m, alignSelf: 'center' }} />
        ) : null}
      </ScrollView>
    </EcranAvecClavier>
  );
}
