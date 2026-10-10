// Favoris : fonctions pures (le stockage est géré par l'application).
// Un favori : { code, nom, note, ajoute }  (ajoute = date ISO)

export const FAVORITES_FORMAT = 'alentours-favoris';
export const FAVORITES_VERSION = 1;

const CODE_RE = /^[0-9][0-9AB][0-9]{3}$/;

function cleanItem(item) {
  if (!item || typeof item !== 'object') return null;
  const code = String(item.code ?? '').toUpperCase();
  if (!CODE_RE.test(code)) return null;
  const ajoute = typeof item.ajoute === 'string' && !Number.isNaN(Date.parse(item.ajoute)) ? item.ajoute : null;
  return {
    code,
    nom: typeof item.nom === 'string' ? item.nom.slice(0, 200) : '',
    note: typeof item.note === 'string' ? item.note.slice(0, 5000) : '',
    ajoute: ajoute ?? new Date(0).toISOString(),
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((it) => (seen.has(it.code) ? false : (seen.add(it.code), true)));
}

/** Lit la valeur stockée (format { version, items }), en tolérant les erreurs. */
export function readStoredFavorites(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) return [];
  return dedupe(value.items.map(cleanItem).filter(Boolean));
}

export function toStoredFavorites(items) {
  return { version: FAVORITES_VERSION, items };
}

export const isFavorite = (items, code) => items.some((it) => it.code === code);

export function addFavorite(items, commune, now = new Date()) {
  if (isFavorite(items, commune.code)) return items;
  return [...items, { code: commune.code, nom: commune.nom, note: '', ajoute: now.toISOString() }];
}

export function removeFavorite(items, code) {
  return items.filter((it) => it.code !== code);
}

export function toggleFavorite(items, commune, now = new Date()) {
  return isFavorite(items, commune.code) ? removeFavorite(items, commune.code) : addFavorite(items, commune, now);
}

export function setNote(items, code, note) {
  return items.map((it) => (it.code === code ? { ...it, note } : it));
}

/** Contenu du fichier alentours-favoris.json */
export function exportFavorites(items, now = new Date()) {
  return {
    format: FAVORITES_FORMAT,
    version: FAVORITES_VERSION,
    exporte: now.toISOString(),
    favoris: items.map(({ code, nom, note, ajoute }) => ({ code, nom, note, ajoute })),
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
  return { ok: true, items: dedupe(items) };
}

/**
 * Fusion : garde les favoris actuels, ajoute les nouveaux. Pour un favori
 * présent des deux côtés, une note vide est complétée par la note importée.
 */
export function mergeFavorites(current, incoming) {
  const byCode = new Map(current.map((it) => [it.code, it]));
  const result = current.map((it) => {
    const other = incoming.find((o) => o.code === it.code);
    return other && !it.note && other.note ? { ...it, note: other.note } : it;
  });
  for (const it of incoming) if (!byCode.has(it.code)) result.push(it);
  return result;
}
