/* Éditeur de plan : bacs, structures et zones de plantation en glisser-déposer.
 * Les coordonnées des objets sont en mètres ; l'affichage est mis à l'échelle. */
(function () {
  const { h, normaliser, fmtDate, MOIS_LONGS, uid } = U;

  const STRUCTURES = {
    bac: { n: 'Bac / planche', ic: '🟫', w: 1.2, h: 2.4 },
    carre: { n: 'Carré potager', ic: '🟧', w: 1.2, h: 1.2, type: 'bac' },
    pot: { n: 'Pot / jardinière', ic: '🪴', w: 0.4, h: 0.4 },
    allee: { n: 'Allée', ic: '⬜', w: 0.6, h: 3 },
    serre: { n: 'Serre', ic: '🏠', w: 3, h: 2 },
    tunnel: { n: 'Tunnel', ic: '⛺', w: 2, h: 4 },
    chassis: { n: 'Châssis / voile', ic: '🪟', w: 1, h: 1.2 },
    treillis: { n: 'Treillis', ic: '🪜', w: 2, h: 0.1 },
    compost: { n: 'Compost', ic: '♻️', w: 1, h: 1 },
    eau: { n: "Récupérateur d'eau", ic: '💧', w: 0.6, h: 0.6 },
    // Obstacles qui font de l'ombre, chacun avec sa hauteur.
    batiment: { n: 'Bâtiment', ic: '🏠', w: 6, h: 5, obs: true },
    mur: { n: 'Mur / clôture pleine', ic: '🧱', w: 4, h: 0.2, obs: true },
    cloture: { n: 'Clôture ajourée', ic: '🚧', w: 4, h: 0.1, obs: true },
    haie: { n: 'Haie', ic: '🌿', w: 4, h: 0.8, obs: true },
    arbre: { n: 'Arbre', ic: '🌳', w: 5, h: 5, obs: true },
  };
  const NOM_TYPE = { bac: 'Bac / planche', pot: 'Pot', allee: 'Allée', serre: 'Serre', tunnel: 'Tunnel', chassis: 'Châssis', treillis: 'Treillis', compost: 'Compost', eau: "Récupérateur d'eau", plante: 'Plantation', arbre: 'Arbre', haie: 'Haie', mur: 'Mur / clôture pleine', cloture: 'Clôture ajourée', batiment: 'Bâtiment' };
  const ORDRE = { allee: 0, bac: 1, pot: 1, compost: 1, eau: 1, batiment: 1, serre: 2, tunnel: 2, chassis: 2, treillis: 3, mur: 3, cloture: 3, haie: 3, plante: 4, arbre: 5 };
  const ROND = new Set(['pot', 'eau', 'arbre']);
  const PAS = 0.05;
  const arrondi = (v) => +(Math.round(v / PAS) * PAS).toFixed(2);

  // État local de l'éditeur (non enregistré).
  const ed = {
    outil: 'select', pid: null, sel: null, vue: null, mois: null, soleil: false, heure: null, lecture: null, instant: null,
    recherche: '', cat: 'tous', mesGraines: false,
  };
  let svg, groupe, panneau, palette, geste = null;

  const objets = () => App.plan().objets;
  const trouver = (id) => objets().find((o) => o.id === id);
  const enregistrer = () => App.sauver();

  // ---------- Vue principale ----------
  Vues.plan = function () {
    const plan = App.plan();
    const annees = [...new Set([...Object.keys(App.etat.plans).map(Number), App.etat.annee])].sort();
    if (ed.sel && !trouver(ed.sel)) ed.sel = null;

    const barre = h('div', { class: 'barre-plan' },
      h('label', { class: 'champ-ligne' }, 'Saison ',
        h('select', { onchange: (e) => { App.etat.annee = +e.target.value; ed.sel = null; enregistrer(); App.rendre(); } },
          annees.map((a) => h('option', { value: a, selected: a === App.etat.annee }, a)))),
      h('button', { class: 'bouton petit', onclick: preparerSuivante, title: 'Reprend les bacs, structures et vivaces ; laisse les cultures annuelles' }, `➕ Préparer ${App.etat.annee + 1}`),
      h('label', { class: 'champ-ligne' }, 'Terrain ',
        h('input', { type: 'number', min: 1, max: 200, step: 0.5, value: App.etat.jardin.largeur, class: 'num', 'aria-label': 'Largeur (m)', onchange: (e) => { App.etat.jardin.largeur = Math.max(1, +e.target.value || 1); enregistrer(); dessiner(); } }),
        ' × ',
        h('input', { type: 'number', min: 1, max: 200, step: 0.5, value: App.etat.jardin.hauteur, class: 'num', 'aria-label': 'Profondeur (m)', onchange: (e) => { App.etat.jardin.hauteur = Math.max(1, +e.target.value || 1); enregistrer(); dessiner(); } }),
        ' m'),
      h('label', { class: 'champ-ligne' }, 'Afficher ',
        h('select', { onchange: (e) => { ed.mois = e.target.value === '' ? null : +e.target.value; App.rendre(); } },
          h('option', { value: '' }, "toute l'année"),
          MOIS_LONGS.map((m, i) => h('option', { value: i, selected: ed.mois === i }, `en ${m}`)))),
      h('button', { class: 'bouton petit' + (ed.soleil ? ' actif' : ''), 'aria-pressed': ed.soleil, title: 'Carte des heures de soleil (selon le mois affiché)',
        onclick: () => {
          if (!App.soleil && !ed.soleil) { ed.soleil = true; Terrain.calculerSoleil(); return; }
          ed.soleil = !ed.soleil;
          if (!ed.soleil) arreterLecture();
          App.rendre();
        } }, '☀️ Soleil', App.soleil && !Terrain.aJour() ? ' ⟳' : ''),
      h('label', { class: 'champ-ligne' }, 'Fond ',
        h('select', { 'aria-label': 'Fond de plan', onchange: (e) => {
          App.etat.fond = { ...(App.etat.fond || { opacite: 0.85 }), type: e.target.value };
          enregistrer();
          App.rendre();
        } },
          h('option', { value: 'aucun' }, 'aucun'),
          h('option', { value: 'photo', disabled: !App.etat.geo, selected: (App.etat.fond || {}).type === 'photo' }, 'photo aérienne'))),
      (App.etat.fond || {}).type && App.etat.fond.type !== 'aucun' ? h('input', { type: 'range', min: 0.2, max: 1, step: 0.05, value: App.etat.fond.opacite ?? 0.85, class: 'opacite', 'aria-label': 'Opacité du fond', title: 'Opacité du fond',
        oninput: (e) => { App.etat.fond.opacite = +e.target.value; dessiner(); }, onchange: () => enregistrer() }) : null,
      h('button', { class: 'bouton petit primaire', onclick: () => Auto.ouvrir() }, '🪄 Arrangement auto'),
      h('span', { class: 'espace' }),
      h('button', { class: 'bouton-icone', title: 'Zoom arrière', 'aria-label': 'Zoom arrière', onclick: () => zoomer(1 / 1.25) }, '−'),
      h('button', { class: 'bouton-icone', title: 'Ajuster', 'aria-label': 'Ajuster le plan', onclick: () => { ed.vue = null; ajuster(); } }, '⤢'),
      h('button', { class: 'bouton-icone', title: 'Zoom avant', 'aria-label': 'Zoom avant', onclick: () => zoomer(1.25) }, '+'),
      h('button', { class: 'bouton petit', onclick: () => window.print() }, '🖨️ Imprimer'));

    palette = h('aside', { class: 'palette' });
    panneau = h('aside', { class: 'panneau' });
    svg = h('svg:svg', { class: 'plan-svg', role: 'img', 'aria-label': `Plan du potager ${App.etat.annee}` });
    groupe = h('svg:g');
    svg.append(defs(), groupe);
    svg.addEventListener('pointerdown', surAppui);
    svg.addEventListener('pointermove', surDeplacement);
    svg.addEventListener('pointerup', surRelache);
    svg.addEventListener('pointercancel', surRelache);
    svg.addEventListener('wheel', surMolette, { passive: false });

    const zone = h('div', { class: 'zone-plan' }, svg,
      ed.soleil ? reglette() : null,
      (App.etat.fond || {}).type === 'photo' && App.etat.geo ? h('div', { class: 'legende-flottante bas-droite note' }, "Photo aérienne © IGN. Elle peut dater d'un ou deux ans.") : null,
      h('div', { class: 'aide-plan' }, aideOutil()));
    const titrePrint = h('h1', { class: 'seulement-impression' }, `Plan du potager ${App.etat.annee}`);

    rendrePalette();
    rendrePanneau();
    setTimeout(() => { if (!ed.vue) ajuster(); else dessiner(); }, 0);
    if (!plan.objets.length && !ed.vuDemarrage) ed.vuDemarrage = true;
    return h('div', { class: 'plan' }, titrePrint, barre, h('div', { class: 'plan-corps' }, palette, zone, panneau));
  };

  function aideOutil() {
    if (ed.outil === 'plante') {
      const p = PLANTES_PAR_ID[ed.pid];
      return `${p.ic} ${p.n} : clique pour un plant, ou trace un rectangle pour une zone. Zones rouges hachurées = même famille ces 3 dernières années. Échap pour arrêter.`;
    }
    if (STRUCTURES[ed.outil]) return `Trace un rectangle (ou clique) pour ajouter : ${STRUCTURES[ed.outil].n}.`;
    return 'Glisse un objet pour le déplacer, son coin pour le redimensionner. Glisse le fond pour te déplacer, molette pour zoomer.';
  }

  function defs() {
    return h('svg:defs', {},
      h('svg:pattern', { id: 'hachures', patternUnits: 'userSpaceOnUse', width: 0.15, height: 0.15, patternTransform: 'rotate(45)' },
        h('svg:rect', { width: 0.15, height: 0.15, fill: 'rgba(220,60,50,0.12)' }),
        h('svg:line', { x1: 0, y1: 0, x2: 0, y2: 0.15, stroke: 'rgba(200,40,40,0.55)', 'stroke-width': 0.04 })),
      h('svg:pattern', { id: 'grille', patternUnits: 'userSpaceOnUse', width: 1, height: 1 },
        h('svg:path', { d: 'M 1 0 L 0 0 0 1', fill: 'none', stroke: 'rgba(60,90,40,0.25)', 'stroke-width': 0.02 }),
        h('svg:path', { d: 'M 0.5 0 L 0.5 1 M 0 0.5 L 1 0.5', fill: 'none', stroke: 'rgba(60,90,40,0.12)', 'stroke-width': 0.01 })));
  }

  // ---------- Palette ----------
  function rendrePalette() {
    const q = normaliser(ed.recherche);
    const enStock = new Set(App.etat.graines.map((g) => g.pid));
    const liste = PLANTES.filter((p) =>
      (ed.cat === 'tous' || p.cat === ed.cat) &&
      (!ed.mesGraines || enStock.has(p.id)) &&
      (!q || normaliser(p.n + ' ' + (p.al || []).join(' ')).includes(q)));

    const chips = [['tous', 'Tout'], ...Object.entries(CATEGORIES)];
    palette.replaceChildren(
      h('div', { class: 'palette-section' },
        h('h3', {}, 'Structures'),
        h('div', { class: 'grille-outils' },
          h('button', { class: 'outil' + (ed.outil === 'select' ? ' actif' : ''), onclick: () => choisirOutil('select') }, h('span', { 'aria-hidden': 'true' }, '🖱️'), 'Sélection'),
          Object.entries(STRUCTURES).filter(([, s]) => !s.obs).map(([k, s]) =>
            h('button', { class: 'outil' + (ed.outil === k ? ' actif' : ''), onclick: () => choisirOutil(k) }, h('span', { 'aria-hidden': 'true' }, s.ic), s.n)))),
      h('div', { class: 'palette-section' },
        h('h3', {}, 'Ombre'),
        h('div', { class: 'grille-outils' },
          Object.entries(STRUCTURES).filter(([, s]) => s.obs).map(([k, s]) =>
            h('button', { class: 'outil' + (ed.outil === k ? ' actif' : ''), onclick: () => choisirOutil(k) }, h('span', { 'aria-hidden': 'true' }, s.ic), s.n)))),
      h('div', { class: 'palette-section palette-plantes' },
        h('h3', {}, 'Plantes'),
        h('input', { type: 'search', placeholder: 'Chercher une plante…', value: ed.recherche, 'aria-label': 'Chercher une plante',
          oninput: (e) => { ed.recherche = e.target.value; rendreListePlantes(); } }),
        h('div', { class: 'chips' },
          chips.map(([k, n]) => h('button', { class: 'chip' + (ed.cat === k ? ' actif' : ''), onclick: () => { ed.cat = k; rendrePalette(); } }, n)),
          h('button', { class: 'chip' + (ed.mesGraines ? ' actif' : ''), onclick: () => { ed.mesGraines = !ed.mesGraines; rendrePalette(); } }, '🌰 Mes graines')),
        h('div', { class: 'liste-plantes', id: 'liste-plantes' })));
    rendreListePlantes(liste, enStock);
  }

  function rendreListePlantes(liste, enStock) {
    const conteneur = palette.querySelector('#liste-plantes');
    if (!liste) {
      const q = normaliser(ed.recherche);
      enStock = new Set(App.etat.graines.map((g) => g.pid));
      liste = PLANTES.filter((p) => (ed.cat === 'tous' || p.cat === ed.cat) && (!ed.mesGraines || enStock.has(p.id)) &&
        (!q || normaliser(p.n + ' ' + (p.al || []).join(' ')).includes(q)));
    }
    // Pour la plante choisie : compagnons du plan mis en avant.
    conteneur.replaceChildren(...(liste.length ? liste.map((p) =>
      h('button', { class: 'item-plante' + (ed.outil === 'plante' && ed.pid === p.id ? ' actif' : ''), onclick: () => choisirOutil('plante', p.id) },
        App.icone(p), h('span', { class: 'item-nom' }, p.n),
        enStock.has(p.id) ? h('span', { class: 'badge', title: 'Dans mes graines' }, '🌰') : null))
      : [h('p', { class: 'vide' }, ed.mesGraines ? "Aucune de tes graines ne correspond. Ajoute-les dans l'onglet Mes graines." : 'Aucune plante trouvée.')]));
  }

  function choisirOutil(outil, pid = null) {
    ed.outil = outil; ed.pid = pid;
    if (outil !== 'select') ed.sel = null;
    rendrePalette(); rendrePanneau(); dessiner();
    const aide = svg.parentNode && svg.parentNode.querySelector('.aide-plan');
    if (aide) aide.textContent = aideOutil();
    svg.style.cursor = outil === 'select' ? 'default' : 'crosshair';
  }

  // ---------- Dessin ----------
  function ajuster() {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const { largeur, hauteur } = App.etat.jardin;
    const s = Math.min((r.width - 60) / largeur, (r.height - 60) / hauteur);
    ed.vue = { s, x: (r.width - largeur * s) / 2, y: (r.height - hauteur * s) / 2 };
    dessiner();
  }
  function zoomer(f, cx, cy) {
    const r = svg.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    const v = ed.vue;
    const ns = Math.min(800, Math.max(8, v.s * f));
    v.x = cx - ((cx - v.x) * ns) / v.s; v.y = cy - ((cy - v.y) * ns) / v.s; v.s = ns;
    dessiner();
  }

  const S = (tag, attrs, ...e) => h('svg:' + tag, attrs, ...e);

  function dessiner() {
    if (!groupe || !ed.vue) return;
    const { s, x, y } = ed.vue;
    groupe.setAttribute('transform', `translate(${x},${y}) scale(${s})`);
    const { largeur, hauteur } = App.etat.jardin;
    const els = [];
    const fs = (px) => px / s; // taille en mètres pour une taille écran voulue

    const fond = imageFond();
    if (fond) els.push(fond);
    els.push(S('rect', { x: 0, y: 0, width: largeur, height: hauteur, fill: fond ? 'none' : '#eef4e4', stroke: '#9bb07f', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }));
    ed.instant = null;
    if (ed.soleil && ed.heure != null) {
      // Ombres à l'heure choisie (recalculées à chaque dessin : on les voit bouger quand on déplace un arbre).
      ed.instant = Terrain.instant(dateInstant());
      if (ed.instant) els.push(S('image', { href: ed.instant.url, x: 0, y: 0, width: ed.instant.nx * ed.instant.pas, height: ed.instant.ny * ed.instant.pas, preserveAspectRatio: 'none', style: 'image-rendering: pixelated', 'pointer-events': 'none' }));
    } else if (ed.soleil && App.soleil) {
      const sol = App.soleil;
      els.push(S('image', { href: Terrain.image(ed.mois), x: 0, y: 0, width: sol.nx * sol.pas, height: sol.ny * sol.pas, preserveAspectRatio: 'none', opacity: 0.6, style: 'image-rendering: pixelated', 'pointer-events': 'none' }));
    }
    els.push(S('rect', { x: 0, y: 0, width: largeur, height: hauteur, fill: 'url(#grille)', 'pointer-events': 'none' }));
    for (const anneau of Terrain.contoursLocaux(App.etat.geo)) {
      els.push(S('polygon', { points: anneau.map((p) => p.join(',')).join(' '), fill: 'none', stroke: '#5d4037', 'stroke-width': 2.5, 'stroke-dasharray': '10 4 2 4', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    }
    // Flèche du nord (le plan est toujours orienté nord en haut).
    els.push(S('g', { transform: `translate(${largeur + fs(22)},${fs(4)})`, 'pointer-events': 'none' },
      S('path', { d: `M 0 0 L ${fs(7)} ${fs(18)} L 0 ${fs(13)} L ${-fs(7)} ${fs(18)} Z`, fill: '#3a4a33' }),
      S('text', { x: 0, y: fs(32), 'font-size': fs(12), 'text-anchor': 'middle', class: 'grad', 'font-weight': 700 }, 'N')));
    if (ed.instant && ed.instant.pos.el > 0) {
      const { az, el } = ed.instant.pos;
      const cx = largeur / 2, cy = hauteur / 2, R = Math.hypot(largeur, hauteur) / 2 + fs(34);
      const sx = cx + Math.sin(az) * R, sy = cy - Math.cos(az) * R;
      els.push(S('g', { 'pointer-events': 'none' },
        S('line', { x1: sx, y1: sy, x2: cx + Math.sin(az) * (R - fs(60)), y2: cy - Math.cos(az) * (R - fs(60)), stroke: '#e0a800', 'stroke-width': 2, 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke' }),
        S('text', { x: sx, y: sy, 'font-size': fs(30), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '☀️'),
        S('text', { x: sx, y: sy + fs(24), 'font-size': fs(11), 'text-anchor': 'middle', class: 'nom-structure', 'stroke-width': fs(3) }, `${Math.round((el * 180) / Math.PI)}°`)));
    }
    // Graduations en mètres.
    const pasGrad = s < 25 ? 5 : s < 50 ? 2 : 1;
    for (let i = 0; i <= largeur; i += pasGrad) els.push(S('text', { x: i, y: -fs(6), 'font-size': fs(11), 'text-anchor': 'middle', class: 'grad' }, `${i} m`));
    for (let j = pasGrad; j <= hauteur; j += pasGrad) els.push(S('text', { x: -fs(6), y: j, 'font-size': fs(11), 'text-anchor': 'end', 'dominant-baseline': 'central', class: 'grad' }, `${j}`));

    const objs = [...objets()].sort((a, b) => ORDRE[a.t] - ORDRE[b.t]);
    // Rotation : où la famille de la plante choisie a poussé ces 3 dernières années.
    const outilPlante = ed.outil === 'plante' ? PLANTES_PAR_ID[ed.pid] : null;
    const rel = {};
    if (outilPlante) {
      for (const o of objets()) if (o.t === 'plante') {
        const a = App.associations(outilPlante.id, o.pid);
        if (a.length) rel[o.id] = a.some((x) => x[2] === '-') ? '-' : '+';
      }
    }

    for (const o of objs) els.push(o.t === 'plante' ? dessinerPlante(o, fs, rel[o.id]) : dessinerStructure(o, fs));

    if (outilPlante && !outilPlante.per && outilPlante.cat !== 'engrais') {
      for (let a = App.etat.annee - 3; a < App.etat.annee; a++) {
        for (const o of (App.etat.plans[a] || { objets: [] }).objets) {
          const q = PLANTES_PAR_ID[o.pid];
          if (o.t !== 'plante' || !q || q.per || q.fam !== outilPlante.fam) continue;
          els.push(S('g', { 'pointer-events': 'none', transform: transformee(o) },
            S('rect', { x: o.x, y: o.y, width: o.w, height: o.h, fill: 'url(#hachures)', stroke: '#c62828', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke' }),
            S('text', { x: o.x + fs(3), y: o.y + o.h - fs(4), 'font-size': fs(10), class: 'etiquette-rotation', 'stroke-width': fs(3) }, `${q.n} ${a}`)));
        }
      }
    }

    const sel = ed.sel && trouver(ed.sel);
    if (sel) {
      const p = 6 / s;
      const gs = S('g', { transform: transformee(sel) });
      gs.append(S('rect', { x: sel.x - p / 2, y: sel.y - p / 2, width: sel.w + p, height: sel.h + p, fill: 'none', stroke: '#1565c0', 'stroke-width': 2, 'stroke-dasharray': '5 3', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
      if (!sel.verrou) {
        gs.append(S('rect', { x: sel.x + sel.w - fs(7), y: sel.y + sel.h - fs(7), width: fs(14), height: fs(14), fill: '#1565c0', stroke: '#fff', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'data-poignee': '1', class: 'poignee' }));
        if (!ROND.has(sel.t)) {
          const cx = sel.x + sel.w / 2;
          gs.append(S('line', { x1: cx, y1: sel.y - p / 2, x2: cx, y2: sel.y - fs(24), stroke: '#1565c0', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
          gs.append(S('circle', { cx, cy: sel.y - fs(30), r: fs(8), fill: '#fff', stroke: '#1565c0', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'data-rotation': '1', class: 'poignee-rotation' },
            S('title', {}, 'Faire pivoter (Maj : degré par degré)')));
        }
      }
      els.push(gs);
    }
    if (geste && geste.type === 'trace') {
      const r = rectGeste(geste);
      els.push(S('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'rgba(21,101,192,0.12)', stroke: '#1565c0', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
      if (r.w > 0.05 && r.h > 0.05) {
        const txt = ed.outil === 'plante'
          ? `${Math.round(r.w * 100)} × ${Math.round(r.h * 100)} cm · ${App.nbPlants({ pid: ed.pid, w: r.w, h: r.h })} plants`
          : `${Math.round(r.w * 100)} × ${Math.round(r.h * 100)} cm`;
        els.push(S('text', { x: r.x + r.w / 2, y: r.y - fs(6), 'font-size': fs(12), 'text-anchor': 'middle', class: 'cote', 'stroke-width': fs(3) }, txt));
      }
    }
    groupe.replaceChildren(...els);
  }

  const transformee = (o) => (o.rot && !ROND.has(o.t) ? `rotate(${o.rot} ${o.x + o.w / 2} ${o.y + o.h / 2})` : null);

  // Fond de plan : photo aérienne de l'IGN, pour placer arbres et bâtiments au bon endroit.
  function imageFond() {
    const f = App.etat.fond || {};
    const opacite = f.opacite ?? 0.85;
    if (f.type === 'photo' && App.etat.geo) {
      const { largeur, hauteur } = App.etat.jardin;
      const m = 15, x0 = -m, y0 = -m, W = largeur + 2 * m, H = hauteur + 2 * m;
      const no = Soleil.versGeo(App.etat.geo, x0, y0), se = Soleil.versGeo(App.etat.geo, x0 + W, y0 + H);
      let px = Math.ceil(W / 0.2), py = Math.ceil(H / 0.2);
      const r = Math.min(1, 2048 / Math.max(px, py)); px = Math.round(px * r); py = Math.round(py * r);
      const url = 'https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=' +
        `&CRS=EPSG:4326&BBOX=${se.lat},${no.lon},${no.lat},${se.lon}&WIDTH=${px}&HEIGHT=${py}&FORMAT=image/jpeg`;
      return S('image', { href: url, x: x0, y: y0, width: W, height: H, preserveAspectRatio: 'none', opacity: opacite, 'pointer-events': 'none' });
    }
    return null;
  }
  function dessinerStructure(o, fs) {
    const g = S('g', { 'data-id': o.id, class: 'objet' + (o.verrou ? ' verrou' : ''), transform: transformee(o) });
    const trait = { 'vector-effect': 'non-scaling-stroke' };
    if (o.t === 'pot' || o.t === 'eau') {
      const fill = o.t === 'eau' ? '#90caf9' : '#d9a066';
      g.append(S('ellipse', { cx: o.x + o.w / 2, cy: o.y + o.h / 2, rx: o.w / 2, ry: o.h / 2, fill, stroke: o.t === 'eau' ? '#1e88e5' : '#9c5b2e', 'stroke-width': 2, ...trait }));
      if (o.t === 'eau') g.append(S('text', { x: o.x + o.w / 2, y: o.y + o.h / 2, 'font-size': Math.min(o.w, o.h) * 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '💧'));
    } else if (o.t === 'bac') {
      g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: o.h, rx: 0.03, fill: '#c9a77c', stroke: '#8d6e63', 'stroke-width': 3, ...trait }));
      const m = Math.min(0.05, o.w / 5, o.h / 5);
      g.append(S('rect', { x: o.x + m, y: o.y + m, width: o.w - 2 * m, height: o.h - 2 * m, fill: '#8a6a4f', 'pointer-events': 'none' }));
    } else if (o.t === 'allee') {
      g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: o.h, fill: '#e6dfd0', stroke: '#c8bca6', 'stroke-width': 1, ...trait }));
    } else if (Calendrier.ABRIS[o.t]) {
      const c = { serre: '#3d8fc4', tunnel: '#5aa5cf', chassis: '#5b9bd5' }[o.t];
      g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: o.h, fill: c, 'fill-opacity': 0.13, stroke: c, 'stroke-width': 2, 'stroke-dasharray': o.t === 'serre' ? '' : '6 3', ...trait }));
    } else if (o.t === 'treillis') {
      g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: Math.max(o.h, 0.04), fill: '#8d6e63', stroke: '#5d4037', 'stroke-width': 1, 'stroke-dasharray': '3 2', ...trait }));
    } else if (o.t === 'compost') {
      g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: o.h, fill: '#6d5a3a', stroke: '#4e3f28', 'stroke-width': 2, ...trait }));
      g.append(S('text', { x: o.x + o.w / 2, y: o.y + o.h / 2, 'font-size': Math.min(o.w, o.h) * 0.45, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, '♻️'));
    } else if (o.t === 'arbre') {
      const e = Soleil.essenceDe(o);
      g.append(S('circle', { cx: o.x + o.w / 2, cy: o.y + o.h / 2, r: o.w / 2, fill: e.caduc ? '#8bbf6a' : '#3f7d3a', 'fill-opacity': 0.35, stroke: '#2e5e2a', 'stroke-width': 2, 'stroke-dasharray': e.caduc ? '6 3' : '', ...trait }));
      g.append(S('text', { x: o.x + o.w / 2, y: o.y + o.h / 2, 'font-size': Math.min(o.w * 0.4, fs(28)), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'pointer-events': 'none' }, e.ic));
    } else if (o.t === 'haie') {
      g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: o.h, rx: Math.min(o.h / 2, 0.4), fill: o.caduc ? '#5f9a4f' : '#2f6b35', 'fill-opacity': 0.7, stroke: '#1f4a24', 'stroke-width': 1.5, ...trait }));
    } else if (o.t === 'mur') {
      g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: Math.max(o.h, 0.05), fill: '#9e9e9e', stroke: '#616161', 'stroke-width': 1.5, ...trait }));
    } else if (o.t === 'cloture') {
      g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: Math.max(o.h, 0.05), fill: '#d7ccc8', stroke: '#6d4c41', 'stroke-width': 1.5, 'stroke-dasharray': '2 3', ...trait }));
    } else if (o.t === 'batiment') {
      g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: o.h, fill: '#b0a89e', 'fill-opacity': 0.85, stroke: '#5d554c', 'stroke-width': 2, ...trait }));
    }
    if (Soleil.OBSTACLES[o.t] && Math.max(o.w, o.h) > fs(30)) {
      const nom = o.nom || (o.t === 'arbre' ? Soleil.essenceDe(o).n.split(' /')[0].replace(/^Autre .*/, 'Arbre') : NOM_TYPE[o.t]);
      g.append(S('text', { x: o.x + o.w / 2, y: o.y + o.h + fs(12), 'font-size': fs(11), 'text-anchor': 'middle', class: 'nom-structure', 'stroke-width': fs(3), 'pointer-events': 'none' }, `${nom} · ${(o.hauteur ?? hauteurParDefaut(o)).toString().replace('.', ',')} m`));
      return g;
    }
    const nom = o.nom || (Calendrier.ABRIS[o.t] ? NOM_TYPE[o.t] : '');
    if (nom && o.w > fs(40)) g.append(S('text', { x: o.x + fs(4), y: o.y + fs(13), 'font-size': fs(11), class: 'nom-structure' + (o.t === 'bac' ? ' clair' : ''), 'stroke-width': fs(3) }, nom));
    return g;
  }

  function dessinerPlante(o, fs, relation) {
    const p = PLANTES_PAR_ID[o.pid];
    if (!p) return S('g');
    const couleur = (FAMILLES[p.fam] || {}).c || '#6a8f4e';
    let opacite = 1;
    if (ed.mois != null) {
      const occ = App.occupation(o, objets());
      const debutMois = new Date(App.etat.annee, ed.mois, 1), finMois = new Date(App.etat.annee, ed.mois + 1, 0);
      if (!occ || occ.fin < debutMois || occ.debut > finMois) opacite = 0.15;
    }
    const conflit = App.rotation(o).length > 0;
    const g = S('g', { 'data-id': o.id, class: 'objet plante', opacity: opacite, transform: transformee(o) });
    g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: o.h, rx: Math.min(0.06, o.w / 4, o.h / 4), fill: couleur, 'fill-opacity': 0.22,
      stroke: relation === '+' ? '#2e7d32' : relation === '-' ? '#c62828' : conflit ? '#c62828' : couleur,
      'stroke-width': relation ? 4 : 1.5, 'stroke-dasharray': conflit && !relation ? '5 3' : '', 'vector-effect': 'non-scaling-stroke' }));

    // Un symbole par plant (limité pour les très grandes zones).
    const ecart = p.esp[0] / 100, rang = o.mode === 'rangs' ? p.esp[1] / 100 : ecart;
    const nx = Math.max(1, Math.floor(o.w / ecart + 0.0001)), ny = Math.max(1, Math.floor(o.h / rang + 0.0001));
    const dx = o.w / nx, dy = o.h / ny;
    const taille = Math.min(dx, dy, 0.6) * 0.8;
    if (nx * ny <= 400 && taille * ed.vue.s >= 6) {
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        g.append(S('text', { x: o.x + dx * (i + 0.5), y: o.y + dy * (j + 0.5), 'font-size': taille, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'pointer-events': 'none' }, p.ic || '🌱'));
      }
    } else {
      g.append(S('text', { x: o.x + o.w / 2, y: o.y + o.h / 2, 'font-size': Math.min(o.w, o.h, 0.6) * 0.7, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'pointer-events': 'none' }, p.ic || '🌱'));
    }
    if (o.w * ed.vue.s > 70 && o.h * ed.vue.s > 26) {
      g.append(S('text', { x: o.x + fs(4), y: o.y + fs(12), 'font-size': fs(11), class: 'nom-plante', 'stroke-width': fs(3), 'pointer-events': 'none' }, `${p.n} ×${App.nbPlants(o)}`));
    }
    if (conflit) g.append(S('text', { x: o.x + o.w - fs(4), y: o.y + fs(12), 'font-size': fs(12), 'text-anchor': 'end', 'pointer-events': 'none' }, '⚠️'));
    return g;
  }

  // ---------- Souris / tactile ----------
  function point(e) {
    const r = svg.getBoundingClientRect();
    return [(e.clientX - r.left - ed.vue.x) / ed.vue.s, (e.clientY - r.top - ed.vue.y) / ed.vue.s];
  }
  function rectGeste(g) {
    const [x0, y0] = g.depart, [x1, y1] = g.actuel;
    const x = arrondi(Math.min(x0, x1)), y = arrondi(Math.min(y0, y1));
    return { x, y, w: arrondi(Math.max(x0, x1) - x), h: arrondi(Math.max(y0, y1) - y) };
  }

  function surAppui(e) {
    if (e.button === 1 || e.button === 2) return;
    const pt = point(e);
    try { svg.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    const poignee = e.target.closest('[data-poignee]');
    const poigneeRot = e.target.closest('[data-rotation]');
    const cible = e.target.closest('[data-id]');
    if (poigneeRot && ed.sel) {
      const o = trouver(ed.sel);
      const [cx, cy] = G.centre(o);
      geste = { type: 'rotation', o, centre: [cx, cy], rot0: o.rot || 0, ang0: Math.atan2(pt[1] - cy, pt[0] - cx) };
    } else if (poignee && ed.sel) {
      const o = trouver(ed.sel);
      geste = { type: 'taille', o, depart: pt, w0: o.w, h0: o.h, coin: G.versMonde(o, 0, 0) };
    } else if (ed.outil !== 'select') {
      geste = { type: 'trace', depart: pt, actuel: pt };
    } else if (cible) {
      const o = trouver(cible.getAttribute('data-id'));
      ed.sel = o.id;
      geste = o.verrou ? null : { type: 'deplace', o, depart: pt, x0: o.x, y0: o.y, bouge: false };
      rendrePanneau();
      dessiner();
    } else {
      if (ed.sel) { ed.sel = null; rendrePanneau(); }
      geste = { type: 'pan', ecran: [e.clientX, e.clientY], v0: { ...ed.vue } };
      dessiner();
    }
  }

  function surDeplacement(e) {
    if (!geste) return;
    const pt = point(e);
    if (geste.type === 'pan') {
      ed.vue.x = geste.v0.x + e.clientX - geste.ecran[0];
      ed.vue.y = geste.v0.y + e.clientY - geste.ecran[1];
    } else if (geste.type === 'trace') {
      geste.actuel = pt;
    } else if (geste.type === 'deplace') {
      geste.o.x = arrondi(geste.x0 + pt[0] - geste.depart[0]);
      geste.o.y = arrondi(geste.y0 + pt[1] - geste.depart[1]);
      geste.bouge = true;
    } else if (geste.type === 'taille') {
      const o = geste.o;
      // Déplacement de la souris exprimé dans le repère (éventuellement pivoté) de l'objet.
      const a = (-(o.rot || 0) * Math.PI) / 180, dx = pt[0] - geste.depart[0], dy = pt[1] - geste.depart[1];
      o.w = Math.max(PAS, arrondi(geste.w0 + dx * Math.cos(a) - dy * Math.sin(a)));
      o.h = Math.max(o.t === 'treillis' ? 0.05 : PAS, arrondi(geste.h0 + dx * Math.sin(a) + dy * Math.cos(a)));
      if (ROND.has(o.t)) o.h = o.w;
      if (o.rot) {
        // Le coin opposé à la poignée reste en place.
        const b = (o.rot * Math.PI) / 180;
        const cx = geste.coin[0] + (o.w / 2) * Math.cos(b) - (o.h / 2) * Math.sin(b);
        const cy = geste.coin[1] + (o.w / 2) * Math.sin(b) + (o.h / 2) * Math.cos(b);
        o.x = +(cx - o.w / 2).toFixed(3); o.y = +(cy - o.h / 2).toFixed(3);
      }
    } else if (geste.type === 'rotation') {
      const [cx, cy] = geste.centre;
      let r = geste.rot0 + ((Math.atan2(pt[1] - cy, pt[0] - cx) - geste.ang0) * 180) / Math.PI;
      r = e.shiftKey ? Math.round(r) : Math.round(r / 5) * 5;
      definirRotation(geste.o, r);
    }
    dessiner();
  }

  function surRelache() {
    if (!geste) return;
    const g = geste;
    geste = null;
    if (g.type === 'trace') {
      const r = rectGeste(g);
      const clic = r.w < 0.1 && r.h < 0.1;
      let o;
      if (ed.outil === 'plante') {
        const p = PLANTES_PAR_ID[ed.pid];
        const e = Math.max(0.1, p.esp[0] / 100);
        o = clic ? { x: arrondi(g.depart[0] - e / 2), y: arrondi(g.depart[1] - e / 2), w: arrondi(e), h: arrondi(e) } : r;
        Object.assign(o, { id: uid(), t: 'plante', pid: p.id, mode: 'bloc' });
        const contenant = objets().find((c) => (c.t === 'bac' || Calendrier.ABRIS[c.t]) && c.rot && G.dedans(G.centre(o), c));
        if (contenant) o.rot = contenant.rot;
        const graine = App.grainesDe(p.id)[0];
        if (graine) o.graineId = graine.id;
      } else {
        const s = STRUCTURES[ed.outil];
        o = clic ? { x: arrondi(g.depart[0] - s.w / 2), y: arrondi(g.depart[1] - s.h / 2), w: s.w, h: s.h } : r;
        Object.assign(o, { id: uid(), t: s.type || ed.outil });
        if (o.t === 'arbre') Object.assign(o, { essence: 'autre_caduc', caduc: true });
        if (ROND.has(o.t) && !clic) o.h = o.w = Math.max(r.w, r.h);
      }
      objets().push(o);
      ed.sel = o.id;
      if (ed.outil !== 'plante') { ed.outil = 'select'; rendrePalette(); svg.style.cursor = 'default'; }
      enregistrer();
      rendrePanneau();
      const aide = svg.parentNode.querySelector('.aide-plan');
      if (aide) aide.textContent = aideOutil();
    } else if (g.type === 'deplace' || g.type === 'taille' || g.type === 'rotation') {
      if (g.type !== 'deplace' || g.bouge) { enregistrer(); rendrePanneau(); }
    }
    dessiner();
  }

  function surMolette(e) {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomer(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }

  document.addEventListener('keydown', (e) => {
    if (App.vue !== 'plan' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.querySelector('.modal-fond')) return;
    const o = ed.sel && trouver(ed.sel);
    if (e.key === 'Escape') { choisirOutil('select'); return; }
    if (!o) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); supprimer(o); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); dupliquer(o); }
    else if (e.key.toLowerCase() === 'r' && !o.verrou && !ROND.has(o.t) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); definirRotation(o, (o.rot || 0) + (e.shiftKey ? -15 : 15)); enregistrer(); dessiner(); rendrePanneau();
    }
    else if (e.key.startsWith('Arrow') && !o.verrou) {
      e.preventDefault();
      const d = e.shiftKey ? 0.5 : PAS;
      if (e.key === 'ArrowLeft') o.x = arrondi(o.x - d);
      if (e.key === 'ArrowRight') o.x = arrondi(o.x + d);
      if (e.key === 'ArrowUp') o.y = arrondi(o.y - d);
      if (e.key === 'ArrowDown') o.y = arrondi(o.y + d);
      enregistrer(); dessiner();
    }
  });

  // ---------- Défilement du soleil ----------
  const moisAffiche = () => (ed.mois != null ? ed.mois : new Date().getMonth());
  const dateInstant = (minutes = ed.heure) => new Date(new Date().getFullYear(), moisAffiche(), 15, 0, minutes || 0);
  const fmtHeure = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  const DIRECTIONS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
  const direction = (az) => DIRECTIONS[Math.round((az * 180) / Math.PI / 45) % 8];
  function arreterLecture() { if (ed.lecture) { clearInterval(ed.lecture); ed.lecture = null; } }

  function reglette() {
    const geo = Terrain.origineCalcul();
    if (!geo) return h('div', { class: 'legende-flottante note' }, 'Définis ton lieu ou ta parcelle pour voir le soleil.');
    const { lever, coucher } = Soleil.leverCoucher(geo, dateInstant(0));
    const min = Math.floor((lever - 30) / 15) * 15, max = Math.ceil((coucher + 30) / 15) * 15;
    const midi = Math.round((lever + coucher) / 2 / 15) * 15;
    const curseur = h('input', { type: 'range', min, max, step: 15, value: ed.heure ?? midi, class: 'curseur-heure', 'aria-label': 'Heure de la journée' });
    const libelle = h('strong', { class: 'heure-affichee' });
    const info = h('div', { class: 'note' });
    const lecture = h('button', { class: 'bouton petit', 'aria-label': 'Faire défiler la journée' });
    const journee = h('button', { class: 'bouton petit' }, 'Journée entière');
    const legJour = h('div', {}, App.soleil ? Terrain.legende() : h('span', { class: 'note' }, 'Pas encore de carte des heures de soleil. ', h('button', { class: 'lien', onclick: () => Terrain.calculerSoleil() }, 'Calculer')));
    const legInstant = h('div', { class: 'legende-soleil' },
      h('span', { class: 'case' }, h('span', { class: 'pastille', style: { background: 'rgba(255,220,80,0.5)', border: '1px solid #e0a800' } }), 'au soleil'),
      h('span', { class: 'case' }, h('span', { class: 'pastille', style: { background: 'rgba(25,35,70,0.6)' } }), "à l'ombre"),
      h('span', { class: 'case' }, h('span', { class: 'pastille', style: { background: 'rgba(110,110,90,0.4)' } }), 'ombre légère (feuillage, clôture ajourée)'));
    const moisTxt = `le 15 ${MOIS_LONGS[moisAffiche()]}`;
    const maj = () => {
      const instantane = ed.heure != null;
      libelle.textContent = instantane ? fmtHeure(ed.heure) : 'Journée entière';
      journee.classList.toggle('actif', !instantane);
      lecture.textContent = ed.lecture ? '⏸' : '▶';
      legJour.hidden = instantane; legInstant.hidden = !instantane;
      const pos = ed.instant && ed.instant.pos;
      info.textContent = instantane
        ? (pos && pos.el > 0 ? `${moisTxt}, soleil à ${Math.round((pos.el * 180) / Math.PI)}° au-dessus de l'horizon, côté ${direction(pos.az)}.` : `${moisTxt} : le soleil est couché.`) + ` Lever ${fmtHeure(lever)}, coucher ${fmtHeure(coucher)}.`
        : (ed.mois == null ? "Heures de soleil par jour, moyenne d'avril à septembre. Choisis un mois dans « Afficher », ou fais glisser le curseur pour voir les ombres heure par heure." : `Heures de soleil par jour ${moisTxt}. Fais glisser le curseur pour voir les ombres heure par heure.`)
          + (App.soleil && !Terrain.aJour() ? ' Obstacles modifiés depuis le dernier calcul.' : '');
    };
    curseur.addEventListener('input', () => { ed.heure = +curseur.value; dessiner(); maj(); });
    journee.addEventListener('click', () => { arreterLecture(); ed.heure = null; dessiner(); maj(); });
    lecture.addEventListener('click', () => {
      if (ed.lecture) { arreterLecture(); maj(); return; }
      if (ed.heure == null || ed.heure >= max) ed.heure = min;
      ed.lecture = setInterval(() => {
        if (App.vue !== 'plan' || !document.body.contains(curseur)) { arreterLecture(); return; }
        ed.heure = ed.heure + 15 > max ? min : ed.heure + 15;
        curseur.value = ed.heure;
        dessiner(); maj();
      }, 180);
      maj();
    });
    setTimeout(maj, 0);
    return h('div', { class: 'legende-flottante reglette-soleil' },
      h('div', { class: 'ligne-reglette' }, lecture, curseur, libelle, journee),
      legJour, legInstant, info);
  }

  function definirRotation(o, r) {
    r = ((((r + 180) % 360) + 360) % 360) - 180;
    if (Math.abs(r) < 0.01) delete o.rot; else o.rot = +r.toFixed(1);
  }
  // Oriente l'objet comme le bord de parcelle le plus proche (pratique pour un bâtiment ou un bac le long d'une clôture).
  function alignerSurParcelle(o) {
    const [cx, cy] = G.centre(o);
    let best = null;
    for (const a of Terrain.contoursLocaux(App.etat.geo)) {
      for (let i = 0; i < a.length - 1; i++) {
        const [x1, y1] = a[i], [x2, y2] = a[i + 1];
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (l2 < 0.25) continue;
        const t = Math.max(0, Math.min(1, ((cx - x1) * (x2 - x1) + (cy - y1) * (y2 - y1)) / l2));
        const d = Math.hypot(cx - x1 - t * (x2 - x1), cy - y1 - t * (y2 - y1));
        if (!best || d < best.d) best = { d, ang: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI };
      }
    }
    if (!best) return;
    let r = best.ang;
    while (r > 45) r -= 90;
    while (r <= -45) r += 90;
    definirRotation(o, r);
    enregistrer(); dessiner(); rendrePanneau();
  }
  function champRotation(o) {
    if (ROND.has(o.t)) return null;
    const tourner = (d) => { definirRotation(o, (o.rot || 0) + d); enregistrer(); dessiner(); rendrePanneau(); };
    return h('div', { class: 'champ' }, 'Rotation',
      h('div', { class: 'ligne-champ rotation' },
        h('button', { class: 'bouton petit', disabled: o.verrou, title: 'Tourner de 15° (Maj+R)', 'aria-label': 'Tourner de 15° vers la gauche', onclick: () => tourner(-15) }, '↺'),
        h('input', { type: 'number', step: 1, min: -180, max: 180, class: 'num', value: o.rot || 0, disabled: o.verrou, 'aria-label': 'Angle en degrés',
          onchange: (e) => { definirRotation(o, +e.target.value || 0); enregistrer(); dessiner(); rendrePanneau(); } }), '°',
        h('button', { class: 'bouton petit', disabled: o.verrou, title: 'Tourner de 15° (R)', 'aria-label': 'Tourner de 15° vers la droite', onclick: () => tourner(15) }, '↻'),
        App.etat.geo ? h('button', { class: 'bouton petit', disabled: o.verrou, title: "Prendre l'angle du bord de parcelle le plus proche", onclick: () => alignerSurParcelle(o) }, '📐 Aligner sur la parcelle') : null));
  }

  // ---------- Actions ----------
  function supprimer(o) {
    const liste = objets();
    liste.splice(liste.indexOf(o), 1);
    ed.sel = null; enregistrer(); rendrePanneau(); dessiner();
  }
  function dupliquer(o) {
    const c = { ...o, id: uid(), x: arrondi(o.x + 0.2), y: arrondi(o.y + 0.2), verrou: false };
    objets().push(c); ed.sel = c.id; enregistrer(); rendrePanneau(); dessiner();
  }
  function deplacerOrdre(o, versAvant) {
    const liste = objets();
    liste.splice(liste.indexOf(o), 1);
    if (versAvant) liste.push(o); else liste.unshift(o);
    enregistrer(); dessiner();
  }
  function preparerSuivante() {
    const suivante = App.etat.annee + 1;
    const existant = App.etat.plans[suivante];
    if (existant && existant.objets.length && !confirm(`Le plan ${suivante} existe déjà. Le remplacer par les structures de ${App.etat.annee} ?`)) return;
    const garder = App.plan().objets.filter((o) => o.t !== 'plante' || (PLANTES_PAR_ID[o.pid] || {}).per);
    App.etat.plans[suivante] = { objets: garder.map((o) => ({ ...o, id: uid(), debut: undefined })) };
    App.etat.annee = suivante;
    ed.sel = null;
    enregistrer();
    App.rendre();
    App.toast(`Plan ${suivante} créé : structures et vivaces reprises. Les zones hachurées t'indiqueront la rotation.`);
  }

  // ---------- Panneau de propriétés ----------
  function rendrePanneau() {
    if (!panneau) return;
    const o = ed.sel && trouver(ed.sel);
    panneau.replaceChildren(o ? (o.t === 'plante' ? panneauPlante(o) : panneauStructure(o)) : panneauResume());
  }

  const champDim = (o, cle, label) => h('label', { class: 'champ' }, label,
    h('input', { type: 'number', min: 5, step: 5, value: Math.round(o[cle] * 100), disabled: o.verrou,
      onchange: (e) => { o[cle] = Math.max(PAS, arrondi((+e.target.value || 5) / 100)); if (ROND.has(o.t)) { o.w = o.h = o[cle]; } enregistrer(); dessiner(); rendrePanneau(); } }),
    ' cm');

  function boutonsObjet(o) {
    return h('div', { class: 'boutons-objet' },
      h('button', { class: 'bouton petit', onclick: () => { o.verrou = !o.verrou; enregistrer(); rendrePanneau(); dessiner(); } }, o.verrou ? '🔓 Déverrouiller' : '🔒 Verrouiller'),
      h('button', { class: 'bouton petit', onclick: () => deplacerOrdre(o, true) }, '⬆️ Devant'),
      h('button', { class: 'bouton petit', onclick: () => deplacerOrdre(o, false) }, '⬇️ Derrière'),
      h('button', { class: 'bouton petit', onclick: () => dupliquer(o) }, '⧉ Dupliquer'),
      h('button', { class: 'bouton petit danger', onclick: () => supprimer(o) }, '🗑️ Supprimer'));
  }

  function panneauStructure(o) {
    const abri = Calendrier.ABRIS[o.t];
    return h('div', {},
      h('h3', {}, NOM_TYPE[o.t]),
      h('label', { class: 'champ' }, 'Nom',
        h('input', { type: 'text', value: o.nom || '', placeholder: 'ex. Bac 1', onchange: (e) => { o.nom = e.target.value.trim(); enregistrer(); dessiner(); } })),
      h('div', { class: 'deux-colonnes' }, champDim(o, 'w', 'Largeur'), ROND.has(o.t) ? null : champDim(o, 'h', 'Profondeur')),
      champRotation(o),
      abri ? h('p', { class: 'note' }, `Les cultures placées dedans gagnent environ ${abri} semaines au printemps comme à l'automne : leurs dates sont avancées et prolongées d'autant.`) : null,
      o.t === 'arbre' ? champEssence(o) : null,
      Soleil.OBSTACLES[o.t] ? h('label', { class: 'champ' }, o.t === 'batiment' ? 'Hauteur au faîtage (m)' : 'Hauteur (m)',
        h('input', { type: 'number', min: 0.2, max: 60, step: 0.1, value: o.hauteur ?? hauteurParDefaut(o), onchange: (e) => { o.hauteur = Math.max(0.2, +e.target.value || 1); enregistrer(); dessiner(); rendrePanneau(); } })) : null,
      o.t === 'haie' ? h('label', { class: 'radio' }, h('input', { type: 'checkbox', checked: !!o.caduc, onchange: (e) => { o.caduc = e.target.checked; enregistrer(); dessiner(); } }),
        ' Haie qui perd ses feuilles en hiver (charme, noisetier…)') : null,
      o.t === 'cloture' ? h('p', { class: 'note' }, 'Grillage, lattes espacées, claustra : laisse passer environ deux tiers du soleil. Pour une palissade pleine, utilise « Mur / clôture pleine ».') : null,
      o.t === 'batiment' ? h('p', { class: 'note' }, "Indique la hauteur du point le plus haut du toit. Utilise la poignée ronde ou « Aligner sur la parcelle » pour l'orienter comme sur la photo aérienne.") : null,
      Soleil.OBSTACLES[o.t] ? h('button', { class: 'bouton petit', onclick: () => Terrain.calculerSoleil() }, '☀️ Recalculer l\'ensoleillement') : null,
      boutonsObjet(o));
  }

  const hauteurParDefaut = (o) => (o.t === 'arbre' ? Soleil.essenceDe(o).h : Soleil.OBSTACLES[o.t]);
  function champEssence(o) {
    const e = Soleil.essenceDe(o);
    const caducs = Object.entries(Soleil.ESSENCES).filter(([, x]) => x.caduc), persistants = Object.entries(Soleil.ESSENCES).filter(([, x]) => !x.caduc);
    const choix = o.essence || (o.caduc ? 'autre_caduc' : 'autre_persistant');
    const mois = (m) => MOIS_LONGS[m];
    return h('div', {},
      h('label', { class: 'champ' }, 'Essence',
        h('select', { onchange: (ev) => {
          o.essence = ev.target.value;
          o.caduc = Soleil.ESSENCES[o.essence].caduc;
          enregistrer(); dessiner(); rendrePanneau();
        } },
          h('optgroup', { label: 'Perd ses feuilles en hiver' }, caducs.map(([k, x]) => h('option', { value: k, selected: k === choix }, x.n))),
          h('optgroup', { label: 'Garde ses feuilles toute l\'année' }, persistants.map(([k, x]) => h('option', { value: k, selected: k === choix }, x.n))))),
      h('p', { class: 'note' }, e.caduc
        ? `Feuillage ${/^[aeiouo]/.test(mois(e.feuilles[0])) ? "d'" : 'de '}${mois(e.feuilles[0])} à ${mois(e.feuilles[1])} : arrête environ ${Math.round(e.ete * 100)} % du soleil, puis ${Math.round(e.hiver * 100)} % une fois nu (branches seules).`
        : `Feuillage toute l'année : arrête environ ${Math.round(e.ete * 100)} % du soleil.`,
        ` Taille habituelle : ${e.h} m de haut, couronne de ${e.d} m. `,
        h('button', { class: 'lien', onclick: () => { o.hauteur = e.h; const [cx, cy] = G.centre(o); o.w = o.h = e.d; o.x = arrondi(cx - e.d / 2); o.y = arrondi(cy - e.d / 2); enregistrer(); dessiner(); rendrePanneau(); } }, 'Appliquer cette taille')));
  }

  function panneauPlante(o) {
    const p = PLANTES_PAR_ID[o.pid];
    const objs = objets();
    const abri = App.abriDe(o, objs);
    const decal = abri ? Calendrier.ABRIS[abri.t] : 0;
    const segs = Calendrier.fenetres(p, App.ctx, App.etat.annee, decal);
    const voisins = App.voisins(o, objs);
    const rotation = App.rotation(o);
    const graines = App.grainesDe(p.id);
    const occ = App.occupation(o, objs);

    return h('div', {},
      h('div', { class: 'titre-plante' }, App.icone(p, '1.8em'), h('div', {}, h('h3', {}, p.n), h('div', { class: 'latin' }, p.l))),
      h('button', { class: 'lien', onclick: () => Vues.fichePlante(p.id) }, 'Voir la fiche complète →'),
      h('div', { class: 'deux-colonnes' }, champDim(o, 'w', 'Largeur'), champDim(o, 'h', 'Profondeur')),
      champRotation(o),
      h('label', { class: 'champ' }, 'Disposition',
        h('select', { onchange: (e) => { o.mode = e.target.value; enregistrer(); dessiner(); rendrePanneau(); } },
          h('option', { value: 'bloc', selected: o.mode !== 'rangs' }, `En carré (${p.esp[0]} cm entre plants)`),
          h('option', { value: 'rangs', selected: o.mode === 'rangs' }, `En rangs (${p.esp[0]} cm × ${p.esp[1]} cm)`))),
      h('p', { class: 'grand-chiffre' }, `${App.nbPlants(o)} plant${App.nbPlants(o) > 1 ? 's' : ''}`),
      graines.length
        ? h('label', { class: 'champ' }, 'Graines utilisées',
          h('select', { onchange: (e) => { o.graineId = e.target.value || undefined; enregistrer(); } },
            h('option', { value: '' }, '—'),
            graines.map((g) => h('option', { value: g.id, selected: o.graineId === g.id }, `${g.variete || p.n}${g.annee ? ' (' + g.annee + ')' : ''}`))))
        : (p.achat || 'graine') === 'graine' ? h('p', { class: 'note' }, "Tu n'as pas de graines de cette plante dans ton stock.") : null,

      h('h4', {}, `Dates ${App.etat.annee}`, abri ? ` · ${NOM_TYPE[abri.t].toLowerCase()} (+${decal} sem.)` : ''),
      h('ul', { class: 'liste-dates' },
        segs.map((s) => h('li', {}, h('span', { class: 'pastille', style: { background: Calendrier.couleur(s.type, p) } }),
          `${Calendrier.libelle(s.type, p)} : ${fmtDate(s.debut)} → ${fmtDate(s.fin)}${s.fin.getFullYear() > App.etat.annee ? ' (' + s.fin.getFullYear() + ')' : ''}`))),
      p.per ? null : h('label', { class: 'champ' }, 'Mise en place (si différente)',
        h('input', { type: 'date', value: o.debut || '', onchange: (e) => { o.debut = e.target.value || undefined; enregistrer(); rendrePanneau(); dessiner(); } })),
      occ && !occ.vivace ? h('p', { class: 'note' }, `Occupe la place du ${fmtDate(occ.debut)} au ${fmtDate(occ.fin)} ; ensuite, elle est libre pour une autre culture (succession).`) : null,
      o.raison ? h('div', { class: 'raison-auto' }, h('strong', {}, '🪄 Placé ici car : '), o.raison) : null,
      Terrain.blocVerdict(p, o, objs, App.etat.annee) || (App.soleil ? null : h('p', { class: 'note' }, '☀️ Calcule l\'ensoleillement (bouton Soleil) pour savoir si cet endroit convient.')),

      rotation.length ? h('div', { class: 'alerte' }, h('strong', {}, '⚠️ Rotation : '),
        `${FAMILLES[p.fam].n.split(' (')[0]} déjà cultivées ici en `,
        [...new Set(rotation.map((r) => `${r.annee} (${r.plante.n})`))].join(', '),
        '. Mieux vaut attendre 3 ans pour limiter maladies et ravageurs du sol.') : null,

      voisins.length ? h('div', {}, h('h4', {}, 'Voisins'),
        h('ul', { class: 'liste-voisins' }, voisins.map((v) => h('li', { class: v.sens === '+' ? 'bon' : 'mauvais' },
          v.sens === '+' ? '✅ ' : '❌ ', h('strong', {}, PLANTES_PAR_ID[v.obj.pid].n), ` – ${v.note} `, h('span', { class: 'niveau niveau-' + v.niveau }, NIVEAUX[v.niveau]))))) : null,

      h('label', { class: 'champ' }, 'Notes',
        h('textarea', { rows: 2, onchange: (e) => { o.notes = e.target.value; enregistrer(); } }, o.notes || '')),
      boutonsObjet(o));
  }

  function panneauResume() {
    const plantes = objets().filter((o) => o.t === 'plante');
    const conflits = plantes.filter((o) => App.rotation(o).length).length;
    const parFamille = {};
    for (const o of plantes) { const f = PLANTES_PAR_ID[o.pid].fam; parFamille[f] = (parFamille[f] || 0) + 1; }
    return h('div', {},
      h('h3', {}, `Plan ${App.etat.annee}`),
      plantes.length ? h('p', {}, `${plantes.length} zone${plantes.length > 1 ? 's' : ''} de culture.`) : h('div', { class: 'demarrage' },
        h('p', {}, h('strong', {}, 'Pour commencer :')),
        h('ol', {},
          h('li', {}, 'Indique la taille de ton terrain en haut.'),
          h('li', {}, 'Ajoute des bacs, allées ou une serre (colonne de gauche).'),
          h('li', {}, 'Choisis une plante et trace sa zone dans un bac.'))),
      conflits ? h('div', { class: 'alerte' }, `⚠️ ${conflits} zone${conflits > 1 ? 's' : ''} ne respecte${conflits > 1 ? 'nt' : ''} pas la rotation.`) : null,
      h('div', { class: 'bloc-terrain' },
        h('h4', {}, 'Terrain et soleil'),
        App.etat.geo
          ? h('p', {}, '📍 ', App.etat.geo.parcelles.map((q) => `${q.commune} ${q.section.replace(/^0+/, '')} ${Number(q.numero)}`).join(', '),
            h('span', { class: 'sous' }, ` · ${App.etat.geo.parcelles.reduce((s, q) => s + (q.surface || 0), 0)} m²`))
          : h('p', { class: 'note' }, 'Importe ta parcelle cadastrale : le plan prend sa forme et son orientation réelles, et l\'app récupère les bâtiments et arbres voisins pour calculer les ombres.'),
        h('div', { class: 'boutons' },
          h('button', { class: 'bouton petit', onclick: () => Terrain.modalParcelle() }, App.etat.geo ? '📍 Changer de parcelle' : '📍 Importer ma parcelle'),
          h('button', { class: 'bouton petit', onclick: () => { ed.soleil = true; Terrain.calculerSoleil(); } }, App.soleil ? (Terrain.aJour() ? '☀️ Recalculer' : '☀️ Recalculer (obstacles modifiés)') : '☀️ Calculer l\'ensoleillement')),
        App.soleil ? h('p', { class: 'note' }, `Calculé le ${U.fmtDateLongue(new Date(App.soleil.calcule))} avec ${App.soleil.nbObstacles || 0} obstacle${App.soleil.nbObstacles > 1 ? 's' : ''} dessiné${App.soleil.nbObstacles > 1 ? 's' : ''}.`) : null,
        h('p', { class: 'note' }, "L'ombre vient uniquement de ce que tu dessines dans la section Ombre (bâtiments, murs, clôtures, haies, arbres), avec leur hauteur. Pense aussi aux bâtiments et grands arbres des voisins : tu peux les dessiner hors de ta parcelle."),
        h('button', { class: 'bouton petit primaire', onclick: () => Auto.ouvrir() }, '🪄 Arrangement automatique')),
      Object.keys(parFamille).length ? h('div', {}, h('h4', {}, 'Familles (rotation)'),
        h('ul', { class: 'legende' }, Object.entries(parFamille).map(([f, n]) =>
          h('li', {}, h('span', { class: 'pastille', style: { background: FAMILLES[f].c } }), `${FAMILLES[f].n} : ${n}`)))) : null,
      h('h4', {}, 'Raccourcis'),
      h('ul', { class: 'note' },
        h('li', {}, 'Suppr : supprimer'), h('li', {}, 'Ctrl + D : dupliquer'),
        h('li', {}, 'Flèches : déplacer de 5 cm (Maj : 50 cm)'), h('li', {}, 'R / Maj+R : tourner de 15°'), h('li', {}, 'Échap : outil sélection')));
  }

  const NIVEAUX = { etude: 'prouvé par des essais', pratique: 'raison pratique', tradition: 'tradition' };
  window.NIVEAUX = NIVEAUX;
})();
