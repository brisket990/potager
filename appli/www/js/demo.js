/* Données de démonstration pour la maquette (…/index.html?demo) : chargées seulement si l'appareil est vide.
 * Un petit potager fictif ; rien n'est envoyé au serveur (pas de compte). */
(function () {
  const e = App.etat;
  if (e.lieu || e.graines.length || e.journal.length || Object.values(e.plans).some((p) => p.objets.length)) return;
  const an = new Date().getFullYear();
  const structures = [
    { id: 'm1', t: 'batiment', x: 0.5, y: 0.3, w: 8, h: 3, hauteur: 7, nom: 'Maison' },
    { id: 'ar', t: 'arbre', x: 10.8, y: 0.4, w: 3, h: 3, hauteur: 8, essence: 'autre_caduc', caduc: true },
    { id: 'al', t: 'allee', x: 0.5, y: 4, w: 13, h: 0.8 },
    { id: 'b1', t: 'bac', x: 0.8, y: 5.2, w: 1.2, h: 3, nom: 'Bac 1' },
    { id: 'b2', t: 'bac', x: 2.6, y: 5.2, w: 1.2, h: 3, nom: 'Bac 2' },
    { id: 'b3', t: 'bac', x: 4.4, y: 5.2, w: 1.2, h: 3, nom: 'Bac 3' },
    { id: 'b4', t: 'bac', x: 6.2, y: 5.2, w: 1.2, h: 3, nom: 'Bac 4' },
    { id: 'c1', t: 'bac', x: 8.5, y: 8, w: 1.2, h: 1.2, nom: 'Carré' },
    { id: 'se', t: 'serre', x: 8.5, y: 5.2, w: 3, h: 2.2 },
    { id: 'co', t: 'compost', x: 12.3, y: 8.6, w: 1, h: 1 },
    { id: 'eau', t: 'eau', x: 12.4, y: 5.4, w: 0.6, h: 0.6 },
  ];
  const zone = (id, pid, x, y, w, h, extra = {}) => ({ id, t: 'plante', pid, x, y, w, h, mode: 'bloc', ...extra });
  Object.assign(e, {
    lieu: { nom: 'Drancy', detail: 'Seine-Saint-Denis', lat: 48.923, lon: 2.445 },
    jardin: { largeur: 14, hauteur: 11 },
    plantesPerso: [{ id: 'perso-digitale', n: 'Digitale', l: 'Digitalis purpurea', fam: 'plantaginacees', famille: 'Plantaginacées', cat: 'fleur', ic: '🌸', gel: 'rustique', exp: 'mi-ombre', h: 120, esp: [35, 40],
      dates: [{ type: 'si', du: '03-01', au: '04-30' }, { type: 'sd', du: '05-01', au: '06-30' }, { type: 'pl', du: '09-01', au: '10-31' }, { type: 'rec', du: '06-01', au: '09-30', suivante: true }],
      c: 'Bisannuelle, toxique : loin des légumes.' }],
    graines: [
      { id: 'g1', pid: 'tomate', variete: 'Marmande', annee: 2025, quantite: '1 sachet' },
      { id: 'g2', pid: 'carotte', variete: 'Nantaise', limite: 2027, quantite: '2 g' },
      { id: 'g3', pid: 'radis', variete: '18 jours', annee: 2024 },
      { id: 'g4', pid: 'mache', variete: 'Verte de Cambrai', limite: 2028 },
      { id: 'g5', pid: 'feve', variete: 'Aguadulce', annee: 2025, quantite: '30 graines' },
      { id: 'g6', pid: 'epinard', variete: "Géant d'hiver", annee: 2022 },
      { id: 'g7', pid: 'laitue', variete: 'Merveille des quatre saisons', limite: 2028 },
      { id: 'g8', pid: 'haricot-nain', variete: 'Contender', annee: 2025 },
      { id: 'g9', pid: 'courgette', variete: 'Black Beauty', annee: 2021 },
      { id: 'g10', pid: 'basilic', variete: 'Grand vert', limite: 2027 },
      { id: 'g11', pid: 'perso-digitale', variete: 'Excelsior Variée', limite: 2029, quantite: '0,5 g' },
    ],
    journal: [
      { id: 'j1', date: `${an}-09-14`, type: 'recolte', pid: 'courgette', qte: 2.4, unite: 'kg', note: 'Dernières courgettes de la saison.', par: 'Angélique', photos: [] },
      { id: 'j2', date: `${an}-10-02`, type: 'semis', pid: 'mache', note: 'Semis en place dans le bac 2.', par: 'Angélique', photos: [] },
      { id: 'j3', date: `${an}-10-25`, type: 'plantation', pid: 'ail', note: '40 caïeux dans le bac 4.', par: 'Hugo', photos: [] },
      { id: 'j4', date: `${an}-10-30`, type: 'observation', pid: 'chou-kale', note: 'Quelques chenilles sur les choux, retirées à la main.', par: 'Hugo', photos: [] },
    ],
    plans: {
      [an]: { objets: [...structures,
        zone('p1', 'poireau', 0.85, 5.3, 1.1, 2.8, { mode: 'rangs' }),
        zone('p2', 'mache', 2.65, 5.3, 1.1, 1.3),
        zone('p3', 'epinard', 2.65, 6.75, 1.1, 1.35),
        zone('p4', 'chou-kale', 4.45, 5.3, 1.1, 2.8),
        zone('p5', 'ail', 6.25, 5.3, 1.1, 2.8, { mode: 'rangs' }),
        zone('p6', 'laitue', 8.7, 5.4, 2.6, 1.8),
      ] },
      [an + 1]: { objets: [...structures,
        zone('q1', 'tomate', 8.6, 5.3, 2.8, 1.2, { graineId: 'g1' }),
        zone('q2', 'basilic', 8.6, 6.6, 2.8, 0.7, { graineId: 'g10' }),
        zone('q3', 'haricot-nain', 0.85, 5.3, 1.1, 2.8, { graineId: 'g8', mode: 'rangs' }),
        zone('q4', 'carotte', 2.65, 5.3, 1.1, 1.6, { graineId: 'g2', mode: 'rangs' }),
        zone('q5', 'radis', 2.65, 7.0, 1.1, 1.1, { graineId: 'g3' }),
        zone('q6', 'courgette', 4.45, 5.3, 1.1, 2.8, { graineId: 'g9' }),
        zone('q7', 'fraisier', 6.25, 5.3, 1.1, 2.8),
        zone('q8', 'perso-digitale', 8.55, 8.05, 1.1, 1.1, { graineId: 'g11' }),
      ] },
    },
  });
  U.stock.ecrire('potager', e);
  U.stock.ecrire('appli:local', true);
})();
