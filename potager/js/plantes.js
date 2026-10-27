/* Base de plantes du potager.
 *
 * Les dates ne sont pas fixes : elles sont exprimées en SEMAINES par rapport
 * à la date de dernière gelée de printemps (DG) ou de première gelée
 * d'automne (PG) de ton lieu, calculées à partir de 20 ans de météo.
 *
 * Champs :
 *  n     nom            l    nom latin       cat  legume|fruit|aromatique|fleur|engrais
 *  fam   famille (rotation)                  ic   icône
 *  gel   tendre (tué par le gel) | demi | rustique
 *  sol   température mini du sol pour semer en place (°C)
 *  si    semis à l'intérieur / sous abri      [début, fin] en semaines / DG
 *  pl    plantation au jardin                 [début, fin] en semaines / DG
 *  sd    semis en place au printemps/été      [début, fin] en semaines / DG
 *  sa    semis/plantation de fin de saison    [début, fin] en semaines / PG
 *  hvSa  récolte des semis d'automne qui passent l'hiver, en semaines / DG de l'année suivante
 *  dtm   jours jusqu'à la récolte (ou floraison), comptés depuis la plantation si dp, sinon depuis le semis
 *  rec   durée de la récolte / floraison (semaines)
 *  succ  intervalle conseillé entre deux semis échelonnés (semaines)
 *  esp   [entre plants, entre rangs] en cm
 *  exp   soleil | mi-ombre | ombre           h    hauteur (cm)
 *  germ  durée germinative des graines (années)
 *  achat graine | plant | bulbe | tubercule
 *  per   vivace ; hv = période de récolte {a:'DG'|'PG', w:[début, fin]}
 *  al    autres noms (pour reconnaître ta liste de graines)
 *  c     conseil
 */
