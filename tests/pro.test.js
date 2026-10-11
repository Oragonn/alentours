import { test } from 'node:test';
import assert from 'node:assert/strict';

import { amenityCounts, amenityList, amenitySummary } from '../js/lib/amenities.js';
import { budgetCheck, budgetIsSet, formatEuros, priceReliability } from '../js/lib/budget.js';
import { directionsUrl, nearGeometry, pointInGeometry, visitOrder } from '../js/lib/geo.js';
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

test('zone de trajet : point proche du bord', () => {
  // Carré d'environ 1,1 km de côté vers l'équateur
  const square = { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]] };
  assert.equal(nearGeometry(0.005, 0.005, square, 0), true, 'dedans');
  assert.equal(nearGeometry(0.005, 0.015, square, 0.5), false, 'à 0,56 km');
  assert.equal(nearGeometry(0.005, 0.015, square, 0.6), true);
  assert.equal(nearGeometry(0.015, 0.015, square, 0.6), false, 'coin à 0,79 km');
  assert.equal(nearGeometry(0.015, 0.015, square, 0.8), true);
  assert.equal(nearGeometry(0.005, 0.015, null, 10), false);
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

test('fiche client : zone de recherche (ville + rayon)', async () => {
  const { cleanBrief } = await import('../js/lib/folders.js');
  const b = cleanBrief({ client: 'Martin', zoneCode: '59350', zoneNom: 'Lille', zoneRayon: 25 });
  assert.deepEqual([b.zoneCode, b.zoneNom, b.zoneRayon], ['59350', 'Lille', 25]);
  const bad = cleanBrief({ zoneCode: 'abc', zoneNom: 'X', zoneRayon: 10 });
  assert.deepEqual([bad.zoneCode, bad.zoneNom, bad.zoneRayon], [null, '', 10], 'code invalide : seul le rayon reste');
  assert.equal(cleanBrief({ zoneCode: 'abc', zoneNom: 'X' }), null, 'code invalide : rien à garder');
  assert.equal(cleanBrief({ client: 'A', zoneCode: '59350', zoneRayon: 500 }).zoneRayon, null);
  assert.equal(cleanBrief({ client: 'A', zoneCode: '59350', zoneRayon: 12.34 }).zoneRayon, 12.3);
  assert.equal(cleanBrief({ client: 'A', zoneNom: 'Lille' }).zoneNom, '', 'nom sans code ignoré');
});

test('fiche client : population et trajet max', async () => {
  const { cleanBrief } = await import('../js/lib/folders.js');
  const { briefDriveText, briefPopulationText } = await import('../js/ui/views.js');
  const b = cleanBrief({ popMin: 2000, popMax: 20000, trajetMax: 30, zoneCode: '59350', zoneNom: 'Lille', zoneRayon: 25 });
  assert.equal(b.popMin, 2000);
  assert.equal(b.popMax, 20000);
  assert.equal(b.trajetMax, 30);
  const swapped = cleanBrief({ popMin: 9000, popMax: 1000 });
  assert.deepEqual([swapped.popMin, swapped.popMax], [1000, 9000], 'bornes inversées');
  assert.equal(cleanBrief({ client: 'A', trajetMax: 25 }).trajetMax, 25, 'durée libre');
  assert.equal(cleanBrief({ client: 'A', trajetMax: 500 }).trajetMax, null, 'durée hors limites');
  assert.equal(cleanBrief({ popMin: -5 }), null);
  assert.equal(briefPopulationText(b), '2 000 à 20 000 habitants');
  assert.equal(briefPopulationText({ popMax: 500 }), '500 habitants ou moins');
  assert.equal(briefDriveText(b), '30 min max en voiture depuis Lille');
  assert.equal(briefDriveText({ trajetMax: 60 }), '1 h max en voiture');
  assert.equal(briefDriveText({ trajetMax: 90 }), '1 h 30 max en voiture');
  assert.equal(briefDriveText({}), '');
});

test('fiche client : zone sur une adresse, rayon seul', async () => {
  const { briefHasZone, cleanBrief } = await import('../js/lib/folders.js');
  const { briefZoneText } = await import('../js/ui/views.js');
  const b = cleanBrief({ zoneNom: '12 Rue de Vesle 51100 Reims', zoneLat: 49.2526354, zoneLon: 4.0265371, zoneRayon: 15 });
  assert.deepEqual([b.zoneCode, b.zoneLat, b.zoneLon], [null, 49.25264, 4.02654]);
  assert.ok(briefHasZone(b));
  assert.equal(briefZoneText(b), '15 km autour de 12 Rue de Vesle 51100 Reims');
  assert.equal(cleanBrief({ zoneLat: 49, zoneLon: 4 }), null, 'adresse sans nom ignorée');
  const r = cleanBrief({ zoneRayon: 30 });
  assert.ok(!briefHasZone(r));
  assert.equal(briefZoneText(r), 'Rayon de 30 km');
});

test('géocodage : saisies qui ressemblent à une adresse', async () => {
  const { looksLikeAddress } = await import('../js/geocode.js');
  assert.ok(looksLikeAddress('12 rue de Vesle'));
  assert.ok(looksLikeAddress('chemin des Vignes'));
  assert.ok(looksLikeAddress('Allées Jean Jaurès'));
  assert.ok(looksLikeAddress('la Grange aux Bois', false), 'aucune commune trouvée');
  assert.ok(!looksLikeAddress('Lille'));
  assert.ok(!looksLikeAddress('Saint Brice'));
  assert.ok(!looksLikeAddress('59000'));
});

test('itinéraire : ordre le plus court (exact jusqu’à 12 communes, 2-opt au-delà)', async () => {
  const { visitOrder, distanceKm } = await import('../js/lib/geo.js');
  const len = (s, o) => o.reduce((acc, p, i) => acc + distanceKm((i ? o[i - 1] : s).lat, (i ? o[i - 1] : s).lon, p.lat, p.lon), 0);
  // Le plus proche voisin irait d'abord à « pres » puis reviendrait en arrière
  const start = { lat: 50, lon: 3 };
  const places = [
    { id: 'pres', lat: 50, lon: 3.01 },
    { id: 'derriere', lat: 50, lon: 2.985 },
    { id: 'loin', lat: 50, lon: 3.03 },
  ];
  assert.deepEqual(visitOrder(start, places).map((p) => p.id), ['derriere', 'pres', 'loin']);
  assert.deepEqual(visitOrder(start, []), []);
  assert.equal(visitOrder(null, [places[0]]).length, 1);
  // Comparaison avec tous les ordres possibles (8 communes)
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: 8 }, (_, i) => ({ id: i, lat: 50 + rnd() * 0.3, lon: 3 + rnd() * 0.4 }));
  let best = Infinity;
  const perm = (rest, cur, d) => {
    if (d >= best) return;
    if (!rest.length) return void (best = d);
    rest.forEach((p, i) => perm([...rest.slice(0, i), ...rest.slice(i + 1)], p, d + distanceKm(cur.lat, cur.lon, p.lat, p.lon)));
  };
  perm(pts, start, 0);
  const order = visitOrder(start, pts);
  assert.equal(order.length, 8);
  assert.ok(Math.abs(len(start, order) - best) < 1e-9, 'ordre optimal');
  // Au-delà de 12 : toutes les communes, une seule fois
  const many = Array.from({ length: 20 }, (_, i) => ({ id: i, lat: 50 + rnd() * 0.5, lon: 3 + rnd() * 0.5 }));
  const big = visitOrder(start, many);
  assert.deepEqual(big.map((p) => p.id).sort((a, b) => a - b), many.map((p) => p.id));
});
