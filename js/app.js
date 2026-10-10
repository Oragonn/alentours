// Point d'entrée : relie les données, le formulaire, la liste et la carte.

import {
  APP_NAME,
  LIST_PAGE_SIZE,
  MAX_STARTING_POINTS,
  POINT_COLORS,
  RADIUS,
  SEARCH_DEBOUNCE_MS,
  STORAGE_KEYS,
} from './config.js';
import { loadData, loadInsights } from './data.js';
import { communeLabel, departementLabel, sizeCategory } from './lib/commune.js';
import { communeColumns, toCsv } from './lib/csv.js';
import {
  exportFavorites,
  isFavorite,
  mergeFavorites,
  parseFavoritesFile,
  readStoredFavorites,
  removeFavorite,
  setNote,
  toggleFavorite,
  toStoredFavorites,
} from './lib/favorites.js';
import { distanceKm, zonesOverlap } from './lib/geo.js';
import { priceInfo, trendText } from './lib/insights.js';
import { adminFacets, filterByAdmin, searchArea, validatePopulation } from './lib/search.js';
import { sortResults } from './lib/sort.js';
import { suggest } from './lib/suggest.js';
import { searchSummary } from './lib/summary.js';
import { formatCoords, formatNumber, parseDecimalInput, parseIntegerInput, resultsCountLabel } from './lib/text.js';
import { decodeSearch, encodeSearch } from './lib/url.js';
import { MapView } from './map.js';
import { load, loadJson, save, saveJson } from './storage.js';
import { effectiveTheme, initThemeControl, onThemeChange } from './theme.js';
import { attachAutocomplete } from './ui/autocomplete.js';
import { downloadFile, h } from './ui/dom.js';
import { createSheet } from './ui/sheet.js';
import { detailsContent, favoriteRow, printContent, resultRow } from './ui/views.js';

const $ = (id) => document.getElementById(id);

// ---- État ----------------------------------------------------------------

let data = null;
let insights = { trendLoaded: false, pricesLoaded: false, trend: null, prices: null };
let nextPointId = 1;

const newPoint = (radius = RADIUS.default) => ({
  id: nextPointId++,
  commune: null,
  lat: null,
  lon: null,
  radius,
  name: '',
});

const state = {
  points: [newPoint()],
  active: 0,
  popMin: null,
  popMax: null,
  popError: null,
  regions: [],
  departements: [],
  sort: { key: 'distance', dir: 'asc' },
  rings: load(STORAGE_KEYS.rings) === '1',
  view: 'results',
  selected: null,
  shown: LIST_PAGE_SIZE,
};

let areaResults = [];
let results = [];
let resultIndex = new Map();
let favorites = readStoredFavorites(loadJson(STORAGE_KEYS.favorites));
let lastFocus = null;
let sheetBeforeDetails = null;

const isSet = (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon);
const setPoints = () => state.points.filter(isSet);
const pointColor = (i) => POINT_COLORS[i % POINT_COLORS.length];
const pointNames = () => setPoints().map((p) => p.name);

// ---- Éléments ------------------------------------------------------------

const els = {
  panel: $('panel'),
  fieldset: $('search-fieldset'),
  points: $('points'),
  addPoint: $('add-point'),
  pointHint: $('point-hint'),
  popMin: $('pop-min'),
  popMax: $('pop-max'),
  popError: $('pop-error'),
  rings: $('rings-toggle'),
  adminFilters: $('admin-filters'),
  adminCount: $('admin-filters-count'),
  filterRegions: $('filter-regions'),
  filterDeps: $('filter-departements'),
  resetFilters: $('reset-filters'),
  sortKey: $('sort-key'),
  sortDir: $('sort-dir'),
  share: $('share-link'),
  print: $('print'),
  feedback: $('action-feedback'),
  count: $('results-count'),
  hint: $('results-hint'),
  list: $('results-list'),
  more: $('show-more'),
  status: $('data-status'),
  details: $('details'),
  detailsInner: $('details-inner'),
  printView: $('print-view'),
  dataSource: $('data-source'),
  tabResults: $('tab-results'),
  tabFavorites: $('tab-favorites'),
  viewResults: $('view-results'),
  viewFavorites: $('view-favorites'),
  favCount: $('favorites-count'),
  favList: $('favorites-list'),
  favEmpty: $('favorites-empty'),
  favFeedback: $('favorites-feedback'),
  favExport: $('favorites-export'),
  favExportCsv: $('favorites-export-csv'),
  favImport: $('favorites-import'),
  favFile: $('favorites-file'),
  importChoice: $('import-choice'),
  importText: $('import-choice-text'),
  importMerge: $('import-merge'),
  importReplace: $('import-replace'),
  importCancel: $('import-cancel'),
};

