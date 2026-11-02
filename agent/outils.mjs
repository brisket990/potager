/* Outils du jardinier : ce que l'agent peut consulter et modifier dans le potager.
 * Chaque outil renvoie un texte en français, lisible par l'agent et facile à reformuler. */
import { App, U, G, Calendrier, Climat, PLANTES, PLANTES_PAR_ID, FAMILLES, CATEGORIES, saisonCourante } from './noyau.mjs';
import { meteoAlertes, calculerAlertes, texteAlertes } from './alertes.mjs';

const { fmtDate, fmtDateLongue, aujourdhui, ajouterJours, isoDate, lireIso, normaliser, uid } = U;
const PP = PLANTES_PAR_ID;
const SEMIS = new Set(['si', 'sd', 'sa']);

const NIVEAUX = { etude: 'démontré par des essais', pratique: 'raison pratique : maladies ou ravageurs communs', tradition: 'tradition, non démontré' };
const GEL = { tendre: 'ne supporte pas le gel', demi: 'supporte de petites gelées', rustique: 'rustique' };
const ACHAT = { graine: 'graines', plant: 'plants', bulbe: 'bulbes', tubercule: 'tubercules' };
export const TYPES_JOURNAL = { semis: 'Semis', plantation: 'Plantation', arrosage: 'Arrosage', recolte: 'Récolte', observation: 'Observation', probleme: 'Problème', traitement: 'Traitement', tache: 'Tâche faite' };
const UNITES = ['kg', 'g', 'pièces', 'bottes'];
const NOMS_OBJETS = { bac: 'Bac', pot: 'Pot', allee: 'Allée', serre: 'Serre', tunnel: 'Tunnel', chassis: 'Châssis', treillis: 'Treillis', compost: 'Compost', eau: "Récupérateur d'eau", batiment: 'Bâtiment', mur: 'Mur', cloture: 'Clôture', haie: 'Haie', arbre: 'Arbre' };
const CONTENANTS = new Set(['bac', 'pot', 'serre', 'tunnel', 'chassis']);

const m = (v) => `${+v.toFixed(2)}`.replace('.', ',');
const liste = (l, vide) => (l.length ? l.map((x) => `- ${x}`).join('\n') : vide);

// ---------- Plantes ----------
function trouverPlante(nom) {
  if (!nom) return null;
  if (PP[nom]) return PP[nom];
  const n = normaliser(nom);
  const exacte = PLANTES.find((p) => normaliser(p.n) === n || normaliser(p.n.replace(/\s*\(.*\)/, '')) === n || (p.al || []).some((a) => normaliser(a) === n));
  if (exacte) return exacte;
  const r = App.reconnaitre(nom);
  return r && r.pid ? PP[r.pid] : null;
}
function plantesProches(texte) {
  const n = normaliser(texte);
  return PLANTES.filter((p) => [p.n, ...(p.al || [])].some((x) => { const k = normaliser(x); return k.includes(n) || (k.length > 3 && n.includes(k)); }));
}
function exigePlante(nom) {
  const p = trouverPlante(nom);
  if (p) return p;
  const proches = plantesProches(nom).slice(0, 8).map((x) => x.n);
  throw new Error(`Plante « ${nom} » inconnue de l'app.` + (proches.length ? ` Plantes proches : ${proches.join(', ')}.` : ' Utiliser chercher_plante.'));
}

