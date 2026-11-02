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
| `js/plan.js` | Éditeur SVG : structures, obstacles (bâtiment, mur, clôture ajourée, haie, arbre), cultures, rotation des objets, fond photo aérienne, curseur d'heure du soleil |
| `js/auto.js` | Arrangement automatique (placement glouton puis améliorations) |
| `js/vues.js` | Onglets Maintenant, Mes graines, Calendrier, Plantes, Achats, Journal, Réglages |

Conventions utiles :
- Coordonnées du plan en **mètres**, x vers l'est, y vers le sud (nord en haut). Objets `{id, t, x, y, w, h, rot?}`, `rot` en degrés autour du centre.
- Modifier l'état puis `App.sauver()` ; `App.rendre()` reconstruit la vue (l'éditeur de plan redessine localement avec `dessiner()` pendant les gestes).
- Données : `localStorage['potager']` (état JSON), IndexedDB `potager` (photos du journal + `grille:soleil`).

## Choix déjà faits

- **Pas de LiDAR** : l'utilisateur l'a abandonné (arbres disparus encore détectés). Les ombres viennent uniquement des obstacles dessinés avec leur hauteur ; la photo aérienne IGN sert à les placer.
- Valeurs des plantes compilées à partir de références courantes, à vérifier sur les sachets ; le dire honnêtement, ne pas inventer de sources.
- Les associations « tradition » sont présentées comme non démontrées.

## Tester

```bash
npx -y http-server potager -p 8643 -c-1 -s
```

Puis ouvrir http://localhost:8643. Les données dépendent de l'adresse (origine) : ne pas effacer le stockage d'une origine où l'utilisateur a de vraies données.

## Prochaine étape : comptes et potager partagé

Objectif : se connecter avec un compte, retrouver le potager de n'importe où, le partager avec sa compagne.

Solution retenue : **PocketBase auto-hébergé sur Coolify** (service en un clic), plutôt que Supabase (trop lourd en auto-hébergé) ou un service en ligne.

1. L'utilisateur déploie PocketBase sur Coolify avec le domaine `https://pb.xothiques.duckdns.org` et crée lui-même le compte administrateur (ne jamais lui demander ce mot de passe).
2. Préparer un fichier de collections PocketBase à importer : `jardins` (nom, propriétaire, données), membres / invitations par code, photos du journal ; règles d'accès limitées aux membres du jardin.
3. Dans l'app : écran de connexion (e-mail + mot de passe), création du potager, invitation par code, synchronisation en temps réel avec copie locale hors ligne, import des données locales existantes.
4. Servir l'app en site statique (Coolify depuis ce dépôt, ou GitHub Pages) : `https://potager.xothiques.duckdns.org`.

Sécurité : déconseiller d'exposer le tableau de bord Coolify sur Internet (à gérer en local, `http://IP-locale:8000`) ; seuls PocketBase et l'app doivent être publics.

## Dépôt

- GitHub : https://github.com/brisket990/potager (public, branche `main`).
- `gh` est installé et connecté sur le premier poste ; sur un autre poste, il faudra peut-être `gh auth login`.
