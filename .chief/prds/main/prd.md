# PRD: Alentours — Find French towns around a point

> "Alentours" is a working name and may change. There is no logo yet.

## 1. Introduction / Overview

Alentours is a static website, entirely in French, that finds every French commune (city, town or village of any size) within a chosen straight-line distance of a starting point. The starting point can be a town, a postal code, or a point clicked on the map. Results can be filtered by population, department and region.

Example: *"all communes within 30 km of Lille with at least 10,000 inhabitants."*

Results appear as a list and on a map at the same time. The user can sort them, open details for each town, export them to CSV, print them, and share the search as a link. It works on phones, tablets (iPad Pro) and desktop PCs. There is no login, no server and no database, so it can be hosted for free (GitHub Pages or Netlify).

One person uses it today, but nothing in the design should prevent opening it to the public later.

The work has two phases:
- **Phase 1 (US-001 to US-024):** the full single-point search experience.
- **Phase 2 (US-025 to US-029):** multi-town search, favorites, population trend, property prices.

## 2. Goals

- Find all communes within a radius of 1–100 km of a town, postal code or map point, with optional min/max population.
- Show results as a list and on a map at the same time. On mobile, both must be easy to use.
- Load quickly on a 4G mobile connection: interactive in under 3 seconds on a mid-range phone.
- Return search results in under 300 ms after data has loaded, even for the largest searches (100 km around Paris).
- Every piece of interface text is in French.
- Work on phone (≥ 360 px wide), tablet (iPad Pro, portrait and landscape) and desktop, in the latest two versions of Chrome, Safari, Firefox and Edge.
- Host for free with no server-side code.

## 3. User Stories

Notes for whoever implements these stories:
- The project is plain HTML/CSS/JavaScript (ES modules), so no typecheck is needed. In place of "typecheck passes", **every story requires: no errors in the browser console, and all `node --test` unit tests pass.**
- All visible text must be in French. The examples below give the exact French labels to use.
- Pure logic (distance, filters, sorting, CSV, URL encoding) lives in modules with no DOM access (they never touch the web page), so it can be unit-tested with Node.

---

### Phase 1

### US-001: Project skeleton
**Priority:** 1
**Description:** As a developer, I want a minimal static project structure so that every later story has a consistent place to live and the site can be deployed for free.

**Acceptance Criteria:**
- [ ] Structure exists: `index.html`, `css/`, `js/` (ES modules), `data/`, `scripts/` (data-preparation scripts), `tests/`
- [ ] `index.html` has `<html lang="fr">`, a viewport meta tag, and the title "Alentours"
- [ ] Leaflet is loaded (pinned version, from a CDN or vendored into the repo) and an empty full-size map renders
- [ ] `package.json` exists, with only dev-time scripts (`npm test` runs `node --test tests/`, `npm run data` runs the data scripts). The site itself needs no build step
- [ ] Opening the site through any static file server (e.g. `npx serve .`) works with no errors
- [ ] `README.md` explains how to run locally and how to deploy to GitHub Pages

### US-002: Commune data preparation script
**Priority:** 2
**Description:** As a developer, I want a script that downloads all French communes once and saves them as a compact static file, so that the site needs no server and loads fast.

**Acceptance Criteria:**
- [ ] `scripts/build-communes.mjs` fetches `https://geo.api.gouv.fr/communes?fields=nom,code,codesPostaux,centre,surface,population,codeDepartement,departement,codeRegion,region&format=json` (includes overseas communes)
- [ ] Writes `data/communes.json` with one compact record per commune: INSEE code, name, latitude, longitude, population, area in km² (the API returns hectares, so divide by 100), department code, region code, postal codes
- [ ] Writes department and region names once each into lookup tables (`data/departements.json`, `data/regions.json`) rather than repeating them on every commune
- [ ] Communes with no `centre` coordinates are skipped. The script logs how many were skipped
- [ ] Communes with missing population are kept, with population `null`
- [ ] The resulting `communes.json` is under 2 MB gzip-compressed. The script prints the raw and gzipped sizes
- [ ] The generated data files are committed to the repo (the site never calls geo.api.gouv.fr at runtime for search)

