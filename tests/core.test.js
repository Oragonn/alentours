import { test } from 'node:test';
import assert from 'node:assert/strict';

import { distanceKm, boundingBox, markerRadius, zonesOverlap } from '../js/lib/geo.js';
import { sizeCategory, density } from '../js/lib/commune.js';
import {
  normalize,
  formatNumber,
  formatKm,
  parseIntegerInput,
  parseDecimalInput,
  resultsCountLabel,
  slugify,
  formatCoords,
  NBSP,
} from '../js/lib/text.js';
import { MARKER } from '../js/config.js';

test('distanceKm : Lille → Arras ≈ 43 km', () => {
  const d = distanceKm(50.6292, 3.0573, 50.291, 2.7775);
  assert.ok(Math.abs(d - 43) <= 1, `distance obtenue : ${d}`);
});

test('distanceKm : même point = 0, symétrique', () => {
  assert.equal(distanceKm(48.85, 2.35, 48.85, 2.35), 0);
  const a = distanceKm(48.85, 2.35, 45.76, 4.83);
  const b = distanceKm(45.76, 4.83, 48.85, 2.35);
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.ok(Math.abs(a - 392) < 3, `Paris → Lyon : ${a}`);
});

test('boundingBox contient le cercle', () => {
  const box = boundingBox(50.63, 3.06, 30);
  for (let angle = 0; angle < 360; angle += 15) {
    // point à 29,9 km dans chaque direction (approximation locale)
    const rad = (angle * Math.PI) / 180;
    const lat = 50.63 + (29.9 / 111.195) * Math.cos(rad);
    const lon = 3.06 + (29.9 / (111.195 * Math.cos((lat * Math.PI) / 180))) * Math.sin(rad);
    assert.ok(lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon);
  }
  assert.equal(box.wrapsLon, false);
  assert.equal(boundingBox(-14, 179.9, 50).wrapsLon, true);
});

test('sizeCategory aux bornes', () => {
  assert.equal(sizeCategory(0), 'Village');
  assert.equal(sizeCategory(1999), 'Village');
  assert.equal(sizeCategory(2000), 'Petite ville');
  assert.equal(sizeCategory(9999), 'Petite ville');
  assert.equal(sizeCategory(10000), 'Ville moyenne');
  assert.equal(sizeCategory(49999), 'Ville moyenne');
  assert.equal(sizeCategory(50000), 'Grande ville');
  assert.equal(sizeCategory(2_000_000), 'Grande ville');
  assert.equal(sizeCategory(null), 'Inconnue');
  assert.equal(sizeCategory(undefined), 'Inconnue');
});

test('normalize ignore accents, tirets, apostrophes et espaces', () => {
  assert.equal(normalize('Saint-Étienne'), normalize('saint etienne'));
  assert.equal(normalize("L'Haÿ-les-Roses"), normalize('lhay les roses'));
  assert.equal(normalize('L’Haÿ-les-Roses'), normalize("l'hay-les-roses"));
  assert.equal(normalize('Œuilly'), 'oeuilly');
  assert.equal(normalize('ÉCULLY'), 'ecully');
  assert.ok(normalize('Villeneuve-d’Ascq').startsWith(normalize('villeneuve d as')));
});

test('formatNumber à la française', () => {
  assert.equal(formatNumber(12345), `12${NBSP}345`);
  assert.equal(formatNumber(1234567), `1${NBSP}234${NBSP}567`);
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(3.74, 1), '3,7');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(-3.1, 1), '−3,1');
  assert.equal(formatNumber(null), '');
  assert.equal(formatKm(3.74), `3,7${NBSP}km`);
  assert.equal(formatKm(11.25), `11,3${NBSP}km`);
});

test('saisies utilisateur', () => {
  assert.equal(parseIntegerInput('10 000'), 10000);
  assert.equal(parseIntegerInput('10000'), 10000);
  assert.equal(parseIntegerInput(` 10${NBSP}000 `), 10000);
  assert.equal(parseIntegerInput(''), null);
  assert.equal(parseIntegerInput('abc'), null);
  assert.equal(parseIntegerInput('-5'), null);
  assert.equal(parseDecimalInput('12,5'), 12.5);
  assert.equal(parseDecimalInput('12.5'), 12.5);
  assert.equal(parseDecimalInput('30'), 30);
  assert.equal(parseDecimalInput('x'), null);
  assert.equal(parseDecimalInput(''), null);
});

test('libellés divers', () => {
  assert.equal(resultsCountLabel(0), 'Aucune commune trouvée');
  assert.equal(resultsCountLabel(1), '1 commune trouvée');
  assert.equal(resultsCountLabel(127), '127 communes trouvées');
  assert.equal(resultsCountLabel(1500), `1${NBSP}500 communes trouvées`);
  assert.equal(slugify("Villeneuve-d'Ascq"), 'villeneuve-d-ascq');
  assert.equal(slugify('Saint-Étienne'), 'saint-etienne');
  assert.equal(formatCoords(50.62924, 3.05731), '50,6292 ; 3,0573');
});

