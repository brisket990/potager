/* Onglets : Maintenant, Mes graines, Calendrier, Plantes, Achats, Journal, Réglages. */
(function () {
  const { h, fmtDate, fmtDateLongue, periode, ajouterJours, aujourdhui, isoDate, lireIso, normaliser, uid, MOIS, MOIS_LONGS, jourDeLAnnee } = U;
  const PP = () => PLANTES_PAR_ID;
  const JOURS_SEM = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const SEMIS = new Set(['si', 'sd', 'sa']);

  // ---------- Outils communs ----------
  function datesGelAnnee(annee = new Date().getFullYear()) {
    return { dg: U.dateDuJour(annee, App.ctx.dg), pg: U.dateDuJour(annee, App.ctx.pg) };
  }
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

  // Ce qu'il faut faire pour une plante entre deux dates, avec les ajustements météo du moment.
  function conseilsMeteo(p, type, m) {
    if (!m) return null;
    if (type === 'sd' && m.sol != null && m.sol < p.sol) return `sol encore à ${m.sol} °C (il faut ${p.sol} °C) : attends quelques jours`;
    if (type === 'sd' && m.sol != null && m.sol >= p.sol) return `sol à ${m.sol} °C : c'est bon`;
    if (type === 'pl' && p.gel === 'tendre' && m.gels.length) return `gel annoncé le ${fmtDate(lireIso(m.gels[0].date))} : attends ou protège`;
    return null;
  }

  function tachesPlan(debut, fin) {
    const res = [];
    const vus = new Set();
    const anneeCivile = debut.getFullYear();
    for (const annee of [anneeCivile, anneeCivile + 1]) {
      const plan = App.etat.plans[annee];
      if (!plan) continue;
      for (const o of plan.objets) {
        if (o.t !== 'plante') continue;
        const p = PP()[o.pid];
        if (!p) continue;
        const decal = App.decalage(o, plan.objets);
        for (const s of Calendrier.fenetres(p, App.ctx, annee, decal)) {
          if (s.fin < debut || s.debut > fin) continue;
          const cle = `${p.id}|${s.type}|${decal}`;
          if (vus.has(cle)) continue;
          vus.add(cle);
          res.push({ p, s, decal, annee, nb: App.nbPlants(o) });
        }
      }
    }
    const ordre = { si: 0, sd: 1, sa: 1, pl: 2, rec: 3 };
    return res.sort((a, b) => ordre[a.s.type] - ordre[b.s.type] || a.s.debut - b.s.debut);
  }

  // Prochaine action de semis/plantation pour une graine.
  function statutSemis(p) {
    const ajd = aujourdhui();
    const segs = Calendrier.actions(p, App.ctx, ajd, ajouterJours(ajd, 365))
      .filter((s) => SEMIS.has(s.type) || (s.type === 'pl' && (p.achat || 'graine') !== 'graine'))
      .sort((a, b) => a.debut - b.debut);
    const maintenant = segs.filter((s) => s.debut <= ajouterJours(ajd, 14) && s.fin >= ajd);
    const prochain = segs.find((s) => s.debut > ajouterJours(ajd, 14));
    return { maintenant, prochain };
  }

  function ligneTache(t, m) {
    const { p, s } = t;
    const libelle = Calendrier.libelle(s.type, p);
    const conseil = conseilsMeteo(p, s.type, m);
    const quand = s.debut <= aujourdhui() ? `jusqu'au ${fmtDate(s.fin)}` : `à partir du ${fmtDate(s.debut)}`;
    return h('li', { class: 'tache' },
      h('span', { class: 'pastille', style: { background: Calendrier.couleur(s.type, p) } }),
      App.icone(p),
      h('div', {},
        h('div', {}, h('strong', {}, `${libelle} – ${p.n}`), t.decal ? h('span', { class: 'badge-abri' }, `sous abri`) : null),
        h('div', { class: 'sous' }, quand, t.nb ? ` · ${t.nb} plant${t.nb > 1 ? 's' : ''}` : ''),
        conseil ? h('div', { class: 'conseil-meteo' }, '🌡️ ', conseil) : null));
  }

  function barreAnnee(segs, annee, p, avecMois = false) {
    const total = (new Date(annee, 11, 31) - new Date(annee, 0, 1)) / U.JOUR + 1;
    const pos = (d) => ((d - new Date(annee, 0, 1)) / U.JOUR / total) * 100;
    const ajd = aujourdhui();
    return h('div', { class: 'barre-annee' },
      avecMois ? MOIS.map((m, i) => h('span', { class: 'repere-mois', style: { left: pos(new Date(annee, i, 1)) + '%' } }, m)) : null,
      segs.map((s) => h('span', {
        class: 'seg', title: `${Calendrier.libelle(s.type, p)} : ${fmtDate(s.debut)} → ${fmtDate(s.fin)}`,
        style: { left: pos(s.debut) + '%', width: Math.max(0.6, pos(s.fin) - pos(s.debut) + 100 / total) + '%', background: Calendrier.couleur(s.type, p), top: s.type === 'rec' ? '55%' : '8%' },
      })),
      ajd.getFullYear() === annee ? h('span', { class: 'ligne-ajd', style: { left: pos(ajd) + '%' }, title: "Aujourd'hui" }) : null);
  }

  function legende(fleurs = true) {
    const items = [['si', "Semis à l'abri"], ['sd', 'Semis en place'], ['sa', 'Semis de fin de saison'], ['pl', 'Plantation'], ['rec', 'Récolte']];
    return h('ul', { class: 'legende ligne' },
      items.map(([t, n]) => h('li', {}, h('span', { class: 'pastille', style: { background: Calendrier.TYPES[t].c } }), n)),
      fleurs ? h('li', {}, h('span', { class: 'pastille', style: { background: '#d45a9a' } }), 'Floraison') : null);
  }

  function choixLieu(apres) {
    const resultats = h('ul', { class: 'resultats-lieu' });
    const champ = h('input', { type: 'search', placeholder: 'Nom de ta commune…', 'aria-label': 'Commune' });
    const chercher = async () => {
      if (!champ.value.trim()) return;
      resultats.replaceChildren(h('li', { class: 'note' }, 'Recherche…'));
      try {
        const r = await Climat.chercherCommune(champ.value.trim());
        resultats.replaceChildren(...(r.length ? r.map((x) => h('li', {},
          h('button', { class: 'lien', onclick: async () => { await App.definirLieu({ nom: x.nom, detail: x.detail, lat: x.lat, lon: x.lon }); apres && apres(); } },
            h('strong', {}, x.nom), ` – ${x.detail}`, x.elev != null ? ` (${Math.round(x.elev)} m)` : ''))) : [h('li', { class: 'note' }, 'Aucune commune trouvée.')]));
      } catch (e) { resultats.replaceChildren(h('li', { class: 'alerte' }, e.message)); }
    };
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') chercher(); });
    return h('div', { class: 'choix-lieu' },
      h('button', { class: 'bouton primaire', onclick: async (e) => {
        e.target.disabled = true; e.target.textContent = 'Localisation…';
        try {
          const pos = await Climat.geolocaliser();
          await App.definirLieu({ nom: 'Ma position', detail: `${pos.lat}, ${pos.lon}`, ...pos });
          apres && apres();
        } catch (err) { App.toast(err.message + ' Cherche plutôt ta commune.', true); e.target.disabled = false; e.target.textContent = '📍 Utiliser ma position GPS'; }
      } }, '📍 Utiliser ma position GPS'),
      h('div', { class: 'ou' }, 'ou'),
      h('div', { class: 'ligne-champ' }, champ, h('button', { class: 'bouton', onclick: chercher }, 'Chercher')),
      resultats);
  }

  // ---------- Maintenant ----------
  Vues.maintenant = function () {
    const ajd = aujourdhui();
    const m = meteoProche();
    const cartes = [];

    if (!App.etat.lieu) {
      cartes.push(h('section', { class: 'carte large accent' },
        h('h2', {}, '📍 Où est ton potager ?'),
        h('p', {}, "Ta position sert à calculer tes vraies dates de gelée et la température du sol à partir de 20 ans de météo, puis à te prévenir des gelées annoncées. En attendant, l'app utilise un climat type du centre-nord de la France."),
        choixLieu()));
    }
    if (App.erreurMeteo) cartes.push(h('div', { class: 'alerte large' }, '⚠️ ', App.erreurMeteo));

    // Climat local
    const { dg, pg } = datesGelAnnee();
    const js10 = Calendrier.jourSol(App.ctx, 10), js16 = Calendrier.jourSol(App.ctx, 16);
    cartes.push(h('section', { class: 'carte' },
      h('h2', {}, '🌡️ Mon climat'),
      App.climat.defaut ? h('p', { class: 'note' }, 'Climat type (lieu non défini).') :
        h('p', { class: 'note' }, `${App.etat.lieu.nom}${App.climat.elev != null ? ` · ${Math.round(App.climat.elev)} m` : ''} · moyennes ${App.climat.periode[0]}–${App.climat.periode[1]}`),
      h('dl', { class: 'faits' },
        h('dt', {}, 'Dernière gelée'), h('dd', {}, periode(dg), h('span', { class: 'sous' }, ` (${fmtDate(dg)})`)),
        h('dt', {}, 'Première gelée'), h('dd', {}, periode(pg), h('span', { class: 'sous' }, ` (${fmtDate(pg)})`)),
        h('dt', {}, 'Saison sans gel'), h('dd', {}, `${Math.round((pg - dg) / U.JOUR)} jours`),
        h('dt', {}, 'Sol à 10 °C'), h('dd', {}, js10 ? periode(U.dateDuJour(ajd.getFullYear(), js10)) : '–'),
        h('dt', {}, 'Sol à 16 °C'), h('dd', {}, js16 ? periode(U.dateDuJour(ajd.getFullYear(), js16)) : 'jamais en moyenne')),
      h('p', { class: 'note' }, `Prudence : ${Math.round(App.etat.risque * 100)} % des années sans gel après la date indiquée. `,
        h('button', { class: 'lien', onclick: () => App.aller('reglages') }, 'Modifier'))));

    // Météo
    if (m) {
      cartes.push(h('section', { class: 'carte' },
        h('h2', {}, '☁️ Météo des prochains jours'),
        m.sol != null ? h('p', {}, `Sol (6 cm) : `, h('strong', {}, `${m.sol} °C`), ' en moyenne sur 3 jours') : null,
        m.gels.length ? h('div', { class: 'alerte' }, `❄️ Gel annoncé : ${m.gels.map((j) => `${JOURS_SEM[lireIso(j.date).getDay()]} ${lireIso(j.date).getDate()} (${j.tmin} °C)`).join(', ')}. Rentre ou protège les plantes gélives.`) : null,
        m.chaleur.length ? h('div', { class: 'alerte chaud' }, `🔥 Chaleur : ${m.chaleur.map((j) => `${JOURS_SEM[lireIso(j.date).getDay()]} ${lireIso(j.date).getDate()} (${j.tmax} °C)`).join(', ')}. Arrose le soir et paille le sol.`) : null,
        h('div', { class: 'previsions' }, m.jours.slice(0, 7).map((j) => {
          const d = lireIso(j.date); const [ic, lib] = Climat.meteo(j.code);
          return h('div', { class: 'jour' + (j.tmin <= 0.5 ? ' gel' : '') },
            h('div', { class: 'jour-nom' }, `${JOURS_SEM[d.getDay()]} ${d.getDate()}`),
            h('div', { class: 'jour-ic', title: lib, 'aria-label': lib }, ic),
            h('div', {}, h('span', { class: 'tmax' }, `${Math.round(j.tmax)}°`), ' ', h('span', { class: 'tmin' }, `${Math.round(j.tmin)}°`)),
            j.pluie > 0.2 ? h('div', { class: 'pluie' }, `${j.pluie.toFixed(1)} mm`) : h('div', { class: 'pluie' }, ' '));
        }))));
    }

    // Tâches du plan
    const taches = tachesPlan(ajd, ajouterJours(ajd, 14));
    cartes.push(h('section', { class: 'carte' },
      h('h2', {}, '✅ À faire ces 2 semaines (mon plan)'),
      taches.length ? h('ul', { class: 'taches' }, taches.map((t) => ligneTache(t, m)))
        : h('p', { class: 'vide' }, Object.values(App.etat.plans).some((p) => p.objets.some((o) => o.t === 'plante'))
          ? 'Rien de prévu dans ton plan pour les 2 prochaines semaines.'
          : h('span', {}, 'Ton plan est vide. ', h('button', { class: 'lien', onclick: () => App.aller('plan') }, 'Dessiner mon potager →')))));

    // Avec mes graines
    const parPlante = new Map();
    for (const g of App.etat.graines) if (PP()[g.pid] && !parPlante.has(g.pid)) parPlante.set(g.pid, g);
    const maintenant = [], bientot = [];
    for (const pid of parPlante.keys()) {
      const p = PP()[pid];
      const st = statutSemis(p);
      for (const s of st.maintenant) maintenant.push({ p, s, decal: 0 });
      if (!st.maintenant.length && st.prochain) bientot.push({ p, s: st.prochain });
    }
    maintenant.sort((a, b) => a.s.fin - b.s.fin);
    bientot.sort((a, b) => a.s.debut - b.s.debut);
    bientot.splice(6);
    cartes.push(h('section', { class: 'carte' },
      h('h2', {}, '🌰 Avec mes graines'),
      !parPlante.size ? h('p', { class: 'vide' }, "Ajoute tes graines pour savoir quoi semer et quand. ", h('button', { class: 'lien', onclick: () => App.aller('graines') }, 'Mes graines →')) : [
        h('h3', {}, 'À semer ou planter maintenant'),
        maintenant.length ? h('ul', { class: 'taches' }, maintenant.map((t) => ligneTache(t, m))) : h('p', { class: 'vide' }, 'Rien en ce moment.'),
        bientot.length ? [h('h3', {}, 'Prochains semis'), h('ul', { class: 'liste-simple' }, bientot.map(({ p, s }) =>
          h('li', {}, App.icone(p), ` ${p.n} – ${Calendrier.libelle(s.type, p).toLowerCase()} à partir du ${fmtDate(s.debut)}`)))] : null,
      ]));

    return h('div', { class: 'grille-cartes' }, cartes);
  };

  // ---------- Mes graines ----------
  const gr = { recherche: '', apercu: null };

  Vues.graines = function () {
    const ajd = aujourdhui();
    const lignes = App.etat.graines
      .filter((g) => !gr.recherche || normaliser(`${(PP()[g.pid] || {}).n || ''} ${g.variete || ''} ${g.texte || ''}`).includes(normaliser(gr.recherche)))
      .map((g) => {
        const p = PP()[g.pid];
        const st = p ? statutSemis(p) : null;
        const rang = !st ? 9 : st.maintenant.length ? 0 : st.prochain ? 1 + (st.prochain.debut - ajd) / U.JOUR / 1000 : 5;
        return { g, p, st, rang };
      })
      .sort((a, b) => a.rang - b.rang || (a.p ? a.p.n : 'zzz').localeCompare(b.p ? b.p.n : 'zzz'));

    const listePlantes = h('datalist', { id: 'dl-plantes' }, PLANTES.map((p) => h('option', { value: p.n })));
    const fPlante = h('input', { list: 'dl-plantes', placeholder: 'Plante (ex. Tomate)', required: true, 'aria-label': 'Plante' });
    const fVariete = h('input', { placeholder: 'Variété (ex. Cœur de bœuf)', 'aria-label': 'Variété' });
    const fAnnee = h('input', { type: 'number', min: 1990, max: 2100, placeholder: 'Année', class: 'num', 'aria-label': 'Année du sachet' });
    const fQte = h('input', { placeholder: 'Quantité (ex. 1 sachet)', 'aria-label': 'Quantité' });
    const ajouter = (e) => {
      e.preventDefault();
      const p = PLANTES.find((x) => normaliser(x.n) === normaliser(fPlante.value)) || PP()[(App.reconnaitre(fPlante.value) || {}).pid];
      if (!p) { App.toast('Plante non reconnue : choisis-la dans la liste.', true); return; }
      App.changer((s) => s.graines.push({ id: uid(), pid: p.id, variete: fVariete.value.trim(), annee: +fAnnee.value || null, quantite: fQte.value.trim() }));
      App.toast(`${p.n} ajouté.`);
    };

    const zoneImport = h('textarea', { rows: 6, placeholder: 'Une graine par ligne, par exemple :\nTomate Cœur de bœuf 2024\nCarottes Nantaise 2023\nCapucine naine\nHaricot vert Contender 2022', 'aria-label': 'Liste de graines à importer' });

    return h('div', { class: 'page' },
      h('div', { class: 'page-tete' }, h('h1', {}, '🌰 Mes graines'),
        h('p', { class: 'note' }, "Note tes sachets : l'app te dit quand les semer chez toi, signale les graines trop vieilles et propose tes variétés dans le plan.")),
      h('div', { class: 'deux-blocs' },
        h('section', { class: 'carte' }, h('h2', {}, 'Ajouter une graine'),
          h('form', { class: 'form-graine', onsubmit: ajouter }, listePlantes, fPlante, fVariete, fAnnee, fQte, h('button', { class: 'bouton primaire', type: 'submit' }, 'Ajouter'))),
        h('section', { class: 'carte' }, h('h2', {}, 'Importer une liste'),
          h('p', { class: 'note' }, "Colle ta liste (depuis un tableur, une note…). L'app reconnaît la plante, la variété et l'année."),
          zoneImport,
          h('button', { class: 'bouton', onclick: () => { gr.apercu = zoneImport.value.split(/\r?\n/).map(App.reconnaitre).filter(Boolean).map((r) => ({ ...r, garder: true })); App.rendre(); } }, 'Analyser la liste'))),
      gr.apercu ? apercuImport() : null,
      h('section', { class: 'carte' },
        h('div', { class: 'tete-tableau' }, h('h2', {}, `Mon stock (${App.etat.graines.length})`),
          h('input', { type: 'search', placeholder: 'Filtrer…', value: gr.recherche, 'aria-label': 'Filtrer mes graines', oninput: (e) => { gr.recherche = e.target.value; const pos = e.target.selectionStart; App.rendre(); const c = document.querySelector('.tete-tableau input'); c.focus(); c.setSelectionRange(pos, pos); } }),
          h('button', { class: 'bouton petit', onclick: exporterCsv, disabled: !App.etat.graines.length }, '⬇️ Exporter (CSV)')),
        lignes.length ? h('div', { class: 'tableau-defile' }, h('table', { class: 'tableau' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Plante'), h('th', {}, 'Variété'), h('th', {}, 'Année'), h('th', {}, 'Quantité'), h('th', {}, 'Quand semer chez moi'), h('th', {}, 'Germination'), h('th', {}, ''))),
          h('tbody', {}, lignes.map(({ g, p, st }) => {
            const eg = App.etatGraine(g);
            return h('tr', {},
              h('td', {}, p ? h('button', { class: 'lien', onclick: () => Vues.fichePlante(p.id) }, App.icone(p), ' ', p.n) : h('select', { class: 'a-corriger', 'aria-label': 'Choisir la plante', onchange: (e) => App.changer(() => { g.pid = e.target.value; }) },
                h('option', { value: '' }, `❓ ${g.texte || 'Inconnue'}`), PLANTES.map((x) => h('option', { value: x.id }, x.n)))),
              h('td', {}, h('input', { class: 'cellule', value: g.variete || '', 'aria-label': 'Variété', onchange: (e) => App.changer(() => { g.variete = e.target.value.trim(); }, false) })),
              h('td', {}, h('input', { class: 'cellule num', type: 'number', value: g.annee || '', 'aria-label': 'Année', onchange: (e) => App.changer(() => { g.annee = +e.target.value || null; }) })),
              h('td', {}, h('input', { class: 'cellule', value: g.quantite || '', 'aria-label': 'Quantité', onchange: (e) => App.changer(() => { g.quantite = e.target.value.trim(); }, false) })),
              h('td', {}, !st ? '–' : st.maintenant.length
                ? h('span', { class: 'statut maintenant' }, st.maintenant.map((s) => `${Calendrier.libelle(s.type, p)} jusqu'au ${fmtDate(s.fin)}`).join(' · '))
                : st.prochain ? h('span', { class: 'statut' }, `${Calendrier.libelle(st.prochain.type, p)} à partir du ${fmtDate(st.prochain.debut)}`) : h('span', { class: 'statut' }, 'Pas de fenêtre chez toi')),
              h('td', {}, eg ? h('span', { class: 'germ germ-' + eg.niveau, title: eg.texte }, eg.niveau === 'ok' ? '✅' : eg.niveau === 'limite' ? '🟠' : '⚠️', ' ', eg.texte) : '–'),
              h('td', {}, h('button', { class: 'bouton-icone', 'aria-label': 'Supprimer', title: 'Supprimer', onclick: () => App.changer((s) => s.graines.splice(s.graines.indexOf(g), 1)) }, '🗑️')));
          })))) : h('p', { class: 'vide' }, App.etat.graines.length ? 'Aucune graine ne correspond au filtre.' : 'Aucune graine pour le moment.')));
  };

  function apercuImport() {
    const reconnues = gr.apercu.filter((r) => r.pid).length;
    return h('section', { class: 'carte accent' },
      h('h2', {}, `Aperçu de l'import : ${reconnues} / ${gr.apercu.length} reconnues`),
      h('div', { class: 'tableau-defile' }, h('table', { class: 'tableau' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Ligne'), h('th', {}, 'Plante'), h('th', {}, 'Variété'), h('th', {}, 'Année'))),
        h('tbody', {}, gr.apercu.map((r) => h('tr', { class: r.pid ? '' : 'inconnue' },
          h('td', {}, h('input', { type: 'checkbox', checked: r.garder, 'aria-label': 'Importer cette ligne', onchange: (e) => { r.garder = e.target.checked; } })),
          h('td', { class: 'sous' }, r.texte),
          h('td', {}, h('select', { 'aria-label': 'Plante', onchange: (e) => { r.pid = e.target.value || null; } },
            h('option', { value: '' }, '❓ À choisir'), PLANTES.map((p) => h('option', { value: p.id, selected: p.id === r.pid }, p.n)))),
          h('td', {}, h('input', { class: 'cellule', value: r.variete, 'aria-label': 'Variété', onchange: (e) => { r.variete = e.target.value; } })),
          h('td', {}, h('input', { class: 'cellule num', type: 'number', value: r.annee || '', 'aria-label': 'Année', onchange: (e) => { r.annee = +e.target.value || null; } }))))))),
      h('div', { class: 'boutons' },
        h('button', { class: 'bouton primaire', onclick: () => {
          const a = gr.apercu.filter((r) => r.garder);
          App.changer((s) => a.forEach((r) => s.graines.push({ id: uid(), pid: r.pid, variete: r.variete, annee: r.annee, texte: r.texte })));
          App.toast(`${a.length} graine${a.length > 1 ? 's' : ''} importée${a.length > 1 ? 's' : ''}.`);
          gr.apercu = null; App.rendre();
        } }, 'Importer la sélection'),
        h('button', { class: 'bouton', onclick: () => { gr.apercu = null; App.rendre(); } }, 'Annuler')));
  }

  function exporterCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lignes = [['Plante', 'Variété', 'Année', 'Quantité'].join(';'),
      ...App.etat.graines.map((g) => [(PP()[g.pid] || {}).n || g.texte, g.variete, g.annee, g.quantite].map(esc).join(';'))];
    U.telecharger('mes-graines.csv', '﻿' + lignes.join('\n'), 'text/csv');
  }

  // ---------- Calendrier ----------
  const cal = { source: 'plan', cat: 'tous' };

  Vues.calendrier = function () {
    const annee = App.etat.annee;
    let lignes = [];
    if (cal.source === 'plan') {
      const plan = App.plan();
      const vus = new Map();
      for (const o of plan.objets) {
        if (o.t !== 'plante' || !PP()[o.pid]) continue;
        const decal = App.decalage(o, plan.objets);
        const cle = `${o.pid}|${decal}`;
        if (!vus.has(cle)) vus.set(cle, { p: PP()[o.pid], decal });
      }
      lignes = [...vus.values()];
    } else if (cal.source === 'graines') {
      lignes = [...new Set(App.etat.graines.map((g) => g.pid))].filter((id) => PP()[id]).map((id) => ({ p: PP()[id], decal: 0 }));
    } else {
      lignes = PLANTES.map((p) => ({ p, decal: 0 }));
    }
    if (cal.cat !== 'tous') lignes = lignes.filter((l) => l.p.cat === cal.cat);
    lignes.sort((a, b) => a.p.n.localeCompare(b.p.n));

    return h('div', { class: 'page' },
      h('div', { class: 'page-tete' }, h('h1', {}, `📅 Calendrier ${annee}`),
        h('p', { class: 'note' }, App.climat.defaut ? 'Calculé pour un climat type : définis ton lieu pour des dates précises.' : `Calculé pour ${App.etat.lieu.nom} : dernière gelée ${periode(U.dateDuJour(annee, App.ctx.dg))}, première gelée ${periode(U.dateDuJour(annee, App.ctx.pg))}.`)),
      h('div', { class: 'filtres' },
        h('div', { class: 'segmente', role: 'group', 'aria-label': 'Plantes affichées' },
          [['plan', `Mon plan ${annee}`], ['graines', 'Mes graines'], ['toutes', 'Toutes']].map(([k, n]) =>
            h('button', { class: cal.source === k ? 'actif' : '', 'aria-pressed': cal.source === k, onclick: () => { cal.source = k; App.rendre(); } }, n))),
        h('select', { 'aria-label': 'Catégorie', onchange: (e) => { cal.cat = e.target.value; App.rendre(); } },
          h('option', { value: 'tous' }, 'Toutes catégories'), Object.entries(CATEGORIES).map(([k, n]) => h('option', { value: k, selected: cal.cat === k }, n))),
        h('label', { class: 'champ-ligne' }, 'Saison ', h('select', { onchange: (e) => { App.etat.annee = +e.target.value; App.sauver(); App.rendre(); } },
          [annee - 1, annee, annee + 1].map((a) => h('option', { value: a, selected: a === annee }, a))))),
      legende(),
      lignes.length ? h('div', { class: 'gantt' },
        h('div', { class: 'gantt-ligne entete-gantt' }, h('div', { class: 'gantt-nom' }), barreAnnee([], annee, null, true)),
        lignes.map(({ p, decal }) => h('div', { class: 'gantt-ligne', onclick: () => Vues.fichePlante(p.id), role: 'button', tabindex: 0, onkeydown: (e) => { if (e.key === 'Enter') Vues.fichePlante(p.id); } },
          h('div', { class: 'gantt-nom' }, App.icone(p), ' ', p.n, decal ? h('span', { class: 'badge-abri' }, `abri +${decal} sem.`) : null),
          barreAnnee(Calendrier.segmentsAnnee(p, App.ctx, annee, decal), annee, p))))
        : h('p', { class: 'vide' }, cal.source === 'plan' ? 'Ton plan est vide pour cette saison.' : cal.source === 'graines' ? "Tu n'as pas encore ajouté de graines." : 'Aucune plante.'));
  };

  // ---------- Plantes ----------
  const pl = { recherche: '', cat: 'tous', fam: 'toutes' };

  Vues.plantes = function () {
    const q = normaliser(pl.recherche);
    const liste = PLANTES.filter((p) => (pl.cat === 'tous' || p.cat === pl.cat) && (pl.fam === 'toutes' || p.fam === pl.fam) &&
      (!q || normaliser(`${p.n} ${p.l} ${(p.al || []).join(' ')}`).includes(q)));
    const grille = h('div', { class: 'grille-plantes' });
    const remplir = (l) => grille.replaceChildren(...l.map((p) => h('button', { class: 'carte-plante', onclick: () => Vues.fichePlante(p.id) },
      h('div', { class: 'carte-plante-ic' }, p.ic || '🌱'),
      h('div', {}, h('div', { class: 'carte-plante-nom' }, p.n), h('div', { class: 'latin' }, p.l),
        h('div', { class: 'etiquettes' }, h('span', { class: 'etiquette' }, CATEGORIES[p.cat]), h('span', { class: 'etiquette gel-' + p.gel }, { tendre: 'gélive', demi: 'semi-rustique', rustique: 'rustique' }[p.gel]), p.per ? h('span', { class: 'etiquette' }, 'vivace') : null)))));
    remplir(liste);
    return h('div', { class: 'page' },
      h('div', { class: 'page-tete' }, h('h1', {}, `🌱 Plantes (${PLANTES.length})`),
        h('p', { class: 'note' }, 'Fiches de culture, calendrier calculé pour ton lieu, associations et sources.')),
      h('div', { class: 'filtres' },
        h('input', { type: 'search', placeholder: 'Chercher…', value: pl.recherche, 'aria-label': 'Chercher une plante', oninput: (e) => { pl.recherche = e.target.value; const qq = normaliser(e.target.value);
          remplir(PLANTES.filter((p) => (pl.cat === 'tous' || p.cat === pl.cat) && (pl.fam === 'toutes' || p.fam === pl.fam) && (!qq || normaliser(`${p.n} ${p.l} ${(p.al || []).join(' ')}`).includes(qq)))); } }),
        h('select', { 'aria-label': 'Catégorie', onchange: (e) => { pl.cat = e.target.value; App.rendre(); } },
          h('option', { value: 'tous' }, 'Toutes catégories'), Object.entries(CATEGORIES).map(([k, n]) => h('option', { value: k, selected: pl.cat === k }, n))),
        h('select', { 'aria-label': 'Famille', onchange: (e) => { pl.fam = e.target.value; App.rendre(); } },
          h('option', { value: 'toutes' }, 'Toutes familles'), Object.entries(FAMILLES).map(([k, f]) => h('option', { value: k, selected: pl.fam === k }, f.n)))),
      grille);
  };

  Vues.fichePlante = function (id) {
    const p = PP()[id];
    const annee = App.etat.annee;
    const assoc = App.associationsDe(id);
    const bons = assoc.filter((a) => a.sens === '+'), mauvais = assoc.filter((a) => a.sens === '-');
    const segs = Calendrier.segmentsAnnee(p, App.ctx, annee, 0);
    const segsSerre = Calendrier.segmentsAnnee(p, App.ctx, annee, Calendrier.ABRIS.serre);
    const js = !p.per && p.sd ? Calendrier.jourSol(App.ctx, p.sol) : null;
    const graines = App.grainesDe(id);
    const gel = { tendre: 'Gélive : tuée par le gel', demi: 'Semi-rustique : supporte de petites gelées', rustique: 'Rustique : résiste au froid' }[p.gel];
    const listeAssoc = (l) => h('ul', { class: 'liste-voisins' }, l.map((a) => h('li', { class: a.sens === '+' ? 'bon' : 'mauvais' },
      h('strong', {}, (PP()[a.autre] || { n: a.autre }).n), ` – ${a.note} `, h('span', { class: 'niveau niveau-' + a.niveau }, NIVEAUX[a.niveau]))));

    const contenu = h('div', { class: 'fiche' },
      h('div', { class: 'titre-plante' }, App.icone(p, '2.4em'), h('div', {}, h('div', { class: 'latin' }, p.l), h('div', {}, `${CATEGORIES[p.cat]} · ${FAMILLES[p.fam].n}`))),
      h('p', { class: 'conseil' }, p.c),
      h('h3', {}, `Calendrier ${annee} chez toi`),
      legende(p.cat === 'fleur' || p.cat === 'engrais'),
      h('div', { class: 'gantt compact' },
        h('div', { class: 'gantt-ligne entete-gantt' }, h('div', { class: 'gantt-nom' }), barreAnnee([], annee, null, true)),
        h('div', { class: 'gantt-ligne' }, h('div', { class: 'gantt-nom' }, 'Plein air'), barreAnnee(segs, annee, p)),
        h('div', { class: 'gantt-ligne' }, h('div', { class: 'gantt-nom' }, 'Sous serre'), barreAnnee(segsSerre, annee, p))),
      h('ul', { class: 'liste-dates' }, Calendrier.fenetres(p, App.ctx, annee, 0).map((s) => h('li', {},
        h('span', { class: 'pastille', style: { background: Calendrier.couleur(s.type, p) } }),
        `${Calendrier.libelle(s.type, p)} : ${fmtDate(s.debut)} → ${fmtDate(s.fin)}${s.fin.getFullYear() !== s.debut.getFullYear() ? ' ' + s.fin.getFullYear() : ''}`))),
      js ? h('p', { class: 'note' }, `Chez toi, le sol atteint ${p.sol} °C (seuil pour semer en place) ${periode(U.dateDuJour(annee, js))} en moyenne.`) : null,
      p.sd && !p.per && Calendrier.jourSol(App.ctx, p.sol) == null ? h('p', { class: 'alerte' }, `Le sol n'atteint jamais ${p.sol} °C en moyenne chez toi : sème à l'abri ou sous serre.`) : null,
      h('h3', {}, 'Culture'),
      h('dl', { class: 'faits deux' },
        h('dt', {}, 'Résistance au froid'), h('dd', {}, gel),
        h('dt', {}, 'Exposition'), h('dd', {}, p.exp || 'soleil'),
        h('dt', {}, 'Espacement'), h('dd', {}, `${p.esp[0]} cm entre plants, ${p.esp[1]} cm entre rangs`),
        h('dt', {}, 'Hauteur'), h('dd', {}, `≈ ${p.h} cm`),
        p.per ? null : [h('dt', {}, p.cat === 'fleur' || p.cat === 'engrais' ? 'Jusqu\'à la floraison' : 'Jusqu\'à la récolte'), h('dd', {}, `${p.dtm[0]} à ${p.dtm[1]} jours ${p.dp ? 'après plantation' : 'après semis'}`)],
        h('dt', {}, 'Sol mini pour semer'), h('dd', {}, `${p.sol} °C`),
        p.succ ? [h('dt', {}, 'Semis échelonnés'), h('dd', {}, `toutes les ${p.succ} semaines`)] : null,
        h('dt', {}, 'Durée germinative'), h('dd', {}, p.germ ? `${p.germ} an${p.germ > 1 ? 's' : ''}` : `se cultive à partir de ${{ plant: 'plants', bulbe: 'bulbes', tubercule: 'tubercules' }[p.achat] || 'plants'}`)),
      bons.length ? [h('h3', {}, '✅ Bons voisins'), listeAssoc(bons)] : null,
      mauvais.length ? [h('h3', {}, '❌ À éloigner'), listeAssoc(mauvais)] : null,
      graines.length ? [h('h3', {}, '🌰 Mes graines'), h('ul', { class: 'liste-simple' }, graines.map((g) => {
        const eg = App.etatGraine(g);
        return h('li', {}, `${g.variete || p.n}${g.annee ? ` (${g.annee})` : ''}`, eg ? h('span', { class: 'sous' }, ` – ${eg.texte}`) : null);
      }))] : null,
      h('h3', {}, 'Pour vérifier'),
      h('p', { class: 'note' }, h('a', { href: `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(p.l.split(' var.')[0].split(' /')[0])}`, target: '_blank', rel: 'noopener' }, 'Wikipédia'), ' · ',
        h('a', { href: `https://www.rhs.org.uk/search?query=${encodeURIComponent(p.l.split(' var.')[0])}`, target: '_blank', rel: 'noopener' }, 'RHS'), ' · ',
        h('button', { class: 'lien', onclick: () => { fermer(); App.aller('reglages'); } }, 'Sources et méthode')));
    const fermer = App.modal(p.n, contenu, true);
  };

  // ---------- Achats ----------
  Vues.achats = function () {
    const annee = App.etat.annee;
    const plan = App.plan();
    const coches = ((App.etat.achats ||= {})[annee] ||= {});
    const parPlante = new Map();
    for (const o of plan.objets) {
      if (o.t !== 'plante' || !PP()[o.pid]) continue;
      const l = parPlante.get(o.pid) || { p: PP()[o.pid], nb: 0, zones: 0, graines: new Set() };
      l.nb += App.nbPlants(o); l.zones++;
      if (o.graineId) l.graines.add(o.graineId);
      parPlante.set(o.pid, l);
    }
    const lignes = [...parPlante.values()].sort((a, b) => a.p.n.localeCompare(b.p.n));

    const besoin = ({ p, nb }) => {
      const achat = p.achat || 'graine';
      if (achat === 'graine') {
        const marge = p.sd || p.sa ? 2 : 1.5; // semis en place : on sème plus serré puis on éclaircit
        return { quoi: 'graines', texte: `≈ ${Math.ceil(nb * marge)} graines (${nb} plant${nb > 1 ? 's' : ''} + marge de levée)` };
      }
      if (p.id === 'pomme-de-terre') return { quoi: 'tubercules', texte: `${nb} tubercules (≈ ${Math.ceil(nb / 13)} kg de plants)` };
      if (p.id === 'ail') return { quoi: 'bulbes', texte: `${nb} gousses (≈ ${Math.ceil(nb / 10)} têtes)` };
      return { quoi: achat, texte: `${nb} ${{ plant: 'plant', bulbe: 'bulbe', tubercule: 'tubercule' }[achat]}${nb > 1 ? 's' : ''}` };
    };

    return h('div', { class: 'page' },
      h('div', { class: 'page-tete' }, h('h1', {}, `🛒 Liste d'achats ${annee}`),
        h('p', { class: 'note' }, 'Calculée à partir des zones de ton plan et de leur espacement, comparée à ton stock de graines.'),
        h('button', { class: 'bouton petit', onclick: () => window.print() }, '🖨️ Imprimer')),
      lignes.length ? h('div', { class: 'tableau-defile' }, h('table', { class: 'tableau achats' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Acheté'), h('th', {}, 'Plante'), h('th', {}, 'Plants'), h('th', {}, 'Il faut'), h('th', {}, 'Dans mon stock'))),
        h('tbody', {}, lignes.map((l) => {
          const b = besoin(l);
          const stock = App.grainesDe(l.p.id);
          const enStock = b.quoi === 'graines' && stock.length;
          const vieilles = stock.filter((g) => (App.etatGraine(g) || {}).niveau === 'vieille');
          return h('tr', { class: coches[l.p.id] || enStock ? 'fait' : '' },
            h('td', {}, h('input', { type: 'checkbox', checked: !!coches[l.p.id], 'aria-label': `${l.p.n} acheté`, onchange: (e) => App.changer(() => { coches[l.p.id] = e.target.checked; }) })),
            h('td', {}, App.icone(l.p), ' ', l.p.n),
            h('td', {}, `${l.nb}`, l.zones > 1 ? h('span', { class: 'sous' }, ` (${l.zones} zones)`) : null),
            h('td', {}, b.texte),
            h('td', {}, stock.length ? [
              stock.map((g) => `${g.variete || 'sans variété'}${g.annee ? ' ' + g.annee : ''}`).join(', '),
              vieilles.length ? h('div', { class: 'germ germ-vieille' }, '⚠️ graines anciennes : tester la germination') : null,
            ] : h('strong', { class: 'a-acheter' }, b.quoi === 'graines' ? 'À acheter' : `À acheter (${{ plant: 'plants', bulbe: 'bulbes', bulbes: 'bulbes', tubercule: 'tubercules', tubercules: 'tubercules' }[b.quoi]})`)));
        })))) : h('p', { class: 'vide' }, `Ton plan ${annee} est vide. `, h('button', { class: 'lien', onclick: () => App.aller('plan') }, 'Dessiner mon potager →')));
  };

  // ---------- Journal ----------
  const jo = { annee: new Date().getFullYear(), type: 'tous', pid: '' };
  const TYPES_JOURNAL = { semis: '🌱 Semis', plantation: '🪴 Plantation', arrosage: '💧 Arrosage', recolte: '🧺 Récolte', observation: '👀 Observation', probleme: '🐛 Problème', traitement: '🧴 Traitement', tache: '✔️ Tâche faite' };
  const urlsPhotos = new Map();

  Vues.journal = function () {
    const entrees = App.etat.journal
      .filter((e) => e.date.startsWith(String(jo.annee)) && (jo.type === 'tous' || e.type === jo.type) && (!jo.pid || e.pid === jo.pid))
      .sort((a, b) => b.date.localeCompare(a.date));

    const fDate = h('input', { type: 'date', value: isoDate(aujourdhui()), required: true, 'aria-label': 'Date' });
    const fType = h('select', { 'aria-label': 'Type', onchange: () => { zoneQte.hidden = fType.value !== 'recolte'; } }, Object.entries(TYPES_JOURNAL).map(([k, n]) => h('option', { value: k }, n)));
    const fPlante = h('select', { 'aria-label': 'Plante' }, h('option', { value: '' }, '— Plante (facultatif) —'), PLANTES.map((p) => h('option', { value: p.id }, p.n)));
    const fQte = h('input', { type: 'number', min: 0, step: 0.01, placeholder: 'Quantité', class: 'num', 'aria-label': 'Quantité récoltée' });
    const fUnite = h('select', { 'aria-label': 'Unité' }, ['kg', 'g', 'pièces', 'bottes'].map((u) => h('option', {}, u)));
    const zoneQte = h('div', { class: 'ligne-champ', hidden: true }, fQte, fUnite);
    const fNote = h('textarea', { rows: 3, placeholder: 'Note (ce que tu as fait, observé…)', 'aria-label': 'Note' });
    const fPhotos = h('input', { type: 'file', accept: 'image/*', multiple: true, 'aria-label': 'Photos' });

    const enregistrerEntree = async (ev) => {
      ev.preventDefault();
      const bouton = ev.target.querySelector('button[type=submit]');
      bouton.disabled = true;
      try {
        const ids = [];
        for (const f of fPhotos.files) {
          const id = uid();
          await U.photos.ecrire(id, await U.reduirePhoto(f));
          ids.push(id);
        }
        const e = { id: uid(), date: fDate.value, type: fType.value, pid: fPlante.value || null, note: fNote.value.trim(), photos: ids };
        if (fType.value === 'recolte' && fQte.value) { e.qte = +fQte.value; e.unite = fUnite.value; }
        jo.annee = +fDate.value.slice(0, 4);
        App.changer((s) => s.journal.push(e));
        App.toast('Entrée ajoutée au journal.');
      } catch (err) {
        App.toast("Impossible d'enregistrer : " + err.message, true);
        bouton.disabled = false;
      }
    };

    const annees = [...new Set([new Date().getFullYear(), ...App.etat.journal.map((e) => +e.date.slice(0, 4))])].sort((a, b) => b - a);
    return h('div', { class: 'page' },
      h('div', { class: 'page-tete' }, h('h1', {}, '📓 Journal du jardin'),
        h('p', { class: 'note' }, 'Note tes semis, récoltes et observations, avec photos. Le bilan te sert à préparer la saison suivante.')),
      h('div', { class: 'deux-blocs' },
        h('section', { class: 'carte' }, h('h2', {}, 'Nouvelle entrée'),
          h('form', { class: 'form-journal', onsubmit: enregistrerEntree },
            h('div', { class: 'ligne-champ' }, fDate, fType), fPlante, zoneQte, fNote,
            h('label', { class: 'champ' }, '📷 Photos', fPhotos),
            h('button', { class: 'bouton primaire', type: 'submit' }, 'Ajouter au journal'))),
        bilan(jo.annee)),
      h('section', { class: 'carte' },
        h('div', { class: 'tete-tableau' }, h('h2', {}, `Entrées (${entrees.length})`),
          h('select', { 'aria-label': 'Année', onchange: (e) => { jo.annee = +e.target.value; App.rendre(); } }, annees.map((a) => h('option', { value: a, selected: a === jo.annee }, a))),
          h('select', { 'aria-label': 'Type', onchange: (e) => { jo.type = e.target.value; App.rendre(); } }, h('option', { value: 'tous' }, 'Tous types'), Object.entries(TYPES_JOURNAL).map(([k, n]) => h('option', { value: k, selected: jo.type === k }, n))),
          h('select', { 'aria-label': 'Plante', onchange: (e) => { jo.pid = e.target.value; App.rendre(); } }, h('option', { value: '' }, 'Toutes plantes'),
            [...new Set(App.etat.journal.map((e) => e.pid).filter(Boolean))].map((id) => h('option', { value: id, selected: jo.pid === id }, PP()[id].n)))),
        entrees.length ? h('ul', { class: 'entrees' }, entrees.map(entreeJournal)) : h('p', { class: 'vide' }, 'Aucune entrée.')));
  };

  function entreeJournal(e) {
    const p = e.pid && PP()[e.pid];
    const vignettes = h('div', { class: 'vignettes' });
    for (const id of e.photos || []) {
      const img = h('img', { alt: 'Photo du jardin', loading: 'lazy', onclick: () => App.modal(fmtDateLongue(lireIso(e.date)), h('img', { src: img.src, class: 'photo-grande', alt: 'Photo du jardin' }), true) });
      vignettes.append(img);
      if (urlsPhotos.has(id)) img.src = urlsPhotos.get(id);
      else U.photos.lire(id).then((b) => { if (b) { const u = URL.createObjectURL(b); urlsPhotos.set(id, u); img.src = u; } });
    }
    return h('li', { class: 'entree' },
      h('div', { class: 'entree-tete' },
        h('span', { class: 'entree-date' }, fmtDate(lireIso(e.date))),
        h('span', {}, TYPES_JOURNAL[e.type] || e.type),
        p ? h('span', {}, App.icone(p), ' ', p.n) : null,
        e.qte ? h('strong', {}, `${e.qte} ${e.unite}`) : null,
        h('span', { class: 'espace' }),
        h('button', { class: 'bouton-icone', 'aria-label': 'Supprimer', title: 'Supprimer', onclick: async () => {
          if (!confirm('Supprimer cette entrée ?')) return;
          for (const id of e.photos || []) await U.photos.supprimer(id);
          App.changer((s) => s.journal.splice(s.journal.indexOf(e), 1));
        } }, '🗑️')),
      e.note ? h('p', {}, e.note) : null,
      (e.photos || []).length ? vignettes : null);
  }

  function bilan(annee) {
    const ent = App.etat.journal.filter((e) => e.date.startsWith(String(annee)));
    const recoltes = {};
    for (const e of ent) if (e.type === 'recolte' && e.pid && e.qte) {
      const r = (recoltes[e.pid] ||= { kg: 0, pieces: 0, bottes: 0 });
      if (e.unite === 'kg') r.kg += e.qte; else if (e.unite === 'g') r.kg += e.qte / 1000; else if (e.unite === 'pièces') r.pieces += e.qte; else r.bottes += e.qte;
    }
    const tri = Object.entries(recoltes).sort((a, b) => b[1].kg - a[1].kg || b[1].pieces - a[1].pieces);
    const totalKg = tri.reduce((s, [, r]) => s + r.kg, 0);
    const problemes = ent.filter((e) => e.type === 'probleme');
    const ajd = aujourdhui();
    const taches = tachesPlan(ajd, ajouterJours(ajd, 14));
    return h('section', { class: 'carte' },
      h('h2', {}, `Bilan ${annee}`),
      tri.length ? [
        h('p', {}, 'Récolté : ', h('strong', {}, `${totalKg.toFixed(1)} kg`), ` au total`),
        h('ul', { class: 'liste-simple' }, tri.map(([id, r]) => h('li', {}, App.icone(PP()[id]), ` ${PP()[id].n} : `,
          [r.kg ? `${r.kg.toFixed(r.kg < 10 ? 2 : 1)} kg` : null, r.pieces ? `${r.pieces} pièces` : null, r.bottes ? `${r.bottes} bottes` : null].filter(Boolean).join(' + ')))),
      ] : h('p', { class: 'vide' }, 'Aucune récolte notée cette année.'),
      problemes.length ? [h('h3', {}, `Problèmes notés (${problemes.length})`), h('ul', { class: 'liste-simple' }, problemes.slice(0, 6).map((e) =>
        h('li', {}, `${fmtDate(lireIso(e.date))} – ${e.pid ? PP()[e.pid].n + ' : ' : ''}${e.note || ''}`)))] : null,
      h('h3', {}, 'À faire ces 2 semaines'),
      taches.length ? h('ul', { class: 'liste-simple' }, taches.slice(0, 8).map(({ p, s }) => h('li', {}, App.icone(p), ` ${Calendrier.libelle(s.type, p)} – ${p.n}`)))
        : h('p', { class: 'vide' }, 'Rien de prévu dans ton plan.'));
  }

  // ---------- Réglages ----------
  Vues.reglages = function () {
    const lieu = App.etat.lieu;
    return h('div', { class: 'page' },
      h('div', { class: 'page-tete' }, h('h1', {}, '⚙️ Réglages')),
      h('div', { class: 'deux-blocs' },
        h('section', { class: 'carte' }, h('h2', {}, '📍 Lieu du potager'),
          lieu ? h('p', {}, h('strong', {}, lieu.nom), lieu.detail ? ` – ${lieu.detail}` : '', h('br'), h('span', { class: 'sous' }, `${lieu.lat.toFixed(3)}, ${lieu.lon.toFixed(3)}${App.climat.elev != null ? ` · altitude du point météo ${Math.round(App.climat.elev)} m` : ''}`)) : h('p', { class: 'note' }, 'Aucun lieu défini.'),
          choixLieu(() => App.aller('maintenant')),
          lieu ? h('button', { class: 'bouton petit', onclick: async () => { App.toast('Mise à jour…'); await App.chargerMeteo(true); App.rendre(); App.toast(App.erreurMeteo || 'Météo mise à jour.', !!App.erreurMeteo); } }, '🔄 Recharger la météo') : null),
        h('section', { class: 'carte' }, h('h2', {}, '❄️ Prudence face au gel'),
          h('p', { class: 'note' }, "Les dates de gelée varient d'une année à l'autre. Choisis le niveau de risque accepté pour la dernière gelée de printemps (et la première d'automne)."),
          [[0.5, '50 % – date moyenne (une année sur deux il gèlera encore après)'], [0.8, '80 % – conseillé'], [0.9, '90 % – très prudent']].map(([v, n]) =>
            h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'risque', checked: App.etat.risque === v, onchange: () => { App.etat.risque = v; App.majContexte(); App.sauver(); App.rendre(); } }), ' ', n)),
          !App.climat.defaut ? h('p', { class: 'note' }, `Sur ${App.climat.dgAnnees.length} ans : dernière gelée la plus précoce ${fmtDate(U.dateDuJour(2001, Math.max(1, Math.min(...App.climat.dgAnnees))))}, la plus tardive ${fmtDate(U.dateDuJour(2001, Math.max(...App.climat.dgAnnees)))}.`) : null)),
      h('div', { class: 'deux-blocs' },
        h('section', { class: 'carte' }, h('h2', {}, '💾 Sauvegarde'),
          h('p', { class: 'note' }, "Tes données restent dans ce navigateur, sur cet ordinateur. Exporte-les régulièrement pour ne rien perdre, ou pour les transférer sur un autre appareil."),
          h('div', { class: 'boutons' },
            h('button', { class: 'bouton primaire', onclick: () => exporter(true) }, '⬇️ Tout exporter (avec photos)'),
            h('button', { class: 'bouton', onclick: () => exporter(false) }, '⬇️ Exporter sans photos'),
            h('label', { class: 'bouton' }, '⬆️ Importer une sauvegarde', h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: importer }))),
          h('hr'),
          h('button', { class: 'bouton danger petit', onclick: () => {
            if (!confirm('Effacer toutes les données (plans, graines, journal) ? Exporte une sauvegarde avant si besoin.')) return;
            localStorage.removeItem('potager'); localStorage.removeItem('climat'); localStorage.removeItem('previsions');
            indexedDB.deleteDatabase('potager');
            location.reload();
          } }, 'Tout effacer')),
        h('section', { class: 'carte' }, h('h2', {}, '📚 Sources et méthode'),
          h('p', {}, "Les données des plantes (espacements, températures de germination, durées de culture, durée de vie des graines) sont des valeurs courantes, compilées à partir des références ci-dessous et de la pratique jardinière. Elles restent indicatives : en cas de doute, suis les indications de ton sachet."),
          h('p', {}, "Calendrier : chaque plante a ses fenêtres en semaines autour des dates de gelée. Ces dates viennent des 20 dernières années de météo à ta position (températures minimales journalières à 2 m), au niveau de prudence choisi. Les semis en place attendent en plus que le sol atteigne la température de germination (moyenne sur 20 ans), et l'écran Maintenant vérifie la température prévue."),
          h('p', {}, "Associations : « prouvé par des essais » = effet mesuré dans des publications ; « raison pratique » = logique sanitaire (maladies ou ravageurs communs) ; « tradition » = conseil courant non démontré."),
          h('ul', { class: 'sources' }, SOURCES.map((s) => h('li', {}, h('a', { href: s.u, target: '_blank', rel: 'noopener' }, s.n)))))));
  };

  async function exporter(avecPhotos) {
    const donnees = { app: 'mon-potager', version: 1, exporte: new Date().toISOString(), etat: App.etat };
    if (avecPhotos) {
      App.toast('Préparation des photos…');
      const ph = await U.photos.toutes();
      donnees.photos = {};
      // La carte d'ensoleillement se recalcule : on n'exporte que les photos.
      for (const [k, b] of Object.entries(ph)) if (b instanceof Blob) donnees.photos[k] = await U.blobVersDataUrl(b);
    }
    U.telecharger(`potager-${isoDate(new Date())}.json`, JSON.stringify(donnees));
  }

  async function importer(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'mon-potager' || !d.etat) throw new Error("ce fichier n'est pas une sauvegarde de Mon potager");
      if (!confirm('Remplacer les données actuelles par celles de la sauvegarde ?')) return;
      for (const [k, u] of Object.entries(d.photos || {})) await U.photos.ecrire(k, await U.dataUrlVersBlob(u));
      App.etat = d.etat;
      App.sauver();
      await App.chargerMeteo();
      App.rendre();
      App.toast('Sauvegarde importée.');
    } catch (err) { App.toast('Import impossible : ' + err.message, true); }
  }
})();
