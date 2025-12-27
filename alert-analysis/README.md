## Overview

This module provides:
- Historical rocket alert data export from tzevaadom.co.il
- Geographic filtering of alerts in the unrecognized villages (convex hull- same as in shelter tool)
- GeoJSON outputs

## Files

### Scripts

- **`export-geojson.js`** - Exports all rocket alerts since October 7, 2023 as GeoJSON
- **`filter-by-hull.js`** - Filters alerts to a unrecognized villages (convex hull)

### Data Files

- **`alerts-since-oct7-2023.geojson`** - Complete dataset (74,060 features, 16,346 unique alert events) for Israel
- **`alerts-since-oct7-2023-filtered.geojson`** - Filtered dataset for unrecognized villages
- **`convex_hull.geojson`** - Convex hull polygon defining the region of interest
- **`places.json`** - List of placenames and location coordinates

## Usage

### Export All Alerts

```bash
cd alert-analysis
node export-geojson.js
```

This will:
1. Fetch historical alerts from tzevaadom.co.il
2. Map city names to coordinates using places.json from the parent API
3. Export to `alerts-since-oct7-2023.geojson`

**Note:** Requires `places.json` in this directory (already included).

### Filter by Region

```bash
cd alert-analysis
node filter-by-hull.js
```

This will:
1. Load `alerts-since-oct7-2023.geojson`
2. Filter to alerts within `convex_hull.geojson`
3. Export to `alerts-since-oct7-2023-filtered.geojson`

## Data Structure

Each alert feature in the GeoJSON contains:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [lng, lat]
  },
  "properties": {
    "alert_id": 1234,
    "date": "2023-10-07T03:29:02.000Z",
    "timestamp": 1696649342,
    "city_name": "ערד",
    "city_name_en": "Arad",
    "alert_type": "missiles",
    "category": 0,
    "cities_in_alert": ["ערד", "דימונה"],
    "has_coordinates": true
  }
}
```

## Dependencies

- `axios` - HTTP requests
- `fs` - File system operations

Install with:
```bash
npm install axios
```

## Data Sources

- **tzevaadom.co.il**: Historical alerts API
  - URL: `https://www.tzevaadom.co.il/static/historical/all.json`
  - Contains 17,622 total alerts, 16,355 since Oct 7, 2023
- **places.json**: metadata with coordinates (included in this folder)

## Notes

- The tzevaadom dataset may not be complete 
- Some city names (91) couldn't be matched to coordinates and are included with `geometry: null`
- Alert IDs group related alerts from the same incident (same ID can have multiple timestamps)