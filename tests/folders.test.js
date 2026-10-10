import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addToFolder,
  cleanFolders,
  createFolder,
  deleteFolder,
  findFolder,
  folderCities,
  foldersContaining,
  mergeFolders,
  migrateFavoriteNotes,
  removeFromFolder,
  renameFolder,
  sameFolders,
  setFolderNote,
  visibleFolders,
  MAX_FOLDERS,
} from '../js/lib/folders.js';
import { addFavorite, setNote } from '../js/lib/favorites.js';

const lille = { code: '59350', nom: 'Lille' };
const arras = { code: '62041', nom: 'Arras' };
const t = (m) => new Date(Date.UTC(2026, 9, 10, 12, m));

test('dossiers : créer, renommer, ajouter, noter, retirer, supprimer', () => {
  let { folders, id } = createFolder([], '  Maison  ', t(0), 'd1');
  assert.equal(id, 'd1');
  assert.equal(folders[0].nom, 'Maison');
  assert.equal(createFolder(folders, '   ', t(0), 'd2').id, null, 'nom vide refusé');
  folders = renameFolder(folders, 'd1', 'Maison Lille', t(1));
  assert.equal(findFolder(folders, 'd1').nom, 'Maison Lille');
  folders = addToFolder(folders, 'd1', lille, t(2));
  folders = addToFolder(folders, 'd1', arras, t(2));
  folders = setFolderNote(folders, 'd1', '59350', 'Proche gare', t(3));
  assert.deepEqual(folderCities(findFolder(folders, 'd1')).map((c) => [c.code, c.note]), [
    ['59350', 'Proche gare'],
    ['62041', ''],
  ]);
  assert.deepEqual(foldersContaining(folders, '59350'), ['d1']);
  folders = removeFromFolder(folders, 'd1', '59350', t(4));
  assert.deepEqual(foldersContaining(folders, '59350'), []);
  folders = deleteFolder(folders, 'd1', t(5));
  assert.deepEqual(visibleFolders(folders), []);
  assert.equal(findFolder(folders, 'd1'), null);
});

test('dossiers : même ville dans deux dossiers avec des notes différentes', () => {
  let { folders } = createFolder([], 'A', t(0), 'a');
  ({ folders } = createFolder(folders, 'B', t(0), 'b'));
  folders = addToFolder(addToFolder(folders, 'a', lille, t(1)), 'b', lille, t(1));
  folders = setFolderNote(setFolderNote(folders, 'a', '59350', 'note A', t(2)), 'b', '59350', 'note B', t(2));
  assert.deepEqual(foldersContaining(folders, '59350'), ['a', 'b']);
  assert.equal(folderCities(findFolder(folders, 'b'))[0].note, 'note B');
});

test('dossiers : limite du nombre de dossiers', () => {
  let folders = [];
  for (let i = 0; i < MAX_FOLDERS; i++) folders = createFolder(folders, `D${i}`, t(0), `d${i}`).folders;
  assert.equal(createFolder(folders, 'Encore un', t(0), 'x').id, null);
});

test('dossiers : fusion entre appareils', () => {
  const base = addToFolder(createFolder([], 'Maison', t(0), 'd1').folders, 'd1', lille, t(1));
  // Appareil A : renomme et note ; appareil B : ajoute Arras
  const a = setFolderNote(renameFolder(base, 'd1', 'Maison Nord', t(5)), 'd1', '59350', 'Vieux-Lille', t(5));
  const b = addToFolder(base, 'd1', arras, t(6));
  const merged = mergeFolders(a, b, t(10));
  const f = findFolder(merged, 'd1');
  assert.equal(f.nom, 'Maison Nord');
  assert.deepEqual(folderCities(f).map((c) => [c.code, c.note]), [
    ['59350', 'Vieux-Lille'],
    ['62041', ''],
  ]);
  assert.ok(sameFolders(mergeFolders(a, b, t(10)), mergeFolders(b, a, t(10))), 'commutatif');
  // Suppression plus récente : le dossier disparaît partout
  const deleted = deleteFolder(base, 'd1', t(20));
  assert.equal(findFolder(mergeFolders(deleted, b, t(21)), 'd1'), null);
  // Nouveau dossier sur un seul appareil : conservé
  const c = createFolder(base, 'Vacances', t(7), 'd2').folders;
  assert.equal(visibleFolders(mergeFolders(base, c, t(10))).length, 2);
});

