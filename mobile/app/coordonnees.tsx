import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateCourte, euros, heureAffichee, lieu, offre, prix, trajet } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, radius, space } from '../src/theme';
import { EcranAvecClavier } from '../src/Clavier';
import { useTheme } from '../src/useTheme';
import { Bouton, couleursSwitch, Champ, Ligne, Note, Titre, appelerFabrice } from '../src/ui';
import { evenement } from '../src/stats';
import { t, pluriel, traduireErreur } from '../src/i18n';

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
  const dist = trajet(depart, arrivee);
  const p = prix(o, dist.km, b.jour, b.heure, b.allerRetour);
  const telOk = b.telephone.replace(/\D/g, '').length >= 10;
  const mailOk = /.+@.+\..+/.test(b.email);
  const complet = b.nom.trim().length > 1 && telOk && mailOk && b.cgv;
  const attente = depart.type === 'aeroport' ? t('30 min après l’atterrissage') : depart.type === 'gare' ? t('15 min en gare') : '10 min';

  const valider = async () => {
    setTente(true);
    if (!complet) return;
    setEtat('envoi');
    evenement('coordonnees_saisies');
    try {
      const course = await envoyer();
      evenement('demande_envoyee', { offre: b.offreId, prix: p.montant, km: dist.km, aller_retour: b.allerRetour, passagers: b.passagers });
      router.replace({ pathname: '/envoyee', params: { id: course.id } });
    } catch (e) {
      setRaison(e instanceof Error ? e.message : '');
      evenement('demande_echec_envoi', { erreur: e instanceof Error ? e.message.slice(0, 60) : 'inconnue' });
      setEtat('echec');
    }
  };

  return (
    <EcranAvecClavier style={{ flex: 1, backgroundColor: c.sol }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Text style={type.small}>
          {compte ? t('Vos coordonnées viennent de votre compte.') : t('Pas besoin de compte : ces informations servent à Fabrice pour vous confirmer la course.')}
        </Text>
        <View style={{ marginTop: space.l }}>
          {modifier ? (
            <>
          <Champ libelle={t('Nom et prénom')} placeholder="Claire Martin" autoComplete="name" textContentType="name" value={b.nom} onChangeText={(v) => maj({ nom: v })} />
          <Champ
            libelle={t('Téléphone')}
            placeholder="06 12 34 56 78"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            value={b.telephone}
            onChangeText={(v) => maj({ telephone: v })}
            aide={tente && !telOk ? t('Indiquez un numéro de téléphone valide : Fabrice pourra vous joindre le jour de la course.') : undefined}
          />
          <Champ
            libelle={t('Email')}
            placeholder="claire.martin@email.fr"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={b.email}
            onChangeText={(v) => maj({ email: v })}
            aide={tente && !mailOk ? t('Indiquez une adresse email valide pour recevoir le récapitulatif.') : undefined}
          />
            </>
          ) : (
            <View style={s.resume}>
              <View style={{ flex: 1 }}>
                <Text style={type.label}>{t('Réservé au nom de')}</Text>
                <Text style={[type.body, { fontWeight: '700', marginTop: 2 }]}>{b.nom}</Text>
                <Text style={type.small}>{b.telephone} · {b.email}</Text>
              </View>
              <Bouton titre={t('Modifier')} variante="texte" onPress={() => setModifier(true)} />
            </View>
          )}
          <Champ libelle={t('Commentaire (facultatif)')} placeholder={t('Siège enfant, arrêt intermédiaire…')} value={b.commentaire} onChangeText={(v) => maj({ commentaire: v })} multiline />
        </View>

        <Titre>{t('Récapitulatif')}</Titre>
        <View style={s.bloc}>
          <Ligne libelle={t('Départ')} valeur={t(depart.nom)} />
          <Ligne libelle={t('Arrivée')} valeur={t(arrivee.nom)} />
          <Ligne libelle={t('Date')} valeur={`${dateCourte(b.jour)} ${t('à')} ${heureAffichee(b.heure)}`} />
          <Ligne libelle={t('Trajet')} valeur={b.allerRetour ? t('Aller-retour') : t('Aller simple')} />
          <Ligne libelle={t('Passagers')} valeur={`${b.passagers} · ${pluriel(b.bagages, ['bagage', 'bagages'], ['bag', 'bags'])}`} />
          {b.numero ? <Ligne libelle={depart.type === 'aeroport' || arrivee.type === 'aeroport' ? t('Vol') : t('Train')} valeur={b.numero} /> : null}
          <Ligne libelle={t('Véhicule')} valeur={`${t(o.nom)} · ${t(o.vehicule)}`} />
          <Ligne libelle={t('Prix indicatif')} valeur={euros(p.montant)} fort />
        </View>

        <View style={{ gap: space.s, marginTop: space.l }}>
          <Note ton="feuille" icone="time-outline">{t('Attente gratuite : {attente}.', { attente })}</Note>
          <Note ton="bain" icone="calendar-outline">
            {t("Annulation gratuite jusqu'à 24 h avant. Entre 24 h et 12 h : 50 %. Moins de 12 h : 100 %.")}
          </Note>
        </View>

        <Pressable style={s.cgv} onPress={() => maj({ cgv: !b.cgv })} accessibilityRole="switch" accessibilityState={{ checked: b.cgv }}>
          <Text style={[type.body, { flex: 1 }]}>{t("J'accepte les conditions générales de vente")}</Text>
          <Switch value={b.cgv} onValueChange={(v) => maj({ cgv: v })} {...couleursSwitch(c)} />
        </Pressable>
        {tente && !b.cgv ? <Text style={[type.small, { color: c.erreur }]}>{t('Acceptez les CGV pour envoyer la demande.')}</Text> : null}

        {etat === 'echec' ? (
          <View style={{ marginTop: space.l, gap: space.s }}>
            <Note ton="erreur">
              {raison && raison !== 'reseau' && !/fetch|network|réseau/i.test(raison)
                ? t("La demande n'est pas partie : {raison}. Rien n'a été envoyé à Fabrice.", { raison: traduireErreur(raison) })
                : t("La demande n'est pas partie : la connexion a échoué. Rien n'a été envoyé à Fabrice. Réessayez, ou appelez-le directement.")}
            </Note>
            <Bouton titre={t('Appeler Fabrice')} variante="contour" icone="call-outline" onPress={appelerFabrice} />
          </View>
        ) : null}
      </ScrollView>
      <View style={[s.pied, { paddingBottom: insets.bottom + space.m }]}>
        <Bouton
          titre={etat === 'envoi' ? t('Envoi en cours…') : etat === 'echec' ? t('Réessayer l’envoi') : `${t('Envoyer la demande')} · ${euros(p.montant)}`}
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
