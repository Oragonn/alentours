// Ajoute une empreinte (?v=…) aux URL des fichiers du site dans index.html.
//
// Pourquoi : GitHub Pages laisse les navigateurs garder chaque fichier
// 10 minutes en cache. Juste après une mise en ligne, un navigateur pouvait
// mélanger la nouvelle page et un ancien script, et rester bloqué sur
// « Chargement des communes… ». Avec une empreinte qui change dès que le
// contenu change, une nouvelle page demande toujours les bons fichiers.
//
// Usage : npm run stamp   (avant chaque commit qui modifie js/, css/ ou data/)
// `npm test` échoue si index.html n'est pas à jour.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const START = '<!-- assets:start';
const END = '<!-- assets:end -->';

export const DATA_FILES = [
  'data/communes.json',
  'data/departements.json',
  'data/regions.json',
  'data/population-trend.json',
  'data/prix.json',
  'data/equipements.json',
];

/** Empreinte courte du contenu (fins de ligne normalisées). */
export function fingerprint(path) {
  const text = readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text).digest('hex').slice(0, 10);
}

export function moduleFiles() {
  const files = [];
  for (const dir of ['js', 'js/lib', 'js/ui']) {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      if (name.endsWith('.js')) files.push(`${dir}/${name}`);
    }
  }
  // app.js en premier
  return ['js/app.js', ...files.filter((f) => f !== 'js/app.js')];
}

/** Bloc à insérer dans <head>. */
export function assetsBlock() {
  const modules = moduleFiles();
  const v = (f) => `${f}?v=${fingerprint(f)}`;
  const imports = Object.fromEntries(modules.map((f) => [`./${f}`, `./${v(f)}`]));
  const data = Object.fromEntries(DATA_FILES.map((f) => [f, fingerprint(f)]));
  return [
    `${START} : généré par « npm run stamp », ne pas modifier à la main -->`,
    `  <link rel="stylesheet" href="${v('css/style.css')}">`,
    `  <script type="importmap">${JSON.stringify({ imports })}</script>`,
    `  <script type="application/json" id="asset-versions">${JSON.stringify(data)}</script>`,
    // Données indispensables : téléchargées pendant le chargement du code
    ...['data/communes.json', 'data/departements.json', 'data/regions.json'].map(
      (f) => `  <link rel="preload" href="${f}?v=${data[f]}" as="fetch" crossorigin>`
    ),
    ...modules.map((f) => `  <link rel="modulepreload" href="${v(f)}">`),
    `  ${END}`,
  ].join('\n');
}

/** index.html avec le bloc et le script principal à jour. */
export function stampedHtml(html) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < 0) throw new Error('Marqueurs assets:start / assets:end absents de index.html');
  const out = html.slice(0, start) + assetsBlock() + html.slice(end + END.length);
  return out.replace(/src="js\/app\.js(\?v=[0-9a-f]+)?"/, `src="js/app.js?v=${fingerprint('js/app.js')}"`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = join(ROOT, 'index.html');
  const html = readFileSync(path, 'utf8');
  const next = stampedHtml(html);
  if (next === html) console.log('index.html déjà à jour');
  else {
    writeFileSync(path, next);
    console.log('index.html mis à jour');
  }
}
