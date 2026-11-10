// Fonction serveur « emails » : envoie par Brevo les emails mis en file par la base (table emails),
// avec le bon de commande ou la facture en PDF. Réveillée par la base à chaque nouvel email et
// toutes les 5 minutes ; l'appeler ne fait qu'envoyer ce qui attend déjà (rien d'autre).
// À déployer SANS vérification du jeton (« Verify JWT » désactivé).
//
// Secrets (Supabase › Edge Functions › Secrets) :
//   BREVO_API_KEY      clé API Brevo (xkeysib-…)
//   EMAIL_EXPEDITEUR   adresse d'envoi validée dans Brevo (ex. reservation@volant3ranches-vtc.fr)
//   EMAIL_NOM          facultatif, nom affiché (par défaut « Volant3ranches VTC »)
//   EMAIL_REPONSE      facultatif, adresse de réponse (par défaut l'email de Fabrice dans les réglages)
import { createClient } from 'npm:@supabase/supabase-js@2';

// Clés du projet fournies par Supabase : anciens noms (ANON / SERVICE_ROLE) ou nouveaux
// (SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS, objets JSON { default: "sb_…" }).
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
    } catch { /* format inattendu : on essaie les autres noms */ }
  }
  const v = Deno.env.get(une) ?? Deno.env.get(ancienne);
  if (!v) throw new Error(`Clé ${type} du projet introuvable`);
  return v;
}

// ——— Mise en forme ———
const html = (t: unknown) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const euros = (n: number) => {
  const [e, c] = Math.abs(Number(n)).toFixed(2).split('.');
  return `${Number(n) < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${c} €`;
};
export const quand = (iso: string) => {
  const d = new Date(iso);
  const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(d).split(':');
  return `${jour} à ${Number(h)}h${m}`;
};
const heure = (iso: string) => {
  const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).split(':');
  return `${Number(h)}h${m}`;
};

export type Course = {
  id: string; nom: string; telephone: string | null; email: string | null; date_heure: string;
  depart_libelle: string; depart_detail: string | null; arrivee_libelle: string; arrivee_detail: string | null;
  aller_retour: boolean; passagers: number; bagages: number; numero_vol_train: string | null; offre_id: string;
  montant: number; motif_refus: string | null; frais_annulation: number | null; commentaire: string | null;
  acompte_montant: number | null; acompte_limite: string | null; acompte_paye_le: string | null; source: string;
};
export type Contexte = {
  type: string; course: Course; offre: string; donnees: Record<string, unknown>;
  document: { numero: string; type: string; total_ttc: number } | null;
  vendeur: { raison_sociale: string; siege: string; siren: string; telephone: string };
  test: boolean;
  /** Adresse publique du logo (bandeau) ; sans elle, le bandeau n'affiche que le nom. */
  logo?: string;
};
export type Email = { sujet: string; titre: string; paragraphes: string[]; details: [string, string][]; note?: string };

const lieu = (libelle: string, detail: string | null) => detail ? `${libelle}, ${detail}` : libelle;
// « de Léa », mais « d’Evan » : élision devant une voyelle ou un h muet.
export const de = (nom: string) => (/^[aeiouyhàâäéèêëîïôöùûü]/i.test(nom.trim()) ? `d’${nom.trim()}` : `de ${nom.trim()}`);

