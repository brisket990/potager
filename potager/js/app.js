/* État de l'application, logique commune et navigation. */
(function () {
  const { h, stock, normaliser } = U;

  const VERSION = 1;
  const auj = new Date();
  const ETAT_DEFAUT = () => ({
    version: VERSION,
    lieu: null,
    risque: 0.8,
    jardin: { largeur: 10, hauteur: 8 },
    // À partir d'octobre on prépare plutôt la saison suivante.
    annee: auj.getFullYear() + (auj.getMonth() >= 9 ? 1 : 0),
    plans: {},
    graines: [],
    journal: [],
  });

  const App = {
    etat: Object.assign(ETAT_DEFAUT(), stock.lire('potager', {})),
    climat: null,
    ctx: null,
    soleil: null,   // heures de soleil calculées (voir terrain.js)
    prev: null,
    erreurMeteo: null,
    vue: 'maintenant',
  };

  App.sauver = () => {
    if (!stock.ecrire('potager', App.etat)) App.toast("Impossible d'enregistrer (stockage plein ?)", true);
  };
  App.changer = (fn, rerendre = true) => { fn(App.etat); App.sauver(); if (rerendre) App.rendre(); };

  App.plan = (annee = App.etat.annee) => (App.etat.plans[annee] ||= { objets: [] });

  // ---------- Climat ----------
  App.majContexte = () => { App.ctx = Calendrier.contexte(App.climat, App.etat.risque); };
  App.chargerMeteo = async (forcer = false) => {
    if (!App.etat.lieu) { App.climat = Climat.climatParDefaut(); App.prev = null; App.majContexte(); return; }
    try {
      App.climat = await Climat.chargerClimat(App.etat.lieu, forcer);
      App.majContexte();
      App.prev = await Climat.chargerPrevisions(App.etat.lieu, forcer);
      App.erreurMeteo = null;
    } catch (e) {
      App.erreurMeteo = e.message + ' – vérifie ta connexion internet.';
    }
  };
  App.definirLieu = async (lieu) => {
    App.etat.lieu = lieu;
    App.sauver();
    App.toast('Chargement de 20 ans de météo pour ton lieu…');
    await App.chargerMeteo(true);
    App.rendre();
    if (!App.erreurMeteo) App.toast('Climat local calculé.');
  };

  // ---------- Plan : abris, voisins, rotation ----------
  const { centre, dedans, chevauche } = G;

  App.abriDe = (obj, objets) => {
    let meilleur = null;
    for (const o of objets) {
      if (Calendrier.ABRIS[o.t] && dedans(centre(obj), o) && (!meilleur || Calendrier.ABRIS[o.t] > Calendrier.ABRIS[meilleur.t])) meilleur = o;
    }
    return meilleur;
  };
  App.decalage = (obj, objets) => { const a = App.abriDe(obj, objets); return a ? Calendrier.ABRIS[a.t] : 0; };

  App.associations = (idA, idB) => ASSOCIATIONS.filter(([a, b]) => (a === idA && b === idB) || (a === idB && b === idA));
  App.associationsDe = (id) => ASSOCIATIONS.filter(([a, b]) => a === id || b === id)
    .map(([a, b, sens, niveau, note]) => ({ autre: a === id ? b : a, sens, niveau, note }));

  App.voisins = (obj, objets, marge = 0.3) => {
    const res = [];
    for (const o of objets) {
      if (o === obj || o.t !== 'plante' || o.pid === obj.pid || !chevauche(obj, o, marge)) continue;
      for (const [, , sens, niveau, note] of App.associations(obj.pid, o.pid)) res.push({ obj: o, sens, niveau, note });
    }
    return res;
  };

  // Même famille au même endroit dans les 3 années précédentes.
  App.rotation = (obj, annee = App.etat.annee) => {
    const p = PLANTES_PAR_ID[obj.pid];
    if (!p || p.per || p.cat === 'engrais') return [];
    const res = [];
    for (let a = annee - 3; a < annee; a++) {
      const plan = App.etat.plans[a];
      if (!plan) continue;
      for (const o of plan.objets) {
        if (o.t !== 'plante') continue;
        const q = PLANTES_PAR_ID[o.pid];
        if (q && !q.per && q.fam === p.fam && chevauche(obj, o)) res.push({ annee: a, plante: q, obj: o });
      }
    }
    return res;
  };

  // Nombre de plants dans une zone, selon l'espacement de la plante.
  App.nbPlants = (obj) => {
    const p = PLANTES_PAR_ID[obj.pid];
    if (!p) return 0;
    const [ecart, rang] = p.esp.map((x) => x / 100);
    if (obj.mode === 'rangs') {
      const rangs = Math.max(1, Math.floor(obj.h / rang + 0.0001));
      return rangs * Math.max(1, Math.floor(obj.w / ecart + 0.0001));
    }
    return Math.max(1, Math.floor(obj.w / ecart + 0.0001)) * Math.max(1, Math.floor(obj.h / ecart + 0.0001));
  };

  App.occupation = (obj, objets, annee = App.etat.annee) => {
    const p = PLANTES_PAR_ID[obj.pid];
    if (!p) return null;
    return Calendrier.occupation(p, App.ctx, annee, App.decalage(obj, objets), obj.debut ? U.lireIso(obj.debut) : null);
  };

  // ---------- Graines ----------
  App.grainesDe = (pid) => App.etat.graines.filter((g) => g.pid === pid);
  App.etatGraine = (g) => {
    const p = PLANTES_PAR_ID[g.pid];
    if (!p || !p.germ || !g.annee) return null;
    const age = new Date().getFullYear() - g.annee;
    if (age > p.germ) return { niveau: 'vieille', texte: `${age} ans : faire un test de germination (durée habituelle ${p.germ} ans)` };
    if (age === p.germ) return { niveau: 'limite', texte: `Dernière année de bonne germination (${p.germ} ans)` };
    return { niveau: 'ok', texte: `Bonne germination jusqu'en ${g.annee + p.germ}` };
  };

  // Reconnaît une plante dans une ligne de texte libre (« Tomate cœur de bœuf 2023 »).
  const INDEX_NOMS = [];
  for (const p of PLANTES) {
    const noms = new Set([p.n, p.n.replace(/\s*\(.*\)/, ''), ...(p.al || [])]);
    for (const n of noms) {
      const k = normaliser(n);
      if (k) INDEX_NOMS.push({ k, p, principal: n === p.n || n === p.n.replace(/\s*\(.*\)/, '') });
    }
  }
  INDEX_NOMS.sort((a, b) => b.k.length - a.k.length);
  // Version minuscule sans accents, avec pour chaque caractère sa position dans le texte d'origine.
  function aplatir(s) {
    let txt = '';
    const idx = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace('œ', 'oe').replace('æ', 'ae');
      for (const x of c) { txt += x; idx.push(i); }
    }
    return { txt, idx };
  }
  App.reconnaitre = (ligne) => {
    const brut = ligne.trim();
    if (!brut) return null;
    const anneeM = brut.match(/\b(19|20)\d{2}\b/);
    const sansAnnee = brut.replace(/\b(19|20)\d{2}\b/, ' ');
    const t = ` ${normaliser(sansAnnee)} `;
    const tSing = ` ${t.trim().split(' ').map((m) => m.replace(/(?<=..)[sx]$/, '')).join(' ')} `;
    let trouve = null;
    for (const e of INDEX_NOMS) {
      const kSing = e.k.split(' ').map((m) => m.replace(/(?<=..)[sx]$/, '')).join(' ');
      if (t.includes(` ${e.k} `) || tSing.includes(` ${kSing} `)) { trouve = e; break; }
    }
    let variete = sansAnnee;
    if (trouve) {
      // Retire le nom de la plante (ou un synonyme en début de ligne) pour ne garder que la variété.
      const p = trouve.p;
      // Le nom principal d'abord (« Basilic grand vert » → « grand vert »), puis les synonymes.
      const parLongueur = (a, b) => b.length - a.length;
      const noms = [
        ...[p.n, p.n.replace(/\s*\(.*\)/, '')].map(normaliser).sort(parLongueur),
        ...(p.al || []).map(normaliser).sort(parLongueur),
      ].filter(Boolean);
      const { txt, idx } = aplatir(sansAnnee);
      const motif = (k) => new RegExp(k.split(' ').map((m) => `${m}s?`).join('[^a-z0-9]+'));
      let m = null;
      for (const k of noms) { const r = txt.match(motif(k)); if (r && !txt.slice(0, r.index).trim()) { m = r; break; } }
      if (!m) m = txt.match(motif(normaliser(p.n.replace(/\s*\(.*\)/, ''))));
      if (m) variete = sansAnnee.slice(0, idx[m.index]) + sansAnnee.slice(idx[m.index + m[0].length - 1] + 1);
    }
    variete = variete.replace(/^[\s\-–:,;.]+|[\s\-–:,;.]+$/g, '').replace(/\s{2,}/g, ' ');
    return { pid: trouve ? trouve.p.id : null, variete, annee: anneeM ? +anneeM[0] : null, texte: brut };
  };

  // ---------- Interface commune ----------
  // action = { label, fn } pour un bouton dans le message (ex. « Annuler »).
  App.toast = (msg, erreur = false, action = null) => {
    const fermer = () => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); };
    const t = h('div', { class: 'toast' + (erreur ? ' erreur' : ''), role: 'status' }, msg,
      action ? h('button', { class: 'toast-action', onclick: () => { action.fn(); fermer(); } }, action.label) : null);
    document.body.append(t);
    setTimeout(() => t.classList.add('visible'), 10);
    setTimeout(fermer, action ? 9000 : 3500);
  };

  App.modal = (titre, contenu, large = false) => {
    const fermer = () => { fond.remove(); document.removeEventListener('keydown', echap); };
    const echap = (e) => { if (e.key === 'Escape') fermer(); };
    const fond = h('div', { class: 'modal-fond', onclick: (e) => { if (e.target === fond) fermer(); } },
      h('div', { class: 'modal' + (large ? ' large' : ''), role: 'dialog', 'aria-label': titre },
        h('div', { class: 'modal-tete' }, h('h2', {}, titre), h('button', { class: 'bouton-icone', onclick: fermer, 'aria-label': 'Fermer' }, '✕')),
        h('div', { class: 'modal-corps' }, contenu)));
    document.addEventListener('keydown', echap);
    document.body.append(fond);
    return fermer;
  };

  App.icone = (p, taille) => h('span', { class: 'ic', style: taille ? { fontSize: taille } : null, 'aria-hidden': 'true' }, p.ic || '🌱');

  const ONGLETS = [
    ['maintenant', '🗓️', 'Maintenant'],
    ['plan', '📐', 'Plan'],
    ['graines', '🌰', 'Mes graines'],
    ['calendrier', '📅', 'Calendrier'],
    ['plantes', '🌱', 'Plantes'],
    ['achats', '🛒', 'Achats'],
    ['journal', '📓', 'Journal'],
    ['reglages', '⚙️', 'Réglages'],
  ];

  App.aller = (vue) => { location.hash = vue; };

  App.rendre = () => {
    const racine = document.getElementById('app');
    const vue = Vues[App.vue] ? App.vue : 'maintenant';
    const nav = h('nav', { class: 'onglets', 'aria-label': 'Sections' },
      ONGLETS.map(([id, ic, nom]) => h('a', { href: '#' + id, class: id === vue ? 'actif' : '', 'aria-current': id === vue ? 'page' : null },
        h('span', { class: 'onglet-ic', 'aria-hidden': 'true' }, ic), h('span', { class: 'onglet-nom' }, nom))));
    const entete = h('header', { class: 'entete' },
      h('div', { class: 'marque' }, h('span', { 'aria-hidden': 'true' }, '🥕'), ' Mon potager'),
      h('div', { class: 'entete-lieu' },
        App.etat.lieu
          ? h('button', { class: 'lien', onclick: () => App.aller('reglages') }, '📍 ', App.etat.lieu.nom)
          : h('button', { class: 'bouton petit primaire', onclick: () => App.aller('reglages') }, '📍 Définir mon lieu')));
    const contenu = h('main', { class: 'contenu vue-' + vue }, Vues[vue]());
    racine.replaceChildren(entete, nav, contenu);
  };

  window.addEventListener('hashchange', () => { App.vue = location.hash.slice(1) || 'maintenant'; App.rendre(); window.scrollTo(0, 0); });

  App.demarrer = async () => {
    // Les « zones dégagées » ne servaient qu'à corriger le LiDAR, abandonné depuis.
    for (const plan of Object.values(App.etat.plans)) plan.objets = plan.objets.filter((o) => o.t !== 'degage');
    App.vue = location.hash.slice(1) || 'maintenant';
    App.climat = (App.etat.lieu && stock.lire('climat', null)) || Climat.climatParDefaut();
    App.prev = App.etat.lieu ? stock.lire('previsions', null) : null;
    App.majContexte();
    await Terrain.chargerCache();
    App.rendre();
    if (App.etat.lieu) { await App.chargerMeteo(); App.rendre(); }
  };

  window.App = App;
  window.Vues = window.Vues || {};
})();
