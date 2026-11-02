# Serveur PocketBase du potager

Adresse : https://pb.xothiques.duckdns.org (service « pocketbase » du projet « Potager » sur Coolify).

## Ce que contient `collections.json`

| Collection | Rôle |
|---|---|
| `jardins` | Un potager : nom, propriétaire, données de l'app (`donnees`, l'état JSON), `version` et `modifie_par` pour la synchronisation |
| `membres` | Qui a accès à quel jardin (`proprietaire` ou `membre`), avec le prénom affiché |
| `invitations` | Codes d'invitation : le code est l'identifiant de l'invitation (15 caractères), valable jusqu'à `expire` |
| `photos` | Photos du journal (`cle` = identifiant de la photo dans l'état), fichiers protégés |

Règles d'accès :
- un jardin n'est visible et modifiable que par son propriétaire et ses membres ; personne ne peut en changer le propriétaire ;
- seul le propriétaire crée ou supprime les invitations ;
- on rejoint un jardin en créant sa fiche `membres` avec une invitation valide (non expirée) de ce jardin ;
- chacun peut quitter un jardin, le propriétaire peut retirer un membre ;
- la carte d'ensoleillement n'est pas envoyée : chaque appareil la recalcule.

## Mise en place (une seule fois)

1. **Compte administrateur** : dans Coolify, ouvrir Potager → production → pocketbase → Logs, copier le lien contenant `/_/#/pbinstal/`, remplacer `http://0.0.0.0:8080` par `https://pb.xothiques.duckdns.org`, l'ouvrir et créer le compte. Lien expiré : redémarrer le service, un nouveau lien apparaît.
2. **Importer les collections** : Settings → Import collections → « Load from JSON file » → choisir `collections.json` → Review → Confirm. Laisser décochée l'option qui supprime les collections absentes du fichier.
3. **Inscription seulement avec un code** : collection `users` → ⚙️ :
   - onglet Fields : « New field » → Relation, nom `invitation`, collection `invitations`, une seule valeur, non obligatoire → Save ;
   - onglet API Rules : **Create rule** = `invitation.expire > @now` → Save.

   Sans code valide, le serveur refuse donc la création d'un compte. Le compte administrateur, lui, peut toujours créer des comptes.
4. **Ton propre compte** (le premier, puisque personne ne peut encore t'inviter) : `users` → New record → e-mail, mot de passe, cocher « Verified » → Create.

Ensuite tout se fait dans l'app : créer le potager, générer un code d'invitation, et ta compagne crée son compte avec ce code.

## Parcours prévu dans l'app

- Inscription : `users` créé avec `email`, `password`, `passwordConfirm`, `invitation` = code ; puis connexion ; puis création de la fiche `membres` (`role: "membre"`, `invitation` = code, `jardin` = le jardin de l'invitation).
- Création d'un potager : `jardins` (`proprietaire` = soi), puis `membres` (`role: "proprietaire"`).
- Invitation : `invitations` (`jardin`, `nom_jardin`, `cree_par` = soi, `expire` = dans 7 jours) ; le code à transmettre est l'`id` de l'invitation.