// Contenu de chaque email (texte brut ; l'échappement HTML est fait à l'assemblage).
export function composer(x: Contexte): Email {
  const c = x.course;
  const prenom = c.nom.split(/\s+/)[0];
  const date = quand(c.date_heure);
  const acompte = Number(c.acompte_montant ?? 0);
  const trajet: [string, string][] = [
    ['Date', date[0].toUpperCase() + date.slice(1)],
    ['Départ', lieu(c.depart_libelle, c.depart_detail)],
    ['Arrivée', lieu(c.arrivee_libelle, c.arrivee_detail) + (c.aller_retour ? ' (aller-retour)' : '')],
    ['Véhicule', x.offre],
    ['Passagers', `${c.passagers} · ${c.bagages} bagage${c.bagages > 1 ? 's' : ''}`],
    ...(c.numero_vol_train ? [['Vol / train', `${c.numero_vol_train} (suivi en temps réel)`] as [string, string]] : []),
    ['Prix', euros(c.montant) + ' TTC'],
  ];
  const tel = x.vendeur.telephone.replace(/^\+33/, '0').replace(/(\d{2})(?=\d)/g, '$1 ');
  switch (x.type) {
    case 'demande_recue':
      return {
        sujet: `Demande reçue · ${date}`, titre: 'Votre demande est bien reçue',
        paragraphes: [`Bonjour ${prenom},`, 'Merci pour votre demande. Fabrice vous répond sous 30 minutes ; vous serez prévenu par notification et par email.'],
        details: trajet,
      };
    case 'acompte':
      return {
        sujet: `Fabrice peut vous conduire · acompte à régler`, titre: 'Fabrice peut vous conduire',
        paragraphes: [`Bonjour ${prenom},`,
          `Fabrice a accepté votre demande. Pour confirmer la réservation, réglez l’acompte de ${euros(acompte)}${c.acompte_limite ? ` avant ${heure(c.acompte_limite)}` : ''} depuis l’application : Mes courses › votre course › Payer.`,
          `Le reste, ${euros(Math.max(0, c.montant - acompte))}, se règle à bord par carte ou en espèces. Sans paiement dans le délai, la demande expire et rien ne vous est facturé.`],
        details: trajet,
      };
    case 'confirmation':
      return {
        sujet: `Course confirmée · ${date}`, titre: 'Votre course est confirmée',
        paragraphes: [`Bonjour ${prenom},`, `Fabrice sera là ${date}. Vous trouverez votre bon de commande en pièce jointe${x.document ? ` (${x.document.numero})` : ''}.`,
          c.acompte_paye_le && acompte > 0
            ? `Acompte réglé : ${euros(acompte)}. Reste à payer à bord : ${euros(Math.max(0, c.montant - acompte))}.`
            : 'Paiement à bord par carte ou en espèces, ou sur facture.'],
        details: trajet,
        note: 'Annulation gratuite jusqu’à 24 h avant la course ; 50 % entre 24 h et 12 h ; 100 % à moins de 12 h (CGV).',
      };
    case 'refus':
      return {
        sujet: 'Votre demande de course', titre: 'Fabrice ne peut pas assurer cette course',
        paragraphes: [`Bonjour ${prenom},`, `Fabrice ne peut malheureusement pas assurer votre course du ${date}${c.motif_refus ? ` : ${c.motif_refus.toLowerCase()}` : ''}. Rien ne vous a été facturé.`,
          `Essayez un autre horaire depuis l’application, ou appelez-le au ${tel} : il pourra peut-être vous proposer une solution.`],
        details: trajet,
      };
    case 'expiree':
      return {
        sujet: 'Réservation non confirmée', titre: 'Votre réservation n’est pas confirmée',
        paragraphes: [`Bonjour ${prenom},`, `L’acompte n’a pas été réglé dans le délai : la course du ${date} n’est pas réservée et rien ne vous a été facturé.`,
          'Vous pouvez refaire une demande depuis l’application.'],
        details: trajet,
      };
    case 'annulation': {
      const parChauffeur = !!x.donnees.par_chauffeur;
      const frais = Number(c.frais_annulation ?? 0);
      const lignes = [`Bonjour ${prenom},`,
        parChauffeur ? `Fabrice a dû annuler votre course du ${date}. Toutes nos excuses pour ce contretemps.` : `Votre course du ${date} est bien annulée.`];
      if (c.acompte_paye_le && acompte > 0) {
        const plusDe24h = new Date(c.date_heure).getTime() - Date.now() > 24 * 3600000;
        lignes.push(parChauffeur || plusDe24h ? `L’acompte de ${euros(acompte)} vous est remboursé sur votre carte.` : `L’acompte de ${euros(acompte)} est conservé : l’annulation intervient moins de 24 h avant la course (CGV).`);
      }
      if (frais > 0) lignes.push(`Frais d’annulation prévus par les CGV : ${euros(frais)}.`);
      return { sujet: `Course annulée · ${date}`, titre: 'Course annulée', paragraphes: lignes, details: trajet };
    }
    case 'remboursement':
      return {
        sujet: 'Acompte remboursé', titre: 'Votre acompte est remboursé',
        paragraphes: [`Bonjour ${prenom},`, `${euros(Number(x.donnees.montant ?? acompte))} ont été remboursés sur la carte utilisée pour l’acompte (course du ${date}). Le délai d’apparition sur votre compte dépend de votre banque.`],
        details: trajet,
      };
    case 'facture':
      return {
        sujet: `Votre facture ${x.document?.numero ?? ''}`.trim(), titre: 'Merci d’avoir voyagé avec Volant3ranches',
        paragraphes: [`Bonjour ${prenom},`, `Vous trouverez en pièce jointe votre facture${x.document ? ` ${x.document.numero} (${euros(x.document.total_ttc)} TTC)` : ''} pour la course du ${date}.`,
          'Au plaisir de vous conduire à nouveau.'],
        details: trajet,
      };
    case 'chauffeur_demande':
      return {
        sujet: `Nouvelle demande · ${c.nom} · ${date}`, titre: `Nouvelle demande ${de(c.nom)}`,
        paragraphes: ['Une nouvelle demande vient d’arriver. Ouvrez l’application pour l’accepter ou la refuser.'],
        details: [['Client', `${c.nom} · ${c.telephone ?? ''}${c.email ? ` · ${c.email}` : ''}`], ...trajet,
          ...(c.commentaire ? [['Message', c.commentaire] as [string, string]] : [])],
      };
    case 'chauffeur_annulation':
      return {
        sujet: `Course annulée · ${c.nom} · ${date}`, titre: `${c.nom} a annulé sa course`,
        paragraphes: [`Frais d’annulation calculés selon les CGV : ${euros(Number(c.frais_annulation ?? 0))}.`],
        details: [['Client', `${c.nom} · ${c.telephone ?? ''}`], ...trajet],
      };
    default:
      throw new Error(`Type d'email inconnu : ${x.type}`);
  }
}

