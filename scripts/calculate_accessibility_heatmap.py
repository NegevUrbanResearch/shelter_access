#!/usr/bin/env python3
"""
Precalculate accessibility heatmap data for shelter access analysis.
For each building, calculates distance to nearest existing shelter and converts to heatmap weight.
"""

import json
import geopandas as gpd
import numpy as np
from shapely.geometry import Point
from pathlib import Path
import sys
from math import sqrt
import time

def load_geojson(filepath):
    """Load GeoJSON file into GeoDataFrame"""
    try:
        gdf = gpd.read_file(filepath)
        print(f"✓ Loaded {len(gdf)} features from {filepath}")
        return gdf
    except Exception as e:
        print(f"❌ Error loading {filepath}: {e}")
        return None

def get_building_centroid(geometry):
    """Extract centroid coordinates from building geometry"""
    if geometry.geom_type == 'Point':
        return [geometry.x, geometry.y]
    elif geometry.geom_type in ['Polygon', 'MultiPolygon']:
        centroid = geometry.centroid
        return [centroid.x, centroid.y]
    else:
        return None

def calculate_distance_degrees(point1, point2):
    """Calculate Euclidean distance between two points in degrees"""
    dx = point1[0] - point2[0]
    dy = point1[1] - point2[1]
    return sqrt(dx*dx + dy*dy)

def degrees_to_meters(distance_degrees, avg_latitude=31.0):
    """Convert distance in degrees to meters (approximate)"""
    # At Jerusalem's latitude (~31°), 1 degree ≈ 93,000-111,000 meters
    # Using a conservative estimate
    return distance_degrees * 100000  # ~100km per degree

def calculate_accessibility_weights(buildings_gdf, existing_shelters_gdf, coverage_radii=[100, 150, 200, 250, 300]):
    """
    Calculate accessibility heatmap data for multiple coverage radii.
    Returns dict with radius as key and accessibility points as value.
    """
    print(f"📊 Calculating accessibility for {len(buildings_gdf)} buildings and {len(existing_shelters_gdf)} shelters...")
    
    # Extract building centroids
    building_points = []
    building_indices = []
    
    for idx, building in buildings_gdf.iterrows():
        centroid = get_building_centroid(building.geometry)
        if centroid:
            building_points.append(centroid)
            building_indices.append(idx)
    
    print(f"✓ Extracted {len(building_points)} valid building centroids")
    
    # Extract shelter coordinates
    shelter_points = []
    for _, shelter in existing_shelters_gdf.iterrows():
        if shelter.geometry.geom_type == 'Point':
            shelter_points.append([shelter.geometry.x, shelter.geometry.y])
    
    print(f"✓ Extracted {len(shelter_points)} shelter coordinates")
    
    if not shelter_points:
        print("❌ No shelter points found!")
        return {}
    
    # Calculate accessibility for each coverage radius
    results = {}
    
    for radius_m in coverage_radii:
        print(f"\n🔄 Processing coverage radius: {radius_m}m...")
        start_time = time.time()
        
        accessibility_points = []
        max_distance_m = radius_m * 3  # Use 3x coverage radius as max for color scaling
        
        # Calculate distance from each building to nearest shelter
        for i, building_coord in enumerate(building_points):
            min_distance_degrees = float('inf')
            
            # Find nearest shelter
            for shelter_coord in shelter_points:
                distance_degrees = calculate_distance_degrees(building_coord, shelter_coord)
                if distance_degrees < min_distance_degrees:
                    min_distance_degrees = distance_degrees
            
            # Convert to meters
            distance_meters = degrees_to_meters(min_distance_degrees)
            
            # Calculate weight (closer = higher weight for better visualization)
            # Use inverse relationship: closer buildings get higher weights
            normalized_distance = min(distance_meters, max_distance_m) / max_distance_m  # 0-1 range
            weight = max(0.1, 1 - normalized_distance)  # Invert so closer = higher weight
            
            accessibility_points.append({
                'position': building_coord,
                'weight': round(weight, 3),
                'distance': round(distance_meters, 1),
                'buildingIndex': building_indices[i]
            })
            
            # Progress reporting
            if (i + 1) % 1000 == 0:
                progress = (i + 1) / len(building_points) * 100
                print(f"   Progress: {progress:.1f}% ({i + 1}/{len(building_points)} buildings)")
        
        elapsed_time = time.time() - start_time
        print(f"✅ Completed {radius_m}m radius in {elapsed_time:.2f}s")
        
        # Calculate statistics
        distances = [p['distance'] for p in accessibility_points]
        weights = [p['weight'] for p in accessibility_points]
        
        stats = {
            'total_points': len(accessibility_points),
            'avg_distance': round(np.mean(distances), 1),
            'min_distance': round(np.min(distances), 1),
            'max_distance': round(np.max(distances), 1),
            'avg_weight': round(np.mean(weights), 3),
            'coverage_radius': radius_m,
            'max_distance_for_scaling': max_distance_m
        }
        
        print(f"   📊 Statistics:")
        print(f"      Average distance: {stats['avg_distance']}m")
        print(f"      Distance range: {stats['min_distance']}m - {stats['max_distance']}m")
        print(f"      Average weight: {stats['avg_weight']}")
        
        results[f"{radius_m}m"] = {
            'accessibility_points': accessibility_points,
            'statistics': stats,
            'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            'metadata': {
                'total_buildings': len(building_points),
                'total_shelters': len(shelter_points),
                'coverage_radius_meters': radius_m,
                'max_distance_meters': max_distance_m
            }
        }
    
    return results

