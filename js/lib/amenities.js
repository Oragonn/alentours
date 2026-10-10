// Équipements par commune (INSEE, BPE) : libellés et résumés (fonctions pures).

export const AMENITY_LABELS = {
  ecoles: ['école', 'écoles'],
  colleges: ['collège', 'collèges'],
  lycees: ['lycée', 'lycées'],
  creches: ['crèche', 'crèches'],
  medecins: ['médecin généraliste', 'médecins généralistes'],
  pharmacies: ['pharmacie', 'pharmacies'],
  supermarches: ['supermarché', 'supermarchés'],
  boulangeries: ['boulangerie', 'boulangeries'],
  poste: ['bureau de poste', 'bureaux de poste'],
  gares: ['gare', 'gares'],
};

/** Ligne du fichier → { ecoles: 3, … } (zéros si commune absente). */
export function amenityCounts(row, fields) {
  const out = {};
  fields.forEach((f, i) => (out[f] = row ? row[i] ?? 0 : 0));
  return out;
}

const label = (key, n) => `${n} ${AMENITY_LABELS[key][n > 1 ? 1 : 0]}`;

/** Liste lisible : [{ key, count, text }] (équipements présents seulement). */
export function amenityList(counts) {
  return Object.keys(AMENITY_LABELS)
    .filter((k) => counts[k] > 0)
    .map((k) => ({ key: k, count: counts[k], text: label(k, counts[k]) }));
}

/** Résumé court pour le tableau et l'impression : « 4 écoles · 1 collège · gare ». */
export function amenitySummary(counts, keys = ['ecoles', 'colleges', 'lycees', 'medecins', 'gares']) {
  const parts = keys
    .filter((k) => counts[k] > 0)
    .map((k) => (k === 'gares' ? (counts[k] > 1 ? `${counts[k]} gares` : 'gare') : label(k, counts[k])));
  return parts.length ? parts.join(' · ') : 'Aucun de ces équipements';
}
