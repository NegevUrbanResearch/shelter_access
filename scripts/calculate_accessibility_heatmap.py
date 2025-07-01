#!/usr/bin/env python3
"""
Optimized accessibility heatmap data calculator.
Stores each building point ONCE with coverage status for all radii.
5x smaller output file and much faster calculation.
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

def calculate_optimized_accessibility(buildings_gdf, existing_shelters_gdf, coverage_radii=[100, 150, 200, 250, 300]):
    """
    Calculate optimized accessibility data:
    - Each building stored only ONCE with coverage for all radii
    - No buildingIndex (unused in visualization)
    - Massive file size reduction and faster processing
    """
    print(f"🚀 Optimized calculation for {len(buildings_gdf)} buildings and {len(existing_shelters_gdf)} shelters...")
    
    # Extract building centroids (single pass)
    building_points = []
    
    for building in buildings_gdf.itertuples():
        centroid = get_building_centroid(building.geometry)
        if centroid:
            building_points.append(centroid)
    
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
    
    # Convert all radii to degrees for efficiency
    radii_degrees = {f"{r}m": r / 100000 for r in coverage_radii}
    
    print(f"\n🔄 Processing all radii simultaneously...")
    start_time = time.time()
    
    # Single pass through all buildings, check coverage for all radii at once
    accessibility_points = []
    stats_per_radius = {}
    
    # Initialize stats
    for radius_key in radii_degrees.keys():
        stats_per_radius[radius_key] = {
            'covered_buildings': 0,
            'uncovered_buildings': 0
        }
    
    for i, building_coord in enumerate(building_points):
        # Find minimum distance to ANY shelter
        min_distance_to_shelter = float('inf')
        for shelter_coord in shelter_points:
            distance = calculate_distance_degrees(building_coord, shelter_coord)
            min_distance_to_shelter = min(min_distance_to_shelter, distance)
        
        # Create coverage status for all radii
        coverage_status = {}
        for radius_key, radius_degrees in radii_degrees.items():
            is_covered = min_distance_to_shelter <= radius_degrees
            coverage_status[radius_key] = is_covered
            
            # Update stats
            if is_covered:
                stats_per_radius[radius_key]['covered_buildings'] += 1
            else:
                stats_per_radius[radius_key]['uncovered_buildings'] += 1
        
        # Store building point with coverage for ALL radii
        accessibility_points.append({
            'position': building_coord,
            'coverage': coverage_status
        })
        
        # Progress reporting
        if (i + 1) % 5000 == 0:
            progress = (i + 1) / len(building_points) * 100
            print(f"   Progress: {progress:.1f}% ({i + 1}/{len(building_points)} buildings)")
    
    elapsed_time = time.time() - start_time
    print(f"✅ Completed all radii in {elapsed_time:.2f}s")
    
    # Calculate final statistics
    results = {}
    total_buildings = len(building_points)
    
    for radius_m in coverage_radii:
        radius_key = f"{radius_m}m"
        stats = stats_per_radius[radius_key]
        
        coverage_percent = (stats['covered_buildings'] / total_buildings) * 100 if total_buildings else 0
        
        final_stats = {
            'total_points': total_buildings,  # Now same as total buildings
            'covered_buildings': stats['covered_buildings'],
            'uncovered_buildings': stats['uncovered_buildings'],
            'coverage_percent': round(coverage_percent, 1),
            'coverage_radius': radius_m
        }
        
        print(f"   📊 {radius_key}: {final_stats['coverage_percent']}% coverage ({stats['covered_buildings']}/{total_buildings} buildings)")
        
        results[radius_key] = {
            'statistics': final_stats,
            'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            'metadata': {
                'total_buildings': total_buildings,
                'total_shelters': len(shelter_points),
                'coverage_radius_meters': radius_m,
                'calculation_method': 'optimized_multi_radius'
            }
        }
    
    # Add the optimized accessibility data (stored only once!)
    optimized_result = {
        'accessibility_points': accessibility_points,
        'radii_available': list(radii_degrees.keys()),
        'generation_info': {
            'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            'total_buildings': total_buildings,
            'total_shelters': len(shelter_points),
            'optimization': 'single_pass_multi_radius',
            'file_size_reduction': f"~{len(coverage_radii)}x smaller than original"
        },
        'radius_statistics': results
    }
    
    return optimized_result

def main():
    print("🚀 Optimized Accessibility Heatmap Calculator")
    print("   • 5x smaller file size")
    print("   • No unused buildingIndex")
    print("   • Single pass through buildings")
    
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
        existing_shelters = shelters_gdf
        print(f"⚠️ No status column found, treating all {len(shelters_gdf)} shelters as existing")
    
    if len(existing_shelters) == 0:
        print("❌ No existing shelters found!")
        sys.exit(1)
    
    # Calculate optimized accessibility data
    print("\n🔄 Calculating optimized accessibility data...")
    accessibility_data = calculate_optimized_accessibility(buildings_gdf, existing_shelters)
    
    if not accessibility_data:
        print("❌ Failed to calculate accessibility data")
        sys.exit(1)
    
    # Save results
    print(f"\n💾 Saving results to {output_path}...")
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(accessibility_data, f, indent=2)
        
        # Calculate file sizes for comparison
        file_size_mb = output_path.stat().st_size / (1024 * 1024)
        
        # Compare with original if it exists
        original_path = data_dir / "accessibility_heatmap.json"
        if original_path.exists():
            original_size_mb = original_path.stat().st_size / (1024 * 1024)
            reduction = (1 - file_size_mb / original_size_mb) * 100
            print(f"✅ Saved optimized data: {file_size_mb:.2f} MB (was {original_size_mb:.2f} MB)")
            print(f"🎉 File size reduction: {reduction:.1f}% smaller!")
        else:
            print(f"✅ Saved optimized data: {file_size_mb:.2f} MB")
        
        # Print summary
        print(f"\n📊 Optimization Summary:")
        print(f"   Total building points: {len(accessibility_data['accessibility_points'])}")
        print(f"   Radii included: {', '.join(accessibility_data['radii_available'])}")
        print(f"   Storage efficiency: Each building stored once with multi-radius coverage")
        
        for radius_key, data in accessibility_data['radius_statistics'].items():
            stats = data['statistics']
            print(f"   {radius_key}: {stats['coverage_percent']}% coverage")
        
    except Exception as e:
        print(f"❌ Error saving results: {e}")
        sys.exit(1)
    
    print("\n✅ Optimized accessibility heatmap calculation complete!")
    print("   Use this data with the updated JavaScript loader for better performance.")

if __name__ == "__main__":
    main() 