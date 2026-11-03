# Agent jardinier

Boîte à outils (serveur MCP « potager ») qui permet à un agent IA, ici Hermes Agent, de consulter et de tenir le potager : il fait les mêmes calculs que l'app (calendrier selon les gelées du lieu, température du sol, associations, rotations) en chargeant directement ses fichiers `potager/js/*.js`.

Aucune dépendance : Node.js 20 ou plus suffit.

## Outils

| Outil | Rôle |
|---|---|
| `resume_potager` | Lieu, dates de gelée, terrain, plan de la saison (cultures et emplacements), graines, journal |
| `que_faire` | Semis, plantations, récoltes des prochains jours + graines du stock à semer, avec conseils météo |
| `meteo` | Prévisions jusqu'à 16 jours (gel, chaleur, pluie, sol) |
| `chercher_plante` | Retrouver une plante de la base de l'app |
| `fiche_plante` | Calendrier chez soi (pleine terre, tunnel, serre), exigences, associations, stock, emplacement |
| `associations` | Deux plantes côte à côte ? (avec le niveau de preuve) |
| `verifier_plan` | Voisinages et rotations du plan de la saison |
| `lister_graines` / `ajouter_graines` / `modifier_graine` / `retirer_graine` | Stock de graines : notes du sachet, année et date de validité, dates retenues pour le sachet |
| `fiche_plante_perso` | Crée ou corrige une plante perso (absente du catalogue) : fiche et calendrier fixe, pour le plan, le calendrier et les alertes |
| `noter_journal` / `lire_journal` / `bilan` | Journal (avec auteur et photos) et bilan des récoltes |
| `photos_journal` | Photos d'une entrée du journal, renvoyées en images MCP : l'agent les voit, et Hermes lui donne des lignes `MEDIA:` pour les joindre à un message |
| `chercher_dans_les_livres` / `livres` | Passages des livres de jardinage de la famille, avec titre, auteur et chapitre |
| `alertes` | Gel, forte chaleur, manque d'eau, orage des 3 prochains jours, seulement pour les cultures en terre |
| `point_de_la_semaine` | Tout pour le point du lundi : à faire, météo, alertes, graines à prévoir, semaine passée |

## Bibliothèque

Déposer les livres (EPUB, ou TXT / MD) dans `~/potager-livres` (ou `POTAGER_LIVRES`) sur la machine de l'agent, puis :

```bash
node agent/potager-mcp.mjs bibliotheque
```

Chaque livre est découpé en passages d'environ 1 400 caractères (sans couper un paragraphe ni mélanger deux chapitres) ; l'index va dans le cache. La recherche (`bibliotheque.mjs`) est une recherche par mots-clés classée par pertinence (BM25), adaptée au français : sans accents ni mots vides, pluriels et terminaisons courantes ramenés à la même racine ; le nom d'une plante reconnue dans la question ajoute ses synonymes et son nom latin. Les passages qui se suivent sont réunis. Les PDF ne sont pas lus : les convertir en EPUB (Calibre) ou en texte.

Les livres restent sur cette machine : ne jamais les ajouter au dépôt (public).

## Alertes et point du lundi

Calcul dans `alertes.mjs`, sans IA : météo Open-Meteo (7 jours passés, 4 à venir), cultures du plan réellement en terre à la date (calendrier de chaque culture), protection des abris (serre ≈ +3 °C la nuit, tunnel +2, châssis +1).

- Gel : culture « tendre » exposée à 1 °C ou moins (« demi » : −3 °C), sur les deux nuits à venir.
- Forte chaleur : 30 °C ou plus dans les 3 jours.
- Manque d'eau : pluie moins évaporation sur 7 jours ≤ −20 mm et moins de 5 mm annoncés ; rappel tous les 3 jours tant que ça dure.
- Orage (grêle) : dans les 2 jours.

`node agent/potager-mcp.mjs surveiller` affiche les alertes avec un identifiant stable (`[gel:2027-05-12] …`). Dans Hermes, une tâche planifiée en mode surveillance (`--monitor-script`, script `hermes/alertes.sh`, consigne `hermes/consigne-alertes.md`) ne réveille l'agent que si cette sortie change ; l'agent ne prévient que pour les nouveaux identifiants. Rien n'est envoyé la nuit (22 h – 7 h). Le point du lundi est une tâche planifiée classique avec `hermes/consigne-lundi.md`.

`node agent/potager-mcp.mjs journal` affiche les nouvelles entrées du journal écrites sur le site ou l'appli (`[journal:id] …`), puis répète la même sortie tant que rien de nouveau n'arrive. Dans Hermes, la tâche « Journal du potager » (toutes les 5 minutes, script `hermes/journal.sh`, consigne `hermes/consigne-journal.md`) réveille alors l'agent, qui regarde les photos (`photos_journal`) et poste l'entrée dans le groupe avec les photos et son avis. Le script laisse de côté les entrées notées par le Jardinier lui-même (champ `via: 'jardinier'`, elles viennent déjà de Telegram). Il attend jusqu'à 30 minutes les photos qui ne sont pas encore sur le serveur, et garde pour le matin ce qui arrive la nuit. Au premier passage, il prend tout le journal existant comme déjà vu. Sur un import en masse, il ne montre que les 5 entrées les plus récentes. Son état est dans `~/.cache/potager-agent/journal-surveillance.json`.

Chaque modification relit le potager, l'applique et l'envoie avec la version suivante ; si quelqu'un a enregistré entre-temps, le serveur refuse et l'outil recommence sur l'état à jour (voir `pocketbase/pb_hooks/versions.pb.js`). Les changements apparaissent en direct dans l'app.

## Mise en place

1. Dans l'app (compte propriétaire) : Réglages → Compte et potager partagé → « Créer un code d'invitation ».
2. Sur la machine de l'agent, dans une copie de ce dépôt :

   ```bash
   node agent/potager-mcp.mjs inscription
   ```

   Le compte du jardinier est créé avec un mot de passe aléatoire, enregistré dans `~/.config/potager-agent/config.json` (lisible par ce seul compte). Annuler ensuite le code dans l'app.
3. Brancher le serveur MCP sur l'agent, par exemple pour Hermes : `hermes -p jardinier mcp add potager --command node --args /chemin/vers/potager/agent/potager-mcp.mjs`.

Essai à la main : `node agent/potager-mcp.mjs outil que_faire '{"jours":7}'`.

Variables utiles : `POTAGER_CONFIG` (fichier de configuration), `POTAGER_CACHE` (cache du climat, `~/.cache/potager-agent` par défaut), `POTAGER_SERVEUR`, `POTAGER_EMAIL`, `POTAGER_MOT_DE_PASSE`, `POTAGER_JARDIN`.
