import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateCourte, euros, lieu, offre, prix, trajet } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, radius, space } from '../src/theme';
import { EcranAvecClavier } from '../src/Clavier';
import { useTheme } from '../src/useTheme';
import { Bouton, couleursSwitch, Champ, Ligne, Note, Titre, appelerFabrice } from '../src/ui';

export default function Coordonnees() {
  const { c, type, s } = useTheme(creerStyles);
  const { brouillon: b, maj, envoyer, compte } = useStore();
  const insets = useSafeAreaInsets();
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'echec'>('saisie');
  const [tente, setTente] = useState(false);
  const [raison, setRaison] = useState('');
  // Coordonnées déjà connues (compte ou réservation précédente) : résumé, modifiable.
  const [modifier, setModifier] = useState(() => !(b.nom.trim().length > 1 && b.telephone.replace(/\D/g, '').length >= 10 && /.+@.+\..+/.test(b.email)));
  if (!b.departId || !b.arriveeId) return null;

  const depart = lieu(b.departId);
  const arrivee = lieu(b.arriveeId);
  const o = offre(b.offreId);
  const t = trajet(depart, arrivee);
  const p = prix(o, t.km, b.jour, b.heure, b.allerRetour);
  const telOk = b.telephone.replace(/\D/g, '').length >= 10;
  const mailOk = /.+@.+\..+/.test(b.email);
  const complet = b.nom.trim().length > 1 && telOk && mailOk && b.cgv;
  const attente = depart.type === 'aeroport' ? '30 min après l’atterrissage' : depart.type === 'gare' ? '15 min en gare' : '10 min';

  const valider = async () => {
    setTente(true);
    if (!complet) return;
    setEtat('envoi');
    try {
      const course = await envoyer();
      router.replace({ pathname: '/envoyee', params: { id: course.id } });
    } catch (e) {
      setRaison(e instanceof Error ? e.message : '');
      setEtat('echec');
    }
  };

  return (
    <EcranAvecClavier style={{ flex: 1, backgroundColor: c.sol }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Text style={type.small}>
          {compte ? 'Vos coordonnées viennent de votre compte.' : 'Pas besoin de compte : ces informations servent à Fabrice pour vous confirmer la course.'}
        </Text>
        <View style={{ marginTop: space.l }}>
          {modifier ? (
            <>
          <Champ libelle="Nom et prénom" placeholder="Claire Martin" autoComplete="name" textContentType="name" value={b.nom} onChangeText={(v) => maj({ nom: v })} />
          <Champ
            libelle="Téléphone"
            placeholder="06 12 34 56 78"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            value={b.telephone}
            onChangeText={(v) => maj({ telephone: v })}
            aide={tente && !telOk ? 'Indiquez un numéro à 10 chiffres : Fabrice vous enverra la confirmation par SMS.' : undefined}
          />
          <Champ
            libelle="Email"
            placeholder="claire.martin@email.fr"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={b.email}
            onChangeText={(v) => maj({ email: v })}
            aide={tente && !mailOk ? 'Indiquez une adresse email valide pour recevoir le récapitulatif.' : undefined}
          />
            </>
          ) : (
            <View style={s.resume}>
              <View style={{ flex: 1 }}>
                <Text style={type.label}>Réservé au nom de</Text>
                <Text style={[type.body, { fontWeight: '700', marginTop: 2 }]}>{b.nom}</Text>
                <Text style={type.small}>{b.telephone} · {b.email}</Text>
              </View>
              <Bouton titre="Modifier" variante="texte" onPress={() => setModifier(true)} />
            </View>
          )}
          <Champ libelle="Commentaire (facultatif)" placeholder="Siège enfant, arrêt intermédiaire…" value={b.commentaire} onChangeText={(v) => maj({ commentaire: v })} multiline />
        </View>

        <Titre>Récapitulatif</Titre>
        <View style={s.bloc}>
          <Ligne libelle="Départ" valeur={depart.nom} />
          <Ligne libelle="Arrivée" valeur={arrivee.nom} />
          <Ligne libelle="Date" valeur={`${dateCourte(b.jour)} à ${b.heure.replace(':', 'h')}`} />
          <Ligne libelle="Trajet" valeur={b.allerRetour ? 'Aller-retour' : 'Aller simple'} />
          <Ligne libelle="Passagers" valeur={`${b.passagers} · ${b.bagages} bagage${b.bagages > 1 ? 's' : ''}`} />
          {b.numero ? <Ligne libelle={depart.type === 'aeroport' || arrivee.type === 'aeroport' ? 'Vol' : 'Train'} valeur={b.numero} /> : null}
          <Ligne libelle="Véhicule" valeur={`${o.nom} · ${o.vehicule}`} />
          <Ligne libelle="Prix indicatif" valeur={euros(p.montant)} fort />
        </View>

        <View style={{ gap: space.s, marginTop: space.l }}>
          <Note ton="feuille" icone="time-outline">Attente gratuite : {attente}.</Note>
          <Note ton="bain" icone="calendar-outline">
            Annulation gratuite jusqu'à 24 h avant. Entre 24 h et 12 h : 50 %. Moins de 12 h : 100 %.
          </Note>
        </View>

        <Pressable style={s.cgv} onPress={() => maj({ cgv: !b.cgv })} accessibilityRole="switch" accessibilityState={{ checked: b.cgv }}>
          <Text style={[type.body, { flex: 1 }]}>J'accepte les conditions générales de vente</Text>
          <Switch value={b.cgv} onValueChange={(v) => maj({ cgv: v })} {...couleursSwitch(c)} />
        </Pressable>
        {tente && !b.cgv ? <Text style={[type.small, { color: c.erreur }]}>Acceptez les CGV pour envoyer la demande.</Text> : null}

        {etat === 'echec' ? (
          <View style={{ marginTop: space.l, gap: space.s }}>
            <Note ton="erreur">
              {raison && raison !== 'reseau' && !/fetch|network|réseau/i.test(raison)
                ? `La demande n'est pas partie : ${raison}. Rien n'a été envoyé à Fabrice.`
                : "La demande n'est pas partie : la connexion a échoué. Rien n'a été envoyé à Fabrice. Réessayez, ou appelez-le directement."}
            </Note>
            <Bouton titre="Appeler Fabrice" variante="contour" icone="call-outline" onPress={appelerFabrice} />
          </View>
        ) : null}
      </ScrollView>
      <View style={[s.pied, { paddingBottom: insets.bottom + space.m }]}>
        <Bouton
          titre={etat === 'envoi' ? 'Envoi en cours…' : etat === 'echec' ? 'Réessayer l’envoi' : `Envoyer la demande · ${euros(p.montant)}`}
          chargement={etat === 'envoi'}
          onPress={valider}
        />
      </View>
    </EcranAvecClavier>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  resume: { flexDirection: 'row', alignItems: 'center', gap: space.m, backgroundColor: c.surface, borderRadius: radius.l, padding: space.l, marginBottom: space.l },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  cgv: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginTop: space.xl, minHeight: 48 },
  pied: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.l, paddingTop: space.m,
    backgroundColor: c.sol, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait,
  },
});
