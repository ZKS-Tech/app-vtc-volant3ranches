import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { dateCourte, euros } from './data';
import { DocumentEmis, ModePaiement, chargerDocuments, ecouterDocuments, emettreAvoir, libelleMode, lienPdf, resteFacture, supabase } from './serveur';
import { Couleurs, radius, space } from './theme';
import { Bouton, Champ, Note, Segment } from './ui';
import { useTheme } from './useTheme';
import { evenement } from './stats';
import { t, traduireErreur } from './i18n';

// Documents d'une course (bon de commande, facture), mis à jour en temps réel.
export function useDocumentsCourse(courseId: string, actif = true) {
  const [docs, setDocs] = useState<DocumentEmis[]>([]);
  const recharger = useCallback(() => {
    if (!actif || !supabase) return;
    chargerDocuments({ courseId }).then(setDocs).catch(() => {});
  }, [courseId, actif]);
  useEffect(() => {
    recharger();
    const canal = actif ? ecouterDocuments(recharger) : null;
    return () => { canal?.unsubscribe(); };
  }, [recharger, actif]);
  return { docs, recharger };
}

// Ouvre le PDF (créé par le serveur à la première demande).
export async function ouvrirPdf(d: DocumentEmis) {
  evenement('document_ouvert', { type_document: d.type });
  const { url } = await lienPdf(d.id);
  await Linking.openURL(url);
}

export function LigneDocument({ d, trait, detail }: { d: DocumentEmis; trait?: boolean; detail?: boolean }) {
  const { c, type, s } = useTheme(creerStyles);
  const [ouverture, setOuverture] = useState(false);
  const [erreur, setErreur] = useState('');
  const facture = d.type === 'facture';
  const avoir = d.type === 'avoir';
  const nom = facture ? t('Facture') : avoir ? t('Avoir') : t('Bon de commande');
  return (
    <View>
      <Pressable
        onPress={async () => { setOuverture(true); setErreur(''); try { await ouvrirPdf(d); } catch (e) { setErreur(traduireErreur(e instanceof Error ? e.message : String(e))); } finally { setOuverture(false); } }}
        style={({ pressed }) => [s.ligne, trait && s.trait, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`${nom} ${d.numero}, ${euros(d.total_ttc)}, ${t('ouvrir le PDF')}`}
      >
        <View style={[s.icone, { backgroundColor: facture ? c.action : avoir ? c.alerteFond : c.bain1 }]}>
          <Ionicons name={facture ? 'receipt-outline' : avoir ? 'return-down-back-outline' : 'document-text-outline'} size={18} color={facture ? c.blanc : avoir ? c.alerte : c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '600' }]}>{nom} {d.numero}</Text>
          <Text style={type.small} numberOfLines={1}>
            {detail && d.contenu.client?.nom ? `${d.contenu.client.entreprise || d.contenu.client.nom} · ` : ''}
            {dateCourte(new Date(d.emis_le))} · {euros(d.total_ttc)} {t('TTC')}{avoir && d.contenu.facture?.numero ? ` · ${d.contenu.facture.numero}` : ''}{d.mode_paiement ? ` · ${t(libelleMode[d.mode_paiement])}` : ''}
          </Text>
        </View>
        {ouverture ? <ActivityIndicator color={c.accent} /> : <Ionicons name="download-outline" size={20} color={c.accent} />}
      </Pressable>
      {erreur ? <Text style={[type.small, { color: c.erreur, marginBottom: space.s }]}>{erreur}</Text> : null}
    </View>
  );
}

export function ListeDocuments({ docs }: { docs: DocumentEmis[] }) {
  const { s } = useTheme(creerStyles);
  if (!docs.length) return null;
  // Factures, puis avoirs, puis bons de commande ; les plus récents d'abord.
  const ordre = { facture: 0, avoir: 1, commande: 2 } as const;
  const tries = [...docs].sort((a, b) => ordre[a.type] - ordre[b.type] || b.emis_le.localeCompare(a.emis_le));
  return <View style={s.bloc}>{tries.map((d, i) => <LigneDocument key={d.id} d={d} trait={i > 0} />)}</View>;
}

const MODES: ModePaiement[] = ['cb', 'especes', 'cheque', 'virement'];

// Fin de course côté Fabrice : mode de paiement du solde, puis facture.
export function Facturer({ titre, onFacturer, rappel }: { titre: string; onFacturer: (mode: ModePaiement) => Promise<void>; rappel?: string }) {
  const { c, type, s } = useTheme(creerStyles);
  const [mode, setMode] = useState<ModePaiement | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  return (
    <View style={[s.bloc, { padding: space.l, gap: space.m }]}>
      <Text style={type.h3}>{titre}</Text>
      {rappel ? <Text style={type.small}>{rappel}</Text> : null}
      <Text style={type.label}>Payé par</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {MODES.map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[s.puce, mode === m && { backgroundColor: c.action, borderColor: c.action }]} accessibilityState={{ selected: mode === m }}>
            <Text style={[type.body, { fontWeight: '600', color: mode === m ? c.blanc : c.encre }]}>{libelleMode[m].replace('Carte bancaire', 'Carte')}</Text>
          </Pressable>
        ))}
      </View>
      {erreur ? <Note ton="erreur">{erreur}</Note> : null}
      <Bouton titre="Émettre la facture" icone="receipt-outline" desactive={!mode} chargement={envoi}
        onPress={async () => { if (!mode) return; setEnvoi(true); setErreur(''); try { await onFacturer(mode); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEnvoi(false); } }} />
      <Text style={type.small}>Numérotée automatiquement, elle ne pourra plus être modifiée.</Text>
    </View>
  );
}

