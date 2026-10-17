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
  archiveFolder,
  archivedFolders,
  emptyTrash,
  expireTrash,
  liveFolders,
  restoreFolder,
  trashedFolders,
  trashFolder,
  TRASH_DAYS,
  MAX_SYNCED_FOLDERS,
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

  // Remplacement : les dossiers absents du fichier vont à la corbeille
  local = addToFolder(createFolder(local, 'Autre', t(7), 'd2').folders, 'd2', arras, t(7));
  const replaced = importUserData({ items: [], dossiers: local }, parsed, 'replace', t(8));
  assert.deepEqual(visibleFolders(replaced.dossiers).map((f) => f.id), ['d1']);
  assert.equal(folderCities(findFolder(replaced.dossiers, 'd1'))[0].note, 'gare');
  const binned = trashedFolders(replaced.dossiers, t(9));
  assert.deepEqual(binned.map((f) => f.id), ['d2']);
  assert.deepEqual(folderCities(binned[0]).map((c) => c.code), ['62041'], 'contenu gardé');

  // Fusion dans un dossier à la corbeille sur cet appareil : il est restauré
  const restored = importUserData({ items: [], dossiers: trashFolder(local, 'd1', t(9)) }, incoming, 'merge', t(10));
  assert.deepEqual(folderCities(findFolder(restored.dossiers, 'd1')).map((c) => c.code), ['59350', '62041']);

  // Les dossiers archivés sont exportés, avec leur marque
  const withArchive = exportUserData({ items: [], dossiers: archiveFolder(local, 'd2', true, t(11)) }, t(12));
  assert.deepEqual(withArchive.dossiers.map((f) => [f.id, f.archive ?? false]), [['d1', false], ['d2', true]]);
  assert.equal(findFolder(parseUserDataFile(JSON.stringify(withArchive)).dossiers, 'd2').archive, true);
});

const day = (d) => new Date(Date.UTC(2026, 9, 10 + d, 12));

test('corbeille : le dossier garde son contenu et se restaure', () => {
  let { folders } = createFolder([], 'Martin', t(0), 'm');
  folders = addToFolder(folders, 'm', lille, t(1));
  folders = setFolderNote(folders, 'm', '59350', 'Proche gare', t(2));
  folders = trashFolder(folders, 'm', day(0));
  assert.deepEqual(visibleFolders(folders), []);
  assert.equal(findFolder(folders, 'm'), null, 'non consultable à la corbeille');
  assert.deepEqual(foldersContaining(folders, '59350'), []);
  assert.deepEqual(trashedFolders(folders, day(1)).map((f) => f.id), ['m']);
  // Les modifications sont refusées tant qu'il est à la corbeille
  assert.equal(renameFolder(folders, 'm', 'Autre', day(1))[0].nom, 'Martin');
  folders = restoreFolder(folders, 'm', day(2));
  assert.deepEqual(folderCities(findFolder(folders, 'm')).map((c) => c.note), ['Proche gare']);
  assert.deepEqual(trashedFolders(folders, day(2)), []);
});

test('corbeille : effacée après TRASH_DAYS jours, ou à la demande', () => {
  let { folders } = createFolder([], 'A', t(0), 'a');
  ({ folders } = createFolder(folders, 'B', t(0), 'b'));
  folders = addToFolder(folders, 'a', lille, t(1));
  folders = trashFolder(trashFolder(folders, 'a', day(0)), 'b', day(5));
  assert.deepEqual(trashedFolders(folders, day(6)).map((f) => f.id), ['b', 'a'], 'derniers supprimés d’abord');
  assert.deepEqual(trashedFolders(folders, day(TRASH_DAYS)).map((f) => f.id), ['b']);
  const expired = expireTrash(folders, day(TRASH_DAYS));
  const a = expired.find((f) => f.id === 'a');
  assert.equal(a.supprime, true);
  assert.deepEqual(a.villes, []);
  assert.equal(a.modifie, day(0).toISOString(), 'date de la mise à la corbeille, la même partout');
  assert.ok(!expired.find((f) => f.id === 'b').supprime);
  assert.ok(emptyTrash(folders, day(6)).every((f) => f.supprime));
  // Effacer pour de bon depuis la corbeille
  assert.equal(deleteFolder(folders, 'b', day(6)).find((f) => f.id === 'b').supprime, true);
});