### US-003: Core logic modules with unit tests
**Priority:** 3
**Description:** As a developer, I want tested pure functions for distance, size categories and text normalization so that the search is correct.

**Acceptance Criteria:**
- [ ] `distanceKm(lat1, lon1, lat2, lon2)` uses the haversine formula with Earth radius 6371 km. Test: Lille (50.6292, 3.0573) → Arras (50.2910, 2.7775) ≈ 43 km (±1 km)
- [ ] Size categories are defined in **one** config object (e.g. `js/config.js`) so the thresholds are easy to change:
  - `Village`: < 2 000
  - `Petite ville`: 2 000 – 9 999
  - `Ville moyenne`: 10 000 – 49 999
  - `Grande ville`: ≥ 50 000
- [ ] `sizeCategory(population)` returns the right label at each boundary (1 999, 2 000, 9 999, 10 000, 49 999, 50 000) and handles `null` ("Inconnue")
- [ ] `normalize(text)` lowercases, removes accents, and treats hyphens, apostrophes and spaces as equivalent. Tests: "Saint-Étienne" matches "saint etienne"; "L'Haÿ-les-Roses" matches "lhay les roses"
- [ ] `formatNumber` uses French formatting (e.g. `12 345`, `3,7 km`)
- [ ] All tests pass with `npm test`

### US-004: Data loading
**Priority:** 4
**Description:** As a user, I want the commune data to load quickly with clear feedback so that I know when I can search.

**Acceptance Criteria:**
- [ ] On page load, `communes.json` and the lookup tables are fetched once and kept in memory
- [ ] While loading, a French message is shown ("Chargement des communes…")
- [ ] If loading fails, a French error message is shown with a "Réessayer" button that retries
- [ ] Search inputs are disabled until data has loaded

### US-005: Responsive layout shell
**Priority:** 5
**Description:** As a user on any device, I want a layout that fits my screen so that the map, the search form and the list are all comfortable to use.

**Acceptance Criteria:**
- [ ] **Desktop (≥ 1024 px):** search panel and results list in a left side panel (about 380–420 px wide), map fills the rest
- [ ] **Tablet (768–1023 px, incl. iPad Pro portrait):** same side-panel layout with a narrower panel, or the mobile layout. Whichever is used, nothing overlaps or is cut off
- [ ] **Mobile (< 768 px):** map full screen, with a bottom sheet (a panel that slides up over the map) containing the search form and results. It can be dragged or tapped between collapsed (shows the results count), half and full height. Alternatively, two tabs "Carte" / "Liste". The chosen pattern must let the user go between list and map in one tap
- [ ] All buttons and tap targets are at least 44 × 44 px
- [ ] No horizontal scrolling at 360 px width
- [ ] Verified in browser dev tools at 360 px, 768 px, 1024 px (iPad Pro portrait), 1366 px (iPad Pro landscape) and 1920 px

### US-006: Base map and map style choice
**Priority:** 6
**Description:** As a user, I want to choose between a normal map and a satellite view so that I can see the area the way I prefer.

**Acceptance Criteria:**
- [ ] Map starts centred on metropolitan France (about 46.6, 2.5, zoom 6)
- [ ] "Plan" layer: OpenStreetMap standard tiles, with the required attribution
- [ ] "Satellite" layer: a free imagery source with no API key (IGN Géoplateforme orthophotos, or Esri World Imagery as a fallback), with the required attribution
- [ ] A layer switch control labelled in French ("Plan" / "Satellite") changes the layer
- [ ] The chosen style is remembered on the device (localStorage)

### US-007: Starting point — town name with autocomplete
**Priority:** 7
**Description:** As a user, I want to type a town name and pick it from suggestions so that I can start a search quickly.

