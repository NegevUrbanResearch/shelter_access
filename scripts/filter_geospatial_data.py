#!/usr/bin/env python3
"""
Filter geospatial data based on buildings bounding box
Filters statistical areas, habitation clusters, and shelters to only include
features that are relevant to the buildings area of interest.
"""

import json
import geopandas as gpd
from shapely.geometry import box, Point, MultiPoint
from shapely.ops import unary_union
import sys
from pathlib import Path
from math import cos, radians

def load_geojson(filepath):
    """Load GeoJSON file into GeoDataFrame"""
    try:
        gdf = gpd.read_file(filepath)
        print(f"✓ Loaded {len(gdf)} features from {filepath}")
        return gdf
    except Exception as e:
        print(f"❌ Error loading {filepath}: {e}")
        return None

def calculate_buildings_convex_hull(buildings_gdf, buffer_meters=1000):
    """Calculate convex hull of all buildings with buffer"""
    print(f"Calculating convex hull of buildings with {buffer_meters}m buffer...")
    
    # Extract all building points (centroids for polygons)
    points = []
    
    for _, building in buildings_gdf.iterrows():
        geom = building.geometry
        
        if geom.geom_type == 'Point':
            points.append(geom)
        elif geom.geom_type in ['Polygon', 'MultiPolygon']:
            # Use centroid for polygons
            centroid = geom.centroid
            if centroid and centroid.is_valid:
                points.append(centroid)
        else:
            print(f"⚠️ Unsupported geometry type: {geom.geom_type}")
    
    if not points:
        print("❌ No valid points found for convex hull calculation")
        return None
    
    print(f"✓ Extracted {len(points)} points from buildings")
    
    # Create MultiPoint geometry
    multipoint = MultiPoint(points)
    
    # Calculate convex hull
    convex_hull = multipoint.convex_hull
    print(f"✓ Calculated convex hull: {convex_hull.geom_type}")
    
    # Convert buffer from meters to degrees (approximate)
    # At latitude ~31° (Jerusalem area), 1 degree ≈ 93,000 meters
    # More precise conversion considering latitude
    avg_lat = sum(point.y for point in points) / len(points)
    lat_factor = 111000  # meters per degree latitude
    lon_factor = 111000 * abs(cos(radians(avg_lat))) if abs(avg_lat) < 85 else 111000 * 0.1
    
    # Use average of lat/lon factors for simplicity
    avg_factor = (lat_factor + lon_factor) / 2
    buffer_degrees = buffer_meters / avg_factor
    
    print(f"✓ Using buffer of {buffer_degrees:.6f} degrees ({buffer_meters}m at ~{avg_lat:.1f}° latitude)")
    
    # Apply buffer to convex hull
    buffered_hull = convex_hull.buffer(buffer_degrees)
    
    print(f"✓ Created buffered convex hull")
    bounds = buffered_hull.bounds
    print(f"  Bounds: [{bounds[0]:.6f}, {bounds[1]:.6f}, {bounds[2]:.6f}, {bounds[3]:.6f}]")
    
    return buffered_hull

def filter_polygons_by_intersection(gdf, filter_geometry, layer_name):
    """Filter polygon features that intersect with the filter geometry"""
    if gdf is None or len(gdf) == 0:
        print(f"⚠️ No data to filter for {layer_name}")
        return gdf
    
    # Ensure same CRS
    if gdf.crs != 'EPSG:4326':
        print(f"Converting {layer_name} CRS from {gdf.crs} to EPSG:4326")
        gdf = gdf.to_crs('EPSG:4326')
    
    # Find intersecting features
    intersecting = gdf[gdf.intersects(filter_geometry)]
    
    print(f"✓ Filtered {layer_name}: {len(intersecting)} features (from {len(gdf)} total)")
    return intersecting

def filter_points_by_intersection(gdf, filter_geometry, layer_name, max_distance_meters=None):
    """Filter point features that intersect with the filter geometry"""
    if gdf is None or len(gdf) == 0:
        print(f"⚠️ No data to filter for {layer_name}")
        return gdf
    
    # Ensure same CRS
    if gdf.crs != 'EPSG:4326':
        print(f"Converting {layer_name} CRS from {gdf.crs} to EPSG:4326")
        gdf = gdf.to_crs('EPSG:4326')
    
    # If max_distance is specified, add additional buffer to filter geometry
    if max_distance_meters:
        # Convert additional buffer to degrees
        additional_buffer_degrees = max_distance_meters / 111000  # Rough conversion
        buffered_filter = filter_geometry.buffer(additional_buffer_degrees)
        print(f"✓ Added {max_distance_meters}m buffer to filter geometry for {layer_name}")
        filter_geom = buffered_filter
    else:
        filter_geom = filter_geometry
    
    # Find points within filter geometry
    within_filter = gdf[gdf.intersects(filter_geom)]
    
    distance_text = f" within {max_distance_meters}m" if max_distance_meters else ""
    print(f"✓ Filtered {layer_name}: {len(within_filter)} features{distance_text} (from {len(gdf)} total)")
    return within_filter

