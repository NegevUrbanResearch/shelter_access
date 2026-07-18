# Negev Shelter Access Analysis

Interactive map for analyzing bomb shelter accessibility for Bedouin communities in the Eastern Negev. The app identifies underserved areas and proposes optimal new shelter locations using precomputed DBSCAN + K-means clustering. Covered in [Yediot Ahronot / Ynet](https://www.ynet.co.il/architecture/article/ry9tp9gtxe).

**Live demo:** [negevurbanresearch.github.io/shelter_access](https://negevurbanresearch.github.io/shelter_access/)


## License

This project is released under the [MIT License](./LICENSE).

## Authors

1. **Noam J. Gal** (corresponding) — Department of Geography, The Hebrew University of Jerusalem
2. **Artem Nikitin** — The Center for Urban Innovation, The Hebrew University of Jerusalem
3. **Michael Drogochinsky** — The Center for Urban Innovation, The Hebrew University of Jerusalem
4. **Yonatan Cohen** — Negev Urban Research Lab, Ben Gurion University
5. **Merav Battat** — Negev Urban Research Lab, Ben Gurion University
6. **Talia Kaufmann** — The Center for Urban Innovation, The Hebrew University of Jerusalem
7. **Ariel Noyman** — Media Lab, Massachusetts Institute of Technology

Project partners also included local partners at [Bimkom](https://bimkom.org/eng/home-mobile/) and [East Negev / Civix](https://www.linkedin.com/company/civixil/), as well as consultation and data provided by Arch. **Lobna Alsana**.

## Data & analysis

### Input data

- **Shelters**
  - Distributed mobile shelters and permanent shelters in educational institutes from [Eshkol Negev Mizrach](https://eastnegev.org/)
  - Formal and informal shelter locations collected by [Bimkom](https://bimkom.org/eng/home-mobile/) field workers and community submissions
- **Buildings**: footprints from [MS Planetary Computer](https://planetarycomputer.microsoft.com/)

Precomputed optimizer outputs ship under `data/optimal_locations/`. Building and administrative GeoJSON used by the map are included in `data/`.

### Site optimization algorithm (Python)

`scripts/shelter_optimizer_ensemble.py` runs an offline DBSCAN + K-means ensemble:

1. **DBSCAN**: natural building clusters across 10 `eps` multipliers (0.1–1.0) relative to coverage radius
2. **K-means**: systematic centroids at `k=750` and `k=1500` (2 seeds each)
3. **Selection**: choose non-overlapping candidates that maximize coverage, accounting for existing shelters

Assumptions encoded in the optimizer include ~7 people per building footprint and a 500-shelter planning target (see constants at the top of the script).

## Quick start (web app)

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000). For a live-reload server: `npm run dev`.

The site is static (HTML/CSS/JS + GeoJSON). No backend is required at runtime.

## Reproducing the analysis (Python)

Scripts under `scripts/` are one-off preprocessing jobs; outputs are already stored in `data/`. Re-run only when updating source assets.

```bash
python -m pip install -r requirements.txt
python scripts/shelter_optimizer_ensemble.py
```

Other utilities:

| Script | Role |
|---|---|
| `shelter_optimizer_ensemble.py` | DBSCAN + K-means shelter siting |
| `create_lightweight_data.py` | Lightweight buildings GeoJSON for the map |
| `calculate_accessibility_heatmap.py` | Accessibility heatmap JSON |
| `generate_shelter_statistics.py` | Summary charts (writes to `output/`) |
| `filter_geospatial_data.py` | Spatial filters for study area |
| `simplify_statistical_areas.py` | Simplify statistical-area polygons |

### Alert analysis submodule

`alert-analysis/` scrapes and filters historical rocket-alert places. Large alert GeoJSON files are gitignored; regenerate with the Node export/filter scripts documented in [`alert-analysis/README.md`](./alert-analysis/README.md).

## Technical architecture

| Layer | Stack |
|---|---|
| Visualization | deck.gl (WebGL), Turf.js, vanilla JS |
| Analysis | Python (`numpy`, `scikit-learn`, `geopandas`, `shapely`) |
| Deploy | GitHub Pages (static site) |

## Project structure

```
shelter_access/
├── index.html                 # Main application
├── css/styles.css
├── js/
│   ├── app.js                 # UI / map controller
│   └── spatial-analysis-simple.js
├── data/                      # GeoJSON + precomputed optimizer outputs
├── scripts/                   # Offline Python analysis (run once to refresh data)
├── alert-analysis/            # Optional alert scrape / filter tooling
├── CITATION.cff               # Citation metadata (GitHub + Zenodo)
├── LICENSE                    # MIT
├── requirements.txt           # Python deps for scripts/
└── package.json
```

## Zenodo archive

To mint a DOI via GitHub ↔ Zenodo:

1. Merge this citation-ready metadata to `main`.
2. On [Zenodo](https://zenodo.org/), enable GitHub integration for `NegevUrbanResearch/shelter_access`.
3. Create a GitHub Release (e.g. tag `v1.0.0`). Zenodo will archive the release and mint a DOI, using fields from `CITATION.cff`.
4. Add the DOI under `identifiers` in `CITATION.cff` and update the BibTeX block above (and optionally a DOI badge in this README).

Do **not** add a competing `.zenodo.json` unless you need Zenodo-only fields; if both exist, Zenodo prefers `.zenodo.json` and ignores `CITATION.cff` for deposit metadata.
