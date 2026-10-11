// Point d'entrée : relie les données, le formulaire, la liste et la carte.

import {
  APP_NAME,
  DRIVE,
  DVF_MIN_SALES,
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
  isFavorite,
  STATUSES,
  readStoredFavorites,
  removeFavorite,
  toggleFavorite,
  visibleFavorites,
  toStoredFavorites,
} from './lib/favorites.js';
import {
  addToFolder,
  briefHasZone,
  cleanFolders,
  createFolder,
  deleteFolder,
  findFolder,
  folderCities,
  foldersContaining,
  migrateFavoriteNotes,
  removeFromFolder,
  renameFolder,
  setFolderBrief,
  setFolderNote,
  setFolderStatus,
  visibleFolders,
} from './lib/folders.js';
import { exportUserData, importUserData, parseUserDataFile } from './lib/userdata.js';
import { comparisonTable } from './lib/compare.js';
import { directionsUrl, distanceKm, nearGeometry, visitOrder, zonesOverlap } from './lib/geo.js';
import { budgetCheck, budgetIsSet, formatEuros, PROPERTY_TYPES } from './lib/budget.js';
import { formatDuration, isochrone, travelTime } from './routing.js';
import { looksLikeAddress, searchAddresses } from './geocode.js';
import { priceInfo, trendText } from './lib/insights.js';
import { adminFacets, filterByAdmin, searchArea, validatePopulation } from './lib/search.js';
import { sortResults } from './lib/sort.js';
import { suggest } from './lib/suggest.js';
import { deName, searchSummary } from './lib/summary.js';
import {
  formatCoords,
  formatMinutes,
  formatNumber,
  parseDecimalInput,
  parseIntegerInput,
  parseMinutesInput,
  resultsCountLabel,
} from './lib/text.js';
import { decodeSearch, encodeSearch } from './lib/url.js';
import { FIREBASE_CONFIG } from './firebase-config.js';
import { MapView } from './map.js';
import { load, loadJson, save, saveJson } from './storage.js';
import { createSync } from './sync.js';
import { effectiveTheme, initThemeControl, onThemeChange } from './theme.js';
import { attachAutocomplete } from './ui/autocomplete.js';
import { downloadFile, h } from './ui/dom.js';
import { createSheet } from './ui/sheet.js';
import {
  briefCard,
  clientReportContent,
  comparisonTableElement,
  detailsContent,
  favoriteRow,
  favoritesPrintContent,
  folderCityRow,
  folderRow,
  printContent,
  resultRow,
} from './ui/views.js';

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
  address: false, // point placé sur une adresse (sans commune)
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
  favoritesOnly: false,
  openFolder: null,
  statusFilter: 'all',
  editingBrief: false,
  budget: null,
  budgetOnly: false,
  driveMax: null,
  driveZones: null,
  driveError: null,
  pickerCode: null,
  compare: new Set(),
  selected: null,
  shown: LIST_PAGE_SIZE,
};

