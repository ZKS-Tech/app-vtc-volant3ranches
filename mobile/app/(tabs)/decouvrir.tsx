import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { avis, contact, euros, fabrice, faq, offres, photos, prestations, valeurs } from '../../src/data';
import { Couleurs, f, radius, space } from '../../src/theme';
import { useTheme } from '../../src/useTheme';
import { Bouton, IconName, Titre, appelerFabrice } from '../../src/ui';

export default function Decouvrir() {
  const { c, type, s } = useTheme(creerStyles);
  const [ouverte, setOuverte] = useState<number | null>(0);
  return (
    <ScrollView style={{ backgroundColor: c.sol }} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <View style={s.hero}>
        <Image source={photos.flotte} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="La Tesla et le Van dans les collines du Lauragais" />
        <View style={s.voile} />
        <Text style={s.heroTitre}>Votre chauffeur privé dans le Tarn</Text>
        <Text style={[type.small, { color: c.surCuve2 }]}>Ponctuel, discret, disponible 24h/24 et 7j/7.</Text>
      </View>

      <View style={{ paddingHorizontal: space.l }}>
        <Titre>Fabrice</Titre>
        <View style={{ flexDirection: 'row', gap: space.l }}>
          <Image source={photos.fabrice} style={s.portrait} contentFit="cover" contentPosition="top" accessibilityLabel={fabrice.nom} />
          <View style={{ flex: 1 }}>
            <Text style={type.h3}>{fabrice.nom}</Text>
            <Text style={[type.small, { marginTop: 4 }]}>{fabrice.bio}</Text>
          </View>
        </View>
        <Text style={[type.body, { marginTop: space.m }]}>{fabrice.objectif}</Text>
        <View style={s.valeurs}>
          {valeurs.map((v) => (
            <View key={v.titre} style={s.valeur}>
              <Text style={s.valeurTitre}>{v.titre}</Text>
              <Text style={type.small}>{v.texte}</Text>
            </View>
          ))}
        </View>

        <Titre>Les véhicules</Titre>
      </View>
      {offres.map((o) => (
        <View key={o.id} style={{ marginBottom: space.xl }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.s }}>
            {o.galerie.map((p, i) => (
              <Image key={i} source={p} style={[s.galerie, i === 0 && { width: 280 }]} contentFit="cover" accessibilityLabel={`${o.vehicule}, photo ${i + 1}`} />
            ))}
          </ScrollView>
          <View style={{ paddingHorizontal: space.l, marginTop: space.m }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
              <Text style={[type.h3, { flex: 1 }]}>{o.vehicule}</Text>
              <Text style={s.tarif}>dès {euros(o.prixKmJour)}/km</Text>
            </View>
            <Text style={type.small}>
              {o.nom} · {o.passagersMax} passagers · {o.bagagesMax} bagages · minimum {euros(o.minimum)}
            </Text>
            <Text style={[type.body, { marginTop: space.s }]}>{o.description}</Text>
            <Text style={[type.small, { marginTop: space.s }]}>{o.equipements.join(' · ')}</Text>
          </View>
        </View>
      ))}

      <View style={{ paddingHorizontal: space.l }}>
        <Titre style={{ marginTop: space.l }}>Prestations</Titre>
        <View style={s.bloc}>
          {prestations.map((p, i) => (
            <View key={p.titre} style={[s.prestation, i > 0 && s.trait]}>
              <Ionicons name={p.icone as IconName} size={24} color={c.accent} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>{p.titre}</Text>
                <Text style={[type.small, { marginTop: 2 }]}>{p.texte}</Text>
                <Text style={[type.small, { marginTop: space.s, color: c.feuilleEncre }]}>{p.points.join(' · ')}</Text>
                {p.reservable ? null : (
                  <Bouton titre="Demander un devis" variante="texte" icone="mail-outline" onPress={() => Linking.openURL(`mailto:${contact.email}?subject=Demande de devis`)} style={{ alignSelf: 'flex-start', marginTop: space.xs, marginLeft: -space.s }} />
                )}
              </View>
            </View>
          ))}
        </View>
        <Bouton titre="Réserver une course" onPress={() => router.navigate('/')} style={{ marginTop: space.l }} />

        <Titre>Ce que disent les passagers</Titre>
        <Text style={[type.small, { marginBottom: space.m }]}>Avis publiés sur volant3ranches-vtc.fr</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.l, gap: space.m }}>
        {avis.map((a) => (
          <View key={a.nom} style={s.avis}>
            <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel="5 étoiles sur 5">
              {[0, 1, 2, 3, 4].map((i) => <Ionicons key={i} name="star" size={14} color={c.accent} />)}
            </View>
            <Text style={[type.body, { marginVertical: space.m }]}>« {a.texte} »</Text>
            <Text style={[type.body, { fontWeight: '700' }]}>{a.nom}</Text>
            <Text style={type.small}>{a.contexte}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: space.l }}>
        <Titre>Questions fréquentes</Titre>
        <View style={s.bloc}>
          {faq.map((q, i) => (
            <View key={q.q} style={i > 0 && s.trait}>
              <Pressable onPress={() => setOuverte(ouverte === i ? null : i)} style={s.question} accessibilityRole="button" accessibilityState={{ expanded: ouverte === i }}>
                <Text style={[type.body, { fontWeight: '600', flex: 1 }]}>{q.q}</Text>
                <Ionicons name={ouverte === i ? 'chevron-up' : 'chevron-down'} size={20} color={c.pierre} />
              </Pressable>
              {ouverte === i ? <Text style={[type.small, { color: c.encre, paddingBottom: space.l, paddingRight: space.xl }]}>{q.r}</Text> : null}
            </View>
          ))}
        </View>

        <Titre>Contact</Titre>
        <View style={s.bloc}>
          <LigneContact icone="call-outline" titre={contact.telephone} sous="Disponible 24h/24 et 7j/7" onPress={appelerFabrice} />
          <LigneContact icone="mail-outline" titre={contact.email} sous="Réponse rapide" onPress={() => Linking.openURL(`mailto:${contact.email}`)} />
          <LigneContact icone="logo-instagram" titre="@volant3ranches" sous="Instagram" onPress={() => Linking.openURL(contact.instagram)} />
          <LigneContact icone="location-outline" titre="Zone d'intervention" sous={contact.zone} />
        </View>
        <Text style={[type.small, { marginTop: space.l }]}>
          {contact.societe} · {contact.adresse}. Médiateur de la consommation : CM2C.
        </Text>
      </View>
    </ScrollView>
  );
}

