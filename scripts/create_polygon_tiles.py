#!/usr/bin/env python3
"""
Create vector tiles for polygon layers (buildings at lower zoom, habitation clusters)
Generates optimized tile sets for better web performance
"""

import json
import geopandas as gpd
import pandas as pd
from pathlib import Path
import mercantile
from shapely.geometry import box
import shutil
import sys
from math import floor, ceil

def load_geojson(filepath):
    """Load GeoJSON file into GeoDataFrame"""
    try:
        gdf = gpd.read_file(filepath)
        print(f"✓ Loaded {len(gdf)} features from {filepath}")
        return gdf
    except Exception as e:
        print(f"❌ Error loading {filepath}: {e}")
        return None

def create_tile_bounds(z, x, y):
    """Create bounding box for a given tile"""
    bbox = mercantile.bounds(x, y, z)
    return box(bbox.west, bbox.south, bbox.east, bbox.north)

def get_tile_features(gdf, z, x, y, simplify_tolerance=None):
    """Get features that intersect with a given tile"""
    try:
        # Create tile bounds
        tile_bounds = create_tile_bounds(z, x, y)
        
        # Find intersecting features
        intersecting = gdf[gdf.intersects(tile_bounds)]
        
        if len(intersecting) == 0:
            return None
            
        # Clip features to tile bounds to reduce data size
        clipped = intersecting.copy()
        clipped['geometry'] = clipped.geometry.intersection(tile_bounds)
        
        # Remove empty geometries
        clipped = clipped[~clipped.geometry.is_empty]
        
        if len(clipped) == 0:
            return None
            
        # Simplify geometries for lower zoom levels
        if simplify_tolerance and simplify_tolerance > 0:
            clipped['geometry'] = clipped.geometry.simplify(simplify_tolerance)
            clipped = clipped[~clipped.geometry.is_empty]
            
        if len(clipped) == 0:
            return None
            
        return clipped
        
    except Exception as e:
        print(f"⚠️ Error processing tile {z}/{x}/{y}: {e}")
        return None

def save_tile_geojson(features, output_path):
    """Save features as GeoJSON tile"""
    try:
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Convert to GeoJSON
        geojson_data = json.loads(features.to_json())
        
        # Add tile metadata
        tile_info = {
            "x": int(output_path.parent.name),
            "y": int(output_path.stem),
            "zoom": int(output_path.parent.parent.name),
            "bounds": list(features.total_bounds),
            "feature_count": len(features)
        }
        
        # Create final tile structure
        tile_data = {
            "type": "FeatureCollection", 
            "features": geojson_data["features"],
            "tile_info": tile_info
        }
        
        # Save to file
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(tile_data, f, separators=(',', ':'))
            
        return len(features)
        
    except Exception as e:
        print(f"❌ Error saving tile {output_path}: {e}")
        return 0

