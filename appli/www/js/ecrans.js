/* Écrans de l'appli Android : Aujourd'hui, Plan (lecture), Graines, Journal, Plantes, Compte.
 * Les données, le calendrier et la synchronisation viennent du code du site (js/commun) :
 * ici, seulement l'affichage pour le doigt et quelques gestes rapides qui écrivent au journal. */
(function () {
  const { h, fmtDate, fmtDateLongue, ajouterJours, aujourdhui, isoDate, lireIso, normaliser, uid, MOIS_LONGS, stock } = U;
  const PP = () => PLANTES_PAR_ID;
  const I = (nom, t) => Icone(nom, t);
  const S = (t, a, ...e) => h('svg:' + t, a, ...e);
  const nombre = (v, d = 1) => (+v.toFixed(d)).toString().replace('.', ',');

  const ONGLETS = [['aujourdhui', "Aujourd'hui", 'aujourdhui'], ['plan', 'Plan', 'plan'], ['graines', 'Graines', 'graines'], ['journal', 'Journal', 'journal'], ['plus', 'Plus', 'menu']];
  const ECRANS = new Set(['aujourdhui', 'plan', 'graines', 'journal', 'plus', 'plantes', 'compte']);
  const SEMIS = new Set(['si', 'sd', 'sa']);
  const TYPE_JOURNAL = { si: 'semis', sd: 'semis', sa: 'semis', pl: 'plantation', rec: 'recolte' };
  const JOURNAL = {
    recolte: ['🧺', 'Récolte'], semis: ['🌱', 'Semis'], plantation: ['🪴', 'Plantation'], arrosage: ['💧', 'Arrosage'],
    observation: ['👀', 'Observation'], probleme: ['🐛', 'Problème'], traitement: ['🧴', 'Traitement'], tache: ['✔️', 'Tâche faite'],
  };
  const UNITES = ['kg', 'g', 'pièces', 'bottes'];
  const NOMS_STRUCTURES = { bac: 'Bac', pot: 'Pot', allee: 'Allée', serre: 'Serre', tunnel: 'Tunnel', chassis: 'Châssis', treillis: 'Treillis', compost: 'Compost', eau: "Récupérateur d'eau", arbre: 'Arbre', haie: 'Haie', mur: 'Mur', cloture: 'Clôture', batiment: 'Bâtiment' };

  // État de l'appli sur cet appareil (non partagé).
  const A = {
    local: stock.lire('appli:local', false),        // utiliser sans compte (maquette, données de démonstration)
    partage: stock.lire('appli:partage', false),    // appareil partagé (tablette du jardin) : on choisit qui note
    qui: stock.lire('appli:qui', ''),
    graines: { filtre: 'tout', recherche: '' },
    plantes: { recherche: '' },
    plan: { mois: null, vb: null, annee: null },
    journalMax: 40,
  };

  // ---------- Outils ----------
  const quiNote = () => (A.partage ? A.qui : Synchro.prenom()) || '';
  const aDesDonnees = () => { const e = App.etat; return !!(e.lieu || e.graines.length || e.journal.length || Object.values(e.plans).some((p) => p.objets.length)); };

  function statutSemis(p, g) {
    const ajd = aujourdhui(), fin = ajouterJours(ajd, 365);
    const segs = (g && g.periodes && g.periodes.length
      ? App.periodesGraine(g, ajd, fin).filter((s) => s.type !== 'rec')
      : Calendrier.actions(p, App.ctx, ajd, fin).filter((s) => SEMIS.has(s.type) || (s.type === 'pl' && (p.achat || 'graine') !== 'graine')))
      .sort((a, b) => a.debut - b.debut);
    return { maintenant: segs.filter((s) => s.debut <= ajouterJours(ajd, 7) && s.fin >= ajd), prochain: segs.find((s) => s.debut > ajouterJours(ajd, 7)) };
  }
  const libelle = (type, p) => Calendrier.libelle(type, p);
  const quand = (s) => (s.debut <= aujourdhui() ? `jusqu'au ${fmtDate(s.fin)}` : `à partir du ${fmtDate(s.debut)}`);

  // Cultures du plan à semer, planter ou récolter dans les deux semaines (récoltes : seulement celles qui ont commencé).
  function taches() {
    const ajd = aujourdhui(), fin = ajouterJours(ajd, 14), res = new Map();
    for (const annee of [ajd.getFullYear(), ajd.getFullYear() + 1]) {
      const plan = App.etat.plans[annee];
      if (!plan) continue;
      for (const o of plan.objets) {
        const p = o.t === 'plante' && PP()[o.pid];
        if (!p) continue;
        const decal = App.decalage(o, plan.objets);
        for (const s of Calendrier.fenetres(p, App.ctx, annee, decal)) {
          if (s.fin < ajd || s.debut > fin || (s.type === 'rec' && s.debut > ajd)) continue;
          const cle = `${p.id}|${s.type}`;
          const t = res.get(cle) || { p, s, zones: 0, plants: 0, abri: false };
          t.zones++; t.plants += App.nbPlants(o); t.abri ||= decal > 0;
          if (s.debut < t.s.debut) t.s = s;
          res.set(cle, t);
        }
      }
    }
    const ordre = { rec: 0, pl: 1, sd: 2, sa: 2, si: 3 };
    return [...res.values()].sort((a, b) => ordre[a.s.type] - ordre[b.s.type] || a.s.fin - b.s.fin);
  }
  // Fait : une entrée du journal de ce type pour cette plante depuis l'ouverture de la fenêtre (aujourd'hui pour une récolte).
  // Type d'entrée du journal pour une action : les bulbes et plants « de fin de saison » se plantent, ils ne se sèment pas.
  const typeJournal = (type, p) => (type === 'sa' && p.achat && p.achat !== 'graine' ? 'plantation' : TYPE_JOURNAL[type]);
  function tacheFaite(t) {
    const type = typeJournal(t.s.type, t.p);
    const depuis = isoDate(t.s.type === 'rec' ? aujourdhui() : (t.s.debut > aujourdhui() ? aujourdhui() : t.s.debut));
    return App.etat.journal.some((e) => e.pid === t.p.id && e.type === type && e.date >= depuis);
  }

  // Alertes des 3 prochains jours pour ce qui est en terre (même logique que celles du Jardinier, en plus court).
  function alertes() {
    if (!App.prev) return [];
    const ajd = isoDate(aujourdhui());
    const jours = App.prev.jours.filter((j) => j.date >= ajd).slice(0, 3);
    const plan = App.plan(new Date().getFullYear());
    const enTerre = plan.objets.filter((o) => {
      if (o.t !== 'plante' || !PP()[o.pid]) return false;
      const occ = App.occupation(o, plan.objets, new Date().getFullYear());
      return occ && occ.debut <= aujourdhui() && occ.fin >= aujourdhui();
    });
    const PROTEGE = { serre: 3, tunnel: 2, chassis: 1 };
    const res = [];
    const gel = jours.filter((j) => j.tmin <= 1);
    if (gel.length) {
      const j = gel.reduce((a, b) => (b.tmin < a.tmin ? b : a));
      const touchees = [...new Set(enTerre.filter((o) => {
        const p = PP()[o.pid], abri = App.abriDe(o, plan.objets);
        const ressenti = j.tmin + (abri ? PROTEGE[abri.t] || 0 : 0);
        return (p.gel === 'tendre' && ressenti <= 1) || (p.gel === 'demi' && ressenti <= -3);
      }).map((o) => PP()[o.pid].n))];
      res.push({ classe: 'info', icone: 'gel', titre: `Gel ${j.date === ajd ? 'cette nuit' : `la nuit du ${fmtDate(lireIso(j.date))}`} : ${nombre(j.tmin)} °C`,
        texte: touchees.length ? `À protéger (voile, paillage) : ${touchees.join(', ')}.` : 'Rien de fragile en terre, mais pense aux semis et aux pots.' });
    }
    const chaud = jours.filter((j) => j.tmax >= 30);
    if (chaud.length) res.push({ classe: 'ambre', icone: 'chaleur', titre: `Forte chaleur : ${nombre(Math.max(...chaud.map((j) => j.tmax)))} °C`, texte: 'Arroser tôt le matin ou le soir, pailler, ombrer les semis.' });
    return res;
  }

  // ---------- Feuille du bas (détails et formulaires) ----------
  function feuille(contenu) {
    const fermer = () => { fond.remove(); document.removeEventListener('keydown', echap); };
    const echap = (e) => { if (e.key === 'Escape') fermer(); };
    // « modal-fond » : la synchronisation attend qu'elle soit fermée pour appliquer un changement venu d'ailleurs.
    const fond = h('div', { class: 'feuille-fond modal-fond', onclick: (e) => { if (e.target === fond) fermer(); } },
      h('div', { class: 'feuille', role: 'dialog' }, h('div', { class: 'poignee' }), typeof contenu === 'function' ? contenu(() => fermer()) : contenu));
    document.addEventListener('keydown', echap);
    document.body.append(fond);
    return fermer;
  }
  const teteFeuille = (vignette, titre, sous, fermer) => h('div', { class: 'feuille-tete' }, vignette,
    h('div', { style: { flex: 1, minWidth: 0 } }, h('h2', {}, titre), sous ? h('div', { class: 'note' }, sous) : null),
    h('button', { class: 'bouton-rond', 'aria-label': 'Fermer', onclick: fermer }, I('fermer', 20)));
  const vignette = (contenu, classe = '') => h('div', { class: 'vignette ' + classe }, contenu);
  const fait = (etiquette, valeur) => h('div', { class: 'fait' }, h('div', { class: 'etiquette' }, etiquette), h('div', { class: 'valeur' }, valeur));
  const COULEURS_TYPES = { si: '#8e6bbf', sd: '#4f9d4a', sa: '#2f8f83', pl: '#e38b2c', rec: '#d0453a' };
  function listePeriodes(segs, p) {
    return h('div', { class: 'periodes' }, segs.map((s) => h('div', { class: 'periode' },
      h('span', { class: 'point', style: { background: s.type === 'rec' && (p.cat === 'fleur') ? '#d45a9a' : COULEURS_TYPES[s.type] } }),
      h('span', {}, libelle(s.type, p)),
      h('span', { class: 'quand' }, `${fmtDate(s.debut)} → ${fmtDate(s.fin)}${s.fin.getFullYear() !== s.debut.getFullYear() ? ' ' + s.fin.getFullYear() : ''}`))));
  }

  // ---------- Noter au journal ----------
  function ajouterAuJournal(e, message) {
    const entree = { id: uid(), date: isoDate(aujourdhui()), photos: [], ...e };
    if (quiNote()) entree.par = quiNote();
    App.changer((s) => s.journal.push(entree));
    App.toast(message || 'Noté au journal.', false, { label: 'Annuler', fn: () => App.changer((s) => { const i = s.journal.findIndex((x) => x.id === entree.id); if (i >= 0) s.journal.splice(i, 1); }) });
  }

  function choixQui(maj) {
    if (!A.partage) return null;
    const noms = ['Hugo', 'Angélique'];
    const zone = h('div', { class: 'choix' });
    const remplir = () => zone.replaceChildren(...noms.map((n) => h('button', { type: 'button', class: A.qui === n ? 'actif' : '', onclick: () => { A.qui = n; stock.ecrire('appli:qui', n); remplir(); if (maj) maj(); } }, n)));
    remplir();
    return h('div', { class: 'champ' }, h('span', {}, 'Qui note ?'), zone);
  }

  // Formulaire : récolte (avec quantité), semis, observation… avec photo prise sur place.
  function formulaireJournal({ type = 'recolte', pid = '' } = {}) {
    feuille((fermer) => {
      let t = type;
      const fPlante = h('select', {}, h('option', { value: '' }, '— Aucune —'), ...groupesPlantes(pid));
      const fQte = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 0.01, placeholder: '0' });
      let unite = 'kg';
      const unites = h('div', { class: 'choix' });
      const majUnites = () => unites.replaceChildren(...UNITES.map((u) => h('button', { type: 'button', class: u === unite ? 'actif' : '', onclick: () => { unite = u; majUnites(); } }, u)));
      majUnites();
      const zoneQte = h('div', {}, h('label', { class: 'champ' }, h('span', {}, 'Quantité'), fQte), h('div', { class: 'champ' }, unites));
      const fNote = h('textarea', { rows: 3, placeholder: 'Ce que tu as fait ou observé' });
      const photos = [];
      const apercu = h('div', { class: 'photo-apercu' });
      const fPhoto = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: async () => {
        for (const f of fPhoto.files) { const b = await U.reduirePhoto(f); photos.push(b); apercu.append(h('img', { src: URL.createObjectURL(b), alt: '' })); }
        fPhoto.value = '';
      } });
      const types = h('div', { class: 'choix' });
      const majTypes = () => {
        types.replaceChildren(...Object.entries(JOURNAL).filter(([k]) => k !== 'tache').map(([k, [ic, n]]) => h('button', { type: 'button', class: k === t ? 'actif' : '', onclick: () => { t = k; majTypes(); } }, ic, ' ', n)));
        zoneQte.hidden = t !== 'recolte';
      };
      majTypes();
      const enregistrer = async (ev) => {
        ev.preventDefault();
        const ids = [];
        for (const b of photos) { const id = uid(); await U.photos.ecrire(id, b); ids.push(id); }
        const e = { type: t, pid: fPlante.value || null, note: fNote.value.trim(), photos: ids };
        if (t === 'recolte' && fQte.value) { e.qte = +fQte.value; e.unite = unite; }
        fermer();
        ajouterAuJournal(e, t === 'recolte' && e.qte ? `Récolte notée : ${nombre(e.qte, 2)} ${unite}.` : 'Noté au journal.');
      };
      return h('form', { onsubmit: enregistrer },
        teteFeuille(vignette(I('journal'), 'verte'), 'Noter au journal', fmtDateLongue(aujourdhui()), fermer),
        h('div', { class: 'champ' }, h('span', {}, 'Quoi ?'), types),
        h('label', { class: 'champ' }, h('span', {}, 'Plante'), fPlante),
        zoneQte,
        h('label', { class: 'champ' }, h('span', {}, 'Note'), fNote),
        h('div', { class: 'champ' }, h('button', { type: 'button', class: 'bouton secondaire', onclick: () => fPhoto.click() }, I('photo', 20), 'Prendre une photo'), fPhoto, apercu),
        choixQui(),
        h('div', { class: 'actions-feuille' }, h('button', { type: 'submit', class: 'bouton' }, I('fait', 20), 'Enregistrer')));
    });
  }
  // Plantes du plan d'abord, puis celles du stock, puis toutes.
  function groupesPlantes(choisie) {
    const an = new Date().getFullYear();
    const plan = new Set([an, an + 1].flatMap((a) => (App.etat.plans[a] || { objets: [] }).objets.filter((o) => o.t === 'plante').map((o) => o.pid)));
    const stockP = new Set(App.etat.graines.map((g) => g.pid));
    const opt = (p) => h('option', { value: p.id, selected: p.id === choisie }, `${p.ic || ''} ${p.n}`);
    const tri = (l) => l.filter((p) => p).sort((a, b) => a.n.localeCompare(b.n));
    return [
      plan.size ? h('optgroup', { label: 'Dans le plan' }, tri([...plan].map((id) => PP()[id])).map(opt)) : null,
      h('optgroup', { label: 'Mes graines' }, tri([...stockP].filter((id) => !plan.has(id)).map((id) => PP()[id])).map(opt)),
      h('optgroup', { label: 'Toutes les plantes' }, tri(PLANTES.filter((p) => !plan.has(p.id) && !stockP.has(p.id))).map(opt)),
    ].filter(Boolean);
  }

  // ---------- Écran : Aujourd'hui ----------
  function ecranAujourdhui() {
    const ajd = aujourdhui();
    const l = taches();
    const prenom = quiNote();
    const enPlan = new Set(l.map((t) => t.p.id));
    const parGraine = new Map();
    for (const g of App.etat.graines) {
      const cle = g.periodes && g.periodes.length ? 'g' + g.id : PP()[g.pid] ? g.pid : null;
      if (cle && !parGraine.has(cle) && !enPlan.has(g.pid)) parGraine.set(cle, g);
    }
    const aSemer = [...parGraine.values()].map((g) => ({ g, p: App.planteGraine(g), st: statutSemis(App.planteGraine(g), g) })).filter((x) => x.st.maintenant.length);

    const gauche = h('div', {},
      h('section', { class: 'section' }, carteMeteo()),
      alertes().length ? h('section', { class: 'section' }, alertes().map((a) => h('div', { class: 'bandeau-alerte ' + a.classe }, I(a.icone), h('div', {}, h('strong', {}, a.titre), h('p', {}, a.texte))))) : null);
    const droite = h('div', {},
      h('section', { class: 'section' },
        h('h2', { class: 'titre-section' }, 'À faire au jardin', h('span', { class: 'compte' }, l.length ? `${l.filter((t) => !tacheFaite(t)).length} restant${l.filter((t) => !tacheFaite(t)).length > 1 ? 's' : ''}` : '')),
        h('div', { class: 'carte' }, l.length ? h('ul', { class: 'liste' }, l.map(ligneTache))
          : h('div', { class: 'vide' }, Object.values(App.etat.plans).some((p) => p.objets.some((o) => o.t === 'plante')) ? 'Rien à faire dans le plan ces deux prochaines semaines.' : 'Le plan est encore vide : il se prépare sur l\'ordinateur.'))),
      aSemer.length ? h('section', { class: 'section' },
        h('h2', { class: 'titre-section' }, 'Graines à semer maintenant', h('span', { class: 'compte' }, `${aSemer.length}`)),
        h('div', { class: 'carte' }, h('ul', { class: 'liste' }, aSemer.slice(0, 6).map(({ g, p, st }) => h('li', {},
          h('button', { class: 'ligne', onclick: () => ficheGraine(g) }, vignette(p.ic || '🌱', 'verte'),
            h('div', { class: 'ligne-texte' }, h('div', { class: 'ligne-titre' }, `${p.n}${g.variete ? ' · ' + g.variete : ''}`),
              h('div', { class: 'ligne-sous' }, st.maintenant.map((s) => `${libelle(s.type, p)} ${quand(s)}`).join(' · '))),
            I('suite', 20)))))),
        aSemer.length > 6 ? h('button', { class: 'bouton discret', onclick: () => { A.graines.filtre = 'maintenant'; App.aller('graines'); } }, `Voir les ${aSemer.length}`) : null) : null);
    return {
      titre: `${prenom ? `Bonjour ${prenom}` : 'Bonjour'}`,
      sous: ajd.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase()),
      corps: h('div', { class: 'deux-colonnes' }, gauche, droite),
    };
  }

  function carteMeteo() {
    if (!App.etat.lieu) return h('div', { class: 'carte' }, h('div', { class: 'vide' }, 'Pas de lieu défini : il se règle sur le site.'));
    if (!App.prev) return h('div', { class: 'carte' }, h('div', { class: 'vide' }, App.erreurMeteo || 'Chargement de la météo…'));
    const ajd = isoDate(aujourdhui());
    const jours = App.prev.jours.filter((j) => j.date >= ajd).slice(0, 7);
    if (!jours.length) return h('div', { class: 'carte' }, h('div', { class: 'vide' }, 'Météo à mettre à jour (connexion internet).'));
    const j0 = jours[0], [ic, txt] = Climat.meteo(j0.code);
    const nomJour = (d) => lireIso(d).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
    return h('div', { class: 'carte' },
      h('div', { class: 'meteo-jour' }, h('div', { class: 'grand' }, ic),
        h('div', { style: { flex: 1 } }, h('div', { class: 'temp' }, `${Math.round(j0.tmax)}°`, h('small', {}, ` / ${Math.round(j0.tmin)}°`)),
          h('div', { class: 'note' }, `${txt} à ${App.etat.lieu.nom}${j0.pluie >= 0.5 ? ` · ${nombre(j0.pluie)} mm de pluie` : ''}`))),
      h('div', { class: 'meteo-jours' }, jours.map((j, i) => h('div', { class: 'meteo-j' },
        h('span', { class: 'j' }, i === 0 ? 'Auj.' : nomJour(j.date)), h('span', { class: 'ic' }, Climat.meteo(j.code)[0]),
        h('span', { class: 'max' }, `${Math.round(j.tmax)}°`), h('span', { class: j.tmin <= 0.5 ? 'gel' : 'min' }, `${Math.round(j.tmin)}°`)))));
  }

  function ligneTache(t) {
    const faite = tacheFaite(t);
    const classe = { rec: 'ambre', pl: 'bleue' }[t.s.type] || 'verte';
    const verbe = t.s.type === 'rec' ? (t.p.cat === 'fleur' ? 'Fleurs à cueillir' : 'Récolter') : libelle(t.s.type, t.p);
    const valider = () => {
      if (t.s.type === 'rec') formulaireJournal({ type: 'recolte', pid: t.p.id });
      else ajouterAuJournal({ type: typeJournal(t.s.type, t.p), pid: t.p.id, note: `${libelle(t.s.type, t.p)} (depuis l'appli)` }, `${libelle(t.s.type, t.p)} de ${t.p.n.toLowerCase()} noté au journal.`);
    };
    return h('li', { class: 'ligne tache' + (faite ? ' faite' : '') },
      vignette(t.p.ic || '🌱', classe),
      h('div', { class: 'ligne-texte' }, h('div', { class: 'ligne-titre' }, `${verbe} · ${t.p.n}`),
        h('div', { class: 'ligne-sous' }, [faite ? 'Fait' : quand(t.s), t.plants ? `${t.plants} plant${t.plants > 1 ? 's' : ''}` : null, t.abri ? 'sous abri' : null].filter(Boolean).join(' · '))),
      h('button', { class: 'bouton-rond' + (faite ? ' fait' : ''), 'aria-label': faite ? 'Déjà fait' : 'Marquer comme fait', onclick: valider }, I(t.s.type === 'rec' ? 'panier' : 'fait', 20)));
  }

  // ---------- Écran : Plan (lecture) ----------
  function ecranPlan() {
    const annees = Object.keys(App.etat.plans).map(Number).filter((a) => App.etat.plans[a].objets.length).sort();
    const an = new Date().getFullYear();
    if (!A.plan.annee || !annees.includes(A.plan.annee)) A.plan.annee = annees.includes(an) ? an : annees.includes(App.etat.annee) ? App.etat.annee : annees[annees.length - 1] || App.etat.annee;
    const objets = (App.etat.plans[A.plan.annee] || { objets: [] }).objets;
    const svg = S('svg', { role: 'img', 'aria-label': `Plan ${A.plan.annee}` });
    const groupe = S('g');
    svg.append(groupe);
    const cadre = h('div', { class: 'cadre-plan' }, svg,
      h('div', { class: 'boussole-app', style: { transform: `rotate(${App.etat.orientation || 0}deg)` }, title: 'Nord' }, 'N'),
      h('div', { class: 'plan-outils' }, h('button', { class: 'bouton-rond', 'aria-label': 'Recentrer', onclick: () => { A.plan.vb = null; ajuster(); } }, I('centrer', 20))));

    const mois = h('div', { class: 'segmente' },
      annees.length > 1 ? annees.map((a) => h('button', { class: a === A.plan.annee ? 'actif' : '', onclick: () => { A.plan.annee = a; A.plan.vb = null; App.rendre(); } }, a)) : null,
      h('button', { class: A.plan.mois == null ? 'actif' : '', onclick: () => { A.plan.mois = null; App.rendre(); } }, 'Toute la saison'),
      MOIS_LONGS.map((m, i) => h('button', { class: A.plan.mois === i ? 'actif' : '', onclick: () => { A.plan.mois = i; App.rendre(); } }, m.replace(/^./, (c) => c.toUpperCase()))));

    const { largeur, hauteur } = App.etat.jardin;
    const av = App.etat.orientation || 0, cx = largeur / 2, cy = hauteur / 2;
    const anneaux = Terrain.contoursLocaux(App.etat.geo);

    function ajuster() {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      // Boîte englobante du terrain (et de la parcelle) une fois la vue tournée.
      const pts = [[0, 0], [largeur, 0], [largeur, hauteur], [0, hauteur], ...anneaux.flat()].map(([x, y]) => tourner([x, y], av));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const marge = 0.6;
      let x0 = Math.min(...xs) - marge, y0 = Math.min(...ys) - marge, w = Math.max(...xs) - x0 + marge, hh = Math.max(...ys) - y0 + marge;
      if (w / hh > r.width / r.height) { const n = w * r.height / r.width; y0 -= (n - hh) / 2; hh = n; } else { const n = hh * r.width / r.height; x0 -= (n - w) / 2; w = n; }
      A.plan.vb = { x: x0, y: y0, w, h: hh };
      dessiner();
    }
    const tourner = ([x, y], deg) => { const a = (deg * Math.PI) / 180, dx = x - cx, dy = y - cy; return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]; };
    const majVue = () => { const v = A.plan.vb; svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); };

    function dessiner() {
      if (!A.plan.vb) return;
      majVue();
      const px = svg.getBoundingClientRect().width / A.plan.vb.w; // pixels par mètre
      const fs = (n) => n / px;
      const els = [];
      els.push(S('rect', { x: 0, y: 0, width: largeur, height: hauteur, class: 'terrain-plan', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
      for (const a of anneaux) els.push(S('polygon', { points: a.map((p) => p.join(',')).join(' '), fill: 'none', stroke: '#5d4037', 'stroke-width': 2, 'stroke-dasharray': '8 4 2 4', 'vector-effect': 'non-scaling-stroke' }));
      const ordre = { allee: 0, bac: 1, pot: 1, compost: 1, eau: 1, batiment: 1, serre: 2, tunnel: 2, chassis: 2, treillis: 3, mur: 3, cloture: 3, haie: 3, plante: 4, arbre: 5 };
      for (const o of [...objets].sort((a, b) => (ordre[a.t] ?? 1) - (ordre[b.t] ?? 1))) els.push(o.t === 'plante' ? dessinerPlante(o, px, fs) : dessinerStructure(o, fs));
      groupe.setAttribute('transform', av ? `rotate(${av} ${cx} ${cy})` : '');
      groupe.replaceChildren(...els);
    }
    const etiquette = (x, y, texte, taille, angle, extra = {}) => S('text', { x, y, 'font-size': taille, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'plan-svg-texte', 'stroke-width': taille * 0.28, transform: angle ? `rotate(${-angle} ${x} ${y})` : null, 'pointer-events': 'none', ...extra }, texte);
    const rotObjet = (o) => (o.rot && !['pot', 'eau', 'arbre'].includes(o.t) ? `rotate(${o.rot} ${o.x + o.w / 2} ${o.y + o.h / 2})` : null);

    function dessinerStructure(o, fs) {
      const g = S('g', { transform: rotObjet(o), 'data-id': o.id });
      const trait = { 'vector-effect': 'non-scaling-stroke' };
      const r = (a) => S('rect', { x: o.x, y: o.y, width: o.w, height: Math.max(o.h, 0.05), ...a, ...trait });
      const styles = {
        bac: { fill: '#8a6a4f', stroke: '#6d4c35', 'stroke-width': 2.5, rx: 0.04 }, allee: { fill: '#e6dfd0', stroke: '#c8bca6', 'stroke-width': 1 },
        serre: { fill: '#3d8fc4', 'fill-opacity': 0.14, stroke: '#3d8fc4', 'stroke-width': 2 }, tunnel: { fill: '#5aa5cf', 'fill-opacity': 0.14, stroke: '#5aa5cf', 'stroke-width': 2, 'stroke-dasharray': '6 3' },
        chassis: { fill: '#5b9bd5', 'fill-opacity': 0.14, stroke: '#5b9bd5', 'stroke-width': 2, 'stroke-dasharray': '6 3' }, treillis: { fill: '#8d6e63', stroke: '#5d4037', 'stroke-width': 1 },
        compost: { fill: '#6d5a3a', stroke: '#4e3f28', 'stroke-width': 2 }, haie: { fill: '#2f6b35', 'fill-opacity': 0.7, stroke: '#1f4a24', 'stroke-width': 1.5 },
        mur: { fill: '#9e9e9e', stroke: '#616161', 'stroke-width': 1.5 }, cloture: { fill: '#d7ccc8', stroke: '#6d4c41', 'stroke-width': 1.5, 'stroke-dasharray': '2 3' },
        batiment: { fill: '#b0a89e', 'fill-opacity': 0.85, stroke: '#5d554c', 'stroke-width': 2 },
      };
      if (o.t === 'pot' || o.t === 'eau' || o.t === 'arbre') {
        const st = { pot: ['#d9a066', '#9c5b2e', 1], eau: ['#90caf9', '#1e88e5', 1], arbre: ['#8bbf6a', '#2e5e2a', 0.35] }[o.t];
        g.append(S('ellipse', { cx: o.x + o.w / 2, cy: o.y + o.h / 2, rx: o.w / 2, ry: o.h / 2, fill: st[0], 'fill-opacity': st[2], stroke: st[1], 'stroke-width': 2, ...trait }));
        if (o.t === 'arbre') g.append(etiquette(o.x + o.w / 2, o.y + o.h / 2, '🌳', Math.min(o.w * 0.4, fs(26)), App.etat.orientation || 0));
      } else g.append(r(styles[o.t] || { fill: '#ccc' }));
      const nom = o.nom || (['bac', 'serre', 'tunnel', 'chassis', 'batiment'].includes(o.t) ? NOMS_STRUCTURES[o.t] : '');
      if (nom && Math.max(o.w, o.h) > fs(50) && o.t !== 'bac') g.append(etiquette(o.x + o.w / 2, o.t === 'batiment' ? o.y + o.h / 2 : o.y + Math.min(fs(12), o.h / 2), nom, fs(11), (App.etat.orientation || 0) + (o.rot || 0)));
      return g;
    }

    function dessinerPlante(o, px, fs) {
      const p = PP()[o.pid];
      if (!p) return S('g');
      const couleur = (FAMILLES[p.fam] || {}).c || '#6a8f4e';
      let opacite = 1;
      if (A.plan.mois != null) {
        const occ = App.occupation(o, objets, A.plan.annee);
        const d = new Date(A.plan.annee, A.plan.mois, 1), f = new Date(A.plan.annee, A.plan.mois + 1, 0);
        if (!occ || occ.fin < d || occ.debut > f) opacite = 0.12;
      }
      const angle = (App.etat.orientation || 0) + (o.rot || 0);
      const g = S('g', { 'data-id': o.id, class: 'zone-plante', opacity: opacite, transform: rotObjet(o) });
      g.append(S('rect', { x: o.x, y: o.y, width: o.w, height: o.h, rx: Math.min(0.06, o.w / 4, o.h / 4), fill: couleur, 'fill-opacity': 0.28, stroke: couleur, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
      // Un symbole par plant, à l'endroit où le mettre (même calcul que le site).
      const ecart = p.esp[0] / 100, rang = o.mode === 'rangs' ? p.esp[1] / 100 : ecart;
      const nx = Math.max(1, Math.floor(o.w / ecart + 0.0001)), ny = Math.max(1, Math.floor(o.h / rang + 0.0001));
      const dx = o.w / nx, dy = o.h / ny, taille = Math.min(dx, dy, 0.6) * 0.8;
      if (nx * ny <= 600 && taille * px >= 7) {
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) g.append(etiquette(o.x + dx * (i + 0.5), o.y + dy * (j + 0.5), p.ic || '🌱', taille, angle, { class: '' }));
      } else g.append(etiquette(o.x + o.w / 2, o.y + o.h / 2, p.ic || '🌱', Math.min(o.w, o.h, 0.6) * 0.7, angle, { class: '' }));
      if (o.w * px > 80 && o.h * px > 30) g.append(etiquette(o.x + o.w / 2, o.y + Math.min(fs(11), o.h / 4), `${p.n} ×${App.nbPlants(o)}`, fs(11), angle));
      return g;
    }

    // Gestes : un doigt déplace, deux doigts zooment, un appui court ouvre une zone ; molette pour l'ordinateur.
    const doigts = new Map();
    let depart = null;
    svg.addEventListener('pointerdown', (e) => {
      try { svg.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      doigts.set(e.pointerId, [e.clientX, e.clientY]);
      depart = { t: Date.now(), x: e.clientX, y: e.clientY, bouge: false, cible: e.target.closest('[data-id]') };
    });
    svg.addEventListener('pointermove', (e) => {
      if (!doigts.has(e.pointerId) || !A.plan.vb) return;
      const avant = [...doigts.values()];
      doigts.set(e.pointerId, [e.clientX, e.clientY]);
      const apres = [...doigts.values()];
      const r = svg.getBoundingClientRect(), v = A.plan.vb, k = v.w / r.width;
      if (depart && Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > 8) depart.bouge = true;
      if (apres.length === 1) { v.x -= (apres[0][0] - avant[0][0]) * k; v.y -= (apres[0][1] - avant[0][1]) * k; }
      else if (apres.length >= 2) {
        const dist = (l) => Math.hypot(l[0][0] - l[1][0], l[0][1] - l[1][1]);
        const milieu = (l) => [(l[0][0] + l[1][0]) / 2, (l[0][1] + l[1][1]) / 2];
        const f = dist(avant) / Math.max(1, dist(apres)), [mx, my] = milieu(apres), [ax, ay] = milieu(avant);
        zoomer(f, mx, my, (mx - ax) * k, (my - ay) * k);
      }
      majVue();
    });
    const relacher = (e) => {
      if (!doigts.has(e.pointerId)) return;
      doigts.delete(e.pointerId);
      if (depart && !depart.bouge && Date.now() - depart.t < 500 && depart.cible) ouvrirObjet(objets.find((o) => o.id === depart.cible.getAttribute('data-id')));
      if (!doigts.size) { depart = null; dessiner(); }
    };
    svg.addEventListener('pointerup', relacher);
    svg.addEventListener('pointercancel', relacher);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomer(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY, 0, 0); majVue(); clearTimeout(svg._t); svg._t = setTimeout(dessiner, 150); }, { passive: false });
    function zoomer(f, sx, sy, dx, dy) {
      const r = svg.getBoundingClientRect(), v = A.plan.vb;
      const nw = Math.min(Math.max(v.w * f, 0.8), Math.max(largeur, hauteur) * 4);
      const g = nw / v.w, px = v.x + ((sx - r.left) / r.width) * v.w, py = v.y + ((sy - r.top) / r.height) * v.h;
      A.plan.vb = { x: px - (px - v.x) * g - dx, y: py - (py - v.y) * g - dy, w: nw, h: v.h * g };
    }
    setTimeout(() => { if (!A.plan.vb) ajuster(); else dessiner(); }, 0); // une fois le cadre dans la page (taille connue)
    addEventListener('resize', () => { if (App.vue === 'plan') ajuster(); }, { once: true });

    const nbZones = objets.filter((o) => o.t === 'plante').length;
    return {
      titre: `Plan ${A.plan.annee}`,
      sous: nbZones ? `${nbZones} zone${nbZones > 1 ? 's' : ''} de culture · touche une zone pour le détail` : 'Aucune culture placée sur le site',
      classe: 'ecran-plan',
      corps: h('div', {}, mois, cadre),
    };
  }

  function ouvrirObjet(o) {
    if (!o) return;
    if (o.t !== 'plante') { App.toast(`${o.nom || NOMS_STRUCTURES[o.t] || o.t}${o.w && o.h ? ` · ${nombre(o.w, 2)} × ${nombre(o.h, 2)} m` : ''}`); return; }
    const p = PP()[o.pid], objets = (App.etat.plans[A.plan.annee] || { objets: [] }).objets;
    const graine = o.graineId && App.etat.graines.find((g) => g.id === o.graineId);
    const abri = App.abriDe(o, objets), decal = App.decalage(o, objets);
    const occ = App.occupation(o, objets, A.plan.annee);
    const segs = Calendrier.fenetres(p, App.ctx, A.plan.annee, decal);
    const contenant = objets.find((c) => c !== o && ['bac', 'pot', 'serre', 'tunnel', 'chassis'].includes(c.t) && G.dedans(G.centre(o), c));
    feuille((fermer) => [
      teteFeuille(vignette(p.ic || '🌱', 'verte'), p.n, [graine && graine.variete, contenant && (contenant.nom || NOMS_STRUCTURES[contenant.t])].filter(Boolean).join(' · ') || null, fermer),
      h('div', { class: 'faits' },
        fait('Plants', `${App.nbPlants(o)} ${o.mode === 'rangs' ? 'en rangs' : 'en carré'}`),
        fait('Espacement', o.mode === 'rangs' ? `${p.esp[0]} × ${p.esp[1]} cm` : `${p.esp[0]} cm`),
        fait('Zone', `${Math.round(o.w * 100)} × ${Math.round(o.h * 100)} cm`),
        fait('En place', occ ? `${fmtDate(occ.debut)} → ${fmtDate(occ.fin)}${occ.fin.getFullYear() !== occ.debut.getFullYear() ? ' ' + occ.fin.getFullYear() : ''}` : '—'),
        abri ? fait('Abri', `${NOMS_STRUCTURES[abri.t]} (avance de ${decal} sem.)`) : null,
        o.debut ? fait('Planté le', fmtDate(lireIso(o.debut))) : null),
      h('h3', { class: 'titre-section', style: { marginTop: '20px' } }, `Calendrier ${A.plan.annee}`),
      listePeriodes(segs, p),
      o.notes ? h('div', { class: 'conseil' }, o.notes) : p.c ? h('div', { class: 'conseil' }, p.c) : null,
      h('div', { class: 'actions-feuille' },
        h('button', { class: 'bouton secondaire', onclick: () => { fermer(); fichePlante(p.id); } }, 'Fiche de culture'),
        h('button', { class: 'bouton', onclick: () => { fermer(); formulaireJournal({ type: 'recolte', pid: p.id }); } }, I('panier', 20), 'Récolte')),
    ]);
  }

  // ---------- Écran : Graines ----------
  function ecranGraines() {
    const F = A.graines;
    const lignes = App.etat.graines.map((g) => {
      const p = App.planteGraine(g), st = (PP()[g.pid] || (g.periodes && g.periodes.length)) ? statutSemis(p, g) : null;
      return { g, p, st, eg: App.etatGraine(g) };
    }).filter(({ g, p, st, eg }) => {
      if (F.recherche && !normaliser(`${p.n} ${g.variete || ''} ${g.texte || ''}`).includes(normaliser(F.recherche))) return false;
      if (F.filtre === 'maintenant') return st && st.maintenant.length;
      if (F.filtre === 'bientot') return st && !st.maintenant.length && st.prochain && st.prochain.debut <= ajouterJours(aujourdhui(), 45);
      if (F.filtre === 'verifier') return eg && eg.niveau !== 'ok';
      return true;
    }).sort((a, b) => a.p.n.localeCompare(b.p.n));
    const champ = h('input', { type: 'search', placeholder: 'Chercher une graine', value: F.recherche, oninput: (e) => { F.recherche = e.target.value; const pos = e.target.selectionStart; App.rendre(); const c = document.querySelector('.recherche input'); c.focus(); c.setSelectionRange(pos, pos); } });
    const filtres = [['tout', 'Toutes'], ['maintenant', 'À semer maintenant'], ['bientot', 'Bientôt'], ['verifier', 'À vérifier']];
    return {
      titre: 'Mes graines', sous: `${App.etat.graines.length} sachet${App.etat.graines.length > 1 ? 's' : ''}`,
      corps: h('div', {},
        h('label', { class: 'recherche' }, I('chercher', 20), champ),
        h('div', { class: 'segmente' }, filtres.map(([k, n]) => h('button', { class: F.filtre === k ? 'actif' : '', onclick: () => { F.filtre = k; App.rendre(); } }, n))),
        h('div', { class: 'carte' }, lignes.length ? h('ul', { class: 'liste' }, lignes.map(({ g, p, st, eg }) => h('li', {},
          h('button', { class: 'ligne', onclick: () => ficheGraine(g) }, vignette(p.ic || '🌱', st && st.maintenant.length ? 'verte' : ''),
            h('div', { class: 'ligne-texte' }, h('div', { class: 'ligne-titre' }, `${p.n}${g.variete ? ' · ' + g.variete : ''}`),
              h('div', { class: 'ligne-sous' }, !st ? 'Suivre le sachet' : st.maintenant.length ? st.maintenant.map((s) => `${libelle(s.type, p)} ${quand(s)}`).join(' · ') : st.prochain ? `${libelle(st.prochain.type, p)} ${quand(st.prochain)}` : 'Pas de fenêtre de semis')),
            eg && eg.niveau !== 'ok' ? h('span', { class: 'puce ' + (eg.niveau === 'vieille' ? 'rouge' : 'ambre') }, eg.niveau === 'vieille' ? 'À tester' : 'Dernière année') : null))))
          : h('div', { class: 'vide' }, App.etat.graines.length ? 'Aucune graine ne correspond.' : 'Aucune graine : envoie une photo de sachet au Jardinier, ou ajoute-les sur le site.'))),
    };
  }

  function ficheGraine(g) {
    const p = App.planteGraine(g), eg = App.etatGraine(g);
    const ajd = aujourdhui();
    const segs = (g.periodes && g.periodes.length ? App.periodesGraine(g, ajd, ajouterJours(ajd, 365)) : PP()[g.pid] ? Calendrier.actions(p, App.ctx, ajd, ajouterJours(ajd, 365)) : [])
      .filter((s) => s.fin >= ajd).sort((a, b) => a.debut - b.debut);
    feuille((fermer) => [
      teteFeuille(vignette(p.ic || '🌱', 'verte'), p.n, g.variete || null, fermer),
      h('div', { class: 'faits' },
        g.annee ? fait('Année du sachet', g.annee) : null,
        g.limite ? fait("Valable jusqu'en", g.limite) : null,
        g.quantite ? fait('Quantité', g.quantite) : null,
        eg ? fait('Germination', eg.texte) : null),
      segs.length ? [h('h3', { class: 'titre-section', style: { marginTop: '20px' } }, g.periodes && g.periodes.length ? 'Quand semer (dates retenues)' : 'Quand semer chez toi'), listePeriodes(segs.slice(0, 6), p)] : null,
      g.notes ? h('div', { class: 'conseil' }, g.notes) : null,
      h('div', { class: 'actions-feuille' },
        PP()[g.pid] ? h('button', { class: 'bouton secondaire', onclick: () => { fermer(); fichePlante(p.id); } }, 'Fiche de culture') : null,
        h('button', { class: 'bouton', onclick: () => { fermer(); formulaireJournal({ type: 'semis', pid: PP()[g.pid] ? g.pid : '' }); } }, I('pousse', 20), "J'ai semé")),
    ]);
  }

  // ---------- Écran : Journal ----------
  function ecranJournal() {
    const entrees = [...App.etat.journal].sort((a, b) => b.date.localeCompare(a.date) || 0);
    const visibles = entrees.slice(0, A.journalMax);
    const blocs = [];
    let moisCourant = null, carte = null;
    for (const e of visibles) {
      const m = e.date.slice(0, 7);
      if (m !== moisCourant) {
        moisCourant = m;
        const d = lireIso(e.date);
        blocs.push(h('h2', { class: 'mois-journal' }, `${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`));
        carte = h('div', { class: 'carte' });
        blocs.push(carte);
      }
      carte.append(entreeJournal(e));
    }
    return {
      titre: 'Journal', sous: `${entrees.length} entrée${entrees.length > 1 ? 's' : ''}`,
      corps: h('div', {},
        entrees.length ? blocs : h('div', { class: 'carte' }, h('div', { class: 'vide' }, 'Rien de noté pour le moment.')),
        entrees.length > A.journalMax ? h('div', { style: { textAlign: 'center', marginTop: '12px' } }, h('button', { class: 'bouton discret', onclick: () => { A.journalMax += 40; App.rendre(); } }, 'Voir plus')) : null,
        h('button', { class: 'fab', onclick: () => formulaireJournal({ type: 'recolte' }) }, I('plus', 22), 'Noter')),
    };
  }
  function entreeJournal(e) {
    const p = e.pid && PP()[e.pid], [ic, nom] = JOURNAL[e.type] || ['📝', e.type];
    const photos = h('div', { class: 'photos-journal' });
    for (const cle of (e.photos || []).slice(0, 4)) {
      const img = h('img', { alt: '' });
      photos.append(img);
      Synchro.photo(cle).then((b) => { if (b) img.src = URL.createObjectURL(b); else img.remove(); });
    }
    return h('div', { class: 'entree' },
      h('div', { class: 'entree-tete' }, vignette(p ? p.ic || ic : ic, e.type === 'recolte' ? 'ambre' : e.type === 'probleme' ? 'rouge' : 'verte'),
        h('div', { class: 'ligne-texte' }, h('div', { class: 'ligne-titre' }, `${nom}${p ? ' · ' + p.n : ''}${e.qte ? ` · ${nombre(e.qte, 2)} ${e.unite || ''}` : ''}`),
          h('div', { class: 'ligne-sous' }, [fmtDate(lireIso(e.date)), e.par ? `par ${e.par}` : null].filter(Boolean).join(' · ')))),
      e.note ? h('p', { class: 'entree-note' }, e.note) : null,
      (e.photos || []).length ? photos : null);
  }

  // ---------- Écran : Plantes ----------
  function ecranPlantes() {
    const q = normaliser(A.plantes.recherche);
    const liste = PLANTES.filter((p) => !q || normaliser(`${p.n} ${p.l || ''} ${(p.al || []).join(' ')}`).includes(q)).sort((a, b) => a.n.localeCompare(b.n));
    const grille = h('div', { class: 'grille-plantes' });
    const remplir = (l) => grille.replaceChildren(...l.map((p) => h('button', { class: 'carte-plante', onclick: () => fichePlante(p.id) },
      vignette(p.ic || '🌱', 'verte'), h('div', { class: 'nom' }, p.n), p.l ? h('div', { class: 'latin' }, p.l) : null)));
    remplir(liste);
    return {
      titre: 'Plantes', sous: `${PLANTES.length} fiches de culture`, retour: 'plus',
      corps: h('div', {},
        h('label', { class: 'recherche' }, I('chercher', 20), h('input', { type: 'search', placeholder: 'Chercher une plante', value: A.plantes.recherche,
          oninput: (e) => { A.plantes.recherche = e.target.value; const qq = normaliser(e.target.value); remplir(PLANTES.filter((p) => !qq || normaliser(`${p.n} ${p.l || ''} ${(p.al || []).join(' ')}`).includes(qq)).sort((a, b) => a.n.localeCompare(b.n))); } })),
        grille),
    };
  }

  function fichePlante(id) {
    const p = PP()[id];
    if (!p) return;
    const annee = App.etat.annee;
    const gel = { tendre: 'Gélive', demi: 'Supporte de petites gelées', rustique: 'Rustique' }[p.gel];
    feuille((fermer) => [
      teteFeuille(vignette(p.ic || '🌱', 'verte'), p.n, [p.l, (FAMILLES[p.fam] || {}).n && FAMILLES[p.fam].n.split(' (')[0]].filter(Boolean).join(' · '), fermer),
      p.perso ? h('p', { class: 'note', style: { marginTop: '6px' } }, 'Plante perso de ton potager : dates fixes choisies pour ton lieu.') : null,
      h('div', { class: 'faits' },
        fait('Froid', gel), fait('Exposition', p.exp || 'soleil'),
        fait('Espacement', `${p.esp[0]} × ${p.esp[1]} cm`), fait('Hauteur', `≈ ${p.h} cm`),
        p.dtm ? fait(p.cat === 'fleur' ? "Jusqu'à la floraison" : "Jusqu'à la récolte", `${p.dtm[0]}–${p.dtm[1]} jours`) : null,
        p.germ ? fait('Graines', `${p.germ} an${p.germ > 1 ? 's' : ''}`) : null),
      h('h3', { class: 'titre-section', style: { marginTop: '20px' } }, `Calendrier ${annee} chez toi`),
      listePeriodes(Calendrier.fenetres(p, App.ctx, annee, 0), p),
      p.c ? h('div', { class: 'conseil' }, p.c) : null,
    ]);
  }

  // ---------- Écrans : Plus, Compte ----------
  function ecranPlus() {
    const connecte = Synchro.connecte();
    const ligneLien = (ic, titre, sous, vers) => h('li', {}, h('button', { class: 'ligne', onclick: () => App.aller(vers) }, vignette(I(ic), 'verte'),
      h('div', { class: 'ligne-texte' }, h('div', { class: 'ligne-titre' }, titre), sous ? h('div', { class: 'ligne-sous' }, sous) : null), I('suite', 20)));
    return {
      titre: 'Plus', sous: connecte ? `Potager « ${Synchro.nomJardin()} »` : 'Sur cet appareil',
      corps: h('div', {},
        h('section', { class: 'section' }, h('div', { class: 'carte' }, h('ul', { class: 'liste' },
          ligneLien('plantes', 'Plantes', 'Fiches de culture et calendrier', 'plantes'),
          ligneLien('compte', 'Compte et synchronisation', connecte ? Synchro.texteStatut() : 'Non connecté', 'compte')))),
        h('section', { class: 'section' }, h('h2', { class: 'titre-section' }, 'Cet appareil'),
          h('div', { class: 'carte' }, h('ul', { class: 'liste' }, h('li', { class: 'ligne' }, vignette(I('tablette'), 'bleue'),
            h('div', { class: 'ligne-texte' }, h('div', { class: 'ligne-titre' }, 'Appareil partagé'), h('div', { class: 'ligne-sous' }, 'Tablette du jardin : on choisit qui note au journal')),
            h('input', { type: 'checkbox', checked: A.partage, style: { width: '22px', height: '22px', accentColor: 'var(--primaire)' }, 'aria-label': 'Appareil partagé',
              onchange: (e) => { A.partage = e.target.checked; stock.ecrire('appli:partage', A.partage); App.rendre(); } })),
            A.partage ? h('li', { class: 'ligne', style: { display: 'block' } }, choixQui(() => App.rendre())) : null))),
        h('p', { class: 'note', style: { textAlign: 'center', marginTop: '28px' } }, 'Mon potager · le plan se prépare sur le site, sur l\'ordinateur.')),
    };
  }

  function ecranCompte() {
    const connecte = Synchro.connecte();
    return {
      titre: 'Compte', retour: 'plus',
      corps: connecte ? h('div', {},
        h('section', { class: 'section' }, h('div', { class: 'carte' }, h('ul', { class: 'liste' },
          h('li', { class: 'ligne' }, vignette(I('compte'), 'verte'), h('div', { class: 'ligne-texte' }, h('div', { class: 'ligne-titre' }, Synchro.prenom()), h('div', { class: 'ligne-sous' }, `Potager « ${Synchro.nomJardin()} »`))),
          h('li', { class: 'ligne' }, vignette(I(Synchro.statut() === 'hors-ligne' ? 'horsLigne' : 'nuage'), 'bleue'), h('div', { class: 'ligne-texte' }, h('div', { class: 'ligne-titre' }, 'Synchronisation'), h('div', { class: 'ligne-sous synchro-texte' }, Synchro.texteStatut())))))),
        h('p', { class: 'note', style: { margin: '14px 4px' } }, "Tout ce que tu notes ici est gardé sur l'appareil et part sur le serveur dès qu'il y a du réseau. Le plan se modifie sur le site."),
        h('button', { class: 'bouton secondaire plein', onclick: () => { if (confirm('Se déconnecter ? Les données restent sur cet appareil.')) { Synchro.deconnexion(); App.rendre(); } } }, I('sortie', 20), 'Se déconnecter'))
        : formulaireConnexion(),
    };
  }

  function formulaireConnexion(accueil = false) {
    const email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'prenom@exemple.fr', required: true });
    const mdp = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const erreur = h('div', { class: 'erreur', hidden: true });
    const zoneJardins = h('div');
    const bouton = h('button', { type: 'submit', class: 'bouton plein', style: { marginTop: '20px' } }, 'Se connecter');
    const choisir = async (j) => {
      try { await Synchro.lier(j.id); A.local = false; stock.ecrire('appli:local', false); App.aller('aujourdhui'); App.rendre(); }
      catch (e) { erreur.hidden = false; erreur.textContent = e.message; }
    };
    const valider = async (ev) => {
      ev.preventDefault();
      bouton.disabled = true; erreur.hidden = true;
      try {
        await Synchro.connexion(email.value.trim(), mdp.value);
        const jardins = await Synchro.mesJardins();
        if (!jardins.length) throw new Error("Ce compte n'a encore accès à aucun potager : crée-le ou rejoins-le sur le site.");
        if (jardins.length === 1) await choisir(jardins[0]);
        else zoneJardins.replaceChildren(h('h2', { class: 'titre-section', style: { marginTop: '22px' } }, 'Quel potager ?'),
          h('div', { class: 'carte' }, h('ul', { class: 'liste' }, jardins.map((j) => h('li', {}, h('button', { type: 'button', class: 'ligne', onclick: () => choisir(j) }, vignette('🥕', 'verte'), h('div', { class: 'ligne-texte' }, h('div', { class: 'ligne-titre' }, j.nom)), I('suite', 20)))))));
      } catch (e) { erreur.hidden = false; erreur.textContent = e.message; }
      bouton.disabled = false;
    };
    return h('form', { onsubmit: valider },
      accueil ? null : h('p', { class: 'note', style: { margin: '6px 4px 4px' } }, 'Même e-mail et même mot de passe que sur le site.'),
      h('label', { class: 'champ' }, h('span', {}, 'E-mail'), email),
      h('label', { class: 'champ' }, h('span', {}, 'Mot de passe'), mdp),
      erreur, bouton, zoneJardins);
  }

  function ecranAccueil() {
    return h('div', { class: 'accueil' },
      h('div', { class: 'marque-accueil' }, '🥕'),
      h('h1', {}, 'Mon potager'),
      h('p', { class: 'note' }, 'Connecte-toi avec ton compte du site pour retrouver ton plan, tes graines et ton journal.'),
      formulaireConnexion(true),
      aDesDonnees() ? h('button', { class: 'bouton discret plein', style: { marginTop: '10px' }, onclick: () => { A.local = true; stock.ecrire('appli:local', true); App.rendre(); } }, 'Continuer avec les données de cet appareil') : null);
  }

  // ---------- Rendu ----------
  const STATUTS = { ok: ['nuage', 'À jour'], envoi: ['nuage', 'Envoi…'], 'hors-ligne': ['horsLigne', 'Hors ligne'], session: ['compte', 'Reconnexion'], local: ['tablette', 'Cet appareil'] };
  function pastilleStatut() {
    const s = Synchro.connecte() || Synchro.statut() === 'session' ? Synchro.statut() : 'local';
    const [ic, txt] = STATUTS[s] || STATUTS.local;
    return h('button', { class: 'statut-synchro ' + s, title: Synchro.texteStatut() || txt, onclick: () => App.aller('compte') }, I(ic, 16), txt);
  }
  document.addEventListener('synchro-statut', () => { const el = document.querySelector('.statut-synchro'); if (el) el.replaceWith(pastilleStatut()); });

  function rendre() {
    App.majPlantesPerso();
    const racine = document.getElementById('app');
    if (!Synchro.connecte() && !A.local && Synchro.statut() !== 'session') { racine.replaceChildren(ecranAccueil()); return; }
    let vue = App.vue === 'maintenant' || !ECRANS.has(App.vue) ? 'aujourdhui' : App.vue;
    const e = { aujourdhui: ecranAujourdhui, plan: ecranPlan, graines: ecranGraines, journal: ecranJournal, plus: ecranPlus, plantes: ecranPlantes, compte: ecranCompte }[vue]();
    const onglet = { plantes: 'plus', compte: 'plus' }[vue] || vue;
    racine.replaceChildren(h('div', { class: 'appli ' + (e.classe || '') },
      h('header', { class: 'barre-haut' },
        e.retour ? h('button', { class: 'bouton-rond', 'aria-label': 'Retour', onclick: () => App.aller(e.retour) }, I('retour', 20)) : null,
        h('h1', {}, e.titre, e.sous ? h('span', { class: 'sous-titre' }, e.sous) : null),
        pastilleStatut()),
      h('main', { class: 'contenu' }, e.corps),
      h('nav', { class: 'nav', 'aria-label': 'Sections' }, ONGLETS.map(([id, nom, ic]) =>
        h('a', { href: '#' + id, class: id === onglet ? 'actif' : '', 'aria-current': id === onglet ? 'page' : null }, h('span', { class: 'pastille-nav' }, I(ic, 22)), nom)))));
  }

  async function demarrer() {
    App.rendre = rendre; // l'état et la synchronisation du site appellent App.rendre : ce sont nos écrans qui s'affichent
    A.local = stock.lire('appli:local', false); // les données de démonstration ont pu le changer
    App.vue = location.hash.slice(1) || 'aujourdhui';
    App.climat = (App.etat.lieu && stock.lire('climat', null)) || Climat.climatParDefaut();
    App.prev = App.etat.lieu ? stock.lire('previsions', null) : null;
    App.majContexte();
    rendre();
    Synchro.demarrer();
    if (App.etat.lieu) {
      await App.chargerMeteo();
      // L'historique (dates de gelée) peut être indisponible : on garde au moins les prévisions du jour.
      if (!App.prev) { try { App.prev = await Climat.chargerPrevisions(App.etat.lieu); App.erreurMeteo = null; } catch { /* hors ligne */ } }
      rendre();
    }
  }

  window.Appli = { demarrer };
})();