document.title = APP_NAME;
document.querySelectorAll('[data-app-name]').forEach((el) => (el.textContent = APP_NAME));

// ---- Utilitaires ---------------------------------------------------------

function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

const formatRadius = (r) => String(r).replace('.', ',');

function flash(el, message, isError = false) {
  el.textContent = message;
  el.classList.toggle('error', isError);
  clearTimeout(el._timer);
  el._timer = setTimeout(() => (el.textContent = ''), 4000);
}

// ---- Panneau mobile et carte ---------------------------------------------

const sheet = createSheet({
  panel: els.panel,
  grip: $('sheet-grip'),
  handle: $('sheet-handle'),
  header: els.panel.querySelector('.panel-header'),
  toggle: $('sheet-toggle'),
  onChange: () => syncMapBottom(),
  // Pendant le glissement, la carte s'étend sous le panneau (pas de vide)
  onDragStart: () => setMapBottom(sheet.peekHeight()),
});

const mapView = new MapView($('map'), {
  onMapClick: handleMapClick,
  onCommuneClick: (code) => openDetails(code, 'map'),
  getPadding() {
    if (sheet.isMobile()) {
      // La carte s'arrête déjà au panneau ; seule la fiche peut la recouvrir
      const detailsH = els.details.hidden ? 0 : els.details.offsetHeight;
      return { bottom: Math.max(0, detailsH - mapBottom), right: 0 };
    }
    return { bottom: 0, right: els.details.hidden ? 0 : els.details.offsetWidth + 12 };
  },
});

// ---- Hauteur de la carte sur mobile ----
const mapArea = document.querySelector('.map-area');
let mapBottom = null;
let mapBottomTimer = null;

function setMapBottom(px) {
  clearTimeout(mapBottomTimer);
  if (px === mapBottom) return;
  mapBottom = px;
  mapArea.style.bottom = sheet.isMobile() ? `${px}px` : '';
  mapView.map.invalidateSize({ pan: false });
}

/** Ajuste la carte à la partie visible au-dessus du panneau. */
function syncMapBottom() {
  const target = sheet.isMobile() ? Math.round(sheet.coveredHeight()) : 0;
  if (mapBottom == null || target <= mapBottom) {
    // Le panneau descend : la carte s'agrandit tout de suite, dessous
    setMapBottom(target);
  } else {
    // Le panneau monte : on attend la fin de l'animation pour ne pas laisser de vide
    clearTimeout(mapBottomTimer);
    mapBottomTimer = setTimeout(() => setMapBottom(target), 280);
  }
}

window.addEventListener('resize', debounce(syncMapBottom, 150));
syncMapBottom();

initThemeControl(document.querySelectorAll('input[name="theme"]'));
mapView.setTheme(effectiveTheme());
onThemeChange((theme) => mapView.setTheme(theme));

els.rings.checked = state.rings;
mapView.rings = state.rings;

// ---- Points de départ ----------------------------------------------------

const searchSoon = debounce(() => runSearch({ fit: true }), SEARCH_DEBOUNCE_MS);