**Acceptance Criteria:**
- [ ] A text field labelled "Ville ou code postal", with placeholder e.g. "Ex. : Lille ou 59000"
- [ ] After 2 typed characters, up to 10 suggestions appear, matched with `normalize()` (accents and hyphens are ignored)
- [ ] Ranking: names that start with the typed text come before names that only contain it. Ties are broken by population, highest first
- [ ] Each suggestion shows name + department name + code, e.g. "Saint-Martin (Charente-Maritime, 17)", so homonyms (different towns with the same name) can be told apart
- [ ] Keyboard navigation (↑ ↓ Enter Esc) and touch selection both work
- [ ] Choosing a suggestion sets the starting point to the commune's centre and the map zooms to it
- [ ] "Aucune commune trouvée" is shown when nothing matches

### US-008: Starting point — postal code
**Priority:** 8
**Description:** As a user, I want to type a postal code so that I can start from a place when I only know its code.

**Acceptance Criteria:**
- [ ] Typing 5 digits in the same field lists every commune that has that postal code (e.g. "59000" → Lille)
- [ ] If exactly one commune matches, it can be chosen with Enter. If several match, the user picks from the list
- [ ] A 5-digit code that matches nothing shows "Aucune commune pour ce code postal"

### US-009: Starting point — click on the map
**Priority:** 9
**Description:** As a user, I want to click or tap anywhere on the map to use that exact point as the centre so that I can search around places that are not town centres.

**Acceptance Criteria:**
- [ ] Clicking or tapping the map sets the starting point to the exact clicked coordinates and places a distinct marker there
- [ ] The search field then shows "Point sur la carte (50,6292 ; 3,0573)"
- [ ] On touch devices, a single tap sets the point and a double-tap or pinch still zooms, so setting a point never happens by mistake while panning
- [ ] A new click replaces the previous starting point (in Phase 1 there is only one starting point)

### US-010: Radius selector
**Priority:** 10
**Description:** As a user, I want to set the search radius with a slider or by typing it so that I can be quick or precise.

**Acceptance Criteria:**
- [ ] Labelled "Rayon (km)"
- [ ] Slider from 1 to 100 km in steps of 1. Default 20 km
- [ ] A number field next to the slider stays in sync with it both ways
- [ ] Values outside 1–100 or non-numeric input are corrected to the nearest valid value when the field loses focus
- [ ] Decimal values typed with a comma (e.g. "12,5") are accepted

### US-011: Optional population filters
**Priority:** 11
**Description:** As a user, I want optional minimum and maximum population fields so that I can focus on towns of a certain size.

**Acceptance Criteria:**
- [ ] Two fields: "Population minimum" and "Population maximum", both empty by default
- [ ] Empty field = no limit
- [ ] Accepts digits with or without spaces ("10 000" = 10000)
- [ ] If min > max, a French message is shown below the fields ("Le minimum doit être inférieur au maximum") and the search does not run
- [ ] Communes with unknown population are excluded only when a min or max is set

### US-012: Search engine and results count
**Priority:** 12
**Description:** As a user, I want results to update as soon as I change a parameter so that I can explore quickly.

**Acceptance Criteria:**
- [ ] `search(communes, params)` is a pure function that returns the communes within the radius of the starting point that pass all filters, each with its computed distance
- [ ] It uses a quick latitude/longitude "bounding box" pre-check (a cheap rectangle test) before the haversine formula, so it stays fast
- [ ] When the starting point is a commune, that commune is included at distance 0
- [ ] Search runs automatically when any parameter changes. Slider movement is debounced (waits about 150 ms after the user stops before running)
- [ ] The results count is shown, e.g. "127 communes trouvées" (and "1 commune trouvée", "Aucune commune trouvée")
- [ ] Unit tests cover: radius boundary, min only, max only, min + max, no filters, unknown population
- [ ] Measured: 100 km around Paris (thousands of results) completes in under 300 ms on a desktop browser

### US-013: Results list
**Priority:** 13
**Description:** As a user, I want a readable list of results so that I can scan the towns found.

