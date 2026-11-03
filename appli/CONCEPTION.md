# Appli Android « Mon potager » — conception

Le site (ordinateur) sert à **préparer** : dessiner le plan, placer les cultures, calculer le soleil, ranger les graines.
L'appli (téléphone et tablette Android) sert **au quotidien, au jardin** : le plan fait sur l'ordinateur sert de guide pour planter, et l'appli dit quoi faire et permet de noter vite ce qui a été fait. Les rappels restent le travail du Jardinier sur Telegram (alertes, point du lundi) : l'appli n'envoie pas de notifications.

## Choix faits (novembre 2026)

| Question | Choix |
|---|---|
| Usage | Lecture, plus quelques gestes rapides (tâche faite, récolte pesée, photo au journal). Le plan ne se modifie pas dans l'appli. |
| Appareils | Android seulement : le téléphone d'Hugo, celui d'Angélique, et une tablette qui reste au jardin. |
| Installation | Pas de Play Store (appli privée, pour eux deux) : un fichier **APK** installé à la main sur chaque appareil. |
| Soleil | Pas d'ensoleillement dans l'appli : le plan sert de guide, le soleil se règle sur l'ordinateur. |
| Rappels | Le Jardinier sur Telegram ; pas de notifications de l'appli. |

## Comment on la fabrique

- **Capacitor** : une coquille Android officielle autour d'une page web embarquée dans l'appli. On garde le même langage et surtout **le même code** que le site pour les plantes, le calendrier, le climat et la synchronisation (`potager/js/plantes.js`, `calendrier.js`, `climat.js`, `util.js`, `app.js`, `synchro.js`) : une date de semis calculée est la même partout.
- Les écrans, eux, sont nouveaux et pensés pour le doigt : gros boutons, une colonne sur téléphone, deux sur tablette, navigation par onglets en bas.
- Même compte et même potager que le site (PocketBase `https://pb.xothiques.duckdns.org`), avec la copie locale hors ligne déjà gérée par `synchro.js` : l'appli marche au fond du jardin sans réseau, et envoie les ajouts au retour du réseau.
- Pas de framework ni d'étape de build lourde, comme le site : un petit script copie les fichiers communs de `potager/js` dans l'appli avant chaque construction.

Organisation prévue :

```
appli/
  CONCEPTION.md        ce document
  package.json         Capacitor et ses greffons (caméra, partage)
  capacitor.config.json
  www/                 la page de l'appli
    index.html
    css/appli.css
    js/commun/         copiés depuis potager/js (ne pas modifier ici)
    js/ecrans.js       écrans de l'appli
  android/             projet Android généré par Capacitor
```

## Écrans