function renderPoints() {
  const multi = state.points.length > 1;
  els.points.classList.toggle('multi', multi);
  els.points.innerHTML = '';
  state.points.forEach((p, i) => {
    const qId = `q-${i}`;
    const listId = `suggestions-${i}`;
    const rId = `r-${i}`;
    const labelId = `r-label-${i}`;
    const input = h('input', {
      id: qId,
      type: 'text',
      placeholder: 'Ex. : Lille ou 59000',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
    });
    input.value = pointLabel(p);
    const listbox = h('ul', { id: listId, class: 'suggestions', hidden: true, 'aria-label': 'Suggestions' });
    const range = h('input', {
      type: 'range',
      min: RADIUS.min,
      max: RADIUS.max,
      step: RADIUS.step,
      'aria-labelledby': labelId,
    });
    range.value = Math.round(p.radius);
    const num = h('input', { id: rId, type: 'text', inputmode: 'decimal', 'aria-labelledby': labelId });
    num.value = formatRadius(p.radius);

    const block = h(
      'div',
      { class: `point${multi && i === state.active ? ' active' : ''}`, style: `--point-color: ${pointColor(i)}` },
      h(
        'div',
        { class: 'point-head' },
        h('label', { for: qId }, multi ? `Point ${i + 1} · Ville ou code postal` : 'Ville ou code postal'),
        h('span', { class: 'point-active-label', hidden: !(multi && i === state.active) }, 'Actif'),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-icon btn-ghost point-remove',
            'aria-label': `Retirer le point ${i + 1}`,
            title: 'Retirer ce point de départ',
            onclick: () => removePoint(i),
          },
          '✕'
        )
      ),
      h('div', { class: 'combo' }, input, listbox),
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'label', id: labelId, style: 'font-weight:600;font-size:.92rem' }, 'Rayon (km)'),
        h('div', { class: 'radius-row' }, range, num)
      )
    );

    block.addEventListener('focusin', () => setActivePoint(i));
    block.addEventListener('pointerdown', () => setActivePoint(i));

    attachAutocomplete(input, listbox, {
      getData: () => data,
      suggest: (q) => suggest(data, q),
      onSelect: (commune) => setPointCommune(i, commune),
    });
    input.addEventListener('blur', () => {
      // Texte modifié sans choisir de suggestion : on réaffiche le point actuel
      setTimeout(() => {
        if (document.activeElement !== input && isSet(p)) input.value = pointLabel(p);
      }, 150);
    });

    range.addEventListener('input', () => {
      p.radius = Number(range.value);
      num.value = formatRadius(p.radius);
      searchSoon();
    });
    num.addEventListener('input', () => {
      const v = parseDecimalInput(num.value);
      if (v != null && v >= RADIUS.min && v <= RADIUS.max) {
        p.radius = v;
        range.value = Math.round(v);
        searchSoon();
      }
    });
    const commitRadius = () => {
      const v = parseDecimalInput(num.value);
      // Valeur invalide : on garde la valeur actuelle ; hors limites : on borne
      const fixed = v == null ? p.radius : Math.min(RADIUS.max, Math.max(RADIUS.min, Math.round(v * 10) / 10));
      const changed = fixed !== p.radius;
      p.radius = fixed;
      num.value = formatRadius(fixed);
      range.value = Math.round(fixed);
      if (changed) searchSoon();
    };
    num.addEventListener('change', commitRadius);
    num.addEventListener('blur', commitRadius);
    num.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRadius();
      }
    });

    p.el = { block, input };
    els.points.append(block);
  });

  els.addPoint.disabled = state.points.length >= MAX_STARTING_POINTS;
  els.pointHint.hidden = !multi;
  els.pointHint.textContent = multi
    ? 'Les communes affichées sont dans tous les cercles. Un clic sur la carte place le point encadré.'
    : '';
}

function pointLabel(p) {
  if (p.commune) return communeLabel(p.commune, data?.departements ?? {});
  if (isSet(p)) return p.name;
  return '';
}

function setActivePoint(i) {
  if (state.active === i) return;
  state.active = i;
  const multi = state.points.length > 1;
  state.points.forEach((p, j) => {
    p.el?.block.classList.toggle('active', multi && j === i);
    const label = p.el?.block.querySelector('.point-active-label');
    if (label) label.hidden = !(multi && j === i);
  });
}

function setPointCommune(i, commune) {
  const p = state.points[i];
  p.commune = commune;
  p.lat = commune.lat;
  p.lon = commune.lon;
  p.name = commune.nom;
  p.el.input.value = pointLabel(p);
  closeDetails();
  runSearch({ fit: true });
  ensureInsights();
}

function setPointCoords(i, lat, lon) {
  const p = state.points[i];
  p.commune = null;
  p.lat = lat;
  p.lon = lon;
  p.name = `Point sur la carte (${formatCoords(lat, lon)})`;
  if (p.el) p.el.input.value = p.name;
  runSearch({ fit: true });
  ensureInsights();
}

function addPoint() {
  if (state.points.length >= MAX_STARTING_POINTS) return;
  state.points.push(newPoint(state.points[state.points.length - 1]?.radius ?? RADIUS.default));
  state.active = state.points.length - 1;
  renderPoints();
  state.points[state.active].el.input.focus();
  runSearch({ fit: false });
}

function removePoint(i) {
  if (state.points.length <= 1) return;
  state.points.splice(i, 1);
  if (state.active >= state.points.length) state.active = state.points.length - 1;
  else if (state.active > i) state.active--;
  renderPoints();
  runSearch({ fit: true });
  (state.points[Math.min(i, state.points.length - 1)].el.input).focus();
}

function handleMapClick(lat, lon) {
  if (!data) return;
  // Avec une fiche ouverte, un clic sur la carte la ferme simplement
  if (!els.details.hidden) {
    closeDetails();
    return;
  }
  setPointCoords(state.active, lat, lon);
}

// ---- Recherche -----------------------------------------------------------

