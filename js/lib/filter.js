// Recherche dans les listes (résultats, favoris, dossiers) : fonctions pures.
//
// La saisie est découpée en mots ; chaque mot doit se retrouver dans l'un
// des textes de l'élément (sans accents, majuscules, tirets ni apostrophes).
// « saint etienne loire » trouve Saint-Étienne (Loire, 42).

import { STATUSES } from './favorites.js';
import { normalize } from './text.js';

/** Mots de la recherche, normalisés. Aucun mot = pas de filtre. */
export function queryWords(query) {
  return String(query ?? '')
    .split(/[\s,;/]+/)
    .map(normalize)
    .filter(Boolean);
}

/** Chaque mot est-il présent dans l'un des textes ? */
export function matchesWords(words, texts) {
  if (!words.length) return true;
  const hay = texts.filter((t) => t != null && t !== '').map((t) => normalize(t));
  return words.every((w) => hay.some((t) => t.includes(w)));
}

/** Textes d'une commune : nom, département (numéro et nom), codes postaux. */
export function communeTexts(commune, departements = {}) {
  if (!commune) return [];
  return [commune.nom, commune.dep, departements[commune.dep], ...(commune.codesPostaux ?? [])];
}

/** Résultats de recherche dont la commune correspond. */
export function filterResults(results, query, departements) {
  const words = queryWords(query);
  if (!words.length) return results;
  return results.filter((r) => matchesWords(words, communeTexts(r.commune, departements)));
}

/** Villes enregistrées (favoris ou villes d'un dossier) : nom, commune, note, statut. */
export function filterSavedCities(items, query, { byCode, departements } = {}) {
  const words = queryWords(query);
  if (!words.length) return items;
  return items.filter((item) =>
    matchesWords(words, [
      item.nom,
      item.note,
      STATUSES[item.statut],
      ...communeTexts(byCode?.get(item.code), departements),
    ])
  );
}

/** Dossiers : nom, client, et noms des communes qu'ils contiennent. */
export function filterFolders(folders, query, citiesOf) {
  const words = queryWords(query);
  if (!words.length) return folders;
  return folders.filter((f) =>
    matchesWords(words, [f.nom, f.fiche?.client, f.fiche?.zoneNom, ...citiesOf(f).map((c) => c.nom)])
  );
}
