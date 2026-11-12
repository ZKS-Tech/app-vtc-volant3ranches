import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { dateCourte, euros } from './data';
import { DocumentEmis, ModePaiement, chargerDocuments, ecouterDocuments, libelleMode, lienPdf, supabase } from './serveur';
import { Couleurs, radius, space } from './theme';
import { Bouton, Note } from './ui';
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
  return (
    <View>
      <Pressable
        onPress={async () => { setOuverture(true); setErreur(''); try { await ouvrirPdf(d); } catch (e) { setErreur(traduireErreur(e instanceof Error ? e.message : String(e))); } finally { setOuverture(false); } }}
        style={({ pressed }) => [s.ligne, trait && s.trait, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`${facture ? t('Facture') : t('Bon de commande')} ${d.numero}, ${euros(d.total_ttc)}, ${t('ouvrir le PDF')}`}
      >
        <View style={[s.icone, { backgroundColor: facture ? c.action : c.bain1 }]}>
          <Ionicons name={facture ? 'receipt-outline' : 'document-text-outline'} size={18} color={facture ? c.blanc : c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '600' }]}>{facture ? t('Facture') : t('Bon de commande')} {d.numero}</Text>
          <Text style={type.small} numberOfLines={1}>
            {detail && d.contenu.client?.nom ? `${d.contenu.client.entreprise || d.contenu.client.nom} · ` : ''}
            {dateCourte(new Date(d.emis_le))} · {euros(d.total_ttc)} {t('TTC')}{d.mode_paiement ? ` · ${t(libelleMode[d.mode_paiement])}` : ''}
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
  const tries = [...docs].sort((a, b) => (a.type === b.type ? 0 : a.type === 'facture' ? -1 : 1));
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

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: 56 },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait },
  icone: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  puce: { minHeight: 44, paddingHorizontal: space.l, borderRadius: 22, borderWidth: 1, borderColor: c.trait, justifyContent: 'center', backgroundColor: c.surface },
});
