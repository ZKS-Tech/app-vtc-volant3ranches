import { useEffect, useRef, useState } from 'react';
import { ComponentType, RefObject } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView as WebViewBrut, WebViewMessageEvent } from 'react-native-webview';

// Types de la WebView incompatibles avec ceux de React 19 : on la décrit nous-mêmes.
type VueWeb = { injectJavaScript: (js: string) => void };
const WebView = WebViewBrut as unknown as ComponentType<{
  ref: RefObject<VueWeb | null>; originWhitelist: string[]; source: { html: string; baseUrl: string };
  onMessage: (e: WebViewMessageEvent) => void; javaScriptEnabled: boolean; style: object;
}>;

// CAPTCHA (Cloudflare Turnstile) pour Supabase Auth : comptes invités, connexion, code de
// mot de passe oublié. Le widget tourne dans une vue web invisible ; il ne s'affiche que si
// Cloudflare demande une vérification (rare sur un vrai téléphone).
// Clé de site (publique) : EXPO_PUBLIC_TURNSTILE_SITE_KEY dans mobile/.env. Sans elle, aucun
// CAPTCHA n'est demandé (et il ne faut pas l'activer dans Supabase).
const CLE_SITE = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';
// Nom de domaine déclaré dans le widget Turnstile (Cloudflare › Turnstile › le widget › Hostnames).
const DOMAINE = 'https://volant3ranches-vtc.fr';

export const captchaActif = !!CLE_SITE && Platform.OS !== 'web';

type Demande = { resoudre: (t: string) => void; rejeter: (e: Error) => void };
let demander: (() => Promise<string>) | null = null;
const enAttente: (() => void)[] = [];

/** Jeton à usage unique à joindre à l'appel Supabase Auth ; undefined si le CAPTCHA n'est pas configuré. */
export async function jetonCaptcha(): Promise<string | undefined> {
  if (!captchaActif) return undefined;
  if (!demander) await new Promise<void>((ok, ko) => { enAttente.push(ok); setTimeout(() => ko(new Error('Vérification anti-robot indisponible')), 20000); });
  return demander!();
}

const page = (cle: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=pret" async defer></script>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:transparent}</style></head>
<body><div id="w"></div><script>
var id = null;
function envoyer(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
function pret() { envoyer({ type: 'pret' }); }
function jeton() {
  if (id !== null) { turnstile.reset(id); return; }
  id = turnstile.render('#w', {
    sitekey: ${JSON.stringify(cle)}, appearance: 'interaction-only',
    callback: function (t) { envoyer({ type: 'jeton', t: t }); },
    'error-callback': function (e) { envoyer({ type: 'erreur', e: String(e) }); return true; },
    'expired-callback': function () { envoyer({ type: 'expire' }); },
    'before-interactive-callback': function () { envoyer({ type: 'montrer' }); },
    'after-interactive-callback': function () { envoyer({ type: 'cacher' }); }
  });
}
</script></body></html>`;

// Monté une fois à la racine de l'appli.
export function CaptchaInvisible() {
  const vue = useRef<VueWeb>(null);
  const courante = useRef<Demande | null>(null);
  const [visible, setVisible] = useState(false);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    if (!captchaActif || !pret) return;
    demander = () => new Promise<string>((resoudre, rejeter) => {
      courante.current?.rejeter(new Error('Vérification remplacée'));
      courante.current = { resoudre, rejeter };
      vue.current?.injectJavaScript('jeton(); true;');
      setTimeout(() => { if (courante.current?.resoudre === resoudre) { courante.current = null; setVisible(false); rejeter(new Error('Vérification anti-robot trop longue : réessayez')); } }, 60000);
    });
    enAttente.splice(0).forEach((f) => f());
    return () => { demander = null; };
  }, [pret]);

  if (!captchaActif) return null;
  const message = (e: WebViewMessageEvent) => {
    let m: { type: string; t?: string; e?: string };
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'pret') setPret(true);
    else if (m.type === 'montrer') setVisible(true);
    else if (m.type === 'cacher') setVisible(false);
    else if (m.type === 'jeton' && m.t) { setVisible(false); courante.current?.resoudre(m.t); courante.current = null; }
    else if (m.type === 'erreur' || m.type === 'expire') { setVisible(false); courante.current?.rejeter(new Error('Vérification anti-robot échouée : réessayez')); courante.current = null; }
  };
  // Superposition simple (pas de fenêtre modale, qui bloquerait les appuis sur toute l'appli) :
  // invisible et inerte tant que Cloudflare ne demande rien.
  return (
    <View pointerEvents={visible ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, s.fond, !visible && s.cache]}>
      <View style={s.carte}>
        <Text style={s.titre}>Vérification rapide</Text>
        <WebView ref={vue} originWhitelist={['*']} source={{ html: page(CLE_SITE), baseUrl: DOMAINE }} onMessage={message}
          javaScriptEnabled style={s.vue} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fond: { backgroundColor: 'rgba(16,27,69,0.5)', alignItems: 'center', justifyContent: 'center' },
  cache: { opacity: 0, zIndex: -1 },
  carte: { width: 330, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, gap: 8 },
  titre: { fontSize: 16, fontWeight: '700', color: '#101B45', textAlign: 'center' },
  vue: { height: 80, backgroundColor: 'transparent' },
});
