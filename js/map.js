// Carte Leaflet : fonds de carte, cercles de recherche, marqueurs des communes.

/* global L */
import { FRANCE_BOUNDS, LABELS, MAP_START, MARKER, RINGS, STORAGE_KEYS } from './config.js';
import { labelMinPopulation, placeLabels } from './lib/labels.js';
import { boundingBox, KM_PER_DEGREE, markerRadius, ringDistances } from './lib/geo.js';
import { sizeCategoryOf } from './lib/commune.js';
import { load, save } from './storage.js';

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">les contributeurs d’OpenStreetMap</a>';

const TILES = {
  planLight: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: OSM_ATTRIBUTION },
  },
  // Les fonds sombres gratuits (CARTO Dark Matter…) exigent désormais une clé :
  // en mode sombre, les tuiles OSM sont assombries par un filtre CSS.
  planDark: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: OSM_ATTRIBUTION, className: 'tiles-dark' },
  },
  satellite: {
    url:
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS' +
      '&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    options: {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.ign.fr/">IGN</a> – <a href="https://geoservices.ign.fr/">Géoplateforme</a>',
    },
  },
  satelliteFallback: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 19,
      attribution: 'Imagerie &copy; Esri, Maxar, Earthstar Geographics',
    },
  },
};

const MOBILE_QUERY = window.matchMedia('(max-width: 767.98px)');

// Rayon (px) des numéros du plan du rapport : le nom se place à côté
const NUMBER_RADIUS = 11;

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Épingle du point de départ ; `lift` la remonte (en px) pour pointer sur un marqueur sans le cacher. */
function pinIcon(color, lift = 0) {
  const svg = `<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true">
    <path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.3 15 39 15 39s14-13.7 14-24.1C29 7.2 22.7 1 15 1z"
      fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="15" cy="15" r="5.5" fill="#fff"/>
  </svg>`;
  return L.divIcon({
    className: 'start-marker',
    html: svg,
    iconSize: [30, 40],
    iconAnchor: [15, 39 + lift],
    tooltipAnchor: [0, -36 - lift],
  });
}

export class MapView {
  /**
   * @param {HTMLElement} el
   * @param {object} handlers { onMapClick(), onCommuneClick(code), getPadding() }
   * @param {object} options { still, theme, style } : `still` = carte figée
   *   (rapport imprimé) : ni contrôles ni interactions, thème et fond imposés.
   */
  constructor(el, handlers, { still = false, theme = 'light', style = null } = {}) {
    this.handlers = handlers;
    this.still = still;
    this.theme = theme;
    this.style = style ?? (load(STORAGE_KEYS.mapStyle) === 'satellite' ? 'satellite' : 'plan');
    this.priorityCodes = null;
    this.markers = new Map();
    this.results = [];
    this.points = [];
    this.colors = [];
    this.rings = false;
    this.useSatelliteFallback = false;

    const animate = !still && !reducedMotion();
    const map = (this.map = L.map(el, {
      center: [MAP_START.lat, MAP_START.lon],
      zoom: MAP_START.zoom,
      zoomControl: false,
      preferCanvas: true,
      worldCopyJump: true,
      zoomAnimation: animate,
      fadeAnimation: animate,
      markerZoomAnimation: animate,
      ...(still
        ? {
            dragging: false,
            touchZoom: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
            trackResize: false,
            // Cadrage au plus juste de la zone (tuiles à peine agrandies)
            zoomSnap: 0.25,
          }
        : {}),
    }));
    // Cadre la France métropolitaine (sans animation) avant de charger les tuiles
    const startZoom = Math.min(MAP_START.zoom, map.getBoundsZoom(FRANCE_BOUNDS, false, L.point(8, 8)));
    map.setView([MAP_START.lat, MAP_START.lon], startZoom, { animate: false });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    if (!still) L.control.zoom({ position: 'topleft', zoomInTitle: 'Zoom avant', zoomOutTitle: 'Zoom arrière' }).addTo(map);

    map.createPane('zonesPane').style.zIndex = 350;
    map.createPane('highlightPane').style.zIndex = 450;
    // Noms des communes : au-dessus des points, sous les épingles (600)
    map.createPane('labelsPane').style.zIndex = 550;
    map.getPane('highlightPane').style.pointerEvents = 'none';

    this.renderer = L.canvas({ padding: 0.5, tolerance: 5 });
    this.zonesRenderer = L.canvas({ pane: 'zonesPane', padding: 0.5 });
    this.highlightRenderer = L.svg({ pane: 'highlightPane' });

    this.zonesLayer = L.layerGroup().addTo(map);
    this.ringsLayer = L.layerGroup().addTo(map);
    this.resultsLayer = L.layerGroup().addTo(map);
    this.highlightLayer = L.layerGroup().addTo(map);
    this.startLayer = L.layerGroup().addTo(map);
    this.labelsLayer = L.layerGroup().addTo(map);
    this.pins = [];
    this.favoritesLayer = L.layerGroup();
    this.numbersLayer = L.layerGroup().addTo(map);

    this.tooltip = L.tooltip({ className: 'commune-tooltip', direction: 'top', opacity: 1 });

    // Les points grossissent en zoomant ; les noms suivent la vue
    map.on('zoomend', () => {
      this.restyleMarkers();
      this.updatePins();
    });
    map.on('moveend', () => this.updateLabels());
    if (still) {
      this.updateBaseLayer();
      return;
    }
    this.addStyleControl();
    this.setupClick();
    this.placeAttribution();
    MOBILE_QUERY.addEventListener('change', () => this.placeAttribution());
  }