test('densité', () => {
  assert.equal(density(98828, 13.2), 7487);
  assert.equal(density(null, 10), null);
  assert.equal(density(100, 0), null);
  assert.equal(density(100, null), null);
});

test('markerRadius : racine carrée bornée, agrandie en zoomant', () => {
  assert.equal(markerRadius(0, MARKER), MARKER.minPx);
  assert.equal(markerRadius(null, MARKER), MARKER.minPx);
  assert.equal(markerRadius(5_000_000, MARKER), MARKER.maxPx);
  // Zoom : pas d'agrandissement jusqu'à zoomFrom, puis plafonné à zoomMax
  assert.equal(markerRadius(0, MARKER, MARKER.zoomFrom), MARKER.minPx);
  assert.equal(markerRadius(0, MARKER, MARKER.zoomFrom + 2), MARKER.minPx * (1 + 2 * MARKER.zoomGrowth));
  assert.equal(markerRadius(0, MARKER, 18), MARKER.minPx * MARKER.zoomMax);
  const small = markerRadius(10000, MARKER);
  const big = markerRadius(100000, MARKER);
  assert.ok(small > 3 && big > small && big < 20);
});

test('zonesOverlap', () => {
  // Lille → Arras ≈ 43 km
  const lille = { lat: 50.6292, lon: 3.0573, radius: 25 };
  const arras = { lat: 50.291, lon: 2.7775, radius: 25 };
  assert.equal(zonesOverlap([lille, arras]), true);
  assert.equal(zonesOverlap([{ ...lille, radius: 20 }, { ...arras, radius: 20 }]), false);
  assert.equal(zonesOverlap([lille]), true);
});

test('noms sur la carte : seuil selon le zoom et sans chevauchement', async () => {
  const { labelMinPopulation, placeLabels } = await import('../js/lib/labels.js');
  const steps = [
    [8, 30000],
    [10, 2000],
  ];
  assert.equal(labelMinPopulation(6, steps), 30000);
  assert.equal(labelMinPopulation(9, steps), 2000);
  assert.equal(labelMinPopulation(12, steps), 0);
  const items = [
    { code: 'a', name: 'Petiteville', x: 100, y: 100, r: 4, population: 500 },
    { code: 'b', name: 'Grandeville', x: 102, y: 104, r: 10, population: 90000 },
    { code: 'c', name: 'Loin', x: 400, y: 300, r: 4, population: 100 },
    { code: 'd', name: 'Dehors', x: 2000, y: 100, r: 4, population: 1e6 },
  ];
  const placed = placeLabels(items, { width: 800, height: 600 });
  // La plus peuplée gagne en cas de chevauchement ; hors écran ignorée
  assert.deepEqual(placed.map((p) => p.code), ['b', 'c']);
  assert.equal(placeLabels(items, { width: 800, height: 600, maxCount: 1 }).length, 1);
});

test('cercles de distance : écart adapté au rayon', async () => {
  const { ringInterval, ringDistances } = await import('../js/lib/geo.js');
  const { RINGS } = await import('../js/config.js');
  assert.equal(ringInterval(4, RINGS), 1);
  assert.equal(ringInterval(20, RINGS), 5);
  assert.equal(ringInterval(30, RINGS), 10);
  assert.equal(ringInterval(100, RINGS), 25);
  assert.deepEqual(ringDistances(20, RINGS), [5, 10, 15]);
  assert.deepEqual(ringDistances(30, RINGS), [10, 20]);
  assert.deepEqual(ringDistances(12.5, RINGS), [5, 10]);
  assert.deepEqual(ringDistances(1, RINGS), []);
});

test('noms sur la carte : évitent les obstacles', async () => {
  const { placeLabels } = await import('../js/lib/labels.js');
  const items = [{ code: 'a', name: 'Évergnicourt', x: 100, y: 100, r: 4, population: 700 }];
  assert.equal(placeLabels(items, { width: 800, height: 600 }).length, 1);
  const obstacles = [{ left: 110, top: 92, width: 52, height: 20 }];
  assert.equal(placeLabels(items, { width: 800, height: 600, obstacles }).length, 0);
});

test('trajet max : saisie libre en minutes', async () => {
  const { formatMinutes, parseMinutesInput } = await import('../js/lib/text.js');
  assert.equal(parseMinutesInput('25'), 25);
  assert.equal(parseMinutesInput(' 45 min '), 45);
  assert.equal(parseMinutesInput('1h30'), 90);
  assert.equal(parseMinutesInput('1 h'), 60);
  assert.equal(parseMinutesInput(''), null);
  assert.equal(parseMinutesInput('vingt'), null);
  assert.equal(formatMinutes(25), '25 min');
  assert.equal(formatMinutes(60), '1 h');
  assert.equal(formatMinutes(95), '1 h 35');
});
