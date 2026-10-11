// Synchronisation des favoris entre appareils (Firebase : connexion Google +
// base Firestore). Facultative : sans configuration (js/firebase-config.js),
// rien n'est chargé. Le SDK Firebase n'est téléchargé que pour les personnes
// qui se connectent.
//
// Données : un document par compte, favoris/{uid} = { version, items, dossiers,
// reglages?, modifie } (reglages : seulement s'il y en a, cf. firestore.rules).
// Fusion : mergeUserData() (la version la plus récente de chaque favori, dossier
// et ville de dossier gagne,
// suppressions comprises).

import { cleanUserData, EMPTY_USER_DATA, mergeUserData, sameUserData } from './lib/userdata.js';

const FIREBASE_VERSION = '11.0.2';

/** Adaptateur Firebase réel (SDK modulaire chargé depuis le CDN de Google). */
export async function loadFirebaseFromCdn(config) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const ref = (uid) => F.doc(db, 'favoris', uid);
  return {
    onAuth: (cb) =>
      A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, name: u.displayName, email: u.email } : null)),
    signIn: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    signOut: () => A.signOut(auth),
    watch: (uid, onData, onError) =>
      F.onSnapshot(
        ref(uid),
        (snap) => onData(snap.exists() ? snap.data() : null, { local: snap.metadata.hasPendingWrites }),
        onError
      ),
    update: (uid, fn) =>
      F.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref(uid));
        const merged = fn(snap.exists() ? cleanUserData(snap.data()) : EMPTY_USER_DATA);
        tx.set(ref(uid), {
          version: 2,
          items: merged.items,
          dossiers: merged.dossiers,
          ...(merged.reglages ? { reglages: merged.reglages } : {}),
          modifie: F.serverTimestamp(),
        });
        return merged;
      }),
    remove: (uid) => F.deleteDoc(ref(uid)),
  };
}

/** Erreurs à ne pas signaler (fenêtre de connexion fermée par la personne). */
const SILENT_ERRORS = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];

/**
 * @param {object} o
 *   config          configuration Firebase, ou null (synchronisation absente)
 *   getLocal()      données locales { items, dossiers, reglages } (avec marques de suppression)
 *   setLocal(data)  remplace les données locales (et met l'affichage à jour)
 *   onState(state)  { status, user, error } — status : off | idle | loading |
 *                   signed-out | syncing | synced | error
 *   flag            { get(), set(value) } : mémorise qu'on était connecté
 *   loadFirebase    adaptateur (remplaçable pour les tests)
 */
export function createSync({ config, getLocal, setLocal, onState, flag, loadFirebase = loadFirebaseFromCdn, now = () => new Date(), pushDelay = 800 }) {
  let adapter = null;
  let connecting = null;
  let user = null;
  let unwatch = null;
  let timer = null;
  let pushing = Promise.resolve();
  let state = { status: config ? 'idle' : 'off', user: null, error: null };

  const setState = (patch) => {
    state = { ...state, ...patch };
    onState?.(state);
  };

  const fail = (err) => {
    if (SILENT_ERRORS.includes(err?.code)) {
      setState({ status: user ? 'synced' : 'signed-out', error: null });
      return;
    }
    console.warn('Synchronisation :', err);
    setState({ status: 'error', error: err?.message ?? String(err) });
  };

  function applyMerged(merged) {
    if (!sameUserData(merged, getLocal())) setLocal(merged);
  }

  function push() {
    if (!user || !adapter) return pushing;
    const uid = user.uid;
    clearTimeout(timer);
    timer = null;
    setState({ status: 'syncing' });
    pushing = pushing
      .then(() => adapter.update(uid, (remote) => mergeUserData(remote, getLocal(), now())))
      .then((merged) => {
        if (user?.uid !== uid) return;
        applyMerged(merged);
        setState({ status: 'synced', error: null });
      })
      .catch(fail);
    return pushing;
  }

  function schedulePush() {
    if (!user) return;
    clearTimeout(timer);
    timer = setTimeout(push, pushDelay);
  }

  function onRemote(doc, { local } = {}) {
    if (local) return; // écho de notre propre écriture
    const remote = doc == null ? null : cleanUserData(doc);
    const merged = mergeUserData(getLocal(), remote ?? EMPTY_USER_DATA, now());
    applyMerged(merged);
    if (remote == null || !sameUserData(merged, remote)) schedulePush();
    else if (!timer) setState({ status: 'synced', error: null });
  }

  function onAuth(u) {
    unwatch?.();
    unwatch = null;
    clearTimeout(timer);
    timer = null;
    user = u;
    if (u) {
      flag?.set('1');
      setState({ status: 'syncing', user: { name: u.name, email: u.email }, error: null });
      unwatch = adapter.watch(u.uid, onRemote, fail);
    } else {
      flag?.set('0');
      setState({ status: 'signed-out', user: null });
    }
  }

  function connect() {
    if (!config) return Promise.resolve(null);
    connecting ??= (async () => {
      setState({ status: 'loading', error: null });
      adapter = await loadFirebase(config);
      await new Promise((resolve) => {
        let first = true;
        adapter.onAuth((u) => {
          onAuth(u);
          if (first) {
            first = false;
            resolve();
          }
        });
      });
      return adapter;
    })().catch((err) => {
      connecting = null;
      fail(err);
      return null;
    });
    return connecting;
  }

  return {
    getState: () => state,
    /** Au démarrage : reconnexion automatique si on était connecté. */
    start() {
      if (!config) return onState?.(state);
      onState?.(state);
      if (flag?.get() === '1') connect();
    },
    async signIn() {
      const a = await connect();
      if (!a || user) return;
      setState({ status: 'loading', error: null });
      try {
        await a.signIn();
      } catch (err) {
        fail(err);
      }
    },
    async signOut() {
      if (!adapter) return;
      if (timer) await push();
      await pushing;
      await adapter.signOut().catch(fail);
    },
    /** Supprime les favoris enregistrés en ligne, puis déconnecte. */
    async deleteRemote() {
      if (!adapter || !user) return;
      clearTimeout(timer);
      timer = null;
      unwatch?.();
      unwatch = null;
      try {
        await pushing;
        await adapter.remove(user.uid);
        await adapter.signOut();
      } catch (err) {
        fail(err);
      }
    },
    /** À appeler après chaque modification locale des favoris. */
    notifyLocalChange() {
      schedulePush();
    },
    /** Envoie tout de suite les modifications en attente (ex. avant de quitter la page). */
    flush: () => (timer ? push() : pushing),
  };
}
