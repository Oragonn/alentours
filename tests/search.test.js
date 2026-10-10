import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { search, searchArea, filterByAdmin, adminFacets, validatePopulation } from '../js/lib/search.js';
import { sortResults, parseSort } from '../js/lib/sort.js';
import { prepareData } from '../js/lib/commune.js';
import { suggest } from '../js/lib/suggest.js';
import { distanceKm } from '../js/lib/geo.js';

const C = (code, nom, lat, lon, population, dep = '59', reg = '32') => ({
  code,
  nom,
  lat,
  lon,
  population,
  dep,
  reg,
  surface: 10,
  codesPostaux: [],
});

// Points le long d'un méridien : 1° de latitude ≈ 111,195 km
const ORIGIN = { lat: 50, lon: 3 };
const km = (d) => ORIGIN.lat + d / 111.19492664455873;
const communes = [
  C('00001', 'Origine', ORIGIN.lat, ORIGIN.lon, 5000),
  C('00002', 'Proche', km(5), 3, 500),
  C('00003', 'Moyenne', km(15), 3, 20000, '62'),
  C('00004', 'Limite', km(19.99), 3, 60000, '62'),
  C('00005', 'Dehors', km(20.01), 3, 100000, '62'),
  C('00006', 'Inconnue', km(10), 3, null),
  C('00007', 'Belge', km(8), 3, 9000, '80', '33'),
];
const point = { ...ORIGIN, radius: 20 };
const codes = (rs) => rs.map((r) => r.commune.code).sort();

test('rayon : bornes du cercle', () => {
  const res = search(communes, { points: [point] });
  assert.deepEqual(codes(res), ['00001', '00002', '00003', '00004', '00006', '00007']);
  const limite = res.find((r) => r.commune.code === '00004');
  assert.ok(limite.distance <= 20 && limite.distance > 19.9);
});

test('la commune de départ est incluse à distance 0', () => {
  const res = search(communes, { points: [point] });
  const origin = res.find((r) => r.commune.code === '00001');
  assert.equal(origin.distance, 0);
});

test('sans filtres : population inconnue incluse', () => {
  const res = search(communes, { points: [point], popMin: null, popMax: null });
  assert.ok(codes(res).includes('00006'));
});

test('minimum seul', () => {
  const res = search(communes, { points: [point], popMin: 5000 });
  assert.deepEqual(codes(res), ['00001', '00003', '00004', '00007']);
});

test('maximum seul', () => {
  const res = search(communes, { points: [point], popMax: 9000 });
  assert.deepEqual(codes(res), ['00001', '00002', '00007']);
});

test('minimum et maximum', () => {
  const res = search(communes, { points: [point], popMin: 5000, popMax: 20000 });
  assert.deepEqual(codes(res), ['00001', '00003', '00007']);
});

test('population inconnue exclue dès qu’une borne est fixée', () => {
  assert.ok(!codes(search(communes, { points: [point], popMin: 0 })).includes('00006'));
  assert.ok(!codes(search(communes, { points: [point], popMax: 1e9 })).includes('00006'));
});

test('minimum supérieur au maximum : message et aucune recherche', () => {
  assert.equal(validatePopulation(10, 5), 'Le minimum doit être inférieur au maximum');
  assert.equal(validatePopulation(5, 10), null);
  assert.equal(validatePopulation(null, 10), null);
  assert.deepEqual(search(communes, { points: [point], popMin: 10, popMax: 5 }), []);
});

test('aucun point de départ : aucun résultat', () => {
  assert.deepEqual(search(communes, { points: [] }), []);
});

test('filtres région et département', () => {
  const area = searchArea(communes, { points: [point] });
  assert.deepEqual(codes(filterByAdmin(area, { departements: ['62'] })), ['00003', '00004']);
  assert.deepEqual(codes(filterByAdmin(area, { regions: ['33'] })), ['00007']);
  assert.equal(filterByAdmin(area, {}).length, area.length);
  const facets = adminFacets(area);
  assert.deepEqual(
    facets.regions.sort((a, b) => a.code.localeCompare(b.code)),
    [
      { code: '32', count: 5 },
      { code: '33', count: 1 },
    ]
  );
  const narrowed = adminFacets(area, ['33']);
  assert.deepEqual(narrowed.departements, [{ code: '80', count: 1, reg: '33' }]);
});

test('plusieurs points : intersection des cercles', () => {
  const second = { lat: km(20), lon: 3, radius: 10.5 };
  const res = search(communes, { points: [point, second] });
  // Dans les deux cercles : de 10 à 20 km de l'origine
  assert.deepEqual(codes(res), ['00003', '00004', '00006']);
  const moyenne = res.find((r) => r.commune.code === '00003');
  assert.equal(moyenne.distances.length, 2);
  assert.equal(moyenne.distance, Math.max(...moyenne.distances));
  // Cercles disjoints : aucun résultat
  const far = { lat: km(60), lon: 3, radius: 10 };
  assert.deepEqual(search(communes, { points: [point, far] }), []);
});

