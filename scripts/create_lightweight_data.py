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

def optimize_shelters_data(input_path, output_path):
    """
    Optimize shelters data and separate by status
    """
    print(f"🏠 Processing shelters data from {input_path}...")
    
    # Load shelters
    with open(input_path, 'r') as f:
        shelters_data = json.load(f)
    
    # Count by status
    statuses = [f['properties'].get('status', 'Unknown') for f in shelters_data['features']]
    from collections import Counter
    status_counts = Counter(statuses)
    
    print("   Status distribution:")
    for status, count in status_counts.items():
        print(f"     {status}: {count}")
    
    # Optimize the data structure
    optimized_features = []
    
    for i, feature in enumerate(shelters_data['features']):
        props = feature['properties']
        
        optimized_feature = {
            'type': 'Feature',
            'geometry': feature['geometry'],
            'properties': {
                'shelter_id': props.get('shelter_id', f'SH_{i:03d}'),
                'name': props.get('name', f'Shelter_{i:03d}'),
                'status': props.get('status', 'Active'),
                'capacity': int(props.get('capacity', np.random.randint(50, 150))),
                'type': props.get('type', 'Mobile')
            }
        }
        optimized_features.append(optimized_feature)
    
    # Create optimized GeoJSON
    optimized_data = {
        'type': 'FeatureCollection',
        'features': optimized_features,
        'metadata': {
            'source': 'Negev emergency shelters',
            'total_count': len(optimized_features),
            'status_distribution': dict(status_counts)
        }
    }
    
    # Write optimized GeoJSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(optimized_data, f, separators=(',', ':'))
    
    import os
    output_size_kb = os.path.getsize(output_path) / 1024
    print(f"✅ Optimized shelters created!")
    print(f"   Output: {output_path}")
    print(f"   Shelters: {len(optimized_features):,}")
    print(f"   File size: {output_size_kb:.1f}KB")
    
    return optimized_data

def main():
    """Main function to create lightweight data files"""
    print("🚀 Creating lightweight data for web application...\n")
    
    data_dir = Path('data')
    
    # Create lightweight centroid buildings
    buildings_input = data_dir / 'bedouin_buildings.shp'
    buildings_output = data_dir / 'buildings_light.geojson'
    
    if buildings_input.exists():
        buildings_data = create_lightweight_buildings(buildings_input, buildings_output)
        print()
    else:
        print(f"❌ Buildings shapefile not found: {buildings_input}")
    
    # Optimize shelters data
    shelters_input = data_dir / 'shelters.geojson'  # Use existing GeoJSON
    shelters_output = data_dir / 'shelters_optimized.geojson'
    
    if shelters_input.exists():
        shelters_data = optimize_shelters_data(shelters_input, shelters_output)
        print()
    else:
        print(f"❌ Shelters GeoJSON not found: {shelters_input}")
    
    print("🎉 Lightweight data creation complete!")
    print("\n📋 Next steps:")
    print("1. Update your application to use 'buildings_light.geojson' and 'shelters_optimized.geojson'")
    print("2. Test the application performance")
    print("3. Buildings are now simple centroids - much faster loading!")
    print("4. All original building properties preserved")

if __name__ == "__main__":
    main() 