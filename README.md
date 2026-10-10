# Alentours

Trouvez toutes les communes françaises dans un rayon donné (1 à 100 km) autour
d'une ville, d'un code postal ou d'un point cliqué sur la carte, avec filtres
de population, de département et de région.

Site statique : HTML, CSS et JavaScript (modules ES), sans framework, sans
étape de compilation, sans serveur ni base de données. Les données des
communes sont des fichiers JSON pré-générés dans `data/`.

## Lancer en local

Il faut [Node.js](https://nodejs.org/) 20 ou plus récent (uniquement pour le
serveur de développement, les tests et les scripts de données).

```bash
npm start
```

puis ouvrez <http://localhost:3000>. N'importe quel serveur de fichiers
statiques convient, par exemple `npx serve .` ou `python -m http.server`.
Ouvrir `index.html` directement (`file://`) ne fonctionne pas : les navigateurs
bloquent le chargement des modules et des fichiers JSON dans ce cas.

## Tests

```bash
npm test
```

Les tests (`node --test`) couvrent la logique pure : distances, catégories de
taille, normalisation du texte, recherche, tri, CSV, encodage de l'URL,
favoris, tendance démographique et prix.

## Mettre à jour les données

```bash
npm run data
```

Télécharge toutes les communes depuis [geo.api.gouv.fr](https://geo.api.gouv.fr/)
et réécrit `data/communes.json`, `data/departements.json` et `data/regions.json`.
Le script affiche le nombre de communes, les communes ignorées et la taille du
fichier (brute et compressée). Les populations légales INSEE changent une fois
par an (en janvier) : relancez le script à ce moment-là, puis committez les
fichiers de `data/`.

Le millésime des populations est déduit de la date (année courante − 3). Pour
le forcer : `POPULATION_YEAR=2023 npm run data`.

Données complémentaires (Phase 2) :

```bash
node scripts/build-population-history.mjs   # data/population-trend.json (INSEE)
node scripts/build-dvf.mjs                  # data/prix.json (DVF, data.gouv.fr)
npm run data:all                            # les trois scripts à la suite
```

Le site ne contacte jamais ces API pour faire une recherche : seules les
tuiles de carte sont chargées depuis Internet.

## Déployer sur GitHub Pages

1. Créez un dépôt sur GitHub et poussez ce dossier (branche `main`), fichiers
   de `data/` compris.
2. Dans le dépôt : **Settings → Pages → Build and deployment**, choisissez
   **Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Après une minute, le site est en ligne sur
   `https://<utilisateur>.github.io/<dépôt>/`.

Le fichier `.nojekyll` évite que GitHub Pages ignore certains fichiers. Tous
les chemins sont relatifs : le site fonctionne aussi dans un sous-dossier.

**Netlify** : « Add new site → Deploy manually » et glissez le dossier, ou
reliez le dépôt avec un répertoire de publication `.` et aucune commande de
build.

## Structure

```
index.html          page unique
css/style.css       styles (thèmes clair/sombre, impression)
js/app.js           point d'entrée : formulaire, liste, fiche, partage
js/map.js           carte Leaflet
js/config.js        nom du site, seuils, valeurs par défaut
js/lib/             logique pure, testée avec Node (aucun accès au DOM)
js/ui/              composants d'interface
data/               données générées (committées)
scripts/            scripts de préparation des données
tests/              tests unitaires
vendor/             Leaflet 1.9.4 (licence BSD-2)
```

Le nom « Alentours » est provisoire : il est défini dans `js/config.js`
(`APP_NAME`) et dans la balise `<title>` de `index.html`.

## Sources et licences des données

- Communes, populations, surfaces : INSEE via geo.api.gouv.fr (Licence Ouverte).
- Fond « Plan » : © les contributeurs d'OpenStreetMap (ODbL). En mode sombre,
  les mêmes tuiles sont assombries par un filtre CSS : les fonds sombres
  gratuits (CARTO Dark Matter…) exigent désormais une clé d'API.
- Fond « Satellite » : orthophotographies IGN – Géoplateforme, avec repli sur
  Esri World Imagery si la Géoplateforme ne répond pas.
- Si le site devient public avec beaucoup de trafic, respectez la
  [politique d'utilisation des tuiles OSM](https://operations.osmfoundation.org/policies/tiles/)
  et passez à un autre fournisseur.