**Acceptance Criteria:**
- [ ] Each row shows: name, department code, population, distance (e.g. "Roubaix (59) · 98 828 hab. · 11,2 km") and a size category badge
- [ ] Default sort: distance ascending
- [ ] Lists of more than 200 results stay smooth to scroll: use virtual scrolling (only the visible rows are drawn) or "Afficher plus" paging in batches of 100
- [ ] Clicking a row highlights the town on the map, centres the map on it and opens its details (US-016)
- [ ] Before any search, the list shows a short French hint ("Choisissez une ville, un code postal ou cliquez sur la carte")

### US-014: Map markers and radius circle
**Priority:** 14
**Description:** As a user, I want to see results on the map, with bigger markers for bigger towns, and the search radius drawn, so that I understand the area at a glance.

**Acceptance Criteria:**
- [ ] A circle with the chosen radius is drawn around the starting point (semi-transparent fill)
- [ ] Each result is a circle marker drawn with Leaflet's canvas renderer (fast with thousands of markers)
- [ ] Marker radius grows with population on a square-root scale, limited to between 3 px and 20 px, so large cities do not cover the map
- [ ] Hovering over (desktop) or tapping a marker shows the town's name
- [ ] Clicking a marker opens the town's details and highlights the matching row in the list
- [ ] After each search, the map zooms to fit the radius circle
- [ ] With 3 000+ markers displayed, panning and zooming stay smooth on desktop

### US-015: Distance rings toggle
**Priority:** 15
**Description:** As a user, I want optional distance rings every 10 km so that I can estimate distances visually.

**Acceptance Criteria:**
- [ ] A toggle "Cercles de distance" (off by default)
- [ ] When on, dashed concentric circles are drawn every 10 km up to the search radius, each with a small label ("10 km", "20 km"…)
- [ ] The ring interval (10 km) is a config value
- [ ] The toggle state is remembered on the device

### US-016: Town details
**Priority:** 16
**Description:** As a user, I want to see key facts about a town when I click it so that I can evaluate it.

**Acceptance Criteria:**
- [ ] Opens from a map marker or a list row. Shown as a popup or panel on desktop, as a bottom sheet on mobile
- [ ] Shows (in French):
  - Nom
  - Population ("98 828 habitants")
  - Distance from the starting point ("11,2 km")
  - Département (name + code)
  - Région
  - Code(s) postal(aux) (all of them)
  - Catégorie (size label)
  - Superficie ("13,2 km²")
  - Densité ("7 487 hab./km²", population ÷ area, rounded)
- [ ] A "Tendance démographique" line shows "Bientôt disponible" in Phase 1 (filled in by US-027)
- [ ] Missing values show "Non disponible"
- [ ] A close button ("Fermer") and the Esc key close the details

### US-017: Quick links
**Priority:** 17
**Description:** As a user, I want links to Google Maps and Wikipedia for each town so that I can learn more about it in one tap.

**Acceptance Criteria:**
- [ ] The details view has two buttons: "Google Maps" and "Wikipédia"
- [ ] Google Maps opens `https://www.google.com/maps/search/?api=1&query=<lat>,<lon>`
- [ ] Wikipédia opens a French Wikipedia search for "<name> (<department name>)" (`https://fr.wikipedia.org/w/index.php?search=…`), which avoids landing on the wrong homonym
- [ ] Both open in a new tab (`target="_blank" rel="noopener"`)

### US-018: Sorting
**Priority:** 18
**Description:** As a user, I want to sort the results so that I can find the closest, the biggest, or a town by name.

**Acceptance Criteria:**
- [ ] A sort control labelled "Trier par" with options: Distance, Population, Nom
- [ ] A button switches between ascending and descending ("Croissant" / "Décroissant", or ↑/↓ with an accessible label)
- [ ] Name sorting uses French alphabetical order (`localeCompare` with `'fr'`), so "Écully" sorts with E
- [ ] Unknown populations always sort last
- [ ] Unit tests cover all three sort keys in both directions

### US-019: Department and region filter
**Priority:** 19
**Description:** As a user, I want to restrict results to certain departments or regions so that I can stay within an administrative area.

