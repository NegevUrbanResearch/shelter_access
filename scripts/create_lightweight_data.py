#!/usr/bin/env python3
"""
Create lightweight GeoJSON files for web application
Converts building polygons to centroids for better performance
"""

import geopandas as gpd
import json
import numpy as np
from pathlib import Path

def create_lightweight_buildings(input_path, output_path):
    """
    Convert building polygons to centroid points
    
    Args:
        input_path: Path to original buildings shapefile
        output_path: Path for lightweight GeoJSON output
    """
    print(f"📊 Loading buildings data from {input_path}...")
    
    # Load original buildings
    gdf = gpd.read_file(input_path)
    original_count = len(gdf)
    print(f"   Original buildings: {original_count:,}")
    
    # Ensure proper CRS
    if gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs('EPSG:4326')
    
    # Convert polygons to centroids
    print("📐 Converting polygons to centroids...")
    gdf['geometry'] = gdf.geometry.centroid
    
    # Convert to GeoJSON
    print("💾 Creating GeoJSON...")
    geojson_data = json.loads(gdf.to_json())
    
    # Fix numpy serialization issues
    for feature in geojson_data['features']:
        props = feature['properties']
        # Convert numpy types to Python types
        for key, value in props.items():
            if hasattr(value, 'item'):  # numpy scalar
                props[key] = value.item()
            elif isinstance(value, (np.int64, np.int32)):
                props[key] = int(value)
            elif isinstance(value, (np.float64, np.float32)):
                props[key] = float(value)
    
    # Write GeoJSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(geojson_data, f, separators=(',', ':'))
    
    # Report results
    import os
    output_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    
    print(f"✅ Centroid buildings created!")
    print(f"   Output: {output_path}")
    print(f"   Buildings: {len(gdf):,} (all buildings converted)")
    print(f"   File size: {output_size_mb:.1f}MB")
    
    return geojson_data

def main():
    """Main function to create lightweight data files"""
    print("🚀 Creating lightweight data for web application...\n")
    
    data_dir = Path('data')
    
    # Create lightweight centroid buildings
    buildings_input = data_dir / 'buildings.geojson'
    buildings_output = data_dir / 'buildings_light.geojson'
    
    if buildings_input.exists():
        buildings_data = create_lightweight_buildings(buildings_input, buildings_output)
        print()
    else:
        print(f"❌ Buildings shapefile not found: {buildings_input}")
    

if __name__ == "__main__":
    main() 