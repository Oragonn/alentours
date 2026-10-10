import { test } from 'node:test';
import assert from 'node:assert/strict';

import { amenityCounts, amenityList, amenitySummary } from '../js/lib/amenities.js';
import { budgetCheck, budgetIsSet, formatEuros, priceReliability } from '../js/lib/budget.js';
import { directionsUrl, pointInGeometry, visitOrder } from '../js/lib/geo.js';
import {
  addToFolder,
  createFolder,
  findFolder,
  folderCities,
  mergeFolders,
  setFolderBrief,
  setFolderStatus,
} from '../js/lib/folders.js';
import { exportUserData, parseUserDataFile } from '../js/lib/userdata.js';

const t = (m) => new Date(Date.UTC(2026, 9, 11, 12, m));
const FIELDS = ['ecoles', 'colleges', 'lycees', 'creches', 'medecins', 'pharmacies', 'supermarches', 'boulangeries', 'poste', 'gares'];

test('équipements : comptes, liste, résumé', () => {
  const counts = amenityCounts([4, 1, 0, 2, 9, 3, 2, 5, 1, 1], FIELDS);
  assert.equal(counts.ecoles, 4);
  assert.deepEqual(amenityList(counts).slice(0, 2).map((a) => a.text), ['4 écoles', '1 collège']);
  assert.equal(amenitySummary(counts), '4 écoles · 1 collège · 9 médecins généralistes · gare');
  const none = amenityCounts(null, FIELDS);
  assert.equal(none.gares, 0);
  assert.equal(amenitySummary(none), 'Aucun de ces équipements');
  assert.equal(amenitySummary(amenityCounts([0, 0, 0, 0, 0, 0, 0, 0, 0, 3], FIELDS)), '3 gares');
});

test('budget : estimation, marge, fiabilité, départements non couverts', () => {
  const b = { budget: 300000, type: 'maison', surface: 110 };
  assert.ok(budgetIsSet(b));
  assert.ok(!budgetIsSet({ budget: 300000, type: 'maison' }));
  const entry = (prix, ventes) => ({ maison: { prix, ventes }, appartement: { prix: null, ventes: 0 } });
  const ok = budgetCheck(entry(2500, 150), '59', b);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.estimate, 275000);
  assert.equal(ok.reliability.id, 'bonne');
  assert.equal(budgetCheck(entry(2900, 30), '59', b).status, 'limite'); // 319 000 € ≤ 330 000 €
  assert.equal(budgetCheck(entry(3100, 30), '59', b).status, 'trop');
  assert.equal(budgetCheck(entry(2500, 3), '59', b).status, 'inconnu');
  assert.equal(budgetCheck(entry(2500, 150), '67', b).reason, 'Non couvert par DVF');
  assert.equal(budgetCheck(entry(2500, 150), '59', { ...b, type: 'appartement' }).status, 'inconnu');
  assert.equal(budgetCheck(entry(2500, 150), '59', {}), null);
  assert.equal(priceReliability(10).id, 'fragile');
  assert.equal(priceReliability(50).id, 'correcte');
  assert.equal(formatEuros(274600), '275 k€');
  assert.equal(formatEuros(1240000), '1,2 M€');
});

test('zone de trajet : point dans un polygone (avec trou) ou multipolygone', () => {
  const square = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  assert.equal(pointInGeometry(2, 2, square), true);
  assert.equal(pointInGeometry(5, 5, square), false, 'dans le trou');
  assert.equal(pointInGeometry(12, 2, square), false);
  const multi = { type: 'MultiPolygon', coordinates: [square.coordinates, [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]] };
  assert.equal(pointInGeometry(25, 25, multi), true);
  assert.equal(pointInGeometry(1, 1, null), false);
});

test('itinéraire de visite : ordre du plus proche voisin et lien Google Maps', () => {
  const start = { lat: 50, lon: 3 };
  const places = [{ id: 'loin', lat: 50.5, lon: 3 }, { id: 'pres', lat: 50.1, lon: 3 }, { id: 'milieu', lat: 50.3, lon: 3 }];
  assert.deepEqual(visitOrder(start, places).map((p) => p.id), ['pres', 'milieu', 'loin']);
  const link = directionsUrl(start, visitOrder(start, places));
  assert.equal(link.count, 3);
  assert.equal(link.truncated, false);
  const u = new URL(link.url);
  assert.equal(u.searchParams.get('origin'), '50.00000,3.00000');
  assert.equal(u.searchParams.get('destination'), '50.50000,3.00000');
  assert.equal(u.searchParams.get('waypoints'), '50.10000,3.00000|50.30000,3.00000');
  const many = Array.from({ length: 14 }, (_, i) => ({ lat: 50 + i / 100, lon: 3 }));
  const capped = directionsUrl(start, many);
  assert.equal(capped.count, 10);
  assert.equal(capped.truncated, true);
  assert.equal(directionsUrl(start, []), null);
});

test('dossier client : fiche, statuts, fusion et export', () => {
  let folders = createFolder([], 'Famille Martin', t(0), 'd1').folders;
  folders = addToFolder(folders, 'd1', { code: '59560', nom: 'Seclin' }, t(1));
  folders = setFolderBrief(folders, 'd1', { client: 'M. et Mme Martin', budget: 300000, type: 'maison', surface: 110, criteres: 'école à pied' }, t(2));
  folders = setFolderStatus(folders, 'd1', '59560', 'retenu', t(3));
  const f = findFolder(folders, 'd1');
  assert.equal(f.fiche.budget, 300000);
  assert.equal(folderCities(f)[0].statut, 'retenu');
  assert.equal(folderCities(findFolder(setFolderStatus(folders, 'd1', '59560', null, t(4)), 'd1'))[0].statut, undefined);
  assert.equal(findFolder(setFolderBrief(folders, 'd1', {}, t(5)), 'd1').fiche, undefined);
  // Fusion : statut et fiche les plus récents gagnent
  const other = setFolderStatus(folders, 'd1', '59560', 'ecarte', t(10));
  assert.equal(folderCities(findFolder(mergeFolders(folders, other, t(11)), 'd1'))[0].statut, 'ecarte');
  // Export / import
  const parsed = parseUserDataFile(JSON.stringify(exportUserData({ items: [], dossiers: folders }, t(6))));
  assert.equal(parsed.dossiers[0].fiche.client, 'M. et Mme Martin');
  assert.equal(parsed.dossiers[0].villes[0].statut, 'retenu');
});

test('tri par prix : inconnus en dernier', async () => {
  const { sortResults, parseSort } = await import('../js/lib/sort.js');
  const r = (nom, prix) => ({ commune: { nom, prix }, distance: 1 });
  const list = [r('A', 3000), r('B', null), r('C', 2000)];
  const opts = { priceOf: (c) => c.prix };
  assert.deepEqual(sortResults(list, 'prix', 'asc', opts).map((x) => x.commune.nom), ['C', 'A', 'B']);
  assert.deepEqual(sortResults(list, 'prix', 'desc', opts).map((x) => x.commune.nom), ['A', 'C', 'B']);
  assert.deepEqual(parseSort('prix-asc'), { key: 'prix', dir: 'asc' });
});