**Acceptance Criteria:**
- [ ] Two multi-select filters, "Région" and "Département", listing only the regions and departments present in the current results, with counts (e.g. "Nord (59) — 84")
- [ ] Selecting regions narrows the department list to departments in those regions
- [ ] Nothing selected = no filter
- [ ] A "Réinitialiser les filtres" button clears them
- [ ] The results count, list and map update immediately

### US-020: Light, dark and automatic theme
**Priority:** 20
**Description:** As a user, I want light, dark or automatic themes so that the site is comfortable at any time of day.

**Acceptance Criteria:**
- [ ] A theme control with three options: "Clair", "Sombre", "Automatique" (default)
- [ ] "Automatique" follows the system setting (`prefers-color-scheme`) and updates live if the system setting changes
- [ ] Light theme uses a white background, dark theme a black or near-black background. Colours are defined as CSS custom properties (variables)
- [ ] In dark mode, the "Plan" map switches to a dark tile style (e.g. CARTO Dark Matter, with attribution). Satellite stays as is
- [ ] Text and control contrast meets WCAG AA (4.5:1 for body text) in both themes
- [ ] The choice is saved in localStorage and applied before first paint, so the page never flashes the wrong theme on load

### US-021: Shareable link
**Priority:** 21
**Description:** As a user, I want the search saved in the URL so that I can bookmark it or send it to someone.

**Acceptance Criteria:**
- [ ] The URL query string reflects the current search, e.g. `?c=59350&r=30&pmin=10000&tri=population-desc`, or `?lat=50.62920&lon=3.05730&r=30` for a map point. Parameters: commune INSEE code or lat/lon, radius, min/max population, department/region filters, sort
- [ ] The URL updates with `history.replaceState` on each change (no new history entry per keystroke)
- [ ] Opening a URL with parameters restores the full search and results
- [ ] Invalid or unknown parameters are ignored without errors
- [ ] A "Copier le lien" button copies the URL to the clipboard and shows "Lien copié". On mobile, it uses the native share sheet (`navigator.share`) when available
- [ ] Unit tests cover encoding and decoding search parameters

### US-022: CSV export
**Priority:** 22
**Description:** As a user, I want to export the results to a CSV file that opens correctly in Excel so that I can work with the list.

**Acceptance Criteria:**
- [ ] An "Exporter en CSV" button downloads `alentours-<startingtown>-<radius>km.csv`
- [ ] Separator: semicolon `;`. Encoding: UTF-8 **with BOM**, so Excel shows accents correctly. Decimals use a comma (e.g. `11,2`)
- [ ] Columns (French headers): Nom; Code INSEE; Codes postaux; Département; Région; Population; Distance (km); Catégorie; Superficie (km²); Densité (hab./km²)
- [ ] Rows follow the current sort and filters
- [ ] Values containing `;`, `"` or line breaks are correctly quoted
- [ ] Unit test checks the exact output for 2 sample communes, including a name with an apostrophe and accents

### US-023: Print / save as PDF
**Priority:** 23
**Description:** As a user, I want a clean printable version of the results so that I can print or save them as PDF.

**Acceptance Criteria:**
- [ ] An "Imprimer / PDF" button opens the browser's print dialog
- [ ] A print stylesheet (`@media print`) hides the controls and map and shows: a title, a summary of the search ("Communes à moins de 30 km de Lille, population ≥ 10 000 — 12 résultats"), the date, and a table of all results (not only the visible rows)
- [ ] The table repeats its header on each page and rows are never split across pages
- [ ] Always prints in light colours, even in dark mode

### US-024: Phase 1 quality pass
**Priority:** 24
**Description:** As the owner, I want Phase 1 checked end to end so that it is reliable before moving on.

