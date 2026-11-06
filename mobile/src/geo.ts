import { useCallback, useEffect, useState } from 'react';
import { Itineraire, Lieu, enregistrerLieu, itineraireEnCache, memoriserItineraire } from './data';

// Services publics de l'IGN (Géoplateforme), gratuits et sans clé :
//  • géocodage : la Base Adresse Nationale, toutes les adresses de France ;
//  • itinéraire : distance, durée et tracé en voiture.
const GEOCODAGE = 'https://data.geopf.fr/geocodage/search';
const ITINERAIRE = 'https://data.geopf.fr/navigation/itineraire';

// Les résultats proches du Tarn passent en premier.
const CENTRE = { lat: 43.75, lon: 1.95 };

type ProprietesBAN = {
  id?: string; label?: string; name?: string; postcode?: string; city?: string; context?: string;
  type?: 'housenumber' | 'street' | 'locality' | 'municipality' | string;
};

export async function chercherAdresses(q: string, signal?: AbortSignal): Promise<Lieu[]> {
  const texte = q.trim();
  if (texte.length < 3) return [];
  const url = `${GEOCODAGE}?q=${encodeURIComponent(texte)}&autocomplete=1&limit=7&index=address&lat=${CENTRE.lat}&lon=${CENTRE.lon}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Recherche indisponible (${r.status})`);
  const json = (await r.json()) as { features?: { geometry?: { coordinates?: [number, number] }; properties?: ProprietesBAN }[] };
  return (json.features ?? [])
    .filter((f) => f.geometry?.coordinates && f.properties)
    .map((f) => {
      const p = f.properties!;
      const [lon, lat] = f.geometry!.coordinates!;
      const ville = p.type === 'municipality';
      const departement = p.context?.split(',')[1]?.trim();
      return {
        id: `ban:${p.id ?? `${lat.toFixed(5)},${lon.toFixed(5)}`}`,
        nom: ville ? p.city ?? p.name ?? p.label ?? texte : p.name ?? p.label ?? texte,
        detail: ville ? [p.postcode, departement].filter(Boolean).join(' · ') : [p.postcode, p.city].filter(Boolean).join(' '),
        type: ville ? 'ville' : 'adresse',
        lat,
        lon,
      } satisfies Lieu;
    });
}

// Garde au plus `max` points d'un tracé (les extrémités toujours) : le plan reste léger à dessiner.
function alleger(coords: [number, number][], max = 300): [number, number][] {
  if (coords.length <= max) return coords;
  const pas = (coords.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * pas)]);
}

// Moteurs de calcul de l'IGN, essayés dans l'ordre (liste officielle : /navigation/getcapabilities).
// Le premier qui répond l'emporte ; la dernière variante utilise les unités par défaut du service.
const UNITES = '&distanceUnit=kilometer&timeUnit=minute&geometryFormat=geojson&getSteps=false';
const VARIANTES = [
  { resource: 'bdtopo-valhalla', options: UNITES },
  { resource: 'bdtopo-pgr', options: UNITES },
  { resource: 'bdtopo-valhalla', options: '' },
];

type ReponseItineraire = {
  distance?: number | string; duration?: number | string; distanceUnit?: string; timeUnit?: string;
  geometry?: { coordinates?: [number, number][] } | string;
};

export async function calculerItineraire(a: Lieu, b: Lieu, signal?: AbortSignal): Promise<Itineraire> {
  const deja = itineraireEnCache(a, b);
  if (deja) return deja;
  const erreurs: string[] = [];
  for (const v of VARIANTES) {
    const url = `${ITINERAIRE}?resource=${v.resource}&profile=car&optimization=fastest`
      + `&start=${a.lon.toFixed(6)},${a.lat.toFixed(6)}&end=${b.lon.toFixed(6)},${b.lat.toFixed(6)}${v.options}`;
    try {
      const r = await fetch(url, { signal });
      const texte = await r.text();
      if (!r.ok) { erreurs.push(`${v.resource}${v.options ? '' : ' (défaut)'} : ${r.status} ${texte.slice(0, 140)}`); continue; }
      const j = JSON.parse(texte) as ReponseItineraire;
      let km = Number(j.distance);
      let minutes = Number(j.duration);
      const unite = (j.distanceUnit ?? (v.options ? 'kilometer' : 'meter')).toLowerCase();
      const temps = (j.timeUnit ?? (v.options ? 'minute' : 'second')).toLowerCase();
      if (unite.startsWith('m')) km /= 1000;
      if (temps.startsWith('s')) minutes /= 60;
      if (temps.startsWith('h')) minutes *= 60;
      if (!(km > 0)) { erreurs.push(`${v.resource} : réponse sans distance (${texte.slice(0, 140)})`); continue; }
      const coords = typeof j.geometry === 'object' && j.geometry?.coordinates?.length ? j.geometry.coordinates : [[a.lon, a.lat], [b.lon, b.lat]] as [number, number][];
      return memoriserItineraire(a, b, { km: Math.round(km * 10) / 10, minutes: Math.max(1, Math.round(minutes || 0)), coords: alleger(coords) });
    } catch (e) {
      if (signal?.aborted) throw e;
      erreurs.push(`${v.resource} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(erreurs.join(' | ') || 'Itinéraire indisponible');
}

export type EtatItineraire =
  | { etat: 'attente' }
  | { etat: 'chargement' }
  | { etat: 'ok'; itineraire: Itineraire }
  | { etat: 'erreur'; message: string };

// Itinéraire réel entre deux lieux, avec ses états (chargement, erreur) et un bouton « réessayer ».
export function useItineraire(a?: Lieu, b?: Lieu) {
  const deja = a && b ? itineraireEnCache(a, b) : undefined;
  const [etat, setEtat] = useState<EtatItineraire>(deja ? { etat: 'ok', itineraire: deja } : { etat: a && b ? 'chargement' : 'attente' });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    if (!a || !b) { setEtat({ etat: 'attente' }); return; }
    const enCache = itineraireEnCache(a, b);
    if (enCache) { setEtat({ etat: 'ok', itineraire: enCache }); return; }
    const ctrl = new AbortController();
    setEtat({ etat: 'chargement' });
    calculerItineraire(a, b, ctrl.signal)
      .then((it) => setEtat({ etat: 'ok', itineraire: it }))
      .catch((e) => { if (!ctrl.signal.aborted) setEtat({ etat: 'erreur', message: e instanceof Error ? e.message : String(e) }); });
    return () => ctrl.abort();
  }, [a?.lat, a?.lon, b?.lat, b?.lon, essai]);
  const reessayer = useCallback(() => setEssai((n) => n + 1), []);
  return { ...etat, reessayer } as EtatItineraire & { reessayer: () => void };
}

// Recherche d'adresses avec un court délai pendant la frappe.
export function useRechercheAdresses(q: string) {
  const [resultats, setResultats] = useState<Lieu[]>([]);
  const [etat, setEtat] = useState<'repos' | 'chargement' | 'erreur'>('repos');
  useEffect(() => {
    if (q.trim().length < 3) { setResultats([]); setEtat('repos'); return; }
    const ctrl = new AbortController();
    setEtat('chargement');
    const t = setTimeout(() => {
      chercherAdresses(q, ctrl.signal)
        .then((r) => { setResultats(r); setEtat('repos'); })
        .catch(() => { if (!ctrl.signal.aborted) setEtat('erreur'); });
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  return { resultats, etat };
}

export { enregistrerLieu };
