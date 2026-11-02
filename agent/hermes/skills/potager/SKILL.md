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
1. Lire chaque sachet : plante, variété, année (récolte ou date limite), quantité, indications utiles (période de semis, profondeur, espacement, particularités).
2. Appeler `ajouter_graines` avec tous les sachets d'un coup ; mettre les indications dans `notes`.
3. Répondre par la liste de ce qui a été ajouté ou mis à jour, et quand semer chaque graine chez eux (`lister_graines` donne la fenêtre de semis).
4. Plante inconnue de l'app ou info illisible : ne pas deviner, demander.

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