(function () {
  const P = [
    // ---------- Fruits-légumes (solanacées) ----------
    { id: 'tomate', n: 'Tomate', l: 'Solanum lycopersicum', cat: 'legume', fam: 'solanacees', ic: '🍅', gel: 'tendre', sol: 16, si: [-8, -5], pl: [1, 4], dp: true, dtm: [60, 85], rec: 10, esp: [50, 70], h: 160, germ: 4, al: ['tomates', 'coeur de boeuf', 'roma', 'marmande', 'noire de crimee', 'cornue des andes', 'saint pierre'], c: "Tuteurer et retirer les gourmands sur les variétés à croissance indéterminée. Arrosage régulier au pied pour éviter la nécrose apicale." },
    { id: 'tomate-cerise', n: 'Tomate cerise', l: 'Solanum lycopersicum var. cerasiforme', cat: 'legume', fam: 'solanacees', ic: '🍅', gel: 'tendre', sol: 16, si: [-8, -5], pl: [1, 4], dp: true, dtm: [55, 70], rec: 12, esp: [50, 70], h: 180, germ: 4, al: ['tomates cerises', 'cerise', 'sweet million', 'black cherry'], c: "Très productive et plus résistante au mildiou que les grosses tomates." },
    { id: 'aubergine', n: 'Aubergine', l: 'Solanum melongena', cat: 'legume', fam: 'solanacees', ic: '🍆', gel: 'tendre', sol: 20, si: [-10, -7], pl: [3, 6], dp: true, dtm: [70, 90], rec: 8, esp: [50, 70], h: 80, germ: 5, c: "Aime la chaleur : la placer au plus chaud, voire sous serre au nord de la Loire." },
    { id: 'poivron', n: 'Poivron', l: 'Capsicum annuum', cat: 'legume', fam: 'solanacees', ic: '🫑', gel: 'tendre', sol: 20, si: [-10, -7], pl: [3, 6], dp: true, dtm: [65, 85], rec: 8, esp: [45, 60], h: 70, germ: 3, al: ['poivrons'], c: "Levée lente (2 à 3 semaines) : semer tôt et au chaud (25 °C)." },
    { id: 'piment', n: 'Piment', l: 'Capsicum annuum / chinense', cat: 'legume', fam: 'solanacees', ic: '🌶️', gel: 'tendre', sol: 20, si: [-11, -8], pl: [3, 6], dp: true, dtm: [70, 100], rec: 10, esp: [40, 50], h: 70, germ: 3, al: ['piments', 'espelette', 'jalapeno', 'habanero', 'cayenne'], c: "Les piments forts (chinense) demandent encore plus de chaleur et un semis plus précoce." },
    { id: 'physalis', n: 'Physalis', l: 'Physalis peruviana', cat: 'fruit', fam: 'solanacees', ic: '🟠', gel: 'tendre', sol: 18, si: [-10, -7], pl: [3, 5], dp: true, dtm: [70, 90], rec: 10, esp: [70, 90], h: 120, germ: 4, al: ['coqueret', 'amour en cage'], c: "Se cultive comme la tomate. Fruits mûrs quand l'enveloppe est sèche." },
    { id: 'pomme-de-terre', n: 'Pomme de terre', l: 'Solanum tuberosum', cat: 'legume', fam: 'solanacees', ic: '🥔', gel: 'demi', sol: 8, pl: [-3, 3], dp: true, dtm: [70, 120], rec: 4, esp: [35, 70], h: 60, germ: null, achat: 'tubercule', al: ['pommes de terre', 'patate', 'charlotte', 'bintje', 'ratte', 'amandine', 'belle de fontenay'], c: "Butter quand les tiges font 20 cm. Le feuillage craint le gel : protéger si gelée annoncée après la levée." },
    { id: 'patate-douce', n: 'Patate douce', l: 'Ipomoea batatas', cat: 'legume', fam: 'convolvulacees', ic: '🍠', gel: 'tendre', sol: 18, pl: [4, 7], dp: true, dtm: [110, 150], rec: 2, esp: [40, 80], h: 30, germ: null, achat: 'plant', c: "Se plante en boutures. Récolter avant les premiers froids, dès que le feuillage jaunit." },

    // ---------- Cucurbitacées ----------
    { id: 'courgette', n: 'Courgette', l: 'Cucurbita pepo', cat: 'legume', fam: 'cucurbitacees', ic: '🥒', gel: 'tendre', sol: 16, si: [-4, -2], pl: [2, 5], sd: [2, 7], dtm: [50, 65], rec: 12, esp: [100, 100], h: 60, germ: 6, al: ['courgettes', 'ronde de nice', 'verte des maraichers'], c: "Deux ou trois pieds suffisent pour une famille. Récolter jeune, tous les 2 à 3 jours." },
    { id: 'concombre', n: 'Concombre', l: 'Cucumis sativus', cat: 'legume', fam: 'cucurbitacees', ic: '🥒', gel: 'tendre', sol: 16, si: [-4, -2], pl: [2, 5], sd: [2, 6], dtm: [55, 70], rec: 8, esp: [40, 100], h: 150, germ: 6, al: ['concombres'], c: "Palisser sur un treillis : fruits plus propres et moins de maladies." },
    { id: 'cornichon', n: 'Cornichon', l: 'Cucumis sativus', cat: 'legume', fam: 'cucurbitacees', ic: '🥒', gel: 'tendre', sol: 16, si: [-4, -2], pl: [2, 5], sd: [2, 6], dtm: [50, 60], rec: 8, esp: [40, 100], h: 120, germ: 6, al: ['cornichons'], c: "Cueillir tous les jours en pleine saison pour garder des petits fruits." },
    { id: 'melon', n: 'Melon', l: 'Cucumis melo', cat: 'legume', fam: 'cucurbitacees', ic: '🍈', gel: 'tendre', sol: 18, si: [-5, -3], pl: [3, 6], dp: true, dtm: [70, 90], rec: 5, esp: [80, 100], h: 30, germ: 6, al: ['melons', 'charentais', 'cantaloup'], c: "Tailler au-dessus de 2 feuilles puis limiter à 4 à 6 fruits par pied." },
    { id: 'pasteque', n: 'Pastèque', l: 'Citrullus lanatus', cat: 'legume', fam: 'cucurbitacees', ic: '🍉', gel: 'tendre', sol: 20, si: [-5, -3], pl: [3, 6], dp: true, dtm: [80, 100], rec: 4, esp: [100, 150], h: 30, germ: 6, al: ['pasteques', 'melon d eau'], c: "Exige un été chaud ; un paillage noir réchauffe le sol." },
    { id: 'courge-musquee', n: 'Courge musquée (butternut)', l: 'Cucurbita moschata', cat: 'legume', fam: 'cucurbitacees', ic: '🎃', gel: 'tendre', sol: 16, si: [-4, -2], pl: [2, 5], sd: [2, 5], dtm: [100, 120], rec: 4, esp: [100, 150], h: 40, germ: 6, al: ['butternut', 'courge', 'courges', 'muscade de provence', 'sucrine du berry'], c: "Récolter quand le pédoncule devient liégeux. Se conserve tout l'hiver." },
    { id: 'potiron', n: 'Potiron', l: 'Cucurbita maxima', cat: 'legume', fam: 'cucurbitacees', ic: '🎃', gel: 'tendre', sol: 16, si: [-4, -2], pl: [2, 5], sd: [2, 5], dtm: [100, 130], rec: 4, esp: [150, 200], h: 40, germ: 6, al: ['potirons', 'citrouille', 'rouge vif d etampes'], c: "Très gourmand : planter sur un tas de compost." },
    { id: 'potimarron', n: 'Potimarron', l: 'Cucurbita maxima', cat: 'legume', fam: 'cucurbitacees', ic: '🎃', gel: 'tendre', sol: 16, si: [-4, -2], pl: [2, 5], sd: [2, 5], dtm: [90, 110], rec: 4, esp: [100, 150], h: 40, germ: 6, al: ['potimarrons', 'red kuri'], c: "Plus précoce que le potiron, il convient aux régions à été court." },

    // ---------- Maïs ----------
    { id: 'mais', n: 'Maïs doux', l: 'Zea mays', cat: 'legume', fam: 'poacees', ic: '🌽', gel: 'tendre', sol: 12, si: [-3, -1], pl: [2, 4], sd: [2, 6], dtm: [75, 100], rec: 3, esp: [30, 70], h: 200, germ: 2, al: ['mais', 'mais doux'], c: "Planter en carré plutôt qu'en ligne unique pour une bonne pollinisation." },

    // ---------- Fabacées ----------
    { id: 'haricot-nain', n: 'Haricot nain', l: 'Phaseolus vulgaris', cat: 'legume', fam: 'fabacees', ic: '🫛', gel: 'tendre', sol: 12, sd: [2, 16], dtm: [55, 65], rec: 4, succ: 3, esp: [10, 40], h: 45, germ: 3, al: ['haricots', 'haricot', 'haricot vert', 'haricots verts', 'haricot beurre', 'contender', 'flageolet'], c: "Ne pas semer dans un sol froid : les graines pourrissent. Semer tous les 3 semaines jusqu'à mi-juillet." },
    { id: 'haricot-rames', n: 'Haricot à rames', l: 'Phaseolus vulgaris', cat: 'legume', fam: 'fabacees', ic: '🫛', gel: 'tendre', sol: 12, sd: [2, 9], dtm: [65, 80], rec: 8, esp: [15, 60], h: 250, germ: 3, al: ['haricot grimpant', 'haricots a rames', 'coco', 'phenomene'], c: "Installer les rames (2,5 m) avant le semis." },
    { id: 'petit-pois', n: 'Petit pois', l: 'Pisum sativum', cat: 'legume', fam: 'fabacees', ic: '🫛', gel: 'rustique', sol: 5, sd: [-7, 3], dtm: [70, 90], rec: 3, esp: [5, 40], h: 80, germ: 3, al: ['pois', 'petits pois', 'pois a ecosser', 'douce provence', 'kelvedon'], c: "Craint la chaleur : semer tôt. Ramer les variétés hautes." },
    { id: 'pois-mangetout', n: 'Pois mangetout', l: 'Pisum sativum var. saccharatum', cat: 'legume', fam: 'fabacees', ic: '🫛', gel: 'rustique', sol: 5, sd: [-7, 3], dtm: [60, 75], rec: 4, esp: [5, 40], h: 120, germ: 3, al: ['mange tout', 'mangetout', 'pois gourmand'], c: "Récolter les cosses plates avant que les grains gonflent." },
    { id: 'feve', n: 'Fève', l: 'Vicia faba', cat: 'legume', fam: 'fabacees', ic: '🫛', gel: 'rustique', sol: 5, sd: [-9, -1], sa: [-4, 3], hvSa: [3, 8], dtm: [90, 120], rec: 3, esp: [15, 45], h: 100, germ: 6, al: ['feves', 'feverole', 'aguadulce'], c: "Pincer la tête dès les premières gousses pour limiter les pucerons noirs. Semis d'automne possible en climat doux." },

    // ---------- Racines ----------
    { id: 'carotte', n: 'Carotte', l: 'Daucus carota', cat: 'legume', fam: 'apiacees', ic: '🥕', gel: 'rustique', sol: 8, sd: [-3, 12], dtm: [70, 110], rec: 10, succ: 4, esp: [4, 25], h: 30, germ: 3, al: ['carottes', 'nantaise', 'chantenay', 'touchon', 'colmar'], c: "Sol meuble sans cailloux ni fumier frais. Levée lente : garder le sol humide." },
    { id: 'panais', n: 'Panais', l: 'Pastinaca sativa', cat: 'legume', fam: 'apiacees', ic: '🥕', gel: 'rustique', sol: 8, sd: [-4, 5], dtm: [120, 180], rec: 16, esp: [10, 35], h: 40, germ: 1, al: ['panais'], c: "Graines à durée de vie très courte : n'utiliser que des graines de l'année. Meilleur après les gelées." },
    { id: 'celeri-rave', n: 'Céleri-rave', l: 'Apium graveolens var. rapaceum', cat: 'legume', fam: 'apiacees', ic: '🥬', gel: 'demi', sol: 15, si: [-12, -8], pl: [2, 5], dp: true, dtm: [110, 140], rec: 8, esp: [35, 40], h: 50, germ: 5, al: ['celeri rave'], c: "Graines minuscules à semer en surface. Arroser abondamment l'été." },
    { id: 'celeri-branche', n: 'Céleri branche', l: 'Apium graveolens var. dulce', cat: 'legume', fam: 'apiacees', ic: '🥬', gel: 'demi', sol: 15, si: [-10, -8], pl: [2, 5], dp: true, dtm: [90, 120], rec: 8, esp: [30, 40], h: 60, germ: 5, al: ['celeri', 'celeri branche'], c: "Besoin d'eau constant pour des côtes tendres." },
    { id: 'radis', n: 'Radis', l: 'Raphanus sativus', cat: 'legume', fam: 'brassicacees', ic: '🔴', gel: 'rustique', sol: 5, sd: [-5, 20], dtm: [25, 35], rec: 2, succ: 2, esp: [3, 15], h: 15, germ: 5, al: ['radis rose', '18 jours', 'flamboyant', 'national'], c: "Semer peu à la fois toutes les 2 semaines. En plein été, à la mi-ombre pour éviter qu'il pique." },
    { id: 'radis-noir', n: "Radis d'hiver (noir)", l: 'Raphanus sativus var. niger', cat: 'legume', fam: 'brassicacees', ic: '⚫', gel: 'rustique', sol: 8, sa: [-16, -11], dtm: [60, 80], rec: 10, esp: [12, 30], h: 30, germ: 5, al: ['radis noir', 'radis d hiver', 'daikon', 'radis blanc'], c: "Semer en été pour une récolte à l'automne ; se conserve en cave." },
    { id: 'betterave', n: 'Betterave', l: 'Beta vulgaris', cat: 'legume', fam: 'amaranthacees', ic: '🟣', gel: 'demi', sol: 10, sd: [1, 12], dtm: [60, 90], rec: 8, succ: 4, esp: [10, 30], h: 35, germ: 6, al: ['betteraves', 'betterave rouge', 'crapaudine', 'chioggia', 'detroit'], c: "Chaque « graine » donne plusieurs plantules : éclaircir à un plant tous les 10 cm." },
    { id: 'navet', n: 'Navet', l: 'Brassica rapa var. rapa', cat: 'legume', fam: 'brassicacees', ic: '⚪', gel: 'rustique', sol: 6, sd: [-4, 2], sa: [-14, -8], dtm: [45, 70], rec: 4, esp: [10, 30], h: 30, germ: 5, al: ['navets', 'boule d or', 'milan'], c: "Préfère la fraîcheur : semis de printemps ou de fin d'été." },
    { id: 'topinambour', n: 'Topinambour', l: 'Helianthus tuberosus', cat: 'legume', fam: 'asteracees', ic: '🥔', gel: 'rustique', sol: 6, pl: [-6, 0], dp: true, dtm: [150, 200], rec: 16, esp: [40, 80], h: 250, germ: null, achat: 'tubercule', al: ['topinambours'], c: "Très envahissant : lui réserver un coin à part." },

    // ---------- Alliacées ----------
    { id: 'poireau', n: 'Poireau', l: 'Allium porrum', cat: 'legume', fam: 'amaryllidacees', ic: '🌿', gel: 'rustique', sol: 8, si: [-12, -6], pl: [4, 11], dp: true, dtm: [100, 150], rec: 16, esp: [15, 30], h: 50, germ: 3, al: ['poireaux', 'bleu de solaise', 'monstrueux de carentan'], c: "Repiquer au plantoir, racines et feuilles habillées (raccourcies), quand le plant a la grosseur d'un crayon." },
    { id: 'oignon', n: 'Oignon (semis)', l: 'Allium cepa', cat: 'legume', fam: 'amaryllidacees', ic: '🧅', gel: 'rustique', sol: 7, si: [-10, -6], sd: [-6, -1], dtm: [100, 140], rec: 3, esp: [10, 25], h: 40, germ: 2, al: ['oignons', 'oignon jaune', 'oignon rouge', 'oignon blanc', 'stuttgart'], c: "Graines peu durables (2 ans). Arrêter d'arroser quand les feuilles se couchent." },
    { id: 'oignon-bulbille', n: 'Oignon (bulbilles)', l: 'Allium cepa', cat: 'legume', fam: 'amaryllidacees', ic: '🧅', gel: 'rustique', sol: 6, pl: [-6, -2], dp: true, dtm: [90, 110], rec: 3, esp: [10, 25], h: 40, germ: null, achat: 'bulbe', al: ['bulbilles', 'oignon bulbille'], c: "La pointe doit juste affleurer. Plus facile que le semis." },
    { id: 'echalote', n: 'Échalote', l: 'Allium cepa var. aggregatum', cat: 'legume', fam: 'amaryllidacees', ic: '🧅', gel: 'rustique', sol: 5, pl: [-10, -4], dp: true, dtm: [100, 130], rec: 3, esp: [15, 25], h: 30, germ: null, achat: 'bulbe', al: ['echalotes', 'echalion'], c: "Proverbe : « Plante l'échalote au jour le plus court, récolte-la au jour le plus long »." },
    { id: 'ail', n: 'Ail', l: 'Allium sativum', cat: 'legume', fam: 'amaryllidacees', ic: '🧄', gel: 'rustique', sol: 5, pl: [-8, -4], sa: [-4, 5], hvSa: [9, 13], dp: true, dtm: [120, 150], rec: 3, esp: [12, 25], h: 50, germ: null, achat: 'bulbe', al: ['ail blanc', 'ail violet', 'ail rose', 'gousses'], c: "L'ail d'automne donne de plus grosses têtes. Pointe vers le haut, 3 cm sous terre." },
    { id: 'ciboulette', n: 'Ciboulette', l: 'Allium schoenoprasum', cat: 'aromatique', fam: 'amaryllidacees', ic: '🌿', gel: 'rustique', sol: 10, per: true, si: [-8, -4], pl: [-2, 6], sd: [-2, 6], hv: { a: 'DG', w: [-4, 30] }, rec: 0, esp: [20, 25], h: 25, germ: 2, al: ['ciboule'], c: "Diviser les touffes tous les 3 ans. Les fleurs sont comestibles." },

    // ---------- Choux ----------
    { id: 'chou-pomme', n: 'Chou pommé', l: 'Brassica oleracea var. capitata', cat: 'legume', fam: 'brassicacees', ic: '🥬', gel: 'rustique', sol: 8, si: [-8, -5], pl: [-3, 2], sa: [-24, -19], dp: true, dtm: [70, 110], rec: 6, esp: [45, 60], h: 40, germ: 5, al: ['chou', 'choux', 'chou cabus', 'chou rouge', 'chou de milan', 'coeur de boeuf (chou)'], c: "Protéger des piérides avec un filet anti-insectes. Sol riche et ferme." },
    { id: 'chou-fleur', n: 'Chou-fleur', l: 'Brassica oleracea var. botrytis', cat: 'legume', fam: 'brassicacees', ic: '🥦', gel: 'demi', sol: 8, si: [-8, -5], pl: [-2, 2], sa: [-22, -18], dp: true, dtm: [60, 100], rec: 3, esp: [50, 60], h: 50, germ: 5, al: ['choux fleurs', 'chou fleur'], c: "Rabattre quelques feuilles sur la pomme pour la garder blanche." },
    { id: 'brocoli', n: 'Brocoli', l: 'Brassica oleracea var. italica', cat: 'legume', fam: 'brassicacees', ic: '🥦', gel: 'demi', sol: 8, si: [-6, -4], pl: [-2, 2], sa: [-18, -14], dp: true, dtm: [60, 90], rec: 4, esp: [45, 60], h: 60, germ: 5, al: ['brocolis', 'calabrais'], c: "Après la tête centrale, les pousses latérales donnent encore plusieurs semaines." },
    { id: 'chou-bruxelles', n: 'Chou de Bruxelles', l: 'Brassica oleracea var. gemmifera', cat: 'legume', fam: 'brassicacees', ic: '🥬', gel: 'rustique', sol: 8, si: [-4, 0], pl: [4, 8], dp: true, dtm: [110, 150], rec: 12, esp: [60, 70], h: 90, germ: 5, al: ['choux de bruxelles'], c: "Meilleur après quelques gelées. Récolter de bas en haut." },
    { id: 'chou-kale', n: 'Chou kale', l: 'Brassica oleracea var. sabellica', cat: 'legume', fam: 'brassicacees', ic: '🥬', gel: 'rustique', sol: 8, si: [-4, 0], pl: [4, 10], dp: true, dtm: [55, 75], rec: 20, esp: [45, 60], h: 70, germ: 5, al: ['kale', 'chou frise', 'chou non pomme'], c: "Cueillir les feuilles du bas au fur et à mesure, tout l'hiver." },
    { id: 'chou-rave', n: 'Chou-rave', l: 'Brassica oleracea var. gongylodes', cat: 'legume', fam: 'brassicacees', ic: '🥬', gel: 'demi', sol: 8, si: [-6, -4], pl: [-2, 2], sd: [0, 12], dtm: [55, 70], rec: 3, succ: 4, esp: [25, 30], h: 30, germ: 5, al: ['choux raves', 'chou rave'], c: "Récolter à la taille d'une balle de tennis, avant qu'il devienne fibreux." },
    { id: 'chou-chinois', n: 'Chou chinois', l: 'Brassica rapa var. pekinensis', cat: 'legume', fam: 'brassicacees', ic: '🥬', gel: 'demi', sol: 10, sa: [-15, -10], dtm: [60, 80], rec: 4, esp: [35, 40], h: 40, germ: 5, al: ['pe tsai', 'chou de chine'], c: "Semé au printemps il monte en graines : le semer en été." },
    { id: 'pak-choi', n: 'Pak choï', l: 'Brassica rapa var. chinensis', cat: 'legume', fam: 'brassicacees', ic: '🥬', gel: 'demi', sol: 8, sd: [-2, 4], sa: [-12, -6], dtm: [40, 55], rec: 3, succ: 3, esp: [20, 30], h: 25, germ: 5, al: ['pak choi', 'bok choy'], c: "Croissance rapide, idéal entre deux cultures." },

    // ---------- Légumes feuilles ----------
    { id: 'laitue', n: 'Laitue', l: 'Lactuca sativa', cat: 'legume', fam: 'asteracees', ic: '🥬', gel: 'demi', sol: 4, si: [-8, -4], pl: [-3, 8], sd: [-2, 14], sa: [-10, -6], dtm: [50, 75], rec: 3, succ: 3, esp: [25, 30], h: 25, germ: 4, al: ['salade', 'salades', 'batavia', 'feuille de chene', 'romaine', 'sucrine', 'laitue pommee', 'merveille des quatre saisons'], c: "Germe mal au-dessus de 25 °C : en été, semer le soir et à l'ombre. Semer peu, souvent." },
    { id: 'mache', n: 'Mâche', l: 'Valerianella locusta', cat: 'legume', fam: 'caprifoliacees', ic: '🥬', gel: 'rustique', sol: 5, sa: [-12, -5], dtm: [60, 90], rec: 10, esp: [8, 15], h: 8, germ: 5, al: ['doucette', 'blanchette'], c: "Semer en fin d'été sur un sol tassé ; récolte tout l'hiver." },
    { id: 'roquette', n: 'Roquette', l: 'Eruca sativa', cat: 'legume', fam: 'brassicacees', ic: '🥬', gel: 'demi', sol: 5, sd: [-4, 6], sa: [-10, -4], dtm: [30, 45], rec: 4, succ: 3, esp: [10, 20], h: 20, germ: 4, al: ['roquette cultivee', 'rucola'], c: "Monte vite à graines par temps chaud : préférer printemps et automne." },
    { id: 'epinard', n: 'Épinard', l: 'Spinacia oleracea', cat: 'legume', fam: 'amaranthacees', ic: '🥬', gel: 'rustique', sol: 4, sd: [-6, 2], sa: [-8, -4], dtm: [40, 60], rec: 5, succ: 3, esp: [10, 30], h: 25, germ: 4, al: ['epinards', 'geant d hiver'], c: "Monte en graines quand les jours rallongent : semis précoces ou d'automne." },
    { id: 'blette', n: 'Blette', l: 'Beta vulgaris var. cicla', cat: 'legume', fam: 'amaranthacees', ic: '🥬', gel: 'demi', sol: 10, sd: [0, 10], dtm: [55, 70], rec: 20, esp: [30, 40], h: 50, germ: 6, al: ['blettes', 'bette', 'bettes', 'poiree', 'carde'], c: "Cueillir les côtes extérieures au fur et à mesure, le cœur repousse." },
    { id: 'chicoree', n: 'Chicorée (frisée, scarole)', l: 'Cichorium endivia', cat: 'legume', fam: 'asteracees', ic: '🥬', gel: 'demi', sol: 10, sa: [-18, -12], dtm: [80, 100], rec: 6, esp: [30, 35], h: 25, germ: 7, al: ['frisee', 'scarole', 'chicoree frisee', 'endive'], c: "Semée trop tôt au printemps, elle monte en graines : la semer en été." },
    { id: 'fenouil', n: 'Fenouil bulbeux', l: 'Foeniculum vulgare var. azoricum', cat: 'legume', fam: 'apiacees', ic: '🌿', gel: 'demi', sol: 10, sd: [6, 13], dtm: [70, 90], rec: 4, esp: [25, 35], h: 60, germ: 4, al: ['fenouil', 'fenouil de florence'], c: "Semer après le solstice pour éviter la montée en graines." },

    // ---------- Légumes vivaces ----------
    { id: 'artichaut', n: 'Artichaut', l: 'Cynara cardunculus var. scolymus', cat: 'legume', fam: 'asteracees', ic: '🌿', gel: 'demi', sol: 12, per: true, pl: [-2, 4], hv: { a: 'DG', w: [4, 12] }, rec: 0, esp: [100, 100], h: 120, germ: 6, achat: 'plant', al: ['artichauts', 'camus de bretagne', 'violet de provence'], c: "Pailler le pied l'hiver dans les régions froides. Renouveler les pieds tous les 4 ans." },
    { id: 'asperge', n: 'Asperge', l: 'Asparagus officinalis', cat: 'legume', fam: 'asparagacees', ic: '🌿', gel: 'rustique', sol: 10, per: true, pl: [-4, 0], hv: { a: 'DG', w: [-1, 7] }, rec: 0, esp: [40, 120], h: 150, germ: null, achat: 'plant', al: ['asperges', 'griffes d asperge'], c: "Ne rien récolter les 2 premières années. Une aspergeraie produit 15 ans." },
    { id: 'rhubarbe', n: 'Rhubarbe', l: 'Rheum rhabarbarum', cat: 'legume', fam: 'polygonacees', ic: '🌿', gel: 'rustique', sol: 8, per: true, pl: [-8, -2], hv: { a: 'DG', w: [-2, 10] }, rec: 0, esp: [100, 100], h: 80, germ: null, achat: 'plant', c: "Ne pas récolter la première année. Les feuilles sont toxiques, seules les tiges se mangent." },
    { id: 'oseille', n: 'Oseille', l: 'Rumex acetosa', cat: 'legume', fam: 'polygonacees', ic: '🌿', gel: 'rustique', sol: 8, per: true, sd: [-2, 6], pl: [-2, 6], hv: { a: 'DG', w: [-4, 26] }, rec: 0, esp: [30, 40], h: 40, germ: 4, c: "Couper les hampes florales pour prolonger la récolte." },

    // ---------- Petits fruits et arbres fruitiers ----------
    { id: 'fraisier', n: 'Fraisier', l: 'Fragaria × ananassa', cat: 'fruit', fam: 'rosacees', ic: '🍓', gel: 'rustique', sol: 8, per: true, pl: [-4, 0], sa: [-10, -6], hv: { a: 'DG', w: [4, 10] }, rec: 0, esp: [30, 60], h: 25, germ: null, achat: 'plant', al: ['fraises', 'fraise', 'gariguette', 'mara des bois', 'charlotte (fraise)'], c: "Les variétés remontantes produisent jusqu'aux gelées. Renouveler les plants tous les 3 ans avec les stolons." },
    { id: 'framboisier', n: 'Framboisier', l: 'Rubus idaeus', cat: 'fruit', fam: 'rosacees', ic: '🔴', gel: 'rustique', sol: 5, per: true, pl: [-24, -4], hv: { a: 'DG', w: [9, 15] }, rec: 0, esp: [50, 150], h: 170, germ: null, achat: 'plant', al: ['framboises', 'framboise'], c: "Les remontants donnent une seconde récolte en fin d'été. Palisser sur fils." },
    { id: 'groseillier', n: 'Groseillier', l: 'Ribes rubrum', cat: 'fruit', fam: 'grossulariacees', ic: '🔴', gel: 'rustique', sol: 5, per: true, pl: [-24, -4], hv: { a: 'DG', w: [10, 14] }, rec: 0, esp: [120, 150], h: 130, germ: null, achat: 'plant', al: ['groseilles', 'groseille'], c: "Supporte la mi-ombre. Tailler les vieux bois en hiver." },
    { id: 'cassissier', n: 'Cassissier', l: 'Ribes nigrum', cat: 'fruit', fam: 'grossulariacees', ic: '⚫', gel: 'rustique', sol: 5, per: true, pl: [-24, -4], hv: { a: 'DG', w: [10, 13] }, rec: 0, esp: [150, 150], h: 150, germ: null, achat: 'plant', al: ['cassis'], c: "Fructifie sur les rameaux d'un an : supprimer chaque hiver un tiers des vieilles branches." },
    { id: 'myrtillier', n: 'Myrtillier', l: 'Vaccinium corymbosum', cat: 'fruit', fam: 'ericacees', ic: '🫐', gel: 'rustique', sol: 5, per: true, pl: [-24, -4], hv: { a: 'DG', w: [13, 19] }, rec: 0, esp: [120, 150], h: 150, germ: null, achat: 'plant', al: ['myrtilles', 'myrtille', 'bleuet (fruit)'], c: "Exige un sol acide (terre de bruyère) et de l'eau de pluie." },
    { id: 'murier', n: 'Ronce fruitière (mûre)', l: 'Rubus fruticosus', cat: 'fruit', fam: 'rosacees', ic: '⚫', gel: 'rustique', sol: 5, per: true, pl: [-24, -4], hv: { a: 'DG', w: [15, 22] }, rec: 0, esp: [200, 200], h: 200, germ: null, achat: 'plant', al: ['mures', 'mure', 'ronce sans epines'], c: "Choisir une variété sans épines et palisser." },
    { id: 'vigne', n: 'Vigne (raisin de table)', l: 'Vitis vinifera', cat: 'fruit', fam: 'vitacees', ic: '🍇', gel: 'rustique', sol: 8, per: true, pl: [-24, -4], hv: { a: 'PG', w: [-10, -4] }, rec: 0, esp: [150, 200], h: 200, germ: null, achat: 'plant', al: ['raisin', 'chasselas', 'muscat'], c: "Au soleil contre un mur chaud. Taille courte en hiver." },
    { id: 'pommier', n: 'Pommier', l: 'Malus domestica', cat: 'fruit', fam: 'rosacees', ic: '🍎', gel: 'rustique', sol: 5, per: true, pl: [-24, -4], hv: { a: 'PG', w: [-10, -1] }, rec: 0, esp: [300, 400], h: 400, germ: null, achat: 'plant', al: ['pommes', 'pomme'], c: "Planter au moins deux variétés compatibles pour la pollinisation (sauf autofertiles)." },
    { id: 'poirier', n: 'Poirier', l: 'Pyrus communis', cat: 'fruit', fam: 'rosacees', ic: '🍐', gel: 'rustique', sol: 5, per: true, pl: [-24, -4], hv: { a: 'PG', w: [-12, -3] }, rec: 0, esp: [300, 400], h: 400, germ: null, achat: 'plant', al: ['poires', 'poire'], c: "Cueillir les poires un peu avant maturité et les laisser finir au fruitier." },
    { id: 'prunier', n: 'Prunier', l: 'Prunus domestica', cat: 'fruit', fam: 'rosacees', ic: '🟣', gel: 'rustique', sol: 5, per: true, pl: [-24, -4], hv: { a: 'DG', w: [14, 20] }, rec: 0, esp: [400, 400], h: 400, germ: null, achat: 'plant', al: ['prunes', 'mirabelle', 'reine claude', 'quetsche'], c: "La plupart des mirabelliers et quetschiers sont autofertiles." },
    { id: 'cerisier', n: 'Cerisier', l: 'Prunus avium', cat: 'fruit', fam: 'rosacees', ic: '🍒', gel: 'rustique', sol: 5, per: true, pl: [-24, -4], hv: { a: 'DG', w: [7, 11] }, rec: 0, esp: [500, 500], h: 500, germ: null, achat: 'plant', al: ['cerises', 'burlat', 'bigarreau'], c: "Filet contre les oiseaux à l'approche de la récolte." },
    { id: 'pecher', n: 'Pêcher', l: 'Prunus persica', cat: 'fruit', fam: 'rosacees', ic: '🍑', gel: 'rustique', sol: 5, per: true, pl: [-24, -4], hv: { a: 'DG', w: [13, 19] }, rec: 0, esp: [400, 400], h: 350, germ: null, achat: 'plant', al: ['peches', 'nectarine', 'brugnon'], c: "Sensible à la cloque : abriter de la pluie au débourrement." },
    { id: 'figuier', n: 'Figuier', l: 'Ficus carica', cat: 'fruit', fam: 'moracees', ic: '🟤', gel: 'demi', sol: 10, per: true, pl: [-2, 2], hv: { a: 'DG', w: [14, 26] }, rec: 0, esp: [400, 400], h: 400, germ: null, achat: 'plant', al: ['figues', 'figue'], c: "Au pied d'un mur chaud dans le nord ; résiste à -12 °C environ une fois installé." },

    // ---------- Aromatiques ----------
    { id: 'basilic', n: 'Basilic', l: 'Ocimum basilicum', cat: 'aromatique', fam: 'lamiacees', ic: '🌿', gel: 'tendre', sol: 18, si: [-6, -3], pl: [3, 6], sd: [4, 8], dtm: [50, 70], rec: 12, esp: [25, 30], h: 40, germ: 5, al: ['basilic grand vert', 'basilic genovese', 'basilic thai', 'basilic pourpre'], c: "Pincer les sommités pour éviter la floraison et densifier la plante." },
    { id: 'persil', n: 'Persil', l: 'Petroselinum crispum', cat: 'aromatique', fam: 'apiacees', ic: '🌿', gel: 'rustique', sol: 8, si: [-8, -4], pl: [0, 4], sd: [-4, 10], dtm: [70, 90], rec: 20, esp: [20, 25], h: 30, germ: 3, al: ['persil plat', 'persil frise', 'persil geant d italie'], c: "Levée très lente (3 à 4 semaines) : faire tremper les graines une nuit." },
    { id: 'coriandre', n: 'Coriandre', l: 'Coriandrum sativum', cat: 'aromatique', fam: 'apiacees', ic: '🌿', gel: 'demi', sol: 10, sd: [-2, 4], sa: [-12, -6], dtm: [40, 60], rec: 4, succ: 3, esp: [15, 25], h: 50, germ: 5, c: "Monte vite en graines par la chaleur : semis échelonnés au printemps et en fin d'été." },
    { id: 'aneth', n: 'Aneth', l: 'Anethum graveolens', cat: 'aromatique', fam: 'apiacees', ic: '🌿', gel: 'demi', sol: 10, sd: [0, 8], dtm: [45, 60], rec: 6, succ: 4, esp: [20, 30], h: 90, germ: 3, c: "Supporte mal le repiquage : semer en place. Ses fleurs attirent les syrphes." },
    { id: 'cerfeuil', n: 'Cerfeuil', l: 'Anthriscus cerefolium', cat: 'aromatique', fam: 'apiacees', ic: '🌿', gel: 'rustique', sol: 7, sd: [-4, 2], sa: [-10, -6], dtm: [45, 60], rec: 5, esp: [15, 20], h: 30, germ: 2, c: "Préfère la mi-ombre et la fraîcheur." },
    { id: 'thym', n: 'Thym', l: 'Thymus vulgaris', cat: 'aromatique', fam: 'lamiacees', ic: '🌿', gel: 'rustique', sol: 15, per: true, si: [-8, -6], pl: [1, 4], hv: { a: 'DG', w: [-6, 30] }, rec: 0, esp: [25, 30], h: 25, germ: 3, c: "Sol pauvre et bien drainé. Tailler après la floraison." },
    { id: 'romarin', n: 'Romarin', l: 'Salvia rosmarinus', cat: 'aromatique', fam: 'lamiacees', ic: '🌿', gel: 'demi', sol: 15, per: true, pl: [0, 6], hv: { a: 'DG', w: [-14, 34] }, rec: 0, esp: [60, 80], h: 100, germ: null, achat: 'plant', c: "Craint l'humidité hivernale plus que le froid." },
    { id: 'sauge', n: 'Sauge officinale', l: 'Salvia officinalis', cat: 'aromatique', fam: 'lamiacees', ic: '🌿', gel: 'rustique', sol: 15, per: true, pl: [0, 6], hv: { a: 'DG', w: [-4, 30] }, rec: 0, esp: [45, 60], h: 60, germ: 3, achat: 'plant', c: "Rabattre au printemps pour garder une touffe compacte." },
    { id: 'menthe', n: 'Menthe', l: 'Mentha spp.', cat: 'aromatique', fam: 'lamiacees', ic: '🌿', gel: 'rustique', sol: 10, per: true, pl: [-2, 6], hv: { a: 'DG', w: [-2, 28] }, rec: 0, esp: [30, 40], h: 50, germ: null, achat: 'plant', al: ['menthe verte', 'menthe poivree'], c: "Très envahissante : la cultiver en pot enterré." },
    { id: 'origan', n: 'Origan', l: 'Origanum vulgare', cat: 'aromatique', fam: 'lamiacees', ic: '🌿', gel: 'rustique', sol: 15, per: true, si: [-8, -6], pl: [1, 4], hv: { a: 'DG', w: [4, 26] }, rec: 0, esp: [30, 40], h: 40, germ: 3, al: ['marjolaine'], c: "Très mellifère quand il fleurit." },
    { id: 'estragon', n: 'Estragon', l: 'Artemisia dracunculus', cat: 'aromatique', fam: 'asteracees', ic: '🌿', gel: 'demi', sol: 12, per: true, pl: [0, 4], hv: { a: 'DG', w: [4, 24] }, rec: 0, esp: [40, 50], h: 60, germ: null, achat: 'plant', c: "L'estragon français ne se sème pas (plant obligatoire) ; celui de Russie se sème mais a moins de goût." },
    { id: 'melisse', n: 'Mélisse', l: 'Melissa officinalis', cat: 'aromatique', fam: 'lamiacees', ic: '🌿', gel: 'rustique', sol: 12, per: true, sd: [0, 6], pl: [0, 6], hv: { a: 'DG', w: [2, 26] }, rec: 0, esp: [40, 50], h: 60, germ: 3, c: "Se ressème facilement ; attire les abeilles." },
    { id: 'sarriette', n: 'Sarriette', l: 'Satureja hortensis', cat: 'aromatique', fam: 'lamiacees', ic: '🌿', gel: 'tendre', sol: 15, sd: [2, 6], dtm: [60, 70], rec: 10, esp: [20, 30], h: 30, germ: 3, c: "L'herbe traditionnelle des haricots, en cuisine comme au jardin." },

    // ---------- Fleurs ----------
    { id: 'oeillet-inde', n: "Œillet d'Inde", l: 'Tagetes patula', cat: 'fleur', fam: 'asteracees', ic: '🌼', gel: 'tendre', sol: 18, si: [-8, -6], pl: [2, 5], sd: [2, 5], dtm: [50, 60], rec: 16, esp: [25, 25], h: 30, germ: 3, al: ['tagete', 'tagetes', 'oeillets d inde'], c: "Cultivé serré pendant toute une saison, il réduit les nématodes du sol." },
    { id: 'rose-inde', n: "Rose d'Inde", l: 'Tagetes erecta', cat: 'fleur', fam: 'asteracees', ic: '🌼', gel: 'tendre', sol: 18, si: [-8, -6], pl: [2, 5], dtm: [60, 75], rec: 14, esp: [35, 35], h: 70, germ: 3, al: ['tagete erecta', 'rose d inde'], c: "Version haute de l'œillet d'Inde, bonne fleur à couper." },
    { id: 'souci', n: 'Souci', l: 'Calendula officinalis', cat: 'fleur', fam: 'asteracees', ic: '🌼', gel: 'demi', sol: 10, sd: [-4, 8], sa: [-8, -4], dtm: [45, 60], rec: 16, esp: [25, 30], h: 45, germ: 4, al: ['calendula', 'soucis'], c: "Fleurs comestibles ; attire syrphes et coccinelles. Se ressème seul." },
    { id: 'capucine', n: 'Capucine', l: 'Tropaeolum majus', cat: 'fleur', fam: 'tropaeolacees', ic: '🌺', gel: 'tendre', sol: 12, sd: [2, 6], dtm: [45, 60], rec: 14, esp: [30, 45], h: 30, germ: 4, al: ['capucines'], c: "Plante-piège : elle attire pucerons noirs et piérides loin des légumes. Fleurs et feuilles comestibles." },
    { id: 'bourrache', n: 'Bourrache', l: 'Borago officinalis', cat: 'fleur', fam: 'boraginacees', ic: '🪻', gel: 'demi', sol: 10, sd: [-2, 8], dtm: [50, 60], rec: 12, esp: [40, 45], h: 60, germ: 5, c: "Une des meilleures plantes pour les abeilles et bourdons. Fleurs comestibles." },
    { id: 'cosmos', n: 'Cosmos', l: 'Cosmos bipinnatus', cat: 'fleur', fam: 'asteracees', ic: '🌸', gel: 'tendre', sol: 16, si: [-6, -4], pl: [2, 4], sd: [2, 6], dtm: [60, 80], rec: 14, esp: [40, 45], h: 120, germ: 3, c: "Attire les auxiliaires (syrphes, chrysopes). Couper les fleurs fanées." },
    { id: 'tournesol', n: 'Tournesol', l: 'Helianthus annuus', cat: 'fleur', fam: 'asteracees', ic: '🌻', gel: 'tendre', sol: 10, sd: [1, 6], dtm: [70, 100], rec: 4, esp: [45, 60], h: 200, germ: 5, al: ['tournesols', 'soleil'], c: "Graines pour les oiseaux en automne. Peut servir de tuteur aux haricots." },
    { id: 'zinnia', n: 'Zinnia', l: 'Zinnia elegans', cat: 'fleur', fam: 'asteracees', ic: '🌸', gel: 'tendre', sol: 20, si: [-4, -2], pl: [2, 4], sd: [2, 5], dtm: [60, 75], rec: 12, esp: [30, 30], h: 70, germ: 5, al: ['zinnias'], c: "Excellente fleur à couper : plus on coupe, plus elle fleurit." },
    { id: 'pois-senteur', n: 'Pois de senteur', l: 'Lathyrus odoratus', cat: 'fleur', fam: 'fabacees', ic: '🌸', gel: 'demi', sol: 8, si: [-10, -6], pl: [-2, 1], sd: [-4, 0], dtm: [70, 90], rec: 8, esp: [15, 30], h: 180, germ: 4, al: ['pois de senteur', 'gesse odorante'], c: "Grimpant parfumé ; ses graines ne se mangent pas (toxiques)." },
    { id: 'dahlia', n: 'Dahlia', l: 'Dahlia spp.', cat: 'fleur', fam: 'asteracees', ic: '🌺', gel: 'tendre', sol: 12, per: true, pl: [2, 4], hv: { a: 'DG', w: [12, 28] }, rec: 0, esp: [60, 75], h: 100, germ: null, achat: 'tubercule', al: ['dahlias'], c: "Déterrer les tubercules après les premières gelées et les rentrer hors gel." },
    { id: 'bleuet', n: 'Bleuet', l: 'Centaurea cyanus', cat: 'fleur', fam: 'asteracees', ic: '🪻', gel: 'rustique', sol: 8, sd: [-4, 4], sa: [-8, -4], dtm: [60, 80], rec: 8, esp: [20, 30], h: 70, germ: 4, al: ['bleuets', 'centauree'], c: "Fleur messicole mellifère ; semis d'automne plus vigoureux." },
    { id: 'coquelicot', n: 'Coquelicot', l: 'Papaver rhoeas', cat: 'fleur', fam: 'papaveracees', ic: '🌺', gel: 'rustique', sol: 7, sd: [-6, 0], sa: [-8, -4], dtm: [60, 90], rec: 6, esp: [15, 25], h: 50, germ: 5, al: ['coquelicots'], c: "Semer à la volée sur sol nu ; ne supporte pas le repiquage." },
    { id: 'nigelle', n: 'Nigelle de Damas', l: 'Nigella damascena', cat: 'fleur', fam: 'renonculacees', ic: '🪻', gel: 'rustique', sol: 8, sd: [-4, 4], sa: [-8, -4], dtm: [60, 80], rec: 8, esp: [15, 25], h: 45, germ: 3, al: ['nigelle', 'cheveux de venus'], c: "Se ressème partout ; capsules décoratives en bouquet sec." },
    { id: 'alysse', n: 'Alysse odorante', l: 'Lobularia maritima', cat: 'fleur', fam: 'brassicacees', ic: '🌼', gel: 'demi', sol: 10, si: [-8, -6], pl: [0, 3], sd: [-2, 6], dtm: [40, 50], rec: 16, esp: [15, 20], h: 15, germ: 4, al: ['alysse', 'alyssum', 'corbeille d argent'], c: "Bordure basse très attractive pour les syrphes, prédateurs des pucerons." },
    { id: 'eschscholzia', n: 'Pavot de Californie', l: 'Eschscholzia californica', cat: 'fleur', fam: 'papaveracees', ic: '🌼', gel: 'demi', sol: 10, sd: [-2, 6], dtm: [60, 75], rec: 12, esp: [20, 25], h: 35, germ: 3, al: ['eschscholtzia', 'eschscholzia', 'pavot de californie'], c: "Sol pauvre et sec, plein soleil. Ne se repique pas." },
    { id: 'lavande', n: 'Lavande', l: 'Lavandula angustifolia', cat: 'fleur', fam: 'lamiacees', ic: '🪻', gel: 'rustique', sol: 15, per: true, pl: [0, 6], hv: { a: 'DG', w: [10, 16] }, rec: 0, esp: [40, 50], h: 50, germ: null, achat: 'plant', al: ['lavandes'], c: "Tailler après la floraison sans couper dans le vieux bois." },
    { id: 'echinacee', n: 'Échinacée', l: 'Echinacea purpurea', cat: 'fleur', fam: 'asteracees', ic: '🌸', gel: 'rustique', sol: 15, per: true, si: [-10, -8], pl: [1, 4], hv: { a: 'DG', w: [12, 20] }, rec: 0, esp: [40, 45], h: 90, germ: 3, al: ['echinacea', 'rudbeckia pourpre'], c: "Fleurit dès la deuxième année si semée ; laisser les têtes pour les oiseaux." },
    { id: 'achillee', n: 'Achillée', l: 'Achillea millefolium', cat: 'fleur', fam: 'asteracees', ic: '🌼', gel: 'rustique', sol: 12, per: true, pl: [0, 6], hv: { a: 'DG', w: [8, 18] }, rec: 0, esp: [40, 45], h: 60, germ: 3, achat: 'plant', al: ['achillee millefeuille', 'millefeuille'], c: "Ses ombelles plates attirent les guêpes parasitoïdes." },

    // ---------- Engrais verts et fleurs mellifères ----------
    { id: 'phacelie', n: 'Phacélie', l: 'Phacelia tanacetifolia', cat: 'engrais', fam: 'boraginacees', ic: '🪻', gel: 'demi', sol: 8, sd: [-2, 14], dtm: [40, 60], rec: 6, esp: [5, 15], h: 70, germ: 3, al: ['phacelia'], c: "Engrais vert à faucher avant la montée en graines, ou laisser fleurir pour les abeilles. Aucune famille potagère : idéale en rotation." },
    { id: 'trefle-incarnat', n: 'Trèfle incarnat', l: 'Trifolium incarnatum', cat: 'engrais', fam: 'fabacees', ic: '🌺', gel: 'rustique', sol: 8, sa: [-10, -4], hvSa: [2, 6], dtm: [180, 220], rec: 4, esp: [5, 15], h: 40, germ: 4, al: ['trefle', 'trefle blanc'], c: "Semé à la fin de l'été, il enrichit le sol en azote pendant l'hiver. Faucher à la floraison." },
    { id: 'moutarde', n: 'Moutarde blanche', l: 'Sinapis alba', cat: 'engrais', fam: 'brassicacees', ic: '🌼', gel: 'demi', sol: 6, sd: [0, 18], dtm: [40, 50], rec: 3, esp: [5, 15], h: 60, germ: 4, al: ['moutarde'], c: "Couvre vite le sol nu ; éviter avant des choux (même famille, hernie du chou)." },
    { id: 'sarrasin', n: 'Sarrasin', l: 'Fagopyrum esculentum', cat: 'engrais', fam: 'polygonacees', ic: '🌼', gel: 'tendre', sol: 10, sd: [3, 12], dtm: [35, 50], rec: 6, esp: [5, 15], h: 80, germ: 2, al: ['ble noir'], c: "Pousse vite, étouffe les mauvaises herbes et nourrit les pollinisateurs." },
  ];

  /* Associations entre plantes.
   * niveau : 'etude'    = effet mesuré dans des essais publiés
   *          'pratique' = logique sanitaire ou culturale (maladies, ravageurs ou besoins communs)
   *          'tradition'= recommandation de jardinier courante, non démontrée scientifiquement */
  const A = [
    // Bénéfiques démontrés
    ['mais', 'haricot-rames', '+', 'etude', "Les « trois sœurs » : le maïs sert de tuteur, le haricot fixe l'azote ; meilleur rendement total à surface égale."],
    ['mais', 'courge-musquee', '+', 'etude', "Les « trois sœurs » : la courge couvre le sol et limite les mauvaises herbes."],
    ['mais', 'potiron', '+', 'etude', "Les « trois sœurs » : la courge couvre le sol."],
    ['mais', 'potimarron', '+', 'etude', "Les « trois sœurs » : la courge couvre le sol."],
    ['haricot-rames', 'courge-musquee', '+', 'etude', "Les « trois sœurs »."],
    ['oeillet-inde', 'tomate', '+', 'etude', "Les Tagetes cultivés densément réduisent les nématodes à galles du sol."],
    ['oeillet-inde', 'tomate-cerise', '+', 'etude', "Réduction des nématodes à galles."],
    ['oeillet-inde', 'pomme-de-terre', '+', 'etude', "Réduction des nématodes du sol."],
    ['rose-inde', 'tomate', '+', 'etude', "Réduction des nématodes à galles."],
    ['capucine', 'chou-pomme', '+', 'etude', "Plante-piège pour la piéride et les pucerons (effet modéré)."],
    ['capucine', 'brocoli', '+', 'etude', "Plante-piège pour la piéride et les pucerons (effet modéré)."],
    ['capucine', 'chou-fleur', '+', 'etude', "Plante-piège pour la piéride (effet modéré)."],
    ['capucine', 'feve', '+', 'tradition', "Attire les pucerons noirs loin des fèves."],
    ['trefle-incarnat', 'chou-pomme', '+', 'etude', "Un sous-semis de trèfle réduit la mouche du chou et les pucerons (essais Finch & Collier)."],
    ['trefle-incarnat', 'brocoli', '+', 'etude', "Sous-semis de trèfle : moins de mouche du chou."],
    ['trefle-incarnat', 'chou-bruxelles', '+', 'etude', "Sous-semis de trèfle : moins de mouche du chou."],
    ['alysse', 'laitue', '+', 'etude', "L'alysse attire les syrphes dont les larves mangent les pucerons de la laitue."],
    ['alysse', 'chou-pomme', '+', 'etude', "Attire syrphes et parasitoïdes des pucerons."],
    ['phacelie', 'chou-pomme', '+', 'etude', "Bande fleurie à auxiliaires (syrphes)."],
    ['phacelie', 'tomate', '+', 'etude', "Attire pollinisateurs et auxiliaires."],
    ['oignon', 'carotte', '+', 'etude', "Effet limité sur la mouche de la carotte : il faut beaucoup plus d'oignons que de carottes."],
    ['poireau', 'carotte', '+', 'etude', "Effet limité sur les mouches de la carotte et du poireau ; utile en rangs alternés."],
    ['souci', 'tomate', '+', 'etude', "Attire syrphes et coccinelles."],
    ['bourrache', 'fraisier', '+', 'tradition', "Améliore la pollinisation (attire les bourdons)."],
    ['bourrache', 'courgette', '+', 'pratique', "Attire les pollinisateurs indispensables aux courgettes."],
    ['bourrache', 'tomate', '+', 'tradition', "Attire les pollinisateurs."],
    ['sarrasin', 'courgette', '+', 'pratique', "Attire les pollinisateurs."],
    ['cosmos', 'courgette', '+', 'pratique', "Attire les pollinisateurs."],
    ['radis', 'carotte', '+', 'pratique', "Le radis lève vite et marque le rang des carottes, plus lentes."],
    ['radis', 'laitue', '+', 'pratique', "Cultures rapides et peu profondes, faciles à associer."],
    ['laitue', 'carotte', '+', 'pratique', "Enracinements différents, la laitue occupe l'espace en attendant."],
    ['tournesol', 'concombre', '+', 'pratique', "Sert de support et d'ombrage léger."],
    ['mais', 'concombre', '+', 'pratique', "Le maïs peut servir de support."],
    // Tradition (non démontré)
    ['basilic', 'tomate', '+', 'tradition', "Association classique ; un effet contre aleurodes et thrips reste peu prouvé."],
    ['basilic', 'tomate-cerise', '+', 'tradition', "Association classique."],
    ['persil', 'tomate', '+', 'tradition', "Association classique."],
    ['ciboulette', 'carotte', '+', 'tradition', "L'odeur gênerait la mouche de la carotte."],
    ['ail', 'fraisier', '+', 'tradition', "Limiterait les maladies du fraisier."],
    ['epinard', 'fraisier', '+', 'tradition', "Couvre le sol entre les fraisiers."],
    ['betterave', 'oignon', '+', 'tradition', "Association classique."],
    ['celeri-branche', 'poireau', '+', 'tradition', "Association classique."],
    ['celeri-branche', 'chou-pomme', '+', 'tradition', "Gênerait la piéride."],
    ['celeri-rave', 'poireau', '+', 'tradition', "Association classique."],
    ['aneth', 'chou-pomme', '+', 'tradition', "Les fleurs attirent les guêpes parasitoïdes."],
    ['aneth', 'concombre', '+', 'tradition', "Association classique."],
    ['sauge', 'chou-pomme', '+', 'tradition', "L'odeur masquerait les choux aux piérides."],
    ['thym', 'chou-pomme', '+', 'tradition', "L'odeur masquerait les choux aux piérides."],
    ['romarin', 'carotte', '+', 'tradition', "L'odeur gênerait la mouche de la carotte."],
    ['haricot-nain', 'carotte', '+', 'tradition', "Association classique."],
    ['petit-pois', 'carotte', '+', 'tradition', "Association classique."],
    ['haricot-nain', 'mais', '+', 'tradition', "Version basse des trois sœurs."],
    ['haricot-nain', 'pomme-de-terre', '+', 'tradition', "Gênerait le doryphore."],
    ['aubergine', 'haricot-nain', '+', 'tradition', "Association classique."],
    ['sarriette', 'haricot-nain', '+', 'tradition', "Gênerait les pucerons noirs."],
    ['sarriette', 'haricot-rames', '+', 'tradition', "Gênerait les pucerons noirs."],
    ['courgette', 'capucine', '+', 'tradition', "Attire les pucerons loin des courgettes."],
    ['concombre', 'haricot-nain', '+', 'tradition', "Association classique."],
    ['laitue', 'fraisier', '+', 'tradition', "Association classique."],
    ['navet', 'petit-pois', '+', 'tradition', "Association classique."],
    ['tomate', 'carotte', '+', 'tradition', "Association classique."],
    ['tomate', 'ciboulette', '+', 'tradition', "Association classique."],
    ['menthe', 'chou-pomme', '+', 'tradition', "L'odeur gênerait l'altise et la piéride (garder la menthe en pot)."],
    ['coriandre', 'pomme-de-terre', '+', 'tradition', "Gênerait le doryphore."],
    // Défavorables
    ['tomate', 'pomme-de-terre', '-', 'pratique', "Même famille, même mildiou : le mildiou passe de l'une à l'autre."],
    ['tomate-cerise', 'pomme-de-terre', '-', 'pratique', "Même famille, même mildiou."],
    ['aubergine', 'pomme-de-terre', '-', 'pratique', "Mêmes ravageurs (doryphore) et maladies."],
    ['tomate', 'fenouil', '-', 'tradition', "Le fenouil gênerait la croissance de nombreuses plantes."],
    ['haricot-nain', 'fenouil', '-', 'tradition', "Effet inhibiteur supposé du fenouil."],
    ['carotte', 'aneth', '-', 'pratique', "Même famille : mêmes ravageurs, et risque de croisement si on garde ses graines."],
    ['carotte', 'fenouil', '-', 'pratique', "Même famille, mêmes ravageurs."],
    ['haricot-nain', 'oignon', '-', 'tradition', "Les alliacées freineraient les légumineuses."],
    ['haricot-nain', 'ail', '-', 'tradition', "Les alliacées freineraient les légumineuses."],
    ['haricot-nain', 'poireau', '-', 'tradition', "Les alliacées freineraient les légumineuses."],
    ['haricot-rames', 'oignon', '-', 'tradition', "Les alliacées freineraient les légumineuses."],
    ['petit-pois', 'oignon', '-', 'tradition', "Les alliacées freineraient les légumineuses."],
    ['petit-pois', 'ail', '-', 'tradition', "Les alliacées freineraient les légumineuses."],
    ['petit-pois', 'poireau', '-', 'tradition', "Les alliacées freineraient les légumineuses."],
    ['feve', 'oignon', '-', 'tradition', "Les alliacées freineraient les légumineuses."],
    ['ciboulette', 'petit-pois', '-', 'tradition', "Les alliacées freineraient les légumineuses."],
    ['ciboulette', 'haricot-nain', '-', 'tradition', "Les alliacées freineraient les légumineuses."],
    ['concombre', 'pomme-de-terre', '-', 'tradition', "Favoriserait le mildiou des pommes de terre."],
    ['courgette', 'pomme-de-terre', '-', 'tradition', "Concurrence pour l'eau et les nutriments."],
    ['tournesol', 'pomme-de-terre', '-', 'tradition', "Effet inhibiteur supposé du tournesol."],
    ['chou-pomme', 'fraisier', '-', 'tradition', "Association déconseillée traditionnellement."],
    ['mais', 'tomate', '-', 'pratique', "Partagent un ravageur (noctuelle de la tomate / ver de l'épi)."],
    ['moutarde', 'chou-pomme', '-', 'pratique', "Même famille : entretient la hernie du chou et l'altise."],
    ['fenouil', 'coriandre', '-', 'tradition', "La coriandre gênerait la montée en graines du fenouil."],
    ['betterave', 'haricot-rames', '-', 'tradition', "Association déconseillée traditionnellement."],
    ['epinard', 'betterave', '-', 'pratique', "Même famille, mêmes maladies."],
  ];

  const FAMILLES = {
    solanacees: { n: 'Solanacées (tomate, pomme de terre)', c: '#e05a47' },
    cucurbitacees: { n: 'Cucurbitacées (courges)', c: '#e9a23b' },
    fabacees: { n: 'Fabacées (légumineuses)', c: '#7cb342' },
    brassicacees: { n: 'Brassicacées (choux)', c: '#5c8f6b' },
    apiacees: { n: 'Apiacées (carotte, céleri)', c: '#f08c3a' },
    amaryllidacees: { n: 'Alliacées (ail, oignon)', c: '#b48ead' },
    amaranthacees: { n: 'Amaranthacées (betterave, épinard)', c: '#a3416b' },
    asteracees: { n: 'Astéracées (laitue, chicorée)', c: '#9ccc65' },
    poacees: { n: 'Poacées (maïs)', c: '#d4b94a' },
    convolvulacees: { n: 'Convolvulacées (patate douce)', c: '#c4776a' },
    caprifoliacees: { n: 'Caprifoliacées (mâche)', c: '#7aa66a' },
    lamiacees: { n: 'Lamiacées (aromatiques)', c: '#6f9a8d' },
    rosacees: { n: 'Rosacées (fruitiers)', c: '#d0607a' },
    grossulariacees: { n: 'Grossulariacées (groseilliers)', c: '#b5485d' },
    ericacees: { n: 'Éricacées (myrtillier)', c: '#5a6fb3' },
    vitacees: { n: 'Vitacées (vigne)', c: '#7d5ba6' },
    moracees: { n: 'Moracées (figuier)', c: '#8d6e63' },
    asparagacees: { n: 'Asparagacées (asperge)', c: '#8bc34a' },
    polygonacees: { n: 'Polygonacées (rhubarbe, oseille)', c: '#c0675c' },
    boraginacees: { n: 'Boraginacées (bourrache, phacélie)', c: '#6b8fd6' },
    tropaeolacees: { n: 'Tropéolacées (capucine)', c: '#f2994a' },
    papaveracees: { n: 'Papavéracées (pavots)', c: '#e2574c' },
    renonculacees: { n: 'Renonculacées (nigelle)', c: '#6c8ebf' },
  };

  const CATEGORIES = {
    legume: 'Légumes', fruit: 'Fruits', aromatique: 'Aromatiques', fleur: 'Fleurs', engrais: 'Engrais verts',
  };

  const SOURCES = [
    { n: 'RHS – Grow Your Own (fiches de culture)', u: 'https://www.rhs.org.uk/vegetables' },
    { n: 'Harrington & Minges, températures de germination des semences potagères (Université de Californie)', u: 'https://ucanr.edu/' },
    { n: 'Durées germinatives : tables des semenciers (GNIS, Vilmorin, Ferme de Sainte Marthe)', u: 'https://www.gnis.fr/' },
    { n: 'Wikipédia – Liste de plantes compagnes (et ses références)', u: 'https://en.wikipedia.org/wiki/List_of_companion_plants' },
    { n: 'Finch & Collier (2000), sous-semis de trèfle et mouche du chou', u: 'https://scholar.google.com/scholar?q=Finch+Collier+2000+host-plant+selection+insects+companion+planting' },
    { n: 'Hooks et al. (2010), Tagetes et nématodes – revue', u: 'https://scholar.google.com/scholar?q=Hooks+2010+marigold+Tagetes+nematode+management' },
    { n: 'Brennan (2013), alysse et pucerons de la laitue', u: 'https://scholar.google.com/scholar?q=Brennan+2013+sweet+alyssum+lettuce+aphid' },
    { n: 'Uvah & Coaker (1984), association carotte-oignon et mouche de la carotte', u: 'https://scholar.google.com/scholar?q=Uvah+Coaker+1984+carrot+onion+intercropping+carrot+fly' },
    { n: 'Météo : Open-Meteo (réanalyse ERA5 et prévisions)', u: 'https://open-meteo.com/' },
    { n: 'Parcelles : IGN API Carto – cadastre (PCI Express)', u: 'https://apicarto.ign.fr/api/doc/cadastre' },
    { n: 'Photo aérienne : IGN orthophotographies', u: 'https://geoservices.ign.fr/bdortho' },
  ];

  /* Besoin en soleil direct (heures par jour) pendant la période qui compte.
   * Valeurs usuelles : plein soleil = 6 h et plus, mi-ombre = 3 à 6 h. */
  const SOLEIL_H = {
    8: ['aubergine', 'poivron', 'piment', 'melon', 'pasteque', 'physalis', 'patate-douce'],
    7: ['tomate', 'tomate-cerise', 'mais', 'courge-musquee', 'potiron', 'potimarron', 'courgette', 'concombre', 'cornichon', 'haricot-rames', 'tournesol', 'zinnia', 'vigne', 'pecher', 'figuier', 'basilic'],
    5: ['chou-pomme', 'chou-fleur', 'brocoli', 'chou-bruxelles', 'chou-kale', 'chou-rave', 'poireau', 'betterave', 'carotte', 'fraisier', 'framboisier', 'myrtillier', 'murier', 'aneth', 'souci', 'alysse', 'bourrache', 'nigelle', 'echinacee', 'achillee', 'sarrasin', 'celeri-rave', 'celeri-branche', 'cerisier', 'prunier'],
    4: ['laitue', 'epinard', 'roquette', 'mache', 'blette', 'chicoree', 'pak-choi', 'chou-chinois', 'persil', 'coriandre', 'radis', 'radis-noir', 'navet', 'capucine', 'phacelie', 'trefle-incarnat', 'moutarde', 'petit-pois', 'pois-mangetout', 'feve', 'rhubarbe', 'oseille', 'melisse'],
    3: ['cerfeuil', 'ciboulette', 'menthe', 'groseillier', 'cassissier'],
  };
  const BESOIN = {};
  for (const [hres, ids] of Object.entries(SOLEIL_H)) for (const id of ids) BESOIN[id] = +hres;
  // Plantes qui apprécient un peu d'ombre en plein été (elles montent en graines au soleil brûlant).
  const OMBRE_ETE = new Set(['laitue', 'epinard', 'roquette', 'mache', 'cerfeuil', 'coriandre', 'radis', 'pak-choi', 'chou-chinois', 'groseillier', 'cassissier', 'menthe', 'persil']);
  // Pour ces plantes, c'est pendant la floraison et la formation des fruits que le soleil compte le plus.
  const FRUCTIFIE = new Set(['solanacees', 'cucurbitacees', 'poacees']);
  const FRUCTIFIE_ID = new Set(['haricot-nain', 'haricot-rames', 'petit-pois', 'pois-mangetout', 'feve', 'fraisier', 'framboisier', 'murier', 'myrtillier']);
  for (const p of P) {
    p.soleil = BESOIN[p.id] || 6;
    p.ombreEte = OMBRE_ETE.has(p.id);
    p.critique = (FRUCTIFIE.has(p.fam) && p.id !== 'pomme-de-terre') || FRUCTIFIE_ID.has(p.id) || p.cat === 'fleur' || p.cat === 'fruit' ? 'fruit' : 'tout';
  }

  /* Quantité conseillée (en plants) pour l'arrangement automatique :
   * « par personne » pour les légumes et aromatiques, « pour le jardin » pour les fleurs. */
  const PAR_PERSONNE = {
    tomate: 3, 'tomate-cerise': 1, aubergine: 1, poivron: 1, piment: 0.5, physalis: 0.5, courgette: 0.7, concombre: 1, cornichon: 1,
    melon: 1.5, pasteque: 0.5, 'courge-musquee': 1, potiron: 0.5, potimarron: 1, mais: 6, 'haricot-nain': 25, 'haricot-rames': 10,
    'petit-pois': 40, 'pois-mangetout': 20, feve: 15, carotte: 60, panais: 10, 'celeri-rave': 3, 'celeri-branche': 2, radis: 40,
    'radis-noir': 8, betterave: 15, navet: 15, poireau: 25, oignon: 40, 'oignon-bulbille': 40, echalote: 15, ail: 25,
    'pomme-de-terre': 10, 'patate-douce': 3, topinambour: 2, 'chou-pomme': 3, 'chou-fleur': 3, brocoli: 3, 'chou-bruxelles': 2,
    'chou-kale': 2, 'chou-rave': 4, 'chou-chinois': 3, 'pak-choi': 4, laitue: 12, mache: 40, roquette: 15, epinard: 20, blette: 3,
    chicoree: 4, fenouil: 5, artichaut: 1, asperge: 5, rhubarbe: 0.5, oseille: 1, fraisier: 8, framboisier: 3, groseillier: 1,
    cassissier: 0.5, myrtillier: 1, murier: 0.5, basilic: 3, persil: 3, coriandre: 4, aneth: 2, cerfeuil: 3, thym: 1, romarin: 0.5,
    sauge: 0.5, menthe: 0.5, origan: 1, estragon: 0.5, melisse: 0.5, sarriette: 1, ciboulette: 1,
  };
  const POUR_LE_JARDIN = {
    'oeillet-inde': 6, 'rose-inde': 3, souci: 5, capucine: 4, bourrache: 2, cosmos: 4, tournesol: 3, zinnia: 6, 'pois-senteur': 8,
    dahlia: 2, bleuet: 6, coquelicot: 10, nigelle: 6, alysse: 10, eschscholzia: 6, lavande: 2, echinacee: 2, achillee: 2,
    phacelie: 30, 'trefle-incarnat': 40, moutarde: 30, sarrasin: 30,
  };
  const quantiteConseillee = (p, personnes) => {
    if (POUR_LE_JARDIN[p.id]) return POUR_LE_JARDIN[p.id];
    const q = PAR_PERSONNE[p.id];
    return q ? Math.max(1, Math.round(q * personnes)) : 0;
  };

  window.PLANTES = P;
  window.quantiteConseillee = quantiteConseillee;
  window.PLANTES_PAR_ID = Object.fromEntries(P.map((p) => [p.id, p]));
  window.ASSOCIATIONS = A;
  window.FAMILLES = FAMILLES;
  window.CATEGORIES = CATEGORIES;
  window.SOURCES = SOURCES;
})();
