import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { recette, useChauffeur } from '../../src/chauffeur';
import { Chiffre, LigneMission, appeler, ecrireEmail, ecrireSms } from '../../src/chauffeurUi';
import { dateCourte, euros } from '../../src/data';
import { Couleurs, radius, space } from '../../src/theme';
import { Bouton, Champ, Note, Titre } from '../../src/ui';
import { EcranAvecClavier } from '../../src/Clavier';
import { useTheme } from '../../src/useTheme';

// Fiche client : coordonnées et notes modifiables, chiffres, historique, nouvelle course.
export default function FicheClient() {
  const { c, type, s } = useTheme(creerStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const nouveau = id === 'nouveau';
  const { fiche, missionsDe, sauverFiche, viderSaisie } = useChauffeur();
  const f = nouveau ? undefined : fiche(id);
  const versForm = (x?: typeof f) => ({ nom: x?.nom ?? '', telephone: x?.telephone ?? '', email: x?.email ?? '', notes: x?.notes ?? '', entreprise: x?.entreprise ?? '', adresse: x?.adresse ?? '', code_postal: x?.code_postal ?? '', ville: x?.ville ?? '' });
  const [form, setForm] = useState(() => versForm(f));
  const [modifie, setModifie] = useState(nouveau);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  useEffect(() => { if (f && !modifie) setForm(versForm(f)); }, [f?.maj_le]);
  if (!nouveau && !f) return <Text style={[type.small, { padding: space.l }]}>Client introuvable.</Text>;

  const ms = f ? missionsDe(f.id) : [];
  const faites = ms.filter((m) => m.statut === 'terminee');
  const total = ms.reduce((t, m) => t + recette(m), 0);
  const maj = (p: Partial<typeof form>) => { setForm((x) => ({ ...x, ...p })); setModifie(true); };
  const enregistrer = async () => {
    if (form.nom.trim().length < 2) return setErreur('Indiquez le nom du client.');
    setEnvoi(true); setErreur('');
    try {
      const r = await sauverFiche({ id: f?.id, ...form });
      setModifie(false);
      if (nouveau) router.replace(`/fiche/${r.id}`);
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEnvoi(false); }
  };

  return (
    <EcranAvecClavier style={{ backgroundColor: c.sol }}>
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: nouveau ? 'Nouveau client' : f!.nom }} />
      {f ? (
        <>
          <View style={{ flexDirection: 'row', gap: space.s, marginBottom: space.l }}>
            <Bouton titre="Appeler" icone="call-outline" onPress={() => appeler(f.telephone)} desactive={!f.telephone} style={{ flex: 1, paddingHorizontal: space.s }} />
            <Bouton titre="SMS" icone="chatbubble-outline" variante="contour" onPress={() => ecrireSms(f.telephone)} desactive={!f.telephone} style={{ flex: 1, paddingHorizontal: space.s }} />
            <Bouton titre="Email" icone="mail-outline" variante="contour" onPress={() => ecrireEmail(f.email)} desactive={!f.email} style={{ flex: 1, paddingHorizontal: space.s }} />
          </View>
          <View style={[s.bloc, { flexDirection: 'row', paddingVertical: space.l, gap: space.m }]}>
            <Chiffre valeur={euros(total).replace(',00', '')} libelle="au total" fort />
            <Chiffre valeur={String(faites.length)} libelle={`course${faites.length > 1 ? 's' : ''}`} />
            <Chiffre valeur={faites.length ? euros(faites.reduce((t, m) => t + m.montant, 0) / faites.length).replace(',00', '') : '—'} libelle="en moyenne" />
          </View>
          <Text style={[type.small, { marginTop: space.s }]}>
            {f.profil_id ? 'Réserve depuis l’appli' : 'Client enregistré par vous'} · fiche créée le {dateCourte(new Date(f.cree_le))}
          </Text>
        </>
      ) : null}

      <Titre>Coordonnées</Titre>
      <Champ libelle="Nom" value={form.nom} onChangeText={(v) => maj({ nom: v })} placeholder="Prénom Nom ou société" />
      <Champ libelle="Téléphone" value={form.telephone} onChangeText={(v) => maj({ telephone: v })} keyboardType="phone-pad" placeholder="06 12 34 56 78" />
      <Champ libelle="Email" value={form.email} onChangeText={(v) => maj({ email: v })} keyboardType="email-address" autoCapitalize="none" placeholder="client@exemple.fr" />
      <Text style={[type.label, { marginTop: space.l }]}>Facturation{f?.numero_client ? ` · client C-${String(f.numero_client).padStart(4, '0')}` : ''}</Text>
      <Champ libelle="Entreprise (facultatif)" value={form.entreprise} onChangeText={(v) => maj({ entreprise: v })} placeholder="Nom de la société à facturer" />
      <Champ libelle="Adresse" value={form.adresse} onChangeText={(v) => maj({ adresse: v })} placeholder="3 rue des Lices" />
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <View style={{ width: 120 }}><Champ libelle="Code postal" value={form.code_postal} onChangeText={(v) => maj({ code_postal: v })} keyboardType="number-pad" placeholder="81000" /></View>
        <View style={{ flex: 1 }}><Champ libelle="Ville" value={form.ville} onChangeText={(v) => maj({ ville: v })} placeholder="Albi" /></View>
      </View>
      <Champ libelle="Notes (visibles par vous seul)" value={form.notes} onChangeText={(v) => maj({ notes: v })} multiline placeholder="Siège enfant, facturation entreprise, préférences…" />
      {erreur ? <View style={{ marginBottom: space.m }}><Note ton="erreur">{erreur}</Note></View> : null}
      {modifie ? <Bouton titre={nouveau ? 'Créer le client' : 'Enregistrer'} onPress={enregistrer} chargement={envoi} /> : null}

      {f ? (
        <>
          <Bouton
            titre="Nouvelle course pour ce client"
            icone="add"
            variante="contour"
            onPress={() => { viderSaisie({ ficheId: f.id, nom: f.nom, telephone: f.telephone ?? '', email: f.email ?? '' }); router.push('/saisie'); }}
            style={{ marginTop: space.l }}
          />
          <Titre>Historique</Titre>
          {ms.length ? (
            <View style={[s.bloc, { paddingHorizontal: space.s, paddingVertical: space.s }]}>{ms.map((m) => <LigneMission key={m.id} m={m} avecDate />)}</View>
          ) : (
            <Text style={type.small}>Aucune course pour l’instant.</Text>
          )}
        </>
      ) : null}
    </ScrollView>
    </EcranAvecClavier>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
});
