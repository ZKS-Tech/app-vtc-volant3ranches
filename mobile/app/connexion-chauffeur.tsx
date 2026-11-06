import { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useStore } from '../src/store';
import { space } from '../src/theme';
import { Bouton, Champ, Note } from '../src/ui';
import { EcranAvecClavier } from '../src/Clavier';
import { useTheme } from '../src/useTheme';

// Connexion de Fabrice à son espace. Les clients ne voient ce lien qu'en bas de leur profil.
export default function ConnexionChauffeur() {
  const { c, type } = useTheme();
  const { serveur, connecterChauffeur, entrerDemoChauffeur } = useStore();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const connecte = serveur.etat === 'connecte';

  const valider = async () => {
    setEnvoi(true); setErreur('');
    try {
      await connecterChauffeur(email, motDePasse);
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEnvoi(false); }
  };

  return (
    <EcranAvecClavier style={{ flex: 1, backgroundColor: c.sol }}>
      <ScrollView contentContainerStyle={{ padding: space.l }} keyboardShouldPersistTaps="handled">
        <Text style={[type.title, { marginBottom: space.s }]}>Espace chauffeur</Text>
        <Text style={[type.small, { marginBottom: space.xl }]}>Réservé à Fabrice : demandes, planning, clients et tarifs.</Text>
        {connecte ? (
          <>
            <Champ libelle="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="username" />
            <Champ libelle="Mot de passe" value={motDePasse} onChangeText={setMotDePasse} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={valider} />
            {erreur ? <View style={{ marginBottom: space.m }}><Note ton="erreur">{erreur}</Note></View> : null}
            <Bouton titre="Se connecter" onPress={valider} chargement={envoi} desactive={!email.includes('@') || motDePasse.length < 6} />
          </>
        ) : (
          <Note ton="alerte">Serveur indisponible : la connexion n’est pas possible pour l’instant.</Note>
        )}
        <View style={{ marginTop: space.xxl, gap: space.s }}>
          <Text style={type.small}>Pour présenter l’espace chauffeur sans compte, avec des clients et des courses fictifs :</Text>
          <Bouton titre="Voir la démonstration" variante="contour" icone="eye-outline" onPress={entrerDemoChauffeur} />
        </View>
      </ScrollView>
    </EcranAvecClavier>
  );
}
