#!/usr/bin/env python3
"""
Shelter Statistics Generator
Generates individual statistical visualizations for shelter data with dark theme
"""

import json
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime
import numpy as np
from collections import Counter
import os

# Set up dark theme
plt.style.use('dark_background')
sns.set_palette("bright")

# Configure matplotlib for better dark theme
plt.rcParams.update({
    'figure.facecolor': '#1e1e1e',
    'axes.facecolor': '#2d2d2d',
    'axes.edgecolor': '#555555',
    'axes.labelcolor': '#ffffff',
    'text.color': '#ffffff',
    'xtick.color': '#ffffff',
    'ytick.color': '#ffffff',
    'grid.color': '#404040',
    'grid.alpha': 0.3,
    'font.size': 12,
    'axes.titlesize': 16,
    'axes.labelsize': 12,
    'xtick.labelsize': 10,
    'ytick.labelsize': 10,
    'legend.fontsize': 11,
    'figure.titlesize': 18
})

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

    # Analyze by data source
    source_counts = built_shelters['data_source'].value_counts()
    print(f"\nData sources:")
    for source, count in source_counts.items():
        print(f"  {source}: {count}")

    return built_shelters, type_counts, source_counts

def create_shelter_types_chart(type_counts):
    """Create shelter types chart"""
    print("Creating shelter types chart...")
    
    fig, ax = plt.subplots(figsize=(12, 8))
    
    # Get top 8 types to avoid crowding
    top_types = type_counts.head(8)
    
    colors = plt.cm.Set3(np.linspace(0, 1, len(top_types)))
    bars = ax.barh(range(len(top_types)), top_types.values, color=colors)
    
    ax.set_yticks(range(len(top_types)))
    ax.set_yticklabels(top_types.index, fontsize=12)
    ax.set_xlabel('Number of Shelters', fontsize=14, fontweight='bold')
    ax.set_title('Built Shelters by Type', fontsize=20, fontweight='bold', pad=20)
    
    # Add value labels on bars
    for i, (bar, value) in enumerate(zip(bars, top_types.values)):
        ax.text(bar.get_width() + 2, bar.get_y() + bar.get_height()/2, 
                str(value), ha='left', va='center', fontweight='bold', fontsize=11)
    
    ax.grid(True, alpha=0.3, axis='x')
    plt.tight_layout()
    plt.savefig('output/01_shelter_types.jpg', dpi=300, bbox_inches='tight',
                facecolor='#1e1e1e', format='jpeg')
    plt.close()

def create_source_files_chart(source_counts):
    """Create data source distribution chart"""
    print("Creating data source chart...")

    fig, ax = plt.subplots(figsize=(10, 8))

    colors = plt.cm.Set2(np.linspace(0, 1, len(source_counts)))
    wedges, texts, autotexts = ax.pie(
        source_counts.values,
        labels=source_counts.index,
        autopct='%1.1f%%',
        colors=colors,
        startangle=90,
        textprops={'fontsize': 12, 'color': 'white'},
        wedgeprops={'linewidth': 2, 'edgecolor': '#555555'}
    )

    ax.set_title('Built Shelters by Data Source', fontsize=20, fontweight='bold', pad=20)

    plt.tight_layout()
    plt.savefig('output/02_data_sources.jpg', dpi=300, bbox_inches='tight',
                facecolor='#1e1e1e', format='jpeg')
    plt.close()

