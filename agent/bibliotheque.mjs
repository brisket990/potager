/* Bibliothèque du jardinier : livres EPUB (ou texte) découpés en passages, avec une recherche en français.
 * Les livres restent sur la machine de l'agent (dossier POTAGER_LIVRES) ; l'index est dans le cache. */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { homedir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { CACHE } from './noyau.mjs';

export const DOSSIER_LIVRES = process.env.POTAGER_LIVRES || join(homedir(), 'potager-livres');
const INDEX = join(CACHE, 'bibliotheque.json');
const TAILLE_PASSAGE = 1400; // caractères, à peu près

// ---------- Lecture d'un EPUB (une archive zip) ----------
function lireZip(buf) {
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error('archive illisible');
  const fichiers = new Map();
  let p = buf.readUInt32LE(fin + 16);
  for (let k = buf.readUInt16LE(fin + 10); k > 0 && buf.readUInt32LE(p) === 0x02014b50; k--) {
    const lgNom = buf.readUInt16LE(p + 28);
    fichiers.set(buf.toString('utf8', p + 46, p + 46 + lgNom), { methode: buf.readUInt16LE(p + 10), taille: buf.readUInt32LE(p + 20), local: buf.readUInt32LE(p + 42) });
    p += 46 + lgNom + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return (nom) => {
    const f = fichiers.get(nom);
    if (!f) return null;
    const debut = f.local + 30 + buf.readUInt16LE(f.local + 26) + buf.readUInt16LE(f.local + 28);
    const brut = buf.subarray(debut, debut + f.taille);
    return (f.methode === 8 ? inflateRawSync(brut) : brut).toString('utf8');
  };
}

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', mdash: '—', ndash: '–', oelig: 'œ', OElig: 'Œ', deg: '°', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ugrave: 'ù', ucirc: 'û', Eacute: 'É' };
const decoder = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITES[e] ?? m));
const sansBalises = (s) => decoder(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attribut = (balise, nom) => (new RegExp(`\\b${nom}\\s*=\\s*["']([^"']*)["']`, 'i').exec(balise) || [])[1];
function resoudre(chemin) {
  const res = [];
  for (const s of chemin.split('/')) { if (s === '..') res.pop(); else if (s && s !== '.') res.push(s); }
  return res.join('/');
}

// Une page XHTML → lignes de texte ; les titres sont marqués « § ».
function lignesHtml(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi, (_, t) => `\n§${sansBalises(t)}\n`)
    .replace(/<\/(p|div|li|tr|blockquote|dd|dt)>|<br\s*\/?>/gi, '\n')
    .split('\n').map((l) => (l.startsWith('§') ? l : sansBalises(l))).filter((l) => l && l !== '§');
}

