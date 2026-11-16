import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Mission, Source, useChauffeur } from './chauffeur';
import { dateCourte, euros, montantAcompte, offre, regles } from './data';
import { Couleurs, f, radius, space } from './theme';
import { Bouton, IconName, teintesDe } from './ui';
import { useTheme } from './useTheme';

export const heureDe = (d: Date) => `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
export const iconeSource: Record<Source, IconName> = { appli: 'phone-portrait-outline', telephone: 'call-outline', email: 'mail-outline', autre: 'create-outline' };

export const appeler = (tel?: string | null) => tel && Linking.openURL(`tel:${tel.replace(/\s/g, '')}`).catch(() => {});
export const ecrireSms = (tel?: string | null) => tel && Linking.openURL(`sms:${tel.replace(/\s/g, '')}`).catch(() => {});
export const ecrireEmail = (email?: string | null) => email && Linking.openURL(`mailto:${email}`).catch(() => {});

// Ouvre le GPS vers le point de prise en charge (ou la destination).
export function ouvrirGps(appli: 'waze' | 'maps', lat?: number | null, lon?: number | null, libelle?: string) {
  const q = lat != null && lon != null ? `${lat},${lon}` : encodeURIComponent(libelle ?? '');
  const url = appli === 'waze'
    ? `https://waze.com/ul?${lat != null ? `ll=${q}` : `q=${q}`}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  Linking.openURL(url).catch(() => {});
}

// Temps qui passe : rafraîchit l'affichage toutes les 30 s (délais, « dans 2 h »).
export function useMaintenant(intervalle = 30000) {
  const [n, setN] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setN(new Date()), intervalle); return () => clearInterval(t); }, [intervalle]);
  return n;
}

export function dansCombien(d: Date, maintenant: Date) {
  const min = Math.round((d.getTime() - maintenant.getTime()) / 60000);
  if (min < -5) return 'en cours ou passée';
  if (min <= 0) return 'maintenant';
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  if (h < 24) return `dans ${h} h${r ? ` ${String(r).padStart(2, '0')}` : ''}`;
  return `dans ${Math.round(h / 24)} j`;
}

