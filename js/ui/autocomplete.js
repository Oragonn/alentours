// Champ « Ville ou code postal » avec suggestions (combobox accessible).

import { communeLabel } from '../lib/commune.js';
import { formatNumber } from '../lib/text.js';

let uid = 0;

/**
 * @param {HTMLInputElement} input
 * @param {HTMLUListElement} listbox
 * @param {object} options { getData(), suggest(query), onSelect(commune) }
 */
export function attachAutocomplete(input, listbox, { getData, suggest, onSelect }) {
  const id = `ac-${++uid}`;
  let items = [];
  let active = -1;
  let lastResult = null;

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listbox.id);
  listbox.setAttribute('role', 'listbox');

  function close() {
    listbox.hidden = true;
    listbox.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    items = [];
    active = -1;
  }

  function setActive(index) {
    active = index;
    listbox.querySelectorAll('[role="option"]').forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === active));
      if (i === active) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      }
    });
    if (active < 0) input.removeAttribute('aria-activedescendant');
  }

  function render(result) {
    lastResult = result;
    items = result.items;
    active = -1;
    listbox.innerHTML = '';
    if (!items.length && !result.empty) {
      close();
      return;
    }
    const data = getData();
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 's-empty';
      li.textContent = result.empty;
      li.setAttribute('aria-disabled', 'true');
      listbox.append(li);
    }
    items.forEach((c, i) => {
      const li = document.createElement('li');
      li.id = `${id}-opt-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.dataset.index = i;
      const name = document.createElement('span');
      name.className = 's-name';
      // « Saint-Martin (Charente-Maritime, 17) »
      name.textContent = communeLabel(c, data.departements);
      const meta = document.createElement('span');
      meta.className = 's-meta';
      meta.textContent = Number.isFinite(c.population) ? `${formatNumber(c.population)} hab.` : '';
      li.append(name, meta);
      listbox.append(li);
    });
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function choose(index) {
    const commune = items[index];
    if (!commune) return;
    close();
    onSelect(commune);
  }

  input.addEventListener('input', () => {
    if (!getData()) return;
    render(suggest(input.value));
  });

  input.addEventListener('focus', () => {
    // Sélectionne le texte pour pouvoir taper directement une autre ville
    if (input.value) requestAnimationFrame(() => input.select());
  });

  input.addEventListener('keydown', (e) => {
    const open = !listbox.hidden && items.length > 0;
    switch (e.key) {
      case 'ArrowDown':
        if (!open && getData() && input.value) render(suggest(input.value));
        if (items.length) setActive((active + 1) % items.length);
        e.preventDefault();
        break;
      case 'ArrowUp':
        if (items.length) setActive(active <= 0 ? items.length - 1 : active - 1);
        e.preventDefault();
        break;
      case 'Enter':
        e.preventDefault();
        if (!open) {
          // Entrée sans liste ouverte : recalcule (ex. code postal collé)
          if (getData() && input.value) {
            const result = suggest(input.value);
            if (result.items.length === 1) {
              items = result.items;
              choose(0);
            } else render(result);
          }
          break;
        }
        if (active >= 0) choose(active);
        else if (items.length === 1 || lastResult?.kind === 'name') choose(0);
        break;
      case 'Escape':
        if (!listbox.hidden) {
          close();
          e.preventDefault();
          e.stopPropagation();
        }
        break;
      case 'Tab':
        close();
        break;
      default:
    }
  });

  // mousedown plutôt que click : le champ garde le focus
  listbox.addEventListener('mousedown', (e) => e.preventDefault());
  listbox.addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li) choose(Number(li.dataset.index));
  });

  input.addEventListener('blur', () => setTimeout(close, 120));

  return { close };
}
