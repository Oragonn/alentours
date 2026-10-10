// Tableau de comparaison de communes (fonction pure, testée avec Node).

import { density, departementLabel, sizeCategory } from './commune.js';
import { populationTrend, priceInfo } from './insights.js';
import { formatKm, formatNumber, NBSP } from './text.js';
import { amenitySummary } from './amenities.js';
import { BUDGET_STATUS_LABELS, formatEuros } from './budget.js';

const NA = 'Non disponible';

/**
 * Indices des meilleures valeurs d'une ligne : la plus petite (`min`) ou la
 * plus grande (`max`). Rien si moins de deux valeurs connues ou si toutes
 * sont égales.
 */
export function bestIndexes(values, best) {
  if (!best) return [];
  const known = values.map((v, i) => [v, i]).filter(([v]) => Number.isFinite(v));
  if (known.length < 2) return [];
  const target = best === 'min' ? Math.min(...known.map(([v]) => v)) : Math.max(...known.map(([v]) => v));
  if (known.every(([v]) => v === target)) return [];
  return known.filter(([v]) => v === target).map(([, i]) => i);
}

/**
 * communes : communes à comparer (objets de prepareData)
 * options :
 *   data         { departements, regions }
 *   trendSeries  (code) → série de population ou null (null = non chargée)
 *   prices       (code) → entrée DVF ou null ; pricesMeta : { periode }
 *   points       [{ name, lat, lon }] points de départ de la recherche
 *   distanceKm   (lat1, lon1, lat2, lon2) → km
 *   notes        (code) → note personnelle (facultatif : ligne « Note » si fourni)
 *   travel       (indice du point, code) → { minutes, km } | null (facultatif)
 *   amenities    (code) → comptes d'équipements (facultatif)
 *   budgetOf     (commune) → résultat de budgetCheck (facultatif) ; budgetLabel
 * Renvoie { columns: [{ code, nom, dep }], rows: [{ key, label, cells: [{ text }], best }] }
 * où best = indices des cellules mises en avant.
 */
export function comparisonTable(communes, { data, trendSeries, prices, pricesMeta = {}, points = [], distanceKm, notes = null, travel = null, amenities = null, budgetOf = null, budgetLabel = 'Estimation' }) {
  const rows = [];
  const add = (key, label, cells, best = null) => {
    rows.push({ key, label, cells, best: bestIndexes(cells.map((c) => c.value), best) });
  };
  const cell = (text, value = null) => ({ text: text ?? NA, value });

  add('departement', 'Département', communes.map((c) => cell(departementLabel(c.dep, data.departements))));
  add('region', 'Région', communes.map((c) => cell(data.regions[c.reg] ?? NA)));
  add(
    'population',
    'Population',
    communes.map((c) => cell(Number.isFinite(c.population) ? `${formatNumber(c.population)}${NBSP}hab.` : NA, c.population))
  );
  add('categorie', 'Catégorie', communes.map((c) => cell(sizeCategory(c.population))));

  if (trendSeries) {
    add(
      'tendance',
      'Tendance démographique',
      communes.map((c) => {
        const t = populationTrend(trendSeries(c.code));
        if (!t) return cell(NA);
        const sign = t.pct > 0 ? '+' : '';
        return cell(`${sign}${formatNumber(t.pct, 1)}${NBSP}% depuis ${t.since}`, t.pct);
      }),
      'max'
    );
  }

  add(
    'superficie',
    'Superficie',
    communes.map((c) => cell(Number.isFinite(c.surface) ? `${formatNumber(c.surface, 1)}${NBSP}km²` : NA, c.surface))
  );
  add(
    'densite',
    'Densité',
    communes.map((c) => {
      const d = density(c.population, c.surface);
      return cell(d != null ? `${formatNumber(d)}${NBSP}hab./km²` : NA, d);
    })
  );

  if (prices) {
    const infos = communes.map((c) => priceInfo(prices(c.code), c.dep, pricesMeta));
    const priceCells = (type) =>
      infos.map((info) => {
        if (info.status !== 'ok') return cell(info.label);
        const t = info[type];
        return t ? cell(`${formatNumber(Math.round(t.prix))}${NBSP}€`, t.prix) : cell('Données insuffisantes');
      });
    add('prixMaison', 'Prix maison (m²)', priceCells('maison'), 'min');
    add('prixAppartement', 'Prix appartement (m²)', priceCells('appartement'), 'min');
    add(
      'ventes',
      pricesMeta.periode ? `Ventes DVF (${pricesMeta.periode})` : 'Ventes DVF',
      infos.map((info) => cell(info.status === 'ok' ? formatNumber(info.ventes) : '—'))
    );
  }

  if (budgetOf) {
    add(
      'budget',
      budgetLabel,
      communes.map((c) => {
        const b = budgetOf(c);
        if (!b || b.status === 'inconnu') return cell('Prix inconnu');
        return cell(`≈ ${formatEuros(b.estimate)} (${BUDGET_STATUS_LABELS[b.status].toLowerCase()})`, b.estimate);
      }),
      'min'
    );
  }

  points.forEach((p, k) => {
    if (!travel) return;
    add(
      `trajet-${p.name}`,
      `Trajet en voiture depuis ${p.name}`,
      communes.map((c) => {
        const t = travel(k, c.code);
        if (t && t.km < 0.5) return cell('Sur place', 0);
        return t ? cell(`${Math.round(t.minutes)}${NBSP}min (${formatNumber(t.km, 0)}${NBSP}km)`, t.minutes) : cell(NA);
      }),
      'min'
    );
  });

  if (amenities) {
    add('equipements', 'Équipements', communes.map((c) => cell(amenitySummary(amenities(c.code)))));
  }

  for (const p of points) {
    add(
      `distance-${p.name}`,
      `Distance à vol d’oiseau de ${p.name}`,
      communes.map((c) => {
        const km = distanceKm(p.lat, p.lon, c.lat, c.lon);
        return cell(formatKm(km), km);
      }),
      'min'
    );
  }

  if (notes) add('note', 'Note personnelle', communes.map((c) => cell(notes(c.code) || '—')));

  return { columns: communes.map((c) => ({ code: c.code, nom: c.nom, dep: c.dep })), rows };
}
