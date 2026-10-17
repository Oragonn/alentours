// Dossiers de communes avec notes (fonctions pures, testées avec Node).
//
// Un dossier : { id, nom, cree, modifie, archive?, corbeille?, supprime?, villes: [...] }
//   villes : mêmes règles que les favoris (lib/favorites.js) : chaque ville a
//            sa note et sa date de modification, une ville retirée laisse une
//            marque (supprime) pour que la synchronisation la propage.
//   archive : dossier rangé à part (client terminé), toujours consultable.
//   corbeille : date de la suppression ; le dossier garde tout son contenu
//            et peut être restauré pendant TRASH_DAYS jours.
//   supprime : dossier effacé pour de bon (marque gardée TOMBSTONE_DAYS jours).

import { DRIVE } from '../config.js';
import {
  STATUSES,
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

export const MAX_FOLDERS = 50; // dossiers en cours
// En cours + archivés + corbeille (le document en ligne accepte 200 entrées,
// marques de suppression comprises)
export const MAX_STORED_FOLDERS = 150;
// Entrées envoyées en ligne au plus (firestore.rules : dossiers.size() <= 200)
export const MAX_SYNCED_FOLDERS = 200;
export const TRASH_DAYS = 30;

// Fiche du client (champs facultatifs)
export const BRIEF_FIELDS = [
  'client',
  'zoneCode',
  'zoneNom',
  'zoneLat',
  'zoneLon',
  'zoneRayon',
  'popMin',
  'popMax',
  'trajetMax',
  'budget',
  'type',
  'surface',
  'travail',
  'criteres',
];

/** Nettoie la fiche client d'un dossier. */
export function cleanBrief(b) {
  if (!b || typeof b !== 'object') return null;
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const num = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  // Zone de recherche : commune (code INSEE) ou adresse (coordonnées), et
  // rayon en km (1 à 100), qui peut être donné seul
  const zoneCode = typeof b.zoneCode === 'string' && /^[0-9][0-9AB][0-9]{3}$/.test(b.zoneCode) ? b.zoneCode : null;
  const lat = Number(b.zoneLat);
  const lon = Number(b.zoneLon);
  const address =
    !zoneCode && b.zoneLat != null && b.zoneLon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && text(b.zoneNom, 150) !== '';
  const rayon = Number(b.zoneRayon);
  const trajet = Number(b.trajetMax);
  // Population : bornes facultatives, le minimum ne dépasse pas le maximum
  let popMin = num(b.popMin);
  let popMax = num(b.popMax);
  if (popMin != null && popMax != null && popMin > popMax) [popMin, popMax] = [popMax, popMin];
  const brief = {
    client: text(b.client, 100),
    zoneCode,
    zoneNom: zoneCode || address ? text(b.zoneNom, 150) : '',
    zoneLat: address ? Math.round(lat * 1e5) / 1e5 : null,
    zoneLon: address ? Math.round(lon * 1e5) / 1e5 : null,
    zoneRayon: b.zoneRayon != null && Number.isFinite(rayon) && rayon >= 1 && rayon <= 100 ? Math.round(rayon * 10) / 10 : null,
    popMin,
    popMax,
    trajetMax: Number.isInteger(trajet) && trajet >= DRIVE.min && trajet <= DRIVE.max ? trajet : null,
    budget: num(b.budget),
    type: b.type === 'appartement' ? 'appartement' : b.type === 'maison' ? 'maison' : null,
    surface: num(b.surface),
    travail: text(b.travail, 200),
    criteres: text(b.criteres, 2000),
  };
  return Object.values(brief).some((v) => v) ? brief : null;
}

/** La fiche a-t-elle une zone (commune ou adresse) ? */
export const briefHasZone = (b) => Boolean(b?.zoneCode || (b?.zoneLat != null && b?.zoneLon != null));
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
  const brief = f.supprime === true ? null : cleanBrief(f.fiche);
  if (brief) folder.fiche = brief;
  if (f.supprime === true) folder.supprime = true;
  else {
    if (f.archive === true) folder.archive = true;
    if (isDate(f.corbeille)) folder.corbeille = f.corbeille;
  }
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

/** Dossier consultable : ni effacé, ni à la corbeille (archivé ou non). */
const isLive = (f) => !f.supprime && !f.corbeille;

/** Dossiers en cours (ni archivés, ni à la corbeille). */
export const visibleFolders = (folders) => folders.filter((f) => isLive(f) && !f.archive);

/** Dossiers en cours et archivés (ce qu'on exporte). */
export const liveFolders = (folders) => folders.filter(isLive);

export const archivedFolders = (folders) => folders.filter((f) => isLive(f) && f.archive);

/** Fin de la période de restauration d'un dossier mis à la corbeille. */
export const trashExpiry = (folder) => new Date(Date.parse(folder.corbeille) + TRASH_DAYS * 86400000);

/** Dossiers à la corbeille encore restaurables, les derniers supprimés d'abord. */
export function trashedFolders(folders, now = new Date()) {
  return folders
    .filter((f) => !f.supprime && f.corbeille && trashExpiry(f) > now)
    .sort((a, b) => Date.parse(b.corbeille) - Date.parse(a.corbeille));
}

/** Villes visibles d'un dossier. */
export const folderCities = (folder) => visibleFavorites(folder?.villes ?? []);

/** Dossier en cours ou archivé (null s'il est à la corbeille ou effacé). */
export const findFolder = (folders, id) => folders.find((f) => f.id === id && isLive(f)) ?? null;

/** Identifiants des dossiers qui contiennent la commune. */
export function foldersContaining(folders, code) {
  return visibleFolders(folders)
    .filter((f) => isFavorite(f.villes, code))
    .map((f) => f.id);
}

/** Crée un dossier ; renvoie { folders, id } (id null si nom vide ou limite atteinte). */
export function createFolder(folders, nom, now = new Date(), id = newFolderId()) {
  const name = String(nom ?? '').trim().slice(0, MAX_FOLDER_NAME);
  const stored = folders.filter((f) => !f.supprime).length;
  if (!name || visibleFolders(folders).length >= MAX_FOLDERS || stored >= MAX_STORED_FOLDERS) return { folders, id: null };
  const folder = { id, nom: name, cree: iso(now), modifie: iso(now), villes: [] };
  return { folders: [...folders, folder], id };
}

const update = (folders, id, fn) => folders.map((f) => (f.id === id && isLive(f) ? fn(f) : f));

export function renameFolder(folders, id, nom, now = new Date()) {
  const name = String(nom ?? '').trim().slice(0, MAX_FOLDER_NAME);
  if (!name) return folders;
  return update(folders, id, (f) => (f.nom === name ? f : { ...f, nom: name, modifie: iso(now) }));
}

const tombstone = (f, date) => ({ id: f.id, nom: f.nom, cree: f.cree, modifie: date, supprime: true, villes: [] });

/** Met le dossier à la corbeille : son contenu est gardé TRASH_DAYS jours. */
export function trashFolder(folders, id, now = new Date()) {
  return update(folders, id, (f) => ({ ...f, corbeille: iso(now), modifie: iso(now) }));
}

/** Sort le dossier de la corbeille (il retrouve sa place : en cours ou archivé). */
export function restoreFolder(folders, id, now = new Date()) {
  return folders.map((f) => {
    if (f.id !== id || f.supprime || !f.corbeille) return f;
    const { corbeille: _old, ...rest } = f;
    return { ...rest, modifie: iso(now) };
  });
}

/** Efface le dossier pour de bon (depuis la corbeille ou non). */
export function deleteFolder(folders, id, now = new Date()) {
  return folders.map((f) => (f.id === id && !f.supprime ? tombstone(f, iso(now)) : f));
}

/** Efface pour de bon tous les dossiers de la corbeille. */
export function emptyTrash(folders, now = new Date()) {
  return folders.map((f) => (!f.supprime && f.corbeille ? tombstone(f, iso(now)) : f));
}

/**
 * Dossiers restés plus de TRASH_DAYS jours à la corbeille : effacés. La marque
 * garde la date de la mise à la corbeille : une restauration faite entre-temps
 * sur un autre appareil (plus récente) l'emporte donc à la synchronisation.
 */
export function expireTrash(folders, now = new Date()) {
  return folders.map((f) => (!f.supprime && f.corbeille && trashExpiry(f) <= now ? tombstone(f, f.modifie) : f));
}

/** Archive (on = true) ou remet en cours (on = false) un dossier. */
export function archiveFolder(folders, id, on, now = new Date()) {
  return update(folders, id, (f) => {
    if (Boolean(f.archive) === on) return f;
    const { archive: _old, ...rest } = f;
    return { ...rest, ...(on ? { archive: true } : {}), modifie: iso(now) };
  });
}

export function addToFolder(folders, id, commune, now = new Date()) {
  return update(folders, id, (f) => ({ ...f, villes: addFavorite(f.villes, commune, now) }));
}

export function removeFromFolder(folders, id, code, now = new Date()) {
  return update(folders, id, (f) => ({ ...f, villes: removeFavorite(f.villes, code, now) }));
}

/** Fiche client du dossier (remplace l'ancienne). */
export function setFolderBrief(folders, id, brief, now = new Date()) {
  const clean = cleanBrief(brief);
  return update(folders, id, (f) => {
    const { fiche, ...rest } = f;
    return { ...rest, ...(clean ? { fiche: clean } : {}), modifie: iso(now) };
  });
}

/** Statut d'une ville du dossier (null = aucun). */
export function setFolderStatus(folders, id, code, statut, now = new Date()) {
  return update(folders, id, (f) => ({
    ...f,
    villes: f.villes.map((v) => {
      if (v.code !== code || v.supprime) return v;
      const { statut: _old, ...rest } = v;
      return { ...rest, ...(STATUSES[statut] ? { statut } : {}), modifie: iso(now) };
    }),
  }));
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
  let merged = expireTrash([...byId.values()], now).filter((f) => !f.supprime || Date.parse(f.modifie) >= limit);
  // Trop d'entrées pour le document en ligne : les marques les plus anciennes partent
  const extra = merged.length - MAX_SYNCED_FOLDERS;
  if (extra > 0) {
    const dropped = new Set(
      merged
        .filter((f) => f.supprime)
        .sort((x, y) => Date.parse(x.modifie) - Date.parse(y.modifie))
        .slice(0, extra)
        .map((f) => f.id)
    );
    merged = merged.filter((f) => !dropped.has(f.id));
  }
  return merged.sort((x, y) => Date.parse(x.cree) - Date.parse(y.cree) || x.id.localeCompare(y.id));
}

export function sameFolders(a, b) {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((f) => [f.id, f]));
  return b.every((f) => {
    const o = byId.get(f.id);
    return (
      o &&
      o.nom === f.nom &&
      JSON.stringify(o.fiche ?? null) === JSON.stringify(f.fiche ?? null) &&
      o.modifie === f.modifie &&
      Boolean(o.supprime) === Boolean(f.supprime) &&
      Boolean(o.archive) === Boolean(f.archive) &&
      (o.corbeille ?? null) === (f.corbeille ?? null) &&
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
