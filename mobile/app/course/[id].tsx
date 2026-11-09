import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { dateCourte, duree, estTransfert, euros, fraisAnnulation, lieu, offre, photos } from '../../src/data';
import { useStore } from '../../src/store';
import { Couleurs, f, radius, space } from '../../src/theme';
import { DelaiConfirmation } from '../../src/DelaiConfirmation';
import { BlocAcompte, ResteAPayer } from '../../src/Acompte';
import { ListeDocuments, useDocumentsCourse } from '../../src/Documents';
import { useMessagerie } from '../../src/messagerie';
import { useTheme } from '../../src/useTheme';
import { Bouton, Itineraire, Ligne, Note, Teinture, Titre, appelerFabrice, estFermee, teintesDe } from '../../src/ui';

export default function DetailCourse() {
  const { c, type, s } = useTheme(creerStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { courses, annuler: annulerCourse } = useStore();
  const [annuler, setAnnuler] = useState(false);
  const { nonLus } = useMessagerie();
  const course = courses.find((x) => x.id === id);
  const { docs } = useDocumentsCourse(id, !!course && !course.demo);
  if (!course) return null;
  const t = teintesDe(c)[course.statut];
  const o = offre(course.offreId);
  const depart = lieu(course.departId);
  const active = course.statut === 'envoyee' || course.statut === 'acompte_attendu' || course.statut === 'confirmee';
  // Seule une course confirmée entraîne des frais (une demande en attente s'annule toujours sans frais).
  const frais = course.statut === 'confirmee' ? fraisAnnulation(course.date) : { taux: 0, texte: 'Votre demande n’est pas encore confirmée : annulation sans frais.' };
  const plusDe24h = course.date.getTime() - Date.now() > 24 * 3600000;
  const transfert = estTransfert(depart);

  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }}>
      <View style={[s.entete, { backgroundColor: t.fond }, estFermee(course.statut) && { borderWidth: 1, borderColor: c.trait }]}>
        <Text style={[type.label, { color: t.texte2 }]}>{t.libelle}</Text>
        <Text style={[s.date, { color: t.texte }]}>
          {dateCourte(course.date)} · {course.heure.replace(':', 'h')}
        </Text>
        <View style={{ marginVertical: space.l }}>
          <Itineraire departId={course.departId} arriveeId={course.arriveeId} couleur={t.texte} couleur2={t.texte2} grand />
        </View>
        {!estFermee(course.statut) ? <Teinture statut={course.statut} surFonce={course.statut === 'confirmee'} /> : null}
      </View>

      {course.statut === 'envoyee' ? (
        <View style={{ marginTop: space.l }}>
          <DelaiConfirmation course={course} />
        </View>
      ) : null}
      {course.statut === 'acompte_attendu' ? (
        <View style={{ marginTop: space.l }}>
          <BlocAcompte course={course} />
        </View>
      ) : null}
      {course.acomptePaye && active ? <View style={{ marginTop: space.l }}><ResteAPayer course={course} /></View> : null}
      {course.statut === 'expiree' ? (
        <View style={{ marginTop: space.l, gap: space.s }}>
          <Note ton="alerte" icone="time-outline">L'acompte n'a pas été réglé à temps : cette course n'est pas réservée. Rien ne vous a été facturé.</Note>
          <Bouton titre="Appeler Fabrice" variante="contour" icone="call-outline" onPress={appelerFabrice} />
        </View>
      ) : null}
      {course.statut === 'refusee' ? (
        <View style={{ marginTop: space.l, gap: space.s }}>
          <Note ton="erreur" icone="close-circle-outline">
            Fabrice ne peut pas assurer cette course{course.motifRefus ? ` : ${course.motifRefus.toLowerCase()}` : ''}. Rien ne vous sera facturé.
          </Note>
          <Bouton titre="Appeler Fabrice" variante="contour" icone="call-outline" onPress={appelerFabrice} />
        </View>
      ) : null}

      {active && transfert ? (
        <Bouton titre="Afficher le panneau à mon nom" icone="id-card-outline" onPress={() => router.push({ pathname: '/panneau', params: { id: course.id } })} style={{ marginTop: space.l }} />
      ) : null}
      {active ? <Bouton titre="Appeler Fabrice" variante="contour" icone="call-outline" onPress={appelerFabrice} style={{ marginTop: space.m }} /> : null}
      {active && !course.demo ? (
        <Bouton
          titre={nonLus(course.id) ? `Messages · ${nonLus(course.id)} nouveau${nonLus(course.id) > 1 ? 'x' : ''}` : 'Écrire à Fabrice'}
          variante={nonLus(course.id) ? 'plein' : 'contour'}
          icone="chatbubbles-outline"
          onPress={() => router.push(`/conversation/${course.id}`)}
          style={{ marginTop: space.m }}
        />
      ) : null}

      <Titre>Détails</Titre>
      <View style={s.bloc}>
        <Ligne libelle="Véhicule" valeur={`${o.nom} · ${o.vehicule}`} />
        <Ligne libelle="Passagers" valeur={`${course.passagers} · ${course.bagages} bagage${course.bagages > 1 ? 's' : ''}`} />
        {course.numero ? <Ligne libelle="Vol / train" valeur={`${course.numero} (suivi)`} /> : null}
        <Ligne libelle="Distance" valeur={`${course.km.toLocaleString('fr-FR')} km · ${duree(course.minutes)}`} />
        <Ligne libelle="Prix" valeur={euros(course.montant)} fort />
        {course.acompteMontant ? <Ligne libelle={course.acomptePaye ? 'Acompte réglé' : 'Acompte'} valeur={euros(course.acompteMontant)} /> : null}
        <Ligne libelle="Paiement" valeur={course.acompteMontant ? `Reste ${euros(Math.max(0, course.montant - course.acompteMontant))} à bord` : 'À bord ou sur facture'} />
      </View>

      {docs.length ? (
        <>
          <Titre>Vos documents</Titre>
          <ListeDocuments docs={docs} />
          <Text style={[type.small, { marginTop: space.s }]}>Touchez un document pour l'ouvrir en PDF.</Text>
        </>
      ) : null}

      <Titre>Votre chauffeur</Titre>
      <View style={s.chauffeur}>
        <Image source={photos.fabrice} style={s.avatar} contentFit="cover" contentPosition="top" />
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>Fabrice</Text>
          <Text style={type.small}>{o.vehicule}</Text>
        </View>
        <Image source={o.photo} style={s.vehicule} contentFit="cover" />
      </View>

      {active ? (
        <View style={{ marginTop: space.xxl }}>
          {annuler ? (
            <View style={s.annuler}>
              <Text style={type.h3}>Annuler cette course ?</Text>
              <Text style={[type.small, { marginVertical: space.s }]}>{frais.texte}</Text>
              {course.acomptePaye && course.acompteMontant ? (
                <Text style={[type.small, { marginBottom: space.s }]}>
                  {plusDe24h
                    ? `L’acompte de ${euros(course.acompteMontant)} vous sera remboursé sur votre carte.`
                    : `L’acompte de ${euros(course.acompteMontant)} est conservé : l’annulation intervient moins de 24 h avant la course (CGV).`}
                </Text>
              ) : null}
              {frais.taux > 0 ? (
                <Text style={[type.body, { fontWeight: '700', color: c.erreur, marginBottom: space.s }]}>
                  Frais : {euros(course.montant * frais.taux)}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s }}>
                <Bouton titre="Garder" variante="contour" onPress={() => setAnnuler(false)} style={{ flex: 1 }} />
                <Bouton titre="Annuler la course" onPress={() => { annulerCourse(course.id).catch(() => {}); setAnnuler(false); }} style={{ flex: 1.4, backgroundColor: '#B3261E' }} />
              </View>
            </View>
          ) : (
            <Bouton titre="Annuler la course" variante="texte" onPress={() => setAnnuler(true)} />
          )}
        </View>
      ) : null}
      {course.demo ? <Text style={[type.small, { marginTop: space.xl }]}>Prototype : course d'exemple.</Text> : null}
    </ScrollView>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  entete: { borderRadius: radius.l, padding: space.l + 2 },
  date: { fontFamily: f.display, fontSize: 34, marginTop: 2 },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  chauffeur: { flexDirection: 'row', alignItems: 'center', gap: space.m, backgroundColor: c.surface, borderRadius: radius.l, padding: space.m },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.bain2 },
  vehicule: { width: 96, height: 64, borderRadius: radius.s, backgroundColor: c.bain2 },
  annuler: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.l, borderWidth: 1, borderColor: c.erreurFond },
});
