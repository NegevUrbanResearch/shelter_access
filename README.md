# 🏠 Negev Shelter Access Analysis

A real-time web-based tool for analyzing and optimizing shelter accessibility for Bedouin communities in the Negev region. This application provides instant feedback on optimal shelter placement using precalculated DBSCAN clustering and greedy optimization algorithms. The tool was covered in an [article](https://www.ynet.co.il/architecture/article/ry9tp9gtxe) by Yediot Ahronot.


## 📊 Data & Analysis

### **Input Data**
- **📍 Shelters**: existing + requested locations collected by [Bimkom](https://bimkom.org/eng/home-mobile/)
- **🏘️ Buildings**: Footprint data from [MS Planetary Computer](https://planetarycomputer.microsoft.com/)

## 🛠️ Technical Architecture

### **Frontend Stack (JS)**
- **deck.gl**: High-performance WebGL visualization
- **Turf.js**: Spatial operations (buffering, distance calculations)
- **Vanilla JavaScript**: No framework dependencies
- **Real-time data loading**: JSON files with precalculated results for quick updates

### **Site Optimization Algorithm (Python)**
```python
DBSCAN + Kmeans Ensemble in shelter_optimizer.py

Algorithm:
1. DBSCAN Clustering: Find natural building clusters using 10 eps values (0.1-1.0)
2. K-means Clustering: Find systematic centroids using k=750,1500 with 2 seeds each
3. Combined Analysis: Calculate centroids and coverage for each cluster
4. Optimal Selection: Choose clusters with most that maximize coverage while ensuring clusters don't overlap

```
## Deployment 
Deployed through Github Pages at [https://negevurbanresearch.github.io/shelter_access/](https://negevurbanresearch.github.io/shelter_access/)

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
│   ├── shelters.geojson               # Existing + requested shelter 
│   └── optimal_locations/             # Precalculated optimization results
├── scripts/ # all scripts should be run only once and outputs are already stored in data folder, only use if needed to update data assets
│   ├── shelter_optimizer.py           # DBSCAN + KMeans Ensemble
│   ├── convert_to_geojson.py         # Shapefile conversion 
│   └── create_lightweight_data.py     # Data preprocessing
└── README.md
```

