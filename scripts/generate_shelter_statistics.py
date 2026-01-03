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

    # Generate charts for each theme
    for theme_name in ['tufte', 'dark']:
        print(f"\n=== GENERATING {theme_name.upper()} THEME CHARTS ===")
        theme = apply_theme(theme_name)

        create_shelter_types_chart(type_counts, theme)
        create_source_files_chart(source_counts, theme)
        create_coverage_analysis(theme)
        create_buildings_per_shelter_comparison(theme, bps_radii, bps_existing, bps_optimal)
        create_accessibility_coverage_progression(theme, radius_data, coverage_radii)

    print("\n=== GENERATION COMPLETE ===")
    print("Generated chart files in output/ directory:")
    for chart in ['01_shelter_types', '02_data_sources', '03_coverage_analysis',
                  '04_buildings_covered', '05_buildings_per_shelter',
                  '06_accessibility_coverage_progression']:
        print(f"  - {chart}_tufte.jpg")
        print(f"  - {chart}_dark.jpg")

if __name__ == "__main__":
    main() 