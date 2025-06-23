# 🏠 Negev Shelter Access Analysis

A comprehensive web-based tool for analyzing and optimizing shelter accessibility for Bedouin communities in the Negev region. This application helps identify optimal locations for new emergency shelters based on building density and coverage analysis.

## 🌟 Features

- **Interactive Map Visualization**: Beautiful deck.gl-powered map showing buildings, existing shelters, and coverage areas
- **Coverage Analysis**: Calculate current shelter coverage with adjustable radius parameters
- **Optimal Location Finding**: Algorithm to identify the best locations for new shelters based on building density
- **Real-time Statistics**: Live updates of coverage percentages and population estimates
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🎯 How It Works

### Key Parameters
- **Shelter Coverage Radius**: Distance within which a shelter is considered accessible (default: 100m)
- **Number of New Shelters**: How many additional shelters to place optimally (1-50)

### Analysis Process
1. **Current Coverage**: Calculates which buildings are within the coverage radius of existing shelters
2. **Optimal Placement**: Uses a grid-based algorithm to find locations that maximize coverage of uncovered buildings
3. **Impact Assessment**: Shows improvement in coverage percentage and estimated people served

### Population Estimates
- Approximately **7 people per building** (configurable)
- Statistics show both building counts and estimated population impact

## 🚀 Getting Started

### For GitHub Pages Deployment

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd shelter_access
   ```

2. **Convert shapefiles to GeoJSON** (if data changes):
   ```bash
   python scripts/convert_to_geojson.py
   ```

3. **Enable GitHub Pages**:
   - Go to your repository settings
   - Navigate to "Pages" section
   - Select "Deploy from a branch"
   - Choose "main" branch and "/ (root)" folder
   - Save and wait for deployment

4. **Access the application**:
   Your app will be available at: `https://yourusername.github.io/shelter_access`

### Local Development

1. **Install dependencies** (for shapefile conversion):
   ```bash
   conda install -c conda-forge geopandas
   # or
   pip install geopandas
   ```

2. **Serve locally**:
   ```bash
   python -m http.server 8000
   # or use any local web server
   ```

3. **Open in browser**: `http://localhost:8000`

## 📊 Data Structure

### Input Data
- **Shelters**: Point geometries representing existing emergency shelters (300 features)
- **Buildings**: Polygon geometries representing Bedouin buildings (77,807 features)
- **Coordinate System**: WGS84 (EPSG:4326)
- **Coverage Area**: Negev region, Israel

### Data Processing
- Shapefiles automatically converted to GeoJSON for web compatibility
- Spatial analysis uses Turf.js for client-side processing
- Coverage calculations use buffering and intersection operations

## 🎨 Visualization

### Map Layers
- **Buildings**: 
  - 🟢 Green: Covered by existing shelters
  - 🔷 Light Green: Newly covered by proposed shelters  
  - ⚪ Gray: Uncovered buildings
- **Existing Shelters**: 🔴 Red circles with coverage radius
- **Proposed Shelters**: 🟠 Orange circles sized by effectiveness score
- **Coverage Areas**: Semi-transparent circles showing shelter accessibility zones

### Interactive Features
- **Hover Information**: Building area, estimated population, shelter details
- **Real-time Updates**: Adjust coverage radius and see immediate changes
- **Responsive Controls**: Sliders for coverage distance and shelter count
- **Statistical Dashboard**: Live coverage percentages and impact metrics

## 🔧 Technical Architecture

### Frontend Stack
- **deck.gl**: High-performance WebGL data visualization
- **Turf.js**: Client-side spatial analysis
- **Mapbox GL**: Base map and cartographic styling
- **Vanilla JavaScript**: No framework dependencies for maximum performance
- **CSS Grid/Flexbox**: Responsive layout design

### Spatial Analysis Algorithm
1. **Coverage Calculation**: Buffer existing shelters by coverage radius
2. **Intersection Testing**: Check which buildings fall within coverage areas  
3. **Grid Generation**: Create candidate locations based on uncovered buildings
4. **Scoring System**: Rank candidates by number of buildings they would cover
5. **Non-overlap Selection**: Choose optimal non-competing locations

### Performance Optimizations
- **Client-side Processing**: All analysis runs in the browser
- **Efficient Buffering**: Uses optimized Turf.js operations
- **Layer Management**: Dynamic layer creation for smooth interactions
- **Data Validation**: Comprehensive assertion-based error checking

## 📁 Project Structure

```
shelter_access/
├── index.html              # Main application page
├── css/
│   └── styles.css          # Application styling
├── js/
│   ├── spatial-analysis.js # Core spatial analysis logic
│   └── app.js              # Main application controller
├── data/
│   ├── shelters.geojson    # Existing shelter locations
│   ├── buildings.geojson   # Building footprints
│   └── *.shp              # Original shapefile data
├── scripts/
│   └── convert_to_geojson.py # Data conversion utility
└── README.md              # This file
```

## 🔍 Usage Guide

1. **Adjust Coverage Radius**: Use the slider to change the shelter accessibility distance (50-500m)
2. **Set New Shelter Count**: Choose how many additional shelters to place (1-50)
3. **Run Analysis**: Click "Analyze Optimal Locations" to find the best placements
4. **Review Results**: Examine the statistics panel for coverage improvements
5. **Explore Interactively**: Hover over buildings and shelters for detailed information

## 🎯 Analysis Insights

### Current Baseline
- **300 existing shelters** across the Negev region
- **77,807 building footprints** representing Bedouin communities
- Default **100m coverage radius** based on accessibility standards

### Optimization Goals
- **Maximize Coverage**: Find locations that serve the most uncovered buildings
- **Minimize Overlap**: Avoid placing shelters too close to existing ones
- **Population Impact**: Prioritize areas with higher building density
- **Accessibility**: Ensure shelters are within walking distance of communities

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test the application locally
5. Submit a pull request

## 📝 License

This project is open source and available under the MIT License.

## 🆘 Support

For questions or issues:
- Open a GitHub issue
- Check the browser console for error messages
- Ensure all data files are properly loaded

---

**Built with ❤️ for improving emergency shelter accessibility in the Negev region**
