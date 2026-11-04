import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useChauffeur } from '../src/chauffeur';
import { OffreId, dateCourte, joursFeries, offres, regles } from '../src/data';
import { useStore } from '../src/store';
import { Couleurs, radius, sansContourWeb, space } from '../src/theme';
import { Bouton, Compteur, Note, Titre, couleursSwitch } from '../src/ui';
import { useTheme } from '../src/useTheme';

const nombre = (t: string) => Number(t.replace(',', '.'));
const texte = (n: number) => String(n).replace('.', ',');

// Tarifs et jours fériés : la base les applique immédiatement à toutes les nouvelles demandes.
export default function Tarifs() {
  const { c, type, s } = useTheme(creerStyles);
  const { majOffre, majParametres, ajouterJourFerie, retirerJourFerie, demo } = useChauffeur();
  useStore(); // se met à jour quand les tarifs changent
  const [prixForm, setPrixForm] = useState(() => Object.fromEntries(offres.map((o) => [o.id, { jour: texte(o.prixKmJour), majore: texte(o.prixKmMajore), minimum: texte(o.minimum) }])) as Record<OffreId, { jour: string; majore: string; minimum: string }>);
  const [nuit, setNuit] = useState({ debut: regles.nuitDebut, fin: regles.nuitFin });
  const [weekend, setWeekend] = useState(regles.majorationWeekend);
  const [attente, setAttente] = useState({ aeroport: regles.attenteAeroportMin, gare: regles.attenteGareMin, standard: regles.attenteStandardMin });
  const [nouveauFerie, setNouveauFerie] = useState('');
  const [etat, setEtat] = useState<{ quoi: string; ok?: string; erreur?: string } | null>(null);

  const faire = async (quoi: string, fn: () => Promise<void>, ok: string) => {
    setEtat({ quoi });
    try { await fn(); setEtat({ quoi, ok }); } catch (e) { setEtat({ quoi, erreur: e instanceof Error ? e.message : String(e) }); }
  };
  const retour = (quoi: string) => etat?.quoi === quoi && (etat.ok || etat.erreur) ? (
    <View style={{ marginTop: space.s }}><Note ton={etat.erreur ? 'erreur' : 'feuille'} icone={etat.erreur ? undefined : 'checkmark-circle-outline'}>{etat.erreur ?? etat.ok}</Note></View>
  ) : null;

  const aVenir = joursFeries.filter((j) => j >= new Date().toISOString().slice(0, 10));
  const ferieValide = /^\d{4}-\d{2}-\d{2}$/.test(nouveauFerie) && !Number.isNaN(Date.parse(nouveauFerie));

  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
      <Text style={type.small}>
        {demo ? 'Démonstration : les changements ne sont pas enregistrés.' : 'Les nouveaux tarifs s’appliquent tout de suite aux nouvelles demandes. Les courses déjà enregistrées gardent leur prix.'}
      </Text>

      {offres.map((o) => {
        const v = prixForm[o.id];
        const maj = (p: Partial<typeof v>) => setPrixForm((x) => ({ ...x, [o.id]: { ...x[o.id], ...p } }));
        const valide = [v.jour, v.majore, v.minimum].every((x) => nombre(x) > 0);
        return (
          <View key={o.id}>
            <Titre>{o.nom} · {o.vehicule}</Titre>
            <View style={s.bloc}>
              <ChampPrix libelle="Prix au km, jour" valeur={v.jour} onChange={(t) => maj({ jour: t })} unite="€/km" s={s} c={c} type={type} />
              <ChampPrix libelle="Prix au km, majoré" sous="nuit, week-end, jours fériés" valeur={v.majore} onChange={(t) => maj({ majore: t })} unite="€/km" s={s} c={c} type={type} trait />
              <ChampPrix libelle="Course minimum" valeur={v.minimum} onChange={(t) => maj({ minimum: t })} unite="€" s={s} c={c} type={type} trait />
            </View>
            <Bouton
              titre={`Enregistrer ${o.nom}`}
              variante="contour"
              desactive={!valide}
              chargement={etat?.quoi === o.id && !etat.ok && !etat.erreur}
              onPress={() => faire(o.id, () => majOffre(o.id, { prix_km_jour: nombre(v.jour), prix_km_majore: nombre(v.majore), minimum: nombre(v.minimum) }), 'Tarifs enregistrés.')}
              style={{ marginTop: space.m }}
            />
            {retour(o.id)}
          </View>
        );
      })}

      <Titre>Majorations et attentes</Titre>
      <View style={[s.bloc, { paddingVertical: space.s }]}>
        <Compteur libelle={`Nuit à partir de ${nuit.debut}h`} icone="moon-outline" valeur={nuit.debut} min={18} max={23} onChange={(n) => setNuit((x) => ({ ...x, debut: n }))} />
        <Compteur libelle={`Fin de nuit à ${nuit.fin}h`} icone="sunny-outline" valeur={nuit.fin} min={4} max={8} onChange={(n) => setNuit((x) => ({ ...x, fin: n }))} />
        <View style={s.ligneSwitch}>
          <Ionicons name="calendar-outline" size={22} color={c.accent} />
          <Text style={[type.body, { flex: 1 }]}>Majoration samedi et dimanche</Text>
          <Switch value={weekend} onValueChange={setWeekend} {...couleursSwitch(c)} accessibilityLabel="Majoration le week-end" />
        </View>
        <Compteur libelle={`Attente aéroport ${attente.aeroport} min`} icone="airplane-outline" valeur={attente.aeroport} min={0} max={60} onChange={(n) => setAttente((x) => ({ ...x, aeroport: n }))} />
        <Compteur libelle={`Attente gare ${attente.gare} min`} icone="train-outline" valeur={attente.gare} min={0} max={60} onChange={(n) => setAttente((x) => ({ ...x, gare: n }))} />
        <Compteur libelle={`Attente standard ${attente.standard} min`} icone="time-outline" valeur={attente.standard} min={0} max={60} onChange={(n) => setAttente((x) => ({ ...x, standard: n }))} />
      </View>
      <Bouton
        titre="Enregistrer les majorations"
        variante="contour"
        chargement={etat?.quoi === 'param' && !etat.ok && !etat.erreur}
        onPress={() => faire('param', () => majParametres({
          nuit_debut: nuit.debut, nuit_fin: nuit.fin, majoration_weekend: weekend,
          attente_aeroport_min: attente.aeroport, attente_gare_min: attente.gare, attente_standard_min: attente.standard,
        }), 'Majorations enregistrées.')}
        style={{ marginTop: space.m }}
      />
      {retour('param')}

      <Titre>Jours fériés à venir</Titre>
      <View style={s.bloc}>
        {aVenir.map((j, i) => (
          <View key={j} style={[s.ferie, i > 0 && s.trait]}>
            <Text style={[type.body, { flex: 1 }]}>{dateCourte(new Date(`${j}T12:00:00`))} {j.slice(0, 4)}</Text>
            <Pressable onPress={() => faire('ferie', () => retirerJourFerie(j), 'Jour retiré.')} hitSlop={10} accessibilityLabel={`Retirer le ${j}`}>
              <Ionicons name="close-circle-outline" size={22} color={c.pierre} />
            </Pressable>
          </View>
        ))}
        <View style={[s.ferie, s.trait]}>
          <TextInput value={nouveauFerie} onChangeText={setNouveauFerie} placeholder="AAAA-MM-JJ" placeholderTextColor={c.placeholder} style={[s.saisieFerie]} accessibilityLabel="Nouveau jour férié" />
          <Bouton titre="Ajouter" variante="texte" desactive={!ferieValide} onPress={() => faire('ferie', async () => { await ajouterJourFerie(nouveauFerie); setNouveauFerie(''); }, 'Jour ajouté.')} />
        </View>
      </View>
      {retour('ferie')}
    </ScrollView>
  );
}

function ChampPrix({ libelle, sous, valeur, onChange, unite, s, c, type, trait }: {
  libelle: string; sous?: string; valeur: string; onChange: (t: string) => void; unite: string; trait?: boolean;
  s: ReturnType<typeof creerStyles>; c: Couleurs; type: ReturnType<typeof useTheme>['type'];
}) {
  return (
    <View style={[s.champ, trait && s.trait]}>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{libelle}</Text>
        {sous ? <Text style={type.small}>{sous}</Text> : null}
      </View>
      <TextInput value={valeur} onChangeText={onChange} keyboardType="decimal-pad" style={s.montant} accessibilityLabel={libelle} placeholderTextColor={c.placeholder} />
      <Text style={[type.small, { width: 36 }]}>{unite}</Text>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  champ: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 60, paddingVertical: space.s },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait },
  montant: { borderWidth: 1, borderColor: c.trait, borderRadius: radius.s, paddingHorizontal: space.m, minHeight: 44, width: 84, fontSize: 17, color: c.encre, textAlign: 'right', ...sansContourWeb },
  ligneSwitch: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 56 },
  ferie: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 52 },
  saisieFerie: { flex: 1, fontSize: 17, color: c.encre, minHeight: 44, ...sansContourWeb },
});
