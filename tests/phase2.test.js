import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addFavorite,
  exportFavorites,
  isFavorite,
  mergeFavorites,
  parseFavoritesFile,
  readStoredFavorites,
  removeFavorite,
  setNote,
  toggleFavorite,
  toStoredFavorites,
  visibleFavorites,
} from '../js/lib/favorites.js';
import { populationTrend, priceInfo, trendText } from '../js/lib/insights.js';
import { deName, searchSummary } from '../js/lib/summary.js';
import { parseCsvLine } from '../scripts/build-dvf.mjs';
import { NBSP } from '../js/lib/text.js';

const lille = { code: '59350', nom: 'Lille' };
const arras = { code: '62041', nom: 'Arras' };
const day = new Date('2026-10-10T12:00:00Z');

test('favoris : ajout, retrait, note, bascule', () => {
  let favs = addFavorite([], lille, day);
  assert.deepEqual(favs, [
    { code: '59350', nom: 'Lille', note: '', ajoute: '2026-10-10T12:00:00.000Z', modifie: '2026-10-10T12:00:00.000Z' },
  ]);
  assert.equal(addFavorite(favs, lille, day), favs, 'pas de doublon');
  favs = toggleFavorite(favs, arras, day);
  assert.equal(favs.length, 2);
  favs = setNote(favs, '62041', 'Beffroi');
  assert.equal(favs[1].note, 'Beffroi');
  assert.ok(isFavorite(favs, '62041'));
  favs = toggleFavorite(favs, arras, day);
  assert.ok(!isFavorite(favs, '62041'));
  assert.deepEqual(visibleFavorites(removeFavorite(favs, '59350')), []);
});

test('favoris : stockage versionné et valeurs corrompues', () => {
  const favs = addFavorite([], lille, day);
  assert.deepEqual(readStoredFavorites(toStoredFavorites(favs)), favs);
  assert.deepEqual(toStoredFavorites(favs).version, 1);
  assert.deepEqual(readStoredFavorites(null), []);
  assert.deepEqual(readStoredFavorites({ items: 'x' }), []);
  assert.deepEqual(readStoredFavorites({ items: [{ code: 'bad' }, { code: '59350' }] }).length, 1);
});

test('favoris : export puis import', () => {
  const favs = setNote(addFavorite([], lille, day), '59350', 'Vieux-Lille ; "joli"');
  const file = exportFavorites(favs, day);
  assert.equal(file.format, 'alentours-favoris');
  assert.equal(file.version, 1);
  const parsed = parseFavoritesFile(JSON.stringify(file));
  assert.equal(parsed.ok, true);
  // Le fichier ne garde pas la date de modification : elle reprend la date d'ajout
  assert.deepEqual(parsed.items, favs.map((f) => ({ ...f, modifie: f.ajoute })));
  // Les favoris retirés ne sont pas exportés
  assert.deepEqual(exportFavorites(removeFavorite(favs, '59350'), day).favoris, []);
});

test('favoris : fichier invalide', () => {
  assert.equal(parseFavoritesFile('pas du json').ok, false);
  assert.equal(parseFavoritesFile('{}').ok, false);
  assert.equal(parseFavoritesFile(JSON.stringify({ format: 'autre', version: 1, favoris: [] })).ok, false);
  assert.equal(parseFavoritesFile(JSON.stringify({ format: 'alentours-favoris', version: 99, favoris: [] })).ok, false);
  assert.equal(
    parseFavoritesFile(JSON.stringify({ format: 'alentours-favoris', version: 1, favoris: [{ code: 'zz' }] })).ok,
    false
  );
});

test('favoris : fusion', () => {
  const current = [{ code: '59350', nom: 'Lille', note: '', ajoute: day.toISOString() }];
  const incoming = [
    { code: '59350', nom: 'Lille', note: 'note importée', ajoute: day.toISOString() },
    { code: '62041', nom: 'Arras', note: '', ajoute: day.toISOString() },
  ];
  const merged = mergeFavorites(current, incoming);
  assert.deepEqual(merged.map((f) => f.code), ['59350', '62041']);
  assert.equal(merged[0].note, 'note importée');
  const kept = mergeFavorites([{ ...current[0], note: 'à moi' }], incoming);
  assert.equal(kept[0].note, 'à moi');
});

const series = (values) => ({ years: [1982, 1990, 1999, 2008, 2013, 2018, 2023], values });

test('tendance démographique', () => {
  const up = populationTrend(series([100, 100, 100, 100, 1000, 1020, 1042]));
  assert.equal(up.kind, 'up');
  assert.equal(up.since, 2013);
  assert.equal(up.label, `En hausse (+4,2${NBSP}% depuis 2013)`);
  const down = populationTrend(series([null, null, null, null, 1000, 990, 969]));
  assert.equal(down.label, `En baisse (−3,1${NBSP}% depuis 2013)`);
  const stable = populationTrend(series([1, 1, 1, 1, 1000, 1000, 1005]));
  assert.equal(stable.kind, 'stable');
  assert.ok(stable.label.startsWith('Stable'));
  // Seuil ±1 % inclus
  assert.equal(populationTrend(series([1, 1, 1, 1, 1000, 1000, 1010])).kind, 'stable');
  // Année la plus proche de « 10 ans avant » si 2013 manque (à égalité : la plus ancienne)
  assert.equal(populationTrend(series([1, 1, 1, 900, null, 950, 1000])).since, 2008);
  assert.equal(populationTrend(series([1, 1, 1, null, null, 950, 1000])).since, 2018);
  assert.equal(populationTrend(null), null);
  assert.equal(populationTrend(series([null, null, null, null, null, null, 500])), null);
  assert.equal(trendText(null), 'Non disponible');
});

