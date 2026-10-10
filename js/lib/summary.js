// Phrase résumant la recherche (impression, partage).

import { formatNumber, NBSP, plural } from './text.js';

/** « de Lille », « d'Arras », « du Havre », « des Sables-d'Olonne » */
export function deName(name) {
  if (/^Le /.test(name)) return `du ${name.slice(3)}`;
  if (/^Les /.test(name)) return `des ${name.slice(4)}`;
  // Élision devant une voyelle (le « h » est laissé de côté : trop d'exceptions)
  if (/^[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜŸŒ]/i.test(name)) return `d’${name}`;
  return `de ${name}`;
}

/**
 * « Communes à moins de 30 km de Lille, population ≥ 10 000 — 12 résultats »
 * points : [{ name, radius, de? }]
 */
export function searchSummary({ points, popMin = null, popMax = null, count, filters = [] }) {
  const km = (r) => `${formatNumber(r, Number.isInteger(r) ? 0 : 1)}${NBSP}km`;
  // `p.de` permet de fournir directement le complément (« du point (…) »)
  const zones = points.map((p) => `à moins de ${km(p.radius)} ${p.de ?? deName(p.name)}`);
  let text = `Communes ${zones.join(' et ')}`;
  if (popMin != null && popMax != null) text += `, population entre ${formatNumber(popMin)} et ${formatNumber(popMax)}`;
  else if (popMin != null) text += `, population ≥ ${formatNumber(popMin)}`;
  else if (popMax != null) text += `, population ≤ ${formatNumber(popMax)}`;
  if (filters.length) text += `, ${filters.join(', ')}`;
  text += ` — ${formatNumber(count)} ${plural(count, 'résultat', 'résultats')}`;
  return text;
}
