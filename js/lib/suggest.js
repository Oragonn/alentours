// Suggestions pour le champ « Ville ou code postal » (aucun accès au DOM).

import { AUTOCOMPLETE } from '../config.js';
import { normalize } from './text.js';

const byPopulationDesc = (a, b) => (b.population ?? -1) - (a.population ?? -1);

/**
 * Renvoie { kind, items, empty } :
 *   kind  'name' | 'postal' | 'none'
 *   items communes suggérées (au plus `max`)
 *   empty message à afficher si aucune suggestion, sinon null
 */
export function suggest(data, query, { minChars = AUTOCOMPLETE.minChars, max = AUTOCOMPLETE.maxResults } = {}) {
  const q = String(query ?? '').trim();

  if (/^\d{5}$/.test(q)) {
    const items = (data.byPostalCode.get(q) ?? []).slice(0, max);
    return { kind: 'postal', items, empty: items.length ? null : 'Aucune commune pour ce code postal' };
  }

  if (/^\d+$/.test(q)) {
    if (q.length < minChars) return { kind: 'none', items: [], empty: null };
    // Début de code postal : communes dont un code postal commence ainsi
    const items = data.communes
      .filter((c) => c.codesPostaux.some((cp) => cp.startsWith(q)))
      .sort(byPopulationDesc)
      .slice(0, max);
    return { kind: 'postal', items, empty: items.length ? null : 'Aucune commune pour ce code postal' };
  }

  const key = normalize(q);
  if (q.length < minChars || key.length === 0) return { kind: 'none', items: [], empty: null };

  const starts = [];
  const contains = [];
  for (const c of data.communes) {
    const pos = c.key.indexOf(key);
    if (pos === 0) starts.push(c);
    else if (pos > 0) contains.push(c);
  }
  starts.sort(byPopulationDesc);
  let items = starts.slice(0, max);
  if (items.length < max) {
    contains.sort(byPopulationDesc);
    items = items.concat(contains.slice(0, max - items.length));
  }
  return { kind: 'name', items, empty: items.length ? null : 'Aucune commune trouvée' };
}
