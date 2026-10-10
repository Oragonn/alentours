// Moteur de recherche (fonctions pures, aucun accès au DOM).
//
// params = {
//   points: [{ lat, lon, radius }],  un ou plusieurs points de départ
//   popMin, popMax                    null = pas de limite
//   regions, departements             tableaux de codes, vides = pas de filtre
// }
// Chaque résultat : { commune, distances: [km par point], distance: max(distances) }

import { boundingBox, distanceKm } from './geo.js';

/** Vérifie les bornes de population ; renvoie un message d'erreur ou null. */
export function validatePopulation(popMin, popMax) {
  if (popMin != null && popMax != null && popMin > popMax) {
    return 'Le minimum doit être inférieur au maximum';
  }
  return null;
}

function passesPopulation(population, popMin, popMax) {
  if (popMin == null && popMax == null) return true;
  if (!Number.isFinite(population)) return false;
  if (popMin != null && population < popMin) return false;
  if (popMax != null && population > popMax) return false;
  return true;
}

/**
 * Communes situées dans tous les cercles et qui respectent les bornes de
 * population (sans les filtres département/région).
 */
export function searchArea(communes, { points, popMin = null, popMax = null }) {
  const valid = (points ?? []).filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.radius) && p.radius > 0
  );
  if (valid.length === 0) return [];
  const boxes = valid.map((p) => boundingBox(p.lat, p.lon, p.radius));
  const results = [];

  outer: for (const c of communes) {
    // Pré-filtre rapide : rectangle englobant de chaque cercle
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (c.lat < b.minLat || c.lat > b.maxLat) continue outer;
      if (!b.wrapsLon && (c.lon < b.minLon || c.lon > b.maxLon)) continue outer;
    }
    if (!passesPopulation(c.population, popMin, popMax)) continue;
    const distances = new Array(valid.length);
    let max = 0;
    for (let i = 0; i < valid.length; i++) {
      const p = valid[i];
      const d = distanceKm(p.lat, p.lon, c.lat, c.lon);
      if (d > p.radius) continue outer;
      distances[i] = d;
      if (d > max) max = d;
    }
    results.push({ commune: c, distances, distance: max });
  }
  return results;
}

/** Applique les filtres région et département. */
export function filterByAdmin(results, { regions = [], departements = [] } = {}) {
  const regSet = new Set(regions);
  const depSet = new Set(departements);
  if (regSet.size === 0 && depSet.size === 0) return results;
  return results.filter(
    (r) => (regSet.size === 0 || regSet.has(r.commune.reg)) && (depSet.size === 0 || depSet.has(r.commune.dep))
  );
}

/** Recherche complète : cercles, population, puis région et département. */
export function search(communes, params) {
  if (validatePopulation(params.popMin, params.popMax)) return [];
  return filterByAdmin(searchArea(communes, params), params);
}

/**
 * Comptes par région et par département dans les résultats (avant filtres
 * administratifs). Si des régions sont choisies, la liste des départements
 * se limite à ces régions.
 */
export function adminFacets(results, selectedRegions = []) {
  const regions = new Map();
  const departements = new Map();
  const regSet = new Set(selectedRegions);
  for (const { commune: c } of results) {
    regions.set(c.reg, (regions.get(c.reg) ?? 0) + 1);
    if (regSet.size === 0 || regSet.has(c.reg)) {
      const entry = departements.get(c.dep) ?? { count: 0, reg: c.reg };
      entry.count++;
      departements.set(c.dep, entry);
    }
  }
  return {
    regions: [...regions].map(([code, count]) => ({ code, count })),
    departements: [...departements].map(([code, { count, reg }]) => ({ code, count, reg })),
  };
}
