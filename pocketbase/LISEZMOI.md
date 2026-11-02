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
- toute modification d'un jardin doit porter une `version` plus grande que celle du serveur : un envoi basé sur une version dépassée est refusé, et l'app refusionne avant de renvoyer ;
- seul le propriétaire crée ou supprime les invitations ;
- on rejoint un jardin en créant sa fiche `membres` avec une invitation valide (non expirée) de ce jardin ;
- chacun peut quitter un jardin, le propriétaire peut retirer un membre ;
- la carte d'ensoleillement n'est pas envoyée : chaque appareil la recalcule.

## Mise en place (une seule fois)

1. **Compte administrateur** : dans Coolify, ouvrir Potager → production → pocketbase → Logs, copier le lien contenant `/_/#/pbinstal/`, remplacer `http://0.0.0.0:8080` par `https://pb.xothiques.duckdns.org`, l'ouvrir et créer le compte. Lien expiré : redémarrer le service, un nouveau lien apparaît.
2. **Importer les collections** : Settings → Import collections → « Load from JSON file » → choisir `collections.json` → **activer « Merge with the existing collections »** → Review → Confirm. Sans cette option, PocketBase supprimerait `users` et ses collections internes (erreur « The relation collection doesn't exist ») : dans « Detected changes », il ne doit y avoir aucune ligne « Deleted », seulement les 4 ajouts.
3. **Inscription seulement avec un code** : collection `users` → ⚙️ :
   - onglet Fields : « New field » → Relation, nom `invitation`, collection `invitations`, une seule valeur, non obligatoire → Save ;
   - onglet API Rules : **Create rule** = `invitation.expire > @now` → Save.

   Sans code valide, le serveur refuse donc la création d'un compte. Le compte administrateur, lui, peut toujours créer des comptes.
4. **Ton propre compte** (le premier, puisque personne ne peut encore t'inviter) : `users` → New record → e-mail, mot de passe, cocher « Verified » → Create.

Ensuite tout se fait dans l'app : créer le potager, générer un code d'invitation, et ta compagne crée son compte avec ce code.

## Mettre à jour un serveur déjà installé

Quand `collections.json` change, le réimporter comme à l'étape 2 (avec « Merge with the existing collections » activé) : « Detected changes » doit montrer seulement des collections modifiées (« Changed »), aucune « Deleted ». Les données ne sont pas touchées.

## Parcours dans l'app (`potager/js/synchro.js`)

- Synchronisation : `jardins.donnees` contient tout l'état de l'app sauf la saison affichée (propre à chaque appareil). Chaque envoi fait `version + 1` ; en cas de modifications des deux côtés, fusion à trois (dernier état commun, cet appareil, serveur), élément par élément pour les listes avec `id`. Les changements des autres arrivent en direct (abonnement temps réel à `jardins/<id>`).
- Photos : envoyées dans `photos` (`cle` = identifiant de la photo dans le journal), téléchargées à l'affichage sur les autres appareils.
- Lien d'invitation : `…/#code=<code>` ouvre directement le formulaire d'inscription avec le code.
- Inscription : `users` créé avec `email`, `password`, `passwordConfirm`, `invitation` = code ; puis connexion ; puis création de la fiche `membres` (`role: "membre"`, `invitation` = code, `jardin` = le jardin de l'invitation).
- Création d'un potager : `jardins` (`proprietaire` = soi), puis `membres` (`role: "proprietaire"`).
- Invitation : `invitations` (`jardin`, `nom_jardin`, `cree_par` = soi, `expire` = dans 7 jours) ; le code à transmettre est l'`id` de l'invitation.