function runSearch({ fit = false } = {}) {
  if (!data) return;
  const points = setPoints();
  const searchPoints = points.map(({ lat, lon, radius }) => ({ lat, lon, radius }));

  if (!state.popError) {
    areaResults = searchArea(data.communes, { points: searchPoints, popMin: state.popMin, popMax: state.popMax });
  }
  // Les départements choisis doivent appartenir aux régions choisies
  if (state.regions.length) {
    state.departements = state.departements.filter((code) => state.regions.includes(data.depRegion.get(code)));
  }
  renderFilters();
  const filtered = filterByAdmin(areaResults, state);
  results = sortResults(filtered, state.sort.key, state.sort.dir);
  resultIndex = new Map(results.map((r) => [r.commune.code, r]));
  state.shown = LIST_PAGE_SIZE;

  renderCount(points);
  renderList();
  mapView.render({
    points: state.points.map((p) =>
      isSet(p)
        ? {
            lat: p.lat,
            lon: p.lon,
            radius: p.radius,
            // La commune de départ a-t-elle un marqueur sur la carte ?
            isCommune: Boolean(p.commune && resultIndex.has(p.commune.code)),
            population: p.commune?.population ?? null,
          }
        : null
    ),
    colors: state.points.map((_, i) => pointColor(i)),
    names: state.points.map((p) => p.name),
    results,
  });
  if (fit && points.length) mapView.fitPoints(points);
  updateUrl();

  const hasResults = points.length > 0 && results.length > 0;
  els.print.disabled = !hasResults;
  els.share.disabled = points.length === 0;

  // La fiche ouverte reste à jour (distance)
  if (state.selected && !els.details.hidden) renderDetails(state.selected);
}

function renderCount(points) {
  els.hint.classList.remove('zones-message');
  if (!points.length) {
    els.count.textContent = 'Choisissez un point de départ';
    els.hint.hidden = false;
    els.hint.textContent = 'Choisissez une ville, un code postal ou cliquez sur la carte';
    return;
  }
  els.count.textContent = resultsCountLabel(results.length);
  if (points.length > 1 && !zonesOverlap(points)) {
    els.hint.hidden = false;
    els.hint.textContent = 'Les zones ne se chevauchent pas';
    els.hint.classList.add('zones-message');
  } else if (state.popError) {
    els.hint.hidden = false;
    els.hint.textContent = 'Corrigez la population pour relancer la recherche.';
  } else if (!results.length) {
    els.hint.hidden = false;
    els.hint.textContent = 'Aucune commune ne correspond. Essayez un rayon plus grand ou moins de filtres.';
  } else {
    els.hint.hidden = true;
  }
}

// ---- Liste ---------------------------------------------------------------

function renderList() {
  const names = pointNames();
  const frag = document.createDocumentFragment();
  for (const r of results.slice(0, state.shown)) {
    frag.append(
      resultRow(r, {
        pointNames: names,
        selected: r.commune.code === state.selected,
        isFav: isFavorite(favorites, r.commune.code),
        onOpen: (code) => openDetails(code, 'list'),
        onToggleFav: (code) => toggleFav(code),
      })
    );
  }
  els.list.replaceChildren(frag);
  const remaining = results.length - state.shown;
  els.more.hidden = remaining <= 0;
  if (remaining > 0) {
    els.more.textContent = `Afficher plus (${formatNumber(Math.min(state.shown, results.length))} sur ${formatNumber(results.length)})`;
  }
}

els.more.addEventListener('click', () => {
  const firstNew = state.shown;
  state.shown += LIST_PAGE_SIZE;
  renderList();
  els.list.children[firstNew]?.querySelector('button')?.focus({ preventScroll: true });
});

function revealRow(code) {
  const index = results.findIndex((r) => r.commune.code === code);
  if (index < 0) return;
  if (index >= state.shown) {
    state.shown = Math.ceil((index + 1) / LIST_PAGE_SIZE) * LIST_PAGE_SIZE;
  }
  renderList();
  const row = els.list.querySelector(`li[data-code="${code}"]`);
  if (row && state.view === 'results') row.scrollIntoView({ block: 'nearest' });
}

// ---- Tri -----------------------------------------------------------------

function renderSortDir() {
  const asc = state.sort.dir === 'asc';
  els.sortDir.textContent = asc ? '↑' : '↓';
  const label = asc ? 'Ordre croissant' : 'Ordre décroissant';
  els.sortDir.setAttribute('aria-label', `${label} (changer)`);
  els.sortDir.title = label;
  els.sortKey.value = state.sort.key;
}

els.sortKey.addEventListener('change', () => {
  state.sort.key = els.sortKey.value;
  runSearch();
});
els.sortDir.addEventListener('click', () => {
  state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
  renderSortDir();
  runSearch();
});

// ---- Population ----------------------------------------------------------

