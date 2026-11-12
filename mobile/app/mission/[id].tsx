import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { libelleSource, useChauffeur } from '../../src/chauffeur';
import { DemandeCarte, TrajetLibre, appeler, dansCombien, ecrireEmail, ecrireSms, heureDe, ouvrirGps, useMaintenant } from '../../src/chauffeurUi';
import { dateCourte, duree, euros, fraisAnnulation, offre } from '../../src/data';
import { Couleurs, f, radius, sansContourWeb, space } from '../../src/theme';
import { Bouton, Ligne, Note, Teinture, Titre, teintesDe } from '../../src/ui';
import { useMessagerie } from '../../src/messagerie';
import { AcompteChauffeur } from '../../src/AcompteChauffeur';
import { Facturer, ListeDocuments, useDocumentsCourse } from '../../src/Documents';
import { useTheme } from '../../src/useTheme';

// Une course vue par Fabrice : le client, le trajet, les actions selon le statut.
export default function Mission() {
  const { c, type, s } = useTheme(creerStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { missions, fiche, terminer, annuler, noter, facturer, demo } = useChauffeur();
  const { nonLus } = useMessagerie();
  const maintenant = useMaintenant();
  const m = missions.find((x) => x.id === id);
  const [note, setNote] = useState(m?.note_chauffeur ?? '');
  const [noteSauvee, setNoteSauvee] = useState(true);
  const [annulation, setAnnulation] = useState(false);
  const [frais, setFrais] = useState('');
  const [action, setAction] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [finCourse, setFinCourse] = useState(false);
  const { docs } = useDocumentsCourse(id, !demo);
  useEffect(() => { setNote(m?.note_chauffeur ?? ''); setNoteSauvee(true); }, [m?.note_chauffeur]);
  if (!m) return <Text style={[type.small, { padding: space.l }]}>Course introuvable.</Text>;

  const t = teintesDe(c)[m.statut];
  const o = offre(m.offre_id as 'tesla' | 'van');
  const fi = fiche(m.fiche_id);
  const conseil = fraisAnnulation(m.date);
  const faire = async (nom: string, fn: () => Promise<void>) => {
    setAction(nom); setErreur('');
    try { await fn(); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setAction(null); }
  };

  if (m.statut === 'envoyee') {
    return (
      <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, gap: space.l }}>
        <DemandeCarte m={m} />
        <Details />
      </ScrollView>
    );
  }

  function Details() {
    return (
      <>
        <View style={s.bloc}>
          <Pressable onPress={() => fi && router.push(`/fiche/${fi.id}`)} disabled={!fi} style={s.client}>
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>{m!.nom}</Text>
              {m!.langue === 'en' ? <Text style={[type.small, { color: c.accent, fontWeight: '700' }]}>Client anglophone : appli, notifications et emails en anglais</Text> : null}
              <Text style={type.small}>{m!.telephone || 'Pas de téléphone'}{m!.email ? ` · ${m!.email}` : ''}</Text>
              {fi?.notes ? <Text style={[type.small, { color: c.feuilleEncre, marginTop: 4 }]}>{fi.notes}</Text> : null}
            </View>
            {fi ? <Ionicons name="chevron-forward" size={18} color={c.pierre} /> : null}
          </Pressable>
          <View style={{ flexDirection: 'row', gap: space.s, paddingBottom: space.l }}>
            <Bouton titre="Appeler" icone="call-outline" variante="contour" onPress={() => appeler(m!.telephone)} desactive={!m!.telephone} style={{ flex: 1, paddingHorizontal: space.s }} />
            <Bouton titre="SMS" icone="chatbubble-outline" variante="contour" onPress={() => ecrireSms(m!.telephone)} desactive={!m!.telephone} style={{ flex: 1, paddingHorizontal: space.s }} />
            <Bouton titre="Email" icone="mail-outline" variante="contour" onPress={() => ecrireEmail(m!.email)} desactive={!m!.email} style={{ flex: 1, paddingHorizontal: space.s }} />
          </View>
          {m!.client_id ? (
            <Bouton
              titre={nonLus(m!.id) ? `Messages · ${nonLus(m!.id)} nouveau${nonLus(m!.id) > 1 ? 'x' : ''}` : 'Écrire dans l’appli (gratuit)'}
              variante={nonLus(m!.id) ? 'plein' : 'texte'}
              icone="chatbubbles-outline"
              onPress={() => router.push(`/conversation/${m!.id}`)}
              style={{ marginTop: -space.s, marginBottom: space.m }}
            />
          ) : (
            <Text style={[type.small, { marginTop: -space.s, marginBottom: space.l }]}>Client sans l’appli : messagerie indisponible.</Text>
          )}
        </View>
        <View style={s.bloc}>
          <Ligne libelle="Véhicule" valeur={`${o.nom} · ${o.vehicule}`} />
          <Ligne libelle="Passagers" valeur={`${m!.passagers} · ${m!.bagages} bagage${m!.bagages > 1 ? 's' : ''}`} />
          {m!.numero_vol_train ? <Ligne libelle="Vol / train" valeur={m!.numero_vol_train} /> : null}
          <Ligne libelle="Trajet" valeur={`${m!.aller_retour ? 'Aller-retour · ' : ''}${Number(m!.distance_km).toLocaleString('fr-FR')} km${m!.duree_min ? ` · ${duree(m!.duree_min)}` : ''}`} />
          <Ligne libelle="Prix" valeur={`${euros(m!.montant)}${m!.prix_ajuste ? ' (ajusté)' : ''}`} fort />
          {m!.majorations?.length ? <Ligne libelle="Majoration" valeur={m!.majorations.join(', ')} /> : null}
          <Ligne libelle="Réservée par" valeur={`${libelleSource[m!.source]} · ${dateCourte(new Date(m!.envoyee_le))}`} />
          {m!.statut === 'annulee' ? <Ligne libelle="Frais d'annulation" valeur={euros(Number(m!.frais_annulation ?? 0))} /> : null}
          {m!.statut === 'refusee' && m!.motif_refus ? <Ligne libelle="Motif du refus" valeur={m!.motif_refus} /> : null}
        </View>
        {m!.commentaire ? <Note ton="feuille" icone="chatbox-ellipses-outline">Message du client : « {m!.commentaire} »</Note> : null}
      </>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl, gap: space.l }} keyboardShouldPersistTaps="handled">
      <View style={[s.entete, { backgroundColor: t.fond }, (m.statut === 'annulee' || m.statut === 'refusee' || m.statut === 'expiree') && { borderWidth: 1, borderColor: c.trait }]}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={[type.label, { color: t.texte2 }]}>{t.libelle.replace('par Fabrice', '')}</Text>
          {m.statut === 'confirmee' ? <Text style={[type.label, { color: t.texte2 }]}>{dansCombien(m.date, maintenant)}</Text> : null}
        </View>
        <Text style={[s.date, { color: t.texte }]}>{dateCourte(m.date)} · {heureDe(m.date)}</Text>
        <View style={{ marginVertical: space.l }}>
          <TrajetLibre m={m} couleur={t.texte} couleur2={t.texte2} />
        </View>
        {m.statut === 'confirmee' || m.statut === 'terminee' ? <Teinture statut={m.statut} surFonce={m.statut === 'confirmee'} /> : null}
      </View>

      {m.statut === 'confirmee' ? (
        <View style={{ gap: space.s }}>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Bouton titre="Waze" icone="navigate-outline" variante="contour" onPress={() => ouvrirGps('waze', m.depart_lat, m.depart_lon, m.depart_libelle)} style={{ flex: 1 }} />
            <Bouton titre="Maps" icone="map-outline" variante="contour" onPress={() => ouvrirGps('maps', m.depart_lat, m.depart_lon, m.depart_libelle)} style={{ flex: 1 }} />
          </View>
          {finCourse ? null : <Bouton titre="Course effectuée" icone="checkmark-done" onPress={() => setFinCourse(true)} />}
        </View>
      ) : null}
      {m.statut === 'confirmee' && finCourse ? (
        <View style={{ gap: space.s }}>
          <Facturer
            titre="Course effectuée"
            rappel={m.acompte_paye_le ? `Acompte de ${euros(Number(m.acompte_montant ?? 0))} déjà réglé en ligne : reste ${euros(Math.max(0, m.montant - Number(m.acompte_montant ?? 0)))} encaissé à bord.` : `${euros(m.montant)} encaissés à bord.`}
            onFacturer={async (mode) => { await facturer(m.id, mode); setFinCourse(false); }}
          />
          <Bouton titre="Terminer sans facture pour l'instant" variante="texte" chargement={action === 'terminer'} onPress={() => faire('terminer', async () => { await terminer(m.id); setFinCourse(false); })} />
        </View>
      ) : null}
      {!demo && !docs.some((d) => d.type === 'facture') && (m.statut === 'terminee' || (m.statut === 'annulee' && Number(m.frais_annulation ?? 0) > 0)) ? (
        <Facturer
          titre={m.statut === 'annulee' ? `Facturer les frais d'annulation (${euros(Number(m.frais_annulation))})` : 'Facturer la course'}
          onFacturer={(mode) => facturer(m.id, mode)}
        />
      ) : null}
      {docs.length ? (
        <View style={{ gap: space.s }}>
          <Text accessibilityRole="header" style={type.h3}>Documents</Text>
          <ListeDocuments docs={docs} />
          {fi && !fi.adresse && !docs.some((d) => d.type === 'facture') ? (
            <Bouton titre="Ajouter l'adresse de facturation du client" variante="texte" icone="business-outline" onPress={() => router.push(`/fiche/${fi.id}`)} style={{ alignSelf: 'flex-start' }} />
          ) : null}
        </View>
      ) : null}
      {erreur ? <Note ton="erreur">{erreur}</Note> : null}
      <AcompteChauffeur m={m} />

      <Details />

      <Titre style={{ marginTop: space.s, marginBottom: 0 }}>Note personnelle</Titre>
      <View style={s.bloc}>
        <TextInput
          value={note}
          onChangeText={(v) => { setNote(v); setNoteSauvee(false); }}
          placeholder="Visible par vous seul : code portail, bagage volumineux…"
          placeholderTextColor={c.placeholder}
          multiline
          style={s.note}
        />
        {!noteSauvee ? <Bouton titre="Enregistrer la note" variante="texte" onPress={() => faire('note', async () => { await noter(m.id, note); setNoteSauvee(true); })} chargement={action === 'note'} style={{ alignSelf: 'flex-start', marginBottom: space.s }} /> : null}
      </View>

      {m.statut === 'confirmee' || m.statut === 'acompte_attendu' ? (
        annulation ? (
          <View style={[s.bloc, { padding: space.l, gap: space.m }]}>
            <Text style={type.h3}>Annuler la course</Text>
            <Text style={type.small}>Selon les CGV : {conseil.texte} ({euros(m.montant * conseil.taux)})</Text>
            {m.acompte_paye_le ? <Text style={type.small}>L'acompte de {euros(Number(m.acompte_montant ?? 0))} sera remboursé au client.</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
              <Text style={type.body}>Frais facturés</Text>
              <TextInput value={frais} onChangeText={setFrais} keyboardType="decimal-pad" placeholder={String(m.montant * conseil.taux).replace('.', ',')} placeholderTextColor={c.placeholder} style={[s.montant]} />
              <Text style={type.body}>€</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Bouton titre="Garder" variante="contour" onPress={() => setAnnulation(false)} style={{ flex: 1 }} />
              <Bouton
                titre="Annuler la course"
                chargement={action === 'annuler'}
                onPress={() => faire('annuler', async () => { await annuler(m.id, Number((frais || String(m.montant * conseil.taux)).replace(',', '.')) || 0); setAnnulation(false); })}
                style={{ flex: 1.4, backgroundColor: '#B3261E' }}
              />
            </View>
          </View>
        ) : (
          <Bouton titre="Annuler la course (client qui prévient…)" variante="texte" onPress={() => setAnnulation(true)} />
        )
      ) : null}
    </ScrollView>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  entete: { borderRadius: radius.l, padding: space.l + 2 },
  date: { fontFamily: f.display, fontSize: 32, marginTop: 2 },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  client: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.l },
  note: { minHeight: 70, fontSize: 16, color: c.encre, paddingVertical: space.m, textAlignVertical: 'top', ...sansContourWeb },
  montant: { borderWidth: 1, borderColor: c.trait, borderRadius: radius.s, paddingHorizontal: space.m, minHeight: 44, minWidth: 90, fontSize: 17, color: c.encre, ...sansContourWeb },
});
