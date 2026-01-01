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

    if len(source_counts) == 0:
        print("  Skipping data source chart (no data_source field available)")
        return

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

def create_accessibility_coverage_progression():
    """Create visualization showing coverage progression by accessibility level"""
    print("Creating accessibility coverage progression chart...")
    
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
                    # Use centroid approximation
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
        return
    
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
                    existing_shelters.append([coords[0], coords[1]])  # lon, lat
        print(f"Loaded {len(existing_shelters)} existing shelter coordinates")
    except FileNotFoundError:
        print("Shelters data not found, using empty existing shelters")
        existing_shelters = []
    
    # Calculate coverage progression for each radius
    radius_data = {}
    max_shelters = 0
    
    for radius in coverage_radii:
        try:
            with open(f'data/optimal_locations/optimal_shelters_{radius}m.json', 'r') as f:
                data = json.load(f)
                optimal_locations = data['optimal_locations']
                
                # Filter to only new optimal locations (not existing)
                optimal_shelters = []
                for loc in optimal_locations:
                    if loc.get('type') != 'existing':
                        optimal_shelters.append([loc['lon'], loc['lat']])
                
                # Limit to first 500 optimal shelters for performance
                optimal_shelters = optimal_shelters[:500]
                
                radius_deg = radius / 100000  # Convert meters to degrees
                coverage_progression = calculate_incremental_coverage(
                    building_coords, existing_shelters, optimal_shelters, radius_deg
                )
                
                radius_data[radius] = {
                    'coverage': coverage_progression,
                    'num_shelters': len(optimal_shelters)
                }
                
                max_shelters = max(max_shelters, len(optimal_shelters))
                print(f"  {radius}m: {len(optimal_shelters)} optimal shelters, "
                      f"final coverage: {coverage_progression[-1]:.1f}%")
        except FileNotFoundError:
            print(f"Optimal locations data for {radius}m not found")
            continue
    
    if not radius_data:
        print("No optimal location data found, skipping accessibility coverage chart")
        return
    
    # Create the visualization
    fig, ax = plt.subplots(figsize=(14, 9))
    
    # Colors for each accessibility level
    colors = {
        100: '#ff6b6b',  # Red
        150: '#ffa500',  # Orange
        200: '#ffd93d',  # Yellow
        250: '#6bcf7f',  # Light green
        300: '#4ecdc4'   # Teal
    }
    
    # Plot lines for each radius
    for radius in coverage_radii:
        if radius not in radius_data:
            continue
        
        data = radius_data[radius]
        coverage = data['coverage']
        num_shelters = len(coverage) - 1  # Subtract 1 for initial (existing shelters)
        
        # X-axis: number of shelters (0 = existing only, then 1, 2, 3...)
        x_values = list(range(num_shelters + 1))
        
        # Plot the line
        ax.plot(x_values, coverage, '-', linewidth=2.5,
                label=f'{radius}m', color=colors[radius], alpha=0.9)
    
    ax.set_xlabel('Number of Shelters Added', fontsize=14, fontweight='bold')
    ax.set_ylabel('Coverage Percentage (%)', fontsize=14, fontweight='bold')
    ax.set_title('Coverage Progression by Accessibility Level', fontsize=20, fontweight='bold', pad=20)
    ax.legend(fontsize=12, loc='lower right')
    ax.grid(True, alpha=0.3)
    ax.set_ylim([0, 105])
    
    plt.tight_layout()
    plt.savefig('output/06_accessibility_coverage_progression.jpg', dpi=300, bbox_inches='tight',
                facecolor='#1e1e1e', format='jpeg')
    plt.close()