let areaResults = [];
let results = [];
let resultIndex = new Map();
let favorites = readStoredFavorites(loadJson(STORAGE_KEYS.favorites));
let folders = cleanFolders(loadJson(STORAGE_KEYS.folders)?.dossiers);
let sync = null;
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
  favoritesOnly: $('favorites-only'),
  tabFolders: $('tab-folders'),
  driveMax: $('drive-max'),
  driveStatus: $('drive-status'),
  budgetBox: $('budget-box'),
  budgetBadge: $('budget-badge'),
  budgetAmount: $('budget-amount'),
  budgetSurface: $('budget-surface'),
  budgetType: $('budget-type'),
  budgetOnly: $('budget-only'),
  budgetLegend: $('budget-legend'),
  budgetClear: $('budget-clear'),
  briefView: $('brief-view'),
  briefEdit: $('brief-edit'),
  briefForm: $('brief-form'),
  briefClient: $('brief-client'),
  briefZone: $('brief-zone'),
  briefZoneList: $('brief-zone-list'),
  briefRayon: $('brief-rayon'),
  briefPopMin: $('brief-pop-min'),
  briefPopMax: $('brief-pop-max'),
  briefTrajet: $('brief-trajet'),
  briefBudget: $('brief-budget'),
  briefSurface: $('brief-surface'),
  briefType: $('brief-type'),
  briefTravail: $('brief-travail'),
  briefCriteres: $('brief-criteres'),
  briefCancel: $('brief-cancel'),
  briefApply: $('brief-apply'),
  folderRoute: $('folder-route'),
  folderFeedback: $('folder-feedback'),
  statusFilter: $('status-filter'),
  viewFolders: $('view-folders'),
  foldersCount: $('folders-count'),
  foldersHome: $('folders-home'),
  folderCreate: $('folder-create'),
  folderName: $('folder-name'),
  foldersEmpty: $('folders-empty'),
  foldersList: $('folders-list'),
  foldersPrintAll: $('folders-print-all'),
  folderDetail: $('folder-detail'),
  folderBack: $('folder-back'),
  folderTitle: $('folder-title'),
  folderRename: $('folder-rename'),
  folderRenameForm: $('folder-rename-form'),
  folderRenameInput: $('folder-rename-input'),
  folderRenameCancel: $('folder-rename-cancel'),
  folderPrint: $('folder-print'),
  folderDelete: $('folder-delete'),
  folderEmpty: $('folder-empty'),
  folderCitiesList: $('folder-cities'),
  picker: $('folder-picker'),
  pickerCity: $('picker-city'),
  pickerList: $('picker-list'),
  pickerCreate: $('picker-create'),
  pickerName: $('picker-name'),
  pickerClose: $('picker-close'),
  pickerDone: $('picker-done'),
  favoritesTools: $('favorites-tools'),
  compareOpen: $('compare-open'),
  compareHint: $('compare-hint'),
  favoritesPrint: $('favorites-print'),
  compareDialog: $('compare'),
  compareBody: $('compare-body'),
  compareClose: $('compare-close'),
  sync: $('sync'),
  syncStatus: $('sync-status'),
  syncSignIn: $('sync-signin'),
  syncSignOut: $('sync-signout'),
  syncDelete: $('sync-delete'),
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
      placeholder: 'Ex. : Lille, 59000 ou 12 rue de Vesle Reims',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
    });
    input.value = pointLabel(p);
    const listbox = h('ul', { id: listId, class: 'suggestions', hidden: true, 'aria-label': 'Suggestions' });
    const clearBtn = h(
      'button',
      { type: 'button', class: 'combo-clear', 'aria-label': 'Effacer le point de départ', title: 'Effacer', hidden: !input.value },
      '✕'
    );
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
      { class: 'point', style: `--point-color: ${pointColor(i)}` },
      h(
        'div',
        { class: 'point-head' },
        h('label', { for: qId }, multi ? `Point ${i + 1} · Ville, code postal ou adresse` : 'Ville, code postal ou adresse'),
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
      h('div', { class: 'combo' }, input, clearBtn, listbox),
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
      more: addressSuggestions,
      onSelect: (item) => (item.address ? setPointAddress(i, item) : setPointCommune(i, item)),
    });
    input.addEventListener('input', () => (clearBtn.hidden = !input.value));
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement === input || document.activeElement === clearBtn) return;
        // Champ vidé : plus de point de départ ; texte modifié sans choisir de
        // suggestion : on réaffiche le point actuel
        if (!input.value.trim()) {
          if (isSet(p)) clearPoint(i);
        } else if (isSet(p)) {
          input.value = pointLabel(p);
        }
        clearBtn.hidden = !input.value;
      }, 150);
    });
    clearBtn.addEventListener('click', () => {
      clearPoint(i);
      input.focus();
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
    ? 'Les communes affichées sont dans tous les cercles.'
    : '';
}

function pointLabel(p) {
  if (p.commune) return communeLabel(p.commune, data?.departements ?? {});
  if (isSet(p)) return p.name;
  return '';
}

function setActivePoint(i) {
  state.active = i;
}

/** Adresses (service IGN) proposées après les communes, si la saisie s'y prête. */
function addressSuggestions(query, local) {
  if (!looksLikeAddress(query, local.items.length > 0)) return null;
  return () => searchAddresses(query);
}

function setPointCommune(i, commune) {
  const p = state.points[i];
  p.commune = commune;
  p.lat = commune.lat;
  p.lon = commune.lon;
  p.name = commune.nom;
  p.address = false;
  showPoint(p);
}

/** Point de départ sur une adresse (« 12 Rue de Vesle 51100 Reims »). */
function setPointAddress(i, address) {
  const p = state.points[i];
  Object.assign(p, addressPoint(address));
  showPoint(p);
}

const addressPoint = (a) => ({ commune: null, lat: a.lat, lon: a.lon, name: a.label, address: true });

function showPoint(p) {
  p.el.input.value = pointLabel(p);
  const clear = p.el.block.querySelector('.combo-clear');
  if (clear) clear.hidden = false;
  closeDetails();
  runSearch({ fit: true });
  ensureInsights();
}

/** Retire le point de départ (champ vidé ou bouton ✕). */
function clearPoint(i) {
  const p = state.points[i];
  if (!p) return;
  p.commune = null;
  p.lat = null;
  p.lon = null;
  p.name = '';
  p.address = false;
  if (p.el) {
    p.el.input.value = '';
    const clear = p.el.block.querySelector('.combo-clear');
    if (clear) clear.hidden = true;
  }
  closeDetails();
  runSearch({ fit: false });
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

/** Un clic sur le fond de carte ferme la fiche ouverte (il ne change pas la recherche). */
function handleMapClick() {
  closeDetails();
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
  let filtered = filterByAdmin(areaResults, state);
  if (state.favoritesOnly) filtered = filtered.filter((r) => isFavorite(favorites, r.commune.code));
  // Trajet max en voiture : communes dont une bonne partie est dans toutes les zones
  ensureDriveZones();
  const zones = driveZonesReady() ? state.driveZones.geoms : null;
  if (zones) filtered = filtered.filter((r) => zones.every((g) => communeInZone(r.commune, g)));
  // Budget : il faut les prix DVF
  const budgetActive = budgetIsSet(state.budget);
  if ((budgetActive || state.sort.key === 'prix') && !insights.prices && !insights.pricesLoaded) {
    ensureInsights().then(() => runSearch());
  }
  if (budgetActive && state.budgetOnly && insights.prices) {
    filtered = filtered.filter((r) => ['ok', 'limite'].includes(budgetFor(r.commune)?.status));
  }
  results = sortResults(filtered, state.sort.key, state.sort.dir, { priceOf: pricePerM2 });
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
    favorites: favoriteCodes(),
    colorOf: budgetActive && insights.prices ? (c) => `budget-${budgetFor(c)?.status ?? 'inconnu'}` : null,
  });
  mapView.setDriveZones(zones, state.points.filter(isSet).map((_, i) => pointColor(i)));
  renderDriveStatus(points, zones);
  els.budgetLegend.hidden = !(budgetActive && insights.prices);
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
    els.hint.textContent = 'Choisissez une ville, un code postal ou une adresse';
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
  } else if (!results.length && state.favoritesOnly) {
    els.hint.hidden = false;
    els.hint.textContent = 'Aucun de vos favoris dans cette zone.';
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
        folderCount: foldersContaining(folders, r.commune.code).length,
        budget: budgetFor(r.commune),
        onOpen: (code) => openDetails(code, 'list'),
        onToggleFav: (code) => toggleFav(code),
        onFolders: (code) => openPicker(code),
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
      folderCount: foldersContaining(folders, code).length,
      insights,
      budget: budgetFor(commune),
      hasPoints: setPoints().length > 0,
      onClose: closeDetails,
      onToggleFav: () => toggleFav(code),
      onFolders: () => openPicker(code),
      onSearchAround: () => searchAround(code),
    })
  );
  fillTravel(commune);
}

// ---- Temps de trajet (IGN) --------------------------------------------------

