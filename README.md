# 🏠 Negev Shelter Access Analysis

A real-time web-based tool for analyzing and optimizing shelter accessibility for Bedouin communities in the Negev region. This application provides instant feedback on optimal shelter placement using precalculated DBSCAN clustering and greedy optimization algorithms.


## 📊 Data & Analysis

### **Input Data**
- **📍 Shelters**: 300 existing + 106 planned locations
- **🏘️ Buildings**: 77,807 Bedouin building footprints
- **📏 Coverage**: Multiple radii (100m, 150m, 200m, 250m, 300m)
- **🗺️ Region**: Negev desert, Israel

### **Precalculated Scenarios**
- **5 radius options** × **2 scenarios** (with/without planned) = **10 optimization datasets**
- **150 optimal locations** per scenario, ranked by effectiveness
- **Coverage statistics** and planned shelter evaluations included

### **Population Estimates**
- **7 people per building** (configurable assumption)
- **Coverage statistics** show both buildings and estimated population impact

## 🛠️ Technical Architecture

### **Frontend Stack (JS)**
- **deck.gl**: High-performance WebGL visualization
- **Turf.js**: Spatial operations (buffering, distance calculations)
- **Vanilla JavaScript**: No framework dependencies
- **Real-time data loading**: JSON files with precalculated results for quick updates

### **Site Optimization Algorithm (Python)**
```python
# DBSCAN + Greedy approach in shelter_optimizer.py
1. DBSCAN clustering (eps=coverage_radius, min_samples=5)
2. Calculate cluster centroids as candidate locations
3. Greedy selection with non-overlapping constraint
4. Generate statistics and coverage analysis
```

## Planned Deployment (Github Pages)
TO-DO

## 📁 Project Structure

```
shelter_access/
├── index.html                          # Main application
├── css/styles.css                      # Styling with new color scheme
├── js/
│   ├── spatial-analysis-simple.js     # Data loading & analysis logic
│   └── app.js                          # Real-time UI controller
├── data/
│   ├── buildings_light.geojson        # Building footprints (lightweight)
│   ├── shelters.geojson               # Existing + planned shelter 
│   └── optimal_locations/             # Precalculated optimization results
├── scripts/ # all scripts should be run only once and outputs are already stored in data folder, only use if needed to update data assets
│   ├── shelter_optimizer.py           # DBSCAN + Greedy optimization
│   ├── convert_to_geojson.py         # Shapefile conversion 
│   └── create_lightweight_data.py     # Data preprocessing
└── README.md
```