function readPopulation() {
  const parse = (input) => {
    const text = input.value.trim();
    const value = parseIntegerInput(text);
    return { value, invalid: text !== '' && value == null };
  };
  const min = parse(els.popMin);
  const max = parse(els.popMax);
  state.popMin = min.value;
  state.popMax = max.value;
  let error = null;
  if (min.invalid || max.invalid) error = 'Saisissez un nombre entier (ex. : 10 000)';
  else error = validatePopulation(state.popMin, state.popMax);
  state.popError = error;
  els.popError.hidden = !error;
  els.popError.textContent = error ?? '';
  const minBad = min.invalid || (error && !max.invalid && !min.invalid);
  const maxBad = max.invalid || (error && !max.invalid && !min.invalid);
  els.popMin.setAttribute('aria-invalid', String(Boolean(minBad)));
  els.popMax.setAttribute('aria-invalid', String(Boolean(maxBad)));
}

const popSearchSoon = debounce(() => {
  readPopulation();
  if (!state.popError) runSearch();
  else renderCount(setPoints());
}, 300);

for (const input of [els.popMin, els.popMax]) {
  input.addEventListener('input', popSearchSoon);
  input.addEventListener('blur', () => {
    const v = parseIntegerInput(input.value);
    if (v != null) input.value = formatNumber(v);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      popSearchSoon.cancel();
      readPopulation();
      if (!state.popError) runSearch();
    }
  });
}

// ---- Cercles de distance -------------------------------------------------

els.rings.addEventListener('change', () => {
  state.rings = els.rings.checked;
  save(STORAGE_KEYS.rings, state.rings ? '1' : '0');
  mapView.setRings(state.rings);
});

// ---- Filtres région / département ----------------------------------------

function renderFilters() {
  const facets = adminFacets(areaResults, state.regions);
  const collator = new Intl.Collator('fr');

  const regions = new Map(facets.regions.map((r) => [r.code, r.count]));
  for (const code of state.regions) if (!regions.has(code)) regions.set(code, 0);
  const regionItems = [...regions]
    .map(([code, count]) => ({ code, count, label: data.regions[code] ?? code }))
    .sort((a, b) => collator.compare(a.label, b.label));

  const deps = new Map(facets.departements.map((d) => [d.code, d.count]));
  for (const code of state.departements) if (!deps.has(code)) deps.set(code, 0);
  const depItems = [...deps]
    .map(([code, count]) => ({ code, count, label: departementLabel(code, data.departements) }))
    .sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));

  const checklist = (container, items, selected, onToggle) => {
    container.replaceChildren(
      ...(items.length
        ? items.map((it) => {
            const input = h('input', { type: 'checkbox', value: it.code });
            input.checked = selected.includes(it.code);
            input.addEventListener('change', () => onToggle(it.code, input.checked));
            return h('label', {}, input, h('span', {}, it.label), h('span', { class: 'count' }, `— ${formatNumber(it.count)}`));
          })
        : [h('p', { class: 'empty' }, 'Lancez une recherche pour voir les choix.')])
    );
  };

  checklist(els.filterRegions, regionItems, state.regions, (code, on) => {
    state.regions = on ? [...state.regions, code] : state.regions.filter((c) => c !== code);
    runSearch();
  });
  checklist(els.filterDeps, depItems, state.departements, (code, on) => {
    state.departements = on ? [...state.departements, code] : state.departements.filter((c) => c !== code);
    runSearch();
  });

  const active = state.regions.length + state.departements.length;
  els.adminCount.textContent = active ? String(active) : '';
  els.resetFilters.disabled = active === 0;
}

els.resetFilters.addEventListener('click', () => {
  state.regions = [];
  state.departements = [];
  runSearch();
});

// ---- Fiche commune -------------------------------------------------------

function resultFor(commune) {
  const found = resultIndex.get(commune.code);
  if (found) return found;
  const points = setPoints();
  if (!points.length) return null;
  const distances = points.map((p) => distanceKm(p.lat, p.lon, commune.lat, commune.lon));
  return { commune, distances, distance: Math.max(...distances) };
}

function renderDetails(code) {
  const commune = data.byCode.get(code);
  if (!commune) return;
  els.detailsInner.replaceChildren(
    ...detailsContent(commune, {
      data,
      result: resultFor(commune),
      pointNames: pointNames(),
      isFav: isFavorite(favorites, code),
      insights,
      onClose: closeDetails,
      onToggleFav: () => toggleFav(code),
    })
  );
}