def generate_building_tiles_low_zoom(buildings_gdf, output_dir, zoom_levels=[7, 8, 9, 10, 11]):
    """Generate building tiles for lower zoom levels"""
    print(f"\n🏢 Generating building tiles for zoom levels {zoom_levels}...")
    
    total_tiles = 0
    
    for z in zoom_levels:
        print(f"\n📊 Processing zoom level {z}...")
        
        # Calculate simplification tolerance based on zoom level
        # Higher tolerance (more simplification) for lower zoom levels
        base_tolerance = 0.001  # Base tolerance in degrees
        simplify_tolerance = base_tolerance * (2 ** (12 - z))
        print(f"Using simplification tolerance: {simplify_tolerance:.6f} degrees")
        
        # For very low zoom levels, apply additional filtering to reduce feature count
        filtered_buildings = buildings_gdf
        if z <= 8:
            # Only show larger buildings at very low zoom levels
            filtered_buildings = buildings_gdf.copy()
            filtered_buildings['area'] = filtered_buildings.geometry.area
            # More reasonable progressive filtering - use percentile-based approach
            if z <= 7:
                # Keep top 10% largest buildings for zoom 7
                area_threshold = filtered_buildings['area'].quantile(0.9)
            else:
                # Keep top 25% largest buildings for zoom 8
                area_threshold = filtered_buildings['area'].quantile(0.75)
            
            filtered_buildings = filtered_buildings[filtered_buildings['area'] > area_threshold]
            print(f"Filtered to {len(filtered_buildings)} larger buildings for zoom {z}")
        
        # Validate we have data after filtering
        if len(filtered_buildings) == 0:
            print(f"⚠️ No buildings remaining after filtering for zoom {z}, skipping...")
            continue
            
        # Get data bounds to determine tile range
        bounds = filtered_buildings.total_bounds
        minx, miny, maxx, maxy = bounds
        
        # Validate bounds are not NaN
        if any(pd.isna([minx, miny, maxx, maxy])):
            print(f"⚠️ Invalid bounds for zoom {z}, skipping...")
            continue
        
        # Get tile bounds for this zoom level
        ul_tile = mercantile.tile(minx, maxy, z)  # Upper left
        lr_tile = mercantile.tile(maxx, miny, z)  # Lower right
        
        min_x, max_x = ul_tile.x, lr_tile.x
        min_y, max_y = ul_tile.y, lr_tile.y
        
        print(f"Tile range: x={min_x}-{max_x}, y={min_y}-{max_y}")
        
        tiles_created = 0
        for x in range(min_x, max_x + 1):
            for y in range(min_y, max_y + 1):
                tile_features = get_tile_features(filtered_buildings, z, x, y, simplify_tolerance)
                
                if tile_features is not None and len(tile_features) > 0:
                    tile_path = output_dir / str(z) / str(x) / f"{y}.json"
                    feature_count = save_tile_geojson(tile_features, tile_path)
                    if feature_count > 0:
                        tiles_created += 1
                        
                if (tiles_created + 1) % 25 == 0:
                    print(f"  Created {tiles_created} tiles for zoom {z}...")
        
        print(f"✓ Created {tiles_created} tiles for zoom level {z}")
        total_tiles += tiles_created
    
    print(f"\n✅ Building tile generation complete: {total_tiles} total tiles")
    return total_tiles

def generate_habitation_cluster_tiles(clusters_gdf, output_dir, zoom_levels=[7, 8, 9, 10, 11, 12, 13, 14]):
    """Generate tiles for habitation clusters"""
    print(f"\n🏘️ Generating habitation cluster tiles for zoom levels {zoom_levels}...")
    
    total_tiles = 0
    
    for z in zoom_levels:
        print(f"\n📊 Processing zoom level {z}...")
        
        # Calculate simplification tolerance
        base_tolerance = 0.0005  # Smaller base tolerance for polygons
        simplify_tolerance = base_tolerance * (2 ** (14 - z)) if z < 14 else 0
        if simplify_tolerance > 0:
            print(f"Using simplification tolerance: {simplify_tolerance:.6f} degrees")
        
        # Apply filtering for very low zoom levels
        filtered_clusters = clusters_gdf
        if z <= 8:
            # Only show larger clusters at very low zoom levels
            filtered_clusters = clusters_gdf.copy()
            filtered_clusters['area'] = filtered_clusters.geometry.area
            # Use percentile-based filtering to ensure we always have some data
            if z <= 7:
                # Keep top 20% largest clusters for zoom 7
                area_threshold = filtered_clusters['area'].quantile(0.8)
            else:
                # Keep top 40% largest clusters for zoom 8
                area_threshold = filtered_clusters['area'].quantile(0.6)
            
            filtered_clusters = filtered_clusters[filtered_clusters['area'] > area_threshold]
            print(f"Filtered to {len(filtered_clusters)} larger clusters for zoom {z}")
        
        # Validate we have data after filtering
        if len(filtered_clusters) == 0:
            print(f"⚠️ No clusters remaining after filtering for zoom {z}, skipping...")
            continue
            
        # Get data bounds
        bounds = filtered_clusters.total_bounds
        minx, miny, maxx, maxy = bounds
        
        # Validate bounds are not NaN
        if any(pd.isna([minx, miny, maxx, maxy])):
            print(f"⚠️ Invalid bounds for zoom {z}, skipping...")
            continue
        
        # Get tile bounds
        ul_tile = mercantile.tile(minx, maxy, z)
        lr_tile = mercantile.tile(maxx, miny, z)
        
        min_x, max_x = ul_tile.x, lr_tile.x
        min_y, max_y = ul_tile.y, lr_tile.y
        
        print(f"Tile range: x={min_x}-{max_x}, y={min_y}-{max_y}")
        
        tiles_created = 0
        for x in range(min_x, max_x + 1):
            for y in range(min_y, max_y + 1):
                tile_features = get_tile_features(filtered_clusters, z, x, y, simplify_tolerance)
                
                if tile_features is not None and len(tile_features) > 0:
                    tile_path = output_dir / str(z) / str(x) / f"{y}.json"
                    feature_count = save_tile_geojson(tile_features, tile_path)
                    if feature_count > 0:
                        tiles_created += 1
                        
                if (tiles_created + 1) % 25 == 0:
                    print(f"  Created {tiles_created} tiles for zoom {z}...")
        
        print(f"✓ Created {tiles_created} tiles for zoom level {z}")
        total_tiles += tiles_created
    
    print(f"\n✅ Habitation cluster tile generation complete: {total_tiles} total tiles")
    return total_tiles

