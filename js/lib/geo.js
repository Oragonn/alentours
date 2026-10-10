// Calculs géographiques purs (aucun accès au DOM).

export const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE = (Math.PI * EARTH_RADIUS_KM) / 180; // ≈ 111,195 km

const toRad = (deg) => (deg * Math.PI) / 180;

/** Distance orthodromique (formule de haversine), en km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Rectangle latitude/longitude qui contient le cercle de rayon `radiusKm`.
 * Sert de pré-filtre rapide avant la formule de haversine.
 * `wrapsLon` vaut true si le rectangle traverse l'antiméridien ou un pôle :
 * dans ce cas, la longitude ne doit pas servir de pré-filtre.
 */
export function boundingBox(lat, lon, radiusKm) {
  const dLat = radiusKm / KM_PER_DEGREE;
  const minLat = lat - dLat;
  const maxLat = lat + dLat;
  const cosLat = Math.cos(toRad(Math.max(Math.abs(minLat), Math.abs(maxLat))));
  if (maxLat >= 90 || minLat <= -90 || cosLat < 1e-6) {
    return { minLat, maxLat, minLon: -180, maxLon: 180, wrapsLon: true };
  }
  const dLon = radiusKm / (KM_PER_DEGREE * cosLat);
  const minLon = lon - dLon;
  const maxLon = lon + dLon;
  return { minLat, maxLat, minLon, maxLon, wrapsLon: minLon < -180 || maxLon > 180 };
}

/**
 * Écart entre les cercles de distance : la plus petite valeur ronde qui donne
 * au plus `target` cercles dans le rayon (le cercle du rayon compris).
 */
export function ringInterval(radiusKm, { steps, target }) {
  return steps.find((s) => radiusKm / s <= target) ?? steps[steps.length - 1];
}

/** Rayons des cercles intérieurs (sans le cercle de recherche lui-même). */
export function ringDistances(radiusKm, cfg) {
  const step = ringInterval(radiusKm, cfg);
  const out = [];
  for (let d = step; d < radiusKm - 1e-9; d += step) out.push(d);
  return out;
}

/** Les cercles se chevauchent-ils deux à deux ? */
export function zonesOverlap(points) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      if (distanceKm(a.lat, a.lon, b.lat, b.lon) > a.radius + b.radius) return false;
    }
  }
  return true;
}

/** Facteur d'agrandissement des marqueurs selon le zoom. */
export function zoomScale(zoom, { zoomFrom = Infinity, zoomGrowth = 0, zoomMax = 1 } = {}) {
  if (!Number.isFinite(zoom) || zoom <= zoomFrom) return 1;
  return Math.min(zoomMax, 1 + (zoom - zoomFrom) * zoomGrowth);
}

/**
 * Rayon du marqueur en pixels : échelle racine carrée de la population,
 * bornée, puis agrandie selon le zoom (si fourni).
 */
export function markerRadius(population, cfg, zoom) {
  const { minPx, maxPx, referencePopulation } = cfg;
  let r = minPx;
  if (Number.isFinite(population) && population > 0) {
    r = Math.max(minPx, Math.min(maxPx, minPx + (maxPx - minPx) * Math.sqrt(population / referencePopulation)));
  }
  return r * zoomScale(zoom, cfg);
}

export { KM_PER_DEGREE };

/** Point dans un anneau (liste de [lon, lat]) : algorithme du rayon. */
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Le point est-il dans une géométrie GeoJSON (Polygon ou MultiPolygon, trous compris) ? */
export function pointInGeometry(lat, lon, geometry) {
  if (!geometry) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(([outer, ...holes]) => inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h)));
}

/**
 * Le point est-il dans la géométrie, ou à moins de `km` de son bord ?
 * (projection locale : suffisant pour quelques kilomètres)
 */
export function nearGeometry(lat, lon, geometry, km) {
  if (pointInGeometry(lat, lon, geometry)) return true;
  if (!geometry || !(km > 0)) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  const kx = KM_PER_DEGREE * Math.cos(toRad(lat));
  const ky = KM_PER_DEGREE;
  const km2 = km * km;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        // Segment en km, le point étant à l'origine
        const ax = (ring[j][0] - lon) * kx;
        const ay = (ring[j][1] - lat) * ky;
        const dx = (ring[i][0] - lon) * kx - ax;
        const dy = (ring[i][1] - lat) * ky - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        const x = ax + t * dx;
        const y = ay + t * dy;
        if (x * x + y * y <= km2) return true;
      }
    }
  }
  return false;
}

/**
 * Ordre de visite : plus proche voisin à partir du point de départ.
 * start : { lat, lon } ou null ; places : [{ lat, lon, ... }]
 */
export function visitOrder(start, places) {
  const left = [...places];
  const order = [];
  let cur = start ?? left[0];
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (distanceKm(cur.lat, cur.lon, left[i].lat, left[i].lon) < distanceKm(cur.lat, cur.lon, left[best].lat, left[best].lon)) best = i;
    }
    cur = left.splice(best, 1)[0];
    order.push(cur);
  }
  return order;
}

/**
 * Lien Google Maps d'itinéraire (voiture). Google accepte au plus 9 étapes
 * entre le départ et l'arrivée : renvoie { url, count, truncated }.
 */
export function directionsUrl(start, places, maxWaypoints = 9) {
  const stops = places.slice(0, maxWaypoints + (start ? 1 : 2));
  if (!stops.length) return null;
  const ll = (p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  const origin = start ?? stops[0];
  const rest = start ? stops : stops.slice(1);
  const destination = rest[rest.length - 1] ?? origin;
  const waypoints = rest.slice(0, -1);
  const params = new URLSearchParams({ api: '1', origin: ll(origin), destination: ll(destination), travelmode: 'driving' });
  if (waypoints.length) params.set('waypoints', waypoints.map(ll).join('|'));
  return { url: `https://www.google.com/maps/dir/?${params}`, count: stops.length, truncated: places.length > stops.length };
}
