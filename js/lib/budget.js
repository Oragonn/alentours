// Budget du client : prix estimé d'un bien dans chaque commune (fonctions pures).
//
// Estimation = prix médian au m² (DVF) × surface voulue. C'est un ordre de
// grandeur : le prix d'un bien précis peut s'écarter de 15 à 25 % de la médiane.

import { DVF_MIN_SALES, DVF_NOT_COVERED } from '../config.js';

export const PROPERTY_TYPES = { maison: 'Maison', appartement: 'Appartement' };

// Marge « limite » : jusqu'à 10 % au-dessus du budget
export const BUDGET_MARGIN = 0.1;

/** Fiabilité du prix médian selon le nombre de ventes. */
export function priceReliability(sales) {
  if (!Number.isFinite(sales) || sales < DVF_MIN_SALES) return { id: 'insuffisant', label: 'Données insuffisantes' };
  if (sales >= 100) return { id: 'bonne', label: 'Fiabilité bonne' };
  if (sales >= 20) return { id: 'correcte', label: 'Fiabilité correcte' };
  return { id: 'fragile', label: 'Fiabilité fragile (peu de ventes)' };
}

/** Le budget est-il complet ? { budget > 0, type, surface > 0 } */
export const budgetIsSet = (b) =>
  Boolean(b && Number.isFinite(b.budget) && b.budget > 0 && PROPERTY_TYPES[b.type] && Number.isFinite(b.surface) && b.surface > 0);

/**
 * Prix estimé dans une commune.
 * entry : { maison: { prix, ventes }, appartement: { prix, ventes } } (DVF)
 * Renvoie { status: 'ok' | 'limite' | 'trop' | 'inconnu', estimate, pricePerM2, sales, reliability, ratio }
 */
export function budgetCheck(entry, departement, b) {
  if (!budgetIsSet(b)) return null;
  if (DVF_NOT_COVERED.includes(departement)) return { status: 'inconnu', reason: 'Non couvert par DVF' };
  const t = entry?.[b.type];
  const reliability = priceReliability(t?.ventes);
  if (!t || !Number.isFinite(t.prix) || reliability.id === 'insuffisant') {
    return { status: 'inconnu', reason: 'Données insuffisantes', sales: t?.ventes ?? 0 };
  }
  const estimate = t.prix * b.surface;
  const ratio = estimate / b.budget;
  const status = ratio <= 1 ? 'ok' : ratio <= 1 + BUDGET_MARGIN ? 'limite' : 'trop';
  return { status, estimate, pricePerM2: t.prix, sales: t.ventes, reliability, ratio };
}

export const BUDGET_STATUS_LABELS = {
  ok: 'Dans le budget',
  limite: 'Limite (jusqu’à +10 %)',
  trop: 'Au-dessus du budget',
  inconnu: 'Prix inconnu',
};

/** « 245 k€ » / « 1,2 M€ » */
export function formatEuros(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e6) return `${(Math.round(value / 1e5) / 10).toString().replace('.', ',')} M€`;
  return `${Math.round(value / 1000)} k€`;
}