def save_filtered_geojson(gdf, output_path):
    """Save filtered GeoDataFrame as GeoJSON"""
    try:
        if gdf is None or len(gdf) == 0:
            print(f"⚠️ No data to save for {output_path}")
            # Create empty geojson
            empty_geojson = {
                "type": "FeatureCollection",
                "features": []
            }
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(empty_geojson, f, indent=2)
            return
        
        # Ensure geometry is valid
        gdf = gdf[gdf.geometry.notnull()]
        if len(gdf) == 0:
            print(f"⚠️ No valid geometries for {output_path}")
            return
        
        # Save as GeoJSON
        gdf.to_file(output_path, driver='GeoJSON')
        print(f"✓ Saved {len(gdf)} features to {output_path}")
        
    except Exception as e:
        print(f"❌ Error saving {output_path}: {e}")

def main():
    print("🗺️ Filtering geospatial data based on buildings bounds...")
    
    # Define file paths
    data_dir = Path("data")
    buildings_path = data_dir / "buildings.geojson"
    shelters_path = data_dir / "shelters.geojson"
    statistical_areas_path = data_dir / "statistical_areas.geojson"
    tribes_polygons_path = data_dir / "tribes_polygons.geojson"
    
    # Output paths
    statistical_areas_filtered_path = data_dir / "statistical_areas_filtered.geojson"
    tribes_polygons_filtered_path = data_dir / "tribes_polygons_filtered.geojson"
    shelters_filtered_path = data_dir / "shelters_filtered.geojson"
    
    # Check if input files exist
    required_files = [buildings_path, shelters_path]
    optional_files = [statistical_areas_path, tribes_polygons_path]
    
    for filepath in required_files:
        if not filepath.exists():
            print(f"❌ Required file not found: {filepath}")
            sys.exit(1)
    
    # Load buildings data
    print("\n📊 Loading buildings data...")
    buildings_gdf = load_geojson(buildings_path)
    if buildings_gdf is None:
        print("❌ Failed to load buildings data")
        sys.exit(1)
    
    # Calculate buildings convex hull
    print("\n📊 Calculating convex hull of buildings...")
    convex_hull = calculate_buildings_convex_hull(buildings_gdf)
    
    if convex_hull is None:
        print("❌ Failed to calculate convex hull - using fallback bounding box")
        # Fallback to simple bounding box
        bounds = buildings_gdf.total_bounds
        minx, miny, maxx, maxy = bounds
        buffer_degrees = 1000 / 111000  # 1km buffer in degrees
        convex_hull = box(minx - buffer_degrees, miny - buffer_degrees, 
                         maxx + buffer_degrees, maxy + buffer_degrees)
        print(f"✓ Using fallback bounding box with 1km buffer")
    
    # Load and filter shelters (with 2500m buffer)
    print("\n🏠 Processing shelters...")
    shelters_gdf = load_geojson(shelters_path)
    if shelters_gdf is not None:
        filtered_shelters = filter_points_by_intersection(
            shelters_gdf, 
            convex_hull, 
            "shelters",
            2500
        )
        save_filtered_geojson(filtered_shelters, shelters_filtered_path)
    
    # Load and filter statistical areas
    print("\n📊 Processing statistical areas...")
    if statistical_areas_path.exists():
        statistical_gdf = load_geojson(statistical_areas_path)
        if statistical_gdf is not None:
            filtered_statistical = filter_polygons_by_intersection(
                statistical_gdf, 
                convex_hull, 
                "statistical areas"
            )
            save_filtered_geojson(filtered_statistical, statistical_areas_filtered_path)
    else:
        print(f"⚠️ Statistical areas file not found: {statistical_areas_path}")
        save_filtered_geojson(None, statistical_areas_filtered_path)
    
    # Load and filter tribes polygons (habitation clusters)
    print("\n🏘️ Processing habitation clusters...")
    if tribes_polygons_path.exists():
        tribes_gdf = load_geojson(tribes_polygons_path)
        if tribes_gdf is not None:
            filtered_tribes = filter_polygons_by_intersection(
                tribes_gdf, 
                convex_hull, 
                "habitation clusters"
            )
            save_filtered_geojson(filtered_tribes, tribes_polygons_filtered_path)
    else:
        print(f"⚠️ Habitation clusters file not found: {tribes_polygons_path}")
        save_filtered_geojson(None, tribes_polygons_filtered_path)
    
    print("\n✅ Geospatial data filtering completed!")
    print(f"📁 Output files:")
    print(f"   - {shelters_filtered_path}")
    print(f"   - {statistical_areas_filtered_path}")
    print(f"   - {tribes_polygons_filtered_path}")
    
    # Print summary statistics
    print(f"\n📈 Summary:")
    try:
        if shelters_filtered_path.exists():
            shelters_count = len(gpd.read_file(shelters_filtered_path))
            print(f"   - Shelters: {shelters_count} features")
        
        if statistical_areas_filtered_path.exists():
            stats_count = len(gpd.read_file(statistical_areas_filtered_path))
            print(f"   - Statistical areas: {stats_count} features")
        
        if tribes_polygons_filtered_path.exists():
            tribes_count = len(gpd.read_file(tribes_polygons_filtered_path))
            print(f"   - Habitation clusters: {tribes_count} features")
            
    except Exception as e:
        print(f"⚠️ Could not read summary statistics: {e}")

if __name__ == "__main__":
    main() 