// Résultats connus, utilisables sans attendre (impression)
const knownTravel = new Map();
const travelKey = (p, c) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}>${c.code}`;

function travelFor(point, commune) {
  return travelTime(point, commune)
    .then((t) => {
      knownTravel.set(travelKey(point, commune), t);
      return t;
    })
    .catch(() => null);
}

/** Remplit la ligne « Trajet en voiture » de la fiche ouverte. */
function fillTravel(commune) {
  const pts = setPoints();
  if (!pts.length || !document.getElementById('travel-cell')) return;
  Promise.all(pts.map((p) => travelFor(p, commune))).then((list) => {
    const cell = document.getElementById('travel-cell');
    if (!cell || state.selected !== commune.code) return;
    const parts = list.map((t, i) => {
      const prefix = pts.length > 1 ? `${pointShortName(pts[i])} : ` : '';
      return t ? `${prefix}${formatDuration(t.minutes)} (${formatNumber(t.km, 0)}${'\u00A0'}km)` : `${prefix}indisponible`;
    });
    cell.className = list.some(Boolean) ? '' : 'muted';
    cell.textContent = list.some(Boolean) ? parts.join(' · ') : 'Indisponible (service IGN)';
  });
}

const pointShortName = (p) => (p.commune ? p.commune.nom : p.address ? p.name : 'le point');

// ---- Trajet max en voiture (zones IGN) ---------------------------------------

let driveRequest = null;

function driveKey() {
  const pts = setPoints();
  if (!state.driveMax || !pts.length) return null;
  return `${pts.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join('|')}@${state.driveMax}`;
}

const driveZonesReady = () => Boolean(state.driveZones && state.driveZones.key === driveKey());

function ensureDriveZones() {
  const key = driveKey();
  if (!key || driveZonesReady() || driveRequest?.key === key) return;
  const req = { key };
  driveRequest = req;
  state.driveError = null;
  Promise.all(setPoints().map((p) => isochrone(p, state.driveMax)))
    .then((geoms) => {
      if (driveRequest !== req) return;
      driveRequest = null;
      state.driveZones = { key, geoms };
      runSearch();
    })
    .catch(() => {
      if (driveRequest !== req) return;
      driveRequest = null;
      state.driveZones = null;
      state.driveError = 'Zone de trajet indisponible (service IGN). Réessayez plus tard.';
      runSearch();
    });
}

/**
 * Une commune compte si la zone passe à moins de 15 % de son « rayon » (cercle
 * de même surface) de son centre, soit environ 40 % de sa surface couverte :
 * le centre d'une grande ville (Reims, 47 km²) peut être juste hors zone alors
 * que tout un côté est à 5 min. Sans effet notable pour un petit village.
 */
function communeInZone(commune, geometry) {
  const margin = commune.surface > 0 ? 0.15 * Math.sqrt(commune.surface / Math.PI) : 0;
  return nearGeometry(commune.lat, commune.lon, geometry, margin);
}

function renderDriveStatus(points, zones) {
  const el = els.driveStatus;
  el.classList.remove('field-error');
  if (!state.driveMax || !points.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const label = formatMinutes(state.driveMax);
  if (zones) el.textContent = `Zone à ${label} en voiture (IGN) : ${results.length} commune${results.length > 1 ? 's' : ''}.`;
  else if (state.driveError) {
    el.textContent = state.driveError;
    el.classList.add('field-error');
  } else el.textContent = `Calcul de la zone à ${label} en voiture…`;
}

/** Saisie « 45 », « 1h30 »… → minutes bornées (null : pas de limite ; undefined : illisible). */
function readMinutes(input) {
  if (!input.value.trim()) return null;
  const m = parseMinutesInput(input.value);
  return m == null ? undefined : Math.min(DRIVE.max, Math.max(DRIVE.min, m));
}

const setDriveInput = (minutes) => (els.driveMax.value = minutes ? String(minutes) : '');

function commitDrive({ final = false } = {}) {
  const m = readMinutes(els.driveMax);
  if (m === undefined) {
    // Valeur illisible : on garde la limite actuelle
    if (final) setDriveInput(state.driveMax);
    return;
  }
  if (final) setDriveInput(m);
  if (m === state.driveMax) return;
  state.driveMax = m;
  runSearch();
}

// Chaque durée demande une zone au service IGN : on attend la fin de la saisie
const driveSoon = debounce(() => commitDrive(), 700);
els.driveMax.addEventListener('input', driveSoon);
els.driveMax.addEventListener('change', () => commitDrive({ final: true }));
els.driveMax.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitDrive({ final: true });
  }
});

// ---- Budget du client -------------------------------------------------------

/** Vérification du budget pour une commune (null si budget incomplet ou prix non chargés). */
function budgetFor(commune) {
  if (!budgetIsSet(state.budget) || !insights.prices) return null;
  return budgetCheck(insights.prices.get(commune.code), commune.dep, state.budget);
}

/** Prix au m² du type choisi (maison par défaut), pour le tri. */
function pricePerM2(commune) {
  const t = insights.prices?.get(commune.code)?.[state.budget?.type ?? 'maison'];
  return t && Number.isFinite(t.prix) && t.ventes >= DVF_MIN_SALES ? t.prix : null;
}

function readBudget() {
  const budget = parseIntegerInput(els.budgetAmount.value);
  const surface = parseIntegerInput(els.budgetSurface.value);
  state.budget = budget || surface ? { budget, type: els.budgetType.value, surface } : null;
  state.budgetOnly = els.budgetOnly.checked;
  els.budgetBadge.textContent = budgetIsSet(state.budget) ? formatEuros(state.budget.budget) : '';
}

function setBudgetInputs(b) {
  els.budgetAmount.value = b?.budget ? formatNumber(b.budget) : '';
  els.budgetSurface.value = b?.surface ? String(b.surface) : '';
  els.budgetType.value = b?.type === 'appartement' ? 'appartement' : 'maison';
  readBudget();
}

const budgetSoon = debounce(() => {
  readBudget();
  runSearch();
}, 300);
for (const input of [els.budgetAmount, els.budgetSurface]) {
  input.addEventListener('input', budgetSoon);
  input.addEventListener('blur', () => {
    const v = parseIntegerInput(input.value);
    if (v != null) input.value = input === els.budgetAmount ? formatNumber(v) : String(v);
  });
}
for (const input of [els.budgetType, els.budgetOnly]) {
  input.addEventListener('change', () => {
    readBudget();
    runSearch();
  });
}
els.budgetClear.addEventListener('click', () => {
  els.budgetOnly.checked = false;
  setBudgetInputs(null);
  runSearch();
});

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
  // Une fenêtre (dossiers, comparaison) ouverte se ferme d'abord toute seule
  if (e.key === 'Escape' && !els.details.hidden && !document.querySelector('dialog[open]')) {
    e.preventDefault();
    closeDetails();
  }
});

// ---- Favoris -------------------------------------------------------------

/** Enregistre les favoris sur l'appareil (et les envoie en ligne si connecté). */
function saveFavorites({ fromSync = false } = {}) {
  saveJson(STORAGE_KEYS.favorites, toStoredFavorites(favorites));
  saveJson(STORAGE_KEYS.folders, { version: 1, dossiers: folders });
  const n = visibleFavorites(favorites).length;
  els.favCount.textContent = n ? String(n) : '';
  const f = visibleFolders(folders).length;
  els.foldersCount.textContent = f ? String(f) : '';
  if (!fromSync) sync?.notifyLocalChange();
}

/** Favoris reçus d'un autre appareil : mise à jour de l'affichage. */
function applySyncedFavorites({ items, dossiers }) {
  favorites = items;
  folders = dossiers;
  saveFavorites({ fromSync: true });
  favoritesChanged();
  if (state.view === 'favorites') renderFavorites();
  if (state.view === 'folders') renderFolders();
  if (els.picker.open) renderPicker();
  if (state.selected && !els.details.hidden) renderDetails(state.selected);
}

const favoriteCodes = () => new Set(visibleFavorites(favorites).map((f) => f.code));

/** Les favoris ont changé : liste, carte (anneaux dorés) et filtre « Favoris seulement ». */
function favoritesChanged() {
  for (const code of state.compare) if (!isFavorite(favorites, code)) state.compare.delete(code);
  if (state.favoritesOnly) runSearch();
  else {
    renderList();
    mapView.setFavorites(favoriteCodes());
  }
}

/** Fait d'une commune le point de départ (le point actif s'il y en a plusieurs). */
function searchAround(code) {
  const commune = data?.byCode.get(code);
  if (!commune) return;
  if (els.compareDialog.open) els.compareDialog.close();
  const i = state.points.length > 1 ? Math.min(state.active, state.points.length - 1) : 0;
  setView('results');
  setPointCommune(i, commune);
  if (sheet.isMobile()) sheet.setState('half');
}

function toggleFav(code) {
  const commune = data.byCode.get(code);
  if (!commune) return;
  favorites = toggleFavorite(favorites, commune);
  saveFavorites();
  favoritesChanged();
  if (state.selected === code && !els.details.hidden) {
    renderDetails(code);
    els.detailsInner.querySelector('.details-fav')?.focus({ preventScroll: true });
  }
  if (state.view === 'favorites') renderFavorites();
}

function renderFavorites() {
  const visible = visibleFavorites(favorites);
  els.favEmpty.hidden = visible.length > 0;
  els.favExport.disabled = visible.length === 0;
  els.favExportCsv.disabled = visible.length === 0;
  els.favoritesTools.hidden = visible.length === 0;
  const n = state.compare.size;
  els.compareOpen.disabled = n < 2;
  els.compareOpen.textContent = n ? `Comparer (${n})` : 'Comparer';
  els.compareHint.textContent =
    n >= 5 ? '5 favoris au maximum.' : 'Cochez « Comparer » sur 2 à 5 favoris pour les voir côte à côte.';
  const rows = visible.map((item) => {
    const li = favoriteRow(item, data?.byCode.get(item.code), {
      data,
      onOpen: (code) => openDetails(code, 'fav'),
      onRemove: (code) => {
        favorites = removeFavorite(favorites, code);
        saveFavorites();
        renderFavorites();
        favoritesChanged();
        if (state.selected === code && !els.details.hidden) renderDetails(code);
      },
      folderCount: foldersContaining(folders, item.code).length,
      onFolders: (code) => openPicker(code),
      selected: state.compare.has(item.code),
      selectDisabled: state.compare.size >= 5,
      onSelect: (code, on) => {
        if (on) state.compare.add(code);
        else state.compare.delete(code);
        renderFavorites();
        els.favList.querySelector(`li[data-code="${code}"] .fav-compare input`)?.focus({ preventScroll: true });
      },
      onSearchAround: (code) => searchAround(code),
    });
    return li;
  });
  els.favList.replaceChildren(...rows);
  const communes = visible.map((f) => data?.byCode.get(f.code)).filter(Boolean);
  mapView.showFavorites(communes);
  return communes;
}

// ---- Dossiers --------------------------------------------------------------

function renderFolders() {
  const list = visibleFolders(folders);
  const folder = state.openFolder ? findFolder(folders, state.openFolder) : null;
  if (state.openFolder && !folder) state.openFolder = null; // supprimé (autre appareil)
  els.foldersHome.hidden = Boolean(folder);
  els.folderDetail.hidden = !folder;
  if (!folder) {
    els.foldersEmpty.hidden = list.length > 0;
    els.foldersPrintAll.hidden = list.length === 0;
    els.foldersList.replaceChildren(
      ...list.map((f) => folderRow(f, folderCities(f).length, { onOpen: (id) => openFolder(id) }))
    );
    mapView.hideFavorites();
    return [];
  }
  els.folderTitle.textContent = folder.nom;
  if (!state.editingBrief) {
    els.briefForm.hidden = true;
    els.briefView.hidden = false;
    els.briefEdit.hidden = false;
    els.briefView.replaceChildren(briefCard(folder.fiche));
  }
  const allCities = folderCities(folder);
  renderStatusFilter(allCities);
  const cities =
    state.statusFilter === 'all'
      ? allCities
      : allCities.filter((c) => (c.statut ?? 'aucun') === state.statusFilter);
  els.folderEmpty.hidden = allCities.length > 0;
  els.folderRoute.disabled = allCities.length === 0;
  els.folderPrint.disabled = allCities.length === 0;
  // Une note en cours de saisie ne doit pas être perdue si la liste est
  // redessinée (par exemple à l'arrivée de données d'un autre appareil)
  const editing = document.activeElement?.closest?.('#folder-cities li');
  const editingCode = editing?.dataset.code;
  const editingField = editing && document.activeElement.tagName === 'TEXTAREA' ? document.activeElement : null;
  const rows = cities.map((item) => {
    const li = folderCityRow(item, data?.byCode.get(item.code), {
      data,
      folderId: folder.id,
      onOpen: (code) => openDetails(code, 'fav'),
      onRemove: (code) => {
        folders = removeFromFolder(folders, folder.id, code);
        saveFavorites();
        renderFolders();
        renderList();
        if (state.selected === code && !els.details.hidden) renderDetails(code);
      },
      onNote: (code, note) => {
        folders = setFolderNote(folders, folder.id, code, note);
        saveFavorites();
      },
      onStatus: (code, statut) => {
        folders = setFolderStatus(folders, folder.id, code, statut);
        saveFavorites();
        renderFolders();
        els.folderCitiesList.querySelector(`li[data-code="${code}"] select`)?.focus({ preventScroll: true });
      },
      onSearchAround: (code) => searchAround(code),
    });
    li.querySelector('textarea').value = item.code === editingCode && editingField ? editingField.value : item.note;
    return li;
  });
  els.folderCitiesList.replaceChildren(...rows);
  if (editingCode && editingField) {
    const field = els.folderCitiesList.querySelector(`li[data-code="${editingCode}"] textarea`);
    if (field) {
      field.focus({ preventScroll: true });
      field.setSelectionRange(editingField.selectionStart, editingField.selectionEnd);
    }
  }
  const communes = cities.map((c) => data?.byCode.get(c.code)).filter(Boolean);
  const statusOf = new Map(cities.map((c) => [c.code, c.statut]));
  mapView.showFavorites(communes, 'folder', (code) => statusOf.get(code));
  return communes;
}

function renderStatusFilter(cities) {
  const counts = { all: cities.length, aucun: 0 };
  for (const k of Object.keys(STATUSES)) counts[k] = 0;
  for (const c of cities) counts[c.statut ?? 'aucun']++;
  if (state.statusFilter !== 'all' && !counts[state.statusFilter]) state.statusFilter = 'all';
  const options = [['all', 'Toutes'], ...Object.entries(STATUSES), ['aucun', 'Sans statut']].filter(
    ([k]) => k === 'all' || counts[k] > 0
  );
  els.statusFilter.hidden = cities.length === 0;
  els.statusFilter.replaceChildren(
    ...options.map(([k, label]) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(state.statusFilter === k),
          onclick: () => {
            state.statusFilter = k;
            renderFolders();
            els.statusFilter.querySelector('[aria-pressed="true"]')?.focus();
          },
        },
        `${label} (${counts[k]})`
      )
    )
  );
}

// Fiche client
function openBriefForm() {
  const folder = findFolder(folders, state.openFolder);
  if (!folder) return;
  const b = folder.fiche ?? {};
  els.briefClient.value = b.client ?? '';
  // Nouvelle fiche : on part de la recherche en cours
  const current = setPoints().find((p) => p.commune || p.address);
  const zone = folder.fiche ? briefZonePoint(b) : current;
  briefPlace = zone ? (zone.commune ?? { address: true, label: zone.name, lat: zone.lat, lon: zone.lon }) : null;
  els.briefZone.value = briefPlaceLabel();
  const rayon = folder.fiche ? b.zoneRayon : current?.radius;
  els.briefRayon.value = rayon ? String(rayon).replace('.', ',') : '';
  // Nouvelle fiche : on part des filtres de la recherche en cours
  const popMin = folder.fiche ? b.popMin : state.popError ? null : state.popMin;
  const popMax = folder.fiche ? b.popMax : state.popError ? null : state.popMax;
  els.briefPopMin.value = popMin ? formatNumber(popMin) : '';
  els.briefPopMax.value = popMax ? formatNumber(popMax) : '';
  els.briefTrajet.value = String((folder.fiche ? b.trajetMax : state.driveMax) ?? '');
  els.briefBudget.value = b.budget ? formatNumber(b.budget) : '';
  els.briefSurface.value = b.surface ?? '';
  els.briefType.value = b.type ?? '';
  els.briefTravail.value = b.travail ?? '';
  els.briefCriteres.value = b.criteres ?? '';
  state.editingBrief = true;
  els.briefForm.hidden = false;
  els.briefView.hidden = true;
  els.briefEdit.hidden = true;
  els.briefClient.focus();
}

// Ville ou adresse choisie dans le formulaire de la fiche
let briefPlace = null;
const briefPlaceLabel = () =>
  !briefPlace ? '' : briefPlace.address ? briefPlace.label : communeLabel(briefPlace, data.departements);
attachAutocomplete(els.briefZone, els.briefZoneList, {
  getData: () => data,
  suggest: (q) => suggest(data, q),
  more: addressSuggestions,
  onSelect: (item) => {
    briefPlace = item;
    els.briefZone.value = briefPlaceLabel();
    els.briefRayon.focus();
  },
});
els.briefZone.addEventListener('blur', () => {
  setTimeout(() => {
    if (document.activeElement === els.briefZone) return;
    if (!els.briefZone.value.trim()) briefPlace = null;
    else if (briefPlace) els.briefZone.value = briefPlaceLabel();
  }, 150);
});

/** Zone de la fiche client en point de départ (sans rayon), ou null. */
function briefZonePoint(b) {
  if (b?.zoneCode) {
    const city = data.byCode.get(b.zoneCode);
    return city ? { commune: city, lat: city.lat, lon: city.lon, name: city.nom, address: false } : null;
  }
  if (briefHasZone(b)) return addressPoint({ lat: b.zoneLat, lon: b.zoneLon, label: b.zoneNom });
  return null;
}

function closeBriefForm() {
  state.editingBrief = false;
  renderFolders();
  els.briefEdit.focus();
}

els.briefEdit.addEventListener('click', openBriefForm);
els.briefCancel.addEventListener('click', closeBriefForm);
els.briefForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const rayon = parseDecimalInput(els.briefRayon.value);
  const place = els.briefZone.value.trim() ? briefPlace : null;
  folders = setFolderBrief(folders, state.openFolder, {
    client: els.briefClient.value,
    zoneCode: place && !place.address ? place.code : null,
    zoneNom: place ? (place.address ? place.label : place.nom) : '',
    zoneLat: place?.address ? place.lat : null,
    zoneLon: place?.address ? place.lon : null,
    // Rayon vide : « Appliquer » garde le rayon de la recherche
    zoneRayon: rayon != null ? Math.min(RADIUS.max, Math.max(RADIUS.min, rayon)) : null,
    popMin: parseIntegerInput(els.briefPopMin.value),
    popMax: parseIntegerInput(els.briefPopMax.value),
    trajetMax: readMinutes(els.briefTrajet) ?? null,
    budget: parseIntegerInput(els.briefBudget.value),
    surface: parseIntegerInput(els.briefSurface.value),
    type: els.briefType.value || null,
    travail: els.briefTravail.value,
    criteres: els.briefCriteres.value,
  });
  saveFavorites();
  closeBriefForm();
});

// La fiche remplace les filtres de la recherche : un champ vide dans la fiche
// efface le filtre (un trajet max de la recherche ne reste pas en place).
els.briefApply.addEventListener('click', () => {
  const b = findFolder(folders, state.openFolder)?.fiche;
  if (!b) {
    flash(els.folderFeedback, 'Remplissez d’abord la fiche client.', true);
    return;
  }
  const zone = briefZonePoint(b);
  if (!zone && !setPoints().length) {
    flash(els.folderFeedback, 'Indiquez une ville ou une adresse dans la fiche client, ou choisissez un point de départ.', true);
    return;
  }
  // Zone : celle de la fiche, sinon les points de départ actuels
  if (zone) {
    state.points = [Object.assign(newPoint(b.zoneRayon ?? RADIUS.default), zone)];
    state.active = 0;
  } else if (b.zoneRayon) {
    for (const p of state.points) p.radius = b.zoneRayon;
  }
  renderPoints();
  els.popMin.value = b.popMin ? formatNumber(b.popMin) : '';
  els.popMax.value = b.popMax ? formatNumber(b.popMax) : '';
  readPopulation();
  state.driveMax = b.trajetMax ?? null;
  setDriveInput(state.driveMax);
  els.budgetOnly.checked = false;
  setBudgetInputs({ budget: b.budget, surface: b.surface, type: b.type ?? 'maison' });
  els.budgetBox.open = Boolean(b.budget || b.surface);
  state.regions = [];
  state.departements = [];
  setView('results');
  runSearch({ fit: true });
  ensureInsights();
  if (sheet.isMobile()) sheet.setState('half');
  const radius = setPoints()[0]?.radius ?? RADIUS.default;
  const km = `${String(radius).replace('.', ',')} km`;
  const what = listJoin([
    zone ? `${km} autour ${deName(zone.name)}` : `rayon de ${km}`,
    b.popMin || b.popMax ? 'population' : '',
    b.trajetMax ? `trajet max ${formatMinutes(b.trajetMax)}` : '',
    b.budget ? 'budget' : '',
  ]);
  flash(els.feedback, `Fiche de ${b.client || 'ce dossier'} appliquée : ${what}. Les autres filtres sont effacés.`);
});

// Itinéraire de visite (Google Maps)
els.folderRoute.addEventListener('click', () => {
  const folder = findFolder(folders, state.openFolder);
  if (!folder) return;
  const cities = folderCities(folder);
  let chosen = cities.filter((c) => c.statut === 'a-visiter');
  const onlyToVisit = chosen.length > 0;
  if (!onlyToVisit) chosen = cities.filter((c) => c.statut !== 'ecarte');
  const places = chosen.map((c) => data.byCode.get(c.code)).filter(Boolean);
  if (!places.length) {
    flash(els.folderFeedback, 'Aucune commune à visiter dans ce dossier.', true);
    return;
  }
  const start = setPoints()[0] ?? null;
  const link = directionsUrl(start, visitOrder(start, places));
  window.open(link.url, '_blank', 'noopener');
  flash(
    els.folderFeedback,
    (onlyToVisit ? 'Itinéraire des communes « À visiter »' : 'Itinéraire des communes non écartées') +
      (link.truncated ? ` : Google Maps limite à ${link.count} étapes, les plus proches sont ouvertes.` : ' ouvert dans Google Maps.')
  );
});

function openFolder(id) {
  state.openFolder = id;
  els.folderRenameForm.hidden = true;
  const communes = renderFolders();
  if (communes.length) mapView.fitCommunes(communes);
  els.folderTitle.focus({ preventScroll: true });
}

function closeFolder() {
  const id = state.openFolder;
  state.openFolder = null;
  renderFolders();
  els.foldersList.querySelector(`li[data-id="${id}"] button`)?.focus({ preventScroll: true });
}

els.folderCreate.addEventListener('submit', (e) => {
  e.preventDefault();
  const result = createFolder(folders, els.folderName.value);
  if (!result.id) {
    els.folderName.focus();
    return;
  }
  folders = result.folders;
  els.folderName.value = '';
  saveFavorites();
  openFolder(result.id);
});

els.folderBack.addEventListener('click', closeFolder);

els.folderRename.addEventListener('click', () => {
  const folder = findFolder(folders, state.openFolder);
  if (!folder) return;
  els.folderRenameForm.hidden = false;
  els.folderRenameInput.value = folder.nom;
  els.folderRenameInput.focus();
  els.folderRenameInput.select();
});
els.folderRenameCancel.addEventListener('click', () => {
  els.folderRenameForm.hidden = true;
  els.folderRename.focus();
});
els.folderRenameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  folders = renameFolder(folders, state.openFolder, els.folderRenameInput.value);
  els.folderRenameForm.hidden = true;
  saveFavorites();
  renderFolders();
  els.folderTitle.focus({ preventScroll: true });
});

els.folderDelete.addEventListener('click', () => {
  const folder = findFolder(folders, state.openFolder);
  if (!folder) return;
  if (!window.confirm(`Supprimer le dossier « ${folder.nom} » et ses notes ?`)) return;
  folders = deleteFolder(folders, folder.id);
  saveFavorites();
  closeFolder();
  renderList();
});

// ---- Fenêtre « Ranger dans un dossier » ------------------------------------

function renderPicker() {
  const code = state.pickerCode;
  const commune = data?.byCode.get(code);
  if (!commune) return;
  els.pickerCity.textContent = commune.nom + (data.departements[commune.dep] ? ` (${data.departements[commune.dep]})` : '');
  const list = visibleFolders(folders);
  const inside = new Set(foldersContaining(folders, code));
  els.pickerList.replaceChildren(
    ...(list.length
      ? list.map((f) => {
          const input = h('input', { type: 'checkbox', value: f.id });
          input.checked = inside.has(f.id);
          input.addEventListener('change', () => {
            folders = input.checked ? addToFolder(folders, f.id, commune) : removeFromFolder(folders, f.id, code);
            saveFavorites();
            folderMembershipChanged(code);
            renderPicker();
            els.pickerList.querySelector(`input[value="${f.id}"]`)?.focus();
          });
          const n = folderCities(f).length;
          return h('label', {}, input, h('span', {}, f.nom), h('span', { class: 'count' }, `${n} commune${n > 1 ? 's' : ''}`));
        })
      : [h('p', { class: 'empty' }, 'Aucun dossier : créez-en un ci-dessous.')])
  );
}

function openPicker(code) {
  if (!data?.byCode.get(code)) return;
  state.pickerCode = code;
  els.pickerName.value = '';
  renderPicker();
  els.picker.showModal();
  (els.pickerList.querySelector('input') ?? els.pickerName).focus();
}

/** Après un ajout ou un retrait : liste, fiche et onglet Dossiers à jour. */
function folderMembershipChanged(code) {
  renderList();
  if (state.view === 'favorites') renderFavorites();
  if (state.view === 'folders') renderFolders();
  if (state.selected === code && !els.details.hidden) renderDetails(code);
}

els.pickerCreate.addEventListener('submit', (e) => {
  e.preventDefault();
  const commune = data?.byCode.get(state.pickerCode);
  const result = createFolder(folders, els.pickerName.value);
  if (!result.id || !commune) {
    els.pickerName.focus();
    return;
  }
  folders = addToFolder(result.folders, result.id, commune);
  els.pickerName.value = '';
  saveFavorites();
  folderMembershipChanged(commune.code);
  renderPicker();
  els.pickerList.querySelector(`input[value="${result.id}"]`)?.focus();
});
els.pickerClose.addEventListener('click', () => els.picker.close());
els.pickerDone.addEventListener('click', () => els.picker.close());
els.picker.addEventListener('click', (e) => {
  if (e.target === els.picker) els.picker.close();
});

const TABS = [
  ['results', () => els.tabResults, () => els.viewResults],
  ['favorites', () => els.tabFavorites, () => els.viewFavorites],
  ['folders', () => els.tabFolders, () => els.viewFolders],
];

function setView(view) {
  state.view = view;
  for (const [name, tab, panel] of TABS) {
    tab().setAttribute('aria-selected', String(name === view));
    tab().tabIndex = name === view ? 0 : -1;
    panel().hidden = name !== view;
  }
  let communes = [];
  if (view === 'favorites') communes = renderFavorites();
  else if (view === 'folders') communes = renderFolders();
  else mapView.hideFavorites();
  if (!setPoints().length && communes.length) mapView.fitCommunes(communes);
}

TABS.forEach(([name, tab], i) => {
  tab().addEventListener('click', () => setView(name));
  tab().addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][1]();
      next.focus();
      next.click();
    }
  });
});

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
  downloadFile(
    'alentours-favoris.json',
    JSON.stringify(exportUserData({ items: favorites, dossiers: folders }), null, 2),
    'application/json'
  );
  flash(els.favFeedback, 'Favoris et dossiers exportés');
});

els.favExportCsv.addEventListener('click', async () => {
  await ensureInsights();
  const rows = visibleFavorites(favorites)
    .map((f) => ({ fav: f, commune: data.byCode.get(f.code) }))
    .filter((r) => r.commune);
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
  const columns = [...base, ...extra];
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
  const parsed = parseUserDataFile(text);
  if (!parsed.ok) {
    els.importChoice.hidden = true;
    flash(els.favFeedback, 'Fichier invalide', true);
    return;
  }
  pendingImport = parsed;
  const n = parsed.items.length;
  const d = parsed.dossiers.length;
  els.importText.textContent =
    `Le fichier contient ${n} favori${n > 1 ? 's' : ''} et ${d} dossier${d > 1 ? 's' : ''}. ` +
    `Vous avez actuellement ${visibleFavorites(favorites).length} favori(s) et ${visibleFolders(folders).length} dossier(s).`;
  els.importChoice.hidden = false;
  els.importMerge.focus();
});

function finishImport(mode) {
  if (!pendingImport) return;
  const result = importUserData({ items: favorites, dossiers: folders }, pendingImport, mode);
  // Notes d'un ancien fichier (version 1) : rangées dans « Mes notes »
  const migrated = migrateFavoriteNotes(result.items, result.dossiers);
  favorites = migrated.favorites;
  folders = migrated.folders;
  pendingImport = null;
  els.importChoice.hidden = true;
  saveFavorites();
  renderFavorites();
  renderList();
  flash(els.favFeedback, mode === 'replace' ? 'Favoris et dossiers remplacés' : 'Favoris et dossiers fusionnés');
}

els.importMerge.addEventListener('click', () => finishImport('merge'));
els.importReplace.addEventListener('click', () => finishImport('replace'));
els.importCancel.addEventListener('click', () => {
  pendingImport = null;
  els.importChoice.hidden = true;
});

// ---- Synchronisation des favoris (facultative) ---------------------------

function renderSyncState({ status, user, error }) {
  els.sync.hidden = status === 'off';
  if (status === 'off') return;
  const who = user ? (user.name ? `${user.name} (${user.email})` : user.email) : '';
  const texts = {
    idle: 'Non connecté : vos favoris restent sur cet appareil.',
    'signed-out': 'Non connecté : vos favoris restent sur cet appareil.',
    loading: 'Connexion…',
    syncing: `Connecté : ${who} · synchronisation…`,
    synced: `Connecté : ${who} · favoris synchronisés`,
    error: `La synchronisation a échoué (${error}). Vos favoris restent enregistrés sur cet appareil.`,
  };
  els.syncStatus.textContent = texts[status] ?? '';
  els.syncStatus.classList.toggle('error', status === 'error');
  els.syncSignIn.hidden = Boolean(user);
  els.syncSignIn.disabled = status === 'loading';
  els.syncSignOut.hidden = !user;
  els.syncDelete.hidden = !user;
}

function initSync() {
  sync = createSync({
    config: FIREBASE_CONFIG,
    getLocal: () => ({ items: favorites, dossiers: folders }),
    setLocal: applySyncedFavorites,
    onState: renderSyncState,
    flag: { get: () => load(STORAGE_KEYS.sync), set: (v) => save(STORAGE_KEYS.sync, v) },
  });
  sync.start();
}

els.syncSignIn.addEventListener('click', () => sync?.signIn());
els.syncSignOut.addEventListener('click', () => sync?.signOut());
els.syncDelete.addEventListener('click', () => {
  if (window.confirm('Supprimer les favoris enregistrés en ligne ? Ils restent sur cet appareil.')) sync?.deleteRemote();
});
// Envoie les dernières modifications avant que la page soit quittée ou masquée
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sync?.flush();
});

// ---- URL, partage, export, impression ------------------------------------

function currentSearchState() {
  return {
    points: setPoints().map((p) =>
      p.commune
        ? { code: p.commune.code, radius: p.radius }
        : { lat: p.lat, lon: p.lon, radius: p.radius, ...(p.address ? { name: p.name } : {}) }
    ),
    popMin: state.popError ? null : state.popMin,
    popMax: state.popError ? null : state.popMax,
    regions: state.regions,
    departements: state.departements,
    sort: state.sort,
    budget: budgetIsSet(state.budget) ? state.budget : null,
    budgetOnly: budgetIsSet(state.budget) && state.budgetOnly,
    driveMax: state.driveMax,
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
      p.commune || p.address
        ? { name: p.name, radius: p.radius }
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

/** Fiches imprimables pour une liste de favoris ou de villes d'un dossier. */
function printItems(list) {
  return list
    .map((fav) => ({ fav, commune: data.byCode.get(fav.code) }))
    .filter((it) => it.commune)
    .map((it) => ({ ...it, result: resultFor(it.commune) }));
}

function buildPrintView() {
  const common = { appName: APP_NAME, data, insights, pointNames: data ? pointNames() : [] };
  if (data && state.view === 'favorites') {
    els.printView.replaceChildren(
      ...favoritesPrintContent({ ...common, title: 'mes favoris', sections: [{ items: printItems(visibleFavorites(favorites)) }] })
    );
    return;
  }
  if (data && state.view === 'folders' && state.openFolder && findFolder(folders, state.openFolder)) {
    els.printView.replaceChildren(...clientReport(findFolder(folders, state.openFolder)));
    return;
  }
  if (data && state.view === 'folders') {
    const open = state.openFolder ? findFolder(folders, state.openFolder) : null;
    const list = open ? [open] : visibleFolders(folders);
    els.printView.replaceChildren(
      ...favoritesPrintContent({
        ...common,
        title: open ? `dossier « ${open.nom} »` : 'mes dossiers',
        sections: list.map((f) => ({ title: open ? null : f.nom, items: printItems(folderCities(f)) })),
        withNotes: true,
      })
    );
    return;
  }
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

els.foldersPrintAll.addEventListener('click', async () => {
  await ensureInsights();
  buildPrintView();
  window.print();
});

const STATUS_ORDER = { retenu: 0, 'a-visiter': 1, visite: 2 };

/** Communes présentées dans le rapport (sans les écartées), les retenues d'abord. */
function reportTowns(folder) {
  return folderCities(folder)
    .filter((c) => c.statut !== 'ecarte' && data.byCode.get(c.code))
    .sort((a, b) => (STATUS_ORDER[a.statut] ?? 3) - (STATUS_ORDER[b.statut] ?? 3));
}

/** Rapport client (impression) à partir des données déjà connues. */
/** Points du rapport : zone de la fiche client, sinon la recherche en cours. */
function reportPoints(folder) {
  const b = folder.fiche;
  const zone = briefZonePoint(b);
  if (zone) return [{ ...zone, radius: b.zoneRayon ?? setPoints()[0]?.radius ?? RADIUS.default }];
  return setPoints();
}

/** « Communes à moins de 25 km de Lille — 127 communes dans la zone » */
function reportSummary(folder, pts) {
  if (!pts.length) return null;
  if (!briefZonePoint(folder.fiche)) return summaryText();
  const count = searchArea(data.communes, { points: pts.map(({ lat, lon, radius }) => ({ lat, lon, radius })) }).length;
  return searchSummary({ points: pts.map((p) => ({ name: p.name, radius: p.radius })), count }).replace(/résultats?$/, (m) =>
    m === 'résultat' ? 'commune dans la zone' : 'communes dans la zone'
  );
}

/** « a, b et c » */
function listJoin(parts) {
  const list = parts.filter(Boolean);
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} et ${list.at(-1)}` : list.join('');
}