**Acceptance Criteria:**
- [ ] Lighthouse (the Chrome dev tools audit, mobile profile) scores ≥ 90 for Performance and Accessibility
- [ ] All form fields have French labels. All icon-only buttons have French `aria-label`s
- [ ] Full keyboard use works on desktop: search, pick a suggestion, change radius, open details, export
- [ ] The example search "30 km autour de Lille, ≥ 10 000 habitants" gives a plausible result list that includes Roubaix, Tourcoing and Villeneuve-d'Ascq
- [ ] The site is deployed to GitHub Pages (or Netlify) and works from the public URL
- [ ] README documents how to refresh the data (`npm run data`)

---

### Phase 2

### US-025: Multi-town search
**Priority:** 25
**Description:** As a user, I want to add several starting points, each with its own radius, and see only towns within range of all of them, so that I can find places between several cities.

**Acceptance Criteria:**
- [ ] An "Ajouter un point de départ" button adds another starting point. Each has its own search field (name, postal code or map click) and its own radius
- [ ] Each starting point can be removed (✕). At least one always remains
- [ ] Results = communes inside **every** circle (intersection). Example: 20 km of Lille AND 20 km of Arras
- [ ] Each circle is drawn on the map in a distinct colour
- [ ] The list and the details show the distance to each starting point (e.g. "Lille 14,2 km · Arras 18,9 km"). Sorting by distance uses the largest of these distances
- [ ] If the circles do not overlap, the message "Les zones ne se chevauchent pas" is shown
- [ ] Map click mode: a click sets the point of the starting point currently selected in the form
- [ ] The URL, CSV and print support multiple starting points
- [ ] Unit tests cover the intersection logic

### US-026: Favorites with notes
**Priority:** 26
**Description:** As a user, I want to save towns to a shortlist with a personal note so that I can keep track of interesting places.

**Acceptance Criteria:**
- [ ] A star button ("Ajouter aux favoris" / "Retirer des favoris") in the details and on each list row
- [ ] A "Favoris" view lists saved towns with name, department and population
- [ ] Each favorite has an editable note field ("Note personnelle") that saves automatically
- [ ] Favorites are stored in localStorage under a versioned key (e.g. `alentours.favoris.v1`)
- [ ] Favorites are shown on the map with a distinct marker style when the view is open
- [ ] Clicking a favorite opens its details

### US-027: Favorites export and import
**Priority:** 27
**Description:** As a user, I want to export and import my favorites as a file so that I can move them to another device.

**Acceptance Criteria:**
- [ ] "Exporter les favoris" downloads `alentours-favoris.json` (INSEE code, name, note, date added, format version)
- [ ] "Importer des favoris" reads such a file. The user chooses "Fusionner" (merge) or "Remplacer" (replace)
- [ ] An invalid file shows "Fichier invalide" and changes nothing
- [ ] "Exporter les favoris en CSV" uses the same CSV format rules as US-022, plus a Note column

### US-028: Population trend
**Priority:** 28
**Description:** As a user, I want to see whether a town's population is growing or shrinking so that I can judge its dynamism.

**Acceptance Criteria:**
- [ ] `scripts/build-population-history.mjs` downloads the INSEE historical population series per commune and writes a compact file `data/population-trend.json` (INSEE code → population at two census dates, e.g. latest and about 10 years earlier)
- [ ] The details show "Tendance démographique": "En hausse (+4,2 % depuis 2011)", "En baisse (−3,1 % depuis 2011)", or "Stable" when the change is within ±1 %. The years come from the data
- [ ] Communes that merged (communes nouvelles) or have no history show "Non disponible"
- [ ] Optional: a small sparkline chart of the population over time
- [ ] The trend is added as a column in CSV and print

### US-029: Property prices (DVF)
**Priority:** 29
**Description:** As a user, I want average property prices per town so that I can compare places for buying.

**Acceptance Criteria:**
- [ ] `scripts/build-dvf.mjs` downloads public DVF data from data.gouv.fr (preferably the aggregated per-commune statistics dataset) and writes `data/prix.json`: INSEE code → median price per m² for houses and apartments, number of sales, period covered
- [ ] The details show "Prix médian au m² : Maison 2 450 € · Appartement 3 100 € (données DVF 2021–2024, 154 ventes)"
- [ ] Communes with no or too few sales (< 5) show "Données insuffisantes"
- [ ] Bas-Rhin (67), Haut-Rhin (68), Moselle (57) and Mayotte (976) show "Non couvert par DVF" (DVF does not include these areas)
- [ ] Prices are added as columns in CSV export
- [ ] The source and period are shown with a link to data.gouv.fr

