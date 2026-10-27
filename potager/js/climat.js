/* Climat local à partir de la position GPS, via Open-Meteo (gratuit, sans clé).
 *
 *  - 20 ans d'historique (réanalyse ERA5) → dates de dernière / première gelée
 *    et courbe moyenne de température du sol au fil de l'année ;
 *  - prévisions à 16 jours → alertes gel / chaleur et température du sol actuelle.
 */
(function () {
  const ANNEES_HISTO = 20;
  const DUREE_CACHE_PREV = 3 * 3600 * 1000;

  function quantile(valeurs, q) {
    const v = [...valeurs].sort((a, b) => a - b);
    const pos = (v.length - 1) * q;
    const bas = Math.floor(pos);
    return Math.round(v[bas] + (v[Math.min(bas + 1, v.length - 1)] - v[bas]) * (pos - bas));
  }

  function geolocaliser() {
    return new Promise((ok, ko) => {
      if (!navigator.geolocation) return ko(new Error("La géolocalisation n'est pas disponible dans ce navigateur."));
      navigator.geolocation.getCurrentPosition(
        (p) => ok({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }),
        (e) => ko(new Error(e.code === 1 ? 'Accès à la position refusé.' : 'Position introuvable.')),
        { enableHighAccuracy: false, timeout: 15000 },
      );
    });
  }

  async function chercherCommune(nom) {
    const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nom)}&count=8&language=fr`;
    const r = await fetch(u);
    if (!r.ok) throw new Error('Recherche impossible');
    const j = await r.json();
    return (j.results || []).map((x) => ({
      nom: x.name, detail: [x.admin2, x.admin1, x.country].filter(Boolean).join(', '),
      lat: x.latitude, lon: x.longitude, elev: x.elevation,
    }));
  }

  async function chargerClimat(lieu, forcer = false) {
    const cle = `${lieu.lat.toFixed(2)},${lieu.lon.toFixed(2)}`;
    const cache = U.stock.lire('climat', null);
    if (!forcer && cache && cache.cle === cle) return cache;

    const fin = new Date().getFullYear() - 1;
    const debut = fin - ANNEES_HISTO + 1;
    const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lieu.lat}&longitude=${lieu.lon}` +
      `&start_date=${debut}-01-01&end_date=${fin}-12-31` +
      '&daily=temperature_2m_min,temperature_2m_max,soil_temperature_0_to_7cm_mean&timezone=auto';
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Historique météo indisponible (${r.status})`);
    const j = await r.json();
    const { time, temperature_2m_min: tmin, temperature_2m_max: tmax, soil_temperature_0_to_7cm_mean: sol } = j.daily;

    // Par année : dernier jour de gel avant le 1er juillet, premier jour de gel après.
    const parAnnee = {};
    const sommeSol = new Array(367).fill(0), nbSol = new Array(367).fill(0);
    const mois = Array.from({ length: 12 }, () => ({ tmin: 0, tmax: 0, n: 0 }));
    for (let i = 0; i < time.length; i++) {
      const [a, m, d] = time[i].split('-').map(Number);
      const jour = U.jourDeLAnnee(new Date(a, m - 1, d));
      const an = (parAnnee[a] ||= { dg: 0, pg: 367 });
      if (tmin[i] != null && tmin[i] <= 0) {
        if (m <= 6) an.dg = Math.max(an.dg, jour);
        else an.pg = Math.min(an.pg, jour);
      }
      if (sol[i] != null) { sommeSol[jour] += sol[i]; nbSol[jour]++; }
      if (tmin[i] != null) { mois[m - 1].tmin += tmin[i]; mois[m - 1].tmax += tmax[i]; mois[m - 1].n++; }
    }
    const annees = Object.values(parAnnee);
    const dgs = annees.map((a) => a.dg), pgs = annees.map((a) => a.pg);

    // Moyenne du sol par jour de l'année, lissée sur 15 jours (le 366e jour = le 365e).
    const brut = [];
    for (let jr = 1; jr <= 366; jr++) brut[jr] = nbSol[jr] ? sommeSol[jr] / nbSol[jr] : null;
    if (brut[366] == null) brut[366] = brut[365];
    const solLisse = [null];
    for (let jr = 1; jr <= 366; jr++) {
      let s = 0, n = 0;
      for (let k = -7; k <= 7; k++) {
        const v = brut[((jr + k - 1 + 366) % 366) + 1];
        if (v != null) { s += v; n++; }
      }
      solLisse[jr] = +(s / n).toFixed(1);
    }

    const climat = {
      cle, lat: j.latitude, lon: j.longitude, elev: j.elevation, periode: [debut, fin],
      dgAnnees: dgs, pgAnnees: pgs,
      sansGel: dgs.filter((x) => x === 0).length,
      sol: solLisse,
      mois: mois.map((x) => ({ tmin: +(x.tmin / x.n).toFixed(1), tmax: +(x.tmax / x.n).toFixed(1) })),
      calcule: Date.now(),
    };
    U.stock.ecrire('climat', climat);
    return climat;
  }

  // Dates de gelée selon le niveau de prudence choisi (risque = probabilité de ne plus avoir de gel).
  function datesGel(climat, risque) {
    return {
      dg: Math.max(1, quantile(climat.dgAnnees, risque)),
      pg: Math.min(366, quantile(climat.pgAnnees, 1 - risque)),
    };
  }

  // Sans lieu : climat type du centre-nord de la France (dernière gelée mi-avril).
  function climatParDefaut() {
    const sol = [null];
    for (let jr = 1; jr <= 366; jr++) sol[jr] = +(11.5 - 8.5 * Math.cos((2 * Math.PI * (jr - 25)) / 365)).toFixed(1);
    return { cle: 'defaut', defaut: true, dgAnnees: [95, 105, 115], pgAnnees: [295, 305, 315], sansGel: 0, sol, mois: null };
  }

  async function chargerPrevisions(lieu, forcer = false) {
    const cle = `${lieu.lat.toFixed(2)},${lieu.lon.toFixed(2)}`;
    const cache = U.stock.lire('previsions', null);
    if (!forcer && cache && cache.cle === cle && Date.now() - cache.recu < DUREE_CACHE_PREV) return cache;

    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lieu.lat}&longitude=${lieu.lon}` +
      '&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,weather_code' +
      '&hourly=soil_temperature_6cm&forecast_days=16&timezone=auto';
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Prévisions indisponibles (${r.status})`);
    const j = await r.json();
    const d = j.daily;
    const solParJour = {};
    j.hourly.time.forEach((t, i) => {
      const v = j.hourly.soil_temperature_6cm[i];
      if (v == null) return;
      const jour = t.slice(0, 10);
      (solParJour[jour] ||= []).push(v);
    });
    const moy = (a) => (a && a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : null);
    const prev = {
      cle, recu: Date.now(),
      jours: d.time.map((t, i) => ({
        date: t, tmin: d.temperature_2m_min[i], tmax: d.temperature_2m_max[i],
        pluie: d.precipitation_sum[i], code: d.weather_code[i], sol: moy(solParJour[t]),
      })),
    };
    U.stock.ecrire('previsions', prev);
    return prev;
  }

  // Codes météo OMS → icône et libellé.
  function meteo(code) {
    if (code === 0) return ['☀️', 'Ensoleillé'];
    if (code <= 2) return ['🌤️', 'Éclaircies'];
    if (code === 3) return ['☁️', 'Couvert'];
    if (code <= 48) return ['🌫️', 'Brouillard'];
    if (code <= 57) return ['🌦️', 'Bruine'];
    if (code <= 67) return ['🌧️', 'Pluie'];
    if (code <= 77) return ['❄️', 'Neige'];
    if (code <= 82) return ['🌧️', 'Averses'];
    if (code <= 86) return ['🌨️', 'Averses de neige'];
    return ['⛈️', 'Orage'];
  }

  window.Climat = { geolocaliser, chercherCommune, chargerClimat, datesGel, climatParDefaut, chargerPrevisions, meteo };
})();
