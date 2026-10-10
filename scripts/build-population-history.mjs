// Télécharge l'historique des populations communales (INSEE, recensements
// 1876-…) et écrit data/population-trend.json :
//   { meta, years: [1982, …, 2023], data: { "59350": [p1982, …, p2023] } }
//
// Usage : node scripts/build-population-history.mjs
// La page source est https://www.insee.fr/fr/statistiques/3698339 ; si le nom
// du fichier change (nouveau millésime), le script le retrouve sur la page.

import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readSheet, unzip } from './lib/xlsx.mjs';
import { ARRONDISSEMENTS } from './lib/arrondissements.mjs';

const PAGE_URL = 'https://www.insee.fr/fr/statistiques/3698339';
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; alentours-data-script)' };

// Années conservées : une série courte pour la courbe ; la tendance compare
// la dernière année à celle d'environ 10 ans plus tôt.
const WANTED_OFFSETS = [0, 5, 10, 15, 24, 33, 41];

async function findFileUrl() {
  const res = await fetch(PAGE_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`Page INSEE : HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/\/fr\/statistiques\/fichier\/3698339\/[^"']+\.xlsx/);
  if (!match) throw new Error('Lien du fichier xlsx introuvable sur la page INSEE');
  return new URL(match[0], PAGE_URL).href;
}

async function main() {
  const url = await findFileUrl();
  console.log(`Téléchargement : ${url}`);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const files = unzip(Buffer.from(await res.arrayBuffer()));
  const rows = readSheet(files, 'xl/worksheets/sheet1.xml');

  const headerIndex = rows.findIndex((r) => r[0] === 'Code géographique');
  if (headerIndex < 0) throw new Error('Ligne d’en-tête introuvable');
  const header = rows[headerIndex];
  const yearColumns = new Map();
  header.forEach((h, i) => {
    const m = /Population en (\d{4})/.exec(h ?? '');
    if (m) yearColumns.set(Number(m[1]), i);
  });
  const latest = Math.max(...yearColumns.keys());
  // Pour chaque écart voulu, l'année disponible la plus proche
  const available = [...yearColumns.keys()];
  const years = [
    ...new Set(
      WANTED_OFFSETS.map((off) =>
        available.reduce((best, y) => (Math.abs(y - (latest - off)) < Math.abs(best - (latest - off)) ? y : best))
      )
    ),
  ].sort((a, b) => a - b);
  console.log(`Années retenues : ${years.join(', ')}`);

  const data = {};
  let count = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const code = row[0];
    if (typeof code !== 'string' || !/^[0-9][0-9AB][0-9]{3}$/.test(code)) continue;
    const values = years.map((y) => {
      const v = row[yearColumns.get(y)];
      return Number.isFinite(v) ? Math.round(v) : null;
    });
    if (values.filter((v) => v != null).length < 2) continue;
    data[code] = values;
    count++;
  }

  // Paris (et parfois Lyon, Marseille) n'apparaît que par arrondissement :
  // la commune reçoit la somme de ses arrondissements.
  for (const [arrRe, commune] of ARRONDISSEMENTS) {
    if (data[commune]) continue;
    const parts = Object.keys(data).filter((code) => arrRe.test(code));
    if (!parts.length) continue;
    data[commune] = years.map((_, i) =>
      parts.every((code) => data[code][i] != null) ? parts.reduce((sum, code) => sum + data[code][i], 0) : null
    );
    count++;
    console.log(`${commune} : somme de ${parts.length} arrondissements`);
  }
  for (const [arrRe] of ARRONDISSEMENTS) {
    for (const code of Object.keys(data)) if (arrRe.test(code)) delete data[code];
  }

  const meta = {
    source: 'INSEE, recensements de la population (historique des populations communales)',
    url: PAGE_URL,
    generated: new Date().toISOString().slice(0, 10),
  };
  const body = Object.entries(data)
    .map(([code, values]) => `${JSON.stringify(code)}:${JSON.stringify(values)}`)
    .join(',\n');
  const json = `{"meta":${JSON.stringify(meta)},"years":${JSON.stringify(years)},"data":{\n${body}\n}}\n`;
  await writeFile(join(DATA_DIR, 'population-trend.json'), json);
  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} Mo`;
  console.log(`${Object.keys(data).length} communes écrites dans data/population-trend.json`);
  console.log(`Taille : ${mb(Buffer.byteLength(json))} brut, ${mb(gzipSync(json).length)} gzip`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