export function TrajetLibre({ m, couleur, couleur2 }: { m: Mission; couleur: string; couleur2: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.m }}>
      <View style={{ alignItems: 'center', paddingTop: 7 }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: couleur }} />
        <View style={{ width: 2, flex: 1, backgroundColor: couleur2, opacity: 0.5, marginVertical: 3 }} />
        <View style={{ width: 9, height: 9, backgroundColor: couleur }} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: '600', color: couleur }}>{m.depart_libelle}</Text>
          {m.depart_detail ? <Text style={{ fontSize: 14, color: couleur2 }}>{m.depart_detail}</Text> : null}
        </View>
        <View>
          <Text style={{ fontSize: 16, fontWeight: '600', color: couleur }}>{m.arrivee_libelle}</Text>
          {m.arrivee_detail ? <Text style={{ fontSize: 14, color: couleur2 }}>{m.arrivee_detail}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const motifs = ['Indisponible à cet horaire', 'Hors de ma zone', 'Véhicule inadapté'];

// Demande à traiter : le délai de 30 min, et Confirmer / Refuser sans quitter l'écran.
export function DemandeCarte({ m }: { m: Mission }) {
  const { c, type, s } = useTheme(creerStyles);
  const { repondre } = useChauffeur();
  const maintenant = useMaintenant(15000);
  const [refus, setRefus] = useState(false);
  const [envoi, setEnvoi] = useState<'oui' | 'non' | null>(null);
  const [erreur, setErreur] = useState('');
  const ecoule = (maintenant.getTime() - new Date(m.envoyee_le).getTime()) / 60000;
  const part = Math.min(1, ecoule / regles.delaiConfirmationMin);
  const depasse = ecoule >= regles.delaiConfirmationMin;
  const acompte = m.client_id ? montantAcompte(m.montant) : 0;
  const agir = async (accepter: boolean, motif?: string) => {
    setEnvoi(accepter ? 'oui' : 'non'); setErreur('');
    try { await repondre(m.id, accepter, motif); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); setEnvoi(null); }
  };
  return (
    <View style={s.demande}>
      <Pressable onPress={() => router.push(`/mission/${m.id}`)} accessibilityRole="button">
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
          <Text style={s.demandeDate}>{dateCourte(m.date)} · {heureDe(m.date)}</Text>
          <Text style={[s.prix, { marginLeft: 'auto' }]}>{euros(m.montant)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: space.m }}>
          <Ionicons name={iconeSource[m.source]} size={14} color={c.pierre} />
          <Text style={type.small}>{m.nom}{m.langue === 'en' ? ' (anglais)' : ''} · {offre(m.offre_id as 'tesla' | 'van').nom} · {m.passagers} pass.{m.numero_vol_train ? ` · ${m.numero_vol_train}` : ''}</Text>
        </View>
        <TrajetLibre m={m} couleur={c.encre} couleur2={c.pierre} />
      </Pressable>
      <View style={s.delai}>
        <View style={[s.delaiFond, { backgroundColor: c.bain1 }]}>
          <View style={{ width: `${part * 100}%`, height: '100%', borderRadius: 3, backgroundColor: depasse ? c.alerte : c.action }} />
        </View>
        <Text style={[type.label, { color: depasse ? c.alerte : c.pierre }]}>
          {depasse ? `En attente depuis ${Math.floor(ecoule)} min` : `Reçue il y a ${Math.max(0, Math.floor(ecoule))} min · reste ${Math.ceil(regles.delaiConfirmationMin - ecoule)} min`}
        </Text>
      </View>
      {erreur ? <Text style={[type.small, { color: c.erreur, marginBottom: space.s }]}>{erreur}</Text> : null}
      {refus ? (
        <View style={{ gap: space.s }}>
          <Text style={type.label}>Motif du refus (le client le verra)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {motifs.map((mo) => (
              <Pressable key={mo} onPress={() => agir(false, mo)} style={s.motif} disabled={!!envoi}>
                <Text style={[type.small, { color: c.encre }]}>{mo}</Text>
              </Pressable>
            ))}
          </View>
          <Bouton titre="Annuler" variante="texte" onPress={() => setRefus(false)} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.s }}>
          <Bouton titre="Refuser" variante="contour" onPress={() => setRefus(true)} desactive={!!envoi} style={{ flex: 1 }} />
          <Bouton titre={acompte ? 'Accepter' : 'Confirmer'} icone="checkmark" onPress={() => agir(true)} chargement={envoi === 'oui'} style={{ flex: 1.6 }} />
        </View>
      )}
      {acompte && !refus ? (
        <Text style={[type.small, { marginTop: space.s }]}>
          Le client aura {regles.acompteDelaiMin >= 60 ? `${regles.acompteDelaiMin / 60} h` : `${regles.acompteDelaiMin} min`} pour régler l'acompte de {euros(acompte)} ; la course sera confirmée à réception.
        </Text>
      ) : null}
    </View>
  );
}