function clientReport(folder) {
  const pts = reportPoints(folder);
  const towns = reportTowns(folder).map((fav) => {
    const commune = data.byCode.get(fav.code);
    return {
      fav,
      commune,
      budget: reportBudget(folder, commune),
      travel: pts.map((p) => knownTravel.get(travelKey(p, commune)) ?? null),
    };
  });
  const shortlist = towns.slice(0, 6).map((t) => t.commune);
  const comparison =
    shortlist.length >= 2
      ? comparisonTableElement(
          comparisonTable(shortlist, {
            data,
            trendSeries: insights.trend ? (code) => insights.trend.get(code) : null,
            prices: insights.prices ? (code) => insights.prices.get(code) : null,
            pricesMeta: insights.pricesMeta ?? {},
            points: pts.map((p) => ({ name: pointShortName(p), lat: p.lat, lon: p.lon })),
            distanceKm,
            travel: pts.length ? (k, code) => knownTravel.get(travelKey(pts[k], { code })) ?? null : null,
            amenities: insights.amenities ? (code) => insights.amenities.get(code) : null,
            budgetOf: (c) => reportBudget(folder, c),
            budgetLabel: 'Estimation',
          })
        )
      : null;
  return clientReportContent({
    appName: APP_NAME,
    folder,
    towns,
    excluded: folderCities(folder).length - towns.length,
    points: pts.map((p) => ({ name: pointShortName(p), lat: p.lat, lon: p.lon, radius: p.radius })),
    data,
    insights,
    summary: reportSummary(folder, pts),
    comparison,
    map: pts.length || towns.length ? reportMap(folder, pts).el : null,
  });
}

