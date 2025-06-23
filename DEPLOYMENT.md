# 🚀 GitHub Pages Deployment Guide

## Quick Start for GitHub Pages

### 1. Repository Setup
```bash
# Add all files to git
git add .
git commit -m "🎉 Initial deployment of Shelter Access Analysis app"
git push origin main
```

### 2. Enable GitHub Pages
1. Go to your repository on GitHub
2. Click **Settings** tab
3. Scroll down to **Pages** section in the left sidebar
4. Under **Source**, select:
   - **Deploy from a branch**
   - Branch: **main** 
   - Folder: **/ (root)**
5. Click **Save**
6. Wait 2-3 minutes for deployment

### 3. Access Your App
Your application will be available at:
```
https://yourusername.github.io/shelter_access
```

## ✅ Pre-deployment Checklist

- [x] HTML file (`index.html`) in root directory
- [x] CSS files in `css/` directory  
- [x] JavaScript files in `js/` directory
- [x] GeoJSON data files in `data/` directory
- [x] All external libraries loaded via CDN
- [x] Responsive design for mobile/desktop
- [x] Error handling for data loading
- [x] Loading states for analysis operations

## 🔧 Local Testing

Before deploying, test locally:

```bash
# Start local server
python -m http.server 8000

# Open in browser
open http://localhost:8000
```

### Test Checklist:
- [ ] Map loads and displays correctly
- [ ] Building and shelter data loads
- [ ] Coverage analysis updates when sliders change
- [ ] Optimal location analysis runs successfully
- [ ] Statistics update correctly
- [ ] Hover tooltips work
- [ ] Mobile responsive layout

## 📊 Application Features

### Core Functionality
- **Interactive Map**: deck.gl visualization with Mapbox base layer
- **Real-time Analysis**: Client-side spatial calculations using Turf.js
- **Coverage Optimization**: Grid-based algorithm for optimal shelter placement
- **Statistics Dashboard**: Live coverage metrics and population estimates

### User Interface
- **Coverage Radius Slider**: 50-500 meters (default: 100m)
- **New Shelters Count**: 1-50 shelters (default: 10)
- **Analyze Button**: Trigger optimal location analysis
- **Statistics Panel**: Coverage percentages and population impact

### Visualization Layers
- 🟢 **Green Buildings**: Covered by existing shelters
- 🔷 **Light Green Buildings**: Newly covered by proposed shelters
- ⚪ **Gray Buildings**: Uncovered buildings
- 🔴 **Red Circles**: Existing shelters with coverage radius
- 🟠 **Orange Circles**: Proposed shelter locations

## 🎯 Data Overview

- **Shelters**: 300 existing emergency shelters (Point geometries)
- **Buildings**: 77,807 Bedouin building footprints (Polygon geometries)
- **Coverage Area**: Negev region, Israel
- **Coordinate System**: WGS84 (EPSG:4326)
- **Population Estimate**: ~7 people per building

## 🐛 Troubleshooting

### Common Issues

**Map doesn't load:**
- Check browser console for errors
- Verify internet connection (libraries load from CDN)
- Ensure GeoJSON files are accessible

**Data loading fails:**
- Verify `data/shelters.geojson` and `data/buildings.geojson` exist
- Check file permissions and encoding
- Test with browser dev tools network tab

**Analysis runs slowly:**
- Normal for large datasets (77K buildings)
- Algorithm is optimized but may take 5-10 seconds
- Progress shown in loading overlay

**Mobile layout issues:**
- App includes responsive CSS
- Test on various screen sizes
- Control panel collapses on mobile

### Performance Notes
- Large dataset (77MB buildings.geojson)
- Client-side processing intensive
- Recommended: Modern browsers with WebGL support
- First load may take 10-30 seconds depending on connection

## 🔄 Updates and Maintenance

### Updating Data
If you need to update the shapefile data:

```bash
# Convert new shapefiles to GeoJSON
python scripts/convert_to_geojson.py

# Commit and deploy
git add data/
git commit -m "📊 Update spatial data"
git push origin main
```

### Code Updates
- Edit files in `js/`, `css/`, or root directory
- Test locally before committing
- GitHub Pages automatically redeploys on push to main

## 📧 Support

For deployment issues:
- Check GitHub Pages status
- Review browser console errors
- Verify all file paths are correct
- Test with multiple browsers

**Happy mapping! 🗺️** 