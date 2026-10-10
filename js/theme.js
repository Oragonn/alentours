// Thème clair / sombre / automatique.

import { STORAGE_KEYS } from './config.js';
import { load, save } from './storage.js';

const CHOICES = ['clair', 'sombre', 'auto'];
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

let choice = CHOICES.includes(load(STORAGE_KEYS.theme)) ? load(STORAGE_KEYS.theme) : 'auto';

/** Thème réellement affiché : 'light' ou 'dark'. */
export function effectiveTheme() {
  if (choice === 'clair') return 'light';
  if (choice === 'sombre') return 'dark';
  return media.matches ? 'dark' : 'light';
}

function apply() {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', effectiveTheme());
  for (const fn of listeners) fn(effectiveTheme());
}

export function onThemeChange(fn) {
  listeners.add(fn);
}

export function initThemeControl(radios) {
  for (const radio of radios) {
    radio.checked = radio.value === choice;
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      choice = radio.value;
      save(STORAGE_KEYS.theme, choice);
      apply();
    });
  }
  // « Automatique » suit le système en direct
  media.addEventListener('change', () => {
    if (choice === 'auto') apply();
  });
  apply();
}
