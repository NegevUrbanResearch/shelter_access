#!/usr/bin/env python3
"""
Interactive 3D map of rocket alerts using deck.gl.
Features ESRI satellite basemap, extruded hexagons, and convex hull outline.
"""

import json
import pandas as pd

# =============================================================================
# LOAD DATA
# =============================================================================
print("Loading data...")

with open('./alerts-since-oct7-2023-filtered.geojson', 'r', encoding='utf-8') as f:
    alerts_data = json.load(f)

with open('./convex_hull.geojson', 'r', encoding='utf-8') as f:
    hull_data = json.load(f)

# Extract alert points
points = []
for feature in alerts_data['features']:
    coords = feature['geometry']['coordinates']
    props = feature['properties']
    points.append({
        'lon': coords[0],
        'lat': coords[1],
        'city': props.get('city_name_en', ''),
        'zone': props.get('zone', ''),
        'date': props.get('date', '')[:10] if props.get('date') else ''
    })

df = pd.DataFrame(points)
print(f"Loaded {len(df)} alerts")

# Get convex hull coordinates
hull_coords = hull_data['features'][0]['geometry']['coordinates'][0]
print(f"Loaded convex hull with {len(hull_coords)} vertices")

# Calculate center
center_lon = df['lon'].mean()
center_lat = df['lat'].mean()

# Pre-calculate hexagon bin counts for legend
import numpy as np
from collections import Counter

# Simple hex binning to get min/max counts
hex_size = 0.015  # degrees, roughly matches 1500m radius
df['hex_x'] = (df['lon'] / hex_size).astype(int)
df['hex_y'] = (df['lat'] / hex_size).astype(int)
df['hex_key'] = df['hex_x'].astype(str) + '_' + df['hex_y'].astype(str)
hex_counts = df['hex_key'].value_counts()
min_count = int(hex_counts.min())
max_count = int(hex_counts.max())
print(f"Hex bin range: {min_count} - {max_count} alerts per cell")

# =============================================================================
# CUSTOM HTML WITH SATELLITE BASEMAP
# =============================================================================
html_template = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Rocket Alerts - 3D Visualization</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://unpkg.com/deck.gl@8.9.0/dist.min.js"></script>
    <script src="https://unpkg.com/maplibre-gl@3.0.0/dist/maplibre-gl.js"></script>
    <link href="https://unpkg.com/maplibre-gl@3.0.0/dist/maplibre-gl.css" rel="stylesheet" />
    <style>
        body {{ margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }}
        #map {{ position: absolute; top: 0; left: 0; right: 0; bottom: 0; }}

        /* Legend */
        #legend {{
            position: absolute;
            bottom: 24px;
            right: 24px;
            background: rgba(10, 10, 20, 0.92);
            border-radius: 10px;
            padding: 18px 22px;
            color: white;
            font-size: 14px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6);
            border: 1px solid rgba(255,255,255,0.15);
            min-width: 200px;
        }}
        #legend h3 {{
            margin: 0 0 12px 0;
            font-size: 16px;
            font-weight: 600;
        }}
        .gradient-bar {{
            height: 16px;
            border-radius: 3px;
            background: linear-gradient(to right, #fee5d9, #fcbba1, #fc9272, #fb6a4a, #ef3b2c, #cb181d, #99000d);
            margin-bottom: 6px;
        }}
        .gradient-labels {{
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: #ccc;
            margin-bottom: 14px;
            font-weight: 500;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            font-size: 13px;
            color: #bbb;
            margin-top: 8px;
        }}
        .hull-line {{
            height: 3px;
            width: 20px;
            background: rgba(255,255,255,0.85);
            margin-right: 10px;
            border-radius: 1px;
        }}

        /* Title */
        #title {{
            position: absolute;
            top: 24px;
            left: 24px;
            color: white;
            text-shadow: 0 2px 10px rgba(0,0,0,0.9);
        }}
        #title h1 {{
            margin: 0;
            font-size: 32px;
            font-weight: 700;
        }}
        #title .meta {{
            font-size: 14px;
            color: #ddd;
            margin-top: 6px;
        }}

        /* Controls hint */
        #controls {{
            position: absolute;
            top: 24px;
            right: 24px;
            background: rgba(10, 10, 20, 0.85);
            border-radius: 6px;
            padding: 10px 14px;
            color: #aaa;
            font-size: 12px;
        }}
    </style>
