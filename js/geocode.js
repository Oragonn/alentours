// Recherche d'adresses : service de géocodage de la Géoplateforme IGN (Base
// Adresse Nationale, gratuit, sans clé). Les communes restent cherchées dans
// les données locales ; seules les adresses passent par le service.

const BASE = 'https://data.geopf.fr/geocodage/search';
const KINDS = { housenumber: 'Adresse', street: 'Rue', locality: 'Lieu-dit' };
const cache = new Map();

// Mots qui annoncent une voie : « rue », « av. », « chemin »…
const STREET_WORDS =
  /(^|[\s,])(rue|avenue|av|bd|boulevard|bld|chemin|che|allees?|place|pl|impasse|imp|route|rte|quai|cours|chaussee|square|sq|residence|lieu-dit|hameau|lotissement|faubourg|fg|voie|sentier|rond-point|esplanade|promenade|passage|parvis|cite|clos|domaine|mail|montee|ruelle|traverse|venelle|zac)\.?(\s|$)/i;

/**
 * La saisie ressemble-t-elle à une adresse ? Un numéro suivi d'un nom
 * (« 12 rue de Vesle »), un type de voie, ou aucune commune trouvée.
 */
export function looksLikeAddress(query, communesFound = true) {
  const q = String(query ?? '').trim();
  if (q.length < 4 || /^\d+$/.test(q)) return false;
  if (/\d/.test(q) && /\p{L}{2}/u.test(q)) return true;
  const plain = q.normalize('NFD').replace(/\p{M}/gu, '');
  return STREET_WORDS.test(plain) || !communesFound;
}

/**
 * Adresses correspondant à la saisie (communes exclues).
 * Promesse de [{ address: true, label, city, citycode, kind, lat, lon }].
 */
export function searchAddresses(query, { limit = 6 } = {}) {
  const q = String(query ?? '').trim();
  const key = `${q.toLowerCase()}|${limit}`;
  if (!cache.has(key)) {
    const params = new URLSearchParams({ q, limit: String(limit + 2), index: 'address', autocomplete: '1' });
    const p = fetch(`${BASE}?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Géocodage IGN : HTTP ${res.status}`);
        return res.json();
      })
      .then((j) =>
        (j.features ?? [])
          .filter((f) => KINDS[f.properties?.type] && Array.isArray(f.geometry?.coordinates))
          .slice(0, limit)
          .map((f) => ({
            address: true,
            label: f.properties.label,
            city: f.properties.city ?? '',
            citycode: f.properties.citycode ?? '',
            kind: KINDS[f.properties.type],
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
          }))
      );
    p.catch(() => cache.delete(key)); // nouvel essai possible plus tard
    cache.set(key, p);
  }
  return cache.get(key);
}
