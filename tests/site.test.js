import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stampedHtml } from '../scripts/stamp.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index.html : langue, viewport, titre', () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<meta name="viewport"[^>]*width=device-width/);
  assert.match(html, /<title>Alentours<\/title>/);
});

test('index.html : empreintes des fichiers à jour (lancer « npm run stamp »)', () => {
  assert.equal(html.replace(/\r\n/g, '\n'), stampedHtml(html).replace(/\r\n/g, '\n'));
  // Chaque module est préchargé avec son empreinte et présent dans l'import map
  assert.match(html, /<script type="importmap">/);
  assert.match(html, /<script type="module" src="js\/app\.js\?v=[0-9a-f]{10}"><\/script>/);
});