  // ---- Fonds de carte ----------------------------------------------------

  addStyleControl() {
    const view = this;
    const Control = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const div = L.DomUtil.create('div', 'map-style-control leaflet-control');
        div.setAttribute('role', 'group');
        div.setAttribute('aria-label', 'Style de carte');
        for (const [value, label] of [
          ['plan', 'Plan'],
          ['satellite', 'Satellite'],
        ]) {
          const btn = L.DomUtil.create('button', '', div);
          btn.type = 'button';
          btn.textContent = label;
          btn.dataset.style = value;
          btn.addEventListener('click', () => view.setStyle(value));
        }
        L.DomEvent.disableClickPropagation(div);
        view.styleControlEl = div;
        return div;
      },
    });
    this.styleControl = new Control().addTo(this.map);
  }

  setTheme(theme) {
    this.theme = theme;
    this.updateBaseLayer();
    this.restyleMarkers();
  }

  setStyle(style) {
    this.style = style;
    save(STORAGE_KEYS.mapStyle, style);
    this.updateBaseLayer();
    this.restyleMarkers();
  }

  updateBaseLayer() {
    let key;
    if (this.style === 'satellite') key = this.useSatelliteFallback ? 'satelliteFallback' : 'satellite';
    else key = this.theme === 'dark' ? 'planDark' : 'planLight';
    if (this.baseKey !== key) {
      if (this.baseLayer) this.map.removeLayer(this.baseLayer);
      const { url, options } = TILES[key];
      this.baseLayer = L.tileLayer(url, options).addTo(this.map);
      this.baseKey = key;
      if (key === 'satellite') this.watchSatellite(this.baseLayer);
    }
    // Couleurs des noms adaptées à la photo aérienne
    this.map.getContainer().classList.toggle('map-satellite', this.style === 'satellite');
    for (const btn of this.styleControlEl?.querySelectorAll('button') ?? []) {
      btn.setAttribute('aria-pressed', String(btn.dataset.style === this.style));
    }
  }

  /** Promesse résolue quand les tuiles visibles sont chargées (ou après `timeout` ms). */
  whenTilesLoaded(timeout = 4000) {
    return new Promise((resolve) => {
      const layer = this.baseLayer;
      if (!layer || !layer.isLoading()) {
        setTimeout(resolve, 0);
        return;
      }
      const timer = setTimeout(resolve, timeout);
      layer.once('load', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Bascule vers l'imagerie Esri si la Géoplateforme IGN ne répond pas. */
  watchSatellite(layer) {
    let loaded = 0;
    let errors = 0;
    layer.on('tileload', () => loaded++);
    layer.on('tileerror', () => {
      errors++;
      if (errors >= 4 && loaded === 0 && !this.useSatelliteFallback) {
        this.useSatelliteFallback = true;
        this.updateBaseLayer();
      }
    });
  }

  /** Sur mobile, le bas de la carte est caché par le panneau coulissant. */
  placeAttribution() {
    const mobile = MOBILE_QUERY.matches;
    this.map.attributionControl.setPosition(mobile ? 'topright' : 'bottomright');
    this.styleControl?.setPosition(mobile ? 'topleft' : 'bottomleft');
  }

  // ---- Clic sur la carte -------------------------------------------------

  setupClick() {
    // Clic sur le fond de carte (pas sur un point) ; un double-clic, un
    // double-toucher ou un pincement zoome sans être compté comme un clic :
    // on attend un court instant avant d'agir.
    let timer = null;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    this.map.on('click', (e) => {
      if (timer) {
        cancel();
        return;
      }
      const { lat, lng } = e.latlng.wrap();
      timer = setTimeout(() => {
        timer = null;
        this.handlers.onMapClick?.(lat, lng);
      }, 280);
    });
    this.map.on('dblclick zoomstart movestart', cancel);
  }

  // ---- Recherche ---------------------------------------------------------

  /** Dessine les cercles, les points de départ et les marqueurs. */
  render({ points, colors, results, names, favorites, colorOf = null }) {
    if (favorites) this.favoriteCodes = favorites;
    this.colorOf = colorOf;
    this.points = points;
    this.colors = colors;
    this.names = names;
    this.drawZones();
    this.drawResults(results);
  }

  drawZones() {
    this.zonesLayer.clearLayers();
    this.ringsLayer.clearLayers();
    this.startLayer.clearLayers();
    this.pins = [];
    this.points.forEach((p, i) => {
      if (!p) return;
      const color = this.colors[i];
      L.circle([p.lat, p.lon], {
        radius: p.radius * 1000,
        renderer: this.zonesRenderer,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.07,
        interactive: false,
      }).addTo(this.zonesLayer);
      // Départ depuis une commune : l'épingle pointe juste au-dessus de son
      // marqueur, qui reste visible et cliquable à tous les niveaux de zoom.
      const pin = L.marker([p.lat, p.lon], {
        icon: pinIcon(color, this.pinLift(p)),
        keyboard: false,
        interactive: false,
        zIndexOffset: 1000,
        alt: this.names?.[i] ?? 'Point de départ',
      }).addTo(this.startLayer);
      this.pins.push({ pin, p, color });
      if (this.rings) this.drawRings(p, color);
    });
  }

  pinLift(p) {
    return p.isCommune ? markerRadius(p.population, MARKER, this.map.getZoom()) + 2 : 0;
  }

  /** Après un zoom : l'épingle reste juste au-dessus du point de la commune. */
  updatePins() {
    for (const { pin, p, color } of this.pins) pin.setIcon(pinIcon(color, this.pinLift(p)));
  }

  drawRings(p, color) {
    const label = (d) =>
      L.marker([p.lat + d / KM_PER_DEGREE, p.lon], {
        icon: L.divIcon({ className: 'ring-label', html: `<span>${String(d).replace('.', ',')} km</span>`, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(this.ringsLayer);
    for (const d of ringDistances(p.radius, RINGS)) {
      L.circle([p.lat, p.lon], {
        radius: d * 1000,
        renderer: this.zonesRenderer,
        color,
        weight: 1.6,
        opacity: 0.95,
        dashArray: '6 5',
        fill: false,
        interactive: false,
      }).addTo(this.ringsLayer);
      label(d);
    }
    // Le cercle de recherche porte aussi son rayon
    label(p.radius);
  }

  /** Zones atteignables en voiture (GeoJSON), une par point de départ. */
  setDriveZones(geoms, colors = []) {
    this.driveLayer ??= L.layerGroup().addTo(this.map);
    this.driveLayer.clearLayers();
    (geoms ?? []).forEach((g, i) => {
      const color = colors[i] ?? '#2563eb';
      L.geoJSON(g, {
        renderer: this.zonesRenderer,
        interactive: false,
        style: { color, weight: 2, dashArray: '2 6', fillColor: color, fillOpacity: 0.1 },
      }).addTo(this.driveLayer);
    });
  }

  setRings(on) {
    this.rings = on;
    this.drawZones();
    this.updateLabels();
  }

  categoryColors() {
    return {
      village: cssVar('--cat-village'),
      petite: cssVar('--cat-petite'),
      moyenne: cssVar('--cat-moyenne'),
      grande: cssVar('--cat-grande'),
      inconnue: cssVar('--cat-inconnue'),
      'budget-ok': cssVar('--budget-ok'),
      'budget-limite': cssVar('--budget-limite'),
      'budget-trop': cssVar('--budget-trop'),
      'budget-inconnu': cssVar('--budget-inconnu'),
      // Contour blanc : les points se détachent sur tous les fonds
      stroke: '#ffffff',
    };
  }

  /** Codes des communes favorites (anneau doré sur leur point). */
  setFavorites(codes) {
    this.favoriteCodes = codes;
    this.restyleMarkers();
  }

  markerStyle(commune, colors) {
    const cat = sizeCategoryOf(commune.population).id;
    // Couleur : catégorie de taille, ou état du budget si un budget est saisi
    const fill = this.colorOf ? colors[this.colorOf(commune)] ?? colors[cat] : colors[cat];
    if (this.favoriteCodes?.has(commune.code)) {
      return {
        radius: markerRadius(commune.population, MARKER, this.map.getZoom()) + 1,
        color: '#f5b301',
        weight: 3.5,
        fillColor: fill,
        fillOpacity: 0.95,
      };
    }
    return {
      radius: markerRadius(commune.population, MARKER, this.map.getZoom()),
      color: colors.stroke,
      weight: this.style === 'satellite' ? 2 : 1.5,
      fillColor: fill,
      fillOpacity: 0.9,
    };
  }

  drawResults(results) {
    this.results = results;
    this.resultsLayer.clearLayers();
    this.markers.clear();
    this.map.closeTooltip(this.tooltip);
    const colors = this.categoryColors();
    // Les grandes communes d'abord, pour que les petites restent visibles par-dessus
    const ordered = [...results].sort((a, b) => (b.commune.population ?? 0) - (a.commune.population ?? 0));
    for (const { commune } of ordered) {
      const m = L.circleMarker([commune.lat, commune.lon], {
        renderer: this.renderer,
        bubblingMouseEvents: false,
        ...this.markerStyle(commune, colors),
      });
      m.on('mouseover', () => this.showTooltip(commune, m));
      m.on('mouseout', () => this.map.closeTooltip(this.tooltip));
      m.on('click', () => {
        this.showTooltip(commune, m);
        this.handlers.onCommuneClick?.(commune.code);
      });
      m.addTo(this.resultsLayer);
      this.markers.set(commune.code, m);
    }
    if (this.highlighted) this.highlight(this.highlighted);
    this.updateLabels();
  }

  /** Noms des communes visibles, sans chevauchement (les plus peuplées d'abord). */
  updateLabels() {
    this.labelsLayer.clearLayers();
    if (!this.results.length) return;
    const zoom = this.map.getZoom();
    const minPopulation = labelMinPopulation(zoom, LABELS.steps);
    const size = this.map.getSize();
    const candidates = [];
    for (const { commune } of this.results) {
      // Communes numérotées (rapport) : toujours nommées, à côté de leur numéro
      const priority = this.priorityCodes?.has(commune.code) ?? false;
      if (!priority && (commune.population ?? 0) < minPopulation) continue;
      const pt = this.map.latLngToContainerPoint([commune.lat, commune.lon]);
      if (pt.x < -200 || pt.y < -20 || pt.x > size.x + 20 || pt.y > size.y + 20) continue;
      const r = markerRadius(commune.population, MARKER, zoom);
      candidates.push({
        commune,
        name: commune.nom,
        x: pt.x,
        y: pt.y,
        r: priority ? Math.max(r, NUMBER_RADIUS) : r,
        population: commune.population,
        priority,
      });
    }
    // Les noms évitent les étiquettes des cercles de distance (« 10 km »…)
    const obstacles = [];
    if (this.rings) {
      for (const p of this.points) {
        if (!p) continue;
        for (const d of [...ringDistances(p.radius, RINGS), p.radius]) {
          const pt = this.map.latLngToContainerPoint([p.lat + d / KM_PER_DEGREE, p.lon]);
          obstacles.push({ left: pt.x - 26, top: pt.y - 10, width: 52, height: 20 });
        }
      }
    }
    const placed = placeLabels(candidates, { width: size.x, height: size.y, maxCount: LABELS.maxCount, obstacles });
    for (const { commune, r } of placed) {
      const span = document.createElement('span');
      span.textContent = commune.nom;
      span.style.transform = `translate(${Math.round(r + 3)}px, -50%)`;
      if ((commune.population ?? 0) >= 50000) span.className = 'big';
      const label = L.marker([commune.lat, commune.lon], {
        pane: 'labelsPane',
        icon: L.divIcon({ className: 'commune-label', html: span, iconSize: [0, 0], iconAnchor: [0, 0] }),
        keyboard: false,
      });
      label.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.handlers.onCommuneClick?.(commune.code);
      });
      label.addTo(this.labelsLayer);
    }
  }

  restyleMarkers() {
    const colors = this.categoryColors();
    for (const { commune } of this.results) {
      const m = this.markers.get(commune.code);
      if (!m) continue;
      const style = this.markerStyle(commune, colors);
      m.setRadius(style.radius);
      m.setStyle(style);
    }
    if (this.highlighted) this.highlight(this.highlighted);
  }

  showTooltip(commune, marker) {
    this.tooltip.options.offset = [0, -marker.getRadius()];
    this.tooltip.setLatLng([commune.lat, commune.lon]).setContent(commune.nom);
    this.map.openTooltip(this.tooltip);
  }

  /** Met en évidence une commune (anneau autour du marqueur). */
  highlight(commune) {
    this.highlightLayer.clearLayers();
    this.highlighted = commune;
    if (!commune) return;
    L.circleMarker([commune.lat, commune.lon], {
      renderer: this.highlightRenderer,
      radius: markerRadius(commune.population, MARKER, this.map.getZoom()) + 5,
      color: cssVar('--accent'),
      weight: 3,
      fill: false,
      interactive: false,
    }).addTo(this.highlightLayer);
  }

  /** Centre la carte sur une commune sans changer le zoom s'il est suffisant. */
  focusCommune(commune) {
    const zoom = Math.max(this.map.getZoom(), 11);
    const pad = this.handlers.getPadding?.() ?? { bottom: 0, right: 0 };
    const target = this.map.project([commune.lat, commune.lon], zoom);
    // Décale le centre pour que la commune ne soit pas cachée par le panneau
    const offset = L.point(pad.right / 2, pad.bottom / 2);
    this.map.setView(this.map.unproject(target.add(offset), zoom), zoom, { animate: !reducedMotion() });
  }

  /** Cadre la carte sur l'ensemble des cercles. */
  fitPoints(points) {
    const valid = points.filter(Boolean);
    if (!valid.length) return;
    let bounds = null;
    for (const p of valid) {
      const b = boundingBox(p.lat, p.lon, p.radius);
      const lb = L.latLngBounds([b.minLat, b.minLon], [b.maxLat, b.maxLon]);
      bounds = bounds ? bounds.extend(lb) : lb;
    }
    const pad = this.handlers.getPadding?.() ?? { bottom: 0, right: 0 };
    this.map.fitBounds(bounds, {
      paddingTopLeft: [16, 16],
      paddingBottomRight: [16 + pad.right, 16 + pad.bottom],
      animate: !reducedMotion(),
    });
  }

  flyTo(lat, lon, zoom = 11) {
    this.map.setView([lat, lon], zoom, { animate: !reducedMotion() });
  }

  // ---- Favoris -----------------------------------------------------------

  /** Favoris (étoile) ou villes du dossier ouvert (kind = 'folder'). */
  showFavorites(communes, kind = 'fav', statusOf = () => null) {
    this.favoritesLayer.clearLayers();
    const html = kind === 'folder' ? '<span class="folder-dot"></span>' : '<span>★</span>';
    for (const c of communes) {
      const status = kind === 'folder' ? statusOf(c.code) : null;
      const className = kind === 'folder' ? `fav-marker folder-marker${status ? ` status-${status}` : ''}` : 'fav-marker';
      const m = L.marker([c.lat, c.lon], {
        icon: L.divIcon({ className, html, iconSize: [26, 26], iconAnchor: [13, 13] }),
        title: c.nom,
        alt: c.nom,
        zIndexOffset: 500,
      });
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.handlers.onCommuneClick?.(c.code);
      });
      m.addTo(this.favoritesLayer);
    }
    if (!this.map.hasLayer(this.favoritesLayer)) this.favoritesLayer.addTo(this.map);
  }

  /** Communes numérotées 1, 2, 3… (plan du rapport client), nommées en priorité. */
  showNumbered(communes) {
    this.numbersLayer.clearLayers();
    this.priorityCodes = new Set(communes.map((c) => c.code));
    communes.forEach((c, i) => {
      L.marker([c.lat, c.lon], {
        icon: L.divIcon({ className: 'number-marker', html: `<span>${i + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        keyboard: false,
        interactive: false,
        zIndexOffset: 800,
      }).addTo(this.numbersLayer);
    });
    this.updateLabels();
  }

  /** Cadre la carte sur les cercles et les communes données, sans animation. */
  fitArea(points, communes, padding = 14) {
    let bounds = null;
    const extend = (b) => (bounds = bounds ? bounds.extend(b) : L.latLngBounds(b));
    for (const p of points) {
      const b = boundingBox(p.lat, p.lon, p.radius);
      extend([[b.minLat, b.minLon], [b.maxLat, b.maxLon]]);
    }
    for (const c of communes) extend([[c.lat, c.lon], [c.lat, c.lon]]);
    if (bounds) this.map.fitBounds(bounds, { padding: [padding, padding], animate: false, maxZoom: 14 });
  }

  hideFavorites() {
    this.map.removeLayer(this.favoritesLayer);
  }

  fitCommunes(communes) {
    if (!communes.length) return;
    const bounds = L.latLngBounds(communes.map((c) => [c.lat, c.lon]));
    const pad = this.handlers.getPadding?.() ?? { bottom: 0, right: 0 };
    this.map.fitBounds(bounds, {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40 + pad.right, 40 + pad.bottom],
      maxZoom: 11,
      animate: !reducedMotion(),
    });
  }
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
