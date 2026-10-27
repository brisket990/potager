/* Ensoleillement du jardin.
 *
 *  - Parcelle cadastrale (API Carto de l'IGN) pour placer et orienter le plan ;
 *  - obstacles dessinés sur le plan avec leur hauteur : bâtiments, murs, clôtures, haies, arbres ;
 *  - les feuillages laissent passer une partie de la lumière, selon l'essence et le mois
 *    (un arbre caduc nu en hiver ne retient presque plus le soleil) ;
 *  - course du soleil au 15 de chaque mois, toutes les 20 minutes, et lancer de rayon
 *    pour savoir quelle part de soleil reçoit chaque carré de 50 cm du jardin.
 *
 * Plan : x vers l'est, y vers le sud (le nord est en haut), en mètres.
 */
(function () {
  const RAD = Math.PI / 180;
  const PAS_SOLEIL = 0.5;      // taille des carrés du calcul (m)
  const PAS_TEMPS = 20;        // minutes

  // Hauteur par défaut (m) et part de lumière arrêtée (1 = opaque) de chaque obstacle.
  const OBSTACLES = { arbre: 8, haie: 1.8, mur: 2, cloture: 1.5, batiment: 6 };
  const DENSITE = { batiment: 1, mur: 1, cloture: 0.35 };

  /* Essences d'arbres : feuilles de tel mois à tel mois (0 = janvier), part de lumière arrêtée
   * en feuilles et sans feuilles (branches seules), hauteur et diamètre de couronne habituels. */
  const ESSENCES = {
    pommier: { n: 'Pommier', caduc: true, feuilles: [3, 9], ete: 0.75, hiver: 0.25, h: 5, d: 5, ic: '🍎' },
    poirier: { n: 'Poirier', caduc: true, feuilles: [3, 9], ete: 0.75, hiver: 0.25, h: 7, d: 4, ic: '🍐' },
    cerisier: { n: 'Cerisier', caduc: true, feuilles: [3, 9], ete: 0.75, hiver: 0.25, h: 8, d: 6, ic: '🍒' },
    prunier: { n: 'Prunier / mirabellier', caduc: true, feuilles: [3, 9], ete: 0.75, hiver: 0.25, h: 5, d: 4, ic: '🌳' },
    pecher: { n: 'Pêcher / abricotier', caduc: true, feuilles: [3, 9], ete: 0.7, hiver: 0.2, h: 4, d: 4, ic: '🍑' },
    figuier: { n: 'Figuier', caduc: true, feuilles: [4, 9], ete: 0.85, hiver: 0.25, h: 5, d: 5, ic: '🌳' },
    noyer: { n: 'Noyer', caduc: true, feuilles: [4, 9], ete: 0.85, hiver: 0.25, h: 15, d: 12, ic: '🌳' },
    noisetier: { n: 'Noisetier', caduc: true, feuilles: [3, 9], ete: 0.8, hiver: 0.3, h: 5, d: 4, ic: '🌳' },
    chene: { n: 'Chêne', caduc: true, feuilles: [4, 10], ete: 0.85, hiver: 0.3, h: 20, d: 15, ic: '🌳' },
    hetre: { n: 'Hêtre / charme', caduc: true, feuilles: [4, 10], ete: 0.95, hiver: 0.3, h: 20, d: 12, ic: '🌳' },
    erable: { n: 'Érable', caduc: true, feuilles: [3, 9], ete: 0.85, hiver: 0.3, h: 15, d: 10, ic: '🍁' },
    bouleau: { n: 'Bouleau', caduc: true, feuilles: [3, 9], ete: 0.6, hiver: 0.2, h: 15, d: 7, ic: '🌳' },
    tilleul: { n: 'Tilleul', caduc: true, feuilles: [4, 9], ete: 0.9, hiver: 0.3, h: 20, d: 12, ic: '🌳' },
    frene: { n: 'Frêne', caduc: true, feuilles: [4, 9], ete: 0.7, hiver: 0.25, h: 20, d: 12, ic: '🌳' },
    marronnier: { n: 'Marronnier', caduc: true, feuilles: [3, 9], ete: 0.9, hiver: 0.3, h: 20, d: 12, ic: '🌰' },
    platane: { n: 'Platane', caduc: true, feuilles: [4, 10], ete: 0.9, hiver: 0.3, h: 25, d: 15, ic: '🌳' },
    peuplier: { n: 'Peuplier', caduc: true, feuilles: [3, 9], ete: 0.7, hiver: 0.25, h: 25, d: 8, ic: '🌳' },
    saule: { n: 'Saule', caduc: true, feuilles: [3, 10], ete: 0.7, hiver: 0.25, h: 10, d: 8, ic: '🌳' },
    robinier: { n: 'Robinier (acacia)', caduc: true, feuilles: [4, 9], ete: 0.55, hiver: 0.2, h: 15, d: 10, ic: '🌳' },
    autre_caduc: { n: 'Autre arbre à feuilles caduques', caduc: true, feuilles: [3, 9], ete: 0.8, hiver: 0.25, h: 8, d: 6, ic: '🌳' },
    sapin: { n: 'Sapin / épicéa', caduc: false, ete: 0.9, h: 20, d: 6, ic: '🌲' },
    pin: { n: 'Pin', caduc: false, ete: 0.7, h: 15, d: 6, ic: '🌲' },
    cypres: { n: 'Cyprès / thuya', caduc: false, ete: 0.95, h: 10, d: 3, ic: '🌲' },
    cedre: { n: 'Cèdre', caduc: false, ete: 0.85, h: 20, d: 12, ic: '🌲' },
    olivier: { n: 'Olivier', caduc: false, ete: 0.6, h: 6, d: 5, ic: '🫒' },
    chene_vert: { n: 'Chêne vert', caduc: false, ete: 0.85, h: 12, d: 8, ic: '🌳' },
    laurier: { n: 'Laurier', caduc: false, ete: 0.9, h: 5, d: 4, ic: '🌳' },
    magnolia: { n: 'Magnolia persistant', caduc: false, ete: 0.9, h: 10, d: 7, ic: '🌳' },
    bambou: { n: 'Bambou', caduc: false, ete: 0.8, h: 6, d: 3, ic: '🎋' },
    autre_persistant: { n: 'Autre arbre persistant', caduc: false, ete: 0.85, h: 8, d: 5, ic: '🌲' },
  };
  const essenceDe = (o) => ESSENCES[o.essence] || (o.caduc ? ESSENCES.autre_caduc : ESSENCES.autre_persistant);

  // Part de lumière arrêtée par un obstacle pendant un mois donné.
  function densite(o, mois) {
    if (DENSITE[o.t] != null) return DENSITE[o.t];
    if (o.t === 'haie') return o.caduc ? (mois >= 3 && mois <= 9 ? 0.85 : 0.4) : 0.9;
    const e = essenceDe(o);
    if (!e.caduc) return e.ete;
    const [debut, fin] = e.feuilles;
    if (mois > debut && mois < fin) return e.ete;
    if (mois === debut || mois === fin) return (e.ete + e.hiver) / 2; // débourrement / chute des feuilles
    return e.hiver;
  }

  // ---------- Position du soleil (formules de l'astronomie de position, comme SunCalc) ----------
  function positionSoleil(ms, lat, lon) {
    const d = ms / 86400000 - 0.5 + 2440588 - 2451545;
    const M = RAD * (357.5291 + 0.98560028 * d);
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + RAD * 102.9372 + Math.PI;
    const e = RAD * 23.4397;
    const dec = Math.asin(Math.sin(L) * Math.sin(e));
    const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    const H = RAD * (280.16 + 360.9856235 * d) + RAD * lon - ra;
    const phi = RAD * lat;
    const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
    const azSud = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    return { az: azSud + Math.PI, el }; // azimut compté depuis le nord, sens horaire
  }

  // ---------- Coordonnées ----------
  const kx = (lat0) => 111320 * Math.cos(lat0 * RAD);
  const KY = 110574;
  const versLocal = (geo, lat, lon) => [(lon - geo.origine.lon) * kx(geo.origine.lat), (geo.origine.lat - lat) * KY];
  const versGeo = (geo, x, y) => ({ lat: geo.origine.lat - y / KY, lon: geo.origine.lon + x / kx(geo.origine.lat) });

  // ---------- Services IGN (adresse et cadastre) ----------
  async function json(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Service IGN indisponible (${r.status})`);
    return r.json();
  }
  async function chercherAdresse(q) {
    const j = await json(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=6&index=address`);
    return j.features.map((f) => ({ label: f.properties.label, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], citycode: f.properties.citycode, city: f.properties.city }));
  }
  async function chercherCommune(q) {
    const j = await json(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=6&index=address&type=municipality`);
    return j.features.map((f) => ({ label: `${f.properties.city || f.properties.label} (${f.properties.postcode || f.properties.citycode})`, citycode: f.properties.citycode }));
  }
  const parcelleDepuis = (f) => ({
    idu: f.properties.idu, commune: f.properties.nom_com, code_insee: f.properties.code_insee,
    section: f.properties.section, numero: f.properties.numero, surface: f.properties.contenance,
    anneaux: (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((p) => p[0]) : [f.geometry.coordinates[0]]),
  });
  async function parcelleAuPoint(lat, lon) {
    const url = (g) => `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(JSON.stringify(g))}`;
    const j = await json(url({ type: 'Point', coordinates: [lon, lat] }));
    if (j.features.length) return parcelleDepuis(j.features[0]);
    // Le point d'adresse tombe souvent sur la rue : on prend la parcelle la plus proche dans un rayon de 25 m.
    const dLat = 25 / KY, dLon = 25 / kx(lat);
    const carre = [[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]];
    const j2 = await json(url({ type: 'Polygon', coordinates: [carre] }));
    if (!j2.features.length) return null;
    const geo = { origine: { lat, lon } };
    const distanceAuPoint = (f) => {
      let min = Infinity;
      for (const a of parcelleDepuis(f).anneaux) {
        const pts = a.map(([x, y]) => versLocal(geo, y, x));
        for (let i = 0; i < pts.length - 1; i++) {
          const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
          const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
          const t = Math.max(0, Math.min(1, -(x1 * (x2 - x1) + y1 * (y2 - y1)) / l2));
          min = Math.min(min, Math.hypot(x1 + t * (x2 - x1), y1 + t * (y2 - y1)));
        }
      }
      return min;
    };
    const proche = j2.features.map((f) => ({ f, d: distanceAuPoint(f) })).sort((a, b) => a.d - b.d)[0];
    return parcelleDepuis(proche.f);
  }
  async function parcelleParReference(code_insee, section, numero) {
    const sec = section.trim().toUpperCase().padStart(2, '0');
    const num = String(numero).trim().padStart(4, '0');
    const j = await json(`https://apicarto.ign.fr/api/cadastre/parcelle?code_insee=${code_insee}&section=${sec}&numero=${num}`);
    return j.features.length ? parcelleDepuis(j.features[0]) : null;
  }

  function dansPolygone(x, y, anneau) {
    let dedans = false;
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
      const [xi, yi] = anneau[i], [xj, yj] = anneau[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  }

  // ---------- Grille des obstacles ----------
  // Pour un mois : hauteur du plus haut obstacle par carré de 50 cm, et quel obstacle c'est.
  function grilleObstacles(objets, jardin, mois) {
    const obs = objets.filter((o) => OBSTACLES[o.t]);
    let x0 = 0, y0 = 0, x1 = jardin.largeur, y1 = jardin.hauteur;
    for (const o of obs) {
      const b = G.boite(o);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
    const pas = Math.max(PAS_SOLEIL, Math.max(x1 - x0, y1 - y0) / 1200);
    const nx = Math.ceil((x1 - x0) / pas), ny = Math.ceil((y1 - y0) / pas);
    const h = new Float32Array(nx * ny);
    const id = new Int16Array(nx * ny).fill(-1);
    const dens = obs.map((o) => densite(o, mois));
    let hMax = 0;
    obs.forEach((o, k) => {
      const haut = o.hauteur ?? OBSTACLES[o.t];
      hMax = Math.max(hMax, haut);
      const b = G.boite(o);
      const i0 = Math.max(0, Math.floor((b.x - x0) / pas)), i1 = Math.min(nx - 1, Math.floor((b.x + b.w - x0) / pas));
      const j0 = Math.max(0, Math.floor((b.y - y0) / pas)), j1 = Math.min(ny - 1, Math.floor((b.y + b.h - y0) / pas));
      let touche = false;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (!G.dedans([x0 + (i + 0.5) * pas, y0 + (j + 0.5) * pas], o)) continue;
        touche = true;
        const c = j * nx + i;
        if (haut > h[c]) { h[c] = haut; id[c] = k; }
      }
      // Un obstacle plus fin qu'un carré (clôture de 5 cm) occupe au moins la ligne de carrés qu'il traverse.
      if (!touche) {
        const n = Math.ceil(Math.max(o.w, o.h) / (pas / 2));
        for (let t = 0; t <= n; t++) {
          const [px, py] = o.w >= o.h ? G.versMonde(o, (o.w * t) / n, o.h / 2) : G.versMonde(o, o.w / 2, (o.h * t) / n);
          const i = Math.floor((px - x0) / pas), j = Math.floor((py - y0) / pas);
          if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
          const c = j * nx + i;
          if (haut > h[c]) { h[c] = haut; id[c] = k; }
        }
      }
    });
    return { x0, y0, pas, nx, ny, h, id, dens, hMax };
  }

  // Clé qui change dès qu'un élément influençant l'ombre change.
  function cleCalcul(geo, objets, jardin) {
    const obs = objets.filter((o) => OBSTACLES[o.t])
      .map((o) => [o.t, o.x, o.y, o.w, o.h, o.rot || 0, o.hauteur ?? '', o.caduc ? 1 : 0, o.essence || ''].join(':')).sort().join('|');
    return ['v2', geo ? `${geo.origine.lat.toFixed(5)},${geo.origine.lon.toFixed(5)}` : 'sans-geo', jardin.largeur, jardin.hauteur, obs].join('#');
  }

  // Part du soleil (0 à 1) qui atteint le sol au point (cx, cy) quand le soleil est dans la direction p.
  function transmission(g, cx, cy, p, vus) {
    const gi = Math.floor((cx - g.x0) / g.pas), gj = Math.floor((cy - g.y0) / g.pas);
    const propre = g.id[gj * g.nx + gi];
    // Sous un arbre ou un toit : seule la lumière qui traverse cet obstacle arrive au sol.
    let T = propre >= 0 ? 1 - g.dens[propre] : 1;
    if (T <= 0.02) return 0;
    vus.length = 0;
    if (propre >= 0) vus.push(propre);
    const dMax = g.hMax / p.tan;
    for (let d = g.pas; d <= dMax && T > 0.02; d += g.pas) {
      const ii = Math.floor((cx + p.ux * d - g.x0) / g.pas), jj = Math.floor((cy + p.uy * d - g.y0) / g.pas);
      if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) break;
      const c = jj * g.nx + ii;
      const k = g.id[c];
      // Chaque obstacle traversé n'atténue qu'une fois (feuillage plus ou moins dense, mur opaque).
      if (k >= 0 && g.h[c] > d * p.tan && !vus.includes(k)) { T *= 1 - g.dens[k]; vus.push(k); }
    }
    return T;
  }

  // Lumière reçue par chaque carré de 50 cm à un instant précis (pour faire défiler la journée).
  let cacheGrille = { cle: null, g: null };
  function lumiereInstant({ geo, objets, jardin, date }) {
    const mois = date.getMonth();
    const cle = cleCalcul(geo, objets, jardin) + '|' + mois;
    if (cacheGrille.cle !== cle) cacheGrille = { cle, g: grilleObstacles(objets, jardin, mois) };
    const g = cacheGrille.g;
    const pos = positionSoleil(date.getTime(), geo.origine.lat, geo.origine.lon);
    const nx = Math.ceil(jardin.largeur / PAS_SOLEIL), ny = Math.ceil(jardin.hauteur / PAS_SOLEIL);
    const lum = new Float32Array(nx * ny);
    if (pos.el > 0.5 * RAD) {
      const p = { ux: Math.sin(pos.az), uy: -Math.cos(pos.az), tan: Math.tan(pos.el) };
      const vus = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) lum[j * nx + i] = transmission(g, (i + 0.5) * PAS_SOLEIL, (j + 0.5) * PAS_SOLEIL, p, vus);
    }
    return { pos, nx, ny, pas: PAS_SOLEIL, lum };
  }

  // Heures de lever et de coucher (minutes depuis minuit, heure locale) pour un jour donné.
  function leverCoucher(geo, date) {
    let lever = null, coucher = null;
    for (let t = 0; t <= 24 * 60; t += 5) {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, t);
      if (positionSoleil(d.getTime(), geo.origine.lat, geo.origine.lon).el > 0) { if (lever == null) lever = t; coucher = t; }
    }
    return { lever, coucher };
  }

  // Heures de soleil direct par carré de 50 cm, pour le 15 de chaque mois.
  async function calculer({ geo, objets, jardin, progression }) {
    const nx = Math.ceil(jardin.largeur / PAS_SOLEIL), ny = Math.ceil(jardin.hauteur / PAS_SOLEIL);
    const mois = [];
    const lat = geo.origine.lat, lon = geo.origine.lon;
    const annee = new Date().getFullYear();
    const vus = [];
    for (let m = 0; m < 12; m++) {
      const g = grilleObstacles(objets, jardin, m);
      const heures = new Float32Array(nx * ny);
      const positions = [];
      const debutJour = Date.UTC(annee, m, 15);
      for (let t = 0; t < 24 * 60; t += PAS_TEMPS) {
        const s = positionSoleil(debutJour + (t + PAS_TEMPS / 2) * 60000, lat, lon);
        if (s.el > 2 * RAD) positions.push({ ux: Math.sin(s.az), uy: -Math.cos(s.az), tan: Math.tan(s.el) });
      }
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const cx = (i + 0.5) * PAS_SOLEIL, cy = (j + 0.5) * PAS_SOLEIL;
          let lumiere = 0;
          for (const p of positions) lumiere += transmission(g, cx, cy, p, vus);
          heures[j * nx + i] = (lumiere * PAS_TEMPS) / 60;
        }
      }
      mois.push(heures);
      if (progression) progression((m + 1) / 12);
      await new Promise((ok) => setTimeout(ok, 0));
    }
    return { pas: PAS_SOLEIL, nx, ny, mois, calcule: Date.now() };
  }

  // ---------- Lecture du résultat ----------
  // Moyenne mensuelle des heures de soleil sur un rectangle du plan (12 valeurs).
  function mensuel(sol, r) {
    const { pas, nx, ny } = sol;
    const b = G.boite(r);
    const i0 = Math.max(0, Math.floor(b.x / pas)), i1 = Math.min(nx - 1, Math.ceil((b.x + b.w) / pas) - 1);
    const j0 = Math.max(0, Math.floor(b.y / pas)), j1 = Math.min(ny - 1, Math.ceil((b.y + b.h) / pas) - 1);
    // Carrés dont le centre est dans le rectangle (pivoté ou non) ; à défaut, le carré du centre.
    const cases = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!r.rot || G.dedans([(i + 0.5) * pas, (j + 0.5) * pas], r)) cases.push(j * nx + i);
    }
    if (!cases.length) {
      const [cx, cy] = G.centre(r);
      const i = Math.min(nx - 1, Math.max(0, Math.floor(cx / pas))), j = Math.min(ny - 1, Math.max(0, Math.floor(cy / pas)));
      cases.push(j * nx + i);
    }
    return sol.mois.map((m) => cases.reduce((s, k) => s + m[k], 0) / cases.length);
  }
  // Interpolation entre les 15 de chaque mois.
  function heuresAuJour(men, date) {
    const m = date.getMonth(), j = date.getDate();
    const avant = j >= 15 ? m : (m + 11) % 12;
    const apres = (avant + 1) % 12;
    const d0 = new Date(date.getFullYear() - (j < 15 && m === 0 ? 1 : 0), avant, 15);
    const f = Math.min(1, Math.max(0, (date - d0) / (30.4 * 86400000)));
    return men[avant] * (1 - f) + men[apres] * f;
  }
  function courbe(men, debut, fin) {
    const pts = [];
    for (let d = new Date(debut); d <= fin; d = U.ajouterJours(d, 7)) pts.push({ date: d, h: heuresAuJour(men, d) });
    return pts;
  }
  function moyennePeriode(men, debut, fin) {
    const pts = courbe(men, debut, fin);
    return pts.length ? pts.reduce((s, p) => s + p.h, 0) / pts.length : heuresAuJour(men, debut);
  }

  // Période pendant laquelle le soleil compte pour une culture.
  function periodeCritique(p, occ, segs) {
    if (!occ) return null;
    if (p.critique === 'fruit') {
      const rec = segs.filter((s) => s.type === 'rec' && s.fin >= occ.debut).sort((a, b) => a.debut - b.debut)[0];
      if (rec) {
        const debut = U.ajouterJours(rec.debut, -28);
        return { debut: debut < occ.debut ? occ.debut : debut, fin: rec.fin < occ.fin ? rec.fin : occ.fin, texte: p.cat === 'fleur' ? 'floraison' : 'floraison et fruits' };
      }
    }
    return { debut: occ.debut, fin: occ.fin, texte: 'toute la culture' };
  }

  function verdict(p, men, occ, segs) {
    const crit = periodeCritique(p, occ, segs);
    if (!crit) return null;
    const pts = courbe(men, crit.debut, crit.fin);
    const moy = pts.reduce((s, x) => s + x.h, 0) / Math.max(1, pts.length);
    const faibles = pts.filter((x) => x.h < p.soleil - 1);
    let niveau = 'ok';
    if (moy < p.soleil - 1.5 || faibles.length > pts.length * 0.5) niveau = 'insuffisant';
    else if (moy < p.soleil || faibles.length > pts.length * 0.2) niveau = 'juste';
    const ete = [5, 6, 7].map((m) => men[m]);
    const trop = p.ombreEte && Math.max(...ete) > 9;
    return { niveau, moyenne: moy, besoin: p.soleil, crit, faibles, trop };
  }

  window.Soleil = {
    OBSTACLES, ESSENCES, essenceDe, densite, positionSoleil, versLocal, versGeo, chercherAdresse, chercherCommune,
    parcelleAuPoint, parcelleParReference, grilleObstacles, cleCalcul, calculer, lumiereInstant, leverCoucher, mensuel, heuresAuJour, courbe,
    moyennePeriode, periodeCritique, verdict, dansPolygone,
  };
})();