// ---- Plan du rapport client ---------------------------------------------------

// Même carte que l'application (fond, thème, points colorés, noms, épingle),
// figée, avec les communes du dossier numérotées comme dans le rapport. Gardée
// tant que rien ne change : l'impression (Ctrl+P compris) la réutilise.
// Taille sur la page (px) ; la carte est dessinée `zoom` fois plus grande puis
// réduite : zoom plus proche, plus de routes et de noms, comme sur un grand écran
const REPORT_MAP = { width: 700, height: 440, zoom: 1.6 };
let reportMapCache = null;

/** Communes de la zone du rapport : celle de la fiche, sinon la recherche en cours. */
function reportZoneResults(folder, pts) {
  const b = folder.fiche;
  if (!briefZonePoint(b)) return results;
  return searchArea(data.communes, {
    points: pts.map(({ lat, lon, radius }) => ({ lat, lon, radius })),
    popMin: b.popMin ?? null,
    popMax: b.popMax ?? null,
  });
}

function reportMap(folder, pts) {
  const towns = reportTowns(folder).map((c) => data.byCode.get(c.code));
  const zone = reportZoneResults(folder, pts);
  const hasBudget = Boolean(insights.prices && ((folder.fiche?.budget && folder.fiche?.surface) || budgetIsSet(state.budget)));
  const key = JSON.stringify([
    pts.map((p) => [p.lat, p.lon, p.radius]),
    towns.map((c) => c.code),
    zone.length,
    hasBudget,
    effectiveTheme(),
    mapView.style,
    mapView.useSatelliteFallback,
  ]);
  if (reportMapCache?.key === key) return reportMapCache;
  if (reportMapCache) {
    reportMapCache.view.map.remove();
    reportMapCache.el.remove();
  }
  const { width, height, zoom } = REPORT_MAP;
  const inner = h('div', { class: 'report-map-inner' });
  inner.style.width = `${width * zoom}px`;
  inner.style.height = `${height * zoom}px`;
  inner.style.transform = `scale(${1 / zoom})`;
  const el = h('div', { class: 'report-map report-map-offscreen' }, inner);
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  // Couleurs des noms du thème affiché (sinon l'impression repasse en clair)
  const root = getComputedStyle(document.documentElement);
  for (const name of ['--text', '--bg', '--surface-2']) el.style.setProperty(name, root.getPropertyValue(name));
  // Leaflet mesure son conteneur : rendu hors de l'écran, puis placé dans le rapport
  document.body.append(el);
  const view = new MapView(inner, {}, { still: true, theme: effectiveTheme(), style: mapView.style, k: zoom });
  if (mapView.useSatelliteFallback) {
    view.useSatelliteFallback = true;
    view.updateBaseLayer();
  }
  view.fitArea(pts, towns, 14 * zoom);
  const inZone = new Set(zone.map((r) => r.commune.code));
  view.render({
    points: pts.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      radius: p.radius,
      isCommune: Boolean(p.commune && inZone.has(p.commune.code)),
      population: p.commune?.population ?? null,
    })),
    colors: pts.map((_, i) => pointColor(i)),
    results: [...zone, ...towns.filter((c) => !inZone.has(c.code)).map((commune) => ({ commune }))],
    names: pts.map(pointShortName),
    favorites: new Set(),
    colorOf: hasBudget
      ? (c) => {
          const check = reportBudget(folder, c);
          return check ? `budget-${check.status}` : null;
        }
      : null,
  });
  view.showNumbered(towns);
  reportMapCache = { key, el, view, ready: view.whenTilesLoaded(8000) };
  return reportMapCache;
}