test('dossiers : nettoyage des données reçues', () => {
  const raw = [
    { id: 'ok1', nom: 'Bon', cree: t(0).toISOString(), villes: [{ code: '59350', nom: 'Lille', note: 'x', ajoute: t(0).toISOString() }] },
    { id: 'ok1', nom: 'Doublon' },
    { id: '../bad', nom: 'Mauvais' },
    null,
    { id: 'gone', nom: 'Supprimé', supprime: true, villes: [{ code: '59350' }] },
  ];
  const clean = cleanFolders(raw);
  assert.deepEqual(clean.map((f) => f.id), ['ok1', 'gone']);
  assert.equal(clean[0].villes[0].modifie, t(0).toISOString());
  assert.deepEqual(clean[1].villes, []);
  assert.deepEqual(cleanFolders('n’importe quoi'), []);
});

test('migration : notes des favoris déplacées dans « Mes notes »', () => {
  let favs = addFavorite(addFavorite([], lille, t(0)), arras, t(0));
  favs = setNote(favs, '59350', 'Vieux-Lille', t(1));
  const { favorites, folders, moved } = migrateFavoriteNotes(favs, [], t(2), 'mig');
  assert.equal(moved, 1);
  assert.equal(folders[0].nom, 'Mes notes');
  assert.deepEqual(folderCities(folders[0]).map((c) => [c.code, c.note]), [['59350', 'Vieux-Lille']]);
  assert.ok(favorites.every((f) => f.note === ''));
  assert.equal(favorites.length, 2, 'les favoris restent');
  assert.equal(migrateFavoriteNotes(favorites, folders, t(3)).moved, 0, 'rien à refaire');
});

test('fichier d’export : version 2 avec dossiers, import fusion et remplacement', async () => {
  const { exportUserData, parseUserDataFile, importUserData } = await import('../js/lib/userdata.js');
  let folders = addToFolder(createFolder([], 'Maison', t(0), 'd1').folders, 'd1', lille, t(1));
  folders = setFolderNote(folders, 'd1', '59350', 'gare', t(2));
  const data = { items: addFavorite([], arras, t(0)), dossiers: folders };
  const file = exportUserData(data, t(3));
  assert.equal(file.version, 2);
  assert.deepEqual(file.favoris.map((f) => f.code), ['62041']);
  assert.deepEqual(file.dossiers[0].villes.map((v) => [v.code, v.note]), [['59350', 'gare']]);
  const parsed = parseUserDataFile(JSON.stringify(file));
  assert.equal(parsed.ok, true);

  // Ancien fichier (version 1) toujours accepté
  const v1 = parseUserDataFile(JSON.stringify({ format: 'alentours-favoris', version: 1, favoris: [{ code: '59350', nom: 'Lille', note: 'x', ajoute: t(0).toISOString() }] }));
  assert.equal(v1.ok, true);
  assert.deepEqual(v1.dossiers, []);
  assert.equal(parseUserDataFile('{"format":"alentours-favoris","version":2,"favoris":[],"dossiers":"x"}').ok, false);

  // Fusion : la note locale existante n'est pas écrasée, les villes manquantes sont ajoutées
  let local = setFolderNote(folders, 'd1', '59350', 'note locale', t(4));
  const incoming = { items: parsed.items, dossiers: addToFolder(parsed.dossiers, 'd1', arras, t(5)) };
  const merged = importUserData({ items: [], dossiers: local }, incoming, 'merge', t(6));
  assert.deepEqual(folderCities(findFolder(merged.dossiers, 'd1')).map((c) => [c.code, c.note]), [
    ['59350', 'note locale'],
    ['62041', ''],
  ]);

  // Remplacement : les dossiers absents du fichier sont supprimés
  local = createFolder(local, 'Autre', t(7), 'd2').folders;
  const replaced = importUserData({ items: [], dossiers: local }, parsed, 'replace', t(8));
  assert.deepEqual(visibleFolders(replaced.dossiers).map((f) => f.id), ['d1']);
  assert.equal(folderCities(findFolder(replaced.dossiers, 'd1'))[0].note, 'gare');
});