function openDetails(code, from) {
  const commune = data?.byCode.get(code);
  if (!commune) return;
  if (els.details.hidden) lastFocus = document.activeElement;
  state.selected = code;
  ensureInsights();
  renderDetails(code);
  els.details.hidden = false;
  mapView.highlight(commune);

  if (sheet.isMobile() && from !== 'map') {
    if (sheetBeforeDetails == null) sheetBeforeDetails = sheet.getState();
    sheet.setState('collapsed');
  }
  if (from === 'map') {
    if (state.view === 'results') revealRow(code);
  } else {
    renderList();
    mapView.focusCommune(commune);
  }
  const title = $('details-title');
  title.setAttribute('tabindex', '-1');
  title.focus({ preventScroll: true });
}

function closeDetails() {
  if (els.details.hidden) return;
  const code = state.selected;
  els.details.hidden = true;
  state.selected = null;
  mapView.highlight(null);
  els.list.querySelectorAll('li.selected').forEach((li) => {
    li.classList.remove('selected');
    li.querySelector('.result')?.removeAttribute('aria-current');
  });
  if (sheet.isMobile() && sheetBeforeDetails) sheet.setState(sheetBeforeDetails);
  sheetBeforeDetails = null;
  // La liste a pu être redessinée : on retrouve la ligne de la commune
  if (lastFocus && !document.contains(lastFocus) && code) {
    const view = state.view === 'favorites' ? els.favList : els.list;
    lastFocus = view.querySelector(`li[data-code="${code}"] .result`);
  }
  if (lastFocus && document.contains(lastFocus) && lastFocus !== document.body) {
    lastFocus.focus({ preventScroll: true });
  }
  lastFocus = null;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.details.hidden) {
    e.preventDefault();
    closeDetails();
  }
});

// ---- Favoris -------------------------------------------------------------

function saveFavorites() {
  saveJson(STORAGE_KEYS.favorites, toStoredFavorites(favorites));
  els.favCount.textContent = favorites.length ? String(favorites.length) : '';
}

function toggleFav(code) {
  const commune = data.byCode.get(code);
  if (!commune) return;
  favorites = toggleFavorite(favorites, commune);
  saveFavorites();
  renderList();
  if (state.selected === code && !els.details.hidden) {
    renderDetails(code);
    els.detailsInner.querySelector('.details-fav')?.focus({ preventScroll: true });
  }
  if (state.view === 'favorites') renderFavorites();
}

function renderFavorites() {
  els.favEmpty.hidden = favorites.length > 0;
  els.favExport.disabled = favorites.length === 0;
  els.favExportCsv.disabled = favorites.length === 0;
  const rows = favorites.map((item) => {
    const li = favoriteRow(item, data?.byCode.get(item.code), {
      data,
      onOpen: (code) => openDetails(code, 'fav'),
      onRemove: (code) => {
        favorites = removeFavorite(favorites, code);
        saveFavorites();
        renderFavorites();
        renderList();
        if (state.selected === code && !els.details.hidden) renderDetails(code);
      },
      onNote: (code, note) => {
        favorites = setNote(favorites, code, note);
        saveFavorites();
      },
    });
    li.querySelector('textarea').value = item.note;
    return li;
  });
  els.favList.replaceChildren(...rows);
  const communes = favorites.map((f) => data?.byCode.get(f.code)).filter(Boolean);
  mapView.showFavorites(communes);
  return communes;
}

function setView(view) {
  state.view = view;
  const fav = view === 'favorites';
  els.tabResults.setAttribute('aria-selected', String(!fav));
  els.tabFavorites.setAttribute('aria-selected', String(fav));
  els.tabResults.tabIndex = fav ? -1 : 0;
  els.tabFavorites.tabIndex = fav ? 0 : -1;
  els.viewResults.hidden = fav;
  els.viewFavorites.hidden = !fav;
  if (fav) {
    const communes = renderFavorites();
    if (!setPoints().length && communes.length) mapView.fitCommunes(communes);
  } else {
    mapView.hideFavorites();
  }
}

els.tabResults.addEventListener('click', () => setView('results'));
els.tabFavorites.addEventListener('click', () => setView('favorites'));
for (const tab of [els.tabResults, els.tabFavorites]) {
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = tab === els.tabResults ? els.tabFavorites : els.tabResults;
      next.focus();
      next.click();
    }
  });
}

function insightColumns() {
  const cols = [];
  if (insights.trend) {
    cols.push({ header: 'Tendance démographique', value: (c) => trendText(insights.trend.get(c.code)) });
  }
  if (insights.prices) {
    const info = (c) => priceInfo(insights.prices.get(c.code), c.dep, insights.pricesMeta);
    const price = (c, type) => {
      const i = info(c);
      if (i.status !== 'ok') return i.label;
      return i[type] ? Math.round(i[type].prix) : 'Données insuffisantes';
    };
    cols.push(
      { header: 'Prix médian maison (€/m²)', value: (c) => price(c, 'maison') },
      { header: 'Prix médian appartement (€/m²)', value: (c) => price(c, 'appartement') },
      { header: 'Ventes DVF', value: (c) => (info(c).status === 'ok' ? info(c).ventes : '') }
    );
  }
  return cols;
}

