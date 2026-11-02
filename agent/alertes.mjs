/* Alertes du potager : gel, forte chaleur, manque d'eau, orage.
 * Une alerte n'est levée que si des cultures concernées sont en terre à ce moment-là (d'après le plan et le
 * calendrier de chaque culture), en tenant compte des abris. Chaque alerte a un identifiant stable [type:date]
 * pour que l'agent ne prévienne qu'une fois. */
import { App, U, PLANTES_PAR_ID } from './noyau.mjs';

const { fmtDate, isoDate, lireIso, aujourdhui, ajouterJours } = U;
const PROTECTION = { serre: 3, tunnel: 2, chassis: 1 }; // degrés gagnés la nuit sous chaque abri (ordre de grandeur)
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const jourNomme = (d) => `${JOURS[d.getDay()]} ${fmtDate(d)}`;
const arrondi = (v) => Math.round(v);

// Météo utile aux alertes : 7 jours passés (pluie, évaporation) et 4 jours à venir.
export async function meteoAlertes(lieu) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lieu.lat}&longitude=${lieu.lon}` +
    '&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,et0_fao_evapotranspiration,weather_code' +
    '&past_days=7&forecast_days=4&timezone=auto';
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Météo indisponible (${r.status})`);
  const d = (await r.json()).daily;
  return d.time.map((date, i) => ({
    date, tmin: d.temperature_2m_min[i], tmax: d.temperature_2m_max[i], pluie: d.precipitation_sum[i] || 0,
    et0: d.et0_fao_evapotranspiration[i] || 0, code: d.weather_code[i],
  }));
}

// Cultures du plan en terre à une date donnée, avec leur abri éventuel.
export function culturesEnPlace(date) {
  const res = new Map();
  for (const annee of [date.getFullYear() - 1, date.getFullYear(), date.getFullYear() + 1]) {
    const plan = App.etat.plans[annee];
    if (!plan) continue;
    for (const o of plan.objets) {
      const p = o.t === 'plante' && PLANTES_PAR_ID[o.pid];
      if (!p || res.has(o.id)) continue;
      const occ = App.occupation(o, plan.objets, annee);
      if (!occ || occ.debut > date || occ.fin < date) continue;
      res.set(o.id, { o, p, abri: App.abriDe(o, plan.objets), nb: App.nbPlants(o) });
    }
  }
  return [...res.values()];
}

const nomsCultures = (l) => [...new Map(l.map((c) => [c.p.id + (c.abri ? '|' + c.abri.t : ''), c])).values()]
  .map((c) => `${c.p.n}${c.abri ? ` (sous ${c.abri.nom || c.abri.t})` : ''}`).join(', ');

// Une culture souffre-t-elle d'une nuit à tmin (°C) ?
function exposeeAuGel(c, tmin) {
  const ressenti = tmin + (c.abri ? PROTECTION[c.abri.t] || 0 : 0);
  if (c.p.gel === 'tendre') return ressenti <= 1;
  if (c.p.gel === 'demi') return ressenti <= -3;
  return ressenti <= -10;
}

export function calculerAlertes(meteo) {
  const ajd = aujourdhui();
  const iAjd = meteo.findIndex((j) => j.date === isoDate(ajd));
  if (iAjd < 0) return [];
  const aVenir = meteo.slice(iAjd, iAjd + 3); // aujourd'hui et les 2 jours suivants
  const alertes = [];

  // Gel : la mini du jour J est atteinte au petit matin, on protège donc la veille au soir.
  // On regarde les deux nuits à venir (celle de ce matin est passée).
  for (const j of aVenir.slice(1)) {
    if (j.tmin > 1.5) continue;
    const d = lireIso(j.date);
    const exposees = culturesEnPlace(d).filter((c) => exposeeAuGel(c, j.tmin));
    if (!exposees.length) continue;
    const veille = ajouterJours(d, -1);
    const nuit = `${isoDate(veille) === isoDate(ajd) ? 'cette nuit, ' : ''}la nuit du ${jourNomme(veille)} au ${jourNomme(d)}`;
    alertes.push({
      cle: `gel:${j.date}`,
      texte: `${j.tmin <= 0 ? 'Gel' : 'Gelée blanche possible'} ${nuit} : ${arrondi(j.tmin)} °C au plus bas. ` +
        `Cultures exposées : ${nomsCultures(exposees)}. Protéger (voile d'hivernage, cloche, paillage) ou rentrer les pots la veille au soir.`,
    });
  }

  // Forte chaleur.
  for (const j of aVenir) {
    if (j.tmax < 30) continue;
    const d = lireIso(j.date);
    const enPlace = culturesEnPlace(d);
    if (!enPlace.length) continue;
    const sousAbri = enPlace.filter((c) => c.abri && c.abri.t !== 'chassis');
    alertes.push({
      cle: `chaleur:${j.date}`,
      texte: `Forte chaleur ${j.date === isoDate(ajd) ? "aujourd'hui" : jourNomme(d)} : ${arrondi(j.tmax)} °C. Arroser tôt le matin ou le soir au pied, pailler, ombrer semis et salades.` +
        (sousAbri.length ? ` Aérer largement ${[...new Set(sousAbri.map((c) => c.abri.nom || c.abri.t))].join(' et ')}.` : ''),
    });
  }

  // Manque d'eau : pluie moins évaporation des 7 derniers jours, sans pluie annoncée.
  const passe = meteo.slice(Math.max(0, iAjd - 7), iAjd);
  const bilan = passe.reduce((s, j) => s + j.pluie - j.et0, 0);
  const pluiePrevue = meteo.slice(iAjd, iAjd + 2).reduce((s, j) => s + j.pluie, 0);
  const cultivees = culturesEnPlace(ajd).filter((c) => !c.p.per && !(c.abri && c.abri.t === 'serre'));
  if (passe.length >= 5 && bilan <= -20 && pluiePrevue < 5 && cultivees.length) {
    // Rappel tous les 3 jours tant que la sécheresse dure.
    const bloc = Math.floor(ajd.getTime() / (3 * U.JOUR));
    alertes.push({
      cle: `arrosage:${isoDate(new Date(bloc * 3 * U.JOUR))}`,
      texte: `Sol qui s'assèche : il manque environ ${Math.round(-bilan / 5) * 5} mm d'eau sur 7 jours (pluie moins évaporation) et presque pas de pluie annoncée. ` +
        `Arroser copieusement au pied (plutôt 2 fois par semaine en profondeur que peu tous les jours) : ${nomsCultures(cultivees)}.`,
    });
  }

  // Orage, surtout avec grêle.
  for (const j of meteo.slice(iAjd, iAjd + 2)) {
    if (j.code < 95) continue;
    const d = lireIso(j.date);
    if (!culturesEnPlace(d).length) continue;
    alertes.push({
      cle: `orage:${j.date}`,
      texte: `Orage${j.code >= 96 ? ' avec risque de grêle' : ''} annoncé ${j.date === isoDate(ajd) ? "aujourd'hui" : jourNomme(d)}. Tuteurer ce qui est haut, abriter semis et jeunes plants, vider les soucoupes ensuite.`,
    });
  }

  return alertes.sort((a, b) => a.cle.localeCompare(b.cle));
}

// Texte stable (sans horodatage) : la surveillance d'Hermes ne réveille l'agent que s'il change.
export const texteAlertes = (alertes) => (alertes.length ? alertes.map((a) => `[${a.cle}] ${a.texte}`).join('\n') : 'Aucune alerte.');
