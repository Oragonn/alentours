// Texte et nombres à la française (aucun accès au DOM).

// Espace insécable utilisée comme séparateur de milliers et avant les unités
export const NBSP = ' ';

/**
 * Forme comparable d'un texte : minuscules, sans accents, sans tirets,
 * apostrophes ni espaces. « Saint-Étienne » et « saint etienne » donnent
 * la même chaîne, tout comme « L'Haÿ-les-Roses » et « lhay les roses ».
 */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s\-‐‑‒–—'’ʼ`´.]+/g, '');
}

/** 12345 → « 12 345 » ; 3.7 avec 1 décimale → « 3,7 ». */
export function formatNumber(value, decimals = 0) {
  if (!Number.isFinite(value)) return '';
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = value < 0 && Number(fixed) !== 0 ? '−' : '';
  return sign + grouped + (frac ? ',' + frac : '');
}

/** 3.74 → « 3,7 km » */
export function formatKm(km) {
  return `${formatNumber(km, 1)}${NBSP}km`;
}

/** Nombre décimal pour un fichier (pas de séparateur de milliers) : 11.25 → « 11,3 ». */
export function formatDecimalPlain(value, decimals) {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(decimals).replace('.', ',');
}

/** Accord simple : plural(2, 'commune trouvée', 'communes trouvées') */
export function plural(count, singular, pluralForm) {
  return count > 1 ? pluralForm : singular;
}

/** Message du nombre de résultats */
export function resultsCountLabel(count) {
  if (count === 0) return 'Aucune commune trouvée';
  return `${formatNumber(count)} ${plural(count, 'commune trouvée', 'communes trouvées')}`;
}

/**
 * Lit un entier saisi par l'utilisateur : « 10 000 », « 10000 », « 10.000 ».
 * Renvoie null pour un champ vide ou invalide.
 */
export function parseIntegerInput(text) {
  const cleaned = String(text ?? '').replace(/[\s  .]/g, '');
  if (cleaned === '' || !/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Lit un nombre décimal, avec virgule ou point : « 12,5 » → 12.5. */
export function parseDecimalInput(text) {
  const cleaned = String(text ?? '').trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** « Saint-Étienne » → « saint-etienne » (pour les noms de fichiers) */
export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Coordonnées à la française : « 50,6292 ; 3,0573 » */
export function formatCoords(lat, lon) {
  return `${formatDecimalPlain(lat, 4)} ; ${formatDecimalPlain(lon, 4)}`;
}

/** Durée de trajet max : « 45 min », « 1 h », « 1 h 30 ». */
export function formatMinutes(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m}${NBSP}min`;
  const rest = m % 60;
  return `${Math.floor(m / 60)}${NBSP}h${rest ? ` ${String(rest).padStart(2, '0')}` : ''}`;
}

/** Saisie « 45 », « 45 min », « 1h30 », « 1 h » → minutes (null si illisible). */
export function parseMinutesInput(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  let m = /^(\d{1,3})(?:mn|min|minutes?)?$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(\d{1,2})h(?:(\d{1,2})(?:mn|min)?)?$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  return null;
}
