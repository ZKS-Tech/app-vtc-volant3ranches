import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Source, useChauffeur } from '../src/chauffeur';
import { dateCourte, euros, lieu, offre, offres, prix, trajet } from '../src/data';
import { dansJours } from '../src/store';
import { Couleurs, f, radius, sansContourWeb, space } from '../src/theme';
import { Bouton, Champ, Compteur, Note, Segment, Titre } from '../src/ui';
import { useItineraire } from '../src/geo';
import { EcranAvecClavier } from '../src/Clavier';
import { useTheme } from '../src/useTheme';

const jours = Array.from({ length: 30 }, (_, i) => dansJours(i));
const decaler = (heure: string, minutes: number) => {
  const [h, m] = heure.split(':').map(Number);
  const t = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Course saisie par Fabrice (réservation par téléphone, email…) : enregistrée directement confirmée.
export default function Saisie() {
  const { c, type, s } = useTheme(creerStyles);
  const insets = useSafeAreaInsets();
  const { saisie: sa, majSaisie, enregistrerSaisie, fiches, fiche, viderSaisie } = useChauffeur();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const client = fiche(sa.ficheId);

  const suggestions = useMemo(() => {
    const n = normaliser(sa.nom.trim());
    const tel = sa.telephone.replace(/\D/g, '');
    if (client || (n.length < 2 && tel.length < 3)) return [];
    return fiches.filter((x) => (n.length >= 2 && normaliser(x.nom).includes(n)) || (tel.length >= 3 && (x.telephone ?? '').replace(/\D/g, '').includes(tel))).slice(0, 4);
  }, [sa.nom, sa.telephone, fiches, client]);

  const depart = sa.departId ? lieu(sa.departId) : undefined;
  const arrivee = sa.arriveeId ? lieu(sa.arriveeId) : undefined;
  // Distance réelle (IGN). Si le service ne répond pas, Fabrice peut quand même enregistrer avec une
  // estimation ; la base retentera l'IGN à l'enregistrement.
  const it = useItineraire(depart, arrivee);
  const estimation = it.etat === 'erreur';
  const t = it.etat === 'ok' ? { km: it.itineraire.km, minutes: it.itineraire.minutes } : estimation && depart && arrivee ? trajet(depart, arrivee) : undefined;
  const calc = t ? prix(offre(sa.offreId), t.km, sa.jour, sa.heure, sa.allerRetour) : undefined;
  const transfert = depart?.type === 'aeroport' || depart?.type === 'gare' || arrivee?.type === 'aeroport' || arrivee?.type === 'gare';

  const enregistrer = async () => {
    setEnvoi(true); setErreur('');
    try {
      const m = await enregistrerSaisie();
      viderSaisie();
      router.replace(`/mission/${m.id}`);
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); } finally { setEnvoi(false); }
  };

  return (
    <EcranAvecClavier style={{ flex: 1, backgroundColor: c.sol }}>
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        <Text style={type.small}>Pour une réservation reçue par téléphone ou par email. La course est enregistrée directement comme confirmée.</Text>

        <Titre>Client</Titre>
        {client ? (
          <View style={[s.bloc, s.clientChoisi]}>
            <Ionicons name="person-circle-outline" size={28} color={c.accent} />
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>{client.nom}</Text>
              <Text style={type.small}>{client.telephone ?? client.email ?? ''}</Text>
            </View>
            <Bouton titre="Changer" variante="texte" onPress={() => majSaisie({ ficheId: undefined, nom: '', telephone: '', email: '' })} />
          </View>
        ) : (
          <>
            <Champ libelle="Nom du client" value={sa.nom} onChangeText={(v) => majSaisie({ nom: v })} placeholder="Tapez pour retrouver un client existant" />
            {suggestions.length ? (
              <View style={[s.bloc, { marginTop: -space.s, marginBottom: space.l }]}>
                {suggestions.map((x) => (
                  <Pressable key={x.id} onPress={() => majSaisie({ ficheId: x.id, nom: x.nom, telephone: x.telephone ?? '', email: x.email ?? '' })} style={({ pressed }) => [s.suggestion, pressed && { backgroundColor: c.bain1 }]}>
                    <Ionicons name="person-outline" size={18} color={c.accent} />
                    <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{x.nom}</Text>
                    <Text style={type.small}>{x.telephone ?? ''}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Champ libelle="Téléphone" value={sa.telephone} onChangeText={(v) => majSaisie({ telephone: v })} keyboardType="phone-pad" placeholder="06 12 34 56 78" />
            <Champ libelle="Email (facultatif)" value={sa.email} onChangeText={(v) => majSaisie({ email: v })} keyboardType="email-address" autoCapitalize="none" placeholder="client@exemple.fr" />
          </>
        )}

        <Titre>Trajet</Titre>
        <View style={s.bloc}>
          <Pressable onPress={() => router.push({ pathname: '/choix-lieu', params: { cible: 'depart' } })} style={s.lieu}>
            <View style={s.rond} />
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Départ</Text>
              <Text style={[type.body, { fontWeight: '600', color: depart ? c.encre : c.pierre }]}>{depart?.nom ?? 'Choisir'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.pierre} />
          </Pressable>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.trait, marginLeft: 30 }} />
          <Pressable onPress={() => router.push({ pathname: '/choix-lieu', params: { cible: 'arrivee' } })} style={s.lieu}>
            <View style={s.carre} />
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Arrivée</Text>
              <Text style={[type.body, { fontWeight: '600', color: arrivee ? c.encre : c.pierre }]}>{arrivee?.nom ?? 'Choisir'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.pierre} />
          </Pressable>
        </View>

        <Titre>Date et heure</Titre>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.l }} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s }}>
          {jours.map((j, i) => {
            const actif = j.toDateString() === sa.jour.toDateString();
            const [nomJour, num, mois] = dateCourte(j).split(' ');
            return (
              <Pressable key={i} onPress={() => majSaisie({ jour: j })} style={[s.jour, actif && s.jourActif]} accessibilityState={{ selected: actif }} accessibilityLabel={dateCourte(j)}>
                <Text style={[type.label, actif && { color: c.surCuve2 }]}>{i === 0 ? 'auj.' : i === 1 ? 'demain' : nomJour}</Text>
                <Text style={[s.jourNum, actif && { color: c.blanc }]}>{num}</Text>
                <Text style={[type.label, actif && { color: c.surCuve2 }]}>{mois}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={[s.bloc, s.heure]}>
          <Pressable onPress={() => majSaisie({ heure: decaler(sa.heure, -15) })} style={s.heureBtn} accessibilityLabel="15 minutes plus tôt"><Ionicons name="remove" size={24} color={c.accent} /></Pressable>
          <Text style={s.heureTexte}>{sa.heure.replace(':', 'h')}</Text>
          <Pressable onPress={() => majSaisie({ heure: decaler(sa.heure, 15) })} style={s.heureBtn} accessibilityLabel="15 minutes plus tard"><Ionicons name="add" size={24} color={c.accent} /></Pressable>
        </View>
        <View style={{ marginTop: space.m }}>
          <Segment options={[{ id: 'aller', titre: 'Aller simple' }, { id: 'ar', titre: 'Aller-retour' }]} valeur={sa.allerRetour ? 'ar' : 'aller'} onChange={(v) => majSaisie({ allerRetour: v === 'ar' })} />
        </View>

        <Titre>Passagers et véhicule</Titre>
        <View style={[s.bloc, { paddingVertical: space.s }]}>
          <Compteur libelle="Passagers" icone="people-outline" valeur={sa.passagers} min={1} max={8} onChange={(n) => majSaisie({ passagers: n, offreId: n > 3 ? 'van' : sa.offreId })} />
          <Compteur libelle="Bagages" icone="briefcase-outline" valeur={sa.bagages} min={0} max={8} onChange={(n) => majSaisie({ bagages: n, offreId: n > 3 ? 'van' : sa.offreId })} />
        </View>
        <View style={{ marginTop: space.m }}>
          <Segment
            options={offres.map((o) => ({ id: o.id, titre: o.id === 'tesla' ? 'Tesla' : 'Van' }))}
            valeur={sa.offreId}
            onChange={(v) => {
              const o = offre(v);
              if (sa.passagers > o.passagersMax || sa.bagages > o.bagagesMax) return setErreur(`${o.vehicule} : ${o.passagersMax} passagers et ${o.bagagesMax} bagages au maximum.`);
              setErreur(''); majSaisie({ offreId: v });
            }}
          />
        </View>
        {transfert ? (
          <View style={{ marginTop: space.l }}>
            <Champ libelle="Numéro de vol ou de train (facultatif)" value={sa.numero} onChangeText={(v) => majSaisie({ numero: v })} autoCapitalize="characters" placeholder="AF 6127" />
          </View>
        ) : null}

        <Titre>Prix</Titre>
        <View style={[s.bloc, { padding: space.l, gap: space.m }]}>
          {calc && t ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text style={[type.small, { flex: 1 }]}>{estimation ? 'Estimation (itinéraire indisponible)' : 'Tarif calculé'} · {t.km.toLocaleString('fr-FR')} km{calc.raisons.length ? ` · majoré (${calc.raisons.join(', ')})` : ''}</Text>
                <Text style={s.prix}>{euros(calc.montant)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                <Text style={[type.body, { flex: 1 }]}>Prix convenu avec le client</Text>
                <TextInput value={sa.prixAjuste} onChangeText={(v) => majSaisie({ prixAjuste: v })} keyboardType="decimal-pad" placeholder={String(calc.montant).replace('.', ',')} placeholderTextColor={c.placeholder} style={s.montant} accessibilityLabel="Prix ajusté en euros" />
                <Text style={type.body}>€</Text>
              </View>
              <Text style={type.small}>Laissez vide pour appliquer le tarif calculé.</Text>
            </>
          ) : (
            <Text style={type.small}>{depart && arrivee ? 'Calcul de l’itinéraire par la route…' : 'Choisissez le départ et l’arrivée pour calculer le prix.'}</Text>
          )}
        </View>

        <Titre>Réservation reçue par</Titre>
        <Segment
          options={[{ id: 'telephone', titre: 'Téléphone' }, { id: 'email', titre: 'Email' }, { id: 'autre', titre: 'Autre' }]}
          valeur={sa.source as Exclude<Source, 'appli'>}
          onChange={(v) => majSaisie({ source: v })}
        />
        <View style={{ marginTop: space.l }}>
          <Champ libelle="Commentaire (facultatif)" value={sa.commentaire} onChangeText={(v) => majSaisie({ commentaire: v })} multiline placeholder="Siège enfant, arrêt intermédiaire…" />
        </View>
        {erreur ? <Note ton="erreur">{erreur}</Note> : null}
      </ScrollView>
      <View style={[s.pied, { paddingBottom: insets.bottom + space.m }]}>
        <Bouton titre={calc ? `Enregistrer la course · ${euros(sa.prixAjuste ? Number(sa.prixAjuste.replace(',', '.')) || 0 : calc.montant)}` : 'Enregistrer la course'} icone="checkmark" onPress={enregistrer} chargement={envoi} desactive={!calc} />
      </View>
    </EcranAvecClavier>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  clientChoisi: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 48, borderRadius: radius.s },
  lieu: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 60 },
  rond: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: c.accent },
  carre: { width: 10, height: 10, backgroundColor: c.accent },
  jour: { width: 60, paddingVertical: space.s, borderRadius: radius.m, backgroundColor: c.surface, alignItems: 'center', borderWidth: 1, borderColor: c.trait },
  jourActif: { backgroundColor: c.action, borderColor: c.action },
  jourNum: { fontFamily: f.display, fontSize: 22, color: c.encre },
  heure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.m, paddingVertical: space.s },
  heureBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.bain1, alignItems: 'center', justifyContent: 'center' },
  heureTexte: { fontFamily: f.display, fontSize: 44, color: c.fort },
  prix: { fontFamily: f.display, fontSize: 26, color: c.fort },
  montant: { borderWidth: 1, borderColor: c.trait, borderRadius: radius.s, paddingHorizontal: space.m, minHeight: 44, width: 100, fontSize: 17, color: c.encre, textAlign: 'right', ...sansContourWeb },
  pied: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.l, paddingTop: space.m, backgroundColor: c.sol, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait },
});
