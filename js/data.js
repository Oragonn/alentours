// Chargement des fichiers de données statiques.

import { prepareData } from './lib/commune.js';
import { amenityCounts } from './lib/amenities.js';

// Empreintes des fichiers de données (bloc généré par npm run stamp dans
// index.html) : une nouvelle version des données n'est jamais lue depuis un
// ancien cache.
const VERSIONS = (() => {
  try {
    return JSON.parse(document.getElementById('asset-versions')?.textContent || '{}');
  } catch {
    return {};
  }
})();

async function fetchJson(path) {
  const url = VERSIONS[path] ? `${path}?v=${VERSIONS[path]}` : path;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return res.json();
}

/** Communes + tables des départements et régions (indispensables). */
export async function loadData() {
  const [communes, departements, regions] = await Promise.all([
    fetchJson('data/communes.json'),
    fetchJson('data/departements.json'),
    fetchJson('data/regions.json'),
  ]);
  return prepareData({ communes, departements, regions });
}

/**
 * Données complémentaires (Phase 2), facultatives : tendance démographique
 * et prix DVF. Une erreur de chargement n'empêche pas le site de fonctionner.
 */
export async function loadInsights() {
  const [trend, prices, amenities] = await Promise.allSettled([
    fetchJson('data/population-trend.json'),
    fetchJson('data/prix.json'),
    fetchJson('data/equipements.json'),
  ]);
  const insights = { trendLoaded: true, pricesLoaded: true, trend: null, prices: null, pricesMeta: null, amenities: null };
  if (trend.status === 'fulfilled') {
    const { years, data } = trend.value;
    insights.trend = {
      years,
      get(code) {
        const values = data[code];
        return values ? { years, values } : null;
      },
    };
    insights.trendMeta = trend.value.meta ?? {};
  }
  if (prices.status === 'fulfilled') {
    const { meta, fields, data } = prices.value;
    insights.pricesMeta = meta ?? {};
    // Ligne : [prixMaison, ventesMaison, prixAppartement, ventesAppartement]
    insights.prices = {
      get(code) {
        const row = data[code];
        if (!row) return null;
        const at = (name) => row[fields.indexOf(name)];
        return {
          maison: { prix: at('prixMaison'), ventes: at('ventesMaison') },
          appartement: { prix: at('prixAppartement'), ventes: at('ventesAppartement') },
        };
      },
    };
  }
  if (amenities.status === 'fulfilled') {
    const { meta, fields, data } = amenities.value;
    insights.amenitiesMeta = meta ?? {};
    insights.amenities = { get: (code) => amenityCounts(data[code], fields) };
  }
  return insights;
}