test('prix DVF', () => {
  const entry = { maison: { prix: 2450, ventes: 100 }, appartement: { prix: 3100, ventes: 54 } };
  assert.equal(
    priceInfo(entry, '59', { periode: '2021–2024' }).label,
    `Maison 2${NBSP}450${NBSP}€ · Appartement 3${NBSP}100${NBSP}€ (données DVF 2021–2024, 154 ventes)`
  );
  assert.equal(priceInfo(entry, '67').label, 'Non couvert par DVF');
  assert.equal(priceInfo(entry, '57').status, 'non-couvert');
  assert.equal(priceInfo(entry, '68').status, 'non-couvert');
  assert.equal(priceInfo(entry, '976').status, 'non-couvert');
  assert.equal(priceInfo(null, '59').label, 'Données insuffisantes');
  const few = { maison: { prix: 1500, ventes: 4 }, appartement: { prix: null, ventes: 0 } };
  assert.equal(priceInfo(few, '23').label, 'Données insuffisantes');
  const onlyHouses = { maison: { prix: 1500, ventes: 5 }, appartement: { prix: 2000, ventes: 2 } };
  const info = priceInfo(onlyHouses, '23', { periode: '2021–2025' });
  assert.equal(info.status, 'ok');
  assert.ok(info.label.includes('Appartement données insuffisantes'));
});

test('résumé de la recherche', () => {
  assert.equal(deName('Lille'), 'de Lille');
  assert.equal(deName('Arras'), 'd’Arras');
  assert.equal(deName('Le Havre'), 'du Havre');
  assert.equal(deName("Les Sables-d'Olonne"), "des Sables-d'Olonne");
  assert.equal(deName('La Rochelle'), 'de La Rochelle');
  assert.equal(
    searchSummary({ points: [{ name: 'Lille', radius: 30 }], popMin: 10000, count: 12 }),
    `Communes à moins de 30${NBSP}km de Lille, population ≥ 10${NBSP}000 — 12 résultats`
  );
  assert.equal(
    searchSummary({
      points: [
        { name: 'Lille', radius: 20 },
        { name: 'Arras', radius: 12.5 },
      ],
      count: 1,
    }),
    `Communes à moins de 20${NBSP}km de Lille et à moins de 12,5${NBSP}km d’Arras — 1 résultat`
  );
});

test('lecture CSV DVF', () => {
  assert.deepEqual(parseCsvLine('a,"b, c",,"d ""e"""'), ['a', 'b, c', '', 'd "e"']);
});

test('comparaison : meilleures valeurs', async () => {
  const { bestIndexes, comparisonTable } = await import('../js/lib/compare.js');
  const { distanceKm } = await import('../js/lib/geo.js');
  assert.deepEqual(bestIndexes([3, 1, 2], 'min'), [1]);
  assert.deepEqual(bestIndexes([3, 1, 3], 'max'), [0, 2]);
  assert.deepEqual(bestIndexes([2, 2], 'min'), [], 'toutes égales : rien');
  assert.deepEqual(bestIndexes([5, null], 'min'), [], 'une seule valeur connue');
  assert.deepEqual(bestIndexes([5, 1], null), []);

  const communes = [
    { code: '59350', nom: 'Lille', dep: '59', reg: '32', population: 238246, surface: 34.83, lat: 50.6311, lon: 3.0468 },
    { code: '62041', nom: 'Arras', dep: '62', reg: '32', population: 41000, surface: 11.63, lat: 50.29, lon: 2.78 },
    { code: '67482', nom: 'Strasbourg', dep: '67', reg: '44', population: 291000, surface: 78.26, lat: 48.57, lon: 7.75 },
  ];
  const table = comparisonTable(communes, {
    data: { departements: { 59: 'Nord', 62: 'Pas-de-Calais', 67: 'Bas-Rhin' }, regions: { 32: 'Hauts-de-France', 44: 'Grand Est' } },
    trendSeries: (code) => ({ years: [2013, 2023], values: code === '62041' ? [40000, 41000] : code === '59350' ? [230000, 238246] : [280000, 280100] }),
    prices: (code) =>
      code === '59350'
        ? { maison: { prix: 2823, ventes: 4834 }, appartement: { prix: 3763, ventes: 14230 } }
        : { maison: { prix: 1900, ventes: 900 }, appartement: { prix: 2100, ventes: 700 } },
    pricesMeta: { periode: '2021–2025' },
    points: [{ name: 'Lille', lat: 50.6311, lon: 3.0468 }],
    distanceKm,
    notes: (code) => (code === '59350' ? 'Vieux-Lille' : ''),
  });
  const row = (key) => table.rows.find((r) => r.key === key);
  assert.deepEqual(table.columns.map((c) => c.nom), ['Lille', 'Arras', 'Strasbourg']);
  // Lille : plus forte hausse (+3,6 %) et distance 0 ; Arras : prix les plus bas
  assert.deepEqual(row('tendance').best, [0]);
  assert.deepEqual(row('prixMaison').best, [1], 'Strasbourg (non couvert par DVF) ignoré');
  assert.equal(row('prixMaison').cells[2].text, 'Non couvert par DVF');
  assert.deepEqual(row('distance-Lille').best, [0]);
  assert.deepEqual(row('population').best, [], 'population : pas de « meilleure » valeur');
  assert.equal(row('note').cells[0].text, 'Vieux-Lille');
  assert.equal(row('note').cells[1].text, '—');
  assert.equal(row('ventes').label, 'Ventes DVF (2021–2025)');
});
