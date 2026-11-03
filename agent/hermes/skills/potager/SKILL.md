---
name: potager
description: "Tenir le potager familial : graines (photos de sachets), journal, semis, plantations, associations, météo, conseils tirés des livres."
version: 1.0.0
author: Jardinier
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [Jardin, Potager, Graines, Telegram]
---

# Potager

Les outils du serveur MCP « potager » donnent l'état réel du jardin et les calculs de l'app (calendrier selon les gelées du lieu, température du sol, associations, rotations, météo). Toujours les utiliser pour ce qui touche à ce jardin.

## Photo de sachets de graines
1. Lire chaque sachet : plante, variété, année (récolte ou date limite), quantité, indications utiles (périodes de semis, plantation, floraison ou récolte, profondeur, espacement, particularités). Info illisible : ne pas deviner, demander.
2. Les sachets vendus dans plusieurs pays donnent souvent plusieurs calendriers (par zone de climat ou par pays : France et Allemagne d'un côté, Espagne et Portugal de l'autre, par exemple). Repérer celui qui correspond au lieu du potager (`resume_potager` : lieu et dates de gelée) et le dire.
3. Comparer, pour chaque sachet, trois sources :
   - le sachet (le bon calendrier) ;
   - l'app : `fiche_plante` donne les dates calculées pour leur lieu (si la plante est dans le catalogue) ;
   - une recherche web sur cette plante (et la variété si elle compte) pour le nord de la France ou l'Île-de-France : semenciers et pépiniéristes professionnels, instituts techniques, sociétés d'horticulture, jardins botaniques. Éviter les forums et les sites de contenu sans auteur. Citer les sources retenues (nom du site).
4. Avant d'enregistrer, présenter la comparaison en quelques lignes : « Le sachet conseille… ; pour Drancy, l'app calcule… ; d'après [source]… → je propose… », en expliquant les écarts (gelées plus tardives au nord, semis sous abri plus tôt, plante bisannuelle, etc.). Si tout concorde, le dire simplement. Demander si on enregistre avec ces dates.
5. Après accord, `ajouter_graines` avec tous les sachets d'un coup : indications utiles et sources dans `notes`, dates retenues dans `periodes` (si elles diffèrent du calcul de l'app, ou si la plante est hors catalogue). Pour une plante déjà en stock dont on change seulement les dates : `modifier_graine`.
6. Répondre par ce qui a été enregistré et la prochaine action (`lister_graines`). Plante hors catalogue (fleurs d'ornement…) : prévenir que l'app n'a pas de fiche pour elle et suit seulement les dates retenues.

## Ce qu'ils racontent (« j'ai semé… », « récolté 2 kg… », « des pucerons sur… »)
- Noter avec `noter_journal` (type, plante, quantité et unité pour une récolte, `par` = prénom de la personne). Une photo reçue avec le message peut être jointe (`photos` = chemin du fichier).
- Pour un problème : proposer une cause probable et un remède doux, en cherchant dans les livres (`chercher_dans_les_livres`) ; dire qu'un diagnostic sur photo reste incertain.

## Questions
- « Que faire ? », « que semer ? » → `que_faire` (ou `point_de_la_semaine`).
- « Quand semer / planter X ? » → `fiche_plante` (dates calculées chez eux, en pleine terre et sous abri).
- « Je peux mettre X à côté de Y ? » → `associations` ; pour leur plan réel → `verifier_plan`.
- Météo, gel, chaleur → `meteo` et `alertes`.
- Conseils de culture, taille, maladies, recettes de jardinier → `chercher_dans_les_livres`, en citant le livre, puis compléter avec les données du jardin.

## Style
Court et concret sur Telegram. Toujours dire ce qui a été enregistré. Le plan du jardin (placer les bacs et les cultures) se modifie dans l'app, pas par message.
