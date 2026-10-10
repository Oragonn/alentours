// Encodage de la recherche dans l'URL (fonctions pures).
//
// Un point :        ?c=59350&r=30&pmin=10000&tri=population-desc
// Point sur carte : ?lat=50.62920&lon=3.05730&r=30
// Plusieurs points (Phase 2) : ?pt=59350,20&pt=62041,15&pt=50.62920,3.05730,10
// Filtres :         &reg=32&dep=59,62

import { RADIUS } from '../config.js';
import { formatSort, parseSort } from './sort.js';

const CODE_RE = /^[0-9][0-9AB][0-9]{3}$/;
const DEP_RE = /^(\d{2,3}|2A|2B)$/;
const REG_RE = /^\d{2,3}$/;

const fixed5 = (n) => Number(n).toFixed(5);
const enc = (v) => encodeURIComponent(v).replace(/%2C/gi, ',');

function radiusOrNull(text) {
  const n = Number(text);
  if (!Number.isFinite(n) || n < RADIUS.min || n > RADIUS.max) return null;
  return n;
}

function latLonOrNull(latText, lonText) {
  const lat = Number(latText);
  const lon = Number(lonText);
  if (latText === '' || lonText === '' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

const popOrNull = (text) => (/^\d{1,9}$/.test(text ?? '') ? Number(text) : null);

/** État de recherche → chaîne de requête (avec « ? », ou chaîne vide). */
export function encodeSearch(state) {
  const parts = [];
  const add = (k, v) => parts.push(`${k}=${enc(v)}`);
  const points = (state.points ?? []).filter((p) => p && (p.code || (Number.isFinite(p.lat) && Number.isFinite(p.lon))));

  if (points.length === 1) {
    const p = points[0];
    if (p.code) add('c', p.code);
    else {
      add('lat', fixed5(p.lat));
      add('lon', fixed5(p.lon));
    }
    add('r', p.radius);
  } else {
    for (const p of points) {
      add('pt', p.code ? `${p.code},${p.radius}` : `${fixed5(p.lat)},${fixed5(p.lon)},${p.radius}`);
    }
  }
  if (state.popMin != null) add('pmin', state.popMin);
  if (state.popMax != null) add('pmax', state.popMax);
  if (state.regions?.length) add('reg', state.regions.join(','));
  if (state.departements?.length) add('dep', state.departements.join(','));
  if (state.sort && !(state.sort.key === 'distance' && state.sort.dir === 'asc')) add('tri', formatSort(state.sort));
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Chaîne de requête → état partiel. Les paramètres invalides ou inconnus
 * sont ignorés. `isKnownCode(code)` permet d'écarter les codes INSEE absents
 * des données.
 */
export function decodeSearch(query, { isKnownCode = () => true } = {}) {
  const params = new URLSearchParams(query);
  const state = {};
  const points = [];

  const pointFromParts = (parts) => {
    if (parts.length === 2) {
      const [code, r] = parts;
      const radius = radiusOrNull(r);
      if (CODE_RE.test(code) && isKnownCode(code)) return { code, radius: radius ?? RADIUS.default };
    } else if (parts.length === 3) {
      const ll = latLonOrNull(parts[0], parts[1]);
      const radius = radiusOrNull(parts[2]);
      if (ll) return { ...ll, radius: radius ?? RADIUS.default };
    }
    return null;
  };

  const ptValues = params.getAll('pt');
  if (ptValues.length) {
    for (const v of ptValues) {
      const p = pointFromParts(v.split(','));
      if (p) points.push(p);
    }
  } else {
    const radius = radiusOrNull(params.get('r')) ?? RADIUS.default;
    const code = params.get('c');
    const ll = latLonOrNull(params.get('lat') ?? '', params.get('lon') ?? '');
    if (code && CODE_RE.test(code) && isKnownCode(code)) points.push({ code, radius });
    else if (ll) points.push({ ...ll, radius });
    else if (params.has('r') && radiusOrNull(params.get('r')) != null) state.radius = radius;
  }
  if (points.length) state.points = points;

  const popMin = popOrNull(params.get('pmin'));
  const popMax = popOrNull(params.get('pmax'));
  if (popMin != null) state.popMin = popMin;
  if (popMax != null) state.popMax = popMax;

  const list = (name, re) =>
    [...new Set((params.get(name) ?? '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => re.test(s)))];
  const regions = list('reg', REG_RE);
  const departements = list('dep', DEP_RE);
  if (regions.length) state.regions = regions;
  if (departements.length) state.departements = departements;

  const sort = parseSort(params.get('tri'));
  if (sort) state.sort = sort;
  return state;
}
