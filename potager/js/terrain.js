/* Terrain : import de la parcelle cadastrale, calcul et affichage de l'ensoleillement. */
(function () {
  const { h, fmtDate, MOIS } = U;
  const RAD = Math.PI / 180;
  const KY = 110574;

  // ---------- Parcelle ----------
  function contoursLocaux(geo) {
    if (!geo) return [];
    return geo.parcelles.flatMap((p) => p.anneaux.map((a) => a.map(([lon, lat]) => Soleil.versLocal(geo, lat, lon))));
  }

  function appliquerParcelles(parcelles, adresse) {
    const pts = parcelles.flatMap((p) => p.anneaux.flat());
    const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
    const latMax = Math.max(...lats), latMin = Math.min(...lats), lonMin = Math.min(...lons), lonMax = Math.max(...lons);
    const kx = 111320 * Math.cos(latMax * RAD);
    const marge = 2;
    const geo = { origine: { lat: latMax + marge / KY, lon: lonMin - marge / kx }, parcelles, adresse };
    const ancien = App.etat.geo;
    App.etat.geo = geo;
    App.etat.jardin = {
      largeur: Math.ceil(((lonMax - lonMin) * kx + 2 * marge) * 2) / 2,
      hauteur: Math.ceil(((latMax - latMin) * KY + 2 * marge) * 2) / 2,
    };
    if (!App.etat.lieu) {
      App.etat.lieu = { nom: parcelles[0].commune || 'Ma parcelle', detail: adresse || '', lat: (latMax + latMin) / 2, lon: (lonMin + lonMax) / 2 };
      App.chargerMeteo().then(() => App.rendre());
    }
    App.soleil = null;
    App.sauver();
    const objets = Object.values(App.etat.plans).some((p) => p.objets.length);
    App.rendre();
    App.toast(ancien && objets ? 'Parcelle mise à jour. Vérifie la position de tes bacs par rapport au nouveau contour.' : 'Parcelle importée. Dessine maintenant bâtiments, clôtures et arbres (section Ombre) avec leur hauteur : la photo aérienne (Fond) aide à les placer.');
    App.etat.fond = { type: 'photo', opacite: (App.etat.fond || {}).opacite ?? 0.85 };
    App.sauver();
    App.rendre();
  }

  function modalParcelle() {
    const trouvees = (App.etat.geo && App.etat.geo.parcelles.slice()) || [];
    let adresse = App.etat.geo && App.etat.geo.adresse;
    const liste = h('ul', { class: 'liste-parcelles' });
    const majListe = () => {
      liste.replaceChildren(...(trouvees.length ? trouvees.map((p, i) => h('li', {},
        h('strong', {}, `${p.commune} – section ${p.section.replace(/^0+/, '')} n° ${Number(p.numero)}`), ` · ${p.surface} m²`,
        h('button', { class: 'bouton-icone', 'aria-label': 'Retirer', onclick: () => { trouvees.splice(i, 1); majListe(); } }, '✕')))
        : [h('li', { class: 'vide' }, 'Aucune parcelle choisie.')]));
      valider.disabled = !trouvees.length;
    };
    const ajouter = (p) => {
      if (!p) { App.toast('Aucune parcelle trouvée ici.', true); return; }
      if (!trouvees.some((x) => x.idu === p.idu)) trouvees.push(p);
      majListe();
    };

    // Par adresse
    const champAdr = h('input', { type: 'search', placeholder: 'ex. 12 rue des Lilas, 69100 Villeurbanne', 'aria-label': 'Adresse' });
    const resAdr = h('ul', { class: 'resultats-lieu' });
    const chercherAdr = async () => {
      if (!champAdr.value.trim()) return;
      resAdr.replaceChildren(h('li', { class: 'note' }, 'Recherche…'));
      try {
        const r = await Soleil.chercherAdresse(champAdr.value.trim());
        resAdr.replaceChildren(...(r.length ? r.map((a) => h('li', {}, h('button', { class: 'lien', onclick: async () => {
          resAdr.replaceChildren(h('li', { class: 'note' }, 'Recherche de la parcelle…'));
          try { adresse = a.label; ajouter(await Soleil.parcelleAuPoint(a.lat, a.lon)); resAdr.replaceChildren(); } catch (e) { resAdr.replaceChildren(h('li', { class: 'alerte' }, e.message)); }
        } }, a.label))) : [h('li', { class: 'note' }, 'Adresse introuvable.')]));
      } catch (e) { resAdr.replaceChildren(h('li', { class: 'alerte' }, e.message)); }
    };
    champAdr.addEventListener('keydown', (e) => { if (e.key === 'Enter') chercherAdr(); });

    // Par référence cadastrale
    const champCommune = h('input', { type: 'search', placeholder: 'Commune', 'aria-label': 'Commune' });
    const resCommune = h('ul', { class: 'resultats-lieu' });
    let codeInsee = null;
    const champSection = h('input', { placeholder: 'Section (ex. AB)', maxlength: 2, class: 'court', 'aria-label': 'Section' });
    const champNumero = h('input', { placeholder: 'N° (ex. 123)', type: 'number', min: 1, class: 'court', 'aria-label': 'Numéro de parcelle' });
    champCommune.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !champCommune.value.trim()) return;
      try {
        const r = await Soleil.chercherCommune(champCommune.value.trim());
        resCommune.replaceChildren(...r.map((c) => h('li', {}, h('button', { class: 'lien', onclick: () => { codeInsee = c.citycode; champCommune.value = c.label; resCommune.replaceChildren(); } }, c.label))));
      } catch (err) { resCommune.replaceChildren(h('li', { class: 'alerte' }, err.message)); }
    });
    const chercherRef = async () => {
      if (!codeInsee) { App.toast('Choisis d\'abord la commune (Entrée pour chercher).', true); return; }
      if (!champSection.value || !champNumero.value) { App.toast('Indique la section et le numéro.', true); return; }
      try { ajouter(await Soleil.parcelleParReference(codeInsee, champSection.value, champNumero.value)); } catch (e) { App.toast(e.message, true); }
    };

    const valider = h('button', { class: 'bouton primaire', disabled: true, onclick: () => { fermer(); appliquerParcelles(trouvees, adresse); } }, 'Utiliser ces parcelles');
    const contenu = h('div', { class: 'modal-parcelle' },
      h('p', { class: 'note' }, "Le contour officiel de ton terrain sert à donner au plan sa vraie forme et son orientation (nord en haut), indispensable pour calculer les ombres, et à afficher la photo aérienne pour placer tes bâtiments et arbres. Tu peux ajouter plusieurs parcelles si ton jardin en couvre plusieurs."),
      h('h3', {}, 'Par adresse'),
      h('div', { class: 'ligne-champ' }, champAdr, h('button', { class: 'bouton', onclick: chercherAdr }, 'Chercher')), resAdr,
      h('h3', {}, 'Ou par référence cadastrale'),
      h('p', { class: 'note' }, 'Elle figure sur ton avis de taxe foncière ou sur cadastre.gouv.fr.'),
      champCommune, resCommune,
      h('div', { class: 'ligne-champ' }, champSection, champNumero, h('button', { class: 'bouton', onclick: chercherRef }, 'Ajouter')),
      h('h3', {}, 'Parcelles choisies'), liste,
      h('div', { class: 'boutons' }, valider));
    majListe();
    const fermer = App.modal('📍 Ma parcelle cadastrale', contenu, true);
  }

  // ---------- Calcul ----------
  let calculEnCours = false;
  const origineCalcul = () => App.etat.geo || (App.etat.lieu ? { origine: { lat: App.etat.lieu.lat, lon: App.etat.lieu.lon }, parcelles: [] } : null);
  const cleActuelle = () => Soleil.cleCalcul(origineCalcul(), App.plan().objets, App.etat.jardin);
  const aJour = () => !!(App.soleil && App.soleil.cle === cleActuelle());

  async function calculerSoleil() {
    if (calculEnCours) return;
    const geo = origineCalcul();
    if (!geo) { App.toast('Définis ton lieu ou ta parcelle avant de calculer l\'ensoleillement.', true); return; }
    calculEnCours = true;
    const barre = h('div', { class: 'progression' }, h('div', { class: 'progression-texte' }, 'Calcul de la course du soleil et des ombres…'), h('div', { class: 'progression-barre' }, h('span')));
    document.body.append(barre);
    try {
      const res = await Soleil.calculer({
        geo, objets: App.plan().objets, jardin: App.etat.jardin,
        progression: (f) => { barre.querySelector('span').style.width = Math.round(f * 100) + '%'; },
      });
      res.cle = cleActuelle();
      res.nbObstacles = App.plan().objets.filter((o) => Soleil.OBSTACLES[o.t]).length;
      App.soleil = res;
      imagesCache.clear();
      await U.photos.ecrire('grille:soleil', res);
      App.rendre();
      App.toast(res.nbObstacles ? `Ensoleillement calculé avec ${res.nbObstacles} obstacle${res.nbObstacles > 1 ? 's' : ''}.` : "Ensoleillement calculé, mais sans aucun obstacle dessiné : tout le jardin est au plein soleil. Ajoute bâtiments, clôtures et arbres (section Ombre).");
    } catch (e) {
      App.toast('Calcul impossible : ' + e.message, true);
    } finally {
      barre.remove();
      calculEnCours = false;
    }
  }

  async function chargerCache() {
    try {
      U.photos.supprimer('grille:hauteurs').catch(() => {}); // ancienne version (LiDAR)
      const sol = await U.photos.lire('grille:soleil');
      App.soleil = sol && sol.cle && sol.cle.startsWith('v2#') ? sol : null;
    } catch { /* pas de cache */ }
  }

  // ---------- Affichage ----------
  const ECHELLE = [[0, [59, 74, 107]], [2, [94, 111, 163]], [4, [140, 170, 190]], [6, [246, 216, 96]], [8, [244, 166, 42]], [10, [232, 89, 12]]];
  function couleur(hres) {
    for (let i = 1; i < ECHELLE.length; i++) {
      if (hres <= ECHELLE[i][0]) {
        const [a, ca] = ECHELLE[i - 1], [b, cb] = ECHELLE[i];
        const f = (hres - a) / (b - a);
        return ca.map((c, k) => Math.round(c + (cb[k] - c) * f));
      }
    }
    return ECHELLE[ECHELLE.length - 1][1];
  }
  const imagesCache = new Map();
  // mois = 0..11, ou null pour la moyenne d'avril à septembre.
  function image(mois) {
    const sol = App.soleil;
    if (!sol) return null;
    const cle = sol.calcule + ':' + mois;
    if (imagesCache.has(cle)) return imagesCache.get(cle);
    const c = document.createElement('canvas');
    c.width = sol.nx; c.height = sol.ny;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(sol.nx, sol.ny);
    const liste = mois == null ? [3, 4, 5, 6, 7, 8] : [mois];
    for (let k = 0; k < sol.nx * sol.ny; k++) {
      let v = 0;
      for (const m of liste) v += sol.mois[m][k];
      const [r, g, b] = couleur(v / liste.length);
      img.data.set([r, g, b, 255], k * 4);
    }
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL();
    imagesCache.set(cle, url);
    return url;
  }

  function legende() {
    return h('div', { class: 'legende-soleil' }, h('span', {}, 'Soleil direct / jour : '),
      [0, 2, 4, 6, 8, 10].map((v) => h('span', { class: 'case' }, h('span', { class: 'pastille', style: { background: `rgb(${couleur(v).join(',')})` } }), v === 10 ? '10 h+' : `${v} h`)));
  }

  // Petite courbe des heures de soleil semaine par semaine sur la durée de la culture.
  function courbeCulture(p, men, occ, v) {
    const S = (t, a, ...e) => h('svg:' + t, a, ...e);
    const pts = Soleil.courbe(men, occ.debut, occ.fin);
    if (pts.length < 2) return null;
    const W = 270, H = 96, mg = { g: 26, d: 6, h: 8, b: 18 };
    const hMax = Math.max(12, ...pts.map((x) => x.h));
    const X = (d) => mg.g + ((d - occ.debut) / (occ.fin - occ.debut)) * (W - mg.g - mg.d);
    const Y = (v2) => H - mg.b - (v2 / hMax) * (H - mg.h - mg.b);
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'courbe-soleil', role: 'img', 'aria-label': `Heures de soleil par jour de ${fmtDate(occ.debut)} à ${fmtDate(occ.fin)}` });
    if (v) svg.append(S('rect', { x: X(v.crit.debut), y: mg.h, width: Math.max(1, X(v.crit.fin) - X(v.crit.debut)), height: H - mg.h - mg.b, fill: 'rgba(246,216,96,0.18)' }));
    for (const t of [0, 4, 8, 12]) {
      if (t > hMax) continue;
      svg.append(S('line', { x1: mg.g, x2: W - mg.d, y1: Y(t), y2: Y(t), stroke: '#e3e6dc', 'stroke-width': 1 }));
      svg.append(S('text', { x: mg.g - 4, y: Y(t) + 3, 'text-anchor': 'end', class: 'axe' }, `${t}h`));
    }
    svg.append(S('line', { x1: mg.g, x2: W - mg.d, y1: Y(p.soleil), y2: Y(p.soleil), stroke: '#c62828', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
    svg.append(S('text', { x: W - mg.d, y: Y(p.soleil) - 3, 'text-anchor': 'end', class: 'axe rouge' }, `besoin ${p.soleil} h`));
    svg.append(S('polyline', { points: pts.map((x) => `${X(x.date)},${Y(x.h)}`).join(' '), fill: 'none', stroke: '#e08a00', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    for (const x of pts) if (x.h < p.soleil - 1) svg.append(S('circle', { cx: X(x.date), cy: Y(x.h), r: 2.5, fill: '#c62828' }));
    // Repères de mois
    for (let d = new Date(occ.debut.getFullYear(), occ.debut.getMonth() + 1, 1); d < occ.fin; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      svg.append(S('text', { x: X(d), y: H - 5, 'text-anchor': 'middle', class: 'axe' }, MOIS[d.getMonth()].replace('.', '')));
    }
    return svg;
  }

  function blocVerdict(p, rect, objets, annee) {
    if (!App.soleil) return null;
    const occ = App.occupation(rect, objets, annee);
    if (!occ) return null;
    const men = Soleil.mensuel(App.soleil, rect);
    const decal = App.decalage(rect, objets);
    const segs = Calendrier.fenetres(p, App.ctx, annee, decal);
    const v = Soleil.verdict(p, men, occ, segs);
    if (!v) return null;
    const txt = {
      ok: `✅ Assez de soleil : ${v.moyenne.toFixed(1).replace('.', ',')} h/jour en moyenne pendant ${v.crit.texte} (besoin ${v.besoin} h).`,
      juste: `🟠 Juste : ${v.moyenne.toFixed(1).replace('.', ',')} h/jour pendant ${v.crit.texte} pour un besoin de ${v.besoin} h. Ça poussera, avec une récolte plus faible.`,
      insuffisant: `⚠️ Pas assez de soleil : ${v.moyenne.toFixed(1).replace('.', ',')} h/jour pendant ${v.crit.texte} pour un besoin de ${v.besoin} h.`,
    }[v.niveau];
    const faibles = v.faibles.length && v.niveau !== 'ok' ? ` Semaines trop sombres : ${fmtDate(v.faibles[0].date)} → ${fmtDate(v.faibles[v.faibles.length - 1].date)}.` : '';
    return h('div', { class: 'bloc-soleil' },
      h('h4', {}, '☀️ Ensoleillement'),
      courbeCulture(p, men, occ, v),
      h('p', { class: 'verdict verdict-' + v.niveau }, txt, faibles),
      v.trop ? h('p', { class: 'note' }, 'Un peu d\'ombre l\'après-midi en plein été lui éviterait de monter en graines.') : null,
      !aJour() ? h('p', { class: 'note' }, 'Carte à recalculer (obstacles modifiés).') : null);
  }

  // Ombres à un instant précis : voile bleu-nuit sur ce qui est à l'ombre, léger voile doré au soleil.
  function instant(date) {
    const geo = origineCalcul();
    if (!geo) return null;
    const r = Soleil.lumiereInstant({ geo, objets: App.plan().objets, jardin: App.etat.jardin, date });
    const c = document.createElement('canvas');
    c.width = r.nx; c.height = r.ny;
    const ctx = c.getContext('2d'), img = ctx.createImageData(r.nx, r.ny);
    for (let k = 0; k < r.nx * r.ny; k++) {
      const v = r.lum[k];
      img.data.set([Math.round(25 + 230 * v), Math.round(35 + 185 * v), Math.round(70 + 10 * v), Math.round((1 - v) * 150 + v * 35)], k * 4);
    }
    ctx.putImageData(img, 0, 0);
    return { url: c.toDataURL(), pos: r.pos, nx: r.nx, ny: r.ny, pas: r.pas };
  }

  window.Terrain = {
    origineCalcul, instant, contoursLocaux, modalParcelle, calculerSoleil, chargerCache, aJour, image, legende, couleur, blocVerdict, courbeCulture };
})();