def create_combined_journal_panel():
    """Create a combined full-page panel with charts 3, 5, and 6 for journal article"""
    print("Creating combined journal panel (charts 3, 5, 6)...")
    
    coverage_radii = [100, 150, 200, 250, 300]
    
    # Create figure with 3 subplots stacked vertically
    # Journal article format: 7.5 inches wide (single column) or 6.5 inches (two-column)
    # Full page height: ~10 inches
    fig = plt.figure(figsize=(7.5, 10))
    gs = fig.add_gridspec(3, 1, hspace=0.35, top=0.97, bottom=0.08, left=0.12, right=0.95)
    
    # ===== CHART 3: Coverage Analysis by Radius =====
    ax1 = fig.add_subplot(gs[0, 0])
    
    coverage_stats = {}
    for radius in coverage_radii:
        try:
            with open(f'data/optimal_locations/optimal_shelters_{radius}m.json', 'r') as f:
                data = json.load(f)
                coverage_stats[radius] = data['statistics']
        except FileNotFoundError:
            continue
    
    if coverage_stats:
        radii = list(coverage_stats.keys())
        existing_coverage = [stats['coverage_percentage'] - 
                           (stats['new_buildings_covered'] / stats['total_buildings'] * 100) 
                           for stats in coverage_stats.values()]
        total_coverage = [stats['coverage_percentage'] for stats in coverage_stats.values()]
        
        ax1.plot(radii, existing_coverage, 'o-', label='Existing Shelters',
                linewidth=2.5, markersize=8, color='#ff6b6b')
        ax1.plot(radii, total_coverage, 's-', label='+ 500 Optimal Locations',
                linewidth=2.5, markersize=8, color='#4ecdc4')
        
        ax1.set_xlabel('Coverage Radius (meters)', fontsize=11, fontweight='bold')
        ax1.set_ylabel('Building Coverage (%)', fontsize=11, fontweight='bold')
        ax1.set_title('(A) Shelter Coverage Analysis by Radius', fontsize=13, fontweight='bold', pad=12)
        ax1.set_xticks(radii)
        ax1.legend(fontsize=10, loc='best')
        ax1.grid(True, alpha=0.3)
        
        # Add value labels
        for i, (r, existing, total) in enumerate(zip(radii, existing_coverage, total_coverage)):
            ax1.text(r, existing - 1.5, f'{existing:.1f}%', ha='center', va='top', 
                   fontsize=9, fontweight='bold', color='#ff6b6b')
            ax1.text(r, total + 1, f'{total:.1f}%', ha='center', va='bottom', 
                   fontsize=9, fontweight='bold', color='#4ecdc4')
    
    # ===== CHART 5: Buildings per Shelter Comparison =====
    ax2 = fig.add_subplot(gs[1, 0])
    
    try:
        with open('data/shelter_coverage_precomputed.json', 'r') as f:
            existing_data = json.load(f)
            existing_stats = existing_data['summary_statistics']
        
        # Load building coordinates for recalculating optimal coverage
        building_coords = None
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
            pass
        
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
                continue
        
        if radii:
            existing_avg = [existing_stats[f'{r}m']['average_buildings_per_shelter'] for r in radii]
            
            x = np.arange(len(radii))
            width = 0.35
            
            bars1 = ax2.bar(x - width/2, existing_avg, width, label='Existing Shelters',
                           color='#ff6b6b', alpha=0.9)
            bars2 = ax2.bar(x + width/2, optimal_avg, width, label='Optimal Locations',
                           color='#4ecdc4', alpha=0.9)
            
            ax2.set_xlabel('Coverage Radius (meters)', fontsize=11, fontweight='bold')
            ax2.set_ylabel('Average Buildings per Shelter', fontsize=11, fontweight='bold')
            ax2.set_title('(B) Shelter Efficiency: Existing vs Optimal Locations', fontsize=13, fontweight='bold', pad=12)
            ax2.set_xticks(x)
            ax2.set_xticklabels([f'{r}m' for r in radii])
            ax2.legend(fontsize=10, loc='upper left')
            ax2.grid(True, alpha=0.3, axis='y')
            
            # Add value labels on bars
            for bar in bars1:
                height = bar.get_height()
                ax2.text(bar.get_x() + bar.get_width()/2., height + 0.5,
                        f'{height:.1f}', ha='center', va='bottom',
                        fontweight='bold', fontsize=9, color='#ff6b6b')
            
            for bar in bars2:
                height = bar.get_height()
                ax2.text(bar.get_x() + bar.get_width()/2., height + 0.5,
                        f'{height:.1f}', ha='center', va='bottom',
                        fontweight='bold', fontsize=9, color='#4ecdc4')
    except FileNotFoundError:
        pass
    
    # ===== CHART 6: Accessibility Coverage Progression =====
    ax3 = fig.add_subplot(gs[2, 0])
    
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
        
        # Load existing shelter coordinates
        existing_shelters = []
        try:
            with open('data/shelters.geojson', 'r', encoding='utf-8') as f:
                shelters_data = json.load(f)
                for feature in shelters_data['features']:
                    props = feature['properties']
                    status = props.get('status', '').strip()
                    if status.startswith('Built'):
                        coords = feature['geometry']['coordinates']
                        existing_shelters.append([coords[0], coords[1]])
        except FileNotFoundError:
            pass
        
        # Calculate coverage progression for each radius
        radius_data = {}
        colors = {
            100: '#ff6b6b',
            150: '#ffa500',
            200: '#ffd93d',
            250: '#6bcf7f',
            300: '#4ecdc4'
        }
        
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
            except FileNotFoundError:
                continue
        
        # Plot lines for each radius
        for radius in coverage_radii:
            if radius not in radius_data:
                continue
            
            data = radius_data[radius]
            coverage = data['coverage']
            num_shelters = len(coverage) - 1
            x_values = list(range(num_shelters + 1))
            
            ax3.plot(x_values, coverage, '-', linewidth=2.5,
                    label=f'{radius}m', color=colors[radius], alpha=0.9)
        
        ax3.set_xlabel('Number of Shelters Added', fontsize=11, fontweight='bold')
        ax3.set_ylabel('Coverage Percentage (%)', fontsize=11, fontweight='bold')
        ax3.set_title('(C) Coverage Progression by Accessibility Level', fontsize=13, fontweight='bold', pad=12)
        ax3.legend(fontsize=10, loc='lower right')
        ax3.grid(True, alpha=0.3)
        ax3.set_ylim([0, 105])
    except FileNotFoundError:
        pass
    
    # Save the combined figure
    plt.savefig('output/07_combined_journal_panel.jpg', dpi=300, bbox_inches='tight',
                facecolor='#1e1e1e', format='jpeg')
    plt.close()
    print("  Saved combined journal panel to output/07_combined_journal_panel.jpg")

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
    create_accessibility_coverage_progression()
    
    # Create combined journal panel
    print("\n=== GENERATING COMBINED JOURNAL PANEL ===")
    create_combined_journal_panel()

    print("\n=== GENERATION COMPLETE ===")
    print("Generated individual chart files in output/ directory:")
    print("- 01_shelter_types.jpg")
    print("- 02_data_sources.jpg")
    print("- 03_coverage_analysis.jpg")
    print("- 04_buildings_covered.jpg")
    print("- 05_buildings_per_shelter.jpg")
    print("- 06_accessibility_coverage_progression.jpg")
    print("- 07_combined_journal_panel.jpg (Charts 3, 5, 6 combined)")

if __name__ == "__main__":
    main() 