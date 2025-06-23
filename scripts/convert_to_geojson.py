#!/usr/bin/env python3
"""
Convert shapefiles to GeoJSON format for web application
"""

import geopandas as gpd
import json
import os
from pathlib import Path

def convert_shapefile_to_geojson(shapefile_path, output_path):
    """Convert a shapefile to GeoJSON format"""
    try:
        # Read the shapefile
        gdf = gpd.read_file(shapefile_path)
        
        # Assert that we have valid data
        assert not gdf.empty, f"Shapefile {shapefile_path} is empty"
        assert gdf.crs is not None, f"Shapefile {shapefile_path} has no CRS defined"
        
        # Ensure we're in WGS84 (EPSG:4326) for web mapping
        if gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs('EPSG:4326')
        
        # Convert to GeoJSON
        geojson_data = gdf.to_json()
        
        # Parse and rewrite with pretty formatting
        parsed_geojson = json.loads(geojson_data)
        
        # Add some metadata
        parsed_geojson['metadata'] = {
            'source': os.path.basename(shapefile_path),
            'feature_count': len(gdf),
            'geometry_type': gdf.geom_type.iloc[0] if not gdf.empty else None,
            'bounds': gdf.total_bounds.tolist() if not gdf.empty else None
        }
        
        # Write to output file
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(parsed_geojson, f, indent=2, ensure_ascii=False)
        
        print(f"✓ Converted {shapefile_path} to {output_path}")
        print(f"  Features: {len(gdf)}")
        print(f"  Geometry type: {gdf.geom_type.iloc[0] if not gdf.empty else 'Unknown'}")
        print(f"  Bounds: {gdf.total_bounds}")
        print()
        
        return parsed_geojson
        
    except Exception as e:
        print(f"✗ Error converting {shapefile_path}: {e}")
        raise

def main():
    """Main conversion function"""
    data_dir = Path('data')
    
    # Ensure data directory exists
    assert data_dir.exists(), "Data directory not found"
    
    # Define shapefile conversions
    shapefiles = [
        ('negev_shelters.shp', 'shelters.geojson'),
        ('bedouin_buildings.shp', 'buildings.geojson')
    ]
    
    print("Converting shapefiles to GeoJSON...\n")
    
    for shapefile, geojson_file in shapefiles:
        shapefile_path = data_dir / shapefile
        geojson_path = data_dir / geojson_file
        
        # Verify shapefile exists
        assert shapefile_path.exists(), f"Shapefile {shapefile_path} not found"
        
        # Convert to GeoJSON
        geojson_data = convert_shapefile_to_geojson(str(shapefile_path), str(geojson_path))
        
        # Validate the conversion
        assert geojson_data['type'] == 'FeatureCollection', "Invalid GeoJSON structure"
        assert len(geojson_data['features']) > 0, "No features in converted GeoJSON"

    print("All conversions completed successfully!")

if __name__ == "__main__":
    main() 