// Configuration centrale. Le nom du site, les seuils et les valeurs par défaut
// sont définis ici et nulle part ailleurs.

export const APP_NAME = 'Alentours';

// Catégories de taille, par population minimale (bornes incluses).
// L'ordre compte : de la plus petite à la plus grande.
export const SIZE_CATEGORIES = [
  { id: 'village', label: 'Village', min: 0 },
  { id: 'petite', label: 'Petite ville', min: 2000 },
  { id: 'moyenne', label: 'Ville moyenne', min: 10000 },
  { id: 'grande', label: 'Grande ville', min: 50000 },
];

export const UNKNOWN_CATEGORY = { id: 'inconnue', label: 'Inconnue' };

export const RADIUS = { min: 1, max: 100, step: 1, default: 20 };

// Intervalle des cercles de distance, en km
export const RING_INTERVAL_KM = 10;

// Taille des marqueurs : échelle racine carrée, bornée
export const MARKER = { minPx: 3, maxPx: 20, referencePopulation: 500000 };

// Nombre de lignes affichées à la fois dans la liste
export const LIST_PAGE_SIZE = 100;

// Délai avant de relancer la recherche lors du déplacement du curseur
export const SEARCH_DEBOUNCE_MS = 150;

export const AUTOCOMPLETE = { minChars: 2, maxResults: 10 };

export const MAP_START = { lat: 46.6, lon: 2.5, zoom: 6 };

// Phase 2
export const MAX_STARTING_POINTS = 5;
export const POINT_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c'];
export const TREND_STABLE_PERCENT = 1;
export const DVF_MIN_SALES = 5;
export const DVF_NOT_COVERED = ['57', '67', '68', '976'];

export const STORAGE_KEYS = {
  theme: 'alentours.theme',
  mapStyle: 'alentours.carte',
  rings: 'alentours.cercles',
  favorites: 'alentours.favoris.v1',
};
