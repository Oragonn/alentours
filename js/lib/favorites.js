// Favoris : fonctions pures (le stockage est géré par l'application).
//
// Un favori : { code, nom, note, ajoute, modifie, supprime? }
//   ajoute, modifie  dates ISO
//   supprime         true pour un favori retiré : la marque est gardée (sans
//                    la note) pour que la suppression se propage aux autres
//                    appareils lors de la synchronisation, puis effacée après
//                    TOMBSTONE_DAYS jours.
// Les listes affichées passent par visibleFavorites().

export const FAVORITES_FORMAT = 'alentours-favoris';
export const FAVORITES_VERSION = 1;
export const TOMBSTONE_DAYS = 180;

const CODE_RE = /^[0-9][0-9AB][0-9]{3}$/;
const isDate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const iso = (date) => date.toISOString();

function cleanItem(item) {
  if (!item || typeof item !== 'object') return null;
  const code = String(item.code ?? '').toUpperCase();
  if (!CODE_RE.test(code)) return null;
  const ajoute = isDate(item.ajoute) ? item.ajoute : new Date(0).toISOString();
  const clean = {
    code,
    nom: typeof item.nom === 'string' ? item.nom.slice(0, 200) : '',
    note: typeof item.note === 'string' ? item.note.slice(0, 5000) : '',
    ajoute,
    modifie: isDate(item.modifie) ? item.modifie : ajoute,
  };
  if (item.supprime === true) {
    clean.supprime = true;
    clean.note = '';
  }
  return clean;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.code) ? false : (seen.add(it.code), true)));
}

/** Nettoie une liste reçue (stockage local, fichier, serveur). */
export function cleanFavorites(items) {
  return Array.isArray(items) ? dedupe(items.map(cleanItem).filter(Boolean)) : [];
}

/** Lit la valeur stockée (format { version, items }), en tolérant les erreurs. */
export function readStoredFavorites(value) {
  if (!value || typeof value !== 'object') return [];
  return cleanFavorites(value.items);
}

export function toStoredFavorites(items) {
  return { version: FAVORITES_VERSION, items };
}

/** Favoris à afficher (sans les marques de suppression). */
export const visibleFavorites = (items) => items.filter((it) => !it.supprime);

export const isFavorite = (items, code) => items.some((it) => it.code === code && !it.supprime);

export function addFavorite(items, commune, now = new Date()) {
  if (isFavorite(items, commune.code)) return items;
  const fresh = { code: commune.code, nom: commune.nom, note: '', ajoute: iso(now), modifie: iso(now) };
  return [...items.filter((it) => it.code !== commune.code), fresh];
}

export function removeFavorite(items, code, now = new Date()) {
  return items.map((it) =>
    it.code === code && !it.supprime ? { code, nom: it.nom, note: '', ajoute: it.ajoute, modifie: iso(now), supprime: true } : it
  );
}

export function toggleFavorite(items, commune, now = new Date()) {
  return isFavorite(items, commune.code) ? removeFavorite(items, commune.code, now) : addFavorite(items, commune, now);
}

export function setNote(items, code, note, now = new Date()) {
  return items.map((it) => (it.code === code && !it.supprime && it.note !== note ? { ...it, note, modifie: iso(now) } : it));
}

/**
 * Fusion de deux appareils : pour chaque commune, la version modifiée le plus
 * récemment l'emporte (ajout, note ou suppression). Résultat trié par date
 * d'ajout. Les marques de suppression trop anciennes sont effacées.
 */
export function syncMerge(a, b, now = new Date()) {
  const byCode = new Map();
  for (const it of [...a, ...b]) {
    const prev = byCode.get(it.code);
    if (!prev || Date.parse(it.modifie) > Date.parse(prev.modifie)) byCode.set(it.code, it);
  }
  const limit = now.getTime() - TOMBSTONE_DAYS * 86400000;
  return [...byCode.values()]
    .filter((it) => !it.supprime || Date.parse(it.modifie) >= limit)
    .sort((x, y) => Date.parse(x.ajoute) - Date.parse(y.ajoute) || x.code.localeCompare(y.code));
}

/** Deux listes identiques ? (pour éviter des écritures inutiles) */
export function sameFavorites(a, b) {
  if (a.length !== b.length) return false;
  const key = (it) => `${it.code}|${it.modifie}|${it.supprime ? 1 : 0}|${it.note}`;
  const set = new Set(a.map(key));
  return b.every((it) => set.has(key(it)));
}

/** Contenu du fichier alentours-favoris.json (favoris visibles seulement) */
export function exportFavorites(items, now = new Date()) {
  return {
    format: FAVORITES_FORMAT,
    version: FAVORITES_VERSION,
    exporte: iso(now),
    favoris: visibleFavorites(items).map(({ code, nom, note, ajoute }) => ({ code, nom, note, ajoute })),
  };
}

/** Lit un fichier importé ; renvoie { ok: true, items } ou { ok: false }. */
export function parseFavoritesFile(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (!json || json.format !== FAVORITES_FORMAT || !Array.isArray(json.favoris)) return { ok: false };
  if (!Number.isInteger(json.version) || json.version > FAVORITES_VERSION) return { ok: false };
  const items = json.favoris.map(cleanItem);
  if (items.some((it) => it === null)) return { ok: false };
  // Un fichier exporté ne contient que des favoris visibles
  return { ok: true, items: dedupe(items.filter((it) => !it.supprime)) };
}

/**
 * Import « Fusionner » : garde les favoris actuels, ajoute les nouveaux. Pour
 * un favori présent des deux côtés, une note vide est complétée par la note
 * importée.
 */
export function mergeFavorites(current, incoming, now = new Date()) {
  let result = current;
  for (const it of incoming) {
    const existing = current.find((c) => c.code === it.code && !c.supprime);
    if (!existing) {
      result = [...result.filter((c) => c.code !== it.code), { ...it, modifie: iso(now) }];
    } else if (!existing.note && it.note) {
      result = setNote(result, it.code, it.note, now);
    }
  }
  return result;
}

/** Import « Remplacer » : les favoris actuels absents du fichier sont retirés. */
export function replaceFavorites(current, incoming, now = new Date()) {
  const codes = new Set(incoming.map((it) => it.code));
  let result = current;
  for (const it of visibleFavorites(current)) if (!codes.has(it.code)) result = removeFavorite(result, it.code, now);
  result = result.filter((it) => !codes.has(it.code));
  return [...result, ...incoming.map((it) => ({ ...it, modifie: iso(now) }))];
}