1. **Aujourd'hui** (écran d'ouverture)
   - Météo du jour et des 7 jours, alertes en cours (gel, chaleur, manque d'eau), comme le Jardinier les calcule.
   - À faire maintenant : semer, planter, **récolter** (zones du plan dont la récolte a commencé), avec un bouton **✓ Fait** qui note l'action au journal.
   - Graines à semer en ce moment.
2. **Plan** (lecture)
   - Le plan dessiné sur l'ordinateur, orienté comme sur le site ; on zoome et on se déplace avec les doigts.
   - Un appui sur une zone : la plante, la variété, le nombre de plants et leur espacement, depuis quand elle est en place, quand la récolter.
   - Choix du mois : ce qui est en terre en mai, en août…
3. **Graines** : le stock, une recherche, ce qui se sème maintenant, la validité des sachets.
4. **Journal** : les dernières entrées, et l'ajout rapide : récolte (plante, poids), observation, **photo prise avec l'appareil** ; « par Hugo » ou « par Angélique » selon le compte connecté (sur la tablette partagée, on choisit qui note).
5. **Plantes** : les fiches de culture (lecture), plantes perso comprises.
6. **Compte** : connexion (même e-mail et mot de passe que sur le site), potager choisi, état de la synchronisation.

Pas dans l'appli : modifier le plan, l'arrangement automatique, la parcelle, l'ensoleillement.

## Points à régler

- **Photos** : le greffon caméra de Capacitor ; les photos partent dans la collection `photos` comme celles du site.
- **Tablette du jardin** : mise en page à deux colonnes (plan à gauche, détail à droite). Elle reste dehors, souvent sans réseau : copie locale complète, et l'écran Aujourd'hui doit être lisible d'un coup d'œil. Compte : celui d'Hugo ou d'Angélique, ou un compte « Tablette du jardin » invité par code (à choisir) ; dans tous les cas on choisit qui note au journal.
- **Compatibilité** : l'appli embarque une copie du code du site. Quand le format des données change sur le site, il faut refaire l'APK et le réinstaller (l'appli peut prévenir qu'une version plus récente existe).

## Installation sans Play Store

- Sur le PC : **Android Studio** (il installe le SDK Android et Java). Claude construit l'APK avec Capacitor.
- L'APK est **signé** avec une clé créée une fois (fichier `.jks` et mot de passe) : Android n'accepte une mise à jour que si elle est signée avec la même clé. Cette clé reste sur le PC de l'utilisateur, hors du dépôt public, avec une copie de sauvegarde ; Claude ne voit pas le mot de passe.
- Sur chaque appareil : copier le fichier APK (câble USB, Google Drive, ou lien de téléchargement), l'ouvrir et autoriser l'installation depuis cette source (une fois). Pas de compte Google Play Console, rien à payer.
- **Mises à jour** : réinstaller le nouvel APK par-dessus l'ancien (les données et la connexion sont gardées). Pour simplifier : l'appli lit le numéro de la dernière version publiée et propose « Nouvelle version disponible : télécharger ».

## Étapes

1. ✅ **Maquette** (novembre 2026) : `appli/www` (`index.html`, `css/appli.css`, `js/icones.js`, `js/ecrans.js`), testée dans le navigateur en taille téléphone (375 × 812) et tablette paysage (1280 × 800), thème clair et sombre. Pour l'essayer :
   ```bash
   node appli/preparer.mjs
   npx -y http-server appli/www -p 8660 -c-1 -s
   ```
   puis ouvrir `http://127.0.0.1:8660/?demo` (données de démonstration, sans compte, chargées seulement si l'appareil est vide ; « Continuer avec les données de cet appareil »). Sans `?demo`, l'écran d'accueil propose la connexion au vrai compte : n'y faire que de la lecture tant que l'étape 2 n'est pas faite.
2. ✅ **Coquille Android** (APK de test le 2026-11-03, essayé par l'utilisateur sur son téléphone : fonctionne) : Capacitor 8.6, projet `appli/android` (identifiant `fr.xothiques.potager`), Gradle 9.1 (il faut ça pour Java 25), SDK Android d'Android Studio. Fabriquer l'APK :
   ```bash
   powershell -ExecutionPolicy Bypass -File appli/construire.ps1
   ```
   Le résultat est dans `appli/apk/mon-potager.apk`, qui n'est pas suivi par git. Pourquoi ce script : la protection de Windows contre les rançongiciels (accès contrôlé aux dossiers) empêche le Java de Temurin 25 d'écrire dans Documents, ce qui donne les erreurs « Cannot create directory ». On ne touche pas à ce réglage : le script construit dans une copie située dans `%LOCALAPPDATA%\MonPotager\appli`. L'APK de test est signé avec la clé de débogage d'Android Studio : pour passer à l'APK signé de l'étape 4, il faudra désinstaller l'appli une fois.
   Il n'y a pas d'émulateur sur le PC : l'essai se fait sur un vrai téléphone. Sans `?demo`, l'appli s'ouvre sur l'écran de connexion au vrai compte. Tant que l'étape 3 n'est pas faite, ne l'utiliser que pour lire.
3. **Gestes rapides** : tâche faite, récolte, photo avec la caméra, envoi différé hors ligne.
4. **Les trois appareils** : icône et nom, clé de signature, installation sur les deux téléphones et la tablette, message « nouvelle version disponible ».
