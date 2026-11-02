/* Noyau de l'agent jardinier : charge le code de l'app (plantes, climat, calendrier, reconnaissance des noms)
 * dans Node, et lit / modifie le potager sur le serveur PocketBase avec le compte de l'agent. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import vm from 'node:vm';

process.env.TZ ||= 'Europe/Paris';

const ICI = dirname(fileURLToPath(import.meta.url));
const JS = join(ICI, '..', 'potager', 'js');
export const CACHE = process.env.POTAGER_CACHE || join(homedir(), '.cache', 'potager-agent');
export const FICHIER_CONFIG = process.env.POTAGER_CONFIG || join(homedir(), '.config', 'potager-agent', 'config.json');
export const SERVEUR_DEFAUT = 'https://pb.xothiques.duckdns.org';
const LOCAL = ['annee']; // comme dans synchro.js : la saison affichée est propre à chaque appareil

// ---------- Configuration ----------
export function lireConfig() {
  let c = {};
  try { c = JSON.parse(readFileSync(FICHIER_CONFIG, 'utf8')); } catch { /* pas encore de fichier */ }
  return {
    serveur: process.env.POTAGER_SERVEUR || c.serveur || SERVEUR_DEFAUT,
    email: process.env.POTAGER_EMAIL || c.email,
    motDePasse: process.env.POTAGER_MOT_DE_PASSE || c.motDePasse,
    jardin: process.env.POTAGER_JARDIN || c.jardin,
  };
}
export function ecrireConfig(c) {
  mkdirSync(dirname(FICHIER_CONFIG), { recursive: true });
  writeFileSync(FICHIER_CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 });
}

// ---------- Code de l'app ----------
// localStorage de l'app → fichier (cache du climat sur 20 ans et des prévisions).
function stockageFichier() {
  const f = join(CACHE, 'stockage.json');
  let d = {};
  try { d = JSON.parse(readFileSync(f, 'utf8')); } catch { /* cache vide */ }
  const sauver = () => { try { mkdirSync(CACHE, { recursive: true }); writeFileSync(f, JSON.stringify(d)); } catch { /* cache facultatif */ } };
  return {
    getItem: (k) => (k in d ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); sauver(); },
    removeItem: (k) => { delete d[k]; sauver(); },
  };
}