/** Budget de la fiche client (sinon celui de la recherche). */
function reportBudget(folder, commune) {
  const b = folder.fiche;
  const budget = b?.budget && b?.surface ? { budget: b.budget, surface: b.surface, type: b.type ?? 'maison' } : state.budget;
  if (!budgetIsSet(budget) || !insights.prices) return null;
  return budgetCheck(insights.prices.get(commune.code), commune.dep, budget);
}

els.folderPrint.addEventListener('click', async () => {
  const folder = findFolder(folders, state.openFolder);
  if (!folder) return;
  els.folderPrint.disabled = true;
  flash(els.folderFeedback, 'Préparation du rapport (temps de trajet, plan)…');
  await ensureInsights();
  await travelTable(reportPoints(folder), reportTowns(folder).map((c) => data.byCode.get(c.code)));
  buildPrintView();
  // Fond du plan : on attend les tuiles (8 s au plus) pour ne pas imprimer un plan vide
  await reportMapCache?.ready;
  await imagesLoaded(els.printView, 8000);
  els.folderPrint.disabled = false;
  els.folderFeedback.textContent = '';
  window.print();
});

/** Attend le chargement (ou l'échec) des images d'un élément, `ms` au plus. */
function imagesLoaded(root, ms) {
  const pending = [...root.querySelectorAll('img')]
    .filter((img) => !img.complete)
    .map((img) => new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }));
  return Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, ms))]);
}

