#!/usr/bin/env node
/* Agent jardinier : serveur MCP « potager » pour Hermes Agent (ou tout autre agent compatible MCP).
 *
 *   node agent/potager-mcp.mjs                     serveur MCP (stdio), lancé par l'agent
 *   node agent/potager-mcp.mjs inscription         crée le compte du jardinier avec un code d'invitation
 *   node agent/potager-mcp.mjs outil <nom> [json]  lance un outil à la main (essais, scripts)
 *   node agent/potager-mcp.mjs surveiller          alertes du moment, pour une tâche planifiée en mode surveillance
 *   node agent/potager-mcp.mjs bibliotheque [dir]  (ré)indexe les livres (EPUB, TXT, MD) de ~/potager-livres
 *
 * Aucune dépendance : seulement Node.js 20 ou plus. */
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Potager, lireConfig, ecrireConfig, FICHIER_CONFIG, CACHE } from './noyau.mjs';
import { OUTILS, alertesDuMoment } from './outils.mjs';
import { texteAlertes } from './alertes.mjs';
import { indexer, DOSSIER_LIVRES } from './bibliotheque.mjs';

const VERSION = '1.0.0';
const CONSIGNES = "Outils du potager familial : l'état réel du jardin (plan, graines, journal), le calendrier et la météo calculés pour son lieu. " +
  "Toujours s'appuyer sur ces outils plutôt que sur des généralités, et dire quand une valeur est indicative.";

const pg = new Potager();

async function appeler(nom, args = {}) {
  const o = OUTILS.find((x) => x.name === nom);
  if (!o) throw new Error(`Outil inconnu : ${nom}. Outils : ${OUTILS.map((x) => x.name).join(', ')}.`);
  return o.fn(pg, args);
}

// ---------- Protocole MCP (JSON-RPC, un message par ligne) ----------
function serveurMcp() {
  const envoyer = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  let file = Promise.resolve(); // un appel d'outil à la fois : l'état du potager est partagé
  createInterface({ input: process.stdin }).on('line', (ligne) => {
    let msg;
    try { msg = JSON.parse(ligne); } catch { return; }
    const { id, method, params = {} } = msg;
    if (id === undefined || id === null) return; // notification
    const ok = (result) => envoyer({ jsonrpc: '2.0', id, result });
    if (method === 'initialize') {
      return ok({ protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'potager', version: VERSION }, instructions: CONSIGNES });
    }
    if (method === 'ping') return ok({});
    if (method === 'tools/list') return ok({ tools: OUTILS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    if (method === 'tools/call') {
      file = file.then(async () => {
        try { ok({ content: [{ type: 'text', text: await appeler(params.name, params.arguments || {}) }] }); }
        catch (e) { ok({ content: [{ type: 'text', text: e.message }], isError: true }); }
      });
      return;
    }
    envoyer({ jsonrpc: '2.0', id, error: { code: -32601, message: `Méthode inconnue : ${method}` } });
  });
}

// ---------- Création du compte du jardinier ----------
async function inscription() {
  // Lecture ligne à ligne (garde les réponses collées d'un coup).
  const rl = createInterface({ input: process.stdin });
  const lignes = rl[Symbol.asyncIterator]();
  const question = async (q, defaut) => {
    process.stdout.write(defaut ? `${q} [${defaut}] : ` : `${q} : `);
    const { value } = await lignes.next();
    if (!process.stdin.isTTY) process.stdout.write((value ?? '') + '\n');
    return (value ?? '').trim() || defaut || '';
  };
  console.log("Création du compte du jardinier sur le serveur du potager.\nIl faut un code d'invitation créé dans l'app (Réglages → Compte et potager partagé).\n");
  const serveur = (await question('Adresse du serveur', lireConfig().serveur)).replace(/\/+$/, '');
  const code = (await question("Code d'invitation")).toLowerCase().replace(/[^a-z0-9]/g, '');
  const email = await question('E-mail du compte (pas besoin d\'une vraie boîte)', 'jardinier@potager.local');
  const nom = await question('Nom affiché dans l\'app', 'Jardinier');
  rl.close();
  // Mot de passe aléatoire, gardé seulement dans le fichier de configuration (lisible par ce compte uniquement).
  const motDePasse = randomBytes(18).toString('base64url');
  const p = new Potager({ serveur, email, motDePasse });
  try {
    await p.api('POST', '/api/collections/users/records', { name: nom, email, password: motDePasse, passwordConfirm: motDePasse, invitation: code });
  } catch (e) {
    const champs = (e.data && e.data.data) || {};
    throw new Error(champs.email ? `Adresse refusée (${champs.email.message || 'déjà utilisée ?'}).` : "Inscription refusée : code d'invitation inconnu ou expiré ?");
  }
  await p.connexion();
  const inv = await p.api('GET', '/api/collections/invitations/records/' + code);
  await p.api('POST', '/api/collections/membres/records', { jardin: inv.jardin, utilisateur: p.moi(), role: 'membre', invitation: code, nom });
  ecrireConfig({ serveur, email, motDePasse, jardin: inv.jardin });
  console.log(`\n✅ Le jardinier a rejoint le potager « ${inv.nom_jardin || inv.jardin} ».\nConfiguration enregistrée dans ${FICHIER_CONFIG}.\nPense à annuler le code d'invitation dans l'app.`);
}

// ---------- Surveillance ----------
// Hermes lance ce script à intervalles réguliers et ne réveille l'agent que si la sortie change.
// La nuit (22 h – 7 h) ou si le calcul échoue, on répète la sortie précédente : aucun message.
const CALME = [22, 7];
async function surveiller() {
  const fichier = join(CACHE, 'surveillance.txt');
  let precedente = 'Aucune alerte.';
  try { precedente = readFileSync(fichier, 'utf8'); } catch { /* premier passage */ }
  const heure = new Date().getHours();
  if (heure >= CALME[0] || heure < CALME[1]) { console.log(precedente); return; }
  let texte;
  try { texte = texteAlertes(await alertesDuMoment(pg)); } catch (e) { console.error(e.message); console.log(precedente); return; }
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(fichier, texte);
  console.log(texte);
}

// ---------- Lancement ----------
const [commande, ...args] = process.argv.slice(2);
if (!commande) serveurMcp();
else if (commande === 'inscription') inscription().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
else if (commande === 'surveiller') surveiller();
else if (commande === 'bibliotheque') {
  try {
    const r = indexer(args[0] || DOSSIER_LIVRES);
    console.log(`${r.livres.length} livre(s), ${r.passages} passages indexés :`);
    for (const l of r.livres) console.log(`- « ${l.titre} »${l.auteur ? ` – ${l.auteur}` : ''} : ${l.passages} passages`);
    if (r.ignores.length) console.log(`Illisibles : ${r.ignores.join(', ')}`);
    if (r.autres.length) console.log(`Formats non pris en charge (convertir en EPUB ou TXT) : ${r.autres.join(', ')}`);
  } catch (e) { console.error('❌ ' + e.message); process.exit(1); }
}
else if (commande === 'outil') {
  appeler(args[0], args[1] ? JSON.parse(args[1]) : {})
    .then((t) => console.log(t))
    .catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
} else {
  console.error('Commandes : (aucune) | inscription | outil <nom> [json] | surveiller | bibliotheque [dossier]');
  process.exit(1);
}