</head>
<body>
    <div id="map"></div>

    <div id="title">
        <h1>ROCKET ALERTS</h1>
        <div class="meta">Study Area &bull; Oct 2023 – Sep 2025 &bull; {num_alerts:,} alerts</div>
    </div>

    <div id="controls">
        Drag to rotate &bull; Scroll to zoom
    </div>

    <div id="legend">
        <h3>Alert Density</h3>
        <div class="gradient-bar"></div>
        <div class="gradient-labels">
            <span>{min_count}</span>
            <span>{max_count}</span>
        </div>
        <div class="legend-item">
            <div class="hull-line"></div>
            <span>Study area boundary</span>
        </div>
        <div class="legend-item" style="color: #999;">
            Height = alert count
        </div>
    </div>

    <script>
        const alertData = {alert_data_json};
        const hullCoords = {hull_coords_json};

        // Satellite style using ESRI World Imagery
        const satelliteStyle = {{
            version: 8,
            sources: {{
                'esri-satellite': {{
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}'
                    ],
                    tileSize: 256,
                    attribution: 'ESRI World Imagery'
                }}
            }},
            layers: [{{
                id: 'satellite-layer',
                type: 'raster',
                source: 'esri-satellite',
                minzoom: 0,
                maxzoom: 19
            }}]
        }};

        // Create MapLibre map with satellite
        const map = new maplibregl.Map({{
            container: 'map',
            style: satelliteStyle,
            center: [{center_lon}, {center_lat}],
            zoom: 9.5,
            pitch: 55,
            bearing: 20,
            antialias: true
        }});

        map.on('load', () => {{
            // Create deck.gl overlay
            const deckOverlay = new deck.MapboxOverlay({{
                layers: [
                    new deck.HexagonLayer({{
                        id: 'hexagon-layer',
                        data: alertData,
                        getPosition: d => [d.lon, d.lat],
                        radius: 1500,
                        elevationScale: 20,
                        elevationRange: [0, 2500],
                        extruded: true,
                        coverage: 0.82,
                        pickable: true,
                        autoHighlight: true,
                        colorRange: [
                            [254, 229, 217],
                            [252, 174, 145],
                            [251, 106, 74],
                            [222, 45, 38],
                            [165, 15, 21]
                        ],
                        material: {{
                            ambient: 0.64,
                            diffuse: 0.6,
                            shininess: 32
                        }}
                    }}),
                    new deck.PathLayer({{
                        id: 'hull-layer',
                        data: [{{ path: hullCoords }}],
                        getPath: d => d.path,
                        getColor: [255, 255, 255, 200],
                        getWidth: 100,
                        widthMinPixels: 2,
                        widthMaxPixels: 4,
                        capRounded: true,
                        jointRounded: true
                    }})
                ],
                getTooltip: ({{object}}) => object && object.points && {{
                    html: `<div style="padding:6px;font-family:Arial;font-size:12px;">
                        <b>${{object.points.length}} alerts</b>
                    </div>`,
                    style: {{
                        backgroundColor: 'rgba(20,20,30,0.9)',
                        color: 'white',
                        borderRadius: '4px'
                    }}
                }}
            }});

            map.addControl(deckOverlay);
            map.addControl(new maplibregl.NavigationControl(), 'bottom-left');
        }});
    </script>
</body>
</html>
"""

# Format the HTML
html_content = html_template.format(
    num_alerts=len(df),
    center_lon=center_lon,
    center_lat=center_lat,
    min_count=min_count,
    max_count=max_count,
    alert_data_json=df.to_json(orient='records'),
    hull_coords_json=json.dumps(hull_coords)
)

# Save HTML
output_file = './visualizations/alert_map_3d.html'
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(html_content)

print(f"\n✓ Map saved to: {output_file}")
print("  Open in browser, adjust view, then screenshot")
