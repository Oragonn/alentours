// Dossiers de communes avec notes (fonctions pures, testées avec Node).
//
// Un dossier : { id, nom, cree, modifie, supprime?, villes: [...] }
//   villes : mêmes règles que les favoris (lib/favorites.js) : chaque ville a
//            sa note et sa date de modification, une ville retirée laisse une
//            marque (supprime) pour que la synchronisation la propage.
//   supprime : dossier supprimé (marque gardée TOMBSTONE_DAYS jours).

import {
  addFavorite,
  cleanFavorites,
  isFavorite,
  removeFavorite,
  sameFavorites,
  setNote,
  syncMerge,
  TOMBSTONE_DAYS,
  visibleFavorites,
} from './favorites.js';

export const MAX_FOLDERS = 50;
export const MAX_FOLDER_NAME = 60;

const isDate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const iso = (date) => date.toISOString();

/** Identifiant court et aléatoire. */
export function newFolderId(random = Math.random) {
  return `d${Date.now().toString(36)}${Math.floor(random() * 1e8).toString(36)}`;
}

function cleanFolder(f) {
  if (!f || typeof f !== 'object') return null;
  const id = typeof f.id === 'string' && /^[a-z0-9]{1,40}$/i.test(f.id) ? f.id : null;
  if (!id) return null;
  const cree = isDate(f.cree) ? f.cree : new Date(0).toISOString();
  const folder = {
    id,
    nom: typeof f.nom === 'string' && f.nom.trim() ? f.nom.trim().slice(0, MAX_FOLDER_NAME) : 'Dossier',
    cree,
    modifie: isDate(f.modifie) ? f.modifie : cree,
    villes: f.supprime === true ? [] : cleanFavorites(f.villes),
  };
  if (f.supprime === true) folder.supprime = true;
  return folder;
}

/** Nettoie une liste de dossiers reçue (stockage, fichier, serveur). */
export function cleanFolders(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .map(cleanFolder)
    .filter((f) => f && !seen.has(f.id) && seen.add(f.id));
}

export const visibleFolders = (folders) => folders.filter((f) => !f.supprime);

/** Villes visibles d'un dossier. */
export const folderCities = (folder) => visibleFavorites(folder?.villes ?? []);

export const findFolder = (folders, id) => folders.find((f) => f.id === id && !f.supprime) ?? null;

/** Identifiants des dossiers qui contiennent la commune. */
export function foldersContaining(folders, code) {
  return visibleFolders(folders)
    .filter((f) => isFavorite(f.villes, code))
    .map((f) => f.id);
}

/** Crée un dossier ; renvoie { folders, id } (id null si nom vide ou limite atteinte). */
export function createFolder(folders, nom, now = new Date(), id = newFolderId()) {
  const name = String(nom ?? '').trim().slice(0, MAX_FOLDER_NAME);
  if (!name || visibleFolders(folders).length >= MAX_FOLDERS) return { folders, id: null };
  const folder = { id, nom: name, cree: iso(now), modifie: iso(now), villes: [] };
  return { folders: [...folders, folder], id };
}

const update = (folders, id, fn) => folders.map((f) => (f.id === id && !f.supprime ? fn(f) : f));

export function renameFolder(folders, id, nom, now = new Date()) {
  const name = String(nom ?? '').trim().slice(0, MAX_FOLDER_NAME);
  if (!name) return folders;
  return update(folders, id, (f) => (f.nom === name ? f : { ...f, nom: name, modifie: iso(now) }));
}

export function deleteFolder(folders, id, now = new Date()) {
  return update(folders, id, (f) => ({ id: f.id, nom: f.nom, cree: f.cree, modifie: iso(now), supprime: true, villes: [] }));
}

export function addToFolder(folders, id, commune, now = new Date()) {
  return update(folders, id, (f) => ({ ...f, villes: addFavorite(f.villes, commune, now) }));
}

export function removeFromFolder(folders, id, code, now = new Date()) {
  return update(folders, id, (f) => ({ ...f, villes: removeFavorite(f.villes, code, now) }));
}

export function setFolderNote(folders, id, code, note, now = new Date()) {
  return update(folders, id, (f) => ({ ...f, villes: setNote(f.villes, code, note, now) }));
}

/**
 * Fusion de deux appareils : pour chaque dossier, le nom (ou la suppression)
 * le plus récent l'emporte ; les villes sont fusionnées une à une.
 */
export function mergeFolders(a, b, now = new Date()) {
  const byId = new Map();
  for (const f of [...a, ...b]) {
    const prev = byId.get(f.id);
    if (!prev) {
      byId.set(f.id, f);
      continue;
    }
    const newer = Date.parse(f.modifie) > Date.parse(prev.modifie) ? f : prev;
    if (newer.supprime) byId.set(f.id, newer);
    else byId.set(f.id, { ...newer, villes: syncMerge(prev.villes ?? [], f.villes ?? [], now) });
  }
  const limit = now.getTime() - TOMBSTONE_DAYS * 86400000;
  return [...byId.values()]
    .filter((f) => !f.supprime || Date.parse(f.modifie) >= limit)
    .sort((x, y) => Date.parse(x.cree) - Date.parse(y.cree) || x.id.localeCompare(y.id));
}

export function sameFolders(a, b) {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((f) => [f.id, f]));
  return b.every((f) => {
    const o = byId.get(f.id);
    return (
      o &&
      o.nom === f.nom &&
      o.modifie === f.modifie &&
      Boolean(o.supprime) === Boolean(f.supprime) &&
      sameFavorites(o.villes ?? [], f.villes ?? [])
    );
  });
}

/**
 * Anciennes notes des favoris : déplacées dans un dossier « Mes notes ».
 * Renvoie { favorites, folders, moved } (moved = nombre de notes déplacées).
 */
export function migrateFavoriteNotes(favorites, folders, now = new Date(), id = newFolderId()) {
  const withNotes = visibleFavorites(favorites).filter((f) => f.note && f.note.trim());
  if (!withNotes.length) return { favorites, folders, moved: 0 };
  const folder = {
    id,
    nom: 'Mes notes',
    cree: iso(now),
    modifie: iso(now),
    villes: withNotes.map((f) => ({ code: f.code, nom: f.nom, note: f.note, ajoute: f.ajoute, modifie: iso(now) })),
  };
  const cleared = favorites.map((f) => (f.note && !f.supprime ? { ...f, note: '', modifie: iso(now) } : f));
  return { favorites: cleared, folders: [...folders, folder], moved: withNotes.length };
}
