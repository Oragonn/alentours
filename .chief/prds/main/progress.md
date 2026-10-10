# Progress — Alentours

Date : 2026-10-10. Toutes les stories du PRD (US-001 à US-029) sont
implémentées. `npm test` : 46 tests, tous verts. Aucune erreur console
(vérifié en headless à 360, 375, 768, 1024, 1366 et 1920 px).

## Statut par story

| Story | Statut | Notes |
|---|---|---|
| US-001 Squelette | ✅ | Leaflet 1.9.4 vendorisé (`vendor/`, hash identique à la version officielle). `npm test` utilise `node --test tests/*.test.js` : Node 22 n'accepte plus un dossier. |
| US-002 Données communes | ✅ | 34 969 communes (outre-mer et COM inclus), 0 ignorée, 6 sans population. Format en colonnes : 0,51 Mo gzip. |
| US-003 Logique pure | ✅ | |
| US-004 Chargement | ✅ | Message dans l'en-tête (pas de décalage de mise en page), erreur + « Réessayer ». |
| US-005 Mise en page | ✅ | Mobile : panneau coulissant (réduit / moitié / plein écran), bouton « Voir la carte / Voir la liste ». Aucune barre de défilement horizontale. |
| US-006 Fonds de carte | ✅ | IGN Géoplateforme avec repli Esri. |
| US-007 à US-012 | ✅ | Recherche de 100 km autour de Paris : ~9 ms (Node). |
| US-013 à US-019 | ✅ | Liste paginée par 100 (« Afficher plus »). |
| US-020 Thèmes | ⚠️ écart | CARTO Dark Matter exige désormais une clé d'API (tuiles « API KEY REQUIRED »). Le mode sombre assombrit les tuiles OSM par un filtre CSS. |
| US-021 à US-023 | ✅ | Impression vérifiée (rendu clair même en mode sombre). |
| US-024 Qualité | ⚠️ partiel | Voir ci-dessous. |
| US-025 Multi-points | ✅ | Jusqu'à 5 points. Paramètre d'URL `pt=code,rayon` ou `pt=lat,lon,rayon`. |
| US-026 / US-027 Favoris | ✅ | Clé `alentours.favoris.v1`. |
| US-028 Tendance | ✅ | INSEE, historique 1876-2023 (xlsx lu sans dépendance). Comparaison 2023 / 2013, courbe 1982-2023. Paris = somme des arrondissements. |
| US-029 Prix DVF | ✅ | data.gouv.fr « Statistiques DVF », période 2021–2025, 33 196 communes. |

## US-024 : points ouverts

- **Lighthouse mobile** (Lighthouse 12.2.1, Brave headless) : Accessibilité
  100, Bonnes pratiques 96, **Performance 85** (FCP 1,5 s, LCP 4,2–4,4 s,
  TBT ≤ 80 ms, CLS 0). Le LCP est une tuile OSM : même avec le fichier des
  communes bloqué, le score reste à 84. Le plafond vient des tuiles raster
  (~300 Ko de PNG, origine tierce) sur la connexion 4G lente simulée.
  Pistes : un fournisseur de tuiles plus léger, ou des tuiles vectorielles.
- **Déploiement GitHub Pages** : fait le 2026-10-10 — https://oragonn.github.io/alentours/ (dépôt https://github.com/Oragonn/alentours). Vérifié depuis l'URL publique : recherche d'exemple, fiche, tendance, prix, aucune erreur console.

## Choix faits pendant l'implémentation

- Panneau coulissant plutôt qu'onglets Carte/Liste (question ouverte du PRD).
- Outre-mer inclus par défaut, pas de plafond de résultats (liste paginée).
- Sur mobile, la carte s'arrête au bord du panneau : seules les tuiles
  visibles sont chargées.
- Tendance « Stable » affichée avec son pourcentage : « Stable (+0,4 % depuis 2013) ».
- Paris, Lyon, Marseille : prix DVF = moyenne des médianes des
  arrondissements, pondérée par le nombre de ventes (DVF ne donne pas la
  commune entière).