function LigneContact({ icone, titre, sous, onPress }: { icone: IconName; titre: string; sous: string; onPress?: () => void }) {
  const { c, type, s } = useTheme(creerStyles);
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.contact, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icone} size={22} color={c.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontWeight: '600' }]}>{titre}</Text>
        <Text style={type.small}>{sous}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={c.pierre} /> : null}
    </Pressable>
  );
}

const creerStyles = (c: Couleurs) => StyleSheet.create({
  hero: { height: 260, justifyContent: 'flex-end', padding: space.l },
  voile: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,27,69,0.42)' },
  heroTitre: { fontFamily: f.display, fontSize: 36, lineHeight: 39, color: c.blanc, marginBottom: 4 },
  portrait: { width: 96, height: 120, borderRadius: radius.m, backgroundColor: c.bain2 },
  valeurs: { marginTop: space.l, gap: space.m },
  valeur: { paddingLeft: space.m, borderLeftWidth: 1, borderLeftColor: c.bain3 },
  valeurTitre: { fontFamily: f.displayMedium, fontSize: 20, color: c.fort },
  galerie: { width: 200, height: 200, borderRadius: radius.m, backgroundColor: c.bain2 },
  tarif: { fontFamily: f.displayMedium, fontSize: 18, color: c.accent },
  bloc: { backgroundColor: c.surface, borderRadius: radius.l, paddingHorizontal: space.l },
  trait: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.trait },
  prestation: { flexDirection: 'row', gap: space.m, paddingVertical: space.l },
  avis: { width: 290, backgroundColor: c.surface, borderRadius: radius.l, padding: space.l },
  question: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 56, paddingVertical: space.m },
  contact: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: 60 },
});
