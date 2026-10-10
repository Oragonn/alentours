// Télécharge la Base permanente des équipements (INSEE) et écrit
// data/equipements.json : par commune, le nombre d'écoles, collèges, lycées,
// crèches, médecins, pharmacies, supermarchés, boulangeries, bureaux de poste
// et gares.
//
// Usage : node scripts/build-amenities.mjs
// Source : plateforme Melodi de l'INSEE, jeu DS_BPE (dénombrement par commune).

import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unzip } from './lib/xlsx.mjs';
import { ARRONDISSEMENTS } from './lib/arrondissements.mjs';

const CATALOG_URL = 'https://api.insee.fr/melodi/catalog/DS_BPE';
const PAGE_URL = 'https://www.insee.fr/fr/statistiques/8217537';
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

// Indicateurs retenus → codes « type d'équipement » de la BPE
export const INDICATORS = {
  ecoles: ['C107', 'C108', 'C109'], // maternelle, primaire, élémentaire
  colleges: ['C201'],
  lycees: ['C301', 'C302', 'C303'], // général/techno, professionnel, agricole
  creches: ['D502'], // accueil du jeune enfant
  medecins: ['D265'], // médecins généralistes
  pharmacies: ['D307'],
  supermarches: ['B104', 'B105'], // hypermarchés et supermarchés
  boulangeries: ['B207'],
  poste: ['A206'],
  gares: ['E107', 'E108', 'E109'], // gares de voyageurs
};
export const FIELDS = Object.keys(INDICATORS);

async function csvUrl() {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`Catalogue INSEE : HTTP ${res.status}`);
  const json = await res.json();
  const products = json.product ?? json.distribution ?? [];
  const csv = products.find((p) => p.format === 'CSV' && /CSV_FR$/.test(p.accessURL ?? ''));
  if (!csv) throw new Error('Fichier CSV introuvable dans le catalogue DS_BPE');
  const year = json.temporal?.endPeriod?.slice(0, 4) ?? null;
  return { url: csv.accessURL, year };
}

async function main() {
  const { url, year } = await csvUrl();
  console.log(`Téléchargement : ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const files = unzip(Buffer.from(await res.arrayBuffer()));
  const name = [...files.keys()].find((n) => /_data\.csv$/i.test(n));
  if (!name) throw new Error('Données absentes de l’archive');
  const text = files.get(name).toString('utf8');

  const typeToField = new Map();
  for (const [field, codes] of Object.entries(INDICATORS)) for (const c of codes) typeToField.set(c, field);

  const lines = text.split(/\r?\n/);
  const header = lines[0].split(';').map((h) => h.replace(/"/g, ''));
  const iGeo = header.indexOf('GEO');
  const iObj = header.indexOf('GEO_OBJECT');
  const iType = header.indexOf('FACILITY_TYPE');
  const iMeasure = header.indexOf('BPE_MEASURE');
  const iValue = header.indexOf('OBS_VALUE');
  if ([iGeo, iObj, iType, iValue].some((i) => i < 0)) throw new Error(`Colonnes inattendues : ${header.join(', ')}`);

  const data = {};
  const add = (code, field, n) => {
    data[code] ??= FIELDS.map(() => 0);
    data[code][FIELDS.indexOf(field)] += n;
  };
  for (const line of lines.slice(1)) {
    if (!line.includes('"COM"') && !line.includes('"ARM"')) continue;
    const c = line.split(';').map((v) => v.replace(/"/g, ''));
    if (c[iObj] !== 'COM' && c[iObj] !== 'ARM') continue;
    if (iMeasure >= 0 && c[iMeasure] !== 'FACILITIES') continue;
    const field = typeToField.get(c[iType]);
    if (!field) continue;
    const n = Number(c[iValue]);
    if (!Number.isFinite(n) || n <= 0) continue;
    // Arrondissements (ARM) : seulement si la commune entière manque
    add(c[iObj] === 'ARM' ? `ARM:${c[iGeo]}` : c[iGeo], field, n);
  }
  for (const [re, commune] of ARRONDISSEMENTS) {
    const parts = Object.keys(data).filter((k) => k.startsWith('ARM:') && re.test(k.slice(4)));
    if (!data[commune] && parts.length) {
      data[commune] = FIELDS.map((_, i) => parts.reduce((s, k) => s + data[k][i], 0));
      console.log(`${commune} : somme de ${parts.length} arrondissements`);
    }
  }
  for (const k of Object.keys(data)) if (k.startsWith('ARM:')) delete data[k];

  const meta = {
    source: 'INSEE, Base permanente des équipements',
    annee: year,
    url: PAGE_URL,
    generated: new Date().toISOString().slice(0, 10),
  };
  const body = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, v]) => `${JSON.stringify(code)}:${JSON.stringify(v)}`)
    .join(',\n');
  const json = `{"meta":${JSON.stringify(meta)},"fields":${JSON.stringify(FIELDS)},"data":{\n${body}\n}}\n`;
  await writeFile(join(DATA_DIR, 'equipements.json'), json);
  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} Mo`;
  console.log(`Année : ${year} · ${Object.keys(data).length} communes écrites dans data/equipements.json`);
  console.log(`Taille : ${mb(Buffer.byteLength(json))} brut, ${mb(gzipSync(json).length)} gzip`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
