import { test } from 'node:test';
import assert from 'node:assert/strict';

import { filterFolders, filterResults, filterSavedCities, matchesWords, queryWords } from '../js/lib/filter.js';

const departements = { 42: 'Loire', 69: 'Rhône' };
const stEtienne = { code: '42218', nom: 'Saint-Étienne', dep: '42', codesPostaux: ['42000', '42100'] };
const lyon = { code: '69123', nom: 'Lyon', dep: '69', codesPostaux: ['69001'] };
const byCode = new Map([stEtienne, lyon].map((c) => [c.code, c]));

test('queryWords : mots normalisés, vides ignorés', () => {
  assert.deepEqual(queryWords('  Saint-Étienne,  LOIRE '), ['saintetienne', 'loire']);
  assert.deepEqual(queryWords('   '), []);
  assert.deepEqual(queryWords(null), []);
});

test('matchesWords : chaque mot dans un des textes', () => {
  assert.ok(matchesWords([], ['x']));
  assert.ok(matchesWords(queryWords('etienne loire'), ['Saint-Étienne', 'Loire']));
  assert.ok(!matchesWords(queryWords('etienne rhone'), ['Saint-Étienne', 'Loire']));
  assert.ok(matchesWords(queryWords('saint etienne'), ['Saint-Étienne']));
});

test('filterResults : nom, département, code postal', () => {
  const results = [{ commune: stEtienne }, { commune: lyon }];
  assert.equal(filterResults(results, '', departements), results);
  assert.deepEqual(filterResults(results, 'étien', departements), [results[0]]);
  assert.deepEqual(filterResults(results, 'rhone', departements), [results[1]]);
  assert.deepEqual(filterResults(results, '42100', departements), [results[0]]);
  assert.deepEqual(filterResults(results, 'paris', departements), []);
});

test('filterSavedCities : nom, note, statut et commune', () => {
  const items = [
    { code: '42218', nom: 'Saint-Étienne', note: 'Gare TER, marché', statut: 'retenu' },
    { code: '69123', nom: 'Lyon', note: '' },
  ];
  const ctx = { byCode, departements };
  assert.deepEqual(filterSavedCities(items, 'marche', ctx), [items[0]]);
  assert.deepEqual(filterSavedCities(items, 'retenu', ctx), [items[0]]);
  assert.deepEqual(filterSavedCities(items, '69', ctx), [items[1]]);
  // Sans les données des communes, le nom enregistré suffit
  assert.deepEqual(filterSavedCities(items, 'lyon'), [items[1]]);
});

test('filterFolders : nom, client et communes du dossier', () => {
  const folders = [
    { id: 'a', nom: 'Projet campagne', fiche: { client: 'M. et Mme Martin' }, villes: [{ nom: 'Lyon' }] },
    { id: 'b', nom: 'Investissement', villes: [{ nom: 'Saint-Étienne' }] },
  ];
  const citiesOf = (f) => f.villes;
  assert.deepEqual(filterFolders(folders, 'martin', citiesOf), [folders[0]]);
  assert.deepEqual(filterFolders(folders, 'etienne', citiesOf), [folders[1]]);
  assert.deepEqual(filterFolders(folders, 'projet lyon', citiesOf), [folders[0]]);
  assert.deepEqual(filterFolders(folders, 'projet etienne', citiesOf), []);
});
