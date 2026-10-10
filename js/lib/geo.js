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

/** Rayon du marqueur en pixels : échelle racine carrée, bornée. */
export function markerRadius(population, { minPx, maxPx, referencePopulation }) {
  if (!Number.isFinite(population) || population <= 0) return minPx;
  const r = minPx + (maxPx - minPx) * Math.sqrt(population / referencePopulation);
  return Math.max(minPx, Math.min(maxPx, r));
}

export { KM_PER_DEGREE };