function lireEpub(chemin) {
  const z = lireZip(readFileSync(chemin));
  const opfChemin = attribut(z('META-INF/container.xml') || '', 'full-path');
  const opf = opfChemin && z(opfChemin);
  if (!opf) throw new Error('EPUB sans sommaire');
  const base = opfChemin.includes('/') ? opfChemin.slice(0, opfChemin.lastIndexOf('/') + 1) : '';
  const meta = (tag) => { const m = new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i').exec(opf); return m ? sansBalises(m[1]) : ''; };
  const manifeste = new Map([...opf.matchAll(/<item\b[^>]*>/gi)].map(([b]) => [attribut(b, 'id'), { href: attribut(b, 'href'), type: attribut(b, 'media-type') || '' }]));
  const lignes = [];
  for (const [, id] of opf.matchAll(/<itemref\b[^>]*idref\s*=\s*["']([^"']+)["']/gi)) {
    const item = manifeste.get(id);
    if (!item || !/html/.test(item.type)) continue;
    const page = z(resoudre(base + decodeURIComponent(item.href)));
    if (page) lignes.push(...lignesHtml(page));
  }
  return { titre: meta('title') || basename(chemin, extname(chemin)), auteur: meta('creator'), lignes };
}

function lireTexte(chemin) {
  const lignes = readFileSync(chemin, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => (/^#{1,4}\s/.test(l) ? '§' + l.replace(/^#+\s*/, '') : l));
  return { titre: basename(chemin, extname(chemin)), auteur: '', lignes };
}

// Lignes → passages d'environ TAILLE_PASSAGE caractères, sans couper un paragraphe ni mélanger deux chapitres.
function decouper(lignes) {
  const passages = [];
  let chapitre = '', courant = [];
  const vider = () => {
    const t = courant.join('\n');
    if (t.length > 80 && !/project gutenberg/i.test(t)) passages.push({ c: chapitre, t });
    courant = [];
  };
  for (const l of lignes) {
    if (l.startsWith('§')) { vider(); chapitre = l.slice(1); continue; }
    if (courant.length && courant.join('\n').length + l.length > TAILLE_PASSAGE) vider();
    courant.push(l);
  }
  vider();
  return passages;
}

// ---------- Index ----------
export function indexer(dossier = DOSSIER_LIVRES) {
  let fichiers;
  try { fichiers = readdirSync(dossier).filter((f) => /\.(epub|txt|md)$/i.test(f)).sort(); }
  catch { throw new Error(`Dossier des livres introuvable : ${dossier}`); }
  const livres = [], passages = [], ignores = [];
  for (const f of fichiers) {
    const chemin = join(dossier, f);
    try {
      const l = /\.epub$/i.test(f) ? lireEpub(chemin) : lireTexte(chemin);
      const p = decouper(l.lignes);
      livres.push({ fichier: f, titre: l.titre, auteur: l.auteur, passages: p.length, taille: statSync(chemin).size });
      for (const x of p) passages.push({ l: livres.length - 1, ...x });
    } catch (e) { ignores.push(`${f} (${e.message})`); }
  }
  const autres = readdirSync(dossier).filter((f) => !/\.(epub|txt|md)$/i.test(f) && statSync(join(dossier, f)).isFile());
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(INDEX, JSON.stringify({ dossier, livres, passages }));
  index = null;
  return { livres, passages: passages.length, ignores, autres };
}

// Mots en français : minuscules sans accents, sans mots vides, avec une racine simple (pluriels, terminaisons courantes).
const VIDES = new Set(('a au aux avec ce ces cet cette dans de des du elle elles en est et etre il ils je la le les leur leurs lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses si son sur ta te tes toi ton tu un une vos votre vous y ' +
  'quand comment quel quelle quels quelles faut faire peut peux dois doit plus moins tres bien sont ont avoir sera fait comme aussi tout tous toute toutes alors donc car ni or cela ceci celui celle ceux sans sous entre vers chez apres avant depuis encore deja').split(' '));
export function mots(texte) {
  return texte.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .split(/[^a-z0-9]+/).filter((m) => m.length > 1 && !VIDES.has(m))
    .map((m) => {
      if (m.length > 4) m = m.replace(/(es|s|x)$/, '');
      if (m.length > 5) m = m.replace(/(ement|ations?|eurs?|euses?|ees?|er|ez|ent|e)$/, '');
      return m;
    });
}

let index = null;
function charger() {
  if (index) return index;
  let d;
  try { d = JSON.parse(readFileSync(INDEX, 'utf8')); } catch { return null; }
  const termes = new Map(), longueurs = [];
  d.passages.forEach((p, i) => {
    const ms = mots(`${p.c} ${p.t}`);
    longueurs.push(ms.length);
    const tf = new Map();
    for (const m of ms) tf.set(m, (tf.get(m) || 0) + 1);
    for (const [m, n] of tf) { if (!termes.has(m)) termes.set(m, []); termes.get(m).push([i, n]); }
  });
  index = { ...d, termes, longueurs, moyenne: longueurs.reduce((s, x) => s + x, 0) / (longueurs.length || 1) };
  return index;
}

export function livres() { const i = charger(); return i ? i.livres : null; }

// Recherche BM25 ; les termes en plus (synonymes, nom latin) comptent pour moitié.
export function chercher(question, nombre = 4, enPlus = []) {
  const i = charger();
  if (!i) return null;
  const poids = new Map();
  for (const m of mots(question)) poids.set(m, 1);
  for (const m of mots(enPlus.join(' '))) if (!poids.has(m)) poids.set(m, 0.5);
  const scores = new Map(), N = i.passages.length, k1 = 1.2, b = 0.75;
  for (const [m, w] of poids) {
    const l = i.termes.get(m);
    if (!l) continue;
    const idf = Math.log(1 + (N - l.length + 0.5) / (l.length + 0.5));
    for (const [p, tf] of l) {
      const s = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * i.longueurs[p] / i.moyenne));
      scores.set(p, (scores.get(p) || 0) + w * s);
    }
  }
  // Les passages trouvés qui se suivent dans un livre sont réunis (un conseil coupé en deux reste lisible).
  const retenus = [...scores].sort((a, b) => b[1] - a[1]).slice(0, nombre).map(([p]) => p);
  const vus = new Set(), res = [];
  for (const p of retenus) {
    if (vus.has(p)) continue;
    let debut = p, fin = p;
    while (retenus.includes(debut - 1) && i.passages[debut - 1].l === i.passages[p].l) debut--;
    while (retenus.includes(fin + 1) && i.passages[fin + 1].l === i.passages[p].l) fin++;
    for (let k = debut; k <= fin; k++) vus.add(k);
    const bloc = i.passages.slice(debut, fin + 1);
    res.push({ c: bloc[0].c, t: bloc.map((x) => x.t).join('\n'), livre: i.livres[i.passages[p].l] });
  }
  return res;
}
