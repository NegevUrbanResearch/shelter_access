#!/usr/bin/env python3
"""
Shelter Statistics Generator
Generates statistical visualizations in two themes: Tufte (light) and Dark
"""

import json
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
import os

# Theme configurations
THEMES = {
    'tufte': {
        'name': 'Tufte',
        'suffix': '_tufte',
        'background': '#f5f5f0',
        'text': '#333333',
        'label': '#555555',
        'grid': '#d0d0d0',
        'grid_alpha': 0.7,
        'bar_color': '#4a7c9b',
        'existing_color': '#c45c4a',
        'optimal_color': '#4a8c6a',
        'value_label': '#666666',
        'pie_text': '#ffffff',
        'pie_colors': ['#4a7c9b', '#7a9f7a', '#9b8aa0', '#c9a66b', '#d4c878'],
        'progression_colors': {
            100: '#c45c4a',
            150: '#c98a3c',
            200: '#a89050',
            250: '#4a8c6a',
            300: '#3a6a7c'
        }
    },
    'dark': {
        'name': 'Dark',
        'suffix': '_dark',
        'background': '#1a1a1a',
        'text': '#cccccc',
        'label': '#999999',
        'grid': '#333333',
        'grid_alpha': 0.5,
        'bar_color': '#5a9bd4',
        'existing_color': '#e07a5f',
        'optimal_color': '#81b29a',
        'value_label': '#999999',
        'pie_text': '#cccccc',
        'pie_colors': ['#5a9bd4', '#7fc97f', '#beaed4', '#fdc086', '#ffff99'],
        'progression_colors': {
            100: '#e07a5f',
            150: '#f2a359',
            200: '#d4b483',
            250: '#81b29a',
            300: '#3d7a8c'
        }
    }
}


def apply_theme(theme_name):
    """Apply a theme's matplotlib settings"""
    theme = THEMES[theme_name]
    plt.rcParams.update({
        'figure.facecolor': theme['background'],
        'axes.facecolor': theme['background'],
        'axes.edgecolor': 'none',
        'axes.labelcolor': theme['label'],
        'text.color': theme['text'],
        'xtick.color': theme['label'],
        'ytick.color': theme['label'],
        'grid.color': theme['grid'],
        'grid.alpha': theme['grid_alpha'],
        'grid.linewidth': 0.5,
        'font.size': 11,
        'axes.titlesize': 14,
        'axes.labelsize': 10,
        'xtick.labelsize': 9,
        'ytick.labelsize': 9,
        'legend.fontsize': 9,
        'legend.frameon': False,
        'axes.spines.top': False,
        'axes.spines.right': False,
        'axes.spines.left': False,
        'axes.spines.bottom': False,
    })
    return theme


def setup_tufte_axis(ax):
    """Apply Tufte-style minimal axis formatting"""
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_visible(False)
    ax.spines['bottom'].set_visible(False)
    ax.tick_params(axis='both', length=0)  # Remove tick marks

def ensure_output_dir():
    """Ensure output directory exists"""
    os.makedirs('output', exist_ok=True)

def load_shelter_data(file_path='data/shelters.geojson'):
    """Load shelter data from GeoJSON file - existing shelters only"""
    print(f"Loading shelter data from {file_path}...")

    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Extract features and convert to DataFrame
    features = []
    for feature in data['features']:
        props = feature['properties'].copy()
        coords = feature['geometry']['coordinates']
        props['longitude'] = coords[0]
        props['latitude'] = coords[1]
        features.append(props)

    df = pd.DataFrame(features)
    total_records = len(df)

    # Filter to built shelters (includes 'Built' and 'Built (not_verified)')
    df['status_clean'] = df['status'].fillna('').str.strip()
    df = df[df['status_clean'].str.startswith('Built')].copy()
    print(f"Loaded {len(df)} existing shelters (filtered from {total_records} total records)")
    return df

def analyze_shelter_counts(df):
    """Analyze basic shelter counts"""
    print("\n=== SHELTER COUNTS ANALYSIS ===")

    print(f"Total built shelters: {len(df)}")

    return len(df)

def analyze_built_shelters(df):
    """Detailed analysis of built shelters"""
    print("\n=== BUILT SHELTERS ANALYSIS ===")

    built_shelters = df.copy()  # df is already filtered to Built only
    print(f"Total built shelters: {len(built_shelters)}")

    # Clean up shelter types - treat blanks and NA as 'Unknown/NA'
    built_shelters['type'] = built_shelters['type'].fillna('Unknown/NA')
    built_shelters['type'] = built_shelters['type'].str.strip()
    built_shelters.loc[built_shelters['type'] == '', 'type'] = 'Unknown/NA'

    # Analyze by type
    type_counts = built_shelters['type'].value_counts()
    print(f"\nShelter types:")
    for shelter_type, count in type_counts.items():
        print(f"  {shelter_type}: {count}")

    # Analyze by data source (if available)
    if 'data_source' in built_shelters.columns:
        source_counts = built_shelters['data_source'].value_counts()
        print(f"\nData sources:")
        for source, count in source_counts.items():
            print(f"  {source}: {count}")
    else:
        source_counts = pd.Series(dtype=int)
        print(f"\nData sources: Not available in data")

    return built_shelters, type_counts, source_counts