// Gabarit HTML aux couleurs de l'appli (indigo), lisible sur mobile et dans tous les clients mail.
export function assembler(e: Email, x: Contexte): { html: string; texte: string } {
  const v = x.vendeur;
  const tel = v.telephone.replace(/^\+33/, '0').replace(/(\d{2})(?=\d)/g, '$1 ');
  const lignes = e.details.map(([k, val]) =>
    `<tr><td style="padding:8px 0;color:#5B6273;font-size:14px;vertical-align:top;width:110px">${html(k)}</td><td style="padding:8px 0;color:#101B45;font-size:14px;font-weight:600">${html(val)}</td></tr>`).join('');
  const corps = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(e.sujet)}</title></head>
<body style="margin:0;padding:0;background:#EEF2F9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#101B45;padding:18px 28px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    ${x.logo ? `<td style="padding-right:12px;vertical-align:middle"><img src="${html(x.logo)}" width="40" height="40" alt="" style="display:block;border:0;width:40px;height:40px"></td>` : ''}
    <td style="vertical-align:middle;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.3px">Volant3ranches <span style="font-weight:400;color:#AFC3EA">VTC</span></td>
  </tr></table>
  ${x.test ? '<div style="margin-top:6px;color:#FFD48A;font-size:12px;font-weight:700">EMAIL DE TEST · aucune valeur</div>' : ''}
