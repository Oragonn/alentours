// Données personnelles synchronisées : favoris, dossiers et réglages du compte
// (fonctions pures). Forme : { items: [favoris], dossiers: [dossiers], reglages }

import {
  cleanFavorites,
  FAVORITES_FORMAT,
  mergeFavorites,
  parseFavoritesFile,
  replaceFavorites,
  sameFavorites,
  syncMerge,
  visibleFavorites,
} from './favorites.js';
import { cleanFolders, mergeFolders, sameFolders, visibleFolders } from './folders.js';
import { cleanSettings, mergeSettings, sameSettings } from './settings.js';

export const EMPTY_USER_DATA = Object.freeze({ items: [], dossiers: [], reglages: null });

/** Nettoie un document reçu (serveur, ancien format sans dossiers compris). */
export function cleanUserData(raw) {
  return { items: cleanFavorites(raw?.items), dossiers: cleanFolders(raw?.dossiers), reglages: cleanSettings(raw?.reglages) };
}

export function mergeUserData(a, b, now = new Date()) {
  return {
    items: syncMerge(a.items ?? [], b.items ?? [], now),
    dossiers: mergeFolders(a.dossiers ?? [], b.dossiers ?? [], now),
    reglages: mergeSettings(a.reglages ?? null, b.reglages ?? null),
  };
}

export function sameUserData(a, b) {
  return (
    sameFavorites(a.items ?? [], b.items ?? []) &&
    sameFolders(a.dossiers ?? [], b.dossiers ?? []) &&
    sameSettings(a.reglages, b.reglages)
  );
}

// ---- Fichier d'export (alentours-favoris.json) ----------------------------
// Version 1 : { format, version: 1, favoris: [{ code, nom, note, ajoute }] }
// Version 2 : ajoute dossiers: [{ id, nom, cree, villes: [{ code, nom, note, ajoute }] }]

export const USER_FILE_VERSION = 2;

export function exportUserData({ items, dossiers }, now = new Date()) {
  return {
    format: FAVORITES_FORMAT,
    version: USER_FILE_VERSION,
    exporte: now.toISOString(),
    favoris: visibleFavorites(items).map(({ code, nom, ajoute }) => ({ code, nom, ajoute })),
    dossiers: visibleFolders(dossiers).map(({ id, nom, cree, fiche, villes }) => ({
      id,
      nom,
      cree,
      ...(fiche ? { fiche } : {}),
      villes: visibleFavorites(villes).map(({ code, nom: n, note, ajoute, statut }) => ({
        code,
        nom: n,
        note,
        ajoute,
        ...(statut ? { statut } : {}),
      })),
    })),
  };
}

/** Lit un fichier importé (version 1 ou 2) ; { ok, items, dossiers } ou { ok: false }. */
export function parseUserDataFile(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (!json || json.format !== FAVORITES_FORMAT || !Number.isInteger(json.version) || json.version > USER_FILE_VERSION) {
    return { ok: false };
  }
  // Les favoris sont vérifiés comme dans la version 1
  const favs = parseFavoritesFile(JSON.stringify({ ...json, version: 1 }));
  if (!favs.ok) return { ok: false };
  if (json.dossiers !== undefined && !Array.isArray(json.dossiers)) return { ok: false };
  const dossiers = cleanFolders(json.dossiers ?? []).filter((f) => !f.supprime);
  return { ok: true, items: favs.items, dossiers };
}

/**
 * Applique un import : « merge » ajoute ce qui manque, « replace » remplace
 * favoris et dossiers (les anciens sont marqués supprimés pour les autres
 * appareils).
 */
export function importUserData(current, incoming, mode, now = new Date()) {
  const stamp = now.toISOString();
  const fresh = incoming.dossiers.map((f) => ({
    ...f,
    modifie: stamp,
    villes: f.villes.map((v) => ({ ...v, modifie: stamp })),
  }));
  const currentById = new Map(current.dossiers.filter((f) => !f.supprime).map((f) => [f.id, f]));

  if (mode === 'replace') {
    const keep = new Set(fresh.map((f) => f.id));
    const dossiers = current.dossiers
      .filter((f) => !keep.has(f.id))
      .map((f) => (f.supprime ? f : { id: f.id, nom: f.nom, cree: f.cree, modifie: stamp, supprime: true, villes: [] }));
    for (const f of fresh) {
      const old = currentById.get(f.id);
      // Villes absentes du fichier : retirées (et propagées aux autres appareils)
      const gone = old
        ? visibleFavorites(old.villes)
            .filter((v) => !f.villes.some((n) => n.code === v.code))
            .map((v) => ({ ...v, note: '', modifie: stamp, supprime: true }))
        : [];
      dossiers.push({ ...f, villes: [...f.villes, ...gone] });
    }
    return { items: replaceFavorites(current.items, incoming.items, now), dossiers };
  }

  // Fusion : on garde tout l'existant, on ajoute les dossiers et villes absents
  const dossiers = current.dossiers.map((f) => {
    const imported = fresh.find((n) => n.id === f.id);
    if (!imported || f.supprime) return f;
    const added = imported.villes.filter((v) => !visibleFavorites(f.villes).some((c) => c.code === v.code));
    return added.length
      ? { ...f, villes: [...f.villes.filter((c) => !added.some((a) => a.code === c.code)), ...added] }
      : f;
  });
  for (const f of fresh) if (!currentById.has(f.id)) dossiers.push(f);
  return { items: mergeFavorites(current.items, incoming.items, now), dossiers };
}
