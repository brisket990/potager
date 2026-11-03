// Copie dans l'appli le code commun du site (plantes, calendrier, climat, synchronisation…).
// À lancer avant de tester l'appli ou de construire l'APK : node appli/preparer.mjs
// Les copies (www/js/commun) ne sont pas suivies par git : on modifie toujours les originaux dans potager/js.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const source = join(ici, '..', 'potager', 'js');
const cible = join(ici, 'www', 'js', 'commun');
const COMMUNS = ['util.js', 'plantes.js', 'climat.js', 'calendrier.js', 'soleil.js', 'app.js', 'synchro.js', 'terrain.js'];

rmSync(cible, { recursive: true, force: true });
mkdirSync(cible, { recursive: true });
for (const f of COMMUNS) copyFileSync(join(source, f), join(cible, f));
console.log(`${COMMUNS.length} fichiers communs copiés dans appli/www/js/commun.`);
