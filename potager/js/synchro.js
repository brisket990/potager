/* Compte, potager partagé et synchronisation avec le serveur PocketBase.
 * L'état reste toujours enregistré dans ce navigateur (l'app marche hors ligne) ; une fois connecté,
 * il est aussi envoyé au serveur et les modifications des autres membres arrivent en direct. */
(function () {
  const { h, stock } = U;

  const SERVEUR_DEFAUT = 'https://pb.xothiques.duckdns.org';
  const LOCAL = ['annee']; // propre à chaque appareil : la saison affichée

  const S = {
    serveur: stock.lire('serveur', SERVEUR_DEFAUT),
    auth: stock.lire('pb_auth', null),   // { token, record } de l'utilisateur connecté
    // { utilisateur, jardin, nom, role, version, base (dernier état reçu du serveur), sale, envoyees (photos) }
    meta: stock.lire('synchro', null),
    statut: 'local',                     // local | ok | envoi | hors-ligne | session
    derniere: null,
    noms: {},                            // id utilisateur → prénom
    code: null,                          // code reçu par un lien d'invitation
  };

  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const estObjet = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const moi = () => S.auth && S.auth.record.id;
  const prenom = (r) => (r && (r.name || (r.email || '').split('@')[0])) || '';
  const filtre = (f) => 'filter=' + encodeURIComponent(f);
  const nettoyerCode = (c) => c.toLowerCase().replace(/[^a-z0-9]/g, '');
  const formatCode = (c) => c.match(/.{1,5}/g).join('-');
  const dansJours = (n) => new Date(Date.now() + n * U.JOUR).toISOString().replace('T', ' ');
  const lireDate = (s) => new Date(s.replace(' ', 'T'));
  const sauverMeta = () => { if (S.meta) stock.ecrire('synchro', S.meta); else localStorage.removeItem('synchro'); };
  const sauverAuth = () => { if (S.auth) stock.ecrire('pb_auth', S.auth); else localStorage.removeItem('pb_auth'); };
  const partage = (etat) => { const d = clone(etat); for (const k of LOCAL) delete d[k]; return d; };

  // Lien d'invitation : …/#code=xxxxx → ouvre les Réglages avec le code prérempli.
  if (location.hash.startsWith('#code=')) {
    S.code = nettoyerCode(location.hash.slice(6));
    history.replaceState(null, '', '#reglages');
  }

  // ---------- Serveur ----------
  async function api(methode, chemin, corps, form) {
    const headers = {};
    if (S.auth) headers.Authorization = S.auth.token;
    let body = form;
    if (!form && corps !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(corps); }
    let r;
    try { r = await fetch(S.serveur + chemin, { method: methode, headers, body }); }
    catch { throw Object.assign(new Error('Serveur injoignable : vérifie ta connexion internet.'), { status: 0 }); }
    const d = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(messageErreur(d, r.status)), { status: r.status, data: d });
    return d;
  }

  function messageErreur(d, status) {
    const champs = (d && d.data) || {};
    if (champs.email) return champs.email.code === 'validation_not_unique' ? 'Cette adresse e-mail a déjà un compte : connecte-toi plutôt.' : 'Adresse e-mail invalide.';
    if (champs.password) return 'Le mot de passe doit faire au moins 8 caractères.';
    if (champs.passwordConfirm) return 'Les deux mots de passe ne correspondent pas.';
    if (champs.invitation) return "Code d'invitation inconnu ou expiré.";
    if (status === 401 || status === 403) return 'Accès refusé : reconnecte-toi.';
    return `Le serveur a refusé la demande (erreur ${status}).`;
  }

  // ---------- Compte ----------
  async function connexion(email, mdp) {
    S.auth = null;
    let d;
    try { d = await api('POST', '/api/collections/users/auth-with-password', { identity: email, password: mdp }); }
    catch (e) { throw e.status === 400 ? new Error('E-mail ou mot de passe incorrect.') : e; }
    S.auth = { token: d.token, record: d.record };
    sauverAuth();
    if (S.meta && S.meta.utilisateur !== d.record.id) { S.meta = null; sauverMeta(); }
  }

  // Le serveur n'accepte l'inscription qu'avec un code d'invitation valide.
  async function inscription({ nom, email, mdp, code }) {
    S.auth = null;
    try { await api('POST', '/api/collections/users/records', { name: nom, email, password: mdp, passwordConfirm: mdp, invitation: code }); }
    catch (e) { throw e.status === 400 && !Object.keys((e.data && e.data.data) || {}).length ? new Error("Code d'invitation inconnu ou expiré.") : e; }
    await connexion(email, mdp);
    await rejoindre(code);
  }

  // On garde le lien avec le potager : en se reconnectant, la synchronisation reprend là où elle en était
  // (les modifications faites entre-temps partent à ce moment-là).
  function deconnexion() {
    fermerFlux();
    S.auth = null; sauverAuth();
    majStatut('local');
  }

  function sessionExpiree() {
    fermerFlux();
    S.auth = null; sauverAuth();
    majStatut('session');
    App.toast('Ta session a expiré : reconnecte-toi dans les Réglages pour reprendre la synchronisation.', true);
  }

  async function apresConnexion() {
    if (S.meta) { abonner(); chargerNoms(); await synchroniser(); }
    else {
      const jardins = await mesJardins();
      if (jardins.length === 1 && remplacerDonneesLocales(jardins[0].nom)) await lier(jardins[0].id);
    }
    App.toast(S.meta ? `Connecté au potager « ${S.meta.nom} ».` : 'Connecté.');
    App.rendre();
  }

  // ---------- Potagers ----------
  const aDesDonnees = () => {
    const e = App.etat;
    return !!(e.lieu || e.graines.length || e.journal.length || Object.values(e.plans).some((p) => p.objets.length));
  };
  const remplacerDonneesLocales = (nom) => !aDesDonnees() || confirm(
    `Les données de ce navigateur vont être remplacées par le potager « ${nom} ».\n\nSi tu veux les garder, annule et exporte d'abord une sauvegarde (Réglages → Sauvegarde).`);

  async function mesJardins() {
    const l = await api('GET', '/api/collections/jardins/records?perPage=50&fields=id,nom,proprietaire&sort=nom');
    return l.items;
  }

  async function lier(id) {
    const d = await api('GET', '/api/collections/jardins/records/' + id);
    S.meta = { utilisateur: moi(), jardin: id, nom: d.nom, role: d.proprietaire === moi() ? 'proprietaire' : 'membre', version: d.version, base: d.donnees || {}, sale: false, envoyees: [] };
    sauverMeta();
    appliquer(clone(S.meta.base));
    abonner();
    chargerNoms();
    S.derniere = new Date();
    majStatut('ok');
  }

  async function creerJardin(nom) {
    const donnees = partage(App.etat);
    const d = await api('POST', '/api/collections/jardins/records', { nom, proprietaire: moi(), donnees, version: 1, modifie_par: moi() });
    await api('POST', '/api/collections/membres/records', { jardin: d.id, utilisateur: moi(), role: 'proprietaire', nom: prenom(S.auth.record) });
    S.meta = { utilisateur: moi(), jardin: d.id, nom, role: 'proprietaire', version: d.version, base: donnees, sale: false, envoyees: [] };
    sauverMeta();
    abonner();
    chargerNoms();
    S.derniere = new Date();
    majStatut('ok');
    await envoyerPhotos();
  }

  async function rejoindre(code) {
    let inv;
    try { inv = await api('GET', '/api/collections/invitations/records/' + code); }
    catch (e) { throw e.status === 404 ? new Error("Code d'invitation inconnu.") : e; }
    if (lireDate(inv.expire) < new Date()) throw new Error('Ce code a expiré : demandes-en un nouveau.');
    if (!remplacerDonneesLocales(inv.nom_jardin || 'partagé')) return;
    try { await api('POST', '/api/collections/membres/records', { jardin: inv.jardin, utilisateur: moi(), role: 'membre', invitation: code, nom: prenom(S.auth.record) }); }
    catch (e) { if (!JSON.stringify(e.data || '').includes('not_unique')) throw e; } // déjà membre
    await lier(inv.jardin);
    S.code = null;
  }

  async function quitter() {
    const l = await api('GET', `/api/collections/membres/records?${filtre(`jardin='${S.meta.jardin}' && utilisateur='${moi()}'`)}`);
    for (const f of l.items) await api('DELETE', '/api/collections/membres/records/' + f.id);
    fermerFlux();
    S.meta = null; sauverMeta();
    majStatut('local');
  }

  async function chargerNoms() {
    try {
      const l = await api('GET', `/api/collections/membres/records?perPage=50&sort=created&${filtre(`jardin='${S.meta.jardin}'`)}`);
      for (const m of l.items) S.noms[m.utilisateur] = m.nom || 'un membre';
      return l.items;
    } catch { return null; }
  }

  // ---------- Fusion ----------
  // Fusion à trois : base = dernier état commun, local = cet appareil, distant = serveur.
  // Les listes d'éléments avec un id (objets du plan, graines, entrées du journal) se fusionnent élément par élément ;
  // si la même valeur a changé des deux côtés, celle de cet appareil l'emporte.
  function fusionner(base, local, distant) {
    if (egal(local, base)) return distant;
    if (egal(distant, base) || egal(local, distant)) return local;
    const avecIds = (l) => Array.isArray(l) && l.every((x) => estObjet(x) && typeof x.id === 'string');
    if (avecIds(local) && avecIds(distant)) return fusionnerListes(avecIds(base) ? base : [], local, distant);
    if (estObjet(local) && estObjet(distant)) {
      const b = estObjet(base) ? base : {};
      const res = {};
      for (const k of new Set([...Object.keys(local), ...Object.keys(distant)])) {
        const v = fusionner(b[k], local[k], distant[k]);
        if (v !== undefined) res[k] = v;
      }
      return res;
    }
    return local;
  }

  function fusionnerListes(base, local, distant) {
    const B = new Map(base.map((x) => [x.id, x]));
    const D = new Map(distant.map((x) => [x.id, x]));
    const res = [];
    // Un élément supprimé d'un côté disparaît, sauf s'il a été modifié de l'autre.
    for (const x of local) {
      if (D.has(x.id)) res.push(fusionner(B.get(x.id), x, D.get(x.id)));
      else if (!B.has(x.id) || !egal(x, B.get(x.id))) res.push(x);
    }
    const L = new Set(local.map((x) => x.id));
    for (const x of distant) if (!L.has(x.id) && (!B.has(x.id) || !egal(x, B.get(x.id)))) res.push(x);
    return res;
  }

  function appliquer(donnees) {
    const avant = App.etat;
    App.etat = Object.assign(App.etatDefaut(), donnees);
    for (const k of LOCAL) if (k in avant) App.etat[k] = avant[k];
    stock.ecrire('potager', App.etat);
    App.majContexte();
    App.rendre();
    if (!egal(avant.lieu, App.etat.lieu)) App.chargerMeteo(true).then(App.rendre);
  }

  // ---------- Synchronisation ----------
  let enCours = false, encore = false, minuteur = null, modifs = 0, attente = 0, pointeur = false;

  addEventListener('pointerdown', () => { pointeur = true; }, true);
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { pointeur = false; }, true);

  // On n'applique pas un changement distant pendant un geste, une saisie ou une fenêtre ouverte.
  function occupe() {
    const el = document.activeElement;
    const saisie = el && el.matches('textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=range])');
    return pointeur || saisie || !!document.querySelector('.modal-fond');
  }

  function planifier(delai = 1500) {
    clearTimeout(minuteur);
    minuteur = setTimeout(synchroniser, delai);
  }

  async function synchroniser() {
    if (!S.auth || !S.meta) return;
    if (enCours) { encore = true; return; }
    enCours = true;
    const m = S.meta;
    let envoi = false;
    try {
      if (m.sale) majStatut('envoi');
      const d = await api('GET', '/api/collections/jardins/records/' + m.jardin);
      if (d.version !== m.version) {
        if (occupe() && Date.now() - (attente || (attente = Date.now())) < 30000) { planifier(1500); return; }
        attente = 0;
        const nouveau = m.sale ? fusionner(m.base, partage(App.etat), d.donnees || {}) : clone(d.donnees || {});
        m.base = d.donnees || {}; m.version = d.version; m.nom = d.nom;
        if (m.sale && egal(nouveau, m.base)) m.sale = false;
        sauverMeta();
        appliquer(nouveau);
        App.toast(d.modifie_par === moi() ? 'Potager mis à jour depuis un autre appareil.' : `Potager mis à jour par ${S.noms[d.modifie_par] || 'un autre membre'}.`);
      }
      if (m.sale) {
        majStatut('envoi');
        const n = modifs;
        const donnees = partage(App.etat);
        // Le serveur refuse une version qui n'est pas plus récente que la sienne : on refusionnera.
        envoi = true;
        const r = await api('PATCH', '/api/collections/jardins/records/' + m.jardin, { donnees, version: m.version + 1, modifie_par: moi() });
        m.base = donnees; m.version = r.version;
        if (n === modifs) m.sale = false;
        sauverMeta();
        envoi = false;
      }
      await envoyerPhotos();
      S.derniere = new Date();
      majStatut('ok');
    } catch (e) {
      if (e.status === 401) sessionExpiree();
      // Quelqu'un a envoyé une version entre-temps (refus de la règle d'accès, ou du crochet du serveur).
      else if (envoi && (e.status === 404 || (e.status === 400 && e.data && e.data.data && e.data.data.version))) encore = true;
      else if (e.status === 404) {
        fermerFlux();
        App.toast(`Tu n'as plus accès au potager « ${m.nom} » (supprimé, ou tu as été retiré). Tes données restent dans ce navigateur.`, true);
        S.meta = null; sauverMeta(); majStatut('local'); App.rendre();
      } else { majStatut('hors-ligne'); planifier(30000); }
    } finally {
      enCours = false;
      if (encore) { encore = false; planifier(0); }
    }
  }

  // ---------- Direct (changements des autres membres) ----------
  let flux = null;
  function fermerFlux() { if (flux) { flux.close(); flux = null; } }
  function abonner() {
    fermerFlux();
    if (!S.auth || !S.meta || typeof EventSource === 'undefined') return;
    const sujet = 'jardins/' + S.meta.jardin;
    flux = new EventSource(S.serveur + '/api/realtime');
    flux.addEventListener('PB_CONNECT', async (e) => {
      try { await api('POST', '/api/realtime', { clientId: JSON.parse(e.data).clientId, subscriptions: [sujet] }); } catch { /* repris à la prochaine connexion */ }
      planifier(0); // rattrape ce qui a changé pendant une coupure
    });
    flux.addEventListener(sujet, (e) => {
      const { record } = JSON.parse(e.data);
      if (S.meta && record.version !== S.meta.version) planifier(0);
    });
    flux.onerror = () => { if (S.statut === 'ok') majStatut('hors-ligne'); }; // EventSource se reconnecte tout seul
  }

  addEventListener('online', () => planifier(0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) planifier(0); });
  setInterval(() => { if (S.meta && S.auth) planifier(0); }, 5 * 60000);

  // ---------- Photos du journal ----------
  async function envoyerPhotos() {
    const m = S.meta;
    if (!m) return;
    const envoyees = new Set(m.envoyees);
    const cles = [...new Set(App.etat.journal.flatMap((e) => e.photos || []))].filter((c) => !envoyees.has(c));
    const aEnvoyer = [];
    for (const cle of cles) {
      const b = await U.photos.lire(cle).catch(() => null);
      if (b instanceof Blob) aEnvoyer.push([cle, b]); // sinon : ajoutée sur un autre appareil, déjà sur le serveur
    }
    if (aEnvoyer.length > 3) App.toast(`Envoi de ${aEnvoyer.length} photos…`);
    for (const [cle, b] of aEnvoyer) {
      const f = new FormData();
      f.append('jardin', m.jardin); f.append('cle', cle); f.append('ajoute_par', moi());
      f.append('fichier', b, cle + '.jpg');
      try { await api('POST', '/api/collections/photos/records', undefined, f); }
      catch (e) { if (!JSON.stringify(e.data || '').includes('not_unique')) throw e; }
      m.envoyees.push(cle);
      sauverMeta();
    }
  }

  const trouverPhoto = async (cle) => (await api('GET', `/api/collections/photos/records?perPage=1&${filtre(`jardin='${S.meta.jardin}' && cle='${cle}'`)}`)).items[0];
  let jetonFichier = null;
  async function jeton() {
    if (!jetonFichier || Date.now() - jetonFichier.t > 100000) jetonFichier = { t: Date.now(), v: (await api('POST', '/api/files/token')).token };
    return jetonFichier.v;
  }

  // Photo depuis ce navigateur, sinon téléchargée du serveur (et gardée pour la suite).
  async function photo(cle) {
    const b = await U.photos.lire(cle).catch(() => null);
    if (b || !S.auth || !S.meta || !/^\w+$/.test(cle)) return b || null;
    try {
      const rec = await trouverPhoto(cle);
      if (!rec) return null;
      const r = await fetch(`${S.serveur}/api/files/photos/${rec.id}/${encodeURIComponent(rec.fichier)}?token=${await jeton()}`);
      if (!r.ok) return null;
      const blob = await r.blob();
      await U.photos.ecrire(cle, blob);
      if (!S.meta.envoyees.includes(cle)) { S.meta.envoyees.push(cle); sauverMeta(); }
      return blob;
    } catch { return null; }
  }

  async function supprimerPhoto(cle) {
    if (!S.auth || !S.meta || !/^\w+$/.test(cle)) return;
    try {
      const rec = await trouverPhoto(cle);
      if (rec) await api('DELETE', '/api/collections/photos/records/' + rec.id);
    } catch { /* hors ligne : la photo restera sur le serveur */ }
  }

  // ---------- Affichage ----------
  const STATUTS = { ok: ['☁️', 'Synchronisé'], envoi: ['🔄', 'Envoi…'], 'hors-ligne': ['⚠️', 'Hors ligne'], session: ['🔒', 'Reconnexion'] };

  function indicateur() {
    const s = STATUTS[S.statut];
    if (!s || (!S.meta && S.statut !== 'session')) return h('span', { class: 'synchro-statut' });
    return h('button', { class: 'lien synchro-statut', title: texteStatut(), onclick: () => App.aller('reglages') }, s[0], ' ', h('span', { class: 'synchro-mot' }, s[1]));
  }

  function texteStatut() {
    const m = S.meta;
    if (S.statut === 'session') return '🔒 Session expirée : reconnecte-toi pour reprendre la synchronisation.';
    if (!m) return '';
    if (S.statut === 'hors-ligne') return `⚠️ Serveur injoignable${m.sale ? ' : tes modifications partiront dès le retour de la connexion' : ''}.`;
    if (S.statut === 'envoi' || m.sale) return '🔄 Synchronisation en cours…';
    return '✓ À jour' + (S.derniere ? ` (${S.derniere.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})` : '');
  }

  function majStatut(s) {
    S.statut = s;
    for (const el of document.querySelectorAll('.synchro-statut')) el.replaceWith(indicateur());
    for (const el of document.querySelectorAll('.synchro-texte')) el.textContent = texteStatut();
  }

  // Bouton qui lance une action longue, avec un message d'erreur lisible.
  async function lancer(bouton, fn) {
    bouton.disabled = true;
    try { await fn(); } catch (e) { App.toast(e.message, true); } finally { bouton.disabled = false; }
  }
  const formulaire = (champs, libelle, fn) => {
    const bouton = h('button', { class: 'bouton primaire', type: 'submit' }, libelle);
    return h('form', { class: 'form-compte', onsubmit: (e) => { e.preventDefault(); lancer(bouton, fn); } }, champs, bouton);
  };
  const champ = (libelle, attrs) => {
    const input = h('input', attrs);
    return [h('label', { class: 'champ' }, libelle, input), input];
  };

  function carte() {
    const el = h('section', { class: 'carte compte' });
    remplir(el);
    return el;
  }

  function remplir(el) {
    const titre = h('h2', {}, '👥 Compte et potager partagé');
    el.replaceChildren();
    U.ajouter(el, [titre, !S.auth ? vueConnexion(el) : !S.meta ? vueSansJardin(el) : vueJardin(el)]);
  }

  function vueConnexion(el) {
    const [lEmail, email] = champ('E-mail', { type: 'email', required: true, autocomplete: 'username' });
    const [lMdp, mdp] = champ('Mot de passe', { type: 'password', required: true, autocomplete: 'current-password' });
    const fConnexion = formulaire([lEmail, lMdp], 'Se connecter', async () => {
      await connexion(email.value.trim(), mdp.value);
      await apresConnexion();
    });

    const [lNom, nom] = champ('Prénom', { required: true, maxlength: 60, autocomplete: 'given-name' });
    const [lEmail2, email2] = champ('E-mail', { type: 'email', required: true, autocomplete: 'username' });
    const [lMdp2, mdp2] = champ('Mot de passe (8 caractères minimum)', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password' });
    const [lCode, code] = champ("Code d'invitation", { required: true, value: S.code ? formatCode(S.code) : '', placeholder: 'xxxxx-xxxxx-xxxxx', autocomplete: 'off' });
    const fInscription = formulaire([lNom, lEmail2, lMdp2, lCode], 'Créer mon compte', async () => {
      await inscription({ nom: nom.value.trim(), email: email2.value.trim(), mdp: mdp2.value, code: nettoyerCode(code.value) });
      App.toast(S.meta ? `Bienvenue dans le potager « ${S.meta.nom} » !` : 'Compte créé.');
      App.rendre();
    });

    const fServeur = h('input', { value: S.serveur, 'aria-label': 'Adresse du serveur' });
    return [
      S.meta
        ? h('p', { class: S.statut === 'session' ? 'avertissement' : 'note' }, S.statut === 'session' ? '🔒 Ta session a expiré : r' : 'R',
          `econnecte-toi pour synchroniser le potager « ${S.meta.nom} ». Tes modifications sont gardées en attendant.`)
        : h('p', { class: 'note' }, 'Avec un compte, tu retrouves ton potager sur tous tes appareils et tu peux le partager. Sans compte, tout reste dans ce navigateur.'),
      fConnexion,
      h('details', { class: 'plier', open: !!S.code }, h('summary', {}, "Créer un compte avec un code d'invitation"),
        h('p', { class: 'note' }, "Le code t'est donné par la personne qui t'invite dans son potager."), fInscription),
      h('details', { class: 'plier sous' }, h('summary', {}, 'Adresse du serveur'),
        h('div', { class: 'ligne-champ' }, fServeur, h('button', { class: 'bouton petit', onclick: () => {
          S.serveur = fServeur.value.trim().replace(/\/+$/, '') || SERVEUR_DEFAUT;
          stock.ecrire('serveur', S.serveur);
          App.toast('Adresse du serveur enregistrée.');
        } }, 'Enregistrer'))),
    ];
  }

  function vueSansJardin(el) {
    const liste = h('div');
    mesJardins().then((js) => {
      if (!js.length) return;
      liste.replaceChildren(h('h3', {}, 'Mes potagers en ligne'), h('ul', { class: 'liste-membres' }, js.map((j) => {
        const b = h('button', { class: 'bouton petit', onclick: () => lancer(b, async () => {
          if (!remplacerDonneesLocales(j.nom)) return;
          await lier(j.id);
          App.toast(`Potager « ${j.nom} » ouvert.`);
        }) }, 'Ouvrir');
        return h('li', {}, h('span', {}, j.nom), b);
      })));
    }).catch(() => {});

    const nom = h('input', { value: `Potager de ${prenom(S.auth.record)}`, maxlength: 80, required: true, 'aria-label': 'Nom du potager' });
    const code = h('input', { value: S.code ? formatCode(S.code) : '', placeholder: 'xxxxx-xxxxx-xxxxx', required: true, 'aria-label': "Code d'invitation" });
    return [
      h('p', {}, 'Connecté : ', h('strong', {}, S.auth.record.email)),
      liste,
      h('h3', {}, 'Mettre mon potager en ligne'),
      h('p', { class: 'note' }, 'Le plan, les graines, le journal et les photos de ce navigateur sont envoyés sur le serveur. Tu pourras ensuite inviter quelqu\'un.'),
      formulaire(h('div', { class: 'ligne-champ' }, nom), 'Créer', async () => {
        await creerJardin(nom.value.trim());
        App.toast(`Potager « ${S.meta.nom} » en ligne.`);
        App.rendre();
      }),
      h('h3', {}, 'Rejoindre un potager'),
      h('p', { class: 'note' }, 'Avec le code donné par son propriétaire.'),
      formulaire(h('div', { class: 'ligne-champ' }, code), 'Rejoindre', async () => {
        await rejoindre(nettoyerCode(code.value));
        if (S.meta) App.toast(`Bienvenue dans le potager « ${S.meta.nom} » !`);
        App.rendre();
      }),
      h('div', { class: 'boutons' }, h('button', { class: 'bouton petit', onclick: () => { deconnexion(); App.rendre(); } }, 'Se déconnecter')),
    ];
  }

  function vueJardin(el) {
    const m = S.meta;
    const proprio = m.role === 'proprietaire';
    const membres = h('ul', { class: 'liste-membres' }, h('li', { class: 'vide' }, 'Chargement…'));
    chargerNoms().then((l) => {
      if (!l) { membres.replaceChildren(h('li', { class: 'vide' }, 'Liste indisponible hors ligne.')); return; }
      membres.replaceChildren(...l.map((x) => {
        const b = proprio && x.utilisateur !== moi() ? h('button', { class: 'bouton petit danger', onclick: () => lancer(b, async () => {
          if (!confirm(`Retirer ${x.nom || 'ce membre'} du potager ? Il n'y aura plus accès.`)) return;
          await api('DELETE', '/api/collections/membres/records/' + x.id);
          remplir(el);
        }) }, 'Retirer') : null;
        return h('li', {}, h('span', {}, x.nom || 'Sans nom', x.utilisateur === moi() ? ' (toi)' : '',
          h('span', { class: 'sous' }, x.role === 'proprietaire' ? ' · propriétaire' : ' · membre')), b);
      }));
    });

    const invitations = h('div');
    const majInvitations = () => api('GET', `/api/collections/invitations/records?sort=-created&${filtre(`jardin='${m.jardin}' && expire > @now`)}`).then((l) => {
      invitations.replaceChildren(...l.items.map((inv) => {
        const lien = /^https?:/.test(location.protocol) ? `${location.origin}${location.pathname}#code=${inv.id}` : null;
        const texte = `Code d'invitation pour le potager « ${m.nom} » : ${formatCode(inv.id)}` + (lien ? `\nOu ouvre ce lien : ${lien}` : '');
        const annuler = h('button', { class: 'bouton petit danger', onclick: () => lancer(annuler, async () => {
          await api('DELETE', '/api/collections/invitations/records/' + inv.id);
          majInvitations();
        }) }, 'Annuler');
        return h('div', { class: 'invitation' },
          h('code', { class: 'code-invitation' }, formatCode(inv.id)),
          h('span', { class: 'sous' }, `valable jusqu'au ${U.fmtDateLongue(lireDate(inv.expire))}`),
          h('div', { class: 'boutons' },
            h('button', { class: 'bouton petit', onclick: () => navigator.clipboard.writeText(texte).then(() => App.toast('Copié : tu peux le coller dans un message.'), () => App.toast('Copie impossible : recopie le code à la main.', true)) }, '📋 Copier'),
            annuler));
      }));
    }).catch(() => {});
    if (proprio) majInvitations();

    const inviter = h('button', { class: 'bouton', onclick: () => lancer(inviter, async () => {
      await api('POST', '/api/collections/invitations/records', { jardin: m.jardin, nom_jardin: m.nom, cree_par: moi(), expire: dansJours(7) });
      await majInvitations();
    }) }, "➕ Créer un code d'invitation");

    const maintenant = h('button', { class: 'bouton petit', onclick: () => lancer(maintenant, synchroniser) }, '🔄 Synchroniser maintenant');
    return [
      h('p', {}, 'Potager ', h('strong', {}, `« ${m.nom} »`), ' · connecté : ', S.auth.record.email),
      h('p', { class: 'synchro-texte note' }, texteStatut()),
      h('h3', {}, 'Membres'), membres,
      proprio ? [
        h('h3', {}, 'Inviter quelqu\'un'),
        h('p', { class: 'note' }, "Le code est valable 7 jours. La personne crée son compte dans l'app avec ce code (ou, si elle a déjà un compte, l'utilise dans « Rejoindre un potager »)."),
        inviter, invitations,
      ] : null,
      h('div', { class: 'boutons' },
        maintenant,
        !proprio ? h('button', { class: 'bouton petit danger', onclick: (e) => lancer(e.currentTarget, async () => {
          if (!confirm(`Quitter le potager « ${m.nom} » ? Tu n'y auras plus accès (une copie reste dans ce navigateur).`)) return;
          await quitter();
          App.rendre();
        }) }, 'Quitter ce potager') : null,
        h('button', { class: 'bouton petit', onclick: () => { deconnexion(); App.rendre(); } }, 'Se déconnecter')),
    ];
  }

  // ---------- Démarrage ----------
  async function demarrer() {
    if (!S.auth) { if (S.meta) majStatut('session'); return; }
    try {
      const d = await api('POST', '/api/collections/users/auth-refresh');
      S.auth = { token: d.token, record: d.record };
      sauverAuth();
    } catch (e) {
      if (e.status === 401 || e.status === 403 || e.status === 404) { sessionExpiree(); return; }
    }
    if (S.meta) { abonner(); chargerNoms(); synchroniser(); }
  }

  window.Synchro = {
    demarrer, carte, indicateur, photo, supprimerPhoto, fusionner,
    // Appelé à chaque enregistrement local : l'envoi part quelques instants après la dernière modification.
    modifie() {
      if (!S.meta) return;
      modifs++;
      if (!S.meta.sale) { S.meta.sale = true; sauverMeta(); }
      if (S.auth) planifier();
    },
    connecte: () => !!(S.auth && S.meta),
    nomJardin: () => S.meta && S.meta.nom,
    oublier() { fermerFlux(); localStorage.removeItem('synchro'); localStorage.removeItem('pb_auth'); },
  };
})();