function chargerApp() {
  const erreurs = (...a) => console.error(...a); // stdout est réservé au protocole MCP
  const ctx = { console: { log: erreurs, info: erreurs, warn: erreurs, error: erreurs }, fetch, setTimeout, clearTimeout, setInterval, clearInterval, URL };
  ctx.window = ctx;
  ctx.localStorage = stockageFichier();
  ctx.document = { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  ctx.addEventListener = () => {};
  ctx.location = { hash: '' };
  ctx.navigator = {};
  vm.createContext(ctx);
  for (const f of ['util.js', 'plantes.js', 'climat.js', 'calendrier.js', 'app.js']) {
    vm.runInContext(readFileSync(join(JS, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

export const W = chargerApp();
export const { App, U, G, Calendrier, Climat, PLANTES, PLANTES_PAR_ID, ASSOCIATIONS, FAMILLES, CATEGORIES } = W;

// Saison préparée : à partir d'octobre, l'année suivante (comme l'app).
export const saisonCourante = () => { const d = new Date(); return d.getFullYear() + (d.getMonth() >= 9 ? 1 : 0); };

// ---------- Serveur PocketBase ----------
// Envoi refusé parce que quelqu'un a enregistré entre-temps : par la règle d'accès (404)
// ou par le crochet pocketbase/pb_hooks/versions.pb.js (400).
const versionRefusee = (e) => e.status === 404 || (e.status === 400 && !!(e.data && e.data.data && e.data.data.version));
const TYPES_IMAGE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export class Potager {
  constructor(config = lireConfig()) {
    this.config = config;
    this.auth = null;
    this.jardin = null; // { id, nom, version, modifie_par }
  }

  async api(methode, chemin, corps, form, reessai = true) {
    const headers = {};
    if (this.auth) headers.Authorization = this.auth.token;
    let body = form;
    if (!form && corps !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(corps); }
    let r;
    try { r = await fetch(this.config.serveur + chemin, { method: methode, headers, body }); }
    catch (e) { throw Object.assign(new Error(`Serveur du potager injoignable (${e.message}).`), { status: 0 }); }
    const d = r.status === 204 ? null : await r.json().catch(() => null);
    if (r.status === 401 && this.auth && reessai) { this.auth = null; await this.connexion(); return this.api(methode, chemin, corps, form, false); }
    if (!r.ok) throw Object.assign(new Error(`Le serveur a refusé la demande (erreur ${r.status}${d && d.message ? ' : ' + d.message : ''}).`), { status: r.status, data: d });
    return d;
  }

  async connexion() {
    if (this.auth) return this.auth;
    const { email, motDePasse } = this.config;
    if (!email || !motDePasse) throw new Error("Compte du jardinier non configuré : lancer d'abord « node agent/potager-mcp.mjs inscription ».");
    const d = await this.api('POST', '/api/collections/users/auth-with-password', { identity: email, password: motDePasse });
    this.auth = { token: d.token, record: d.record };
    return this.auth;
  }
  moi() { return this.auth && this.auth.record.id; }

  async idJardin() {
    await this.connexion();
    if (this.config.jardin) return this.config.jardin;
    const l = await this.api('GET', '/api/collections/jardins/records?perPage=2&fields=id,nom&sort=created');
    if (!l.items.length) throw new Error("Le jardinier n'a accès à aucun potager : il faut l'inviter avec un code.");
    return l.items[0].id;
  }

  // Charge le potager dans App.etat (comme le ferait l'app).
  async lire() {
    const id = await this.idJardin();
    const d = await this.api('GET', '/api/collections/jardins/records/' + id);
    this.jardin = { id, nom: d.nom, version: d.version, modifie_par: d.modifie_par };
    App.etat = Object.assign(App.etatDefaut(), JSON.parse(JSON.stringify(d.donnees || {})));
    App.etat.annee = saisonCourante();
    return App.etat;
  }

  // Applique une modification et l'envoie. Si quelqu'un a enregistré entre-temps, le serveur refuse la version :
  // on relit et on rejoue la modification sur l'état à jour.
  async modifier(fn) {
    for (let essai = 0; essai < 5; essai++) {
      await this.lire();
      const resultat = fn(App.etat);
      const donnees = JSON.parse(JSON.stringify(App.etat));
      for (const k of LOCAL) delete donnees[k];
      try {
        await this.api('PATCH', '/api/collections/jardins/records/' + this.jardin.id, { donnees, version: this.jardin.version + 1, modifie_par: this.moi() });
        return resultat;
      } catch (e) {
        if (!versionRefusee(e)) throw e;
      }
    }
    throw new Error("Le potager est modifié en continu par quelqu'un d'autre : réessayer dans un instant.");
  }

  // Climat (20 ans d'historique, en cache) et prévisions pour le lieu du potager.
  async meteo() {
    const lieu = App.etat.lieu;
    App.climat = null;
    // Le service d'historique répond parfois mal au premier appel : une seconde tentative, sinon climat type.
    for (let essai = 0; lieu && !App.climat && essai < 2; essai++) {
      try { App.climat = await Climat.chargerClimat(lieu); } catch (e) { console.error('Climat :', e.message); }
    }
    App.climat ||= Climat.climatParDefaut();
    App.majContexte();
    App.prev = null;
    if (lieu) { try { App.prev = await Climat.chargerPrevisions(lieu); } catch { /* prévisions indisponibles */ } }
  }

  // Envoie une photo (fichier local, ex. reçue sur Telegram) et renvoie sa clé pour le journal.
  async envoyerPhoto(chemin) {
    const type = TYPES_IMAGE[extname(chemin).toLowerCase()];
    if (!type) throw new Error(`Format de photo non pris en charge : ${chemin}`);
    const cle = U.uid();
    const f = new FormData();
    f.append('jardin', this.jardin.id); f.append('cle', cle); f.append('ajoute_par', this.moi());
    f.append('fichier', new Blob([readFileSync(chemin)], { type }), cle + extname(chemin).toLowerCase());
    await this.api('POST', '/api/collections/photos/records', undefined, f);
    return cle;
  }
}
