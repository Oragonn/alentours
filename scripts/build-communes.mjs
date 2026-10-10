// Télécharge toutes les communes françaises depuis geo.api.gouv.fr et écrit
// des fichiers statiques compacts dans data/ :
//   - data/communes.json      format en colonnes (voir encodeColumns)
//   - data/departements.json  code → nom
//   - data/regions.json       code → nom
//
// Usage : npm run data   (ou node scripts/build-communes.mjs)
// La variable d'environnement POPULATION_YEAR permet de préciser le millésime
// des populations légales (par défaut : année courante − 3, règle INSEE).

import { writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API_URL =
  'https://geo.api.gouv.fr/communes?fields=nom,code,codesPostaux,centre,surface,population,codeDepartement,departement,codeRegion,region&format=json';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

// Champs d'un enregistrement intermédiaire (avant passage en colonnes)
export const FIELDS = ['code', 'nom', 'lat', 'lon', 'population', 'surface', 'dep', 'reg', 'codesPostaux'];

// Précision : coordonnées à 4 décimales (≈ 11 m), surface au centième de km²
export const COORD_FACTOR = 1e4;
export const SURFACE_FACTOR = 100;

const delta = (values) => values.map((v, i) => (i ? v - values[i - 1] : v));

/**
 * Passe les enregistrements (triés par code) en colonnes, plus compactes une
 * fois compressées :
 *   dep, reg     codes département et région
 *   code         partie du code INSEE après le département, en entier,
 *                écart avec la commune précédente du même département
 *   nom, population
 *   lat, lon     entiers (× COORD_FACTOR), écart avec la commune précédente
 *   surface      entier (× SURFACE_FACTOR) ou null
 *   cp           codes postaux séparés par une espace
 * Le décodage est fait par prepareData() dans js/lib/commune.js.
 */
export function encodeColumns(records) {
  const col = (i) => records.map((r) => r[i]);
  const suffix = (r) => Number(r[0].slice(r[6].length));
  const code = records.map((r, i) => {
    if (!r[0].startsWith(r[6])) throw new Error(`Code ${r[0]} hors du département ${r[6]}`);
    const prev = records[i - 1];
    return prev && prev[6] === r[6] ? suffix(r) - suffix(prev) : suffix(r);
  });
  return {
    count: records.length,
    dep: col(6),
    reg: col(7),
    code,
    nom: col(1),
    population: col(4),
    lat: delta(col(2).map((v) => Math.round(v * COORD_FACTOR))),
    lon: delta(col(3).map((v) => Math.round(v * COORD_FACTOR))),
    surface: col(5).map((v) => (v == null ? null : Math.round(v * SURFACE_FACTOR))),
    cp: col(8).map((cps) => cps.join(' ')),
  };
}

const round = (value, decimals) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

export function toRecord(c) {
  const [lon, lat] = c.centre.coordinates;
  return [
    c.code,
    c.nom,
    round(lat, 5),
    round(lon, 5),
    Number.isFinite(c.population) ? c.population : null,
    // L'API renvoie la surface en hectares
    Number.isFinite(c.surface) ? round(c.surface / 100, 2) : null,
    c.codeDepartement ?? null,
    c.codeRegion ?? null,
    c.codesPostaux ?? [],
  ];
}

async function main() {
  console.log(`Téléchargement : ${API_URL}`);
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const raw = await res.json();
  console.log(`${raw.length} communes reçues`);

  const departements = {};
  const regions = {};
  const records = [];
  let skipped = 0;
  let noPopulation = 0;

  for (const c of raw) {
    if (c.departement?.code) departements[c.departement.code] = c.departement.nom;
    if (c.region?.code) regions[c.region.code] = c.region.nom;
    if (!c.centre?.coordinates) {
      skipped++;
      continue;
    }
    if (!Number.isFinite(c.population)) noPopulation++;
    records.push(toRecord(c));
  }

  records.sort((a, b) => a[0].localeCompare(b[0]));

  const now = new Date();
  const populationYear = Number(process.env.POPULATION_YEAR) || now.getFullYear() - 3;
  const meta = {
    source: 'INSEE / geo.api.gouv.fr',
    generated: now.toISOString().slice(0, 10),
    populationYear,
  };

  const sortKeys = (obj) =>
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));

  // Une colonne par ligne
  const columns = encodeColumns(records);
  const body = Object.entries(columns)
    .map(([key, values]) => `${JSON.stringify(key)}:${JSON.stringify(values)}`)
    .join(',\n');
  const format = { version: 2, coordFactor: COORD_FACTOR, surfaceFactor: SURFACE_FACTOR };
  const communesJson = `{"meta":${JSON.stringify(meta)},"format":${JSON.stringify(format)},\n${body}\n}\n`;

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, 'communes.json'), communesJson);
  await writeFile(join(DATA_DIR, 'departements.json'), JSON.stringify(sortKeys(departements), null, 1) + '\n');
  await writeFile(join(DATA_DIR, 'regions.json'), JSON.stringify(sortKeys(regions), null, 1) + '\n');

  const rawSize = Buffer.byteLength(communesJson);
  const gzSize = gzipSync(communesJson, { level: 9 }).length;
  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} Mo`;

  console.log(`${records.length} communes écrites dans data/communes.json`);
  console.log(`${skipped} communes ignorées (sans coordonnées de centre)`);
  console.log(`${noPopulation} communes sans population (conservées avec population null)`);
  console.log(`${Object.keys(departements).length} départements, ${Object.keys(regions).length} régions`);
  console.log(`Taille : ${mb(rawSize)} brut, ${mb(gzSize)} gzip`);
  if (gzSize > 2 * 1024 * 1024) {
    console.error('ATTENTION : communes.json dépasse 2 Mo compressé');
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
