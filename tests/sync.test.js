import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addFavorite,
  isFavorite,
  mergeFavorites,
  removeFavorite,
  replaceFavorites,
  sameFavorites,
  setNote,
  syncMerge,
  visibleFavorites,
  TOMBSTONE_DAYS,
} from '../js/lib/favorites.js';
import { createSync } from '../js/sync.js';

const lille = { code: '59350', nom: 'Lille' };
const arras = { code: '62041', nom: 'Arras' };
const t = (minutes) => new Date(Date.UTC(2026, 9, 10, 12, minutes));

test('suppression : marque gardée, favori masqué, ré-ajout possible', () => {
  let favs = addFavorite([], lille, t(0));
  favs = setNote(favs, '59350', 'note', t(1));
  favs = removeFavorite(favs, '59350', t(2));
  assert.equal(favs.length, 1);
  assert.equal(favs[0].supprime, true);
  assert.equal(favs[0].note, '', 'la note n’est pas gardée');
  assert.equal(isFavorite(favs, '59350'), false);
  assert.deepEqual(visibleFavorites(favs), []);
  favs = addFavorite(favs, lille, t(3));
  assert.equal(favs.length, 1);
  assert.equal(isFavorite(favs, '59350'), true);
  assert.equal(favs[0].modifie, t(3).toISOString());
});

test('syncMerge : la version la plus récente gagne, suppressions comprises', () => {
  const phone = removeFavorite(addFavorite([], lille, t(0)), '59350', t(5));
  const laptop = setNote(addFavorite(addFavorite([], lille, t(0)), arras, t(1)), '59350', 'vieux', t(2));
  const merged = syncMerge(phone, laptop, t(10));
  assert.equal(isFavorite(merged, '59350'), false, 'la suppression (plus récente) l’emporte');
  assert.equal(isFavorite(merged, '62041'), true);
  // Note modifiée après la suppression sur l'autre appareil : le favori revient
  const later = setNote(laptop, '59350', 'récent', t(6));
  assert.equal(isFavorite(syncMerge(phone, later, t(10)), '59350'), true);
  // Commutatif
  assert.ok(sameFavorites(syncMerge(phone, laptop, t(10)), syncMerge(laptop, phone, t(10))));
});

test('syncMerge : vieilles marques de suppression effacées', () => {
  const old = removeFavorite(addFavorite([], lille, t(0)), '59350', t(1));
  const muchLater = new Date(t(1).getTime() + (TOMBSTONE_DAYS + 1) * 86400000);
  assert.deepEqual(syncMerge(old, [], muchLater), []);
  assert.equal(syncMerge(old, [], t(2)).length, 1);
});

test('import Fusionner / Remplacer avec marques de suppression', () => {
  const current = removeFavorite(addFavorite(addFavorite([], lille, t(0)), arras, t(0)), '62041', t(1));
  const incoming = [{ code: '62041', nom: 'Arras', note: 'Beffroi', ajoute: t(0).toISOString(), modifie: t(0).toISOString() }];
  const merged = mergeFavorites(current, incoming, t(2));
  assert.deepEqual(visibleFavorites(merged).map((f) => f.code).sort(), ['59350', '62041']);
  const replaced = replaceFavorites(current, incoming, t(3));
  assert.deepEqual(visibleFavorites(replaced).map((f) => f.code), ['62041']);
  assert.equal(replaced.find((f) => f.code === '59350').supprime, true, 'Lille retiré (propagé aux autres appareils)');
});

// --- Synchronisation : deux appareils, un faux Firebase en mémoire ---

function fakeCloud() {
  const docs = new Map();
  const watchers = new Map();
  const authListeners = new Set();
  let current = null;
  const notify = (uid) => {
    for (const cb of watchers.get(uid) ?? []) cb(docs.has(uid) ? structuredClone(docs.get(uid)) : null, { local: false });
  };
  return {
    docs,
    // Chaque appareil a son propre état de connexion
    device() {
      const listeners = new Set();
      let me = null;
      return {
        onAuth(cb) {
          listeners.add(cb);
          queueMicrotask(() => cb(me));
          return () => listeners.delete(cb);
        },
        async signIn() {
          me = { uid: 'u1', name: 'Test', email: 'test@example.com' };
          for (const cb of listeners) cb(me);
        },
        async signOut() {
          me = null;
          for (const cb of listeners) cb(null);
        },
        watch(uid, onData) {
          if (!watchers.has(uid)) watchers.set(uid, new Set());
          watchers.get(uid).add(onData);
          queueMicrotask(() => onData(docs.has(uid) ? structuredClone(docs.get(uid)) : null, { local: false }));
          return () => watchers.get(uid).delete(onData);
        },
        async update(uid, fn) {
          const items = fn(structuredClone(docs.get(uid) ?? []));
          docs.set(uid, structuredClone(items));
          queueMicrotask(() => notify(uid));
          return items;
        },
        async remove(uid) {
          docs.delete(uid);
          queueMicrotask(() => notify(uid));
        },
      };
    },
  };
}