def create_shelter_types_chart(type_counts, theme):
    """Create shelter types chart"""
    fig, ax = plt.subplots(figsize=(10, 6))

    top_types = type_counts.head(8)
    bars = ax.barh(range(len(top_types)), top_types.values, color=theme['bar_color'], height=0.7)

    ax.set_yticks(range(len(top_types)))
    ax.set_yticklabels(top_types.index)
    ax.set_xlabel('Number of Shelters')
    ax.set_title('Built Shelters by Type', pad=15)

    for bar, value in zip(bars, top_types.values):
        ax.text(bar.get_width() + 5, bar.get_y() + bar.get_height()/2,
                str(value), ha='left', va='center', fontsize=9, color=theme['value_label'])

    setup_tufte_axis(ax)
    ax.grid(True, axis='x', linewidth=0.5)
    ax.set_axisbelow(True)

    plt.tight_layout()
    plt.savefig(f'output/01_shelter_types{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                facecolor=theme['background'], format='jpeg')
    plt.close()

def create_source_files_chart(source_counts, theme):
    """Create data source distribution chart"""
    if len(source_counts) == 0:
        print("  Skipping data source chart (no data_source field available)")
        return

    fig, ax = plt.subplots(figsize=(8, 6))

    colors = theme['pie_colors'][:len(source_counts)]

    wedges, _, _ = ax.pie(
        source_counts.values,
        labels=None,
        autopct='%1.0f%%',
        colors=colors,
        startangle=90,
        textprops={'fontsize': 9, 'color': theme['pie_text']},
        pctdistance=0.75
    )

    for wedge, label, count in zip(wedges, source_counts.index, source_counts.values):
        angle = (wedge.theta2 + wedge.theta1) / 2
        x = 1.3 * np.cos(np.radians(angle))
        y = 1.3 * np.sin(np.radians(angle))
        ax.text(x, y, f'{label}\n({count})', ha='center', va='center', fontsize=8, color=theme['label'])

    ax.set_title('Built Shelters by Data Source', pad=15)

    plt.tight_layout()
    plt.savefig(f'output/02_data_sources{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                facecolor=theme['background'], format='jpeg')
    plt.close()

def create_coverage_analysis(theme):
    """Generate coverage analysis charts"""
    coverage_radii = [100, 150, 200, 250, 300]
    coverage_stats = {}

    for radius in coverage_radii:
        try:
            with open(f'data/optimal_locations/optimal_shelters_{radius}m.json', 'r') as f:
                data = json.load(f)
                coverage_stats[radius] = data['statistics']
        except FileNotFoundError:
            print(f"Coverage data for {radius}m not found")
            continue

    if coverage_stats:
        # Coverage by radius chart
        _, ax = plt.subplots(figsize=(10, 6))

        radii = list(coverage_stats.keys())
        existing_coverage = [stats['coverage_percentage'] -
                           (stats['new_buildings_covered'] / stats['total_buildings'] * 100)
                           for stats in coverage_stats.values()]
        total_coverage = [stats['coverage_percentage'] for stats in coverage_stats.values()]

        ax.plot(radii, existing_coverage, 'o-', linewidth=2, markersize=6, color=theme['existing_color'])
        ax.plot(radii, total_coverage, 'o-', linewidth=2, markersize=6, color=theme['optimal_color'])

        ax.text(radii[-1] + 8, existing_coverage[-1], 'Existing',
                va='center', fontsize=9, color=theme['existing_color'])
        ax.text(radii[-1] + 8, total_coverage[-1], '+500 Optimal',
                va='center', fontsize=9, color=theme['optimal_color'])

        ax.set_xlabel('Coverage Radius (m)')
        ax.set_ylabel('Building Coverage')
        ax.set_title('Shelter Coverage Analysis by Radius', pad=15)
        ax.set_xticks(radii)
        ax.set_yticks(range(0, 101, 10))
        ax.set_yticklabels([f'{y}%' for y in range(0, 101, 10)])
        ax.set_ylim(0, 100)
        ax.set_xlim(90, 340)

        setup_tufte_axis(ax)
        ax.grid(True, axis='y', linewidth=0.5)
        ax.set_axisbelow(True)

        plt.tight_layout()
        plt.savefig(f'output/03_coverage_analysis{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                    facecolor=theme['background'], format='jpeg')
        plt.close()

        # Buildings covered chart
        _, ax = plt.subplots(figsize=(10, 6))

        buildings_existing = [stats['total_buildings_covered'] - stats['new_buildings_covered']
                             for stats in coverage_stats.values()]
        buildings_total = [stats['total_buildings_covered'] for stats in coverage_stats.values()]

        x = np.arange(len(radii))
        width = 0.35

        bars1 = ax.bar(x - width/2, buildings_existing, width, color=theme['existing_color'], alpha=0.9)
        bars2 = ax.bar(x + width/2, buildings_total, width, color=theme['optimal_color'], alpha=0.9)

        ax.set_xlabel('Coverage Radius (meters)')
        ax.set_ylabel('Buildings Covered')
        ax.set_title('Number of Buildings Covered by Radius', pad=15)
        ax.set_xticks(x)
        ax.set_xticklabels([f'{r}m' for r in radii])

        ax.text(x[0] - width/2, buildings_existing[0] + 200, 'Existing',
                ha='center', fontsize=8, color=theme['existing_color'])
        ax.text(x[0] + width/2, buildings_total[0] + 200, '+500 Optimal',
                ha='center', fontsize=8, color=theme['optimal_color'])

        ax.text(bars1[-1].get_x() + bars1[-1].get_width()/2., bars1[-1].get_height() + 100,
                f'{int(bars1[-1].get_height()):,}', ha='center', va='bottom', fontsize=8, color=theme['value_label'])
        ax.text(bars2[-1].get_x() + bars2[-1].get_width()/2., bars2[-1].get_height() + 100,
                f'{int(bars2[-1].get_height()):,}', ha='center', va='bottom', fontsize=8, color=theme['value_label'])

        setup_tufte_axis(ax)
        ax.grid(True, axis='y', linewidth=0.5)
        ax.set_axisbelow(True)

        plt.tight_layout()
        plt.savefig(f'output/04_buildings_covered{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                    facecolor=theme['background'], format='jpeg')
        plt.close()


def calculate_actual_coverage(shelter_coords, building_coords, radius_deg):
    """Calculate actual buildings within radius for each shelter"""
    from math import sqrt
    coverages = []
    for shelter in shelter_coords:
        count = 0
        for building in building_coords:
            dx = shelter[0] - building[0]
            dy = shelter[1] - building[1]
            if sqrt(dx*dx + dy*dy) <= radius_deg:
                count += 1
        coverages.append(count)
    return coverages


def calculate_incremental_coverage(building_coords, existing_shelters, optimal_shelters, radius_deg):
    """Calculate coverage percentage as shelters are added incrementally"""
    total_buildings = len(building_coords)
    if total_buildings == 0:
        return []
    
    # Convert to numpy arrays for vectorized operations
    # building_coords and shelters are in [lon, lat] format
    building_coords = np.array(building_coords)
    covered_mask = np.zeros(len(building_coords), dtype=bool)
    
    # Calculate initial coverage from existing shelters
    if len(existing_shelters) > 0:
        existing_shelters = np.array(existing_shelters)
        for shelter in existing_shelters:
            # Vectorized distance calculation (both in [lon, lat] format)
            lon_diff = building_coords[:, 0] - shelter[0]
            lat_diff = building_coords[:, 1] - shelter[1]
            distances_squared = lon_diff**2 + lat_diff**2
            covered_mask |= (distances_squared <= radius_deg**2)
    
    initial_coverage = np.sum(covered_mask) / total_buildings * 100
    coverage_percentages = [initial_coverage]
    
    # Add optimal shelters one by one
    for shelter in optimal_shelters:
        # Vectorized distance calculation for uncovered buildings only
        uncovered_indices = np.where(~covered_mask)[0]
        if len(uncovered_indices) > 0:
            uncovered_buildings = building_coords[uncovered_indices]
            lon_diff = uncovered_buildings[:, 0] - shelter[0]
            lat_diff = uncovered_buildings[:, 1] - shelter[1]
            distances_squared = lon_diff**2 + lat_diff**2
            newly_covered = uncovered_indices[distances_squared <= radius_deg**2]
            covered_mask[newly_covered] = True
        
        current_coverage = np.sum(covered_mask) / total_buildings * 100
        coverage_percentages.append(current_coverage)
    
    return coverage_percentages

def create_accessibility_coverage_progression(theme, radius_data, coverage_radii):
    """Create visualization showing coverage progression by accessibility level"""
    if not radius_data:
        return

    _, ax = plt.subplots(figsize=(11, 6))
    colors = theme['progression_colors']

    for radius in coverage_radii:
        if radius not in radius_data:
            continue

        data = radius_data[radius]
        coverage = data['coverage']
        num_shelters = len(coverage) - 1
        x_values = list(range(num_shelters + 1))

        ax.plot(x_values, coverage, '-', linewidth=1.8, color=colors[radius], alpha=0.85)
        ax.text(x_values[-1] + 5, coverage[-1], f'{radius}m',
                va='center', fontsize=8, color=colors[radius])

    ax.set_xlabel('Number of Shelters Added')
    ax.set_ylabel('Coverage')
    ax.set_title('Coverage Progression by Accessibility Level', pad=15)
    ax.set_ylim([0, 100])
    ax.set_yticks(range(0, 101, 10))
    ax.set_yticklabels([f'{y}%' for y in range(0, 101, 10)])

    setup_tufte_axis(ax)
    ax.grid(True, axis='y', linewidth=0.5)
    ax.set_axisbelow(True)

    plt.tight_layout()
    plt.savefig(f'output/06_accessibility_coverage_progression{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                facecolor=theme['background'], format='jpeg')
    plt.close()


def load_accessibility_data():
    """Load data needed for accessibility coverage progression chart"""
    coverage_radii = [100, 150, 200, 250, 300]

    # Load building coordinates
    try:
        with open('data/buildings.geojson', 'r') as f:
            buildings_data = json.load(f)
            building_coords = []
            for feature in buildings_data['features']:
                geom = feature['geometry']
                if geom['type'] == 'Point':
                    building_coords.append(geom['coordinates'])
                elif geom['type'] in ['Polygon', 'MultiPolygon']:
                    if geom['type'] == 'Polygon':
                        coords = geom['coordinates'][0]
                    else:
                        coords = geom['coordinates'][0][0]
                    cx = sum(c[0] for c in coords) / len(coords)
                    cy = sum(c[1] for c in coords) / len(coords)
                    building_coords.append([cx, cy])
        print(f"Loaded {len(building_coords)} building coordinates")
    except FileNotFoundError:
        print("Buildings data not found, skipping accessibility coverage chart")
        return None, coverage_radii

    # Load existing shelter coordinates
    try:
        with open('data/shelters.geojson', 'r', encoding='utf-8') as f:
            shelters_data = json.load(f)
            existing_shelters = []
            for feature in shelters_data['features']:
                props = feature['properties']
                status = props.get('status', '').strip()
                if status.startswith('Built'):
                    coords = feature['geometry']['coordinates']
                    existing_shelters.append([coords[0], coords[1]])
        print(f"Loaded {len(existing_shelters)} existing shelter coordinates")
    except FileNotFoundError:
        print("Shelters data not found, using empty existing shelters")
        existing_shelters = []

    # Calculate coverage progression for each radius
    radius_data = {}

    for radius in coverage_radii:
        try:
            with open(f'data/optimal_locations/optimal_shelters_{radius}m.json', 'r') as f:
                data = json.load(f)
                optimal_locations = data['optimal_locations']

                optimal_shelters = []
                for loc in optimal_locations:
                    if loc.get('type') != 'existing':
                        optimal_shelters.append([loc['lon'], loc['lat']])

                optimal_shelters = optimal_shelters[:500]
                radius_deg = radius / 100000
                coverage_progression = calculate_incremental_coverage(
                    building_coords, existing_shelters, optimal_shelters, radius_deg
                )

                radius_data[radius] = {
                    'coverage': coverage_progression,
                    'num_shelters': len(optimal_shelters)
                }

                print(f"  {radius}m: {len(optimal_shelters)} optimal shelters, "
                      f"final coverage: {coverage_progression[-1]:.1f}%")
        except FileNotFoundError:
            print(f"Optimal locations data for {radius}m not found")
            continue

    return radius_data, coverage_radii


def print_coverage_statistics():
    """Print coverage statistics for each accessibility level"""
    coverage_radii = [100, 150, 200, 250, 300]

    print("\n=== SHELTER COVERAGE STATISTICS ===\n")
    print(f"{'Radius':<10} {'Existing Coverage':<20} {'With +500 Optimal':<20} {'Improvement':<15}")
    print("-" * 65)

    total_buildings = None
    for radius in coverage_radii:
        try:
            with open(f'data/optimal_locations/optimal_shelters_{radius}m.json', 'r') as f:
                data = json.load(f)
                stats = data['statistics']

                total_buildings = stats['total_buildings']
                total_covered = stats['total_buildings_covered']
                new_covered = stats['new_buildings_covered']
                existing_covered = total_covered - new_covered

                existing_pct = (existing_covered / total_buildings) * 100
                total_pct = stats['coverage_percentage']
                improvement = total_pct - existing_pct

                print(f"{radius}m{'':<6} {existing_covered:,} ({existing_pct:.1f}%){'':<6} "
                      f"{total_covered:,} ({total_pct:.1f}%){'':<6} +{new_covered:,} (+{improvement:.1f}%)")
        except FileNotFoundError:
            print(f"{radius}m: Data not found")

    if total_buildings:
        print(f"\nTotal buildings in area: {total_buildings:,}")


def load_buildings_per_shelter_data():
    """Load data needed for buildings per shelter comparison chart"""
    coverage_radii = [100, 150, 200, 250, 300]

    # Load existing shelter coverage stats
    try:
        with open('data/shelter_coverage_precomputed.json', 'r') as f:
            existing_data = json.load(f)
            existing_stats = existing_data['summary_statistics']
    except FileNotFoundError:
        print("Shelter coverage precomputed data not found, skipping comparison chart")
        return None, None, None

    # Load building coordinates for recalculating optimal coverage
    try:
        with open('data/buildings.geojson', 'r') as f:
            buildings_data = json.load(f)
            building_coords = []
            for feature in buildings_data['features']:
                geom = feature['geometry']
                if geom['type'] == 'Point':
                    building_coords.append(geom['coordinates'])
                elif geom['type'] in ['Polygon', 'MultiPolygon']:
                    if geom['type'] == 'Polygon':
                        coords = geom['coordinates'][0]
                    else:
                        coords = geom['coordinates'][0][0]
                    cx = sum(c[0] for c in coords) / len(coords)
                    cy = sum(c[1] for c in coords) / len(coords)
                    building_coords.append([cx, cy])
    except FileNotFoundError:
        print("Buildings data not found, using stored metrics")
        building_coords = None

    optimal_avg = []
    radii = []

    for radius in coverage_radii:
        try:
            with open(f'data/optimal_locations/optimal_shelters_{radius}m.json', 'r') as f:
                data = json.load(f)
                locations = data['optimal_locations']

                if building_coords and len(locations) > 0:
                    radius_deg = radius / 100000
                    shelter_coords = [[loc['lon'], loc['lat']] for loc in locations]
                    coverages = calculate_actual_coverage(shelter_coords, building_coords, radius_deg)
                    avg_coverage = np.mean(coverages)
                else:
                    avg_coverage = data['statistics']['avg_buildings_per_new_shelter']

                optimal_avg.append(avg_coverage)
                radii.append(radius)
        except FileNotFoundError:
            print(f"Optimal locations data for {radius}m not found")
            continue

    if not radii:
        print("No optimal location data found, skipping comparison chart")
        return None, None, None

    existing_avg = [existing_stats[f'{r}m']['average_buildings_per_shelter'] for r in radii]

    return radii, existing_avg, optimal_avg


def create_buildings_per_shelter_comparison(theme, radii, existing_avg, optimal_avg):
    """Compare buildings per shelter: existing vs optimal locations"""
    if radii is None:
        return

    # Create grouped bar chart
    _, ax = plt.subplots(figsize=(10, 6))

    x = np.arange(len(radii))
    width = 0.35

    ax.bar(x - width/2, existing_avg, width, color=theme['existing_color'], alpha=0.9)
    ax.bar(x + width/2, optimal_avg, width, color=theme['optimal_color'], alpha=0.9)

    ax.set_xlabel('Coverage Radius (meters)')
    ax.set_ylabel('Average Buildings per Shelter')
    ax.set_title('Shelter Efficiency: Existing vs Optimal Locations', pad=15)
    ax.set_xticks(x)
    ax.set_xticklabels([f'{r}m' for r in radii])

    # Direct labeling on first bar group
    ax.text(x[0] - width/2, existing_avg[0] + 0.8, 'Existing',
            ha='center', fontsize=8, color=theme['existing_color'])
    ax.text(x[0] + width/2, optimal_avg[0] + 0.8, '+500 Optimal',
            ha='center', fontsize=8, color=theme['optimal_color'])

    setup_tufte_axis(ax)
    ax.grid(True, axis='y', linewidth=0.5)
    ax.set_axisbelow(True)

    plt.tight_layout()
    plt.savefig(f'output/05_buildings_per_shelter{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                facecolor=theme['background'], format='jpeg')
    plt.close()


def calculate_polygon_area_sqkm(coordinates):
    """Calculate polygon area in square kilometers using shoelace formula"""
    if not coordinates or len(coordinates) < 3:
        return 0
    
    # Handle MultiPolygon
    if isinstance(coordinates[0][0][0], list):
        total_area = 0
        for poly in coordinates:
            if len(poly) > 0 and len(poly[0]) > 0:
                total_area += calculate_polygon_area_sqkm(poly)
        return total_area
    
    # Handle Polygon (first ring is exterior)
    if isinstance(coordinates[0][0], list):
        coords = coordinates[0]
    else:
        coords = coordinates
    
    # Shoelace formula for area
    area_deg2 = 0
    n = len(coords)
    for i in range(n):
        j = (i + 1) % n
        area_deg2 += coords[i][0] * coords[j][1]
        area_deg2 -= coords[j][0] * coords[i][1]
    area_deg2 = abs(area_deg2) / 2.0
    
    # Convert degrees^2 to km^2 (approximate, varies by latitude)
    # At ~31°N latitude: 1° lat ≈ 111 km, 1° lon ≈ 95 km
    # Using average: 1 deg^2 ≈ 10550 km^2
    area_sqkm = area_deg2 * 10550
    
    return area_sqkm


def extract_coordinate(coord):
    """Extract lon, lat from coordinate which may be nested or have extra values"""
    # Handle different coordinate structures
    if isinstance(coord, (list, tuple)) and len(coord) > 0:
        first = coord[0]
        # If first element is also a list, it's nested like [[lon, lat]]
        if isinstance(first, (list, tuple)) and len(first) >= 2:
            return float(first[0]), float(first[1])
        # Otherwise it's flat like [lon, lat]
        elif len(coord) >= 2:
            return float(coord[0]), float(coord[1])
    return None, None


def point_in_polygon(point, polygon_coords):
    """Check if a point is inside a polygon using ray casting algorithm"""
    x, y = float(point[0]), float(point[1])
    
    # Ensure polygon_coords is a list of coordinate pairs
    if not polygon_coords or len(polygon_coords) < 3:
        return False
    
    # Extract first coordinate to check structure
    p1x, p1y = extract_coordinate(polygon_coords[0])
    if p1x is None:
        return False
    
    inside = False
    n = len(polygon_coords)
    
    for i in range(1, n + 1):
        p2x, p2y = extract_coordinate(polygon_coords[i % n])
        if p2x is None:
            continue
        
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
                    # Skip horizontal edges (p1y == p2y) as they don't intersect horizontal ray
        p1x, p1y = p2x, p2y
    
    return inside


def load_density_per_sqkm_data():
    """Calculate buildings and shelters per sq km using a grid-based approach"""
    print("Loading density per sq km data (grid-based)...")
    
    # Load buildings
    try:
        with open('data/buildings.geojson', 'r') as f:
            buildings_data = json.load(f)
    except FileNotFoundError:
        print("  Buildings data not found")
        return None
    
    # Load existing shelters
    try:
        with open('data/shelters.geojson', 'r', encoding='utf-8') as f:
            shelters_data = json.load(f)
            existing_shelters = []
            for feature in shelters_data['features']:
                props = feature['properties']
                status = props.get('status', '').strip()
                if status.startswith('Built'):
                    coords = feature['geometry']['coordinates']
                    existing_shelters.append([coords[0], coords[1]])
    except FileNotFoundError:
        existing_shelters = []
    
    # Extract building coordinates
    building_coords = []
    for feature in buildings_data['features']:
        geom = feature['geometry']
        if geom['type'] == 'Point':
            building_coords.append(geom['coordinates'])
        elif geom['type'] in ['Polygon', 'MultiPolygon']:
            if geom['type'] == 'Polygon':
                coords = geom['coordinates'][0]
            else:
                coords = geom['coordinates'][0][0]
            cx = sum(c[0] for c in coords) / len(coords)
            cy = sum(c[1] for c in coords) / len(coords)
            building_coords.append([cx, cy])
    
    if not building_coords:
        print("  No building coordinates found")
        return None
    
    # Calculate bounds from building data
    lons = [b[0] for b in building_coords]
    lats = [b[1] for b in building_coords]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)
    
    # Grid cell size in degrees (approximately 1km x 1km)
    # At ~31°N latitude: 1° lat ≈ 111 km, 1° lon ≈ 95 km
    # So 1km ≈ 0.009° lat and ≈ 0.0105° lon
    grid_size_deg_lat = 0.009  # ~1km
    grid_size_deg_lon = 0.0105  # ~1km
    
    # Create grid
    grid_cells = {}
    
    def get_grid_cell(lon, lat):
        """Get grid cell indices for a coordinate"""
        i = int((lat - min_lat) / grid_size_deg_lat)
        j = int((lon - min_lon) / grid_size_deg_lon)
        return (i, j)
    
    # Count buildings in each grid cell
    for building in building_coords:
        cell = get_grid_cell(building[0], building[1])
        if cell not in grid_cells:
            grid_cells[cell] = {'buildings': 0, 'shelters': 0}
        grid_cells[cell]['buildings'] += 1
    
    # Count shelters in each grid cell
    for shelter in existing_shelters:
        cell = get_grid_cell(shelter[0], shelter[1])
        if cell not in grid_cells:
            grid_cells[cell] = {'buildings': 0, 'shelters': 0}
        grid_cells[cell]['shelters'] += 1
    
    # Calculate density for each grid cell
    # Area of each cell in sq km (approximately 1 km²)
    cell_area_sqkm = grid_size_deg_lat * 111 * grid_size_deg_lon * 95  # ~1 km²
    
    density_data = []
    for (i, j), counts in grid_cells.items():
        # Only include cells with buildings
        if counts['buildings'] > 0:
            buildings_per_sqkm = counts['buildings'] / cell_area_sqkm
            shelters_per_sqkm = counts['shelters'] / cell_area_sqkm
            
            # Calculate cell center for reference
            cell_center_lat = min_lat + (i + 0.5) * grid_size_deg_lat
            cell_center_lon = min_lon + (j + 0.5) * grid_size_deg_lon
            
            density_data.append({
                'buildings_per_sqkm': buildings_per_sqkm,
                'shelters_per_sqkm': shelters_per_sqkm,
                'buildings': counts['buildings'],
                'shelters': counts['shelters'],
                'area_sqkm': cell_area_sqkm,
                'cell_i': i,
                'cell_j': j,
                'center_lat': cell_center_lat,
                'center_lon': cell_center_lon
            })
    
    print(f"  Created {len(grid_cells)} grid cells ({len(density_data)} with buildings)")
    if density_data:
        avg_buildings = np.mean([d['buildings_per_sqkm'] for d in density_data])
        avg_shelters = np.mean([d['shelters_per_sqkm'] for d in density_data])
        print(f"  Average buildings per km²: {avg_buildings:.1f}")
        print(f"  Average shelters per km²: {avg_shelters:.2f}")
    return density_data


def create_density_scatter(theme, density_data):
    """Create scatter plot of shelters per sq km vs buildings per sq km"""
    if not density_data:
        return
    
    _, ax = plt.subplots(figsize=(10, 6))
    
    buildings_density = np.array([d['buildings_per_sqkm'] for d in density_data])
    shelters_density = np.array([d['shelters_per_sqkm'] for d in density_data])
    
    # Add small jitter to zero values to prevent overlap (keep above zero)
    jittered_shelters = shelters_density.copy()
    zero_mask_y = shelters_density == 0
    if np.any(zero_mask_y):
        jittered_shelters[zero_mask_y] = np.random.uniform(0.05, 0.25, size=np.sum(zero_mask_y))
    
    # Add small jitter to zero values on x-axis
    jittered_buildings = buildings_density.copy()
    zero_mask_x = buildings_density == 0
    if np.any(zero_mask_x):
        jittered_buildings[zero_mask_x] = np.random.uniform(0.5, 2.5, size=np.sum(zero_mask_x))
    
    # Create scatter plot with light blending (low alpha for additive blending effect)
    ax.scatter(jittered_buildings, jittered_shelters, 
              color=theme['bar_color'], alpha=0.3, s=15, edgecolors='none')
    
    ax.set_xlabel('Buildings per km²')
    ax.set_ylabel('Shelters per km²')
    ax.set_title('Shelter Density vs Building Density', pad=15)
    ax.set_xlim(-3, None)  # Add padding below zero on x-axis
    ax.set_ylim(0, 10)
    ax.set_yticks(range(0, 11, 2))
    ax.set_yticklabels([f'{y}' for y in range(0, 11, 2)])
    
    setup_tufte_axis(ax)
    ax.grid(True, linewidth=0.5, alpha=0.3)
    ax.set_axisbelow(True)
    
    plt.tight_layout()
    plt.savefig(f'output/07_density_scatter{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                facecolor=theme['background'], format='jpeg')
    plt.close()


def calculate_local_building_density(building_coords, radius_m=300):
    """Calculate local density: number of buildings within radius_m of each building"""
    print(f"Calculating local building density (buildings within {radius_m}m)...")
    
    if not building_coords or len(building_coords) < 2:
        return None
    
    building_coords = np.array(building_coords)
    n = len(building_coords)
    radius_deg = radius_m / 100000  # Convert meters to degrees (approximate)
    radius_sq = radius_deg ** 2
    
    local_densities = np.zeros(n, dtype=int)
    
    # Process in batches to show progress and manage memory
    batch_size = 500
    total_batches = (n + batch_size - 1) // batch_size
    
    for batch_idx in range(total_batches):
        if batch_idx % 5 == 0 or batch_idx == total_batches - 1:
            print(f"  Processing batch {batch_idx + 1}/{total_batches} ({batch_idx * batch_size:,} buildings)...")
        
        i = batch_idx * batch_size
        batch_end = min(i + batch_size, n)
        batch_coords = building_coords[i:batch_end]
        batch_size_actual = batch_end - i
        
        # Vectorized: calculate distances from all batch buildings to all buildings
        # Shape: (batch_size, n)
        lon_diff = building_coords[:, 0][np.newaxis, :] - batch_coords[:, 0][:, np.newaxis]
        lat_diff = building_coords[:, 1][np.newaxis, :] - batch_coords[:, 1][:, np.newaxis]
        distances_squared = lon_diff**2 + lat_diff**2
        
        # Count buildings within radius for each building in batch
        within_radius = np.sum(distances_squared <= radius_sq, axis=1)
        local_densities[i:batch_end] = within_radius - 1  # Subtract 1 to exclude self
    
    print(f"  Calculated local density for {n:,} buildings")
    return local_densities.tolist()


def calculate_shelters_within_radius(building_coords, shelter_coords, radius_m=300):
    """Calculate number of shelters within radius_m of each building"""
    print(f"Calculating shelters within {radius_m}m of each building...")
    
    if not building_coords or not shelter_coords:
        return None
    
    building_coords = np.array(building_coords)
    shelter_coords = np.array(shelter_coords)
    n = len(building_coords)
    radius_deg = radius_m / 100000
    radius_sq = radius_deg ** 2
    
    shelter_counts = np.zeros(n, dtype=int)
    
    # Process in batches
    batch_size = 1000
    total_batches = (n + batch_size - 1) // batch_size
    
    for batch_idx in range(total_batches):
        if batch_idx % 10 == 0 or batch_idx == total_batches - 1:
            print(f"  Processing batch {batch_idx + 1}/{total_batches} ({batch_idx * batch_size:,} buildings)...")
        
        i = batch_idx * batch_size
        batch_end = min(i + batch_size, n)
        batch_coords = building_coords[i:batch_end]
        
        # Vectorized: calculate distances from batch buildings to all shelters
        lon_diff = shelter_coords[:, 0][np.newaxis, :] - batch_coords[:, 0][:, np.newaxis]
        lat_diff = shelter_coords[:, 1][np.newaxis, :] - batch_coords[:, 1][:, np.newaxis]
        distances_squared = lon_diff**2 + lat_diff**2
        
        # Count shelters within radius for each building
        within_radius = np.sum(distances_squared <= radius_sq, axis=1)
        shelter_counts[i:batch_end] = within_radius
    
    print(f"  Calculated shelter counts for {n:,} buildings")
    return shelter_counts.tolist()


def load_local_density_data():
    """Load building data and calculate local density metrics"""
    print("Loading building data for local density calculation...")
    
    try:
        with open('data/buildings.geojson', 'r') as f:
            buildings_data = json.load(f)
    except FileNotFoundError:
        print("  Buildings data not found")
        return None
    
    # Load existing shelters
    try:
        with open('data/shelters.geojson', 'r', encoding='utf-8') as f:
            shelters_data = json.load(f)
            existing_shelters = []
            for feature in shelters_data['features']:
                props = feature['properties']
                status = props.get('status', '').strip()
                if status.startswith('Built'):
                    coords = feature['geometry']['coordinates']
                    existing_shelters.append([coords[0], coords[1]])
    except FileNotFoundError:
        existing_shelters = []
    
    # Extract building coordinates
    building_coords = []
    for feature in buildings_data['features']:
        geom = feature['geometry']
        if geom['type'] == 'Point':
            building_coords.append(geom['coordinates'])
        elif geom['type'] in ['Polygon', 'MultiPolygon']:
            if geom['type'] == 'Polygon':
                coords = geom['coordinates'][0]
            else:
                coords = geom['coordinates'][0][0]
            cx = sum(c[0] for c in coords) / len(coords)
            cy = sum(c[1] for c in coords) / len(coords)
            building_coords.append([cx, cy])
    
    if not building_coords:
        return None
    
    # Calculate local density
    local_densities = calculate_local_building_density(building_coords, radius_m=300)
    
    # Calculate shelters within 300m
    shelter_counts = calculate_shelters_within_radius(building_coords, existing_shelters, radius_m=300)
    
    return {
        'building_coords': building_coords,
        'local_densities': local_densities,
        'shelter_counts': shelter_counts
    }


def calculate_closest_shelter_distance(building_coords, shelter_coords, max_radius_m=300):
    """Calculate closest shelter distance for each building within max_radius_m"""
    if not building_coords or not shelter_coords:
        return None
    
    building_coords = np.array(building_coords)
    shelter_coords = np.array(shelter_coords)
    n = len(building_coords)
    max_radius_deg = max_radius_m / 100000
    
    closest_distances = np.full(n, np.inf)
    
    # Process in batches
    batch_size = 1000
    total_batches = (n + batch_size - 1) // batch_size
    
    for batch_idx in range(total_batches):
        if batch_idx % 10 == 0 or batch_idx == total_batches - 1:
            print(f"  Processing batch {batch_idx + 1}/{total_batches}...")
        
        i = batch_idx * batch_size
        batch_end = min(i + batch_size, n)
        batch_coords = building_coords[i:batch_end]
        
        # Calculate distances from batch buildings to all shelters
        lon_diff = shelter_coords[:, 0][np.newaxis, :] - batch_coords[:, 0][:, np.newaxis]
        lat_diff = shelter_coords[:, 1][np.newaxis, :] - batch_coords[:, 1][:, np.newaxis]
        distances_sq = lon_diff**2 + lat_diff**2
        
        # Find minimum distance for each building
        min_distances_sq = np.min(distances_sq, axis=1)
        closest_distances[i:batch_end] = np.sqrt(min_distances_sq)
    
    return closest_distances


def create_local_density_distribution(theme, local_density_data, theme_name='tufte'):
    """Create stacked histogram showing distribution by closest shelter distance"""
    if not local_density_data or not local_density_data['local_densities'] or not local_density_data['building_coords']:
        return
    
    local_densities = np.array(local_density_data['local_densities'])
    building_coords = local_density_data['building_coords']
    
    # Load existing shelters
    try:
        with open('data/shelters.geojson', 'r', encoding='utf-8') as f:
            shelters_data = json.load(f)
            existing_shelters = []
            for feature in shelters_data['features']:
                props = feature['properties']
                status = props.get('status', '').strip()
                if status.startswith('Built'):
                    coords = feature['geometry']['coordinates']
                    existing_shelters.append([coords[0], coords[1]])
    except FileNotFoundError:
        existing_shelters = []
    
    if not existing_shelters:
        return
    
    # Calculate closest shelter distance for each building
    print("  Calculating closest shelter distances...")
    closest_distances_deg = calculate_closest_shelter_distance(building_coords, existing_shelters, max_radius_m=300)
    if closest_distances_deg is None:
        return
    
    # Convert to meters and categorize by distance ranges
    distance_thresholds = [100, 150, 200, 250, 300]
    distance_thresholds_deg = [d / 100000 for d in distance_thresholds]
    
    # Categorize buildings by closest shelter distance into ranges
    categories = []
    for i, dist_deg in enumerate(closest_distances_deg):
        if dist_deg > distance_thresholds_deg[-1]:
            categories.append('no_shelter')
        elif dist_deg <= distance_thresholds_deg[0]:
            categories.append('<100m')
        elif dist_deg <= distance_thresholds_deg[1]:
            categories.append('100-150m')
        elif dist_deg <= distance_thresholds_deg[2]:
            categories.append('150-200m')
        elif dist_deg <= distance_thresholds_deg[3]:
            categories.append('200-250m')
        else:  # dist_deg <= distance_thresholds_deg[4] (300m)
            categories.append('250-300m')
    
    categories = np.array(categories)
    
    # Separate densities by category
    density_by_category = {}
    density_by_category['<100m'] = local_densities[categories == '<100m']
    density_by_category['100-150m'] = local_densities[categories == '100-150m']
    density_by_category['150-200m'] = local_densities[categories == '150-200m']
    density_by_category['200-250m'] = local_densities[categories == '200-250m']
    density_by_category['250-300m'] = local_densities[categories == '250-300m']
    density_by_category['no_shelter'] = local_densities[categories == 'no_shelter']
    
    _, ax = plt.subplots(figsize=(10, 6))
    
    # Create bins
    max_density = int(np.max(local_densities))
    bins = np.arange(0, max_density + 5, 5)
    
    # Version 1: All distance layers with intuitive color gradient
    # Gradient from red (no shelter) to green (closest shelter)
    if theme_name == 'tufte':
        colors_all = [
            '#c45c4a',  # no_shelter (red)
            '#d4885a',  # 300m (orange-red)
            '#e0a86a',  # 250m (orange)
            '#ecc87a',  # 200m (yellow-orange)
            '#a8c87a',  # 150m (yellow-green)
            '#4a8c6a',  # 100m (green)
        ]
    else:  # dark theme
        colors_all = [
            '#e07a5f',  # no_shelter (red)
            '#e8966f',  # 300m (orange-red)
            '#f0b27f',  # 250m (orange)
            '#f8ce8f',  # 200m (yellow-orange)
            '#b8d89f',  # 150m (yellow-green)
            '#81b29a',  # 100m (green)
        ]
    
    data_layers_all = [
        density_by_category['no_shelter'],
        density_by_category['250-300m'],
        density_by_category['200-250m'],
        density_by_category['150-200m'],
        density_by_category['100-150m'],
        density_by_category['<100m'],
    ]
    
    labels_all = ['No shelter', '250-300m', '200-250m', '150-200m', '100-150m', '<100m']
    
    ax.hist(data_layers_all, bins=bins, 
            color=colors_all, alpha=0.8, edgecolor='none', stacked=True, label=labels_all)
    
    ax.set_xlabel('Buildings within 300m')
    ax.set_ylabel('Number of Buildings')
    ax.set_title('Buildings within 300m of Each Building', pad=15)
    
    # Add legend
    ax.legend(loc='upper right', fontsize=8, frameon=False)
    
    setup_tufte_axis(ax)
    ax.grid(True, axis='y', linewidth=0.5)
    ax.set_axisbelow(True)
    
    plt.tight_layout()
    plt.savefig(f'output/09_local_density_distribution{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                facecolor=theme['background'], format='jpeg')
    plt.close()
    
    # Version 2: Only 300m and no shelter
    _, ax2 = plt.subplots(figsize=(10, 6))
    
    # Combine all shelter categories into one "has shelter" category
    has_shelter_densities = np.concatenate([
        density_by_category['<100m'],
        density_by_category['100-150m'],
        density_by_category['150-200m'],
        density_by_category['200-250m'],
        density_by_category['250-300m']
    ])
    
    colors_simple = [
        theme['existing_color'],  # no_shelter (red)
        theme['progression_colors'][300],  # has shelter (green)
    ]
    
    data_layers_simple = [
        density_by_category['no_shelter'],
        has_shelter_densities,
    ]
    
    labels_simple = ['No shelter', 'Has shelter (≤300m)']
    
    ax2.hist(data_layers_simple, bins=bins, 
            color=colors_simple, alpha=0.8, edgecolor='none', stacked=True, label=labels_simple)
    
    ax2.set_xlabel('Buildings within 300m')
    ax2.set_ylabel('Number of Buildings')
    ax2.set_title('Buildings within 300m of Each Building', pad=15)
    
    # Add legend
    ax2.legend(loc='upper right', fontsize=8, frameon=False)
    
    setup_tufte_axis(ax2)
    ax2.grid(True, axis='y', linewidth=0.5)
    ax2.set_axisbelow(True)
    
    plt.tight_layout()
    plt.savefig(f'output/09b_local_density_distribution_simple{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                facecolor=theme['background'], format='jpeg')
    plt.close()
    
    # Print statistics
    print(f"  Local density statistics (buildings within 300m):")
    print(f"    Mean: {np.mean(local_densities):.1f}")
    print(f"    Median: {np.median(local_densities):.1f}")
    print(f"    Max: {np.max(local_densities):.0f}")
    total = len(categories)
    for label in ['<100m', '100-150m', '150-200m', '200-250m', '250-300m', 'no_shelter']:
        count = np.sum(categories == label)
        display_label = 'No shelter' if label == 'no_shelter' else label
        print(f"    {display_label}: {count:,} ({count/total*100:.1f}%)")


def create_distance_to_shelter_line(theme, local_density_data):
    """Create line graph showing number of buildings vs distance to nearest shelter"""
    if not local_density_data or not local_density_data['building_coords']:
        return
    
    building_coords = local_density_data['building_coords']
    
    # Load existing shelters
    try:
        with open('data/shelters.geojson', 'r', encoding='utf-8') as f:
            shelters_data = json.load(f)
            existing_shelters = []
            for feature in shelters_data['features']:
                props = feature['properties']
                status = props.get('status', '').strip()
                if status.startswith('Built'):
                    coords = feature['geometry']['coordinates']
                    existing_shelters.append([coords[0], coords[1]])
    except FileNotFoundError:
        existing_shelters = []
    
    if not existing_shelters:
        return
    
    # Calculate closest shelter distance for each building
    print("  Calculating closest shelter distances for line graph...")
    closest_distances_deg = calculate_closest_shelter_distance(building_coords, existing_shelters, max_radius_m=500)
    if closest_distances_deg is None:
        return
    
    # Convert to meters
    closest_distances_m = np.array(closest_distances_deg) * 100000
    
    # Filter to buildings with shelter within 500m
    has_shelter_mask = closest_distances_m <= 500
    distances_with_shelter = closest_distances_m[has_shelter_mask]
    
    # Create bins for distance ranges
    bins = np.arange(0, 501, 10)  # 10m bins up to 500m
    
    # Count buildings in each bin
    counts, bin_edges = np.histogram(distances_with_shelter, bins=bins)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    
    _, ax = plt.subplots(figsize=(10, 6))
    
    # Create line graph
    ax.plot(bin_centers, counts, color=theme['bar_color'], linewidth=2, marker='o', markersize=3)
    
    ax.set_xlabel('Distance to Nearest Shelter (m)')
    ax.set_ylabel('Number of Buildings')
    ax.set_title('Buildings by Distance to Nearest Shelter', pad=15)
    ax.set_xlim(0, 500)
    
    setup_tufte_axis(ax)
    ax.grid(True, axis='y', linewidth=0.5)
    ax.set_axisbelow(True)
    
    plt.tight_layout()
    plt.savefig(f'output/10_distance_to_shelter_line{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                facecolor=theme['background'], format='jpeg')
    plt.close()
    
    # Print statistics
    print(f"  Distance to shelter statistics:")
    print(f"    Buildings with shelter ≤500m: {len(distances_with_shelter):,}")
    print(f"    Mean distance: {np.mean(distances_with_shelter):.1f}m")
    print(f"    Median distance: {np.median(distances_with_shelter):.1f}m")


def create_local_density_200m(theme, local_density_data, theme_name='tufte'):
    """Create stacked histogram for 200m distance (buildings and shelters within 200m)"""
    if not local_density_data or not local_density_data['building_coords']:
        return
    
    building_coords = local_density_data['building_coords']
    
    # Load existing shelters
    try:
        with open('data/shelters.geojson', 'r', encoding='utf-8') as f:
            shelters_data = json.load(f)
            existing_shelters = []
            for feature in shelters_data['features']:
                props = feature['properties']
                status = props.get('status', '').strip()
                if status.startswith('Built'):
                    coords = feature['geometry']['coordinates']
                    existing_shelters.append([coords[0], coords[1]])
    except FileNotFoundError:
        existing_shelters = []
    
    if not existing_shelters:
        return
    
    # Calculate buildings within 200m
    print("  Calculating buildings within 200m...")
    local_densities_200m = calculate_local_building_density(building_coords, radius_m=200)
    if local_densities_200m is None:
        return
    
    local_densities_200m = np.array(local_densities_200m)
    
    # Calculate closest shelter distance within 200m
    print("  Calculating closest shelter distances within 200m...")
    closest_distances_deg = calculate_closest_shelter_distance(building_coords, existing_shelters, max_radius_m=200)
    if closest_distances_deg is None:
        return
    
    # Categorize buildings
    has_shelter = closest_distances_deg <= (200 / 100000)
    densities_with_shelter = local_densities_200m[has_shelter]
    densities_without_shelter = local_densities_200m[~has_shelter]
    
    _, ax = plt.subplots(figsize=(10, 6))
    
    # Create bins
    max_density = int(np.max(local_densities_200m))
    bins = np.arange(0, max_density + 5, 5)
    
    # Create stacked histogram
    colors_simple = [
        theme['existing_color'],  # no_shelter (red)
        theme['optimal_color'],  # has shelter (green)
    ]
    
    data_layers = [
        densities_without_shelter,
        densities_with_shelter,
    ]
    
    labels = ['No shelter', 'Has shelter (≤200m)']
    
    ax.hist(data_layers, bins=bins, 
            color=colors_simple, alpha=0.8, edgecolor='none', stacked=True, label=labels)
    
    ax.set_xlabel('Buildings within 200m')
    ax.set_ylabel('Number of Buildings')
    ax.set_title('Buildings within 200m of Each Building', pad=15)
    
    # Add legend
    ax.legend(loc='upper right', fontsize=8, frameon=False)
    
    setup_tufte_axis(ax)
    ax.grid(True, axis='y', linewidth=0.5)
    ax.set_axisbelow(True)
    
    plt.tight_layout()
    plt.savefig(f'output/09c_local_density_200m{theme["suffix"]}.jpg', dpi=300, bbox_inches='tight',
                facecolor=theme['background'], format='jpeg')
    plt.close()
    
    # Print statistics
    total = len(has_shelter)
    print(f"  Local density statistics (buildings within 200m):")
    print(f"    Mean: {np.mean(local_densities_200m):.1f}")
    print(f"    Buildings with shelter ≤200m: {np.sum(has_shelter):,} ({np.sum(has_shelter)/total*100:.1f}%)")
    print(f"    Buildings without shelter: {np.sum(~has_shelter):,} ({np.sum(~has_shelter)/total*100:.1f}%)")


def main():
    """Main function to generate all visualizations in both themes"""
    print("=== SHELTER STATISTICS GENERATOR ===")
    print("Built Shelters Only | Dual Theme (Tufte + Dark) | JPEG Output")

    # Ensure output directory exists
    ensure_output_dir()

    # Load data (only Built shelters, matching application behavior)
    df = load_shelter_data()

    # Analyze data
    analyze_shelter_counts(df)
    _, type_counts, source_counts = analyze_built_shelters(df)

    # Print coverage statistics
    print_coverage_statistics()

    # Pre-load data that's expensive to compute (only once)
    print("\n=== LOADING CHART DATA ===")
    print("Loading accessibility coverage data...")
    radius_data, coverage_radii = load_accessibility_data()
    print("Loading buildings per shelter data...")
    bps_radii, bps_existing, bps_optimal = load_buildings_per_shelter_data()
    print("Loading density per sq km data...")
    density_data = load_density_per_sqkm_data()
    print("Loading local building density data...")
    local_density_data = load_local_density_data()

    # Generate charts for each theme
    for theme_name in ['tufte', 'dark']:
        print(f"\n=== GENERATING {theme_name.upper()} THEME CHARTS ===")
        theme = apply_theme(theme_name)

        create_shelter_types_chart(type_counts, theme)
        create_source_files_chart(source_counts, theme)
        create_coverage_analysis(theme)
        create_buildings_per_shelter_comparison(theme, bps_radii, bps_existing, bps_optimal)
        create_accessibility_coverage_progression(theme, radius_data, coverage_radii)
        create_density_scatter(theme, density_data)
        create_local_density_distribution(theme, local_density_data, theme_name)
        create_distance_to_shelter_line(theme, local_density_data)
        create_local_density_200m(theme, local_density_data, theme_name)

    print("\n=== GENERATION COMPLETE ===")
    print("Generated chart files in output/ directory:")
    for chart in ['01_shelter_types', '02_data_sources', '03_coverage_analysis',
                  '04_buildings_covered', '05_buildings_per_shelter',
                  '06_accessibility_coverage_progression', '07_density_scatter',
                  '09_local_density_distribution', '09b_local_density_distribution_simple',
                  '09c_local_density_200m', '10_distance_to_shelter_line']:
        print(f"  - {chart}_tufte.jpg")
        print(f"  - {chart}_dark.jpg")

if __name__ == "__main__":
    main() 