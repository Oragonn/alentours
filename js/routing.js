// Temps de trajet en voiture : services d'itinéraire et d'isochrone de la
// Géoplateforme IGN (gratuits, sans clé). Les réponses sont gardées en
// mémoire pour ne pas solliciter le service plusieurs fois.

const BASE = 'https://data.geopf.fr/navigation';
const MAX_PARALLEL = 3;

const routeCache = new Map();
const isoCache = new Map();
let running = 0;
const queue = [];

const key5 = (n) => n.toFixed(4);

/** File d'attente : au plus MAX_PARALLEL requêtes en même temps. */
function schedule(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}

function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const { task, resolve, reject } = queue.shift();
    running++;
    task()
      .then(resolve, reject)
      .finally(() => {
        running--;
        pump();
      });
  }
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Service IGN : HTTP ${res.status}`);
  return res.json();
}

/**
 * Trajet en voiture le plus rapide entre deux points.
 * Renvoie une promesse de { minutes, km } (null si aucun itinéraire).
 */
export function travelTime(from, to) {
  const k = `${key5(from.lat)},${key5(from.lon)}>${key5(to.lat)},${key5(to.lon)}`;
  if (!routeCache.has(k)) {
    const params = new URLSearchParams({
      resource: 'bdtopo-osrm',
      start: `${from.lon},${from.lat}`,
      end: `${to.lon},${to.lat}`,
      profile: 'car',
      optimization: 'fastest',
      getSteps: 'false',
      geometryFormat: 'geojson',
      timeUnit: 'minute',
      distanceUnit: 'kilometer',
    });
    const p = schedule(() => getJson(`${BASE}/itineraire?${params}`)).then((j) =>
      Number.isFinite(j.duration) ? { minutes: j.duration, km: j.distance } : null
    );
    p.catch(() => routeCache.delete(k)); // nouvel essai possible plus tard
    routeCache.set(k, p);
  }
  return routeCache.get(k);
}

/**
 * Zone atteignable en voiture en `minutes` depuis un point (GeoJSON).
 * Renvoie une promesse de géométrie Polygon / MultiPolygon.
 */
export function isochrone(point, minutes) {
  const k = `${key5(point.lat)},${key5(point.lon)}@${minutes}`;
  if (!isoCache.has(k)) {
    const params = new URLSearchParams({
      point: `${point.lon},${point.lat}`,
      resource: 'bdtopo-valhalla',
      costValue: String(minutes * 60),
      costType: 'time',
      profile: 'car',
      direction: 'departure',
      geometryFormat: 'geojson',
    });
    const p = schedule(() => getJson(`${BASE}/isochrone?${params}`)).then((j) => {
      if (!j.geometry) throw new Error('Zone de trajet introuvable');
      return j.geometry;
    });
    p.catch(() => isoCache.delete(k));
    isoCache.set(k, p);
  }
  return isoCache.get(k);
}

/** « 23 min » / « 1 h 05 » */
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
