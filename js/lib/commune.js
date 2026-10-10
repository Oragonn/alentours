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

/** Transforme une ligne de communes.json en objet. */
export function communeFromRecord(record, fields) {
  const c = {};
  for (let i = 0; i < fields.length; i++) c[fields[i]] = record[i];
  c.key = normalize(c.nom);
  return c;
}

/**
 * Prépare les données chargées : objets communes, index par code INSEE
 * et par code postal, tables des départements et régions.
 */
export function prepareData({ communes: json, departements = {}, regions = {} }) {
  const communes = json.communes.map((r) => communeFromRecord(r, json.fields));
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