</td></tr>
<tr><td style="padding:28px 28px 8px">
  <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#101B45">${html(e.titre)}</h1>
  ${e.paragraphes.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#1F2433">${html(p)}</p>`).join('')}
</td></tr>
<tr><td style="padding:8px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E1E7F2;border-bottom:1px solid #E1E7F2">${lignes}</table></td></tr>
${e.note ? `<tr><td style="padding:14px 28px 0"><p style="margin:0;font-size:13px;line-height:1.45;color:#5B6273">${html(e.note)}</p></td></tr>` : ''}
<tr><td style="padding:20px 28px 26px">
  <p style="margin:0;font-size:15px;color:#1F2433">Fabrice<br><span style="color:#5B6273">Volant3ranches VTC · <a href="tel:${html(tel.replace(/\s/g, ''))}" style="color:#1E3277;text-decoration:none">${html(tel)}</a></span></p>
</td></tr>
<tr><td style="background:#F6F8FC;padding:14px 28px;font-size:11px;line-height:1.5;color:#7A8296">
  ${html(v.raison_sociale)} · ${html(v.siege)} · SIREN ${html(v.siren)}<br>Vous recevez cet email suite à une réservation sur l’application Volant3ranches.
</td></tr>
</table></td></tr></table></body></html>`;
  const texte = [e.titre, '', ...e.paragraphes, '', ...e.details.map(([k, val]) => `${k} : ${val}`), ...(e.note ? ['', e.note] : []),
    '', 'Fabrice', `Volant3ranches VTC · ${tel}`].join('\n');
  return { html: corps, texte };
}

// Logo blanc (volant « 3 ») pour le bandeau, servi par cette fonction : les messageries bloquent
// souvent les images intégrées directement dans l'email.
const LOGO_BLANC = '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';

const OFFRES: Record<string, string> = { tesla: 'Offre Confort · Tesla Model 3', van: 'Offre Premium · Van 9 places' };
const base64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

Deno.serve(async (req: Request) => {
  if (new URL(req.url).searchParams.has('logo')) {
    return new Response(Uint8Array.from(atob(LOGO_BLANC), (ch) => ch.charCodeAt(0)), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const cleBrevo = Deno.env.get('BREVO_API_KEY');
    const expediteur = Deno.env.get('EMAIL_EXPEDITEUR');
    if (!cleBrevo || !expediteur) return new Response(JSON.stringify({ erreur: 'Brevo non configuré' }), { status: 503 });
    const secrete = cleProjet('secrete');
    const admin = createClient(url, secrete);
    const { data: p, error: eP } = await admin.from('parametres').select('*').eq('id', 1).single();
    if (eP || !p) {
      console.error('emails : réglages illisibles', eP?.message);
      return new Response(JSON.stringify({ envoyes: 0, raison: `réglages illisibles : ${eP?.message ?? 'aucune ligne'}` }), { status: 500 });
    }
    if (!p.emails_actifs) { console.log('emails : désactivés dans l’appli'); return new Response(JSON.stringify({ envoyes: 0, raison: 'emails désactivés' })); }

    const { data: file, error } = await admin.rpc('prendre_emails', { p_nombre: 20 });
    if (error) throw new Error(`prendre_emails : ${error.message}`);
    console.log(`emails : ${file?.length ?? 0} à envoyer`);
    let envoyes = 0;
    for (const m of file ?? []) {
      try {
        const { data: course } = await admin.from('courses').select('*').eq('id', m.course_id).single();
        let doc: { id: string; numero: string; type: string; total_ttc: number; test?: boolean } | null = null;
        if (m.document_id) doc = (await admin.from('documents').select('id, numero, type, total_ttc, test').eq('id', m.document_id).maybeSingle()).data;
        const test = !!(p.paiements_test || doc?.test);
        const x: Contexte = {
          type: m.type, course, offre: OFFRES[course.offre_id] ?? course.offre_id, donnees: m.donnees ?? {},
          document: doc, test, logo: `${url}/functions/v1/emails?logo=1`,
          vendeur: { raison_sociale: p.raison_sociale ?? 'Volant3ranches', siege: p.siege ?? '', siren: p.siren ?? '', telephone: p.telephone_chauffeur ?? '' },
        };
        const e = composer(x);
        const { html: corps, texte } = assembler(e, x);

        // Bon de commande / facture en pièce jointe (PDF produit par la fonction document-pdf).
        const pieces: { name: string; content: string }[] = [];
        if (doc) {
          const r = await fetch(`${url}/functions/v1/document-pdf`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cle-interne': secrete, apikey: secrete },
            body: JSON.stringify({ document_id: doc.id }),
          });
          const lien = r.ok ? await r.json() : null;
          if (!lien?.url) throw new Error(`PDF indisponible (${r.status})`);
          const pdf = await fetch(lien.url);
          if (!pdf.ok) throw new Error(`PDF illisible (${pdf.status})`);
          pieces.push({ name: `${doc.type === 'facture' ? 'Facture' : 'Bon de commande'} ${doc.numero}.pdf`, content: base64(new Uint8Array(await pdf.arrayBuffer())) });
        }

        const reponseA = Deno.env.get('EMAIL_REPONSE') || p.email_chauffeur;
        const envoi = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': cleBrevo, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            sender: { name: Deno.env.get('EMAIL_NOM') || 'Volant3ranches VTC', email: expediteur },
            to: [{ email: m.destinataire, name: m.nom ?? undefined }],
            ...(reponseA ? { replyTo: { email: reponseA, name: 'Fabrice · Volant3ranches' } } : {}),
            subject: (test ? '[TEST] ' : '') + e.sujet,
            htmlContent: corps,
            textContent: texte,
            ...(pieces.length ? { attachment: pieces } : {}),
            tags: [m.type],
          }),
        });
        const rep = await envoi.json().catch(() => ({}));
        if (!envoi.ok) throw new Error(`Brevo ${envoi.status} : ${rep.message ?? rep.code ?? ''}`);
        await admin.rpc('email_resultat', { p_email: m.id, p_ok: true, p_message_id: rep.messageId ?? null, p_erreur: null });
        envoyes++;
      } catch (err) {
        console.error('email', m.id, m.type, err instanceof Error ? err.message : err);
        await admin.rpc('email_resultat', { p_email: m.id, p_ok: false, p_message_id: null, p_erreur: err instanceof Error ? err.message : String(err) });
      }
    }
    console.log(`emails : ${envoyes} envoyé(s) sur ${file?.length ?? 0}`);
    return new Response(JSON.stringify({ envoyes, pris: file?.length ?? 0 }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('emails', e);
    return new Response(JSON.stringify({ erreur: 'Erreur du serveur d’emails', detail: e instanceof Error ? e.message : String(e) }), { status: 500 });
  }
});
