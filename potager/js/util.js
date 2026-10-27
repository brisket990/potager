/* Petits outils partagés : création d'éléments, dates, texte, stockage. */
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // h('div', {class: 'x', onclick: fn}, enfant1, enfant2...)
  function h(tag, attrs, ...enfants) {
    const svg = tag.startsWith('svg:');
    const el = svg ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value' && !svg) el.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    ajouter(el, enfants);
    return el;
  }
  function ajouter(el, enfants) {
    for (const e of enfants.flat(Infinity)) {
      if (e == null || e === false) continue;
      el.append(e instanceof Node ? e : document.createTextNode(String(e)));
    }
  }

  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const JOUR = 86400000;

  const aujourdhui = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const ajouterJours = (d, n) => new Date(d.getTime() + n * JOUR);
  const dateDuJour = (annee, jour) => new Date(annee, 0, jour); // jour 1 = 1er janvier
  const jourDeLAnnee = (d) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / JOUR);
  const fmtDate = (d) => d ? `${d.getDate()} ${MOIS[d.getMonth()]}` : '–';
  const fmtDateLongue = (d) => d ? `${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}` : '–';
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const lireIso = (s) => { if (!s) return null; const [a, m, j] = s.split('-').map(Number); return new Date(a, m - 1, j); };
  // « mi-avril », « début mai »... plus parlant qu'une date au jour près pour un calendrier.
  function periode(d) {
    const j = d.getDate();
    const pre = j <= 10 ? 'début' : j <= 20 ? 'mi-' : 'fin';
    return pre === 'mi-' ? `mi-${MOIS_LONGS[d.getMonth()]}` : `${pre} ${MOIS_LONGS[d.getMonth()]}`;
  }

  // Minuscules, sans accents ni ponctuation, pour comparer des noms.
  const normaliser = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[œ]/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim();

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  // Stockage local : l'état JSON dans localStorage, les photos dans IndexedDB.
  const stock = {
    lire(cle, defaut) {
      try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; }
    },
    ecrire(cle, val) {
      try { localStorage.setItem(cle, JSON.stringify(val)); return true; } catch (e) { console.error(e); return false; }
    },
  };

  let dbPromesse = null;
  function db() {
    if (!dbPromesse) {
      dbPromesse = new Promise((ok, ko) => {
        const r = indexedDB.open('potager', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('photos');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error);
      });
    }
    return dbPromesse;
  }
  async function idb(mode, fn) {
    const base = await db();
    return new Promise((ok, ko) => {
      const tx = base.transaction('photos', mode);
      const req = fn(tx.objectStore('photos'));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = () => ko(tx.error);
    });
  }
  const photos = {
    ecrire: (id, blob) => idb('readwrite', (s) => s.put(blob, id)),
    lire: (id) => idb('readonly', (s) => s.get(id)),
    supprimer: (id) => idb('readwrite', (s) => s.delete(id)),
    toutes: async () => {
      const cles = await idb('readonly', (s) => s.getAllKeys());
      const res = {};
      for (const k of cles || []) res[k] = await photos.lire(k);
      return res;
    },
  };

  // Réduit une photo à 1280 px de côté maximum, en JPEG.
  function reduirePhoto(fichier, max = 1280) {
    return new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        c.toBlob((b) => (b ? ok(b) : ko(new Error('conversion impossible'))), 'image/jpeg', 0.85);
      };
      img.onerror = () => ko(new Error('image illisible'));
      img.src = URL.createObjectURL(fichier);
    });
  }
  const blobVersDataUrl = (b) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
  const dataUrlVersBlob = (u) => fetch(u).then((r) => r.blob());

  function telecharger(nom, contenu, type = 'application/json') {
    const a = h('a', { href: URL.createObjectURL(new Blob([contenu], { type })), download: nom });
    document.body.append(a); a.click(); a.remove();
  }

  /* Géométrie des objets du plan : rectangle {x, y, w, h} (non pivoté) + angle rot (degrés, sens horaire)
   * autour de son centre. Les objets ronds (pots, arbres) ignorent l'angle. */
  const G = {
    centre: (o) => [o.x + o.w / 2, o.y + o.h / 2],
    // Coordonnées dans le repère de l'objet (0..w, 0..h).
    versLocal(o, x, y) {
      const [cx, cy] = G.centre(o);
      if (!o.rot) return [x - o.x, y - o.y];
      const a = (-o.rot * Math.PI) / 180, dx = x - cx, dy = y - cy;
      return [dx * Math.cos(a) - dy * Math.sin(a) + o.w / 2, dx * Math.sin(a) + dy * Math.cos(a) + o.h / 2];
    },
    versMonde(o, lx, ly) {
      const [cx, cy] = G.centre(o);
      if (!o.rot) return [o.x + lx, o.y + ly];
      const a = (o.rot * Math.PI) / 180, dx = lx - o.w / 2, dy = ly - o.h / 2;
      return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
    },
    coins: (o, marge = 0) => [[-marge, -marge], [o.w + marge, -marge], [o.w + marge, o.h + marge], [-marge, o.h + marge]].map(([x, y]) => G.versMonde(o, x, y)),
    boite(o) {
      const c = G.coins(o), xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    },
    dedans([x, y], o) {
      if (o.t === 'pot' || o.t === 'eau' || o.t === 'arbre') return Math.hypot(x - (o.x + o.w / 2), y - (o.y + o.h / 2)) <= o.w / 2;
      const [lx, ly] = G.versLocal(o, x, y);
      return lx >= 0 && lx <= o.w && ly >= 0 && ly <= o.h;
    },
    // Recouvrement de deux rectangles pivotés (axes séparateurs), avec une marge éventuelle.
    chevauche(a, b, marge = 0) {
      const pa = G.coins(a, marge), pb = G.coins(b);
      for (const poly of [pa, pb]) {
        for (let i = 0; i < 2; i++) {
          const [x1, y1] = poly[i], [x2, y2] = poly[i + 1];
          const ax = y2 - y1, ay = x1 - x2;
          const proj = (p) => p.map(([x, y]) => x * ax + y * ay);
          const A = proj(pa), B = proj(pb);
          if (Math.max(...A) <= Math.min(...B) + 1e-6 || Math.max(...B) <= Math.min(...A) + 1e-6) return false;
        }
      }
      return true;
    },
    // Plus courte distance entre deux rectangles pivotés (0 s'ils se touchent).
    distance(a, b) {
      if (G.chevauche(a, b)) return 0;
      const pa = G.coins(a), pb = G.coins(b);
      const seg = ([px, py], [x1, y1], [x2, y2]) => {
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2));
        return Math.hypot(px - x1 - t * (x2 - x1), py - y1 - t * (y2 - y1));
      };
      let d = Infinity;
      for (const [p, q] of [[pa, pb], [pb, pa]]) for (const pt of p) for (let i = 0; i < 4; i++) d = Math.min(d, seg(pt, q[i], q[(i + 1) % 4]));
      return d;
    },
  };

  window.G = G;
  window.U = {
    h, ajouter, MOIS, MOIS_LONGS, JOUR, aujourdhui, ajouterJours, dateDuJour, jourDeLAnnee,
    fmtDate, fmtDateLongue, isoDate, lireIso, periode, normaliser, uid, stock, photos,
    reduirePhoto, blobVersDataUrl, dataUrlVersBlob, telecharger,
  };
})();
