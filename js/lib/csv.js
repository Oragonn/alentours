// Export CSV compatible Excel (version française) : séparateur « ; »,
// UTF-8 avec BOM, virgule décimale, en-têtes en français.

import { density, departementLabel, sizeCategory } from './commune.js';
import { formatDecimalPlain, slugify } from './text.js';

export const BOM = '﻿';
const SEPARATOR = ';';
const EOL = '\r\n';

/** Met une valeur entre guillemets si elle contient ; " ou un saut de ligne. */
export function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns : [{ header, value(row) }] */
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => csvEscape(c.header)).join(SEPARATOR)];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(c.value(row))).join(SEPARATOR));
  }
  return BOM + lines.join(EOL) + EOL;
}

/** Colonnes décrivant une commune (sans distance). */
export function communeColumns(data) {
  return [
    { header: 'Nom', value: (c) => c.nom },
    { header: 'Code INSEE', value: (c) => c.code },
    { header: 'Codes postaux', value: (c) => c.codesPostaux.join(', ') },
    { header: 'Département', value: (c) => departementLabel(c.dep, data.departements) },
    { header: 'Région', value: (c) => data.regions[c.reg] ?? c.reg },
    { header: 'Population', value: (c) => (Number.isFinite(c.population) ? c.population : '') },
  ];
}

/**
 * Colonnes des résultats. `pointNames` : noms des points de départ ; avec
 * plusieurs points, une colonne de distance par point est ajoutée.
 * `extraColumns` : colonnes supplémentaires (Phase 2) recevant la commune.
 */
export function resultColumns(data, { pointNames = [], extraColumns = [] } = {}) {
  const base = communeColumns(data).map((col) => ({ header: col.header, value: (r) => col.value(r.commune) }));
  const distanceCols =
    pointNames.length > 1
      ? [
          { header: 'Distance max (km)', value: (r) => formatDecimalPlain(r.distance, 1) },
          ...pointNames.map((name, i) => ({
            header: `Distance ${name} (km)`,
            value: (r) => formatDecimalPlain(r.distances[i], 1),
          })),
        ]
      : [{ header: 'Distance (km)', value: (r) => formatDecimalPlain(r.distance, 1) }];
  return [
    ...base,
    ...distanceCols,
    { header: 'Catégorie', value: (r) => sizeCategory(r.commune.population) },
    { header: 'Superficie (km²)', value: (r) => formatDecimalPlain(r.commune.surface, 1) },
    {
      header: 'Densité (hab./km²)',
      value: (r) => density(r.commune.population, r.commune.surface) ?? '',
    },
    ...extraColumns.map((col) => ({ header: col.header, value: (r) => col.value(r.commune) })),
  ];
}

export function resultsToCsv(results, data, options) {
  return toCsv(results, resultColumns(data, options));
}

/** alentours-lille-30km.csv ; plusieurs points : alentours-lille-20km-arras-15km.csv */
export function csvFileName(points) {
  const parts = points.map((p) => `${slugify(p.name) || 'point'}-${String(p.radius).replace('.', ',')}km`);
  return `alentours-${parts.join('-') || 'resultats'}.csv`;
}