// ---------- Contexte (repris de l'onglet Maintenant de l'app) ----------
function meteoProche() {
  if (!App.prev) return null;
  const ajd = isoDate(aujourdhui());
  const jours = App.prev.jours.filter((j) => j.date >= ajd);
  const sols = jours.slice(0, 3).map((j) => j.sol).filter((v) => v != null);
  return {
    jours,
    sol: sols.length ? +(sols.reduce((a, b) => a + b, 0) / sols.length).toFixed(1) : null,
    gels: jours.slice(0, 7).filter((j) => j.tmin <= 0.5),
    chaleur: jours.slice(0, 7).filter((j) => j.tmax >= 30),
  };
}
function conseilsMeteo(p, type, mp) {
  if (!mp) return null;
  if (type === 'sd' && mp.sol != null && mp.sol < p.sol) return `sol encore à ${mp.sol} °C (il faut ${p.sol} °C) : attendre quelques jours`;
  if (type === 'sd' && mp.sol != null && mp.sol >= p.sol) return `sol à ${mp.sol} °C : c'est bon`;
  if (type === 'pl' && p.gel === 'tendre' && mp.gels.length) return `gel annoncé le ${fmtDate(lireIso(mp.gels[0].date))} : attendre ou protéger`;
  return null;
}
function tachesPlan(debut, fin) {
  const res = [];
  const vus = new Set();
  for (const annee of [debut.getFullYear(), debut.getFullYear() + 1]) {
    const plan = App.etat.plans[annee];
    if (!plan) continue;
    for (const o of plan.objets) {
      const p = o.t === 'plante' && PP[o.pid];
      if (!p) continue;
      const decal = App.decalage(o, plan.objets);
      for (const s of Calendrier.fenetres(p, App.ctx, annee, decal)) {
        if (s.fin < debut || s.debut > fin) continue;
        const cle = `${p.id}|${s.type}|${decal}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        res.push({ p, s, decal, nb: App.nbPlants(o) });
      }
    }
  }
  const ordre = { si: 0, sd: 1, sa: 1, pl: 2, rec: 3 };
  return res.sort((a, b) => ordre[a.s.type] - ordre[b.s.type] || a.s.debut - b.s.debut);
}
function statutSemis(p) {
  const ajd = aujourdhui();
  const segs = Calendrier.actions(p, App.ctx, ajd, ajouterJours(ajd, 365))
    .filter((s) => SEMIS.has(s.type) || (s.type === 'pl' && (p.achat || 'graine') !== 'graine'))
    .sort((a, b) => a.debut - b.debut);
  return { maintenant: segs.filter((s) => s.debut <= ajouterJours(ajd, 14) && s.fin >= ajd), prochain: segs.find((s) => s.debut > ajouterJours(ajd, 14)) };
}
const texteStatut = (p, st) => (st.maintenant.length
  ? st.maintenant.map((s) => `${Calendrier.libelle(s.type, p).toLowerCase()} maintenant (jusqu'au ${fmtDate(s.fin)})`).join(', ')
  : st.prochain ? `${Calendrier.libelle(st.prochain.type, p).toLowerCase()} à partir du ${fmtDate(st.prochain.debut)}` : 'pas de fenêtre de semis chez toi');

function datesGel() {
  const an = new Date().getFullYear();
  return { dg: U.dateDuJour(an, App.ctx.dg), pg: U.dateDuJour(an, App.ctx.pg) };
}

// ---------- Plan ----------
function plansUtiles() {
  const annees = [...new Set([new Date().getFullYear(), saisonCourante()])].filter((a) => App.etat.plans[a] && App.etat.plans[a].objets.length);
  return annees.map((a) => [a, App.etat.plans[a].objets]);
}
function nomObjet(o) { return o.nom ? `« ${o.nom} »` : (NOMS_OBJETS[o.t] || o.t).toLowerCase(); }
function decrireCulture(o, objets) {
  const p = PP[o.pid];
  if (!p) return null;
  const graine = o.graineId && App.etat.graines.find((g) => g.id === o.graineId);
  const contenant = objets.find((c) => c !== o && CONTENANTS.has(c.t) && G.dedans(G.centre(o), c));
  const abri = App.abriDe(o, objets);
  const [cx, cy] = G.centre(o);
  return `${p.n}${graine && graine.variete ? ` (${graine.variete})` : ''} : ${App.nbPlants(o)} plant(s) sur ${m(o.w)} × ${m(o.h)} m` +
    (contenant ? `, dans ${nomObjet(contenant)}` : '') + (abri && abri !== contenant ? `, sous ${nomObjet(abri)}` : '') +
    ` (centre à ${m(cx)} m du bord ouest, ${m(cy)} m du bord nord)` + (o.debut ? `, en place depuis le ${fmtDateLongue(lireIso(o.debut))}` : '') + ` [id ${o.id}]`;
}
function decrireStructure(o) {
  const [cx, cy] = G.centre(o);
  const h = o.hauteur != null ? `, hauteur ${m(o.hauteur)} m` : '';
  return `${NOMS_OBJETS[o.t] || o.t}${o.nom ? ` « ${o.nom} »` : ''} : ${m(o.w)} × ${m(o.h)} m${h} (centre à ${m(cx)} m de l'ouest, ${m(cy)} m du nord)`;
}

// ---------- Outils ----------
export const OUTILS = [];
const outil = (name, description, proprietes, requis, fn) =>
  OUTILS.push({ name, description, inputSchema: { type: 'object', properties: proprietes, required: requis }, fn });

outil('resume_potager',
  "Vue d'ensemble du potager : lieu, dates de gelée calculées pour ce lieu, terrain, abris, cultures en place cette saison (avec leur emplacement), graines et journal. À appeler en début de conversation ou quand on a besoin de contexte.",
  {}, [], async (pg) => {
    await pg.lire(); await pg.meteo();
    const e = App.etat;
    const { dg, pg: pgel } = datesGel();
    const lignes = [`Potager « ${pg.jardin.nom} » — aujourd'hui ${fmtDateLongue(aujourdhui())}.`];
    lignes.push(e.lieu ? `Lieu : ${e.lieu.nom}${e.lieu.detail ? ` (${e.lieu.detail})` : ''}, ${e.lieu.lat.toFixed(3)}, ${e.lieu.lon.toFixed(3)}.` : "Lieu non défini dans l'app : calendrier basé sur un climat type du centre-nord de la France.");
    lignes.push(`Dates de gelée chez toi (prudence ${Math.round(e.risque * 100)} %${App.climat.defaut ? ', climat type' : `, sur ${App.climat.dgAnnees.length} ans de météo`}) : dernière gelée de printemps vers le ${fmtDate(dg)}, première gelée d'automne vers le ${fmtDate(pgel)}`);
    lignes.push(`Terrain : ${m(e.jardin.largeur)} × ${m(e.jardin.hauteur)} m (x vers l'est, y vers le sud).`);
    const plans = plansUtiles();
    if (!plans.length) lignes.push('Plan : aucune culture dessinée pour cette saison.');
    for (const [annee, objets] of plans) {
      const cultures = objets.filter((o) => o.t === 'plante').map((o) => decrireCulture(o, objets)).filter(Boolean);
      const structures = objets.filter((o) => o.t !== 'plante').map(decrireStructure);
      lignes.push(`\nPlan ${annee} — structures et obstacles :\n${liste(structures, '(aucune)')}`);
      lignes.push(`Plan ${annee} — cultures :\n${liste(cultures, '(aucune)')}`);
    }
    const vieilles = e.graines.filter((g) => (App.etatGraine(g) || {}).niveau === 'vieille').length;
    lignes.push(`\nGraines en stock : ${e.graines.length}${vieilles ? ` (dont ${vieilles} trop vieilles)` : ''}. Détail avec lister_graines.`);
    const an = String(new Date().getFullYear());
    const journal = e.journal.filter((j) => j.date.startsWith(an)).sort((a, b) => b.date.localeCompare(a.date));
    lignes.push(`Journal ${an} : ${journal.length} entrée(s)${journal[0] ? `, la dernière le ${fmtDate(lireIso(journal[0].date))} (${TYPES_JOURNAL[journal[0].type] || journal[0].type}${journal[0].note ? ' : ' + journal[0].note : ''})` : ''}.`);
    return lignes.join('\n');
  });

outil('que_faire',
  "Ce qu'il y a à faire au potager dans les prochains jours : semis, plantations et récoltes des cultures du plan, graines du stock à semer maintenant, avec les conseils liés à la météo (gel, température du sol). Calculé comme l'onglet « Maintenant » de l'app.",
  { jours: { type: 'integer', minimum: 1, maximum: 60, description: 'Nombre de jours à couvrir (14 par défaut).' } }, [],
  async (pg, { jours = 14 }) => {
    await pg.lire(); await pg.meteo();
    const ajd = aujourdhui(), fin = ajouterJours(ajd, jours);
    const mp = meteoProche();
    const taches = tachesPlan(ajd, fin).map(({ p, s, decal, nb }) => {
      const quand = s.debut <= ajd ? `jusqu'au ${fmtDate(s.fin)}` : `à partir du ${fmtDate(s.debut)}`;
      const conseil = conseilsMeteo(p, s.type, mp);
      return `${Calendrier.libelle(s.type, p)} – ${p.n}${decal ? ' (sous abri)' : ''} : ${quand}${nb ? `, ${nb} plant(s) prévus` : ''}${conseil ? ` — ${conseil}` : ''}`;
    });
    const dansPlan = new Set(tachesPlan(ajd, fin).map((t) => t.p.id));
    const stock = [...new Map(App.etat.graines.filter((g) => PP[g.pid] && !dansPlan.has(g.pid)).map((g) => [g.pid, g])).values()]
      .map((g) => ({ g, p: PP[g.pid], st: statutSemis(PP[g.pid]) }))
      .filter((x) => x.st.maintenant.length)
      .map(({ g, p, st }) => `${p.n}${g.variete ? ` (${g.variete})` : ''} : ${texteStatut(p, st)}${conseilsMeteo(p, st.maintenant[0].type, mp) ? ` — ${conseilsMeteo(p, st.maintenant[0].type, mp)}` : ''}`);
    const lignes = [`Du ${fmtDate(ajd)} au ${fmtDate(fin)} :`, `\nCultures du plan :\n${liste(taches, '(rien de prévu dans le plan sur cette période)')}`,
      `\nGraines du stock (hors plan) à semer maintenant :\n${liste(stock, '(aucune)')}`];
    if (mp) {
      if (mp.gels.length) lignes.push(`\n⚠️ Gel annoncé : ${mp.gels.map((j) => `${fmtDate(lireIso(j.date))} (${j.tmin} °C)`).join(', ')}.`);
      if (mp.chaleur.length) lignes.push(`\n🌡️ Fortes chaleurs : ${mp.chaleur.map((j) => `${fmtDate(lireIso(j.date))} (${j.tmax} °C)`).join(', ')}.`);
      if (mp.sol != null) lignes.push(`Température du sol (moyenne des 3 prochains jours) : ${mp.sol} °C.`);
    } else lignes.push('\n(Prévisions météo indisponibles.)');
    return lignes.join('\n');
  });

outil('meteo',
  'Prévisions météo du lieu du potager (jusqu\'à 16 jours) : températures mini/maxi, pluie, température du sol, avec les jours de gel et de forte chaleur signalés.',
  { jours: { type: 'integer', minimum: 1, maximum: 16, description: 'Nombre de jours (7 par défaut).' } }, [],
  async (pg, { jours = 7 }) => {
    await pg.lire(); await pg.meteo();
    if (!App.etat.lieu) return "Pas de lieu défini dans l'app : impossible de donner la météo locale.";
    const mp = meteoProche();
    if (!mp) return 'Prévisions indisponibles pour le moment.';
    return `Météo à ${App.etat.lieu.nom} :\n` + mp.jours.slice(0, jours).map((j) => {
      const [, libelle] = Climat.meteo(j.code);
      const marques = [j.tmin <= 0.5 ? 'GEL' : null, j.tmax >= 30 ? 'CHALEUR' : null].filter(Boolean);
      return `- ${fmtDate(lireIso(j.date))} : ${libelle}, ${j.tmin} à ${j.tmax} °C, pluie ${j.pluie} mm${j.sol != null ? `, sol ${j.sol} °C` : ''}${marques.length ? ` [${marques.join(', ')}]` : ''}`;
    }).join('\n');
  });

outil('chercher_plante',
  "Cherche une plante dans la base de l'app (environ 100 plantes) à partir d'un nom ou d'un synonyme. Utile pour savoir si une plante est connue et sous quel nom.",
  { texte: { type: 'string', description: 'Nom ou partie de nom (ex. « courgette », « cornichon »).' } }, ['texte'],
  async (pg, { texte }) => {
    const p = trouverPlante(texte);
    const proches = plantesProches(texte).filter((x) => x !== p).slice(0, 10);
    if (!p && !proches.length) return `Aucune plante ne correspond à « ${texte} » dans l'app.`;
    return [p ? `Meilleure correspondance : ${p.n} (${CATEGORIES[p.cat] || p.cat}, famille ${(FAMILLES[p.fam] || {}).n || p.fam}) [id ${p.id}]` : null,
      proches.length ? `Autres : ${proches.map((x) => `${x.n} [id ${x.id}]`).join(', ')}` : null].filter(Boolean).join('\n');
  });

outil('fiche_plante',
  "Fiche d'une plante calculée pour ce potager : dates de semis, plantation et récolte chez toi cette saison (en pleine terre et sous abri), exigences (sol, gel, exposition, espacement), conseils, associations favorables ou défavorables avec leur niveau de preuve, graines en stock et emplacement sur le plan.",
  { plante: { type: 'string', description: 'Nom de la plante (ex. « tomate », « haricot à rames »).' } }, ['plante'],
  async (pg, { plante }) => {
    await pg.lire(); await pg.meteo();
    const p = exigePlante(plante);
    const annee = saisonCourante();
    const fen = (decal) => Calendrier.segmentsAnnee(p, App.ctx, annee, decal).map((s) => `${Calendrier.libelle(s.type, p)} du ${fmtDate(s.debut)} au ${fmtDate(s.fin)}`).join(' ; ') || 'aucune fenêtre';
    const assoc = App.associationsDe(p.id).map((a) => `${a.sens === '+' ? 'favorable' : 'à éviter'} avec ${(PP[a.autre] || {}).n || a.autre} (${NIVEAUX[a.niveau] || a.niveau}) : ${a.note}`);
    const graines = App.grainesDe(p.id).map((g) => `${g.variete || 'sans variété'}${g.annee ? ` ${g.annee}` : ''}${g.quantite ? `, ${g.quantite}` : ''}`);
    const emplacements = plansUtiles().flatMap(([a, objets]) => objets.filter((o) => o.pid === p.id).map((o) => `${a} : ${decrireCulture(o, objets)}`));
    const fam = FAMILLES[p.fam] || {};
    return [
      `${p.ic || ''} ${p.n} (${p.l}) — ${CATEGORIES[p.cat] || p.cat}, famille ${fam.n || p.fam}${p.per ? ', vivace' : ''}.`,
      `Gel : ${GEL[p.gel] || p.gel}.${p.sol ? ` Semis en place quand le sol atteint ${p.sol} °C.` : ''} Exposition : ${p.exp || 'soleil'}.` +
        (p.esp ? ` Espacement : ${p.esp[0]} cm entre plants, ${p.esp[1]} cm entre rangs.` : '') + (p.h ? ` Hauteur : ${p.h} cm.` : ''),
      p.dtm ? `Récolte ${p.dtm[0]} à ${p.dtm[1]} jours après ${p.dp ? 'la plantation' : 'le semis'}, pendant ${p.rec || 2} semaines environ.${p.succ ? ` Semis échelonnés toutes les ${p.succ} semaines.` : ''}` : null,
      p.germ ? `Les graines germent bien pendant ${p.germ} ans.` : null,
      p.achat && p.achat !== 'graine' ? `S'achète en ${ACHAT[p.achat] || p.achat}.` : null,
      p.c ? `Conseil : ${p.c}` : null,
      `\nCalendrier ${annee} chez toi :\n- en pleine terre : ${fen(0)}\n- sous tunnel : ${fen(Calendrier.ABRIS.tunnel)}\n- sous serre : ${fen(Calendrier.ABRIS.serre)}`,
      `\nAssociations :\n${liste(assoc, "(aucune association répertoriée dans l'app)")}`,
      `\nRotation : éviter de la remettre là où une plante de la famille ${fam.n || p.fam} a poussé ces 3 dernières années.`,
      `\nEn stock : ${graines.length ? graines.join(' ; ') : 'aucune graine'}.`,
      `Sur le plan : ${emplacements.length ? '\n' + liste(emplacements) : 'pas encore placée.'}`,
      "\n(Valeurs indicatives compilées à partir de références courantes : en cas de doute, suivre le sachet.)",
    ].filter(Boolean).join('\n');
  });

outil('associations',
  "Dit si deux plantes peuvent être cultivées côte à côte (associations de l'app, avec leur niveau de preuve : démontré, raison pratique ou simple tradition). Avec une seule plante : liste toutes ses associations connues.",
  { plante_a: { type: 'string' }, plante_b: { type: 'string', description: 'Facultatif.' } }, ['plante_a'],
  async (pg, { plante_a, plante_b }) => {
    const a = exigePlante(plante_a);
    if (!plante_b) {
      const l = App.associationsDe(a.id).map((x) => `${x.sens === '+' ? '✅' : '❌'} ${(PP[x.autre] || {}).n || x.autre} — ${NIVEAUX[x.niveau] || x.niveau} : ${x.note}`);
      return `Associations de ${a.n} :\n${liste(l, "(aucune répertoriée dans l'app)")}`;
    }
    const b = exigePlante(plante_b);
    const l = App.associations(a.id, b.id);
    const memeFamille = a.fam === b.fam ? `\nMême famille (${(FAMILLES[a.fam] || {}).n || a.fam}) : mêmes maladies et ravageurs, à ne pas se succéder au même endroit.` : '';
    if (!l.length) return `Pas d'association répertoriée entre ${a.n} et ${b.n} dans l'app : a priori neutre.${memeFamille}`;
    return l.map(([, , sens, niveau, note]) => `${sens === '+' ? '✅ Bonne association' : '❌ À éviter'} : ${a.n} et ${b.n} — ${NIVEAUX[niveau] || niveau}. ${note}`).join('\n') + memeFamille;
  });

outil('verifier_plan',
  "Vérifie le plan de la saison : voisinages favorables ou défavorables entre cultures proches (moins de 30 cm), et problèmes de rotation (même famille au même endroit ces 3 dernières années).",
  { annee: { type: 'integer', description: 'Saison (par défaut la saison en cours).' } }, [],
  async (pg, { annee = saisonCourante() }) => {
    await pg.lire();
    const plan = App.etat.plans[annee];
    if (!plan || !plan.objets.some((o) => o.t === 'plante')) return `Aucune culture sur le plan ${annee}.`;
    const voisinages = new Map(), rotations = [];
    for (const o of plan.objets.filter((x) => x.t === 'plante' && PP[x.pid])) {
      for (const v of App.voisins(o, plan.objets)) {
        const cle = [o.id, v.obj.id].sort().join('|');
        if (!voisinages.has(cle)) voisinages.set(cle, `${v.sens === '+' ? '✅' : '❌'} ${PP[o.pid].n} à côté de ${PP[v.obj.pid].n} — ${NIVEAUX[v.niveau] || v.niveau} : ${v.note}`);
      }
      for (const r of App.rotation(o, annee)) rotations.push(`⚠️ ${PP[o.pid].n} à l'endroit où il y avait ${r.plante.n} en ${r.annee} (même famille ${(FAMILLES[r.plante.fam] || {}).n || r.plante.fam})`);
    }
    return `Plan ${annee} :\nVoisinages :\n${liste([...voisinages.values()], '(aucun voisinage répertorié)')}\nRotation :\n${liste([...new Set(rotations)], '(rien à signaler)')}`;
  });

outil('lister_graines',
  'Liste les graines en stock avec leur id, variété, année, quantité, notes du sachet, état de germination et quand les semer chez toi.',
  { filtre: { type: 'string', description: 'Facultatif : ne garder que les graines dont le nom contient ce texte.' } }, [],
  async (pg, { filtre }) => {
    await pg.lire(); await pg.meteo();
    const f = filtre && normaliser(filtre);
    const l = App.etat.graines
      .filter((g) => !f || normaliser(`${(PP[g.pid] || {}).n || ''} ${g.variete || ''} ${g.texte || ''}`).includes(f))
      .map((g) => {
        const p = PP[g.pid];
        const eg = App.etatGraine(g);
        return `${p ? p.n : `❓ non reconnue (« ${g.texte || ''} »)`}${g.variete ? ` – ${g.variete}` : ''}${g.annee ? ` – ${g.annee}` : ''}${g.quantite ? ` – ${g.quantite}` : ''}` +
          (g.notes ? ` – notes : ${g.notes}` : '') + (eg ? ` – ${eg.texte}` : '') + (p ? ` – ${texteStatut(p, statutSemis(p))}` : '') + ` [id ${g.id}]`;
      });
    return `${l.length} graine(s)${f ? ` correspondant à « ${filtre} »` : ''} :\n${liste(l, '(aucune)')}`;
  });

outil('ajouter_graines',
  "Ajoute des graines au stock (par exemple après avoir lu des photos de sachets). Pour chaque sachet, donner la plante et si possible la variété, l'année (date limite ou année de récolte du sachet), la quantité et les indications utiles du sachet. Si un sachet identique existe déjà (même plante, variété et année), il est mis à jour au lieu d'être doublé. Les plantes inconnues de l'app ne sont pas ajoutées : elles sont signalées pour en parler avec l'utilisateur.",
  { graines: { type: 'array', minItems: 1, items: { type: 'object', properties: {
    plante: { type: 'string', description: 'Nom de la plante (ex. « Tomate », « Haricot nain »).' },
    variete: { type: 'string' },
    annee: { type: 'integer', description: 'Année du sachet (récolte ou date limite).' },
    quantite: { type: 'string', description: 'Ex. « 1 sachet », « 50 graines », « 2 g ».' },
    notes: { type: 'string', description: 'Indications du sachet utiles plus tard : période de semis, profondeur, particularités.' },
  }, required: ['plante'] } } }, ['graines'],
  async (pg, { graines }) => {
    const res = await pg.modifier((etat) => {
      const ajoutees = [], majs = [], inconnues = [];
      for (const s of graines) {
        const p = trouverPlante(s.plante) || trouverPlante(`${s.plante} ${s.variete || ''}`);
        if (!p) { inconnues.push(s.plante); continue; }
        const variete = (s.variete || '').trim();
        const existante = etat.graines.find((g) => g.pid === p.id && normaliser(g.variete || '') === normaliser(variete) && (g.annee || null) === (s.annee || null));
        if (existante) {
          if (s.quantite) existante.quantite = s.quantite;
          if (s.notes) existante.notes = s.notes;
          majs.push(`${p.n}${variete ? ` ${variete}` : ''}`);
        } else {
          const g = { id: uid(), pid: p.id, variete, annee: s.annee || null, quantite: s.quantite || '' };
          if (s.notes) g.notes = s.notes;
          etat.graines.push(g);
          ajoutees.push(`${p.n}${variete ? ` ${variete}` : ''}${s.annee ? ` ${s.annee}` : ''} [id ${g.id}]`);
        }
      }
      return { ajoutees, majs, inconnues };
    });
    return [`Ajoutées (${res.ajoutees.length}) :\n${liste(res.ajoutees, '(aucune)')}`,
      res.majs.length ? `Déjà en stock, mises à jour : ${res.majs.join(', ')}` : null,
      res.inconnues.length ? `Non ajoutées, plantes inconnues de l'app : ${res.inconnues.join(', ')} (vérifier avec chercher_plante ou demander à l'utilisateur).` : null].filter(Boolean).join('\n');
  });

outil('modifier_graine',
  "Corrige une graine du stock (id donné par lister_graines) : plante, variété, année, quantité ou notes. Ne donner que les champs à changer.",
  { id: { type: 'string' }, plante: { type: 'string' }, variete: { type: 'string' }, annee: { type: ['integer', 'null'] }, quantite: { type: 'string' }, notes: { type: 'string' } }, ['id'],
  async (pg, { id, plante, ...champs }) => {
    const p = plante ? exigePlante(plante) : null;
    return pg.modifier((etat) => {
      const g = etat.graines.find((x) => x.id === id);
      if (!g) throw new Error(`Aucune graine avec l'id ${id}.`);
      if (p) g.pid = p.id;
      for (const k of ['variete', 'annee', 'quantite', 'notes']) if (champs[k] !== undefined) g[k] = champs[k];
      return `Graine mise à jour : ${(PP[g.pid] || {}).n || g.texte}${g.variete ? ` ${g.variete}` : ''}${g.annee ? ` ${g.annee}` : ''}.`;
    });
  });

outil('retirer_graine',
  "Retire une graine du stock (sachet fini ou jeté). Id donné par lister_graines.",
  { id: { type: 'string' } }, ['id'],
  async (pg, { id }) => pg.modifier((etat) => {
    const i = etat.graines.findIndex((x) => x.id === id);
    if (i < 0) throw new Error(`Aucune graine avec l'id ${id}.`);
    const [g] = etat.graines.splice(i, 1);
    return `Retirée du stock : ${(PP[g.pid] || {}).n || g.texte}${g.variete ? ` ${g.variete}` : ''}.`;
  }));

outil('noter_journal',
  `Ajoute une entrée au journal du jardin : ce qui a été fait ou observé. Types : ${Object.keys(TYPES_JOURNAL).join(', ')}. Pour une récolte, donner la quantité et l'unité (${UNITES.join(', ')}). Indiquer qui parle (prénom) dans « par ». Des photos reçues peuvent être jointes (chemins de fichiers locaux).`,
  {
    type: { type: 'string', enum: Object.keys(TYPES_JOURNAL) },
    note: { type: 'string', description: 'Ce qui a été fait ou observé, en une ou deux phrases.' },
    plante: { type: 'string', description: 'Facultatif : plante concernée.' },
    date: { type: 'string', description: 'AAAA-MM-JJ, aujourd\'hui par défaut.' },
    quantite: { type: 'number' }, unite: { type: 'string', enum: UNITES },
    par: { type: 'string', description: 'Prénom de la personne.' },
    photos: { type: 'array', items: { type: 'string' }, description: 'Chemins de photos à joindre (jpg, png, webp).' },
  }, ['type'],
  async (pg, { type, note = '', plante, date, quantite, unite, par, photos = [] }) => {
    const p = plante ? exigePlante(plante) : null;
    const jour = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : isoDate(aujourdhui());
    await pg.lire();
    const cles = [];
    for (const chemin of photos) cles.push(await pg.envoyerPhoto(chemin));
    return pg.modifier((etat) => {
      const e = { id: uid(), date: jour, type, pid: p ? p.id : null, note: note.trim(), photos: cles };
      if (type === 'recolte' && quantite) { e.qte = quantite; e.unite = unite || 'kg'; }
      if (par) e.par = par;
      etat.journal.push(e);
      return `Noté au journal le ${fmtDateLongue(lireIso(jour))} : ${TYPES_JOURNAL[type]}${p ? ` – ${p.n}` : ''}${e.qte ? ` – ${e.qte} ${e.unite}` : ''}${e.note ? ` – ${e.note}` : ''}${cles.length ? ` (${cles.length} photo(s))` : ''}. [id ${e.id}]`;
    });
  });

outil('lire_journal',
  "Lit le journal du jardin, des plus récentes aux plus anciennes entrées, avec filtres facultatifs.",
  { annee: { type: 'integer' }, type: { type: 'string', enum: Object.keys(TYPES_JOURNAL) }, plante: { type: 'string' }, limite: { type: 'integer', minimum: 1, maximum: 200, description: '30 par défaut.' } }, [],
  async (pg, { annee, type, plante, limite = 30 }) => {
    await pg.lire();
    const p = plante ? exigePlante(plante) : null;
    const l = App.etat.journal
      .filter((e) => (!annee || e.date.startsWith(String(annee))) && (!type || e.type === type) && (!p || e.pid === p.id))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, limite)
      .map((e) => `${fmtDate(lireIso(e.date))} ${e.date.slice(0, 4)} – ${TYPES_JOURNAL[e.type] || e.type}${e.pid && PP[e.pid] ? ` – ${PP[e.pid].n}` : ''}${e.qte ? ` – ${e.qte} ${e.unite}` : ''}${e.note ? ` – ${e.note}` : ''}${e.par ? ` (par ${e.par})` : ''}${(e.photos || []).length ? ` – ${e.photos.length} photo(s)` : ''} [id ${e.id}]`);
    return liste(l, 'Aucune entrée.');
  });

outil('bilan',
  "Bilan d'une année : récoltes par plante (total en kg, pièces, bottes), problèmes notés, nombre d'entrées par type.",
  { annee: { type: 'integer', description: 'Année (en cours par défaut).' } }, [],
  async (pg, { annee = new Date().getFullYear() }) => {
    await pg.lire();
    const ent = App.etat.journal.filter((e) => e.date.startsWith(String(annee)));
    const rec = {};
    for (const e of ent) if (e.type === 'recolte' && e.pid && e.qte) {
      const r = (rec[e.pid] ||= { kg: 0, pieces: 0, bottes: 0 });
      if (e.unite === 'kg') r.kg += e.qte; else if (e.unite === 'g') r.kg += e.qte / 1000; else if (e.unite === 'pièces') r.pieces += e.qte; else r.bottes += e.qte;
    }
    const recoltes = Object.entries(rec).sort((a, b) => b[1].kg - a[1].kg).map(([id, r]) =>
      `${(PP[id] || {}).n || id} : ${[r.kg ? `${+r.kg.toFixed(2)} kg` : null, r.pieces ? `${r.pieces} pièces` : null, r.bottes ? `${r.bottes} bottes` : null].filter(Boolean).join(' + ')}`);
    const total = Object.values(rec).reduce((s, r) => s + r.kg, 0);
    const parType = Object.entries(TYPES_JOURNAL).map(([k, n]) => [n, ent.filter((e) => e.type === k).length]).filter(([, c]) => c).map(([n, c]) => `${n} : ${c}`);
    const problemes = ent.filter((e) => e.type === 'probleme').map((e) => `${fmtDate(lireIso(e.date))} – ${e.pid && PP[e.pid] ? PP[e.pid].n + ' : ' : ''}${e.note || ''}`);
    return [`Bilan ${annee} — ${ent.length} entrée(s) au journal${parType.length ? ` (${parType.join(', ')})` : ''}.`,
      `Récoltes (${+total.toFixed(2)} kg au total) :\n${liste(recoltes, '(aucune récolte notée)')}`,
      `Problèmes notés :\n${liste(problemes, '(aucun)')}`].join('\n');
  });

// Alertes du moment (aussi utilisées par la surveillance planifiée, voir potager-mcp.mjs « surveiller »).
export async function alertesDuMoment(pg) {
  await pg.lire(); await pg.meteo();
  if (!App.etat.lieu) return [];
  return calculerAlertes(await meteoAlertes(App.etat.lieu));
}

outil('alertes',
  "Alertes des 3 prochains jours : gel, forte chaleur, manque d'eau (pluie moins évaporation sur 7 jours), orage ou grêle. Seulement pour les cultures du plan réellement en terre, en tenant compte des abris. Chaque alerte a un identifiant [type:date].",
  {}, [], async (pg) => {
    const l = await alertesDuMoment(pg);
    return App.etat.lieu ? texteAlertes(l) : "Pas de lieu défini dans l'app : pas d'alertes météo possibles.";
  });

outil('point_de_la_semaine',
  "Tout ce qu'il faut pour le point du lundi : à faire dans les 7 jours, météo de la semaine, alertes, graines à acheter pour le plan de la saison, et ce qui a été noté au journal la semaine passée.",
  {}, [], async (pg) => {
    const afaire = await OUTILS.find((o) => o.name === 'que_faire').fn(pg, { jours: 7 });
    const mp = meteoProche();
    const semaine = mp ? mp.jours.slice(0, 7) : [];
    const meteoTxt = semaine.length
      ? `Météo des 7 jours : de ${Math.min(...semaine.map((j) => j.tmin))} à ${Math.max(...semaine.map((j) => j.tmax))} °C, ${+semaine.reduce((s, j) => s + j.pluie, 0).toFixed(1)} mm de pluie au total` +
        `${mp.gels.length ? `, gel les ${mp.gels.map((j) => fmtDate(lireIso(j.date))).join(', ')}` : ''}${mp.chaleur.length ? `, plus de 30 °C les ${mp.chaleur.map((j) => fmtDate(lireIso(j.date))).join(', ')}` : ''}.`
      : 'Météo de la semaine indisponible.';
    const alertes = App.etat.lieu ? texteAlertes(calculerAlertes(await meteoAlertes(App.etat.lieu))) : '(pas de lieu)';
    // Graines à prévoir : plantes du plan de la saison sans graines (ou plants) en stock, ou avec des graines trop vieilles.
    const plan = App.etat.plans[saisonCourante()];
    const besoins = [...new Set((plan ? plan.objets : []).filter((o) => o.t === 'plante' && PP[o.pid]).map((o) => o.pid))].map((id) => {
      const p = PP[id], stock = App.grainesDe(id);
      if (!stock.length) return `${p.n} : à acheter (${ACHAT[p.achat || 'graine']})`;
      if (stock.every((g) => (App.etatGraine(g) || {}).niveau === 'vieille')) return `${p.n} : graines anciennes, faire un test de germination ou racheter`;
      return null;
    }).filter(Boolean);
    const depuis = isoDate(ajouterJours(aujourdhui(), -7));
    const passe = App.etat.journal.filter((e) => e.date >= depuis).sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => `${fmtDate(lireIso(e.date))} – ${TYPES_JOURNAL[e.type] || e.type}${e.pid && PP[e.pid] ? ` – ${PP[e.pid].n}` : ''}${e.qte ? ` – ${e.qte} ${e.unite}` : ''}${e.note ? ` – ${e.note}` : ''}${e.par ? ` (par ${e.par})` : ''}`);
    return [afaire, `\n${meteoTxt}`, `\nAlertes :\n${alertes}`,
      `\nGraines et plants à prévoir pour le plan ${saisonCourante()} :\n${liste(besoins, plan ? '(tout est en stock)' : '(pas encore de plan pour cette saison)')}`,
      `\nAu journal ces 7 derniers jours :\n${liste(passe, '(rien de noté)')}`].join('\n');
  });