test('archives : rangées à part, consultables, restaurées à leur place', () => {
  let { folders } = createFolder([], 'Vendu', t(0), 'v');
  folders = archiveFolder(folders, 'v', true, t(1));
  assert.deepEqual(visibleFolders(folders), []);
  assert.deepEqual(archivedFolders(folders).map((f) => f.id), ['v']);
  assert.equal(findFolder(folders, 'v').nom, 'Vendu', 'un dossier archivé s’ouvre');
  assert.deepEqual(liveFolders(folders).map((f) => f.id), ['v']);
  // Supprimé puis restauré : il revient dans les archives
  folders = restoreFolder(trashFolder(folders, 'v', t(2)), 'v', t(3));
  assert.deepEqual(archivedFolders(folders).map((f) => f.id), ['v']);
  folders = archiveFolder(folders, 'v', false, t(4));
  assert.deepEqual(visibleFolders(folders).map((f) => f.id), ['v']);
  assert.deepEqual(cleanFolders(archiveFolder(folders, 'v', true, t(5)))[0].archive, true, 'gardé au nettoyage');
});

test('synchronisation : corbeille, restauration et archives se propagent', () => {
  let { folders: base } = createFolder([], 'Martin', t(0), 'm');
  base = addToFolder(base, 'm', lille, t(1));
  const phone = trashFolder(base, 'm', day(1));
  // Pendant ce temps, une note ajoutée sur l'ordinateur
  const laptop = setFolderNote(base, 'm', '59350', 'Vue', day(1));
  let merged = mergeFolders(phone, laptop, day(2));
  assert.deepEqual(trashedFolders(merged, day(2)).map((f) => f.id), ['m']);
  assert.equal(merged[0].villes.find((v) => v.code === '59350').note, 'Vue', 'la note n’est pas perdue');
  // Restauré sur l'ordinateur, plus récent : il revient partout
  merged = mergeFolders(phone, restoreFolder(merged, 'm', day(3)), day(4));
  assert.equal(findFolder(merged, 'm').nom, 'Martin');
  assert.ok(sameFolders(merged, cleanFolders(JSON.parse(JSON.stringify(merged)))));
  const archived = archiveFolder(merged, 'm', true, day(5));
  assert.ok(!sameFolders(merged, archived));
  assert.deepEqual(archivedFolders(mergeFolders(merged, archived, day(6))).map((f) => f.id), ['m']);
  // Corbeille expirée pendant la fusion
  const old = trashFolder(base, 'm', day(1));
  assert.equal(mergeFolders(old, old, day(TRASH_DAYS + 2))[0].supprime, true);
});

test('synchronisation : une restauration l’emporte sur l’expiration faite ailleurs', () => {
  let { folders: base } = createFolder([], 'Martin', t(0), 'm');
  base = addToFolder(base, 'm', lille, t(1));
  const trashed = trashFolder(base, 'm', day(0));
  // L'ordinateur restaure au 29e jour ; le téléphone, resté hors ligne, l'expire au 31e
  const laptop = restoreFolder(trashed, 'm', day(29));
  const phone = expireTrash(trashed, day(31));
  assert.equal(phone[0].supprime, true);
  const merged = mergeFolders(phone, laptop, day(31));
  assert.deepEqual(folderCities(findFolder(merged, 'm')).map((c) => c.code), ['59350']);
});

test('synchronisation : jamais plus de MAX_SYNCED_FOLDERS entrées', () => {
  // 230 dossiers, dont 80 effacés récemment : 150 gardés + 80 marques
  const stamp = day(0).toISOString();
  let folders = Array.from({ length: 230 }, (_, i) => ({ id: `d${i}`, nom: `D${i}`, cree: stamp, modifie: stamp, villes: [] }));
  for (let i = 0; i < 80; i++) folders = deleteFolder(folders, `d${i}`, new Date(day(1).getTime() + i * 60000));
  const merged = mergeFolders(folders, [], day(2));
  assert.equal(merged.length, MAX_SYNCED_FOLDERS);
  assert.equal(merged.filter((f) => !f.supprime).length, 150, 'aucun dossier gardé n’est perdu');
  assert.ok(!merged.some((f) => f.id === 'd0'), 'les marques les plus anciennes partent d’abord');
});
