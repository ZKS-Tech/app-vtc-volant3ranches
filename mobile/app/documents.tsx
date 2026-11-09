import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useChauffeur } from '../src/chauffeur';
import { Chiffre, LigneMission, Vide } from '../src/chauffeurUi';
import { LigneDocument } from '../src/Documents';
import { euros } from '../src/data';
import { DocumentEmis, ModePaiement, chargerDocuments, libelleMode } from '../src/serveur';
import { Couleurs, radius, space } from '../src/theme';
import { Bouton, Ligne, Note, Segment, Titre } from '../src/ui';
import { useTheme } from '../src/useTheme';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const csvCellule = (v: string | number | null | undefined) => {
  const t = v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v;
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

// Factures et bons de commande d'un mois : totaux HT / TVA / TTC, modes de paiement, courses
// encore à facturer, liste des pièces et export pour la comptabilité.
export default function Documents() {
  const { c, type, s } = useTheme(creerStyles);
  const { missions, demo } = useChauffeur();
  const [mois, setMois] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [docs, setDocs] = useState<DocumentEmis[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [onglet, setOnglet] = useState<'facture' | 'commande'>('facture');
  const fin = new Date(mois.getFullYear(), mois.getMonth() + 1, 1);

  const charger = async () => {
    if (demo) return;
    setChargement(true); setErreur('');
    try { setDocs(await chargerDocuments({ depuis: mois, jusqua: fin })); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setChargement(false); }
  };
  useEffect(() => { charger(); }, [mois.getTime(), demo]);

  const factures = docs.filter((d) => d.type === 'facture');
  const bons = docs.filter((d) => d.type === 'commande');
  const somme = (xs: DocumentEmis[], k: 'total_ht' | 'tva' | 'total_ttc') => xs.reduce((t, d) => t + d[k], 0);
  const parMode = useMemo(() => {
    const m = new Map<ModePaiement, number>();
    for (const f of factures) {
      const acompte = Number(f.contenu.acompte ?? 0);
      if (acompte > 0) m.set('en_ligne', (m.get('en_ligne') ?? 0) + acompte);
      if (f.mode_paiement) m.set(f.mode_paiement, (m.get(f.mode_paiement) ?? 0) + f.total_ttc - acompte);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [docs]);
  // Courses effectuées ce mois-ci, sans facture : à contrôler.
  const facturees = new Set(factures.map((f) => f.course_id));
  const aFacturer = missions.filter((m) => m.statut === 'terminee' && m.date >= mois && m.date < fin && !facturees.has(m.id))
    .sort((a, b) => +a.date - +b.date);

  const exporter = async () => {
    const lignes = [
      ['Type', 'Numéro', 'Date', 'Client', 'Entreprise', 'Date course', 'Total HT', 'TVA', 'Total TTC', 'Acompte en ligne', 'Mode de paiement'].join(';'),
      ...[...docs].reverse().map((d) => [
        d.type === 'facture' ? 'Facture' : 'Bon de commande', d.numero, new Date(d.emis_le).toLocaleDateString('fr-FR'),
        d.contenu.client?.nom ?? '', d.contenu.client?.entreprise ?? '', d.contenu.course?.date ?? '',
        d.total_ht, d.tva, d.total_ttc, Number(d.contenu.acompte ?? 0), d.mode_paiement ? libelleMode[d.mode_paiement] : '',
      ].map(csvCellule).join(';')),
    ];
    await Share.share({ title: `Volant3ranches ${MOIS[mois.getMonth()]} ${mois.getFullYear()}`, message: lignes.join('\n') });
  };

  const liste = onglet === 'facture' ? factures : bons;
  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }}
      refreshControl={<RefreshControl refreshing={chargement} onRefresh={charger} tintColor={c.accent} />}>
      <View style={s.mois}>
        <Pressable onPress={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))} style={s.fleche} accessibilityLabel="Mois précédent" hitSlop={6}>
          <Ionicons name="chevron-back" size={22} color={c.accent} />
        </Pressable>
        <Text style={[type.h2, { flex: 1, textAlign: 'center' }]}>{MOIS[mois.getMonth()]} {mois.getFullYear()}</Text>
        <Pressable onPress={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))} style={s.fleche} accessibilityLabel="Mois suivant" hitSlop={6}>
          <Ionicons name="chevron-forward" size={22} color={c.accent} />
        </Pressable>
      </View>

      {demo ? <Note ton="bain" icone="eye-outline">Démonstration : les factures et bons de commande sont émis seulement avec le serveur.</Note> : null}
      {erreur ? <Note ton="erreur">{erreur}</Note> : null}

      <View style={[s.bloc, { flexDirection: 'row', paddingVertical: space.l, gap: space.m, marginTop: space.m }]}>
        <Chiffre valeur={euros(somme(factures, 'total_ttc')).replace(',00', '')} libelle="facturé TTC" fort />
        <Chiffre valeur={String(factures.length)} libelle={`facture${factures.length > 1 ? 's' : ''}`} />
        <Chiffre valeur={String(bons.length)} libelle={`bon${bons.length > 1 ? 's' : ''} de cde`} />
      </View>

      <Titre>Factures du mois</Titre>
      <View style={s.bloc}>
        <Ligne libelle="Total HT" valeur={euros(somme(factures, 'total_ht'))} />
        <Ligne libelle="TVA (10 %)" valeur={euros(somme(factures, 'tva'))} />
        <Ligne libelle="Total TTC" valeur={euros(somme(factures, 'total_ttc'))} fort />
        {parMode.map(([m, v]) => <Ligne key={m} libelle={`dont ${libelleMode[m].toLowerCase()}`} valeur={euros(v)} />)}
      </View>
      <Text style={[type.small, { marginTop: space.s }]}>
        Réservations confirmées (bons de commande) : {euros(somme(bons, 'total_ttc'))} TTC.
      </Text>

      {aFacturer.length ? (
        <>
          <Titre>À facturer ({aFacturer.length})</Titre>
          <Text style={[type.small, { marginBottom: space.s }]}>Courses effectuées ce mois-ci sans facture.</Text>
          <View style={[s.bloc, { paddingHorizontal: space.s }]}>{aFacturer.map((m) => <LigneMission key={m.id} m={m} avecDate />)}</View>
        </>
      ) : null}

      <Titre>Pièces émises</Titre>
      <Segment options={[{ id: 'facture', titre: `Factures (${factures.length})` }, { id: 'commande', titre: `Bons (${bons.length})` }]} valeur={onglet} onChange={setOnglet} />
      {liste.length ? (
        <View style={[s.bloc, { marginTop: space.m }]}>{liste.map((d, i) => <LigneDocument key={d.id} d={d} trait={i > 0} detail />)}</View>
      ) : (
        <Vide icone="document-outline" titre="Aucune pièce ce mois-ci" texte={onglet === 'facture' ? 'Les factures sont émises quand vous marquez une course comme effectuée.' : 'Un bon de commande est émis à chaque course confirmée.'} />
      )}
      {docs.length ? <Bouton titre="Exporter le mois (tableur)" icone="share-outline" variante="contour" onPress={exporter} style={{ marginTop: space.l }} /> : null}
      {liste.length ? <Text style={[type.small, { marginTop: space.s }]}>Touchez une pièce pour ouvrir son PDF.</Text> : null}
      <Bouton titre="Chiffre d'affaires détaillé" variante="texte" onPress={() => router.push('/chiffre-affaires')} style={{ marginTop: space.m, alignSelf: 'flex-start' }} />
    </ScrollView>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  mois: { flexDirection: 'row', alignItems: 'center', marginBottom: space.s },
  fleche: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
});
