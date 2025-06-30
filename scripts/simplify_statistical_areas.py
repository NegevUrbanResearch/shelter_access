#!/usr/bin/env python3
"""
Simplify Statistical Areas GeoJSON
Reduces file size by smoothing polygon edges using Douglas-Peucker algorithm
"""

import json
import geopandas as gpd
from pathlib import Path
import sys

def simplify_statistical_areas(input_path, output_path, tolerance=0.0001):
    """
    Simplify statistical areas polygons to reduce file size
    
    Args:
        input_path: Path to input GeoJSON file
        output_path: Path to output simplified GeoJSON file  
        tolerance: Simplification tolerance (higher = more simplified)
                  0.0001 ≈ 10-20m depending on location
                  0.0005 ≈ 50-100m depending on location
    """
    print(f"📂 Loading statistical areas from {input_path}...")
    
    # Load the GeoJSON file
    gdf = gpd.read_file(input_path)
    print(f"✓ Loaded {len(gdf)} statistical areas")
    
    # Get original file size
    original_size = Path(input_path).stat().st_size / (1024 * 1024)  # MB
    print(f"📊 Original file size: {original_size:.1f} MB")
    
    # Calculate original vertex count
    original_vertices = sum(len(geom.exterior.coords) if hasattr(geom, 'exterior') else 0 
                           for geom in gdf.geometry if geom is not None)
    print(f"📊 Original vertices: {original_vertices:,}")
    
    print(f"\n🔧 Simplifying polygons with tolerance {tolerance}...")
    
    # Simplify geometries using Douglas-Peucker algorithm
    # preserve_topology=True prevents creating invalid geometries
    gdf['geometry'] = gdf.geometry.simplify(tolerance=tolerance, preserve_topology=True)
    
    # Remove any features that became invalid after simplification
    valid_mask = gdf.geometry.is_valid & gdf.geometry.notna()
    invalid_count = (~valid_mask).sum()
    if invalid_count > 0:
        print(f"⚠️ Removing {invalid_count} invalid geometries after simplification")
        gdf = gdf[valid_mask].copy()
    
    # Calculate new vertex count
    new_vertices = sum(len(geom.exterior.coords) if hasattr(geom, 'exterior') else 0 
                      for geom in gdf.geometry if geom is not None)
    vertex_reduction = ((original_vertices - new_vertices) / original_vertices) * 100
    print(f"📊 New vertices: {new_vertices:,} ({vertex_reduction:.1f}% reduction)")
    
    print(f"💾 Saving simplified file to {output_path}...")
    
    # Save to GeoJSON
    gdf.to_file(output_path, driver='GeoJSON')
    
    # Get new file size
    new_size = Path(output_path).stat().st_size / (1024 * 1024)  # MB
    size_reduction = ((original_size - new_size) / original_size) * 100
    
    print(f"\n✅ Simplification complete!")
    print(f"📊 New file size: {new_size:.1f} MB ({size_reduction:.1f}% reduction)")
    print(f"📊 Vertices reduced: {original_vertices:,} → {new_vertices:,}")
    print(f"📊 Features retained: {len(gdf)}")

def test_different_tolerances(input_path):
    """Test different tolerance values to find optimal balance"""
    print("🧪 Testing different tolerance values...\n")
    
    tolerances = [0.00005, 0.0001, 0.0002, 0.0005, 0.001]
    
    # Load original data once
    gdf_original = gpd.read_file(input_path)
    original_size = Path(input_path).stat().st_size / (1024 * 1024)
    original_vertices = sum(len(geom.exterior.coords) if hasattr(geom, 'exterior') else 0 
                           for geom in gdf_original.geometry if geom is not None)
    
    print(f"Original: {original_size:.1f}MB, {original_vertices:,} vertices")
    print("-" * 60)
    
    for tolerance in tolerances:
        # Create temporary simplified version
        gdf_test = gdf_original.copy()
        gdf_test['geometry'] = gdf_test.geometry.simplify(tolerance=tolerance, preserve_topology=True)
        
        # Count vertices
        new_vertices = sum(len(geom.exterior.coords) if hasattr(geom, 'exterior') else 0 
                          for geom in gdf_test.geometry if geom is not None)
        vertex_reduction = ((original_vertices - new_vertices) / original_vertices) * 100
        
        # Estimate file size reduction (roughly proportional to vertex reduction)
        estimated_size = original_size * (new_vertices / original_vertices)
        size_reduction = ((original_size - estimated_size) / original_size) * 100
        
        print(f"Tolerance {tolerance:7.5f}: ~{estimated_size:.1f}MB ({size_reduction:4.1f}% smaller), "
              f"{new_vertices:,} vertices ({vertex_reduction:4.1f}% fewer)")

def main():
    """Main function"""
    data_dir = Path("data")
    input_file = data_dir / "statistical_areas_filtered.geojson" 
    
    if not input_file.exists():
        print(f"❌ Input file not found: {input_file}")
        sys.exit(1)
    
    # Check if user wants to test tolerances first
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test_different_tolerances(input_file)
        return
    
    # Default simplification
    output_file = data_dir / "statistical_areas_simplified.geojson"
    
    # Use moderate tolerance - good balance of size reduction and accuracy
    # 0.0001 degrees ≈ 10-20 meters at these latitudes
    tolerance = 0.0001
    
    if len(sys.argv) > 1:
        try:
            tolerance = float(sys.argv[1])
            print(f"🔧 Using custom tolerance: {tolerance}")
        except ValueError:
            print(f"⚠️ Invalid tolerance value '{sys.argv[1]}', using default: {tolerance}")
    
    simplify_statistical_areas(input_file, output_file, tolerance)
    
    print(f"\n💡 Usage tips:")
    print(f"   - Run with --test to see size estimates for different tolerance values")
    print(f"   - Run with custom tolerance: python {Path(__file__).name} 0.0002")
    print(f"   - Lower tolerance = higher accuracy, larger file")
    print(f"   - Higher tolerance = lower accuracy, smaller file")

if __name__ == "__main__":
    main() 