els.favoritesPrint.addEventListener('click', async () => {
  await ensureInsights();
  buildPrintView();
  window.print();
});

// ---- Comparaison des favoris ----------------------------------------------

async function openComparison() {
  const communes = [...state.compare].map((code) => data.byCode.get(code)).filter(Boolean);
  if (communes.length < 2) return;
  els.compareBody.replaceChildren(h('p', { class: 'hint' }, 'Calcul des temps de trajet…'));
  els.compareDialog.showModal();
  await ensureInsights();
  const pts = setPoints();
  const travelMap = await travelTable(pts, communes);
  const table = comparisonTable(communes, {
    travel: pts.length ? (k, code) => travelMap.get(`${k}|${code}`) ?? null : null,
    amenities: insights.amenities ? (code) => insights.amenities.get(code) : null,
    budgetOf: budgetIsSet(state.budget) && insights.prices ? budgetFor : null,
    budgetLabel: budgetIsSet(state.budget)
      ? `Estimation (${PROPERTY_TYPES[state.budget.type].toLowerCase()} ${state.budget.surface} m²)`
      : 'Estimation',
    data,
    trendSeries: insights.trend ? (code) => insights.trend.get(code) : null,
    prices: insights.prices ? (code) => insights.prices.get(code) : null,
    pricesMeta: insights.pricesMeta ?? {},
    points: setPoints().map((p) => ({ name: pointShortName(p), lat: p.lat, lon: p.lon })),
    distanceKm,
  });
  els.compareBody.replaceChildren(comparisonTableElement(table));
  els.compareBody.scrollLeft = 0;
}