const MOTIFS = ['Erreur de facturation', 'Geste commercial', 'Attente non due', 'Course annulée', 'Prix ajusté'];
const REMBOURSEMENTS: (ModePaiement | null)[] = [null, 'cb', 'especes', 'cheque', 'virement'];

// Avoir sur une facture (Fabrice) : total (la facture est annulée, la course peut être refacturée)
// ou partiel (un montant), avec motif et remboursement éventuel.
export function FaireAvoir({ facture, docs, onFait }: { facture: DocumentEmis; docs: DocumentEmis[]; onFait?: () => void }) {
  const { c, type, s } = useTheme(creerStyles);
  const reste = resteFacture(facture, docs);
  const [ouvert, setOuvert] = useState(false);
  const [total, setTotal] = useState<'total' | 'partiel'>('partiel');
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [mode, setMode] = useState<ModePaiement | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  if (reste <= 0) return null;
  const valeur = total === 'total' ? reste : Number(montant.replace(',', '.').replace(/[^\d.]/g, ''));
  const valide = valeur > 0 && valeur <= reste + 0.001 && motif.trim().length >= 3;
  if (!ouvert) {
    return (
      <Bouton titre={`Avoir sur ${facture.numero}`} variante="texte" icone="return-down-back-outline" onPress={() => setOuvert(true)} style={{ alignSelf: 'flex-start' }} />
    );
  }
  return (
    <View style={[s.bloc, { padding: space.l, gap: space.m }]}>
      <Text style={type.h3}>Avoir sur la facture {facture.numero}</Text>
      <Text style={type.small}>
        Une facture ne se modifie pas : l’avoir la corrige. Reste de la facture : {euros(reste)} TTC. Le client reçoit l’avoir en PDF par email.
      </Text>
      <Segment options={[{ id: 'partiel', titre: 'Partiel' }, { id: 'total', titre: 'Total' }]} valeur={total} onChange={setTotal} />
      {total === 'total' ? (
        <Text style={type.small}>Annule la facture ({euros(reste)}). Vous pourrez ensuite refacturer la course si besoin.</Text>
      ) : (
        <Champ libelle="Montant TTC à rembourser ou déduire" value={montant} onChangeText={setMontant} keyboardType="decimal-pad" placeholder={`Jusqu'à ${euros(reste)}`} />
      )}
      <Champ libelle="Motif (figure sur l'avoir)" value={motif} onChangeText={setMotif} placeholder="Ex. attente non due à l'aéroport" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: -space.s }}>
        {MOTIFS.map((m) => (
          <Pressable key={m} onPress={() => setMotif(m)} style={[s.puce, { minHeight: 36 }, motif === m && { backgroundColor: c.action, borderColor: c.action }]}>
            <Text style={[type.small, { fontWeight: '600', color: motif === m ? c.blanc : c.encre }]}>{m}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.label}>Remboursement</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
        {REMBOURSEMENTS.map((m) => (
          <Pressable key={m ?? 'aucun'} onPress={() => setMode(m)} style={[s.puce, mode === m && { backgroundColor: c.action, borderColor: c.action }]} accessibilityState={{ selected: mode === m }}>
            <Text style={[type.body, { fontWeight: '600', color: mode === m ? c.blanc : c.encre }]}>{m ? libelleMode[m].replace('Carte bancaire', 'Carte') : 'À valoir'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.small}>{mode ? 'Vous remboursez le client vous-même par ce moyen ; l’avoir l’indique.' : 'Pas de remboursement : le montant est à valoir sur une prochaine course.'}</Text>
      {erreur ? <Note ton="erreur">{erreur}</Note> : null}
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Bouton titre="Annuler" variante="contour" onPress={() => { setOuvert(false); setErreur(''); }} style={{ flex: 1 }} />
        <Bouton titre={valide ? `Émettre ${euros(-valeur)}` : 'Émettre l’avoir'} desactive={!valide} chargement={envoi} style={{ flex: 1.6 }}
          onPress={async () => {
            setEnvoi(true); setErreur('');
            try { await emettreAvoir(facture.id, total === 'total' ? null : valeur, motif.trim(), mode); setOuvert(false); setMontant(''); setMotif(''); setMode(null); onFait?.(); }
            catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEnvoi(false); }
          }} />
      </View>
      <Text style={type.small}>Numéroté automatiquement (AV-…), il ne pourra plus être modifié.</Text>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: 56 },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait },
  icone: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  puce: { minHeight: 44, paddingHorizontal: space.l, borderRadius: 22, borderWidth: 1, borderColor: c.trait, justifyContent: 'center', backgroundColor: c.surface },
});
