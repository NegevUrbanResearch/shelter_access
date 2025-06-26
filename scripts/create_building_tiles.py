#!/usr/bin/env python3
"""
Building Tiles Generator
Converts buildings.geojson into vector tiles for better deck.gl performance
"""

import json
import os
import math
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Any
import geopandas as gpd
from shapely.geometry import box, Point, Polygon
from shapely.ops import transform
import pyproj


class BuildingTileGenerator:
    """Generate vector tiles from building footprints for deck.gl TileLayer"""
    
    def __init__(self, buildings_file: str, output_dir: str, max_zoom: int = 16, min_zoom: int = 8):
        self.buildings_file = buildings_file
        self.output_dir = Path(output_dir)
        self.max_zoom = max_zoom
        self.min_zoom = min_zoom
        
        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"🏗️  Building Tile Generator")
        print(f"📁 Input: {buildings_file}")
        print(f"📁 Output: {output_dir}")
        print(f"🔍 Zoom levels: {min_zoom} - {max_zoom}")
    
    def deg2num(self, lat_deg: float, lon_deg: float, zoom: int) -> Tuple[int, int]:
        """Convert lat/lon to tile numbers"""
        lat_rad = math.radians(lat_deg)
        n = 2.0 ** zoom
        x = int((lon_deg + 180.0) / 360.0 * n)
        y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
        return (x, y)
    
    def num2deg(self, x: int, y: int, zoom: int) -> Tuple[float, float, float, float]:
        """Convert tile numbers to lat/lon bounds"""
        n = 2.0 ** zoom
        lon_deg_min = x / n * 360.0 - 180.0
        lat_rad_min = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
        lat_deg_min = math.degrees(lat_rad_min)
        
        lon_deg_max = (x + 1) / n * 360.0 - 180.0
        lat_rad_max = math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n)))
        lat_deg_max = math.degrees(lat_rad_max)
        
        return (lon_deg_min, lat_deg_min, lon_deg_max, lat_deg_max)
    
    def get_tile_bounds(self, x: int, y: int, zoom: int) -> Polygon:
        """Get tile bounds as a Polygon"""
        west, south, east, north = self.num2deg(x, y, zoom)
        return box(west, south, east, north)
    
    def simplify_for_zoom(self, geometry, zoom: int) -> Any:
        """Simplify geometry based on zoom level"""
        # Tolerance increases as zoom decreases (less detail needed)
        tolerance = 0.0001 * (2 ** (self.max_zoom - zoom))
        
        if hasattr(geometry, 'simplify'):
            return geometry.simplify(tolerance, preserve_topology=True)
        return geometry
    
    def filter_buildings_for_zoom(self, buildings: gpd.GeoDataFrame, zoom: int) -> gpd.GeoDataFrame:
        """Filter and simplify buildings based on zoom level"""
        # At lower zoom levels, only show larger buildings
        if zoom < 12:
            # Calculate approximate area and filter small buildings
            buildings = buildings.copy()
            buildings['area'] = buildings.geometry.area
            # Keep larger buildings at lower zoom levels
            area_threshold = 0.000001 * (2 ** (14 - zoom))  # Adjust threshold based on zoom
            buildings = buildings[buildings['area'] > area_threshold]
        
        # Simplify geometries
        buildings = buildings.copy()
        buildings.geometry = buildings.geometry.apply(lambda geom: self.simplify_for_zoom(geom, zoom))
        
        return buildings
    
    def create_tile(self, buildings: gpd.GeoDataFrame, x: int, y: int, zoom: int) -> Dict[str, Any]:
        """Create a single tile with buildings intersecting the tile bounds"""
        # Get tile bounds
        tile_bounds = self.get_tile_bounds(x, y, zoom)
        
        # Find buildings that intersect with this tile
        intersecting = buildings[buildings.geometry.intersects(tile_bounds)]
        
        if len(intersecting) == 0:
            return None
        
        # Clip buildings to tile bounds
        clipped = intersecting.copy()
        clipped.geometry = clipped.geometry.intersection(tile_bounds)
        
        # Remove any empty geometries after clipping
        clipped = clipped[~clipped.geometry.is_empty]
        
        if len(clipped) == 0:
            return None
        
        # Convert to GeoJSON-like structure
        features = []
        for idx, row in clipped.iterrows():
            if row.geometry.is_empty:
                continue
                
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": row.geometry.geom_type,
                    "coordinates": self._geometry_to_coordinates(row.geometry)
                },
                "properties": {
                    "id": idx,
                    "zoom": zoom,
                    "tile_x": x,
                    "tile_y": y
                }
            }
            features.append(feature)
        
        if not features:
            return None
            
        return {
            "type": "FeatureCollection",
            "features": features,
            "tile_info": {
                "x": x,
                "y": y,
                "zoom": zoom,
                "bounds": [tile_bounds.bounds[0], tile_bounds.bounds[1], 
                          tile_bounds.bounds[2], tile_bounds.bounds[3]],
                "building_count": len(features)
            }
        }
    
    def _geometry_to_coordinates(self, geometry) -> List:
        """Convert shapely geometry to GeoJSON coordinates"""
        if geometry.geom_type == 'Point':
            return [geometry.x, geometry.y]
        elif geometry.geom_type == 'Polygon':
            exterior = [[x, y] for x, y in geometry.exterior.coords]
            holes = [[[x, y] for x, y in interior.coords] for interior in geometry.interiors]
            return [exterior] + holes if holes else [exterior]
        elif geometry.geom_type == 'MultiPolygon':
            return [self._geometry_to_coordinates(poly) for poly in geometry.geoms]
        else:
            # For other geometry types, try to get coordinates
            return list(geometry.coords) if hasattr(geometry, 'coords') else []
    
    def generate_tiles(self):
        """Generate all tiles for all zoom levels"""
        print("📖 Loading buildings data...")
        
        # Load buildings
        buildings = gpd.read_file(self.buildings_file)
        print(f"✅ Loaded {len(buildings)} buildings")
        
        # Get data bounds
        bounds = buildings.total_bounds
        print(f"📍 Data bounds: {bounds}")
        
        total_tiles = 0
        
        # Generate tiles for each zoom level
        for zoom in range(self.min_zoom, self.max_zoom + 1):
            print(f"\n🔍 Processing zoom level {zoom}...")
            
            # Filter buildings for this zoom level
            zoom_buildings = self.filter_buildings_for_zoom(buildings, zoom)
            print(f"   📊 {len(zoom_buildings)} buildings at zoom {zoom}")
            
            if len(zoom_buildings) == 0:
                continue
            
            # Calculate tile range for this zoom level
            min_x, max_y = self.deg2num(bounds[1], bounds[0], zoom)  # SW corner
            max_x, min_y = self.deg2num(bounds[3], bounds[2], zoom)  # NE corner
            
            zoom_dir = self.output_dir / str(zoom)
            zoom_dir.mkdir(exist_ok=True)
            
            tiles_created = 0
            
            # Generate tiles
            for x in range(min_x, max_x + 1):
                x_dir = zoom_dir / str(x)
                x_dir.mkdir(exist_ok=True)
                
                for y in range(min_y, max_y + 1):
                    tile_data = self.create_tile(zoom_buildings, x, y, zoom)
                    
                    if tile_data:
                        tile_file = x_dir / f"{y}.json"
                        with open(tile_file, 'w') as f:
                            json.dump(tile_data, f, separators=(',', ':'))
                        tiles_created += 1
            
            print(f"   ✅ Created {tiles_created} tiles for zoom {zoom}")
            total_tiles += tiles_created
        
        # Create tile metadata
        metadata = {
            "name": "building_tiles",
            "description": "Building footprint vector tiles",
            "version": "1.0.0",
            "minzoom": self.min_zoom,
            "maxzoom": self.max_zoom,
            "bounds": bounds.tolist(),
            "center": [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
            "total_tiles": total_tiles,
            "tile_format": "geojson",
            "attribution": "Building data for shelter access analysis"
        }
        
        with open(self.output_dir / "metadata.json", 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"\n🎉 Tile generation complete!")
        print(f"📊 Total tiles created: {total_tiles}")
        print(f"📁 Output directory: {self.output_dir}")
        print(f"📄 Metadata saved to: {self.output_dir}/metadata.json")
        
        # Create tile URL template
        print(f"\n🔗 Tile URL template:")
        print(f"   data/building_tiles/{{z}}/{{x}}/{{y}}.json")


def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Generate building vector tiles')
    parser.add_argument('--input', '-i', 
                       default='data/buildings.geojson',
                       help='Input buildings GeoJSON file')
    parser.add_argument('--output', '-o',
                       default='data/building_tiles',
                       help='Output directory for tiles')
    parser.add_argument('--max-zoom', type=int, default=16,
                       help='Maximum zoom level')
    parser.add_argument('--min-zoom', type=int, default=8,
                       help='Minimum zoom level')
    
    args = parser.parse_args()
    
    # Validate input file
    if not os.path.exists(args.input):
        print(f"❌ Error: Input file {args.input} not found")
        return 1
    
    # Create tile generator and run
    generator = BuildingTileGenerator(
        buildings_file=args.input,
        output_dir=args.output,
        max_zoom=args.max_zoom,
        min_zoom=args.min_zoom
    )
    
    try:
        generator.generate_tiles()
        return 0
    except Exception as e:
        print(f"❌ Error generating tiles: {e}")
        return 1


if __name__ == "__main__":
    exit(main()) 