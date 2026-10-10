// Modèle de commune et index (aucun accès au DOM).

import { SIZE_CATEGORIES, UNKNOWN_CATEGORY } from '../config.js';
import { normalize } from './text.js';

/** Catégorie de taille d'après la population (objet { id, label }). */
export function sizeCategoryOf(population, categories = SIZE_CATEGORIES) {
  if (!Number.isFinite(population)) return UNKNOWN_CATEGORY;
  let found = categories[0];
  for (const cat of categories) {
    if (population >= cat.min) found = cat;
  }
  return found;
}

/** Libellé de la catégorie de taille : « Village », « Petite ville »… */
export function sizeCategory(population, categories = SIZE_CATEGORIES) {
  return sizeCategoryOf(population, categories).label;
}

/** Densité en hab./km², arrondie ; null si inconnue. */
export function density(population, surfaceKm2) {
  if (!Number.isFinite(population) || !Number.isFinite(surfaceKm2) || surfaceKm2 <= 0) return null;
  return Math.round(population / surfaceKm2);
}

/**
 * Décode communes.json (format en colonnes, voir encodeColumns dans
 * scripts/build-communes.mjs) en tableau d'objets communes.
 */
export function decodeCommunes(json) {
  const { coordFactor, surfaceFactor } = json.format;
  const communes = new Array(json.count);
  let lat = 0;
  let lon = 0;
  let suffix = 0;
  for (let i = 0; i < json.count; i++) {
    const dep = json.dep[i];
    suffix = i > 0 && json.dep[i - 1] === dep ? suffix + json.code[i] : json.code[i];
    lat += json.lat[i];
    lon += json.lon[i];
    const surface = json.surface[i];
    const nom = json.nom[i];
    communes[i] = {
      code: dep + String(suffix).padStart(5 - dep.length, '0'),
      nom,
      lat: lat / coordFactor,
      lon: lon / coordFactor,
      population: json.population[i],
      surface: surface == null ? null : surface / surfaceFactor,
      dep,
      reg: json.reg[i],
      codesPostaux: json.cp[i] ? json.cp[i].split(' ') : [],
      key: normalize(nom),
    };
  }
  return communes;
}

/**
 * Prépare les données chargées : objets communes, index par code INSEE
 * et par code postal, tables des départements et régions.
 */
export function prepareData({ communes: json, departements = {}, regions = {} }) {
  const communes = decodeCommunes(json);
  const byCode = new Map();
  const byPostalCode = new Map();
  const depRegion = new Map();
  for (const c of communes) {
    byCode.set(c.code, c);
    depRegion.set(c.dep, c.reg);
    for (const cp of c.codesPostaux) {
      if (!byPostalCode.has(cp)) byPostalCode.set(cp, []);
      byPostalCode.get(cp).push(c);
    }
  }
  for (const list of byPostalCode.values()) {
    list.sort((a, b) => (b.population ?? -1) - (a.population ?? -1));
  }
  return { meta: json.meta ?? {}, communes, byCode, byPostalCode, depRegion, departements, regions };
}

/** « Saint-Martin (Charente-Maritime, 17) » */
export function communeLabel(commune, departements) {
  const depName = departements[commune.dep];
  return depName ? `${commune.nom} (${depName}, ${commune.dep})` : `${commune.nom} (${commune.dep})`;
}

/** « Nord (59) » */
export function departementLabel(code, departements) {
  const name = departements[code];
  return name ? `${name} (${code})` : code;
}
