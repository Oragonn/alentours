// Réglages du compte, synchronisés avec les favoris (fonctions pures).
// Forme : { depart: { nom, lat, lon, code? } | null, modifie: date ISO }
//   depart : ville (ou adresse) de départ des itinéraires de visite ; null =
//            effacée (gardé tel quel pour que l'effacement se propage).

const isDate = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** Nettoie un lieu de départ ; null s'il est invalide. */
export function cleanPlace(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  const nom = typeof p.nom === 'string' ? p.nom.trim().slice(0, 150) : '';
  if (!nom || p.lat == null || p.lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const place = { nom, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
  if (typeof p.code === 'string' && /^[0-9][0-9AB][0-9]{3}$/.test(p.code)) place.code = p.code;
  return place;
}

/** Nettoie les réglages reçus (serveur, stockage local) ; null s'ils sont absents. */
export function cleanSettings(r) {
  if (!r || typeof r !== 'object' || !isDate(r.modifie)) return null;
  return { depart: cleanPlace(r.depart), modifie: r.modifie };
}

/** Fusion de deux appareils : les réglages modifiés le plus récemment l'emportent. */
export function mergeSettings(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(b.modifie) > Date.parse(a.modifie) ? b : a;
}

export const sameSettings = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Nouveau lieu de départ (ou null pour l'effacer). */
export function setDeparture(settings, place, now = new Date()) {
  return { ...(settings ?? {}), depart: cleanPlace(place), modifie: now.toISOString() };
}
