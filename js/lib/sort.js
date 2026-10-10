// Tri des résultats (fonction pure).

export const SORT_KEYS = ['distance', 'population', 'nom', 'prix'];
export const SORT_DIRS = ['asc', 'desc'];

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/**
 * Trie une copie des résultats. Les populations (ou prix) inconnus sont
 * toujours placés en dernier, quel que soit le sens.
 * priceOf(commune) → prix au m² ou null (clé « prix »).
 */
export function sortResults(results, key = 'distance', dir = 'asc', { priceOf = () => null } = {}) {
  const sign = dir === 'desc' ? -1 : 1;
  const byName = (a, b) => collator.compare(a.commune.nom, b.commune.nom);
  let compare;
  if (key === 'population') {
    compare = (a, b) => {
      const pa = a.commune.population;
      const pb = b.commune.population;
      const ua = !Number.isFinite(pa);
      const ub = !Number.isFinite(pb);
      if (ua || ub) return ua === ub ? byName(a, b) : ua ? 1 : -1;
      return sign * (pa - pb) || byName(a, b);
    };
  } else if (key === 'prix') {
    const price = (r) => priceOf(r.commune);
    compare = (a, b) => {
      const pa = price(a);
      const pb = price(b);
      const ua = !Number.isFinite(pa);
      const ub = !Number.isFinite(pb);
      if (ua || ub) return ua === ub ? byName(a, b) : ua ? 1 : -1;
      return sign * (pa - pb) || byName(a, b);
    };
  } else if (key === 'nom') {
    compare = (a, b) => sign * byName(a, b) || a.distance - b.distance;
  } else {
    compare = (a, b) => sign * (a.distance - b.distance) || byName(a, b);
  }
  return [...results].sort(compare);
}

/** « population-desc » → { key: 'population', dir: 'desc' } ; null si invalide */
export function parseSort(value) {
  const [key, dir = 'asc'] = String(value ?? '').split('-');
  if (!SORT_KEYS.includes(key) || !SORT_DIRS.includes(dir)) return null;
  return { key, dir };
}

export function formatSort({ key, dir }) {
  return `${key}-${dir}`;
}
