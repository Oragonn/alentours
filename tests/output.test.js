import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resultsToCsv, csvEscape, csvFileName, BOM } from '../js/lib/csv.js';
import { encodeSearch, decodeSearch } from '../js/lib/url.js';

const data = {
  departements: { 59: 'Nord', 94: 'Val-de-Marne' },
  regions: { 32: 'Hauts-de-France', 11: 'Île-de-France' },
};

const results = [
  {
    commune: {
      code: '59009',
      nom: "Villeneuve-d'Ascq",
      population: 62067,
      surface: 27.46,
      dep: '59',
      reg: '32',
      codesPostaux: ['59491', '59650'],
    },
    distances: [7.84],
    distance: 7.84,
  },
  {
    commune: {
      code: '94038',
      nom: "L'Haÿ-les-Roses",
      population: 31000,
      surface: 3.9,
      dep: '94',
      reg: '11',
      codesPostaux: ['94240'],
    },
    distances: [12],
    distance: 12,
  },
];

test('CSV : sortie exacte pour 2 communes', () => {
  const csv = resultsToCsv(results, data);
  const expected =
    BOM +
    'Nom;Code INSEE;Codes postaux;Département;Région;Population;Distance (km);Catégorie;Superficie (km²);Densité (hab./km²)\r\n' +
    "Villeneuve-d'Ascq;59009;59491, 59650;Nord (59);Hauts-de-France;62067;7,8;Grande ville;27,5;2260\r\n" +
    "L'Haÿ-les-Roses;94038;94240;Val-de-Marne (94);Île-de-France;31000;12,0;Ville moyenne;3,9;7949\r\n";
  assert.equal(csv, expected);
  assert.equal(csv.charCodeAt(0), 0xfeff);
});

test('CSV : guillemets pour ; " et sauts de ligne', () => {
  assert.equal(csvEscape('a;b'), '"a;b"');
  assert.equal(csvEscape('dit "bonjour"'), '"dit ""bonjour"""');
  assert.equal(csvEscape('ligne 1\nligne 2'), '"ligne 1\nligne 2"');
  assert.equal(csvEscape("L'Haÿ"), "L'Haÿ");
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(0), '0');
});

test('CSV : plusieurs points de départ et colonnes supplémentaires', () => {
  const multi = [{ ...results[0], distances: [7.84, 30.12], distance: 30.12 }];
  const csv = resultsToCsv(multi, data, {
    pointNames: ['Lille', 'Arras'],
    extraColumns: [{ header: 'Note', value: () => 'à voir; vite' }],
  });
  const [header, row] = csv.slice(1).split('\r\n');
  assert.ok(header.includes('Distance max (km);Distance Lille (km);Distance Arras (km)'));
  assert.ok(header.endsWith(';Note'));
  assert.ok(row.includes(';30,1;7,8;30,1;'));
  assert.ok(row.endsWith(';"à voir; vite"'));
});

test('nom du fichier CSV', () => {
  assert.equal(csvFileName([{ name: 'Lille', radius: 30 }]), 'alentours-lille-30km.csv');
  assert.equal(
    csvFileName([
      { name: "Villeneuve-d'Ascq", radius: 20 },
      { name: 'Arras', radius: 12.5 },
    ]),
    'alentours-villeneuve-d-ascq-20km-arras-12,5km.csv'
  );
});

test('URL : encodage d’une commune', () => {
  const q = encodeSearch({
    points: [{ code: '59350', radius: 30 }],
    popMin: 10000,
    popMax: null,
    regions: [],
    departements: [],
    sort: { key: 'population', dir: 'desc' },
  });
  assert.equal(q, '?c=59350&r=30&pmin=10000&tri=population-desc');
});

test('URL : encodage d’un point sur la carte, filtres, tri par défaut omis', () => {
  const q = encodeSearch({
    points: [{ lat: 50.6292, lon: 3.0573, radius: 30 }],
    popMin: null,
    popMax: 50000,
    regions: ['32'],
    departements: ['59', '62'],
    sort: { key: 'distance', dir: 'asc' },
  });
  assert.equal(q, '?lat=50.62920&lon=3.05730&r=30&pmax=50000&reg=32&dep=59,62');
  assert.equal(encodeSearch({ points: [] }), '');
});

test('URL : aller-retour', () => {
  const state = {
    points: [{ code: '2A004', radius: 12.5 }],
    popMin: 2000,
    popMax: 100000,
    regions: ['94'],
    departements: ['2A'],
    sort: { key: 'nom', dir: 'desc' },
  };
  assert.deepEqual(decodeSearch(encodeSearch(state)), state);
});

test('URL : plusieurs points', () => {
  const state = {
    points: [
      { code: '59350', radius: 20 },
      { lat: 50.291, lon: 2.7775, radius: 15 },
    ],
  };
  const q = encodeSearch(state);
  assert.equal(q, '?pt=59350,20&pt=50.29100,2.77750,15');
  assert.deepEqual(decodeSearch(q), state);
});

test('URL : paramètres invalides ignorés sans erreur', () => {
  assert.deepEqual(decodeSearch('?c=abc&r=500&pmin=-3&pmax=dix&tri=taille&dep=<script>&foo=bar'), {});
  assert.deepEqual(decodeSearch('?c=59350&r=500'), { points: [{ code: '59350', radius: 20 }] });
  assert.deepEqual(decodeSearch('?lat=95&lon=3&r=10'), { radius: 10 });
  assert.deepEqual(decodeSearch('?c=99999&r=10', { isKnownCode: (c) => c === '59350' }), { radius: 10 });
  assert.deepEqual(decodeSearch(''), {});
  assert.deepEqual(decodeSearch('?pt=nimporte&pt=59350,10'), { points: [{ code: '59350', radius: 10 }] });
});

test('URL : budget et trajet maximal', () => {
  const state = {
    points: [{ code: '59350', radius: 25 }],
    budget: { budget: 300000, type: 'maison', surface: 110 },
    budgetOnly: true,
    driveMax: 30,
  };
  const q = encodeSearch(state);
  assert.equal(q, '?c=59350&r=25&budget=300000&bien=maison&surf=110&dansbudget=1&trajet=30');
  assert.deepEqual(decodeSearch(q), state);
  assert.deepEqual(decodeSearch('?c=59350&r=25&budget=abc&trajet=17&bien=chateau'), { points: [{ code: '59350', radius: 25 }] });
  assert.deepEqual(decodeSearch('?budget=250000&bien=appartement').budget, { budget: 250000, type: 'appartement', surface: null });
});
