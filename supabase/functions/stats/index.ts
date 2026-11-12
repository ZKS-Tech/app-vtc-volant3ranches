// Fonction serveur « stats » : relaie vers Google Analytics 4 (Measurement Protocol) les événements
// de l'appli, uniquement pour les clients qui ont accepté les statistiques.
//  • la clé secrète GA4 reste ici, jamais dans l'appli ;
//  • Google ne reçoit ni l'adresse IP du téléphone (l'appel part de Supabase) ni nom, email,
//    téléphone ou adresse : seulement un identifiant anonyme tiré au hasard et des paramètres
//    filtrés (liste blanche) ;
//  • envoi vers le serveur européen de Google Analytics.
// À déployer SANS « Verify JWT » : la fonction vérifie elle-même la session de l'appli.
//
// Secrets : GA4_MEASUREMENT_ID (G-XXXXXXX) et GA4_API_SECRET (Admin GA4 › Flux de données ›
// le flux › Measurement Protocol › Créer).
import { createClient } from 'npm:@supabase/supabase-js@2';

function cleProjet(type: 'publique' | 'secrete'): string {
  const [liste, une, ancienne] = type === 'publique'
    ? ['SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']
    : ['SUPABASE_SECRET_KEYS', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const brut = Deno.env.get(liste);
  if (brut) {
    try {
      const o = JSON.parse(brut) as Record<string, string>;
      const v = o.default ?? Object.values(o)[0];
      if (v) return v;
    } catch { /* format inattendu */ }
  }
  const v = Deno.env.get(une) ?? Deno.env.get(ancienne);
  if (!v) throw new Error(`Clé ${type} du projet introuvable`);
  return v;
}

// Entonnoir de réservation et événements utiles (docs/brief-reservation.md).
export const EVENEMENTS = new Set([
  'ouverture_app', 'raccourci_aeroport_gare', 'adresse_saisie', 'estimation_affichee', 'offre_choisie',
  'coordonnees_saisies', 'demande_envoyee', 'demande_echec_envoi', 'demande_confirmee', 'demande_refusee',
  'acompte_paye', 'annulation', 'appel_chauffeur', 'message_envoye', 'compte_cree', 'connexion_compte',
  'annonce_vue', 'document_ouvert',
]);
// Paramètres autorisés : jamais de donnée qui identifie la personne.
const PARAMETRES = new Set([
  'offre', 'km', 'prix', 'majoration', 'raccourci', 'type_lieu', 'aller_retour', 'passagers', 'delai_h',
  'frais', 'statut', 'erreur', 'acompte', 'source', 'type_document', 'champ',
]);

type Evenement = { nom: string; params?: Record<string, unknown>; t?: number };

export function nettoyer(evts: Evenement[], session: number): { name: string; params: Record<string, string | number> }[] {
  return evts.filter((e) => EVENEMENTS.has(e.nom)).slice(0, 25).map((e) => {
    const params: Record<string, string | number> = { session_id: session, engagement_time_msec: 100 };
    for (const [k, v] of Object.entries(e.params ?? {})) {
      if (!PARAMETRES.has(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) params[k] = Math.round(v * 100) / 100;
      else if (typeof v === 'boolean') params[k] = v ? 'oui' : 'non';
      else if (typeof v === 'string') params[k] = v.replace(/[^\p{L}\p{N} _.,:'-]/gu, '').slice(0, 100);
    }
    return { name: e.nom, params };
  });
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const mesure = Deno.env.get('GA4_MEASUREMENT_ID');
    const secret = Deno.env.get('GA4_API_SECRET');
    if (!mesure || !secret) return new Response(null, { status: 204, headers: cors }); // pas encore configuré : on ignore
    const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { client_id, session_id, evenements } = await req.json().catch(() => ({}));
    if (!jeton || typeof client_id !== 'string' || !/^[\w.-]{8,64}$/.test(client_id) || !Array.isArray(evenements)) {
      return new Response(null, { status: 400, headers: cors });
    }
    // Seule l'appli (session Supabase valide, invité compris) peut envoyer des statistiques.
    const { data: u } = await createClient(Deno.env.get('SUPABASE_URL')!, cleProjet('publique')).auth.getUser(jeton);
    if (!u?.user) return new Response(null, { status: 401, headers: cors });

    const events = nettoyer(evenements, Number(session_id) || Date.now());
    if (!events.length) return new Response(null, { status: 204, headers: cors });
    const r = await fetch(`https://region1.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(mesure)}&api_secret=${encodeURIComponent(secret)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id, non_personalized_ads: true, events }),
    });
    if (!r.ok) console.error('GA4', r.status, (await r.text()).slice(0, 300));
    return new Response(null, { status: 204, headers: cors });
  } catch (e) {
    console.error('stats', e);
    return new Response(null, { status: 204, headers: cors }); // les statistiques ne doivent jamais gêner l'appli
  }
});