function makeDevice(cloud, initial = []) {
  let local = initial;
  const states = [];
  const adapter = cloud.device();
  let flag = '0';
  const sync = createSync({
    config: { projectId: 'test' },
    getLocal: () => local,
    setLocal: (items) => (local = items),
    onState: (s) => states.push(s.status),
    flag: { get: () => flag, set: (v) => (flag = v) },
    loadFirebase: async () => adapter,
    pushDelay: 5,
  });
  return {
    sync,
    states,
    get local() {
      return local;
    },
    change(fn) {
      local = fn(local);
      sync.notifyLocalChange();
    },
    get flag() {
      return flag;
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 40));

test('sync : deux appareils se rejoignent, ajouts et suppressions propagés', async () => {
  const cloud = fakeCloud();
  const phone = makeDevice(cloud, addFavorite([], lille));
  const laptop = makeDevice(cloud, addFavorite([], arras));

  phone.sync.start();
  await phone.sync.signIn();
  await settle();
  assert.equal(phone.flag, '1');
  assert.deepEqual(visibleFavorites(cloud.docs.get('u1')).map((f) => f.code), ['59350']);

  laptop.sync.start();
  await laptop.sync.signIn();
  await settle();
  // Les favoris des deux appareils sont réunis partout
  for (const d of [phone, laptop]) {
    assert.deepEqual(visibleFavorites(d.local).map((f) => f.code).sort(), ['59350', '62041']);
  }

  // Suppression sur le téléphone → disparaît sur l'ordinateur
  phone.change((f) => removeFavorite(f, '59350'));
  await settle();
  assert.equal(isFavorite(laptop.local, '59350'), false);

  // Note sur l'ordinateur → visible sur le téléphone
  laptop.change((f) => setNote(f, '62041', 'Beffroi'));
  await settle();
  assert.equal(phone.local.find((f) => f.code === '62041').note, 'Beffroi');
  assert.equal(phone.sync.getState().status, 'synced');
});

test('sync : déconnexion garde les favoris locaux, suppression des données en ligne', async () => {
  const cloud = fakeCloud();
  const phone = makeDevice(cloud, addFavorite([], lille));
  phone.sync.start();
  await phone.sync.signIn();
  await settle();
  await phone.sync.signOut();
  assert.equal(phone.flag, '0');
  assert.equal(phone.sync.getState().status, 'signed-out');
  assert.equal(isFavorite(phone.local, '59350'), true);

  await phone.sync.signIn();
  await settle();
  await phone.sync.deleteRemote();
  await settle();
  assert.equal(cloud.docs.has('u1'), false);
  assert.equal(phone.sync.getState().status, 'signed-out');
});

test('sync : sans configuration, rien ne se passe', async () => {
  let loaded = false;
  const sync = createSync({
    config: null,
    getLocal: () => [],
    setLocal: () => {},
    onState: () => {},
    loadFirebase: async () => {
      loaded = true;
    },
  });
  sync.start();
  await sync.signIn();
  assert.equal(sync.getState().status, 'off');
  assert.equal(loaded, false);
});

test('sync : reconnexion automatique au démarrage si on était connecté', async () => {
  const cloud = fakeCloud();
  const adapter = cloud.device();
  await adapter.signIn(); // session déjà ouverte sur cet appareil
  let local = [];
  let loaded = 0;
  const sync = createSync({
    config: { projectId: 'test' },
    getLocal: () => local,
    setLocal: (items) => (local = items),
    onState: () => {},
    flag: { get: () => '1', set: () => {} },
    loadFirebase: async () => (loaded++, adapter),
    pushDelay: 5,
  });
  sync.start();
  await settle();
  assert.equal(loaded, 1);
  assert.equal(sync.getState().status, 'synced');
});
