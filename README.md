# Alentours

Trouvez toutes les communes françaises dans un rayon donné (1 à 100 km) autour
d'une ville ou d'un code postal, avec filtres
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
node scripts/build-amenities.mjs            # data/equipements.json (INSEE, BPE)
npm run data:all                            # les trois scripts à la suite
```

Le site ne contacte jamais ces API pour faire une recherche : seules les
tuiles de carte sont chargées depuis Internet, ainsi que les services gratuits
de la Géoplateforme IGN quand on les utilise (adresses saisies dans le champ de
recherche, temps et zones de trajet en voiture). La tendance démographique et
les prix sont chargés à la demande (ouverture d'une fiche, export, impression).

`communes.json` est stocké en colonnes (codes et coordonnées en écarts
successifs) pour rester léger : environ 0,5 Mo compressé pour ~35 000
communes. Le format est décrit dans `encodeColumns()`
(`scripts/build-communes.mjs`) et décodé par `decodeCommunes()`
(`js/lib/commune.js`).

Paris, Lyon et Marseille n'apparaissent dans certaines sources que par
arrondissement : les scripts les regroupent (somme des populations, moyenne
des prix médians pondérée par le nombre de ventes).

## Synchroniser les favoris (facultatif)

Par défaut, les favoris restent dans le navigateur. Avec un projet Firebase
(offre gratuite « Spark », sans carte bancaire), on peut se connecter avec un
compte Google et retrouver ses favoris et ses notes sur tous ses appareils.
Le SDK Firebase n'est téléchargé que pour les personnes qui se connectent.

1. <https://console.firebase.google.com> → **Créer un projet** (Google
   Analytics : inutile).
2. **Authentication** → Commencer → **Mode de connexion** → **Google** →
   Activer → Enregistrer.
3. **Authentication** → **Paramètres** → **Domaines autorisés** → ajouter
   `oragonn.github.io` (`localhost` y est déjà).
4. **Firestore Database** → Créer une base de données → emplacement en
   Europe (par ex. `eur3` ou `europe-west9` Paris) → **mode production**.
5. Firestore → **Règles** → coller le contenu de `firestore.rules` →
   **Publier**. Chaque compte ne peut lire et écrire que ses propres favoris.
6. **Paramètres du projet** (roue dentée) → Vos applications → **Web**
   (`</>`) → enregistrer l'application → copier l'objet `firebaseConfig`
   dans `js/firebase-config.js` (à la place de `null`).
7. `npm run stamp`, commit, push.

Facultatif : dans Google Cloud Console → API et services → Identifiants,
limiter la clé « Browser key » aux sites `oragonn.github.io/*` et
`localhost:*`.

Données enregistrées : un document `favoris/{uid}` par compte : favoris (code
INSEE, nom, dates), dossiers (nom, communes, notes, fiche client) et réglages
(ville de départ des itinéraires). Après une mise à jour de `firestore.rules`,
recollez-le dans la console et publiez.

Le bouton du compte est en haut à droite de la page : « Se connecter », puis,
une fois connecté, un menu avec la ville de départ des itinéraires,
« Se déconnecter » et « Supprimer mes données en ligne ». Une suppression de
favori se propage aux autres appareils (une marque invisible est gardée
180 jours).

## Avant chaque commit : `npm run stamp`

GitHub Pages laisse les navigateurs garder chaque fichier 10 minutes en
cache. Pour qu'une nouvelle version ne soit jamais mélangée avec d'anciens
fichiers, `index.html` référence chaque script, feuille de style et fichier
de données avec une empreinte de son contenu (`js/app.js?v=…`, via une
*import map*). `npm run stamp` recalcule ces empreintes ; `npm test` échoue
s'il a été oublié. `npm run data` le lance automatiquement.

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
js/sync.js          synchronisation des favoris et dossiers (Firebase, facultative)
js/firebase-config.js  configuration Firebase (null = désactivée)
firestore.rules     règles de sécurité de la base Firestore
js/config.js        nom du site, seuils, valeurs par défaut
js/lib/             logique pure, testée avec Node (aucun accès au DOM)
                    (après toute modification de js/, css/ ou data/ :
                    « npm run stamp », voir plus bas ; un test le vérifie)
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
- Équipements (écoles, collèges, lycées, crèches, médecins, pharmacies,
  supermarchés, boulangeries, poste, gares) : INSEE, Base permanente des
  équipements (plateforme Melodi, jeu DS_BPE).
- Temps de trajet en voiture et zones « à X min » : services d'itinéraire et
  d'isochrone de la Géoplateforme IGN (gratuits, sans clé), appelés seulement
  à la demande ; la distance à vol d'oiseau reste affichée.
- Budget : prix médian au m² DVF × surface ; indication, pas une estimation
  d'un bien (écart possible de 15 à 25 %).
- Fond « Satellite » : orthophotographies IGN – Géoplateforme, avec repli sur
  Esri World Imagery si la Géoplateforme ne répond pas.
- Si le site devient public avec beaucoup de trafic, respectez la
  [politique d'utilisation des tuiles OSM](https://operations.osmfoundation.org/policies/tiles/)
  et passez à un autre fournisseur.