## 4. Functional Requirements

**Data**
- FR-1: The site must use a pre-built static file of all French communes (generated from geo.api.gouv.fr by a script) and must not call any API at runtime to perform a search.
- FR-2: Each commune record must contain: INSEE code, name, centre coordinates, population, area (km²), department code, region code, postal codes.

**Starting point**
- FR-3: The user must be able to set the starting point by (a) choosing a commune from name autocomplete, (b) entering a 5-digit postal code, or (c) clicking or tapping the map.
- FR-4: When the starting point is a commune, distances are measured from the commune's centre coordinates. When it is a map click, from the exact clicked point.

**Search**
- FR-5: Distance must be straight-line (great-circle, haversine formula, R = 6371 km).
- FR-6: The radius must be adjustable from 1 to 100 km with a slider and a numeric field kept in sync. Default 20 km.
- FR-7: Minimum and maximum population are optional. An empty field means no limit.
- FR-8: Results must update automatically whenever a parameter changes.
- FR-9: The number of results must always be visible.
- FR-10 (Phase 2): With multiple starting points, a commune is a result only if it lies within the radius of every starting point.

**Results**
- FR-11: Results must be shown as a list and on the map at the same time (on mobile: switchable in one tap).
- FR-12: The map must draw the search radius circle and size result markers by population (square-root scale, 3–20 px).
- FR-13: Distance rings every 10 km must be toggleable.
- FR-14: The map must offer a "Plan" and a "Satellite" style. "Plan" switches to a dark style in dark mode.
- FR-15: Clicking a commune (marker or row) must show its details: name, population, distance, department, region, postal codes, size category, area, density, population trend (Phase 2).
- FR-16: Each commune's details must include links to Google Maps and French Wikipedia.
- FR-17: The list must be sortable by distance, population or name, ascending or descending.
- FR-18: The results must be filterable by one or more regions and/or departments.
- FR-19: Size category thresholds must be defined in a single config object.

**Output and sharing**
- FR-20: CSV export must use `;` separators, UTF-8 with BOM, decimal commas, and French headers.
- FR-21: A print stylesheet must produce a clean table of all results with a search summary.
- FR-22: All search parameters must be stored in the URL query string. Loading such a URL restores the search.

**Preferences**
- FR-23: The theme must offer Clair / Sombre / Automatique. The choice is stored in localStorage.
- FR-24: Map style and the distance rings toggle must be stored in localStorage.
- FR-25 (Phase 2): Favorites with notes are stored in localStorage and can be exported and imported as JSON.

**General**
- FR-26: All interface text must be in French, and numbers formatted the French way (`12 345`, `3,7 km`).
- FR-27: Every localStorage read and write must be wrapped so the site still works if storage is unavailable (e.g. private browsing).

## 5. Non-Goals (Out of Scope)

- No user accounts, login or server-side storage.
- No backend, database or paid API. No API keys.
- No installable app (no PWA install prompt, no app store).
- No driving distance or travel time in Phase 1 (possible later, see Open Questions).
- No languages other than French.
- No search for places other than communes (no addresses, streets, points of interest).
- No arrondissements of Paris, Lyon and Marseille as separate results. Each city appears as one commune.
- No offline mode.
- In Phase 1: no multi-town search, favorites, population trend or property prices (all Phase 2).
- Not decided, so not built: remembering recent searches, comparing 2–3 towns side by side.

## 6. Design Considerations

