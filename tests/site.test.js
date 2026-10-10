import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index.html : langue, viewport, titre', () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<meta name="viewport"[^>]*width=device-width/);
  assert.match(html, /<title>Alentours<\/title>/);
});

test('index.html : chaque module JS est préchargé (modulepreload)', () => {
  const files = [];
  for (const dir of ['js', 'js/lib', 'js/ui']) {
    for (const name of readdirSync(new URL(`../${dir}/`, import.meta.url))) {
      if (name.endsWith('.js')) files.push(`${dir}/${name}`);
    }
  }
  for (const file of files) {
    assert.ok(html.includes(`<link rel="modulepreload" href="${file}">`), `modulepreload manquant : ${file}`);
  }
});