def create_coverage_analysis():
    """Generate coverage analysis charts"""
    print("Creating coverage analysis charts...")
    
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
        fig, ax = plt.subplots(figsize=(12, 8))
        
        radii = list(coverage_stats.keys())
        existing_coverage = [stats['coverage_percentage'] - 
                           (stats['new_buildings_covered'] / stats['total_buildings'] * 100) 
                           for stats in coverage_stats.values()]
        total_coverage = [stats['coverage_percentage'] for stats in coverage_stats.values()]
        
        ax.plot(radii, existing_coverage, 'o-', label='Existing Shelters (713)',
                linewidth=3, markersize=10, color='#ff6b6b')
        ax.plot(radii, total_coverage, 's-', label='+ 500 Optimal Locations (1213)',
                linewidth=3, markersize=10, color='#4ecdc4')
        
        ax.set_xlabel('Coverage Radius (meters)', fontsize=14, fontweight='bold')
        ax.set_ylabel('Building Coverage (%)', fontsize=14, fontweight='bold')
        ax.set_title('Shelter Coverage Analysis by Radius', fontsize=20, fontweight='bold', pad=20)
        ax.set_xticks(radii)  # Only show ticks for tested radii
        ax.legend(fontsize=12)
        ax.grid(True, alpha=0.3)
        
        # Add value labels
        for i, (r, existing, total) in enumerate(zip(radii, existing_coverage, total_coverage)):
            ax.text(r, existing - 1.5, f'{existing:.1f}%', ha='center', va='top', 
                   fontsize=10, fontweight='bold', color='#ff6b6b')
            ax.text(r, total + 1, f'{total:.1f}%', ha='center', va='bottom', 
                   fontsize=10, fontweight='bold', color='#4ecdc4')
        
        plt.tight_layout()
        plt.savefig('output/03_coverage_analysis.jpg', dpi=300, bbox_inches='tight',
                    facecolor='#1e1e1e', format='jpeg')
        plt.close()
        
        # Buildings covered chart
        fig, ax = plt.subplots(figsize=(12, 8))
        
        buildings_existing = [stats['total_buildings_covered'] - stats['new_buildings_covered'] 
                             for stats in coverage_stats.values()]
        buildings_total = [stats['total_buildings_covered'] for stats in coverage_stats.values()]
        
        x = np.arange(len(radii))
        width = 0.35
        
        bars1 = ax.bar(x - width/2, buildings_existing, width, label='Existing Shelters (713)',
                      color='#ff6b6b', alpha=0.8)
        bars2 = ax.bar(x + width/2, buildings_total, width, label='+ 500 Optimal Locations (1213)',
                      color='#4ecdc4', alpha=0.8)
        
        ax.set_xlabel('Coverage Radius (meters)', fontsize=14, fontweight='bold')
        ax.set_ylabel('Buildings Covered', fontsize=14, fontweight='bold')
        ax.set_title('Number of Buildings Covered by Radius', fontsize=20, fontweight='bold', pad=20)
        ax.set_xticks(x)
        ax.set_xticklabels([f'{r}m' for r in radii])
        ax.legend(fontsize=12)
        ax.grid(True, alpha=0.3, axis='y')
        
        # Add value labels on bars with matching colors
        for bar in bars1:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height + 100,
                    f'{int(height):,}', ha='center', va='bottom',
                    fontweight='bold', fontsize=10, color='#ff6b6b')

        for bar in bars2:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height + 100,
                    f'{int(height):,}', ha='center', va='bottom',
                    fontweight='bold', fontsize=10, color='#4ecdc4')

        plt.tight_layout()
        plt.savefig('output/04_buildings_covered.jpg', dpi=300, bbox_inches='tight',
                    facecolor='#1e1e1e', format='jpeg')
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


