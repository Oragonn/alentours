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

// Trajet max en voiture saisi librement (minutes)
export const DRIVE = { min: 5, max: 120 };

// Cercles de distance : l'écart s'adapte au rayon pour en avoir environ
// RINGS.target, choisi parmi des valeurs rondes (km).
export const RINGS = { steps: [1, 2, 5, 10, 20, 25], target: 4 };

// Taille des marqueurs : échelle racine carrée, bornée. En zoomant, les
// points grossissent (× zoomGrowth par niveau au-delà de zoomFrom, jusqu'à
// × zoomMax) pour rester visibles, en particulier sur la vue satellite.
export const MARKER = {
  minPx: 4,
  maxPx: 20,
  referencePopulation: 500000,
  zoomFrom: 9,
  zoomGrowth: 0.25,
  zoomMax: 1.8,
};

// Noms des communes sur la carte : population minimale selon le zoom
// ([zoom maximal, population minimale]) ; au-delà, tous les noms.
export const LABELS = {
  maxCount: 250,
  steps: [
    [7, 100000],
    [8, 30000],
    [9, 8000],
    [10, 2000],
    [11, 500],
  ],
};

// Nombre de lignes affichées à la fois dans la liste
export const LIST_PAGE_SIZE = 100;

// Délai avant de relancer la recherche lors du déplacement du curseur
export const SEARCH_DEBOUNCE_MS = 150;

export const AUTOCOMPLETE = { minChars: 2, maxResults: 10 };

export const MAP_START = { lat: 46.6, lon: 2.5, zoom: 6 };
// Vue de départ : France métropolitaine entière (zoom 6 sur grand écran, 5 sur téléphone)
export const FRANCE_BOUNDS = [
  [42.3, -4.8],
  [51.1, 8.2],
];

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
  folders: 'alentours.dossiers.v1',
  notesMigrated: 'alentours.notes-dossiers',
  sync: 'alentours.sync',
  settings: 'alentours.reglages.v1',
};