/** Temps de trajet de chaque point vers chaque commune (10 s au plus). */
async function travelTable(pts, communes) {
  const map = new Map();
  const jobs = pts.flatMap((p, k) =>
    communes.map((c) => travelFor(p, c).then((t) => map.set(`${k}|${c.code}`, t)))
  );
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 10000))]);
  return map;
}

els.compareOpen.addEventListener('click', openComparison);
els.compareClose.addEventListener('click', () => els.compareDialog.close());
// Clic sur le fond assombri : fermeture
els.compareDialog.addEventListener('click', (e) => {
  if (e.target === els.compareDialog) els.compareDialog.close();
});

// ---- Favoris seulement ----------------------------------------------------

els.favoritesOnly.addEventListener('change', () => {
  state.favoritesOnly = els.favoritesOnly.checked;
  runSearch();
});

// ---- Chargement ----------------------------------------------------------

function applyUrlState() {
  const decoded = decodeSearch(location.search, { isKnownCode: (code) => data.byCode.has(code) });
  if (decoded.points?.length) {
    state.points = decoded.points.slice(0, MAX_STARTING_POINTS).map((d) => {
      const p = newPoint(d.radius);
      if (d.code) {
        const c = data.byCode.get(d.code);
        Object.assign(p, { commune: c, lat: c.lat, lon: c.lon, name: c.nom });
      } else if (d.name) {
        Object.assign(p, addressPoint({ lat: d.lat, lon: d.lon, label: d.name }));
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
  if (decoded.budget) {
    els.budgetOnly.checked = Boolean(decoded.budgetOnly);
    setBudgetInputs(decoded.budget);
    els.budgetBox.open = true;
  }
  if (decoded.driveMax) {
    state.driveMax = decoded.driveMax;
    setDriveInput(decoded.driveMax);
  }
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
  if (load(STORAGE_KEYS.notesMigrated) !== '1') {
    const migrated = migrateFavoriteNotes(favorites, folders);
    favorites = migrated.favorites;
    folders = migrated.folders;
    save(STORAGE_KEYS.notesMigrated, '1');
  }
  saveFavorites({ fromSync: true });
  initSync();
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