test('tri : distance, population, nom dans les deux sens', () => {
  const list = [
    { commune: C('1', 'Écully', 0, 0, 18000), distance: 3 },
    { commune: C('2', 'Albi', 0, 0, null), distance: 1 },
    { commune: C('3', 'Fréjus', 0, 0, 50000), distance: 2 },
    { commune: C('4', 'Dax', 0, 0, 20000), distance: 4 },
  ];
  const names = (rs) => rs.map((r) => r.commune.nom);
  assert.deepEqual(names(sortResults(list, 'distance', 'asc')), ['Albi', 'Fréjus', 'Écully', 'Dax']);
  assert.deepEqual(names(sortResults(list, 'distance', 'desc')), ['Dax', 'Écully', 'Fréjus', 'Albi']);
  assert.deepEqual(names(sortResults(list, 'population', 'asc')), ['Écully', 'Dax', 'Fréjus', 'Albi']);
  assert.deepEqual(names(sortResults(list, 'population', 'desc')), ['Fréjus', 'Dax', 'Écully', 'Albi']);
  assert.deepEqual(names(sortResults(list, 'nom', 'asc')), ['Albi', 'Dax', 'Écully', 'Fréjus']);
  assert.deepEqual(names(sortResults(list, 'nom', 'desc')), ['Fréjus', 'Écully', 'Dax', 'Albi']);
  // Ne modifie pas le tableau d'origine
  assert.equal(list[0].commune.nom, 'Écully');
  assert.deepEqual(parseSort('population-desc'), { key: 'population', dir: 'desc' });
  assert.equal(parseSort('taille-asc'), null);
});

// --- Tests sur les vraies données ---

const data = prepareData({
  communes: JSON.parse(readFileSync(new URL('../data/communes.json', import.meta.url), 'utf8')),
  departements: JSON.parse(readFileSync(new URL('../data/departements.json', import.meta.url), 'utf8')),
  regions: JSON.parse(readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8')),
});

test('données : 30 km autour de Lille, ≥ 10 000 habitants', () => {
  const lille = data.byCode.get('59350');
  assert.equal(lille.nom, 'Lille');
  const res = search(data.communes, {
    points: [{ lat: lille.lat, lon: lille.lon, radius: 30 }],
    popMin: 10000,
  });
  const names = res.map((r) => r.commune.nom);
  for (const n of ['Lille', 'Roubaix', 'Tourcoing', "Villeneuve-d'Ascq"]) assert.ok(names.includes(n), n);
  assert.equal(res.find((r) => r.commune.code === '59350').distance, 0);
});

test('données : 100 km autour de Paris en moins de 300 ms', () => {
  const paris = data.byCode.get('75056');
  const params = { points: [{ lat: paris.lat, lon: paris.lon, radius: 100 }] };
  search(data.communes, params); // échauffement
  const t0 = performance.now();
  const res = search(data.communes, params);
  const sorted = sortResults(res, 'nom', 'asc');
  const ms = performance.now() - t0;
  assert.ok(res.length > 3000, `${res.length} résultats`);
  assert.equal(sorted.length, res.length);
  assert.ok(ms < 300, `${ms.toFixed(1)} ms`);
  for (const r of res) assert.ok(distanceKm(paris.lat, paris.lon, r.commune.lat, r.commune.lon) <= 100);
});

test('suggestions : nom, homonymes, code postal', () => {
  const lil = suggest(data, 'Lil');
  assert.equal(lil.kind, 'name');
  assert.equal(lil.items[0].nom, 'Lille');
  assert.ok(lil.items.length <= 10);

  const se = suggest(data, 'saint etienne');
  assert.equal(se.items[0].nom, 'Saint-Étienne');

  const lhay = suggest(data, 'lhay les roses');
  assert.equal(lhay.items[0].nom, "L'Haÿ-les-Roses");

  // Les noms qui commencent par la saisie passent avant ceux qui la contiennent
  const roubaix = suggest(data, 'roubaix');
  assert.equal(roubaix.items[0].nom, 'Roubaix');

  const cp = suggest(data, '59000');
  assert.equal(cp.kind, 'postal');
  assert.deepEqual(cp.items.map((c) => c.nom), ['Lille']);

  assert.equal(suggest(data, '00000').empty, 'Aucune commune pour ce code postal');
  assert.equal(suggest(data, 'zzzzqx').empty, 'Aucune commune trouvée');
  assert.equal(suggest(data, 'L').kind, 'none');
});