els.favExport.addEventListener('click', () => {
  downloadFile('alentours-favoris.json', JSON.stringify(exportFavorites(favorites), null, 2), 'application/json');
  flash(els.favFeedback, 'Favoris exportés');
});

els.favExportCsv.addEventListener('click', async () => {
  await ensureInsights();
  const rows = favorites.map((f) => ({ fav: f, commune: data.byCode.get(f.code) })).filter((r) => r.commune);
  const base = communeColumns(data).map((col) => ({ header: col.header, value: (r) => col.value(r.commune) }));
  const extra = [
    { header: 'Catégorie', value: (c) => sizeCategory(c.population) },
    { header: 'Superficie (km²)', value: (c) => (Number.isFinite(c.surface) ? c.surface.toFixed(1).replace('.', ',') : '') },
    {
      header: 'Densité (hab./km²)',
      value: (c) => (Number.isFinite(c.population) && c.surface > 0 ? Math.round(c.population / c.surface) : ''),
    },
    ...insightColumns(),
  ].map((col) => ({ header: col.header, value: (r) => col.value(r.commune) }));
  const columns = [...base, ...extra, { header: 'Note', value: (r) => r.fav.note }];
  downloadFile('alentours-favoris.csv', toCsv(rows, columns), 'text/csv;charset=utf-8');
  flash(els.favFeedback, 'Favoris exportés en CSV');
});

let pendingImport = null;
els.favImport.addEventListener('click', () => els.favFile.click());
els.favFile.addEventListener('change', async () => {
  const file = els.favFile.files?.[0];
  els.favFile.value = '';
  if (!file) return;
  let text = '';
  try {
    text = await file.text();
  } catch {
    text = '';
  }
  const parsed = parseFavoritesFile(text);
  if (!parsed.ok) {
    els.importChoice.hidden = true;
    flash(els.favFeedback, 'Fichier invalide', true);
    return;
  }
  pendingImport = parsed.items;
  const n = parsed.items.length;
  els.importText.textContent = `${n} ${n > 1 ? 'favoris' : 'favori'} dans le fichier. Que faire de vos ${favorites.length} favoris actuels ?`;
  els.importChoice.hidden = false;
  els.importMerge.focus();
});

function finishImport(mode) {
  if (!pendingImport) return;
  favorites = mode === 'replace' ? pendingImport : mergeFavorites(favorites, pendingImport);
  pendingImport = null;
  els.importChoice.hidden = true;
  saveFavorites();
  renderFavorites();
  renderList();
  flash(els.favFeedback, mode === 'replace' ? 'Favoris remplacés' : 'Favoris fusionnés');
}

els.importMerge.addEventListener('click', () => finishImport('merge'));
els.importReplace.addEventListener('click', () => finishImport('replace'));
els.importCancel.addEventListener('click', () => {
  pendingImport = null;
  els.importChoice.hidden = true;
});

// ---- URL, partage, export, impression ------------------------------------

function currentSearchState() {
  return {
    points: setPoints().map((p) =>
      p.commune ? { code: p.commune.code, radius: p.radius } : { lat: p.lat, lon: p.lon, radius: p.radius }
    ),
    popMin: state.popError ? null : state.popMin,
    popMax: state.popError ? null : state.popMax,
    regions: state.regions,
    departements: state.departements,
    sort: state.sort,
  };
}

function updateUrl() {
  const query = encodeSearch(currentSearchState());
  const url = `${location.pathname}${query}`;
  if (url !== `${location.pathname}${location.search}`) history.replaceState(null, '', url);
}

