// Volant3ranches VTC · site de réservation (aperçu visuel).
// Trois moteurs : la réservation (mêmes règles de prix que l'application), le bain d'indigo
// (shader repris de mobile/src/CuveIndigo.tsx) et la Tesla 3D (maillage procédural, three.js).

import * as THREE from 'three';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const borne = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lisse = (a, b, v) => { const t = borne((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/* Réservation : données et règles reprises de mobile/src/data.ts      */
/* ------------------------------------------------------------------ */

const lieux = [
  { id: 'tls', nom: 'Aéroport Toulouse-Blagnac', court: 'Toulouse-Blagnac', type: 'aeroport', lat: 43.6293, lon: 1.3638 },
  { id: 'albi-gare', nom: "Gare d'Albi-Ville", court: 'Albi-Ville', type: 'gare', lat: 43.9206, lon: 2.1425 },
  { id: 'castres-gare', nom: 'Gare de Castres', court: 'Castres', type: 'gare', lat: 43.6007, lon: 2.2329 },
  { id: 'carca-gare', nom: 'Gare de Carcassonne', court: 'Carcassonne', type: 'gare', lat: 43.2181, lon: 2.3517 },
  { id: 'matabiau', nom: 'Gare Toulouse-Matabiau', court: 'Matabiau', type: 'gare', lat: 43.6114, lon: 1.4537 },
  { id: 'albi', nom: 'Albi', type: 'ville', lat: 43.9289, lon: 2.1464 },
  { id: 'castres', nom: 'Castres', type: 'ville', lat: 43.606, lon: 2.241 },
  { id: 'gaillac', nom: 'Gaillac', type: 'ville', lat: 43.9016, lon: 1.897 },
  { id: 'lavaur', nom: 'Lavaur', type: 'ville', lat: 43.699, lon: 1.819 },
  { id: 'viterbe', nom: 'Viterbe', type: 'ville', lat: 43.672, lon: 1.733 },
  { id: 'graulhet', nom: 'Graulhet', type: 'ville', lat: 43.76, lon: 1.989 },
  { id: 'mazamet', nom: 'Mazamet', type: 'ville', lat: 43.492, lon: 2.374 },
  { id: 'revel', nom: 'Revel', type: 'ville', lat: 43.458, lon: 2.004 },
  { id: 'toulouse', nom: 'Toulouse, Capitole', type: 'ville', lat: 43.6045, lon: 1.444 },
  { id: 'carcassonne', nom: 'Carcassonne, la Cité', type: 'ville', lat: 43.2063, lon: 2.3644 },
];
const offres = {
  tesla: { jour: 1.8, majore: 2.2, minimum: 20 },
  van: { jour: 2.6, majore: 3.0, minimum: 35 },
};
const feries = ['2026-11-11', '2026-12-25', '2027-01-01', '2027-03-29', '2027-05-01', '2027-05-06', '2027-05-08', '2027-05-17', '2027-07-14', '2027-08-15', '2027-11-01', '2027-11-11', '2027-12-25'];
const euros = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

// Démonstration : vol d'oiseau × 1,25, comme l'application hors ligne. Le vrai prix vient de l'itinéraire routier.
function distance(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return Math.max(3, Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 1.25 * 10) / 10);
}
function majoration(iso, heure) {
  const h = parseInt(heure, 10);
  const r = [];
  if (h >= 22 || h < 6) r.push('nuit');
  const j = new Date(iso + 'T12:00').getDay();
  if (j === 6) r.push('samedi');
  if (j === 0) r.push('dimanche');
  if (feries.includes(iso)) r.push('jour férié');
  return r;
}
const prix = (o, km, maj) => Math.round(Math.max(km * (maj ? o.majore : o.jour), o.minimum) / 0.5) * 0.5;

const sDepart = $('#depart'), sArrivee = $('#arrivee'), cDate = $('#date'), cHeure = $('#heure');
for (const s of [sDepart, sArrivee]) {
  const groupes = [['Aéroport et gares', (l) => l.type !== 'ville'], ['Villes', (l) => l.type === 'ville']];
  for (const [nom, filtre] of groupes) {
    const g = document.createElement('optgroup');
    g.label = nom;
    for (const l of lieux.filter(filtre)) g.append(new Option(l.nom, l.id));
    s.append(g);
  }
}
sDepart.value = 'castres';
sArrivee.value = 'tls';
const demain = new Date(Date.now() + 864e5);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
cDate.value = iso(demain);
cDate.min = iso(new Date());

const puces = $('#puces');
for (const l of lieux.filter((x) => x.type !== 'ville')) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'puce';
  b.dataset.id = l.id;
  b.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-${l.type === 'aeroport' ? 'avion' : 'train'}"/></svg>${l.court}`;
  b.setAttribute('aria-label', `${l.nom} comme destination`);
  b.addEventListener('click', () => {
    if (sDepart.value === l.id) sDepart.value = sArrivee.value;
    sArrivee.value = l.id;
    estimer();
  });
  puces.append(b);
}

// Chiffres qui roulent jusqu'à leur valeur.
const roulements = new WeakMap();
function rouler(el, cible, format) {
  const depart = roulements.get(el)?.valeur ?? 0;
  const etat = { valeur: cible };
  roulements.set(el, etat);
  if (calme) { el.textContent = format(cible); return; }
  const t0 = performance.now();
  const pas = (t) => {
    if (roulements.get(el) !== etat) return;
    const k = 1 - Math.pow(1 - borne((t - t0) / 900), 4);
    el.textContent = format(mix(depart, cible, k));
    if (k < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}

function estimer() {
  const a = lieux.find((l) => l.id === sDepart.value), b = lieux.find((l) => l.id === sArrivee.value);
  for (const p of $$('.puce')) p.setAttribute('aria-pressed', String(p.dataset.id === a.id || p.dataset.id === b.id));
  const detail = $('#est-detail');
  if (a.id === b.id) {
    detail.textContent = '· choisissez deux lieux différents';
    $('#est-tesla').textContent = $('#est-van').textContent = '–';
    roulements.delete($('#est-tesla')); roulements.delete($('#est-van'));
    return;
  }
  const km = distance(a, b);
  const maj = majoration(cDate.value || iso(demain), cHeure.value || '09:00');
  detail.textContent = `· ${km.toLocaleString('fr-FR')} km`;
  $('#est-note').textContent = `${maj.length ? 'Tarif majoré (' + maj.join(', ') + ')' : 'Tarif de jour'}. Estimation à vol d'oiseau : le prix exact, calculé sur la route réelle, s'affiche avant l'envoi de la demande.`;
  const arrondi = (v) => euros(Math.round(v / 0.5) * 0.5);
  rouler($('#est-tesla'), prix(offres.tesla, km, maj.length), arrondi);
  rouler($('#est-van'), prix(offres.van, km, maj.length), arrondi);
}
for (const c of [sDepart, sArrivee, cDate, cHeure]) c.addEventListener('change', estimer);
$('#inverser').addEventListener('click', () => { [sDepart.value, sArrivee.value] = [sArrivee.value, sDepart.value]; estimer(); });
estimer();

let minuterie;
$('#envoyer').addEventListener('click', () => {
  const a = $('#apercu');
  a.hidden = false;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => { a.hidden = true; }, 3800);
});

// Le panneau nominatif.
const panneauNom = $('#panneau-nom');
$('#nom').addEventListener('input', (e) => { panneauNom.textContent = e.target.value.trim() || 'M. et Mme Durand'; });

/* ------------------------------------------------------------------ */
/* Apparitions                                                         */
/* ------------------------------------------------------------------ */

for (const t of $$('[data-r="mots"]')) {
  const mots = t.textContent.trim().split(/ +/);
  t.setAttribute('aria-label', t.textContent.trim());
  t.innerHTML = mots.map((m, i) => `<span class="mot" aria-hidden="true" style="--n:${i}"><span>${m}</span></span>`).join(' ');
}
const vus = new IntersectionObserver((entrees) => {
  for (const e of entrees) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('vu');
    vus.unobserve(e.target);
    for (const n of $$('[data-compte]', e.target)) {
      rouler(n, parseFloat(n.dataset.compte), (v) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  }
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
for (const el of $$('[data-r]')) vus.observe(el);

/* ------------------------------------------------------------------ */
/* État du défilement                                                  */
/* ------------------------------------------------------------------ */

const plongee = $('.plongee'), plongeeFixe = $('.plongee-fixe'), reperes = $$('.reperes li'), pellicule = $('#pellicule'), barre = $('#barre');
const etat = { p: 0, niveau: 0, trouble: 0, fond: 0, souris: [0, 0], dernierY: 0 };
let enCuve = null;

function mesurer() {
  const y = scrollY, vh = innerHeight;
  const r = plongee.getBoundingClientRect();
  const haut = r.top + y, course = r.height - vh;
  etat.p = borne((y - haut) / course);
  etat.niveau = lisse(0.1, 0.5, etat.p);
  etat.trouble = borne(y / haut);
  const fin = haut + course;
  etat.fond = borne((y - fin) / Math.max(1, document.documentElement.scrollHeight - vh - fin));

  plongeeFixe.style.setProperty('--p2', lisse(0.06, 0.2, etat.p).toFixed(3));
  reperes.forEach((li, i) => {
    li.style.setProperty('--o', (lisse(0.46 + i * 0.09, 0.54 + i * 0.09, etat.p) * (1 - lisse(0.84, 0.9, etat.p))).toFixed(3));
  });
  plongeeFixe.style.setProperty('--pf', lisse(0.88, 0.97, etat.p).toFixed(3));

  const cuve = etat.niveau > 0.5;
  if (cuve !== enCuve) { enCuve = cuve; document.body.classList.toggle('en-cuve', cuve); }

  // La pellicule glisse latéralement pendant qu'elle traverse l'écran.
  const pr = pellicule.getBoundingClientRect();
  if (!calme && pr.top < vh && pr.bottom > 0) {
    const k = borne((vh - pr.top) / (vh + pr.height));
    const depassement = Math.max(0, pellicule.scrollWidth - innerWidth);
    pellicule.style.transform = `translate3d(${(-k * depassement).toFixed(1)}px,0,0)`;
  }

  // La barre s'efface quand on descend, revient quand on remonte.
  barre.classList.toggle('cachee', y > vh * 0.6 && y > etat.dernierY && !barre.matches(':focus-within'));
  etat.dernierY = y;
}
addEventListener('scroll', mesurer, { passive: true });
addEventListener('resize', mesurer);
addEventListener('pointermove', (e) => { etat.souris = [(e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1]; }, { passive: true });
mesurer();

/* ------------------------------------------------------------------ */
/* Le bain d'indigo (WebGL brut, shader de l'application)              */
/* ------------------------------------------------------------------ */

const FRAG = `
precision highp float;
uniform vec2 u_res; uniform float u_t; uniform vec2 u_tilt;
uniform float u_niveau; uniform float u_trouble; uniform float u_fond;
uniform vec3 u_eau; uniform vec3 u_voile; uniform vec3 u_indigo; uniform vec3 u_cuve; uniform vec3 u_bain4;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  p += u_tilt * 0.12; p.y += u_trouble * 0.5 + u_fond * 0.9;
  float t = u_t * 0.045;
  vec2 q = vec2(fbm(p * 1.4 + vec2(0.0, t)), fbm(p * 1.4 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p * 1.4 + 2.8 * q + vec2(1.7, 9.2) + 0.7 * t), fbm(p * 1.4 + 2.8 * q + vec2(8.3, 2.8) - 0.6 * t));
  float f = fbm(p * 1.4 + 3.0 * r);

  // La cuve : indigo dense, voiles plus clairs, filaments de lumière. Elle s'assombrit vers le fond.
  vec3 dense = mix(u_cuve, u_indigo, smoothstep(0.2, 0.85, f));
  dense = mix(dense, u_bain4, 0.34 * smoothstep(0.42, 0.95, r.x * f * 1.6));
  dense += (1.0 - smoothstep(0.0, 0.04, abs(f - 0.52))) * 0.07;
  dense = mix(dense, u_cuve * 0.82, u_fond * 0.55);

  // L'eau claire, de plus en plus traversée de volutes de teinture.
  vec3 eau = mix(u_eau, u_voile, (0.42 + 0.4 * u_trouble) * smoothstep(0.36, 0.8, f));
  eau = mix(eau, u_bain4, (0.05 + 0.3 * u_trouble) * smoothstep(0.52, 0.9, r.y));
  eau += (1.0 - smoothstep(0.0, 0.03, abs(f - 0.46))) * 0.05;

  // L'encre monte du bas et se diffuse en suivant les volutes.
  float front = u_niveau * 2.3 - 0.65;
  float m = 1.0 - smoothstep(front - 0.25, front + 0.1, uv.y + (f - 0.5) * 0.8);
  vec3 col = mix(eau, dense, m);
  col *= 1.0 - 0.16 * dot(p, p) * m;
  gl_FragColor = vec4(col, 1.0);
}`;

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

function creerBain() {
  const toile = $('#bain');
  const gl = toile.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const compiler = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, compiler(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }'));
  gl.attachShader(prog, compiler(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.bindAttribLocation(prog, 0, 'a');
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(prog, n);
  gl.uniform3fv(u('u_eau'), hex('#EAF0FA'));
  gl.uniform3fv(u('u_voile'), hex('#BFD0EE'));
  gl.uniform3fv(u('u_indigo'), hex('#1E3277'));
  gl.uniform3fv(u('u_cuve'), hex('#101B45'));
  gl.uniform3fv(u('u_bain4'), hex('#5F7FC0'));
  const loc = { res: u('u_res'), t: u('u_t'), tilt: u('u_tilt'), niveau: u('u_niveau'), trouble: u('u_trouble'), fond: u('u_fond') };
  // Définition réduite : le motif est flou par nature, le GPU travaille beaucoup moins.
  const taille = () => {
    const k = 0.5;
    toile.width = Math.max(2, Math.round(innerWidth * k));
    toile.height = Math.max(2, Math.round(innerHeight * k));
    gl.viewport(0, 0, toile.width, toile.height);
    gl.uniform2f(loc.res, toile.width, toile.height);
  };
  taille();
  addEventListener('resize', taille);
  const tilt = [0, 0];
  return (t) => {
    tilt[0] += (etat.souris[0] - tilt[0]) * 0.03;
    tilt[1] += (-etat.souris[1] - tilt[1]) * 0.03;
    gl.uniform1f(loc.t, calme ? 12 : t);
    gl.uniform2f(loc.tilt, tilt[0], tilt[1]);
    gl.uniform1f(loc.niveau, etat.niveau);
    gl.uniform1f(loc.trouble, etat.trouble);
    gl.uniform1f(loc.fond, etat.fond);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

/* ------------------------------------------------------------------ */
/* La Tesla 3D : carrosserie générée par sections, posée sur le bain   */
/* ------------------------------------------------------------------ */

// Interpolation monotone entre points clés (pas de dépassement entre deux cotes).
function courbe(cles) {
  const n = cles.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((cles[i + 1][1] - cles[i][1]) / (cles[i + 1][0] - cles[i][0]));
  for (let i = 0; i < n; i++) m.push(i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  return (u) => {
    let i = 0;
    while (i < n - 2 && u > cles[i + 1][0]) i++;
    const h = cles[i + 1][0] - cles[i][0], t = borne((u - cles[i][0]) / h), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * cles[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * cles[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}

const LONG = 4.69, DEMI = 0.925;
const AXES = [1.5, -1.375], RAYON_ROUE = 0.335, RAYON_ARCHE = 0.395;
// u : 0 = poupe, 1 = proue. Cotes en mètres, relevées sur la silhouette d'une berline fastback.
const bas = courbe([[0, 0.36], [0.04, 0.25], [0.12, 0.18], [0.88, 0.18], [0.96, 0.21], [1, 0.27]]);
const ceinture = courbe([[0, 0.92], [0.06, 1.0], [0.2, 0.985], [0.45, 0.93], [0.66, 0.925], [0.8, 0.86], [0.93, 0.77], [1, 0.67]]);
const toit = courbe([[0, 0.94], [0.05, 1.06], [0.15, 1.2], [0.3, 1.375], [0.42, 1.44], [0.5, 1.425], [0.585, 1.275], [0.67, 0.995], [0.8, 0.905], [0.93, 0.81], [1, 0.69]]);

// Point de la carrosserie : u le long de la voiture, phi en degrés (>0 au-dessus de la ceinture de caisse, <0 en dessous), cote = ±1.
function peau(u, phi, cote) {
  const b = bas(u), s = ceinture(u), T = Math.max(toit(u), s + 0.02);
  const w = DEMI * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 7)), 1 / 2.2) * (1 - 0.045 * lisse(0.55, 1, u)) * (1 - 0.03 * lisse(0.4, 0, u));
  const a = (Math.abs(phi) * Math.PI) / 180, c = Math.max(0, Math.cos(a)), sn = Math.sin(a);
  let y, z;
  if (phi >= 0) {
    const cab = lisse(0.04, 0.3, T - s);
    const e = 2 / mix(4.2, 3.7, cab);
    z = w * (1 - 0.15 * cab * sn) * Math.pow(c, e);
    y = s + (T - s) * Math.pow(sn, e);
  } else {
    const e = 2 / 4.6;
    z = w * (1 - 0.05 * sn) * Math.pow(c, e);
    y = s - (s - b) * Math.pow(sn, e);
  }
  return [(u - 0.5) * LONG, y, z * cote];
}

function creerCarrosserie() {
  const NS = 120, N1 = 12, N2 = 18;
  // Un anneau fermé : du dessous, on remonte le flanc droit, on passe par le toit, on redescend à gauche.
  const anneau = [];
  for (let j = N1; j >= 0; j--) anneau.push([-(j / N1) * 90, 1, 0]);
  for (let j = 1; j <= N2; j++) anneau.push([Math.pow(j / N2, 1.5) * 90, 1, j]);
  for (let j = N2 - 1; j >= 0; j--) anneau.push([Math.pow(j / N2, 1.5) * 90, -1, j]);
  for (let j = 1; j < N1; j++) anneau.push([-(j / N1) * 90, -1, 0]);
  const R = anneau.length;
  const pos = [], us = [];
  for (let i = 0; i <= NS; i++) {
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / NS);
    us.push(u);
    for (const [phi, cote] of anneau) pos.push(...peau(u, phi, cote));
  }
  const tole = [], vitre = [], seuil = [];
  for (let i = 0; i < NS; i++) {
    const um = (us[i] + us[i + 1]) / 2;
    for (let k = 0; k < R; k++) {
      const k2 = (k + 1) % R;
      const a = i * R + k, b = i * R + k2, c = (i + 1) * R + k, d = (i + 1) * R + k2;
      const rang = Math.min(anneau[k][2], anneau[k2][2]);
      // Le pavillon vitré : pare-brise, toit en verre et lunette, d'un seul tenant comme sur la Model 3.
      const estVitre = rang >= 3 && um > 0.105 && um < 0.652 && toit(um) - ceinture(um) > 0.1;
      const estSeuil = anneau[k][0] <= -52 && anneau[k2][0] <= -52;
      (estVitre ? vitre : estSeuil ? seuil : tole).push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex([...tole, ...vitre, ...seuil]);
  geo.addGroup(0, tole.length, 0);
  geo.addGroup(tole.length, vitre.length, 1);
  geo.addGroup(tole.length + vitre.length, seuil.length, 2);
  geo.computeVertexNormals();
  return geo;
}

// Petite pièce épousant la carrosserie (optiques).
function piece(u0, u1, p0, p1, cote, epaisseur = 0.006) {
  const nu = 14, np = 8, pos = [], idx = [];
  const pt = (u, phi) => new THREE.Vector3(...peau(u, phi, cote));
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= np; j++) {
    const u = mix(u0, u1, i / nu), phi = mix(p0, p1, j / np);
    const P = pt(u, phi);
    const n = pt(u + 0.004, phi).sub(pt(u - 0.004, phi)).cross(pt(u, phi + 1).sub(pt(u, phi - 1))).normalize();
    if (n.z * cote < 0) n.negate();
    P.addScaledVector(n, epaisseur);
    pos.push(P.x, P.y, P.z);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < np; j++) {
    const a = i * (np + 1) + j;
    idx.push(a, a + np + 1, a + 1, a + 1, a + np + 1, a + np + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function creerScene() {
  const toile = $('#scene');
  let rendu;
  try { rendu = new THREE.WebGLRenderer({ canvas: toile, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { return null; }
  rendu.setPixelRatio(Math.min(devicePixelRatio, 2));
  rendu.toneMapping = THREE.ACESFilmicToneMapping;
  rendu.toneMappingExposure = 1.05;
  rendu.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);

  // Studio : un ciel pâle du Lauragais et deux rampes de lumière qui dessinent les lignes de caisse.
  const studio = new THREE.Scene();
  studio.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 v; void main(){
      vec3 haut = vec3(0.22, 0.32, 0.66), horizon = vec3(1.1, 1.16, 1.35), sol = vec3(0.05, 0.08, 0.2);
      vec3 c = v.y > 0.0 ? mix(horizon, haut, pow(v.y, 0.32)) : mix(horizon * 0.5, sol, pow(-v.y, 0.35));
      gl_FragColor = vec4(c, 1.0); }`,
  })));
  const rampe = (x, y, z, w, h, force) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(force), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0.6, 0); studio.add(m);
  };
  rampe(0, 9, 0, 14, 1.4, 4.5);
  rampe(-2, 5, 9, 10, 1.2, 4);
  rampe(3, 4, -9, 12, 1.0, 3);
  const pmrem = new THREE.PMREMGenerator(rendu);
  scene.environment = pmrem.fromScene(studio, 0.03).texture;

  const cle = new THREE.DirectionalLight(0xffffff, 1.6);
  cle.position.set(4, 7, 5);
  const contre = new THREE.DirectionalLight(0x8fb0ff, 0);
  contre.position.set(-5, 3.5, -6);
  const contre2 = new THREE.DirectionalLight(0xc9d6ff, 0);
  contre2.position.set(6, 2.5, -5);
  scene.add(cle, contre, contre2);

  const voiture = new THREE.Group();
  scene.add(voiture);

  // Carrosserie : tôle noire vernie + pavillon vitré. Les passages de roue sont découpés dans le shader.
  const peinture = new THREE.MeshPhysicalMaterial({ color: 0x10152a, metalness: 0.75, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
  const decoupe = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('void main() {', `void main() {
      float arche = min(distance(vObj.xy, vec2(${AXES[0].toFixed(3)}, ${RAYON_ROUE.toFixed(3)})), distance(vObj.xy, vec2(${AXES[1].toFixed(3)}, ${RAYON_ROUE.toFixed(3)})));
      if (arche < ${RAYON_ARCHE.toFixed(3)} && abs(vObj.z) > 0.5) discard;`);
  };
  peinture.onBeforeCompile = decoupe;
  const verre = new THREE.MeshPhysicalMaterial({ color: 0x020409, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 0.9, side: THREE.DoubleSide });
  const plastique = new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  plastique.onBeforeCompile = decoupe;
  voiture.add(new THREE.Mesh(creerCarrosserie(), [peinture, verre, plastique]));

  // Roues, passages de roue, rétroviseurs.
  const noir = new THREE.MeshBasicMaterial({ color: 0x020308, side: THREE.DoubleSide });
  const gomme = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.9, metalness: 0 });
  const jante = new THREE.MeshStandardMaterial({ color: 0x191c24, roughness: 0.3, metalness: 1 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xaeb6c8, roughness: 0.26, metalness: 1 });
  const pneu = new THREE.LatheGeometry([[0.2, -0.118], [0.3, -0.12], [0.328, -0.095], [RAYON_ROUE, -0.04], [RAYON_ROUE, 0.04], [0.328, 0.095], [0.3, 0.12], [0.2, 0.118]].map(([r, h]) => new THREE.Vector2(r, h)), 48).rotateX(Math.PI / 2);
  const disque = new THREE.CylinderGeometry(0.245, 0.245, 0.2, 40).rotateX(Math.PI / 2);
  const branche = new THREE.BoxGeometry(0.2, 0.075, 0.03).translate(0.135, 0, 0.105);
  const moyeu = new THREE.CylinderGeometry(0.055, 0.06, 0.04, 24).rotateX(Math.PI / 2).translate(0, 0, 0.11);
  const passage = new THREE.CylinderGeometry(RAYON_ARCHE + 0.012, RAYON_ARCHE + 0.012, 0.5, 40, 1, true).rotateX(Math.PI / 2);
  const fondPassage = new THREE.CircleGeometry(RAYON_ARCHE + 0.012, 40);
  const roues = [];
  for (const x of AXES) for (const cote of [1, -1]) {
    const roue = new THREE.Group();
    roue.add(new THREE.Mesh(pneu, gomme), new THREE.Mesh(disque, jante), new THREE.Mesh(moyeu, gomme));
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(branche, alu); b.rotation.z = (i / 5) * Math.PI * 2; roue.add(b); }
    const porte = new THREE.Group();
    porte.position.set(x, RAYON_ROUE, 0.785 * cote);
    if (cote < 0) porte.rotation.y = Math.PI;
    porte.add(roue);
    voiture.add(porte);
    roues.push(roue);
    const p = new THREE.Mesh(passage, noir), fp = new THREE.Mesh(fondPassage, noir);
    p.position.set(x, RAYON_ROUE, 0.6 * cote);
    fp.position.set(x, RAYON_ROUE, 0.36 * cote);
    voiture.add(p, fp);
  }
  for (const cote of [1, -1]) {
    const retro = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14).scale(1, 0.62, 0.72), peinture);
    retro.position.set(0.63, 1.0, 0.98 * cote);
    voiture.add(retro);
  }

  // Optiques : elles s'allument quand l'encre monte.
  const phare = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
  const feu = new THREE.MeshBasicMaterial({ color: 0xff2a1f, side: THREE.DoubleSide, toneMapped: false });
  for (const cote of [1, -1]) {
    voiture.add(new THREE.Mesh(piece(0.93, 0.992, -4, -9.5, cote), phare));
    voiture.add(new THREE.Mesh(piece(0.005, 0.075, -4, -10, cote), feu));
  }
  const halo = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(210,225,255,.45)'); g.addColorStop(1, 'rgba(160,190,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const halos = [1, -1].map((cote) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    s.position.set(2.2, 0.68, 0.6 * cote); s.scale.setScalar(1.4);
    voiture.add(s);
    return s;
  });

  // Reflet dans le bain : la même voiture, retournée, fondue dans l'eau.
  const refletMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { c: { value: new THREE.Color(0x1e3277) }, f: { value: 0.3 } },
    vertexShader: 'varying float h; void main(){ h = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float f; varying float h; void main(){ gl_FragColor = vec4(c, f * smoothstep(0.85, 0.15, h)); }',
  });
  const reflet = new THREE.Mesh(voiture.children[0].geometry, refletMat);
  reflet.scale.y = -1;
  reflet.renderOrder = -2;
  scene.add(reflet);

  // Ombre de contact et ondes à la surface.
  const ombreTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(128, 64, 4, 128, 64, 126);
    g.addColorStop(0, 'rgba(8,14,40,.85)'); g.addColorStop(0.55, 'rgba(8,14,40,.4)'); g.addColorStop(1, 'rgba(8,14,40,0)');
    x.save(); x.scale(1, 0.5); x.translate(0, 64); x.fillStyle = g; x.fillRect(0, -64, 256, 256); x.restore();
    return new THREE.CanvasTexture(c);
  })();
  const ombre = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ombreTex, transparent: true, depthWrite: false, opacity: 0.8 }));
  ombre.position.y = 0.004; ombre.renderOrder = -1;
  scene.add(ombre);
  const ondes = new THREE.Mesh(new THREE.PlaneGeometry(22, 22).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { t: { value: 0 }, c: { value: new THREE.Color(0xffffff) }, f: { value: 1 } },
    vertexShader: 'varying vec2 p; void main(){ p = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float t; uniform vec3 c; uniform float f; varying vec2 p; void main(){
      float d = length(p / vec2(2.5, 1.25));
      float o = sin(d * 11.0 - t * 1.1);
      float a = smoothstep(0.82, 1.0, o) * smoothstep(0.95, 1.25, d) * smoothstep(3.4, 1.3, d);
      gl_FragColor = vec4(c, a * f); }`,
  }));
  ondes.renderOrder = -3;
  scene.add(ondes);

  const ancres = { hero: $('#ancre-hero'), plongee: $('#ancre-plongee') };
  const taille = () => { rendu.setSize(innerWidth, innerHeight, false); };
  taille();
  addEventListener('resize', taille);

  const debut = performance.now();
  const lisseVue = { az: -100, el: 4, x: 0 };
  let propre = false;
  const cible = new THREE.Vector3(0, 0.62, 0);

  return (t) => {
    const W = innerWidth, H = innerHeight;
    const rh = ancres.hero.getBoundingClientRect(), rp = ancres.plongee.getBoundingClientRect();
    const dansPlongee = rp.top < H * 1.2 && plongee.getBoundingClientRect().bottom > 0 && rh.bottom <= 0;
    const r = dansPlongee ? rp : rh;
    if (r.bottom < -H * 0.3 || r.top > H * 1.3) {
      if (!propre) { rendu.clear(); propre = true; }
      return;
    }
    propre = false;

    // Cadrage : angle de vue et position selon l'endroit de la page.
    let az, el, plonge = 0, entree = 1;
    if (dansPlongee) {
      const p = etat.p, avant = borne(1 - rp.top / H);
      az = mix(-90, -54, lisse(0, 0.3, p)) + mix(0, 30, lisse(0.3, 1, p));
      el = mix(4, 10, lisse(0, 0.45, p)) + mix(0, 5, lisse(0.55, 1, p));
      plonge = etat.niveau;
      entree = calme ? 1 : avant;
    } else {
      const k = calme ? 1 : 1 - Math.pow(1 - borne((performance.now() - debut - 250) / 2400), 4);
      entree = k;
      az = mix(-118, -40, k) + etat.souris[0] * 5 + Math.sin(t * 0.25) * 2.5;
      el = mix(3, 8.5, k) - etat.souris[1] * 2.5;
    }
    lisseVue.az += (az - lisseVue.az) * (calme ? 1 : 0.12);
    lisseVue.el += (el - lisseVue.el) * (calme ? 1 : 0.12);

    const a = (lisseVue.az * Math.PI) / 180, e = (lisseVue.el * Math.PI) / 180;
    const largeur = Math.abs(Math.sin(a)) * 2.45 + Math.abs(Math.cos(a)) * 1.05 + 0.2;
    const tg = Math.tan((camera.fov * Math.PI) / 360);
    const d = Math.max((largeur * H) / (r.width * tg), (0.92 * H) / (r.height * tg)) + Math.abs(Math.cos(a)) * 2.2;
    camera.aspect = W / H;
    camera.position.set(Math.cos(a) * Math.cos(e) * d, cible.y + Math.sin(e) * d, Math.sin(a) * Math.cos(e) * d);
    camera.lookAt(cible);
    // Le point de fuite est déplacé au centre de l'ancre : la voiture suit la mise en page sans être rognée.
    camera.setViewOffset(W, H, W / 2 - (r.left + r.width / 2), H / 2 - (r.top + r.height / 2), W, H);

    // La voiture arrive en glissant, flotte, puis s'enfonce un peu quand l'encre monte.
    const flotte = calme ? 0 : Math.sin(t * 0.9) * 0.012;
    voiture.position.set(dansPlongee ? 0 : (1 - entree) * 7, flotte - plonge * 0.05, 0);
    voiture.rotation.z = calme ? 0 : Math.sin(t * 0.7) * 0.004;
    const tour = dansPlongee ? -t * 0.6 : -(1 - entree) * 16 - t * 0.4;
    for (const roue of roues) roue.rotation.z = roue.parent.rotation.y ? -tour : tour;
    reflet.position.copy(voiture.position); reflet.position.y = -voiture.position.y - 0.02;

    // Lumière : plein jour sur l'eau claire, contre-jours bleus et phares dans la cuve.
    scene.environmentIntensity = mix(1.15, 0.5, plonge);
    cle.intensity = mix(1.6, 0.35, plonge);
    contre.intensity = plonge * 5.5;
    contre2.intensity = plonge * 3.2;
    const allume = lisse(0.35, 0.8, plonge);
    phare.color.setScalar(mix(0.92, 2.4, allume));
    feu.color.setRGB(mix(0.5, 1.9, allume), mix(0.02, 0.12, allume), mix(0.02, 0.08, allume));
    for (const s of halos) s.material.opacity = allume * 0.9;
    refletMat.uniforms.c.value.setHex(plonge > 0.5 ? 0x5f7fc0 : 0x1e3277);
    refletMat.uniforms.f.value = mix(0.14, 0.16, plonge);
    ombre.material.opacity = mix(0.75, 0.5, plonge);
    ondes.material.uniforms.t.value = calme ? 0 : t;
    ondes.material.uniforms.c.value.setHex(plonge > 0.5 ? 0x9fb6ee : 0x7f9ad6);
    ondes.material.uniforms.f.value = mix(0.55, 0.4, plonge) * entree;

    rendu.render(scene, camera);
  };
}

/* ------------------------------------------------------------------ */
/* Boucle                                                              */
/* ------------------------------------------------------------------ */

const bain = creerBain();
const scene3d = bain ? creerScene() : null;
if (bain) document.documentElement.classList.add('gl');
let visible = true;
document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
function boucle(ms) {
  if (visible) {
    const t = ms / 1000;
    bain?.(t);
    scene3d?.(t);
  }
  requestAnimationFrame(boucle);
}
requestAnimationFrame(boucle);
