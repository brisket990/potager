/* Arrangement automatique du potager.
 *
 * Place les cultures demandées dans les bacs, pots et abris du plan en tenant compte :
 *  - du soleil réellement reçu pendant la période où la plante en a besoin (contrainte forte) ;
 *  - de la rotation (pas la même famille au même endroit depuis moins de 3 ans) ;
 *  - des associations (prouvées > pratiques > traditionnelles) ;
 *  - de l'ombre des grandes plantes sur les petites (les grandes au nord) ;
 *  - du temps : une place libérée en juin peut accueillir une autre culture (succession).
 *
 * Méthode : placement glouton des cultures les plus exigeantes d'abord, puis améliorations
 * successives (on déplace chaque bloc à la meilleure place libre tant que le score progresse).
 */
(function () {
  const { h, fmtDate, isoDate, uid } = U;
  const PP = () => PLANTES_PAR_ID;
  const POIDS = { etude: 6, pratique: 4, tradition: 2 };
  const ECART_TEMPS = 7 * 86400000;
  // replaceChildren/append natifs écriraient « null » : on filtre les enfants absents.
  const remplacer = (el, ...enfants) => el.replaceChildren(...enfants.flat().filter((e) => e != null && e !== false));

  // ---------- Préparation ----------
  function zonesCultivables(objets) {
    const zones = [];
    const contenants = objets.filter((o) => o.t === 'bac' || o.t === 'pot');
    for (const o of contenants) zones.push(o);
    for (const o of objets) {
      if (!Calendrier.ABRIS[o.t]) continue;
      const contientBac = contenants.some((b) => G.dedans(G.centre(b), o));
      if (!contientBac) zones.push(o);
    }
    return zones.map((o) => {
      const m = o.t === 'bac' ? 0.05 : 0.02;
      return {
        obj: o, rond: o.t === 'pot', axe: o.w >= o.h ? 'x' : 'y', m,
        L: Math.max(o.w, o.h) - 2 * m, W: Math.min(o.w, o.h) - 2 * m,
        decal: Calendrier.ABRIS[o.t] || App.decalage(o, objets),
        nom: o.nom || (o.t === 'pot' ? 'pot' : o.t === 'bac' ? 'bac' : o.t),
      };
    });
  }

  // Rectangle d'un bloc placé à la position s (le long de la zone), dans le repère de la zone, pivoté comme elle.
  function rectDe(z, s, len) {
    const o = z.obj;
    if (z.rond) return { x: o.x, y: o.y, w: o.w, h: o.h };
    const r2 = (v) => Math.round(v * 100) / 100;
    const [lx, ly, w, h] = z.axe === 'x' ? [z.m + s, z.m, len, z.W] : [z.m, z.m + s, z.W, len];
    const [cx, cy] = G.versMonde(o, lx + w / 2, ly + h / 2);
    const r = { x: r2(cx - w / 2), y: r2(cy - h / 2), w: r2(w), h: r2(h) };
    if (o.rot) r.rot = o.rot;
    return r;
  }
  const chevauche = (a, b) => G.chevauche(a, b);
  const distance = (a, b) => G.distance(a, b);
  const tempsCommun = (a, b) => a.debut.getTime() < b.fin.getTime() + ECART_TEMPS && b.debut.getTime() < a.fin.getTime() + ECART_TEMPS;

  // ---------- Moteur ----------
  function arranger(demandes, options) {
    const annee = App.etat.annee;
    const objets = App.plan().objets;
    const zones = zonesCultivables(objets);
    let graine = options.graine || 1;
    const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };

    const cacheOcc = new Map(), cacheSegs = new Map(), cacheMen = new Map();
    const occ = (p, decal, debutForce) => {
      const k = `${p.id}|${decal}|${debutForce ? debutForce.getTime() : ''}`;
      if (!cacheOcc.has(k)) cacheOcc.set(k, Calendrier.occupation(p, App.ctx, annee, decal, debutForce));
      return cacheOcc.get(k);
    };
    const segs = (p, decal) => {
      const k = `${p.id}|${decal}`;
      if (!cacheSegs.has(k)) cacheSegs.set(k, Calendrier.fenetres(p, App.ctx, annee, decal));
      return cacheSegs.get(k);
    };
    const mensuel = (r) => {
      if (!App.soleil) return null;
      const k = `${r.x},${r.y},${r.w},${r.h}`;
      if (!cacheMen.has(k)) cacheMen.set(k, Soleil.mensuel(App.soleil, r));
      return cacheMen.get(k);
    };

    // Cultures déjà présentes et conservées : obstacles fixes dans l'espace et le temps.
    const fixes = [];
    if (options.garder) {
      for (const o of objets) {
        if (o.t !== 'plante' || !PP()[o.pid]) continue;
        const oc = App.occupation(o, objets, annee);
        if (oc) fixes.push({ p: PP()[o.pid], rect: { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot }, debut: oc.debut, fin: oc.fin, fixe: true });
      }
    }

    // Lots : une culture, ou plusieurs semis échelonnés.
    const lots = [];
    for (const { p, n } of demandes) {
      if (n <= 0) continue;
      const base = occ(p, 0, null);
      if (!base) { lots.push({ p, n, impossible: "pas de période de culture possible chez toi" }); continue; }
      if (options.echelonner && p.succ && !p.per && n >= 6) {
        const fen = segs(p, 0).filter((s) => s.type === 'sd' || s.type === 'pl');
        const finSemis = fen.length ? Math.max(...fen.map((s) => s.fin.getTime())) : base.debut.getTime();
        const dates = [0, 1, 2].map((i) => U.ajouterJours(base.debut, i * p.succ * 7)).filter((d) => d.getTime() <= finSemis);
        const parLot = Math.ceil(n / dates.length);
        dates.forEach((d, i) => lots.push({ p, n: parLot, debutForce: d, vague: dates.length > 1 ? i + 1 : 0 }));
      } else lots.push({ p, n });
    }

    const places = [];
    const nonPlaces = [];

    // Géométrie d'un lot dans une zone.
    function geometrie(lot, z) {
      const sp = lot.p.esp[0] / 100;
      if (z.rond) {
        if (sp > z.W * 1.25 || lot.p.h > 220) return null;
        const cap = Math.max(1, Math.floor(z.W / sp + 1e-4)) ** 2;
        return { len: z.W, parRang: 1, sp, cap };
      }
      const parRang = Math.max(1, Math.floor(z.W / sp + 1e-4));
      if (sp > z.W * 2) return null; // une citrouille ne tient pas dans une jardinière
      return { len: Math.ceil(lot.n / parRang) * sp, parRang, sp, cap: Infinity };
    }

    // Intervalles déjà pris sur l'axe d'une zone pendant une période donnée.
    function occupes(z, periode, sauf) {
      const res = [];
      for (const b of [...places, ...fixes]) {
        if (b === sauf || !tempsCommun(b, periode) || !chevauche(b.rect, z.obj)) continue;
        if (z.rond) { res.push([0, z.L]); continue; }
        // Étendue du bloc le long de la zone, dans le repère de la zone (même si le bloc est pivoté autrement).
        const le = G.coins(b.rect).map(([x, y]) => G.versLocal(z.obj, x, y)[z.axe === 'x' ? 0 : 1] - z.m);
        res.push([Math.min(...le), Math.max(...le)]);
      }
      return res.sort((u, v) => u[0] - v[0]);
    }

    function candidats(lot, sauf) {
      const res = [];
      for (const z of zones) {
        const g = geometrie(lot, z);
        if (!g) continue;
        const oc = occ(lot.p, z.decal, lot.debutForce || null);
        if (!oc) continue;
        const pris = occupes(z, oc, sauf);
        if (z.rond) {
          if (!pris.length) res.push({ z, s: 0, len: z.W, n: Math.min(lot.n, g.cap), oc, g });
          continue;
        }
        // Espaces libres le long de la zone.
        const libres = [];
        let curseur = 0;
        for (const [a, b] of pris) { if (a > curseur + 1e-6) libres.push([curseur, a]); curseur = Math.max(curseur, b); }
        if (z.L > curseur + 1e-6) libres.push([curseur, z.L]);
        for (const [a, b] of libres) {
          const place = b - a;
          if (place + 1e-6 >= g.len) {
            const starts = new Set([a, b - g.len]);
            for (let s = a + 0.5; s < b - g.len; s += 0.5) starts.add(s);
            for (const s of starts) res.push({ z, s: Math.round(s * 100) / 100, len: g.len, n: lot.n, oc, g });
          } else if (place >= g.sp - 1e-6) {
            const rangs = Math.floor(place / g.sp + 1e-4);
            res.push({ z, s: a, len: rangs * g.sp, n: Math.min(lot.n, rangs * g.parRang), oc, g, partiel: true });
          }
        }
      }
      return res;
    }

    // Score d'un bloc tout seul (soleil, rotation, bordure pour les vivaces).
    function scoreSeul(b, strict) {
      const p = b.p;
      let score = 0;
      const notes = [];
      const men = mensuel(b.rect);
      if (men) {
        const crit = Soleil.periodeCritique(p, b, segs(p, b.z.decal));
        const hres = crit ? Soleil.moyennePeriode(men, crit.debut, crit.fin) : 12;
        const deficit = p.soleil - hres;
        if (strict && deficit > 1.5) return { refuse: 'soleil' };
        score += deficit > 0 ? -12 * deficit : Math.min(-deficit, 3) * 1.5;
        if (p.ombreEte) { const ete = Math.max(men[5], men[6], men[7]); if (ete > 9) score -= (ete - 9) * 1.5; }
        b.soleil = hres; b.crit = crit;
        if (deficit > 0.5) notes.push('soleil');
      }
      const rot = App.rotation({ pid: p.id, ...b.rect }, annee);
      if (rot.length) { if (strict) return { refuse: 'rotation' }; score -= 40; notes.push('rotation'); }
      if (p.per && !b.z.rond && (b.s < 0.01 || b.s + b.len > b.z.L - 0.01)) score += 3;
      return { score, notes };
    }

    function scorePaire(b, c) {
      if (!tempsCommun(b, c)) return 0;
      const d = distance(b.rect, c.rect);
      let s = 0;
      if (d < 0.6) {
        for (const [, , sens, niveau] of App.associations(b.p.id, c.p.id)) s += (sens === '+' ? 1 : -1) * POIDS[niveau];
        if (b.p.fam === c.p.fam && b.p.id !== c.p.id) s += 0.5;
      }
      // Une grande plante fait de l'ombre à une petite placée au nord d'elle.
      const ombre = (grand, petit) => {
        if (grand.p.h < 120 || petit.p.h > grand.p.h * 0.6) return 0;
        const cyG = G.centre(grand.rect)[1], cyP = G.centre(petit.rect)[1];
        if (cyP >= cyG || distance(grand.rect, petit.rect) > grand.p.h / 100) return 0;
        const bg = G.boite(grand.rect), bp = G.boite(petit.rect);
        const recouvreX = bp.x < bg.x + bg.w + 0.5 && bp.x + bp.w > bg.x - 0.5;
        return recouvreX ? -(petit.p.soleil - 3) * 2 : 0;
      };
      return s + ombre(b, c) + ombre(c, b);
    }

    function evaluer(cand, lot, strict) {
      const b = { p: lot.p, lot, z: cand.z, s: cand.s, len: cand.len, n: cand.n, rect: rectDe(cand.z, cand.s, cand.len), debut: cand.oc.debut, fin: cand.oc.fin };
      const seul = scoreSeul(b, strict);
      if (seul.refuse) return { refuse: seul.refuse };
      let score = seul.score;
      for (const c of [...places, ...fixes]) score += scorePaire(b, c);
      score += (alea() - 0.5) * 0.4; // pour obtenir une autre proposition à chaque essai
      b.notes = seul.notes;
      return { b, score };
    }

    function meilleur(lot, sauf, strict, partielOk) {
      let best = null;
      const refus = new Set();
      for (const c of candidats(lot, sauf)) {
        if (c.partiel && !partielOk) continue;
        const r = evaluer(c, lot, strict);
        if (r.refuse) { refus.add(r.refuse); continue; }
        if (!best || r.score > best.score) best = r;
      }
      return { best, refus };
    }

    // 1. Placement glouton, les plus exigeants d'abord.
    const file = lots.filter((l) => !l.impossible).sort((a, b) =>
      (!!b.p.per - !!a.p.per) || (b.p.soleil - a.p.soleil) || (b.n * b.p.esp[0] ** 2 - a.n * a.p.esp[0] ** 2) || (b.p.h - a.p.h));
    for (const l of lots.filter((x) => x.impossible)) nonPlaces.push({ p: l.p, n: l.n, raison: l.impossible });
    let decoupes = 0;
    while (file.length) {
      const lot = file.shift();
      let r = meilleur(lot, null, true, false);
      let releche = false;
      if (!r.best) { const r2 = meilleur(lot, null, false, false); if (r2.best) { r = { best: r2.best, refus: r.refus }; releche = true; } }
      if (!r.best && decoupes < 40) {
        // Pas assez de place d'un seul tenant : on remplit le plus grand espace et on garde le reste pour plus loin.
        let rp = meilleur(lot, null, true, true);
        if (!rp.best) { rp = meilleur(lot, null, false, true); releche = !!rp.best; }
        if (rp.best && rp.best.b.n < lot.n) {
          decoupes++;
          file.unshift({ ...lot, n: lot.n - rp.best.b.n });
        }
        r = { best: rp.best, refus: new Set([...r.refus, ...rp.refus]) };
      }
      if (r.best) { r.best.b.releche = releche; places.push(r.best.b); }
      else nonPlaces.push({ p: lot.p, n: lot.n, raison: r.refus.has('soleil') ? "aucun endroit libre assez ensoleillé" : r.refus.has('rotation') ? 'seules des places en conflit de rotation restent libres' : 'plus de place libre pendant sa période de culture' });
    }

    // 2. Améliorations : chaque bloc essaie une meilleure place.
    for (let tour = 0; tour < 3; tour++) {
      let ameliore = false;
      for (const b of [...places]) {
        const lotSeul = { ...b.lot, n: b.n };
        places.splice(places.indexOf(b), 1);
        const actuel = evaluer({ z: b.z, s: b.s, len: b.len, n: b.n, oc: { debut: b.debut, fin: b.fin } }, lotSeul, false);
        const r = meilleur(lotSeul, null, !b.releche, false);
        if (r.best && r.best.b.n >= b.n && r.best.score > actuel.score + 0.5) { r.best.b.releche = b.releche; places.push(r.best.b); ameliore = true; }
        else places.push(b);
      }
      if (!ameliore) break;
    }

    // Explications.
    for (const b of places) {
      const parts = [];
      if (b.soleil != null) parts.push(`☀️ ${b.soleil.toFixed(1).replace('.', ',')} h de soleil par jour pendant ${b.crit ? b.crit.texte : 'la culture'} (besoin ${b.p.soleil} h)`);
      const amis = [...places, ...fixes].filter((c) => c !== b && tempsCommun(b, c) && distance(b.rect, c.rect) < 0.6 &&
        App.associations(b.p.id, c.p.id).some((a) => a[2] === '+')).map((c) => c.p.n);
      if (amis.length) parts.push(`🤝 près de ${[...new Set(amis)].join(', ')}`);
      if (Object.keys(App.etat.plans).some((a) => +a < annee && +a >= annee - 3) && !b.notes.includes('rotation')) parts.push(`🔄 pas de ${FAMILLES[b.p.fam].n.split(' (')[0].toLowerCase()} ici ces 3 dernières années`);
      if (b.z.decal) parts.push(`🏠 sous abri (+${b.z.decal} semaines)`);
      parts.push(`📅 en place du ${fmtDate(b.debut)} au ${fmtDate(b.fin)}`);
      if (b.lot.vague) parts.push(`semis échelonné n° ${b.lot.vague}`);
      if (b.notes.includes('soleil')) parts.push('⚠️ un peu moins de soleil que l\'idéal');
      if (b.notes.includes('rotation')) parts.push('⚠️ même famille ici il y a moins de 3 ans (faute d\'autre place)');
      b.raison = parts.join(' · ');
    }
    return { places, nonPlaces, zones: zones.length };
  }

  // ---------- Interface ----------
  function cfg() {
    const c = (App.etat.auto ||= { personnes: 2, quantites: {}, exclus: {}, extras: [], garder: true, echelonner: true });
    c.extras ||= []; c.quantites ||= {}; c.exclus ||= {};
    return c;
  }
  function plantesProposees() {
    const c = cfg();
    const ids = [...new Set([...App.etat.graines.map((g) => g.pid), ...c.extras])].filter((id) => PP()[id]);
    return ids.map((id) => PP()[id]).filter((p) => !(p.per && p.esp[0] >= 150)).sort((a, b) => a.n.localeCompare(b.n));
  }

  function ouvrir() {
    const zones = zonesCultivables(App.plan().objets);
    const corps = h('div', { class: 'auto' });
    const fermer = App.modal('🪄 Arrangement automatique', corps, true);
    if (!zones.length) {
      remplacer(corps, ...corps.childNodes, h('p', {}, "Dessine d'abord tes bacs, carrés, pots ou ta serre sur le plan : l'arrangement automatique les remplit."),
        h('button', { class: 'bouton', onclick: fermer }, 'Compris'));
      return;
    }
    reglages(corps, fermer);
  }

  function reglages(corps, fermer) {
    const c = cfg();
    const plantes = plantesProposees();
    const lignes = h('tbody');
    const remplir = () => lignes.replaceChildren(...plantes.map((p) => {
      const enStock = App.grainesDe(p.id).length > 0;
      const q = c.quantites[p.id] ?? (quantiteConseillee(p, c.personnes) || 4);
      return h('tr', { class: c.exclus[p.id] ? 'exclu' : '' },
        h('td', {}, h('input', { type: 'checkbox', checked: !c.exclus[p.id], 'aria-label': `Inclure ${p.n}`, onchange: (e) => { c.exclus[p.id] = !e.target.checked; App.sauver(); e.target.closest('tr').className = c.exclus[p.id] ? 'exclu' : ''; } })),
        h('td', {}, App.icone(p), ' ', p.n, enStock ? null : h('span', { class: 'badge-abri' }, 'à acheter')),
        h('td', {}, h('input', { type: 'number', min: 0, class: 'cellule num', value: q, 'aria-label': `Nombre de plants de ${p.n}`, onchange: (e) => { c.quantites[p.id] = Math.max(0, +e.target.value || 0); App.sauver(); } })),
        h('td', { class: 'sous' }, `${p.soleil} h de soleil${p.ombreEte ? ', mi-ombre l\'été' : ''}`));
    }));
    remplir();
    const ajout = h('select', { 'aria-label': 'Ajouter une plante', onchange: (e) => {
      if (!e.target.value) return;
      c.extras.push(e.target.value); App.sauver(); remplacer(corps); reglages(corps, fermer);
    } }, h('option', { value: '' }, '➕ Ajouter une plante (à acheter)…'),
      PLANTES.filter((p) => !plantes.includes(p) && !(p.per && p.esp[0] >= 150)).map((p) => h('option', { value: p.id }, p.n)));

    remplacer(corps, ...corps.childNodes, 
      h('p', { class: 'note' }, "L'app place tes cultures dans les bacs, pots et abris du plan selon le soleil réellement reçu, la rotation, les associations et le calendrier. Tu pourras tout ajuster ensuite, ou annuler."),
      !App.soleil ? h('div', { class: 'alerte chaud' }, "☀️ Pas encore de carte d'ensoleillement : l'arrangement supposera du soleil partout. ",
        h('button', { class: 'lien', onclick: () => { fermer(); Terrain.calculerSoleil(); } }, 'Calculer le soleil d\'abord')) : null,
      h('div', { class: 'ligne-champ aligne' },
        h('label', { class: 'champ-ligne' }, 'Personnes au foyer ', h('input', { type: 'number', min: 1, max: 20, class: 'num', value: c.personnes,
          onchange: (e) => { c.personnes = Math.max(1, +e.target.value || 1); c.quantites = {}; App.sauver(); remplir(); } })),
        h('button', { class: 'lien', onclick: () => { c.quantites = {}; App.sauver(); remplir(); } }, 'Quantités conseillées')),
      plantes.length ? h('div', { class: 'tableau-defile hauteur-limitee' }, h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Plante'), h('th', {}, 'Plants'), h('th', {}, 'Besoin'))), lignes))
        : h('p', { class: 'vide' }, "Ton stock de graines est vide : ajoute des graines dans « Mes graines » ou des plantes ci-dessous."),
      ajout,
      h('label', { class: 'radio' }, h('input', { type: 'checkbox', checked: c.garder, onchange: (e) => { c.garder = e.target.checked; App.sauver(); } }), ' Garder les cultures déjà placées sur le plan (l\'app arrange autour)'),
      h('label', { class: 'radio' }, h('input', { type: 'checkbox', checked: c.echelonner, onchange: (e) => { c.echelonner = e.target.checked; App.sauver(); } }), ' Semis échelonnés pour laitues, radis, haricots… (plusieurs petites vagues)'),
      h('div', { class: 'boutons' }, h('button', { class: 'bouton primaire', onclick: () => lancer(corps, fermer, 1) }, 'Calculer la proposition')));
  }

  function demandesActuelles() {
    const c = cfg();
    return plantesProposees().filter((p) => !c.exclus[p.id]).map((p) => ({ p, n: c.quantites[p.id] ?? (quantiteConseillee(p, c.personnes) || 4) }));
  }

  async function lancer(corps, fermer, graine) {
    remplacer(corps, h('p', {}, '⏳ Calcul en cours…'));
    await new Promise((ok) => setTimeout(ok, 30));
    const c = cfg();
    let res;
    try { res = arranger(demandesActuelles(), { garder: c.garder, echelonner: c.echelonner, graine }); } catch (e) {
      console.error(e);
      remplacer(corps, h('div', { class: 'alerte' }, 'Erreur pendant le calcul : ' + e.message), h('button', { class: 'bouton', onclick: () => { remplacer(corps); reglages(corps, fermer); } }, 'Retour'));
      return;
    }
    const parPlante = {};
    for (const b of res.places) {
      const e = (parPlante[b.p.id] ||= { p: b.p, n: 0, blocs: 0, alerte: false });
      e.n += b.n; e.blocs++; if (b.notes.length) e.alerte = true;
    }
    const demandees = Object.fromEntries(demandesActuelles().map((d) => [d.p.id, d.n]));
    remplacer(corps, 
      h('h3', {}, `${res.places.length} zones proposées`),
      h('ul', { class: 'liste-simple' }, Object.values(parPlante).sort((a, b) => a.p.n.localeCompare(b.p.n)).map((e) =>
        h('li', {}, App.icone(e.p), ` ${e.p.n} : ${e.n} plant${e.n > 1 ? 's' : ''}`, e.n < (demandees[e.p.id] || 0) ? h('span', { class: 'sous' }, ` sur ${demandees[e.p.id]} demandés`) : null,
          e.blocs > 1 ? h('span', { class: 'sous' }, ` en ${e.blocs} zones`) : null, e.alerte ? ' ⚠️' : null))),
      res.nonPlaces.length ? h('div', { class: 'alerte chaud' }, h('strong', {}, 'Pas placé : '),
        h('ul', { class: 'liste-simple' }, res.nonPlaces.map((x) => h('li', {}, `${x.p.n} (${x.n} plants) – ${x.raison}`)))) : null,
      h('p', { class: 'note' }, 'Clique sur une zone du plan pour voir pourquoi elle a été placée là. ⚠️ = compromis (un peu moins de soleil ou rotation imparfaite).'),
      h('div', { class: 'boutons' },
        h('button', { class: 'bouton primaire', onclick: () => { appliquer(res, c.garder); fermer(); } }, 'Appliquer au plan'),
        h('button', { class: 'bouton', onclick: () => lancer(corps, fermer, graine + 7919) }, '🔀 Autre proposition'),
        h('button', { class: 'bouton', onclick: () => { remplacer(corps); reglages(corps, fermer); } }, 'Modifier les réglages')));
  }

  function appliquer(res, garder) {
    const plan = App.plan();
    const avant = JSON.parse(JSON.stringify(plan.objets));
    if (!garder) plan.objets = plan.objets.filter((o) => o.t !== 'plante' || o.verrou);
    for (const b of res.places) {
      const graines = App.grainesDe(b.p.id).slice().sort((a, c) => (a.annee || 9999) - (c.annee || 9999));
      plan.objets.push({
        id: uid(), t: 'plante', pid: b.p.id, ...b.rect, mode: 'bloc', auto: true, raison: b.raison,
        debut: b.lot.debutForce ? isoDate(b.lot.debutForce) : undefined,
        graineId: graines[0] ? graines[0].id : undefined,
      });
    }
    App.sauver();
    App.rendre();
    App.toast(`${res.places.length} zones de culture ajoutées au plan.`, false, {
      label: 'Annuler', fn: () => { App.plan().objets = avant; App.sauver(); App.rendre(); },
    });
  }

  window.Auto = { ouvrir, arranger, zonesCultivables };
})();