- Clean, modern, uncluttered. Generous spacing, a readable system font stack, one accent colour.
- Light theme: white background, dark text. Dark theme: black or near-black background, light text. The accent colour must stay readable in both.
- Large touch targets (≥ 44 px) and inputs at ≥ 16 px font size, which stops iOS Safari from zooming when a field is focused.
- Mobile: the map is the main view, and the form and results sit in a bottom sheet (or "Carte"/"Liste" tabs). The results count is always visible.
- Size category badges use distinct colours, with the text label always shown (colour is never the only cue).
- Respect `prefers-reduced-motion` for sheet and map animations.
- Name and logo are temporary. Keep "Alentours" in one place (config + `<title>`) so it is easy to rename.

## 7. Technical Considerations

- **Stack:** plain HTML, CSS and JavaScript ES modules. No framework and no build step for the site. Node.js is used only for the data scripts and unit tests (`node --test`).
- **Map:** Leaflet with `preferCanvas: true`, or an explicit `L.canvas()` renderer, so thousands of circle markers stay fast.
- **Tiles:**
  - Plan: OpenStreetMap standard (`tile.openstreetmap.org`). Respect the OSM tile usage policy: attribution, no heavy traffic. If the site goes public with significant traffic, switch to another provider.
  - Dark: CARTO Dark Matter (free with attribution, within fair-use limits).
  - Satellite: IGN Géoplateforme orthophotos (`data.geopf.fr` WMTS, free, no key), with Esri World Imagery as a fallback.
- **Data size:** about 35 000 communes. A compact array-based JSON should be about 1–2 MB gzipped. GitHub Pages and Netlify compress it automatically. It is cached by the browser after the first visit.
- **Data freshness:** INSEE legal population figures are updated once a year. Re-running `npm run data` refreshes them. Record the data date in the files and show it in the footer ("Données : INSEE / geo.api.gouv.fr, population 2021").
- **Performance:** search is a linear scan with a bounding-box pre-filter. 35 000 records is small enough that no spatial index is needed. Debounce slider input. Virtualize or page long lists.
- **Homonyms:** many communes share a name (e.g. dozens of "Saint-Martin"), so always show the department in suggestions and details.
- **Overseas communes** are included in the data. Searches there work the same way, and the map simply recentres.
- **DVF (Phase 2):** raw DVF files are very large, so always pre-aggregate per commune in the script and never load raw DVF in the browser. DVF does not cover Alsace-Moselle (57, 67, 68) or Mayotte (976).
- **INSEE history (Phase 2):** merged communes (communes nouvelles) need care when comparing old and new populations. Mark them as "Non disponible" if the history cannot be matched by INSEE code.
- **Privacy:** no analytics or tracking in Phase 1. Nothing leaves the browser except map tile requests.

## 8. Success Metrics

- The example "30 km autour de Lille, ≥ 10 000 habitants" can be done in under 20 seconds and in ≤ 4 interactions (type "Lil", pick Lille, set radius, set minimum population).
- Results update in under 300 ms after a parameter change (measured on desktop, 100 km around Paris).
- First load is interactive in under 3 s on a simulated "Fast 4G" connection, and repeat visits in under 1 s.
- Lighthouse mobile scores ≥ 90 for Performance and Accessibility.
- No horizontal scroll and no overlapping UI at 360 px, 768 px, 1024 px, 1366 px and 1920 px widths.
- A CSV export opens in Excel (French locale) with accents and columns displayed correctly, with no import wizard.
- A shared URL reproduces exactly the same result list on another device.

## 9. Open Questions

- Final project name and logo?
- Should recent searches be remembered on the device?
- Should towns be comparable side by side (2–3 towns)?
- Should driving distance or travel time be offered later? It would need an external routing service (e.g. OSRM or the IGN routing API), which raises rate-limit and reliability questions for a static site.
- Mobile pattern: bottom sheet or "Carte"/"Liste" tabs? The PRD allows either. Pick one during US-005.
- Should overseas communes be included by default, or behind a "Inclure l'outre-mer" option?
- Should the results list have a hard cap (e.g. 5 000) to protect very low-end phones?
- For DVF: which period should the averages cover (last 1, 3 or 5 years), and median or mean?
