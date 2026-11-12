import Ionicons from '@expo/vector-icons/Ionicons';
import { ReactNode, useEffect, useState } from 'react';
import Reanimated, { Easing as ReEasing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import {
  ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, TextInputProps, View,
  ViewStyle,
} from 'react-native';
import { contact, dateCourte, euros, heureAffichee, lieu, offre } from './data';
import type { Course, Statut } from './store';
import { Couleurs, f, radius, sansContourWeb, space } from './theme';
import { useTheme } from './useTheme';
import { evenement } from './stats';
import { t, L } from './i18n';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Bouton({
  titre, onPress, variante = 'plein', icone, desactive, chargement, style, surFonce,
}: {
  titre: string; onPress?: () => void; variante?: 'plein' | 'contour' | 'texte' | 'clair' | 'danger';
  icone?: IconName; desactive?: boolean; chargement?: boolean; style?: ViewStyle; surFonce?: boolean;
}) {
  const { c, type, s } = useTheme(creerStyles);
  const plein = variante === 'plein';
  const clair = variante === 'clair';
  const couleurTexte = variante === 'danger' ? c.erreur : plein || surFonce ? c.blanc : clair ? c.fort : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desactive, busy: !!chargement }}
      disabled={desactive || chargement}
      onPress={onPress}
      style={({ pressed }) => [
        s.bouton,
        plein && { backgroundColor: pressed ? c.actionPress : c.action },
        clair && { backgroundColor: pressed ? c.bain2 : c.surface },
        variante === 'contour' && { borderWidth: 1.5, borderColor: c.accent, backgroundColor: pressed ? c.bain1 : 'transparent' },
        variante === 'danger' && { borderWidth: 1.5, borderColor: c.erreur, backgroundColor: pressed ? c.bain1 : 'transparent' },
        variante === 'texte' && { minHeight: 44, paddingHorizontal: space.s, backgroundColor: pressed ? (surFonce ? 'rgba(255,255,255,0.12)' : c.bain1) : 'transparent' },
        desactive && { opacity: 0.4 },
        style,
      ]}
    >
      {chargement ? <ActivityIndicator color={couleurTexte} /> : icone ? <Ionicons name={icone} size={20} color={couleurTexte} /> : null}
      <Text style={[s.boutonTexte, { color: couleurTexte }]}>{titre}</Text>
    </Pressable>
  );
}

export const appelerFabrice = () => { evenement('appel_chauffeur'); Linking.openURL(contact.telephoneLien).catch(() => {}); };

