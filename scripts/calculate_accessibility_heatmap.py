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
    Calculate binary accessibility heatmap data:
    - Green: Buildings within radius of any shelter (positive weights)
    - Red: Buildings outside radius, scaled by local uncovered building density
    """
    print(f"📊 Calculating binary accessibility for {len(buildings_gdf)} buildings and {len(existing_shelters_gdf)} shelters...")
    
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
        
        # First pass: classify buildings as covered/uncovered
        covered_buildings = []
        uncovered_buildings = []
        
        radius_degrees = radius_m / 100000  # Convert meters to degrees (approximate)
        
        for i, building_coord in enumerate(building_points):
            is_covered = False
            
            # Check if building is within radius of ANY shelter
            for shelter_coord in shelter_points:
                distance_degrees = calculate_distance_degrees(building_coord, shelter_coord)
                if distance_degrees <= radius_degrees:
                    is_covered = True
                    break
            
            building_data = {
                'position': building_coord,
                'buildingIndex': building_indices[i]
            }
            
            if is_covered:
                covered_buildings.append(building_data)
            else:
                uncovered_buildings.append(building_data)
            
            # Progress reporting
            if (i + 1) % 5000 == 0:
                progress = (i + 1) / len(building_points) * 100
                print(f"   Classification: {progress:.1f}% ({i + 1}/{len(building_points)} buildings)")
        
        print(f"   📊 Found {len(covered_buildings)} covered, {len(uncovered_buildings)} uncovered buildings")
        
        # Second pass: calculate density-based weights for uncovered buildings
        accessibility_points = []
        
        # Add covered buildings with positive weight (GREEN)
        for building in covered_buildings:
            accessibility_points.append({
                'position': building['position'],
                'weight': 1.0,  # Positive weight = green
                'type': 'covered',
                'buildingIndex': building['buildingIndex']
            })
        
        # Add uncovered buildings with density-based negative weights (RED to YELLOW-ORANGE)
        if uncovered_buildings:
            print(f"   🔄 Calculating density weights for {len(uncovered_buildings)} uncovered buildings...")
            search_radius_degrees = 500 / 100000  # 500m search radius
            
            for i, building in enumerate(uncovered_buildings):
                # Count nearby uncovered buildings within 500m
                nearby_count = 0
                building_coord = building['position']
                
                for other_building in uncovered_buildings:
                    if other_building == building:
                        continue
                    other_coord = other_building['position']
                    if calculate_distance_degrees(building_coord, other_coord) <= search_radius_degrees:
                        nearby_count += 1
                
                # Scale weight by density (more uncovered buildings = more intense red)
                # Scale from 0.2 (light red/orange) to 1.0 (intense red)
                density_factor = min(nearby_count / 15.0, 1.0)  # Cap at 15 buildings
                weight = 0.2 + 0.8 * density_factor  # Range: 0.2 to 1.0
                
                # IMPORTANT: Keep weights positive but use them with red colors in visualization
                accessibility_points.append({
                    'position': building['position'],
                    'weight': round(weight, 3),
                    'type': 'uncovered',
                    'density': nearby_count,
                    'buildingIndex': building['buildingIndex']
                })
                
                # Progress reporting
                if (i + 1) % 2000 == 0:
                    progress = (i + 1) / len(uncovered_buildings) * 100
                    print(f"      Density calc: {progress:.1f}% ({i + 1}/{len(uncovered_buildings)} uncovered)")
        
        elapsed_time = time.time() - start_time
        print(f"✅ Completed {radius_m}m radius in {elapsed_time:.2f}s")
        
        # Calculate statistics
        covered_count = len(covered_buildings)
        uncovered_count = len(uncovered_buildings)
        coverage_percent = (covered_count / len(building_points)) * 100 if building_points else 0
        
        uncovered_weights = [p['weight'] for p in accessibility_points if p.get('type') == 'uncovered']
        avg_uncovered_weight = np.mean(uncovered_weights) if uncovered_weights else 0
        
        stats = {
            'total_points': len(accessibility_points),
            'covered_buildings': covered_count,
            'uncovered_buildings': uncovered_count,
            'coverage_percent': round(coverage_percent, 1),
            'avg_uncovered_weight': round(avg_uncovered_weight, 3),
            'coverage_radius': radius_m
        }
        
        print(f"   📊 Statistics:")
        print(f"      Coverage: {stats['coverage_percent']}% ({covered_count}/{len(building_points)} buildings)")
        print(f"      Average uncovered density weight: {stats['avg_uncovered_weight']}")
        
        results[f"{radius_m}m"] = {
            'accessibility_points': accessibility_points,
            'statistics': stats,
            'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            'metadata': {
                'total_buildings': len(building_points),
                'total_shelters': len(shelter_points),
                'coverage_radius_meters': radius_m,
                'calculation_method': 'binary_with_density'
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
            print(f"   {radius_key}: {stats['total_points']} points, {stats['coverage_percent']}% coverage, avg uncovered weight {stats['avg_uncovered_weight']}")
        
    except Exception as e:
        print(f"❌ Error saving results: {e}")
        sys.exit(1)
    
    print("\n✅ Accessibility heatmap calculation complete!")

if __name__ == "__main__":
    main() 