function summaryText() {
  const filters = [
    ...state.regions.map((c) => data.regions[c] ?? c),
    ...state.departements.map((c) => departementLabel(c, data.departements)),
  ];
  return searchSummary({
    points: setPoints().map((p) =>
      p.commune
        ? { name: p.commune.nom, radius: p.radius }
        : { name: p.name, radius: p.radius, de: `du point (${formatCoords(p.lat, p.lon)})` }
    ),
    popMin: state.popMin,
    popMax: state.popMax,
    count: results.length,
    filters: filters.length ? [`limité à : ${filters.join(', ')}`] : [],
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

els.share.addEventListener('click', async () => {
  const url = location.href;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.share) {
    try {
      await navigator.share({ title: APP_NAME, text: summaryText(), url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  if (await copyText(url)) flash(els.feedback, 'Lien copié');
  else flash(els.feedback, 'Impossible de copier le lien', true);
});

function buildPrintView() {
  if (!data || !setPoints().length) {
    els.printView.replaceChildren();
    return;
  }
  els.printView.replaceChildren(
    ...printContent({
      appName: APP_NAME,
      summary: summaryText(),
      results,
      data,
      pointNames: pointNames(),
      insights,
    })
  );
}

els.print.addEventListener('click', async () => {
  await ensureInsights();
  buildPrintView();
  window.print();
});
window.addEventListener('beforeprint', buildPrintView);

// ---- Chargement ----------------------------------------------------------

function applyUrlState() {
  const decoded = decodeSearch(location.search, { isKnownCode: (code) => data.byCode.has(code) });
  if (decoded.points?.length) {
    state.points = decoded.points.slice(0, MAX_STARTING_POINTS).map((d) => {
      const p = newPoint(d.radius);
      if (d.code) {
        const c = data.byCode.get(d.code);
        Object.assign(p, { commune: c, lat: c.lat, lon: c.lon, name: c.nom });
      } else {
        Object.assign(p, { lat: d.lat, lon: d.lon, name: `Point sur la carte (${formatCoords(d.lat, d.lon)})` });
      }
      return p;
    });
    state.active = 0;
  } else if (decoded.radius) {
    state.points[0].radius = decoded.radius;
  }
  if (decoded.popMin != null) {
    state.popMin = decoded.popMin;
    els.popMin.value = formatNumber(decoded.popMin);
  }
  if (decoded.popMax != null) {
    state.popMax = decoded.popMax;
    els.popMax.value = formatNumber(decoded.popMax);
  }
  readPopulation();
  state.regions = (decoded.regions ?? []).filter((c) => c in data.regions);
  state.departements = (decoded.departements ?? []).filter((c) => c in data.departements);
  if (state.regions.length || state.departements.length) els.adminFilters.open = true;
  if (decoded.sort) state.sort = decoded.sort;
}

let firstStart = true;

async function start() {
  // Le message de chargement est dans l'en-tête (pas de décalage de la page)
  els.status.hidden = true;
  els.count.textContent = 'Chargement des communes…';
  els.fieldset.disabled = true;
  try {
    // Les premières tuiles d'abord : elles forment le plus grand élément
    // affiché, et les deux téléchargements se partageraient la connexion.
    if (firstStart) await mapView.whenTilesLoaded(1500);
    firstStart = false;
    data = await loadData();
  } catch (err) {
    console.warn(err);
    els.status.hidden = false;
    els.status.className = 'data-status error';
    const retry = h('button', { type: 'button', class: 'btn btn-primary', onclick: start }, 'Réessayer');
    els.status.replaceChildren(h('span', {}, 'Impossible de charger les communes. Vérifiez votre connexion.'), retry);
    els.count.textContent = 'Données indisponibles';
    retry.focus();
    return;
  }
  els.status.hidden = true;
  els.fieldset.disabled = false;
  const year = data.meta.populationYear ? `, population ${data.meta.populationYear}` : '';
  els.dataSource.replaceChildren(
    'Données : ',
    h('a', { href: 'https://geo.api.gouv.fr/', target: '_blank', rel: 'noopener' }, 'INSEE / geo.api.gouv.fr'),
    year
  );

  applyUrlState();
  renderPoints();
  renderSortDir();
  saveFavorites();
  const hadPoints = setPoints().length > 0;
  runSearch({ fit: hadPoints });
  // Les données complémentaires (tendance, prix) sont chargées à la demande :
  // ouverture d'une fiche, export CSV, impression.
}

let insightsPromise = null;

/** Charge (une seule fois) tendance démographique et prix DVF. */
function ensureInsights() {
  insightsPromise ??= loadInsights().then((loaded) => {
    insights = loaded;
    if (insights.prices || insights.trend) {
      const parts = [];
      if (insights.trend) parts.push(h('span', {}, ' · Recensements : INSEE'));
      if (insights.prices) {
        parts.push(
          ' · Prix : ',
          h(
            'a',
            { href: insights.pricesMeta?.url ?? 'https://www.data.gouv.fr/', target: '_blank', rel: 'noopener' },
            'DVF / data.gouv.fr'
          )
        );
      }
      els.dataSource.append(...parts);
    }
    if (state.selected && !els.details.hidden) renderDetails(state.selected);
  });
  return insightsPromise;
}

els.addPoint.addEventListener('click', addPoint);
renderPoints();
renderSortDir();
// Le filet de sécurité d'index.html sait ainsi que le script a démarré
document.documentElement.setAttribute('data-app-started', '');
start();
