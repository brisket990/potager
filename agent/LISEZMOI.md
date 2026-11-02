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
| `lister_graines` / `ajouter_graines` / `modifier_graine` / `retirer_graine` | Stock de graines, avec les notes du sachet |
| `noter_journal` / `lire_journal` / `bilan` | Journal (avec auteur et photos) et bilan des récoltes |

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
