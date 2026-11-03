# Mon potager – notes pour Claude Code

Application web de planification de potager, développée avec Claude Code. Ce fichier sert à reprendre le travail sur un autre poste : il résume le projet, les choix déjà faits et la prochaine étape.

## L'utilisateur

- Jardinier amateur, francophone : répondre en français, expliquer simplement, sans jargon.
- Cultive avec sa compagne : ils veulent partager le même potager (prochaine étape).
- Infra perso : Proxmox + Coolify à la maison, domaine DuckDNS `xothiques.duckdns.org` (les sous-domaines pointent tous vers la box, ports 80/443 arrivent bien au proxy Traefik de Coolify).

## L'app aujourd'hui

HTML/CSS/JavaScript **sans framework ni étape de build** : scripts classiques (pas de modules ES), pour que `potager/index.html` s'ouvre aussi par double-clic. Interface et noms de code en français.

| Fichier | Rôle |
|---|---|
| `js/util.js` | `h()` (création d'éléments DOM/SVG), dates, stockage (`localStorage` + IndexedDB pour les photos), géométrie `G` des rectangles pivotés |
| `js/plantes.js` | ~110 plantes, associations (niveau de preuve : `etude` / `pratique` / `tradition`), familles, besoins en soleil, quantités par personne, sources |
| `js/climat.js` | Open-Meteo : 20 ans d'historique → dates de gelée, température du sol ; prévisions 16 jours |
| `js/calendrier.js` | Fenêtres de semis / plantation / récolte : semaines relatives à la dernière gelée (DG) ou première gelée (PG), décalées pour serre/tunnel/châssis |
| `js/soleil.js` | Position du soleil, cadastre IGN (API Carto), grille d'obstacles, lancer de rayon, essences d'arbres (feuillage selon le mois) |
| `js/terrain.js` | Import de parcelle, calcul et cache de l'ensoleillement, ombres à un instant donné, courbe et verdict par culture |
| `js/app.js` | État global `App.etat`, abris, voisins, rotation des cultures, reconnaissance des noms de graines, navigation |
| `agent/` | Agent jardinier : serveur MCP (`potager-mcp.mjs`) qui charge les fichiers de l'app dans Node (`noyau.mjs`) et expose des outils (`outils.mjs`) |
| `js/synchro.js` | Compte PocketBase (connexion, inscription par code), potager partagé, invitations, synchronisation (fusion à trois, version, temps réel), photos du journal sur le serveur ; carte « Compte et potager partagé » des Réglages |
| `js/plan.js` | Éditeur SVG : structures, obstacles (bâtiment, mur, clôture ajourée, haie, arbre), cultures, rotation des objets, fond photo aérienne, curseur d'heure du soleil |
| `js/auto.js` | Arrangement automatique (placement glouton puis améliorations) |
| `js/vues.js` | Onglets Maintenant, Mes graines, Calendrier, Plantes, Achats, Journal, Réglages |

Conventions utiles :
- Coordonnées du plan en **mètres**, x vers l'est, y vers le sud (nord en haut). Objets `{id, t, x, y, w, h, rot?}`, `rot` en degrés autour du centre.
- Seul l'affichage peut pivoter : `App.etat.orientation` (degrés, sens horaire, absent = nord en haut), réglé par la boussole de l'éditeur (clic = quart de tour, glisser = libre). Les données restent en coordonnées nord-sud ; dans `plan.js`, passer par `point()` pour convertir un clic, et les textes sont contre-tournés pour rester lisibles.
- Modifier l'état puis `App.sauver()` ; `App.rendre()` reconstruit la vue (l'éditeur de plan redessine localement avec `dessiner()` pendant les gestes).
- Données : `localStorage['potager']` (état JSON), IndexedDB `potager` (photos du journal + `grille:soleil`). Connecté : `localStorage['pb_auth']` (jeton), `['synchro']` (potager lié, version, dernier état commun, modifications en attente), `['serveur']` (adresse PocketBase si différente).
- `App.sauver()` prévient `Synchro.modifie()`, qui envoie quelques instants après la dernière modification. Tout ce qui est dans `App.etat` est partagé, sauf les clés de `LOCAL` dans `synchro.js` (la saison affichée). Les listes d'objets avec un `id` se fusionnent élément par élément : garder un `id` sur tout nouvel élément de liste.
- Graines (`App.etat.graines`) : `annee` = année du sachet (récolte, conditionnement), `limite` = « valable jusqu'en » (prioritaire pour l'état de germination) ; `pid` (plante du catalogue) ou `pid: null` + `texte` : ligne d'import non reconnue (menu ❓ pour choisir la plante) ou, avec `horsCatalogue: true` + `ic` (emoji) + `cat`, plante volontairement hors catalogue (fleur d'ornement…) ; `periodes` facultatif = dates retenues pour ce sachet (`[{ type: si|sd|pl|rec, du: 'MM-JJ', au: 'MM-JJ' }]`, choisies par le Jardinier avec l'utilisateur), qui remplacent le calcul de l'app (`App.periodesGraine`, `App.planteGraine`). Pas encore affichées dans l'onglet Calendrier.
- Afficher une photo du journal avec `Synchro.photo(cle)` (la télécharge si elle a été ajoutée sur un autre appareil).

## Choix déjà faits

- **Pas de LiDAR** : l'utilisateur l'a abandonné (arbres disparus encore détectés). Les ombres viennent uniquement des obstacles dessinés avec leur hauteur ; la photo aérienne IGN sert à les placer.
- Valeurs des plantes compilées à partir de références courantes, à vérifier sur les sachets ; le dire honnêtement, ne pas inventer de sources.
- Les associations « tradition » sont présentées comme non démontrées.

## Tester

```bash
npx -y http-server potager -p 8643 -c-1 -s
```

Puis ouvrir http://localhost:8643. Les données dépendent de l'adresse (origine) : ne pas effacer le stockage d'une origine où l'utilisateur a de vraies données.

Synchronisation : ne jamais tester sur le vrai serveur. Lancer un PocketBase jetable (binaire officiel GitHub, version du serveur) sur `127.0.0.1:8099`, l'installer comme dans `pocketbase/LISEZMOI.md`, servir l'app sur un autre port (ex. 8650) et utiliser deux origines (`127.0.0.1:8650` et `localhost:8650`) pour simuler deux personnes ; l'adresse du serveur se change dans Réglages → Compte → « Adresse du serveur » (ou `localStorage['serveur']`).

## Comptes et potager partagé

Objectif : se connecter avec un compte, retrouver le potager de n'importe où, le partager avec sa compagne.

Solution retenue : **PocketBase auto-hébergé sur Coolify** (service en un clic), plutôt que Supabase (trop lourd en auto-hébergé) ou un service en ligne.

1. ✅ PocketBase déployé sur Coolify (projet « Potager », service « pocketbase ») : `https://pb.xothiques.duckdns.org`. Claude pilote Coolify par son API avec le jeton de la variable d'environnement `COOLIFY_TOKEN` (ne jamais l'afficher ni le commiter). L'utilisateur crée lui-même le compte administrateur (ne jamais lui demander ce mot de passe).
2. Fichier de collections prêt : [pocketbase/collections.json](pocketbase/collections.json), mise en place et parcours décrits dans [pocketbase/LISEZMOI.md](pocketbase/LISEZMOI.md). Testé le 2026-11-02 sur un PocketBase 0.40.6 local jetable (import, inscription par code, accès membres / inconnu, photos protégées : tout passe). L'utilisateur l'a importé sur le serveur et a ajouté le champ `invitation` et la règle d'inscription (le 2026-11-02, d'après ses messages) ; la règle de `version` des jardins, ajoutée ensuite, demande un réimport.
3. ✅ Dans l'app (`js/synchro.js`) : connexion, **création de compte uniquement avec un code d'invitation** (choix de l'utilisateur ; le tout premier compte est créé dans le tableau de bord), mise en ligne des données locales, invitation par code ou lien `#code=…`, synchronisation en direct avec copie locale hors ligne, fusion des modifications simultanées, photos. Testé le 2026-11-02 sur PocketBase local avec deux navigateurs. Les vraies données sont dans le navigateur du premier poste : c'est là qu'il faut faire « Mettre mon potager en ligne ».
4. Servir l'app en site statique (Coolify depuis ce dépôt, ou GitHub Pages) : `https://potager.xothiques.duckdns.org`.

Crochet serveur `pocketbase/pb_hooks/versions.pb.js` : rend atomique la vérification de version (sans lui, des enregistrements simultanés s'effacent). Installé le 2026-11-02 sur Coolify : fichier monté `/app/pb_hooks/versions.pb.js` (contenu copié du dépôt : le remettre à jour s'il change) **et cité dans le Docker Compose du service** (sans cette ligne, Coolify ne le monte pas). Contrôle : `https://pb.xothiques.duckdns.org/api/potager/crochet` → `{"versions":true}`. Vérifié sur le vrai serveur avec le compte du jardinier : sur 5 envois simultanés, 1 accepté, 4 refusés (400). La règle de version de `collections.json` n'a pas encore été réimportée sur le serveur (le crochet suffit, la règle est une sécurité en plus).

## Agent jardinier (Hermes Agent, Telegram)

But : un agent « jardinier » à qui l'utilisateur et Angélique (sa compagne) écrivent sur Telegram (texte, photos de sachets, messages vocaux) ; il lit et tient le potager, conseille (livres de jardinage en EPUB), et prévient de lui-même quand il faut (gel, chaleur, arrosage), plus un point chaque lundi à 8 h.

- Machine : VM `hermes` (SSH `hermes`, Debian 13), Hermes Agent v0.22.5, modèle Gemini 3.7 Flash (lit les images), transcription audio active, Node embarqué dans `~/.hermes/tools/node-*/bin`. Le profil existant « proxmox » ne doit pas être touché : créer un **profil séparé `jardinier`** (sa personnalité, sa mémoire, ses outils, **son propre bot Telegram** que l'utilisateur crée lui-même avec @BotFather et dont il saisit lui-même le jeton).
- Choix : groupe Telegram « Potager » (l'utilisateur, Angélique, le bot) ; alertes par tâche planifiée en mode surveillance (`hermes cron create --monitor-script`, l'agent n'est réveillé que si une alerte apparaît), pas de message entre 22 h et 7 h ; livres EPUB **uniquement sur la machine hermes**, jamais dans ce dépôt public.
- Étapes : 1. ✅ boîte à outils MCP `agent/` (voir [agent/LISEZMOI.md](agent/LISEZMOI.md)), testée sur PocketBase local ; 2. ✅ alertes (`agent/alertes.mjs`, commande `surveiller`) et point du lundi (outil `point_de_la_semaine`), consignes Hermes dans `agent/hermes/` ; 3. ✅ bibliothèque (`agent/bibliotheque.mjs`, commande `bibliotheque`, outils `chercher_dans_les_livres` et `livres`), testée avec un livre libre de droits (Courtois-Gérard, Gutenberg n° 39889) ; 4. mise en place sur hermes (`agent/hermes/installer.sh`) : ✅ profil `jardinier` (fuseau Europe/Paris, la machine est en UTC), compétence « potager », compte du jardinier dans le potager « Drancy », outils MCP, bot @jardinierxothiques_bot (répond en privé), tâches planifiées « Alertes du potager » (toutes les heures, surveillance) et « Point du lundi » (lundi 8 h), crochet PocketBase ; reste : bot administrateur du groupe « Potager » + `/sethome` dans le groupe, livres EPUB dans `hermes:~/potager-livres` puis `potager-node ~/potager/agent/potager-mcp.mjs bibliotheque`, essai complet (photo de sachet, journal, question).
- Pièges Hermes : `hermes gateway setup` sans `-p jardinier` écrit dans le profil actif ; après un changement de jeton, `hermes -p jardinier gateway restart` ; le profil par défaut de la machine est devenu « jardinier » (`hermes profile use proxmox` pour revenir) ; Hermes retouche lui-même la compétence (« Self-improvement review: Skill 'potager' patched ») et l'installateur l'écrase : comparer avec `diff` avant de la recopier et reprendre dans le dépôt ce qui est utile.
- Comptes de test : noms neutres (« Test A »), jamais un prénom.

Sécurité : déconseiller d'exposer le tableau de bord Coolify sur Internet (à gérer en local, `http://IP-locale:8000`) ; seuls PocketBase et l'app doivent être publics.

## Dépôt

- GitHub : https://github.com/brisket990/potager (public, branche `main`).
- `gh` est installé et connecté sur le premier poste ; sur un autre poste, il faudra peut-être `gh auth login`.
