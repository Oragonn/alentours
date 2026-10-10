// Tendance démographique et prix immobiliers (fonctions pures).

import { DVF_MIN_SALES, DVF_NOT_COVERED, TREND_STABLE_PERCENT } from '../config.js';
import { formatNumber, NBSP } from './text.js';

/**
 * Tendance entre deux recensements.
 * `series` : { years: [2011, 2016, 2022], values: [p1, p2, p3] } (valeurs
 * pouvant être null). Compare la dernière valeur à celle d'environ 10 ans
 * plus tôt. Renvoie null si la tendance ne peut pas être calculée.
 */
export function populationTrend(series, { stablePercent = TREND_STABLE_PERCENT, span = 10 } = {}) {
  if (!series || !Array.isArray(series.years) || !Array.isArray(series.values)) return null;
  const points = series.years
    .map((year, i) => ({ year, value: series.values[i] }))
    .filter((p) => Number.isFinite(p.value) && p.value > 0);
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const target = last.year - span;
  let base = points[0];
  for (const p of points) {
    if (p.year === last.year) continue;
    if (Math.abs(p.year - target) < Math.abs(base.year - target)) base = p;
  }
  if (base.year === last.year) return null;
  const pct = ((last.value - base.value) / base.value) * 100;
  const kind = Math.abs(pct) <= stablePercent ? 'stable' : pct > 0 ? 'up' : 'down';
  const pctText = `${pct > 0 ? '+' : ''}${formatNumber(pct, 1)}${NBSP}%`;
  const label =
    kind === 'stable'
      ? `Stable (${pctText} depuis ${base.year})`
      : `${kind === 'up' ? 'En hausse' : 'En baisse'} (${pctText} depuis ${base.year})`;
  return { kind, pct, since: base.year, until: last.year, label, points };
}

/** Libellé court pour le CSV et l'impression */
export function trendText(series) {
  return populationTrend(series)?.label ?? 'Non disponible';
}

/**
 * Prix médians au m² (DVF).
 * `entry` : { maison: { prix, ventes }, appartement: { prix, ventes } }
 * `meta`  : { periode: '2021–2024' }
 * Renvoie { status: 'ok' | 'insuffisant' | 'non-couvert', label, maison, appartement, ventes }.
 */
export function priceInfo(entry, departement, meta = {}, minSales = DVF_MIN_SALES) {
  if (DVF_NOT_COVERED.includes(departement)) return { status: 'non-couvert', label: 'Non couvert par DVF' };
  const ok = (t) => t && Number.isFinite(t.prix) && Number.isFinite(t.ventes) && t.ventes >= minSales;
  const maison = ok(entry?.maison) ? entry.maison : null;
  const appartement = ok(entry?.appartement) ? entry.appartement : null;
  if (!maison && !appartement) return { status: 'insuffisant', label: 'Données insuffisantes' };
  const euros = (t) => (t ? `${formatNumber(Math.round(t.prix))}${NBSP}€` : 'données insuffisantes');
  const ventes = (entry?.maison?.ventes ?? 0) + (entry?.appartement?.ventes ?? 0);
  const periode = meta.periode ? `données DVF ${meta.periode}, ` : 'données DVF, ';
  const label = `Maison ${euros(maison)} · Appartement ${euros(appartement)} (${periode}${formatNumber(ventes)} ventes)`;
  return { status: 'ok', label, maison, appartement, ventes };
}