def main():
    print("🔥 Calculating accessibility heatmap data...")
    
    # Define file paths
    data_dir = Path("data")
    buildings_path = data_dir / "buildings.geojson"
    shelters_path = data_dir / "shelters.geojson"
    output_path = data_dir / "accessibility_heatmap.json"
    
    # Check if input files exist
    if not buildings_path.exists():
        print(f"❌ Buildings file not found: {buildings_path}")
        sys.exit(1)
    
    if not shelters_path.exists():
        print(f"❌ Shelters file not found: {shelters_path}")
        sys.exit(1)
    
    # Load data
    print("\n📂 Loading spatial data...")
    buildings_gdf = load_geojson(buildings_path)
    if buildings_gdf is None:
        sys.exit(1)
    
    shelters_gdf = load_geojson(shelters_path)
    if shelters_gdf is None:
        sys.exit(1)
    
    # Filter for existing shelters only
    if 'status' in shelters_gdf.columns:
        existing_shelters = shelters_gdf[shelters_gdf['status'] == 'Built']
        print(f"✓ Found {len(existing_shelters)} existing (Built) shelters out of {len(shelters_gdf)} total")
    else:
        # Assume all shelters are existing if no status column
        existing_shelters = shelters_gdf
        print(f"⚠️ No status column found, treating all {len(shelters_gdf)} shelters as existing")
    
    if len(existing_shelters) == 0:
        print("❌ No existing shelters found!")
        sys.exit(1)
    
    # Calculate accessibility data for multiple radii
    print("\n🔄 Calculating accessibility weights...")
    accessibility_data = calculate_accessibility_weights(buildings_gdf, existing_shelters)
    
    if not accessibility_data:
        print("❌ Failed to calculate accessibility data")
        sys.exit(1)
    
    # Save results
    print(f"\n💾 Saving results to {output_path}...")
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(accessibility_data, f, indent=2)
        
        # Calculate file size
        file_size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"✅ Saved accessibility data ({file_size_mb:.2f} MB)")
        
        # Print summary
        print(f"\n📊 Summary:")
        for radius_key, data in accessibility_data.items():
            stats = data['statistics']
            print(f"   {radius_key}: {stats['total_points']} points, avg distance {stats['avg_distance']}m")
        
    except Exception as e:
        print(f"❌ Error saving results: {e}")
        sys.exit(1)
    
    print("\n✅ Accessibility heatmap calculation complete!")

if __name__ == "__main__":
    main() 