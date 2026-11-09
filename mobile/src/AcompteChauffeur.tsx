import { useEffect, useState } from 'react';
import { Linking, Share, Text, View } from 'react-native';
import { Mission, useChauffeur } from './chauffeur';
import { heureDe } from './chauffeurUi';
import { dateCourte, euros } from './data';
import { Paiement, paiementsDe } from './serveur';
import { space } from './theme';
import { Bouton, Note } from './ui';
import { useTheme } from './useTheme';

// Acompte vu par Fabrice sur une course : en attente, réglé, à rembourser, ou lien à envoyer
// à un client qui a réservé par téléphone.
export function AcompteChauffeur({ m }: { m: Mission }) {
  const { type } = useTheme();
  const { lienAcompte, rembourser, demo, annoncer } = useChauffeur();
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [action, setAction] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const montant = Number(m.acompte_montant ?? 0);
  const paye = !!m.acompte_paye_le;

  useEffect(() => {
    if (demo) return;
    paiementsDe(m.id).then(setPaiements).catch(() => {});
  }, [m.id, m.statut, m.acompte_paye_le, demo]);

  const aRembourser = paiements.reduce((t, p) => t + (p.statut === 'paye' ? Math.max(0, Number(p.remboursement_du) - Number(p.rembourse)) : 0), 0);
  const rembourse = paiements.reduce((t, p) => t + Number(p.rembourse), 0);

  const faire = async (nom: string, fn: () => Promise<void>) => {
    setAction(nom); setErreur('');
    try { await fn(); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setAction(null); }
  };
  const obtenirLien = async () => {
    const url = await lienAcompte(m.id);
    if (!url) throw new Error('Démonstration : aucun lien de paiement réel.');
    return url;
  };
  const message = (url: string) =>
    `Bonjour ${m.nom.split(' ')[0]}, pour confirmer votre course du ${dateCourte(m.date)} à ${heureDe(m.date)}, merci de régler l'acompte en ligne (paiement sécurisé SumUp) : ${url}\nFabrice, Volant3ranches VTC`;

  const avenir = m.date.getTime() > Date.now();
  const lienPossible = m.statut === 'confirmee' && !paye && avenir;

  return (
    <View style={{ gap: space.s }}>
      {m.statut === 'acompte_attendu' ? (
        <Note ton="alerte" icone="card-outline">
          Acompte de {euros(montant)} attendu{m.acompte_limite ? ` avant ${heureDe(new Date(m.acompte_limite))}` : ''}. La course sera confirmée à réception, sinon le créneau se libère.
        </Note>
      ) : null}
      {paye ? (
        <Note ton="feuille" icone="checkmark-circle-outline">
          Acompte de {euros(montant)} réglé le {dateCourte(new Date(m.acompte_paye_le!))}.
          {m.statut === 'annulee'
            ? rembourse > 0 ? ` ${euros(rembourse)} remboursé${rembourse > 1 ? 's' : ''}.` : aRembourser > 0 ? ' Remboursement en attente.' : ' Conservé (annulation tardive, CGV).'
            : ` Reste à encaisser : ${euros(Math.max(0, m.montant - montant))}.`}
        </Note>
      ) : null}
      {aRembourser > 0 ? (
        <Bouton titre={`Rembourser ${euros(aRembourser)}`} variante="contour" icone="return-down-back-outline" chargement={action === 'rembourser'}
          onPress={() => faire('rembourser', async () => { const r = await rembourser(m.id); annoncer(`${euros(r)} remboursés à ${m.nom}.`); setPaiements(await paiementsDe(m.id)); })} />
      ) : null}
      {lienPossible ? (
        <>
          <Text style={type.small}>Le client a réservé hors de l'appli : envoyez-lui un lien pour régler l'acompte en ligne.</Text>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Bouton titre="Partager le lien" icone="share-outline" variante="contour" chargement={action === 'partager'} style={{ flex: 1, paddingHorizontal: space.s }}
              onPress={() => faire('partager', async () => { await Share.share({ message: message(await obtenirLien()) }); })} />
            <Bouton titre="Par email" icone="mail-outline" variante="contour" desactive={!m.email} chargement={action === 'email'} style={{ flex: 1, paddingHorizontal: space.s }}
              onPress={() => faire('email', async () => {
                const url = await obtenirLien();
                await Linking.openURL(`mailto:${m.email}?subject=${encodeURIComponent('Acompte pour votre course Volant3ranches')}&body=${encodeURIComponent(message(url))}`);
              })} />
          </View>
        </>
      ) : null}
      {erreur ? <Note ton="erreur">{erreur}</Note> : null}
    </View>
  );
}