// Ligne compacte : planning, historique d'un client, liste du jour.
export function LigneMission({ m, avecDate }: { m: Mission; avecDate?: boolean }) {
  const { c, type, s } = useTheme(creerStyles);
  const t = teintesDe(c)[m.statut];
  const barre = m.statut === 'annulee' || m.statut === 'refusee' || m.statut === 'expiree';
  const court: Partial<Record<Mission['statut'], string>> = { acompte_attendu: 'Acompte attendu', expiree: 'Expirée' };
  return (
    <Pressable onPress={() => router.push(`/mission/${m.id}`)} style={({ pressed }) => [s.ligne, pressed && { backgroundColor: c.bain1 }]} accessibilityRole="button">
      <View style={{ width: avecDate ? 78 : 56 }}>
        {avecDate ? <Text style={[type.label, { fontSize: 12 }]}>{dateCourte(m.date)}</Text> : null}
        <Text style={[s.heure, barre && { textDecorationLine: 'line-through', color: c.pierre }]}>{heureDe(m.date)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{m.depart_libelle} → {m.arrivee_libelle}</Text>
        <Text style={type.small} numberOfLines={1}>{m.nom}{m.langue === 'en' ? ' (anglais)' : ''} · {offre(m.offre_id as 'tesla' | 'van').vehicule}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[type.body, { fontWeight: '700' }, barre && { color: c.pierre }]}>{euros(m.statut === 'annulee' ? Number(m.frais_annulation ?? 0) : m.montant)}</Text>
        <View style={[s.pastille, { backgroundColor: m.statut === 'confirmee' ? c.action : m.statut === 'envoyee' ? c.bain2 : m.statut === 'acompte_attendu' ? c.alerteFond : c.delaveFond }]}>
          <Text style={[s.pastilleTexte, { color: m.statut === 'confirmee' ? c.blanc : m.statut === 'envoyee' ? c.fort : m.statut === 'acompte_attendu' ? c.alerte : c.pierre }]}>{court[m.statut] ?? t.libelle.replace(' par Fabrice', '')}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function Chiffre({ valeur, libelle, fort }: { valeur: string; libelle: string; fort?: boolean }) {
  const { c, type } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: f.display, fontSize: fort ? 30 : 22, color: c.fort }} numberOfLines={1} adjustsFontSizeToFit>{valeur}</Text>
      <Text style={type.label}>{libelle}</Text>
    </View>
  );
}

export function Vide({ icone, titre, texte }: { icone: IconName; titre: string; texte: string }) {
  const { c, type } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.s }}>
      <Ionicons name={icone} size={34} color={c.bain3} />
      <Text style={type.h3}>{titre}</Text>
      <Text style={[type.small, { textAlign: 'center', maxWidth: 280 }]}>{texte}</Text>
    </View>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  demande: { backgroundColor: c.surface, borderRadius: radius.l, padding: space.l, gap: space.m },
  demandeDate: { fontFamily: f.display, fontSize: 22, color: c.fort },
  prix: { fontFamily: f.displayMedium, fontSize: 20, color: c.fort },
  delai: { gap: 6 },
  delaiFond: { height: 6, borderRadius: 3, overflow: 'hidden' },
  motif: { borderWidth: 1, borderColor: c.trait, borderRadius: 20, paddingHorizontal: space.m, minHeight: 40, justifyContent: 'center', backgroundColor: c.sol },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, paddingHorizontal: space.s, borderRadius: radius.s, minHeight: 64 },
  heure: { fontFamily: f.display, fontSize: 22, color: c.fort },
  pastille: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  pastilleTexte: { fontSize: 11, fontWeight: '700' },
});

// Message bref après une action de Fabrice (style « snackbar »), en bas de l'écran.
export function Annonce({ bas }: { bas: number }) {
  const { c } = useTheme();
  const { annonce } = useChauffeur();
  const opacite = useRef(new Animated.Value(0)).current;
  const [texte, setTexte] = useState('');
  useEffect(() => {
    if (!annonce) return;
    setTexte(annonce.texte);
    opacite.setValue(0);
    Animated.sequence([
      Animated.timing(opacite, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(4200),
      Animated.timing(opacite, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [annonce?.id]);
  if (!texte) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute', left: space.l, right: space.l, bottom: bas, opacity: opacite,
        transform: [{ translateY: opacite.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        backgroundColor: c.encre, borderRadius: radius.m, paddingVertical: space.m, paddingHorizontal: space.l,
        flexDirection: 'row', gap: space.s, alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
      }}
    >
      <Ionicons name="checkmark-circle" size={20} color={c.feuille} />
      <Text style={{ color: c.sol, fontSize: 15, flex: 1 }}>{texte}</Text>
    </Animated.View>
  );
}