export function Note({ children, ton = 'feuille', icone }: { children: ReactNode; ton?: 'feuille' | 'alerte' | 'erreur' | 'bain'; icone?: IconName }) {
  const { c, type, s } = useTheme(creerStyles);
  const t = {
    feuille: [c.feuilleFond, c.feuilleEncre, 'leaf-outline'],
    alerte: [c.alerteFond, c.alerte, 'time-outline'],
    erreur: [c.erreurFond, c.erreur, 'alert-circle-outline'],
    bain: [c.bain1, c.accent, 'information-circle-outline'],
  }[ton] as [string, string, IconName];
  return (
    <View style={[s.note, { backgroundColor: t[0] }]}>
      <Ionicons name={icone ?? t[2]} size={20} color={t[1]} style={{ marginTop: 1 }} />
      <Text style={[type.small, { color: t[1], flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function Titre({ children, style }: { children: ReactNode; style?: object }) {
  const { c, type, s } = useTheme(creerStyles);
  return <Text accessibilityRole="header" style={[type.h2, { marginTop: space.xxl, marginBottom: space.m }, style]}>{children}</Text>;
}

export function Ligne({ libelle, valeur, fort }: { libelle: string; valeur: string; fort?: boolean }) {
  const { c, type, s } = useTheme(creerStyles);
  return (
    <View style={s.ligne}>
      <Text style={[type.small, { flex: 1 }]}>{libelle}</Text>
      <Text style={[type.body, { flex: 1.6, textAlign: 'right' }, fort && { fontWeight: '700' }]}>{valeur}</Text>
    </View>
  );
}

export function Champ({ libelle, aide, ...props }: TextInputProps & { libelle: string; aide?: string }) {
  const { c, type, s } = useTheme(creerStyles);
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: space.l }}>
      <Text style={[type.label, { marginBottom: 6 }]}>{libelle}</Text>
      <TextInput
        placeholderTextColor={c.placeholder}
        style={[s.champ, focus && s.champFocus]}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        {...props}
      />
      {aide ? <Text style={[type.small, { marginTop: 6 }]}>{aide}</Text> : null}
    </View>
  );
}

export function Compteur({ libelle, valeur, min, max, onChange, icone }: {
  libelle: string; valeur: number; min: number; max: number; onChange: (n: number) => void; icone: IconName;
}) {
  const { c, type, s } = useTheme(creerStyles);
  return (
    <View style={s.compteur}>
      <Ionicons name={icone} size={22} color={c.accent} />
      <Text style={[type.body, { flex: 1 }]}>{libelle}</Text>
      <Pressable accessibilityLabel={`${t('Moins de')} ${libelle.toLowerCase()}`} disabled={valeur <= min} onPress={() => onChange(valeur - 1)} style={[s.rond, valeur <= min && { opacity: 0.35 }]}>
        <Ionicons name="remove" size={22} color={c.accent} />
      </Pressable>
      <Text style={s.compteurValeur}>{valeur}</Text>
      <Pressable accessibilityLabel={`${t('Plus de')} ${libelle.toLowerCase()}`} disabled={valeur >= max} onPress={() => onChange(valeur + 1)} style={[s.rond, valeur >= max && { opacity: 0.35 }]}>
        <Ionicons name="add" size={22} color={c.accent} />
      </Pressable>
    </View>
  );
}

export function Segment<T extends string>({ options, valeur, onChange }: {
  options: { id: T; titre: string }[]; valeur: T; onChange: (v: T) => void;
}) {
  const { c, type, s } = useTheme(creerStyles);
  return (
    <View style={s.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const actif = o.id === valeur;
        return (
          <Pressable key={o.id} accessibilityRole="tab" accessibilityState={{ selected: actif }} onPress={() => onChange(o.id)} style={[s.segmentItem, actif && s.segmentActif]}>
            {/* Pleine largeur et une seule ligne : sur Android, le passage en gras garde sinon la largeur
                mesurée en normal, et le libellé se coupe (« À venir » devenait « À »). */}
            <Text numberOfLines={1} style={[type.body, { alignSelf: 'stretch', textAlign: 'center', paddingHorizontal: 4, fontWeight: actif ? '700' : '500', color: actif ? c.fort : c.pierre }]}>{o.titre}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ——— Signature : la course se teinte ———
// Chaque statut est un bain de teinture plus ou moins foncé.
export const teintesDe = (c: Couleurs): Record<Statut, { fond: string; texte: string; texte2: string; libelle: string; niveau: number }> => ({
  envoyee: { fond: c.bain1, texte: c.fort, texte2: c.accent, libelle: t('Demande envoyée'), niveau: 1 },
  acompte_attendu: { fond: c.bain2, texte: c.fort, texte2: c.accent, libelle: t('Acompte à régler'), niveau: 1 },
  confirmee: { fond: c.action, texte: c.blanc, texte2: c.surCuve2, libelle: t('Confirmée par Fabrice'), niveau: 2 },
  terminee: { fond: c.delaveFond, texte: c.encre, texte2: c.pierre, libelle: t('Terminée'), niveau: 3 },
  annulee: { fond: c.surface, texte: c.pierre, texte2: c.pierre, libelle: t('Annulée'), niveau: 0 },
  refusee: { fond: c.surface, texte: c.pierre, texte2: c.pierre, libelle: t('Refusée par Fabrice'), niveau: 0 },
  expiree: { fond: c.surface, texte: c.pierre, texte2: c.pierre, libelle: t('Non confirmée : acompte non réglé'), niveau: 0 },
});

// Course qui n'aura pas lieu (affichée barrée, sans barre de teinture).
export const estFermee = (s: Statut) => s === 'annulee' || s === 'refusee' || s === 'expiree';
export const heureCourte = (d: Date) => `${d.getHours()}${L('h', ':')}${String(d.getMinutes()).padStart(2, '0')}`;

const bainsDe = (c: Couleurs) => [
  { titre: t('Envoyée'), couleur: c.bain3 },
  { titre: t('Confirmée'), couleur: c.action },
  { titre: t('Terminée'), couleur: c.delave },
];

export function Teinture({ statut, surFonce }: { statut: Statut; surFonce?: boolean }) {
  const { c, type } = useTheme();
  const niveau = teintesDe(c)[statut].niveau;
  const bains = bainsDe(c);
  const vide = surFonce ? 'rgba(255,255,255,0.18)' : c.trait;
  return (
    <View accessibilityLabel={`${t('Statut :')} ${teintesDe(c)[statut].libelle}`} style={{ flexDirection: 'row', gap: 4 }}>
      {bains.map((b, i) => (
        <View key={b.titre} style={{ flex: 1 }}>
          <Bain rempli={i < niveau} retard={i * 140} couleur={surFonce && i === 1 ? c.blanc : b.couleur} vide={vide} />
          <Text style={[type.label, { fontSize: 12, marginTop: 6, color: surFonce ? c.surCuve2 : c.pierre }, i === niveau - 1 && { color: surFonce ? c.blanc : c.encre }]}>
            {b.titre}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Un segment se remplit de gauche à droite, comme un tissu qui boit la teinture.
// Animation sur le fil d'affichage (Reanimated) : fluide même quand l'appli travaille.
function Bain({ rempli, retard, couleur, vide }: { rempli: boolean; retard: number; couleur: string; vide: string }) {
  const calme = useReducedMotion();
  const part = useSharedValue(rempli ? 1 : 0);
  useEffect(() => {
    part.value = calme ? (rempli ? 1 : 0) : withDelay(retard, withTiming(rempli ? 1 : 0, { duration: 700, easing: ReEasing.out(ReEasing.exp) }));
  }, [rempli, calme]);
  const remplissage = useAnimatedStyle(() => ({ transform: [{ scaleX: part.value }] }));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: vide, overflow: 'hidden' }}>
      <Reanimated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: couleur, borderRadius: 3, transformOrigin: 'left' }, remplissage]} />
    </View>
  );
}

export function Itineraire({ departId, arriveeId, couleur: couleurP, couleur2: couleur2P, grand }: {
  departId: string; arriveeId: string; couleur?: string; couleur2?: string; grand?: boolean;
}) {
  const { c, type, s } = useTheme(creerStyles);
  const couleur = couleurP ?? c.encre;
  const couleur2 = couleur2P ?? c.pierre;
  const a = lieu(departId);
  const b = lieu(arriveeId);
  const taille = grand ? { fontSize: 18, fontWeight: '600' as const } : { fontSize: 16, fontWeight: '600' as const };
  return (
    <View style={{ flexDirection: 'row', gap: space.m }}>
      <View style={{ alignItems: 'center', paddingTop: 7 }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: couleur }} />
        <View style={{ width: 2, flex: 1, backgroundColor: couleur2, opacity: 0.5, marginVertical: 3 }} />
        <View style={{ width: 9, height: 9, backgroundColor: couleur }} />
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        <View>
          <Text style={[taille, { color: couleur }]}>{t(a.nom)}</Text>
          <Text style={[type.small, { color: couleur2 }]}>{t(a.detail)}</Text>
        </View>
        <View>
          <Text style={[taille, { color: couleur }]}>{t(b.nom)}</Text>
          <Text style={[type.small, { color: couleur2 }]}>{t(b.detail)}</Text>
        </View>
      </View>
    </View>
  );
}

export function CarteCourse({ course, onPress }: { course: Course; onPress?: () => void }) {
  const { c, type, s } = useTheme(creerStyles);
  const tt = teintesDe(c)[course.statut];
  const fonce = course.statut === 'confirmee';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tt.libelle}, ${dateCourte(course.date)} ${t('à')} ${course.heure}, ${t(lieu(course.departId).nom)} ${t('vers')} ${t(lieu(course.arriveeId).nom)}`}
      style={({ pressed }) => [
        s.carteCourse,
        { backgroundColor: tt.fond },
        estFermee(course.statut) && { borderWidth: 1, borderColor: c.trait, borderStyle: 'dashed' },
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: f.display, fontSize: 26, color: tt.texte, textDecorationLine: estFermee(course.statut) ? 'line-through' : 'none' }}>
          {dateCourte(course.date)} · {heureAffichee(course.heure)}
        </Text>
        <Text style={{ fontFamily: f.displayMedium, fontSize: 20, color: tt.texte }}>{euros(course.montant)}</Text>
      </View>
      <View style={{ marginVertical: space.l }}>
        <Itineraire departId={course.departId} arriveeId={course.arriveeId} couleur={tt.texte} couleur2={tt.texte2} />
      </View>
      <Text style={[type.small, { color: tt.texte2, marginBottom: space.m }]}>
        {t(offre(course.offreId).nom)} · {t(offre(course.offreId).vehicule)}
        {course.numero ? ` · ${course.numero}` : ''}
      </Text>
      {course.statut === 'acompte_attendu' && course.acompteMontant ? (
        <Text style={[type.small, { color: c.fort, fontWeight: '700', marginBottom: space.s }]}>
          {course.acompteLimite
            ? t('Acompte de {montant} à régler avant {heure} pour confirmer', { montant: euros(course.acompteMontant), heure: heureCourte(course.acompteLimite) })
            : t('Acompte de {montant} à régler pour confirmer', { montant: euros(course.acompteMontant) })}
        </Text>
      ) : null}
      {estFermee(course.statut) ? (
        <View>
          <Text style={[type.label, { color: course.statut === 'refusee' ? c.erreur : c.pierre }]}>{teintesDe(c)[course.statut].libelle}</Text>
          {course.statut === 'refusee' && course.motifRefus ? <Text style={[type.small, { marginTop: 2 }]}>{t('Motif :')} {course.motifRefus}</Text> : null}
        </View>
      ) : (
        <Teinture statut={course.statut} surFonce={fonce} />
      )}
    </Pressable>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  bouton: {
    minHeight: 52, borderRadius: radius.m, paddingHorizontal: space.xl, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: space.s,
  },
  boutonTexte: { fontSize: 17, fontWeight: '700' },
  note: { flexDirection: 'row', gap: space.m, padding: space.m, borderRadius: radius.m },
  ligne: {
    flexDirection: 'row', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.trait, gap: space.m, alignItems: 'baseline',
  },
  champ: {
    minHeight: 50, borderRadius: radius.m, borderWidth: 1, borderColor: c.trait, backgroundColor: c.surface,
    paddingHorizontal: space.l, fontSize: 17, color: c.encre, ...sansContourWeb,
  } as object,
  champFocus: { borderColor: c.accent, borderWidth: 2, paddingHorizontal: space.l - 1 },
  compteur: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
  rond: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: c.bain1, alignItems: 'center', justifyContent: 'center',
  },
  compteurValeur: { fontFamily: f.display, fontSize: 24, color: c.encre, minWidth: 28, textAlign: 'center' },
  segment: { flexDirection: 'row', backgroundColor: c.bain1, borderRadius: radius.m, padding: 3 },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.s + 2 },
  segmentActif: {
    backgroundColor: c.surface, shadowColor: c.cuve, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  carteCourse: { borderRadius: radius.l, padding: space.l + 2 },
});

// Interrupteur natif aux couleurs de la marque (iOS, Android et web).
export const couleursSwitch = (c: Couleurs) => ({
  trackColor: { true: c.action, false: c.trait },
  thumbColor: c.blanc,
  activeThumbColor: c.blanc,
  ios_backgroundColor: c.trait,
}) as object;