def create_buildings_per_shelter_comparison():
    """Compare buildings per shelter: existing vs optimal locations"""
    print("Creating buildings per shelter comparison chart...")

    coverage_radii = [100, 150, 200, 250, 300]

    # Load existing shelter coverage stats
    try:
        with open('data/shelter_coverage_precomputed.json', 'r') as f:
            existing_data = json.load(f)
            existing_stats = existing_data['summary_statistics']
    except FileNotFoundError:
        print("Shelter coverage precomputed data not found, skipping comparison chart")
        return

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
                    # Use centroid approximation (first coord of first ring)
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

    # Load optimal shelter locations and recalculate coverage against ALL buildings
    optimal_avg = []
    radii = []

    for radius in coverage_radii:
        try:
            with open(f'data/optimal_locations/optimal_shelters_{radius}m.json', 'r') as f:
                data = json.load(f)
                locations = data['optimal_locations']

                if building_coords and len(locations) > 0:
                    # Recalculate coverage against ALL buildings
                    radius_deg = radius / 100000  # Convert meters to degrees
                    shelter_coords = [[loc['lon'], loc['lat']] for loc in locations]
                    coverages = calculate_actual_coverage(shelter_coords, building_coords, radius_deg)
                    avg_coverage = np.mean(coverages)
                else:
                    # Fall back to stored metric
                    avg_coverage = data['statistics']['avg_buildings_per_new_shelter']

                optimal_avg.append(avg_coverage)
                radii.append(radius)
        except FileNotFoundError:
            print(f"Optimal locations data for {radius}m not found")
            continue

    if not radii:
        print("No optimal location data found, skipping comparison chart")
        return

    # Extract existing shelter stats
    existing_avg = [existing_stats[f'{r}m']['average_buildings_per_shelter'] for r in radii]

    # Create grouped bar chart
    fig, ax = plt.subplots(figsize=(12, 8))

    x = np.arange(len(radii))
    width = 0.35

    bars1 = ax.bar(x - width/2, existing_avg, width, label='Existing Shelters (713)',
                   color='#ff6b6b', alpha=0.9)
    bars2 = ax.bar(x + width/2, optimal_avg, width, label='Optimal Locations (500)',
                   color='#4ecdc4', alpha=0.9)

    ax.set_xlabel('Coverage Radius (meters)', fontsize=14, fontweight='bold')
    ax.set_ylabel('Average Buildings per Shelter', fontsize=14, fontweight='bold')
    ax.set_title('Shelter Efficiency: Existing vs Optimal Locations', fontsize=20, fontweight='bold', pad=20)
    ax.set_xticks(x)
    ax.set_xticklabels([f'{r}m' for r in radii])
    ax.legend(fontsize=12, loc='upper left')
    ax.grid(True, alpha=0.3, axis='y')

    # Add value labels on bars
    for bar in bars1:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.5,
                f'{height:.1f}', ha='center', va='bottom',
                fontweight='bold', fontsize=10, color='#ff6b6b')

    for bar in bars2:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.5,
                f'{height:.1f}', ha='center', va='bottom',
                fontweight='bold', fontsize=10, color='#4ecdc4')

    plt.tight_layout()
    plt.savefig('output/05_buildings_per_shelter.jpg', dpi=300, bbox_inches='tight',
                facecolor='#1e1e1e', format='jpeg')
    plt.close()


def main():
    """Main function to generate all visualizations"""
    print("=== SHELTER STATISTICS GENERATOR ===")
    print("Built Shelters Only (Matching Application) | Dark Theme | JPEG Output")

    # Ensure output directory exists
    ensure_output_dir()

    # Load data (only Built shelters, matching application behavior)
    df = load_shelter_data()

    # Analyze data
    total_count = analyze_shelter_counts(df)
    _, type_counts, source_counts = analyze_built_shelters(df)

    # Create individual charts
    print("\n=== GENERATING INDIVIDUAL CHARTS ===")
    create_shelter_types_chart(type_counts)
    create_source_files_chart(source_counts)
    create_coverage_analysis()
    create_buildings_per_shelter_comparison()

    print("\n=== GENERATION COMPLETE ===")
    print("Generated individual chart files in output/ directory:")
    print("- 01_shelter_types.jpg")
    print("- 02_data_sources.jpg")
    print("- 03_coverage_analysis.jpg")
    print("- 04_buildings_covered.jpg")
    print("- 05_buildings_per_shelter.jpg")

if __name__ == "__main__":
    main() 