def update_metadata(output_dir, name, description, zoom_levels, total_tiles, gdf):
    """Update or create metadata.json file"""
    bounds = gdf.total_bounds
    center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
    
    metadata = {
        "name": name,
        "description": description,
        "version": "1.0.0", 
        "minzoom": min(zoom_levels),
        "maxzoom": max(zoom_levels),
        "bounds": list(bounds),
        "center": center,
        "total_tiles": total_tiles,
        "tile_format": "geojson",
        "attribution": "Filtered geospatial data for shelter access analysis"
    }
    
    metadata_path = output_dir / "metadata.json"
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"✓ Updated metadata: {metadata_path}")

def main():
    print("🗺️ Creating polygon tiles for better performance...")
    
    # Define paths
    data_dir = Path("data")
    buildings_path = data_dir / "buildings.geojson"
    clusters_filtered_path = data_dir / "tribes_polygons_filtered.geojson"
    
    # Output directories
    building_tiles_dir = data_dir / "building_tiles"
    cluster_tiles_dir = data_dir / "cluster_tiles"
    
    # Check if input files exist
    if not buildings_path.exists():
        print(f"❌ Buildings file not found: {buildings_path}")
        sys.exit(1)
    
    # Load data
    print("\n📊 Loading building data...")
    buildings_gdf = load_geojson(buildings_path)
    if buildings_gdf is None:
        print("❌ Failed to load buildings data")
        sys.exit(1)
    
    # Generate missing building tiles for lower zoom levels
    print(f"\n🏢 Extending building tiles to cover zoom levels 7-11...")
    building_tiles_created = generate_building_tiles_low_zoom(
        buildings_gdf, 
        building_tiles_dir,
        zoom_levels=[7, 8, 9, 10, 11]
    )
    
    # Update building tiles metadata
    if building_tiles_created > 0:
        # Get existing tile count from metadata
        existing_metadata_path = building_tiles_dir / "metadata.json"
        existing_tiles = 0
        if existing_metadata_path.exists():
            try:
                with open(existing_metadata_path, 'r') as f:
                    existing_meta = json.load(f)
                    existing_tiles = existing_meta.get('total_tiles', 0)
            except:
                pass
        
        total_building_tiles = existing_tiles + building_tiles_created
        update_metadata(
            building_tiles_dir,
            "building_tiles_extended",
            "Building footprint vector tiles (extended to zoom 7-16)",
            [7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            total_building_tiles,
            buildings_gdf
        )
    
    # Process habitation clusters if available
    if clusters_filtered_path.exists():
        print(f"\n🏘️ Loading habitation clusters...")
        clusters_gdf = load_geojson(clusters_filtered_path)
        
        if clusters_gdf is not None and len(clusters_gdf) > 0:
            cluster_tiles_created = generate_habitation_cluster_tiles(
                clusters_gdf,
                cluster_tiles_dir,
                zoom_levels=[7, 8, 9, 10, 11, 12, 13, 14]
            )
            
            if cluster_tiles_created > 0:
                update_metadata(
                    cluster_tiles_dir,
                    "cluster_tiles",
                    "Habitation cluster vector tiles", 
                    [7, 8, 9, 10, 11, 12, 13, 14],
                    cluster_tiles_created,
                    clusters_gdf
                )
        else:
            print("⚠️ No habitation cluster data to tile")
    else:
        print(f"⚠️ Habitation clusters file not found: {clusters_filtered_path}")
    
    print("\n✅ Polygon tiling completed!")
    print(f"📁 Building tiles: {building_tiles_dir}")
    if clusters_filtered_path.exists():
        print(f"📁 Cluster tiles: {cluster_tiles_dir}")

if __name__ == "__main__":
    main() 