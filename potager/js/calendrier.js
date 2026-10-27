/* Calcul des périodes de semis, plantation et récolte pour un lieu donné.
 *
 * Chaque plante décrit ses fenêtres en semaines autour des dates de gelée ;
 * ici on les convertit en vraies dates, on vérifie la température du sol
 * pour les semis en place, et on décale le tout si la culture est abritée
 * (serre, tunnel, châssis).
 */
(function () {
  const { ajouterJours, dateDuJour } = U;

  // Décalage (en semaines) apporté par chaque type d'abri.
  const ABRIS = { serre: 6, tunnel: 4, chassis: 2 };

  const TYPES = {
    si: { n: "Semis à l'abri", c: '#8e6bbf' },
    sd: { n: 'Semis en place', c: '#4f9d4a' },
    sa: { n: 'Semis de fin de saison', c: '#2f8f83' },
    pl: { n: 'Plantation', c: '#e38b2c' },
    rec: { n: 'Récolte', c: '#d0453a' },
  };
  function libelle(type, plante) {
    if (type === 'rec' && (plante.cat === 'fleur' || plante.cat === 'engrais')) return 'Floraison';
    if (type === 'sa' && plante.achat && plante.achat !== 'graine') return "Plantation d'automne";
    return TYPES[type].n;
  }
  function couleur(type, plante) {
    if (type === 'rec' && (plante.cat === 'fleur' || plante.cat === 'engrais')) return '#d45a9a';
    return TYPES[type].c;
  }

  function contexte(climat, risque) {
    const { dg, pg } = Climat.datesGel(climat, risque);
    return { dg, pg, sol: climat.sol, defaut: !!climat.defaut };
  }

  // Premier jour de l'année où le sol atteint le seuil (moyenne sur 20 ans).
  function jourSol(ctx, seuil, decal = 0) {
    for (let j = 15; j <= 260; j++) {
      const v = ctx.sol[Math.min(366, j + decal * 7)];
      if (v != null && v >= seuil) return j;
    }
    return null;
  }

  // Fenêtres pour une saison (l'année du plan). Peut déborder sur l'année suivante.
  function fenetres(p, ctx, annee, decal = 0) {
    const DG = dateDuJour(annee, ctx.dg - decal * 7);
    const PG = dateDuJour(annee, ctx.pg + decal * 7);
    const DGsuivante = dateDuJour(annee + 1, ctx.dg - decal * 7);
    const sem = (base, w) => ajouterJours(base, Math.round(w * 7));
    const segs = [];
    const recoltes = [];
    const pousse = (type, debut, fin, extra) => { if (debut <= fin) segs.push({ type, debut, fin, ...extra }); };

    if (p.per) {
      if (p.si) pousse('si', sem(DG, p.si[0]), sem(DG, p.si[1]));
      if (p.pl) pousse('pl', sem(DG, p.pl[0]), sem(DG, p.pl[1]));
      if (p.sd) pousse('sd', sem(DG, p.sd[0]), sem(DG, p.sd[1]));
      if (p.sa) pousse('sa', sem(PG, p.sa[0]), sem(PG, p.sa[1]));
      if (p.hv) {
        const base = p.hv.a === 'DG' ? DG : PG;
        recoltes.push([sem(base, p.hv.w[0]), sem(base, p.hv.w[1])]);
      }
    } else {
      const [d0, d1] = p.dtm;
      const recJ = (p.rec || 2) * 7;
      // Les plantes gélives meurent aux premières gelées : il faut avoir le temps de récolter.
      const limite = p.gel === 'tendre' ? PG : p.gel === 'demi' ? ajouterJours(PG, 21) : null;
      const finAuPlusTard = (d, marge) => (limite && ajouterJours(limite, -marge) < d ? ajouterJours(limite, -marge) : d);

      if (p.si) pousse('si', sem(DG, p.si[0]), sem(DG, p.si[1]));
      if (p.pl) {
        const debut = sem(DG, p.pl[0]);
        const fin = p.dp ? finAuPlusTard(sem(DG, p.pl[1]), d0) : sem(DG, p.pl[1]);
        pousse('pl', debut, fin);
        if (debut <= fin) {
          if (p.dp) recoltes.push([ajouterJours(debut, d0), ajouterJours(fin, d1 + recJ)]);
          else {
            // Durée comptée depuis le semis, mais pas de récolte avant que le plant ait poussé au jardin.
            const depuisSemis = ajouterJours(sem(DG, p.si ? p.si[0] : p.pl[0]), d0);
            const depuisPlantation = ajouterJours(debut, Math.round(d0 / 2));
            recoltes.push([depuisSemis > depuisPlantation ? depuisSemis : depuisPlantation, ajouterJours(sem(DG, p.si ? p.si[1] : p.pl[1]), d1 + recJ)]);
          }
        }
      } else if (p.si) {
        recoltes.push([ajouterJours(sem(DG, p.si[0]), d0), ajouterJours(sem(DG, p.si[1]), d1 + recJ)]);
      }
      if (p.sd) {
        let debut = sem(DG, p.sd[0]);
        const js = jourSol(ctx, p.sol, decal);
        let solTropFroid = false;
        if (js == null) solTropFroid = true;
        else {
          const dSol = dateDuJour(annee, js);
          if (dSol > debut) debut = dSol;
        }
        const fin = finAuPlusTard(sem(DG, p.sd[1]), d0);
        if (!solTropFroid && debut <= fin) {
          pousse('sd', debut, fin);
          recoltes.push([ajouterJours(debut, d0), ajouterJours(fin, d1 + recJ)]);
        }
      }
      if (p.sa) {
        const debut = sem(PG, p.sa[0]), fin = sem(PG, p.sa[1]);
        pousse('sa', debut, fin);
        if (p.hvSa) recoltes.push([sem(DGsuivante, p.hvSa[0]), sem(DGsuivante, p.hvSa[1])]);
        else {
          const pep = p.dp ? 35 : 0; // semis en pépinière puis repiquage
          let finRec = ajouterJours(fin, d1 + pep + recJ);
          if (limite && p.gel === 'tendre' && finRec > limite) finRec = limite;
          recoltes.push([ajouterJours(debut, d0 + pep), finRec]);
        }
      }
      // Pas de récolte après les gelées pour les plantes gélives.
      for (const r of recoltes) if (limite && r[1] > limite && !(p.sa && p.hvSa)) r[1] = limite;
    }

    // Fusionne les récoltes qui se chevauchent.
    recoltes.sort((a, b) => a[0] - b[0]);
    const fusion = [];
    for (const r of recoltes) {
      if (r[0] > r[1]) continue;
      const der = fusion[fusion.length - 1];
      if (der && r[0] <= ajouterJours(der[1], 7)) { if (r[1] > der[1]) der[1] = r[1]; } else fusion.push([...r]);
    }
    for (const [debut, fin] of fusion) segs.push({ type: 'rec', debut, fin });
    return segs;
  }

  // Segments visibles pendant une année civile (en tenant compte des saisons voisines).
  function segmentsAnnee(p, ctx, annee, decal = 0) {
    const d = new Date(annee, 0, 1), f = new Date(annee, 11, 31);
    const res = [];
    for (const a of [annee - 1, annee, annee + 1]) {
      for (const s of fenetres(p, ctx, a, decal)) {
        if (s.fin < d || s.debut > f) continue;
        res.push({ ...s, debut: s.debut < d ? d : s.debut, fin: s.fin > f ? f : s.fin, coupeDebut: s.debut < d, coupeFin: s.fin > f });
      }
    }
    // Les vivaces donnent les mêmes fenêtres chaque année : on évite les doublons exacts.
    const vus = new Set();
    return res.filter((s) => { const k = s.type + s.debut.getTime(); if (vus.has(k)) return false; vus.add(k); return true; });
  }

  // Actions dont la fenêtre croise [debut, fin].
  function actions(p, ctx, debut, fin, decal = 0) {
    const res = [];
    const an = debut.getFullYear();
    for (const a of [an - 1, an, an + 1]) {
      for (const s of fenetres(p, ctx, a, decal)) {
        if (s.fin < debut || s.debut > fin) continue;
        res.push({ ...s, enCours: s.debut <= debut });
      }
    }
    return res;
  }

  // Période où une culture occupe sa place au jardin pendant l'année du plan.
  function occupation(p, ctx, annee, decal = 0, debutForce = null) {
    if (p.per) return { debut: new Date(annee, 0, 1), fin: new Date(annee, 11, 31), vivace: true };
    const segs = fenetres(p, ctx, annee, decal);
    let debut = debutForce;
    if (!debut) {
      const dehors = segs.filter((s) => s.type === 'pl' || s.type === 'sd');
      const choix = dehors.length ? dehors : segs.filter((s) => s.type === 'sa');
      if (!choix.length) return null;
      debut = choix.reduce((m, s) => (s.debut < m ? s.debut : m), choix[0].debut);
    }
    const rec = segs.filter((s) => s.type === 'rec' && s.fin > debut).sort((a, b) => a.debut - b.debut)[0];
    // Pour les cultures semées plusieurs fois (laitue, radis…), un seul semis occupe la place le temps
    // de pousser puis d'être récolté ; les autres (tomate…) produisent jusqu'à la fin de la saison.
    const unSemis = ajouterJours(debut, (p.dtm ? p.dtm[1] : 90) + (p.rec || 2) * 7);
    let fin = rec ? rec.fin : unSemis;
    if ((p.succ && fin > unSemis) || debutForce) fin = unSemis;
    return { debut, fin };
  }

  window.Calendrier = { ABRIS, TYPES, libelle, couleur, contexte, jourSol, fenetres, segmentsAnnee, actions, occupation };
})();
