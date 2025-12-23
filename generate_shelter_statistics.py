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
    """Load shelter data from GeoJSON file"""
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
    print(f"Loaded {len(df)} shelter records")
    return df

def analyze_shelter_counts(df):
    """Analyze basic shelter counts"""
    print("\n=== SHELTER COUNTS ANALYSIS ===")
    
    # Count by status
    status_counts = df['status'].value_counts()
    print(f"Built shelters: {status_counts.get('Built', 0)}")
    print(f"Requested shelters: {status_counts.get('Request', 0)}")
    print(f"Total shelters: {len(df)}")
    
    return status_counts

def analyze_built_shelters(df):
    """Detailed analysis of built shelters"""
    print("\n=== BUILT SHELTERS ANALYSIS ===")
    
    built_shelters = df[df['status'] == 'Built'].copy()
    print(f"Total built shelters: {len(built_shelters)}")
    
    # Clean up shelter types
    built_shelters['shelter_type'] = built_shelters['shelter_type'].fillna('Unknown')
    built_shelters['shelter_type'] = built_shelters['shelter_type'].str.strip()
    
    # Analyze by type
    type_counts = built_shelters['shelter_type'].value_counts()
    print(f"\nShelter types:")
    for shelter_type, count in type_counts.items():
        print(f"  {shelter_type}: {count}")
    
    # Analyze by source
    source_counts = built_shelters['source_file'].value_counts()
    print(f"\nSource files:")
    for source, count in source_counts.items():
        print(f"  {source}: {count}")
    
    # Analyze by organization
    org_counts = built_shelters['installation_org'].fillna('Unknown').value_counts()
    print(f"\nInstallation organizations:")
    for org, count in org_counts.head(10).items():
        print(f"  {org}: {count}")
    
    return built_shelters, type_counts, source_counts, org_counts

def create_status_overview(df):
    """Create overall status distribution chart"""
    print("Creating status overview chart...")
    
    fig, ax = plt.subplots(figsize=(10, 8))
    
    status_counts = df['status'].value_counts()
    colors = ['#00d4ff', '#ff6b6b', '#4ecdc4']
    
    wedges, texts, autotexts = ax.pie(
        status_counts.values, 
        labels=status_counts.index, 
        autopct='%1.1f%%',
        colors=colors,
        startangle=90,
        textprops={'fontsize': 14, 'color': 'white'},
        wedgeprops={'linewidth': 2, 'edgecolor': '#555555'}
    )
    
    ax.set_title('Shelter Status Distribution', fontsize=20, fontweight='bold', pad=20)
    
    # Add count annotations
    for i, (label, count) in enumerate(status_counts.items()):
        texts[i].set_text(f'{label}\n({count:,})')
        texts[i].set_fontsize(16)
        texts[i].set_fontweight('bold')
    
    plt.tight_layout()
    plt.savefig('output/01_status_overview.jpg', dpi=300, bbox_inches='tight', 
                facecolor='#1e1e1e', format='jpeg')
    plt.close()

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
    plt.savefig('output/02_shelter_types.jpg', dpi=300, bbox_inches='tight', 
                facecolor='#1e1e1e', format='jpeg')
    plt.close()

def create_source_files_chart(source_counts):
    """Create source files distribution chart"""
    print("Creating source files chart...")
    
    fig, ax = plt.subplots(figsize=(10, 8))
    
    # Clean up source names for display
    source_display = {}
    for source in source_counts.index:
        if 'prot_ed' in source:
            source_display[source] = 'Protected Education'
        elif 'school' in source:
            source_display[source] = 'School Shelters'
        elif 'existing' in source:
            source_display[source] = 'Existing Shelters'
        elif 'village' in source:
            source_display[source] = 'Village Shelters'
        elif 'Lobna' in source:
            source_display[source] = 'Lobna Data'
        elif 'הסעה' in source:
            source_display[source] = 'Transportation'
        else:
            source_display[source] = source[:25] + '...' if len(source) > 25 else source
    
    colors = plt.cm.Set2(np.linspace(0, 1, len(source_counts)))
    wedges, texts, autotexts = ax.pie(
        source_counts.values, 
        labels=[source_display[k] for k in source_counts.index],
        autopct='%1.1f%%',
        colors=colors,
        startangle=90,
        textprops={'fontsize': 12, 'color': 'white'},
        wedgeprops={'linewidth': 2, 'edgecolor': '#555555'}
    )
    
    ax.set_title('Built Shelters by Source File', fontsize=20, fontweight='bold', pad=20)
    
    plt.tight_layout()
    plt.savefig('output/03_source_files.jpg', dpi=300, bbox_inches='tight', 
                facecolor='#1e1e1e', format='jpeg')
    plt.close()

def create_organizations_chart(org_counts):
    """Create installation organizations chart"""
    print("Creating organizations chart...")
    
    fig, ax = plt.subplots(figsize=(12, 8))
    
    # Replace null values and clean up names
    org_display = {}
    for org in org_counts.index:
        if pd.isna(org) or org == 'Unknown':
            org_display[org] = 'Unknown/Unspecified'
        elif 'התנועה האיסלאמית' in str(org):
            org_display[org] = 'Islamic Movement'
        elif 'פיקוד העורף' in str(org):
            org_display[org] = 'Home Front Command'
        elif len(str(org)) > 40:
            org_display[org] = str(org)[:40] + '...'
        else:
            org_display[org] = str(org)
    
    # Get top 6 to avoid crowding
    top_orgs = org_counts.head(6)
    colors = plt.cm.viridis(np.linspace(0, 1, len(top_orgs)))
    bars = ax.barh(range(len(top_orgs)), top_orgs.values, color=colors)
    
    ax.set_yticks(range(len(top_orgs)))
    ax.set_yticklabels([org_display[org] for org in top_orgs.index], fontsize=12)
    ax.set_xlabel('Number of Shelters', fontsize=14, fontweight='bold')
    ax.set_title('Built Shelters by Installation Organization', fontsize=20, fontweight='bold', pad=20)
    
    # Add value labels
    for i, (bar, value) in enumerate(zip(bars, top_orgs.values)):
        ax.text(bar.get_width() + 2, bar.get_y() + bar.get_height()/2, 
                str(value), ha='left', va='center', fontweight='bold', fontsize=11)
    
    ax.grid(True, alpha=0.3, axis='x')
    plt.tight_layout()
    plt.savefig('output/04_organizations.jpg', dpi=300, bbox_inches='tight', 
                facecolor='#1e1e1e', format='jpeg')
    plt.close()

def create_villages_chart(built_shelters):
    """Create geographic distribution by village chart"""
    print("Creating villages chart...")
    
    fig, ax = plt.subplots(figsize=(12, 8))
    
    village_counts = built_shelters['village_english'].fillna('Unknown').value_counts()
    # Filter out unknown/empty values and get top villages
    village_counts_clean = village_counts[~village_counts.index.isin(['Unknown', '', ' '])]
    top_villages = village_counts_clean.head(10)
    
    colors = plt.cm.plasma(np.linspace(0, 1, len(top_villages)))
    bars = ax.barh(range(len(top_villages)), top_villages.values, color=colors)
    
    ax.set_yticks(range(len(top_villages)))
    ax.set_yticklabels(top_villages.index, fontsize=12)
    ax.set_xlabel('Number of Shelters', fontsize=14, fontweight='bold')
    ax.set_title('Built Shelters by Village\n(Top 10 with Known Names)', fontsize=20, fontweight='bold', pad=20)
    
    # Add value labels
    for i, (bar, value) in enumerate(zip(bars, top_villages.values)):
        ax.text(bar.get_width() + 0.1, bar.get_y() + bar.get_height()/2, 
                str(value), ha='left', va='center', fontweight='bold', fontsize=11)
    
    ax.grid(True, alpha=0.3, axis='x')
    plt.tight_layout()
    plt.savefig('output/05_villages.jpg', dpi=300, bbox_inches='tight', 
                facecolor='#1e1e1e', format='jpeg')
    plt.close()

def create_timeline_chart(built_shelters):
    """Create installation timeline chart"""
    print("Creating timeline chart...")
    
    fig, ax = plt.subplots(figsize=(12, 8))
    
    # Convert install_date to datetime
    built_with_dates = built_shelters[built_shelters['install_date'].notna()].copy()
    
    if len(built_with_dates) > 0:
        built_with_dates['install_datetime'] = pd.to_datetime(built_with_dates['install_date'], unit='ms')
        built_with_dates['install_year'] = built_with_dates['install_datetime'].dt.year
        
        year_counts = built_with_dates['install_year'].value_counts().sort_index()
        
        bars = ax.bar(year_counts.index, year_counts.values, color='#00d4ff', edgecolor='#555555', linewidth=1)
        ax.set_xlabel('Installation Year', fontsize=14, fontweight='bold')
        ax.set_ylabel('Number of Shelters', fontsize=14, fontweight='bold')
        ax.set_title(f'Shelter Installation Timeline\n({len(built_with_dates):,} shelters with known dates)', 
                     fontsize=20, fontweight='bold', pad=20)
        
        # Add value labels on bars
        for year, count in year_counts.items():
            ax.text(year, count + 0.5, str(count), ha='center', va='bottom', 
                   fontweight='bold', fontsize=11)
        
        ax.grid(True, alpha=0.3, axis='y')
    else:
        ax.text(0.5, 0.5, 'No installation date data available', 
                ha='center', va='center', transform=ax.transAxes, fontsize=16,
                bbox=dict(boxstyle="round,pad=0.5", facecolor="#404040", alpha=0.8))
        ax.set_title('Shelter Installation Timeline\n(No Date Data)', fontsize=20, fontweight='bold', pad=20)
    
    plt.tight_layout()
    plt.savefig('output/06_timeline.jpg', dpi=300, bbox_inches='tight', 
                facecolor='#1e1e1e', format='jpeg')
    plt.close()

def create_categories_chart(built_shelters):
    """Create shelter categories chart"""
    print("Creating categories chart...")
    
    fig, ax = plt.subplots(figsize=(10, 8))
    
    # Create a more detailed type analysis
    type_categories = {
        'Educational': ['Education'],
        'Transportation': ['Transportation Station Shelter', 'Transportation Station Shelter (Dispersed Areas)'],
        'Infrastructure': ['Concrete Pipes', 'HESCO Barriers', 'MAMAD (Reinforced Room)'],
        'Community': ['Village Shelter'],
        'Other': ['Lobna Shelter Data', ' ', '']
    }
    
    category_counts = {}
    for category, types in type_categories.items():
        count = built_shelters[built_shelters['shelter_type'].isin(types)]['shelter_type'].count()
        if count > 0:
            category_counts[category] = count
    
    if category_counts:
        colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7b801', '#a8e6cf']
        wedges, texts, autotexts = ax.pie(
            category_counts.values(), 
            labels=category_counts.keys(),
            autopct='%1.1f%%',
            colors=colors,
            startangle=90,
            textprops={'fontsize': 14, 'color': 'white'},
            wedgeprops={'linewidth': 2, 'edgecolor': '#555555'}
        )
        
        # Add count annotations
        for i, (label, count) in enumerate(category_counts.items()):
            texts[i].set_text(f'{label}\n({count:,})')
            texts[i].set_fontsize(14)
            texts[i].set_fontweight('bold')
        
        ax.set_title('Built Shelters by Category\n(Grouped by Purpose)', fontsize=20, fontweight='bold', pad=20)
    
    plt.tight_layout()
    plt.savefig('output/07_categories.jpg', dpi=300, bbox_inches='tight', 
                facecolor='#1e1e1e', format='jpeg')
    plt.close()

def create_summary_stats(df, built_shelters, type_counts, source_counts, org_counts):
    """Create summary statistics chart"""
    print("Creating summary statistics chart...")
    
    fig, ax = plt.subplots(figsize=(12, 8))
    ax.axis('off')
    
    # Calculate some additional stats
    village_counts = built_shelters['village_english'].fillna('Unknown').value_counts()
    village_counts_clean = village_counts[~village_counts.index.isin(['Unknown', '', ' '])]
    
    # Create summary text
    summary_text = f"""
SHELTER STATISTICS SUMMARY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OVERVIEW
  Total Shelters: {len(df):,}
  Built Shelters: {len(built_shelters):,}
  Requested Shelters: {len(df) - len(built_shelters):,}

BUILT SHELTERS BREAKDOWN
  Most Common Type: {type_counts.index[0]} ({type_counts.iloc[0]:,} shelters)
  Primary Source: {source_counts.index[0]} ({source_counts.iloc[0]:,} shelters)
  Main Organization: {org_counts.index[0]} ({org_counts.iloc[0]:,} shelters)

GEOGRAPHIC DISTRIBUTION
  Villages with Named Shelters: {len(village_counts_clean):,}
  Total Organizations Involved: {len(org_counts[org_counts > 0]):,}
  Data Sources: {len(source_counts):,}

SHELTER TYPES
  Educational Facilities: {type_counts.get('Education', 0):,}
  Transportation Stations: {type_counts.get('Transportation Station Shelter', 0):,}
  Infrastructure (Concrete/HESCO): {type_counts.get('Concrete Pipes', 0) + type_counts.get('HESCO Barriers', 0):,}
  Village Community Shelters: {type_counts.get('Village Shelter', 0):,}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    """
    
    ax.text(0.05, 0.95, summary_text, transform=ax.transAxes, fontsize=13,
            verticalalignment='top', fontfamily='monospace', color='white',
            bbox=dict(boxstyle="round,pad=1", facecolor="#2d2d2d", alpha=0.9, edgecolor='#555555'))
    
    plt.tight_layout()
    plt.savefig('output/08_summary_stats.jpg', dpi=300, bbox_inches='tight', 
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
        
        ax.plot(radii, existing_coverage, 'o-', label='Existing Shelters Only', 
                linewidth=3, markersize=10, color='#ff6b6b')
        ax.plot(radii, total_coverage, 's-', label='With Optimal Additions', 
                linewidth=3, markersize=10, color='#4ecdc4')
        
        ax.set_xlabel('Coverage Radius (meters)', fontsize=14, fontweight='bold')
        ax.set_ylabel('Building Coverage (%)', fontsize=14, fontweight='bold')
        ax.set_title('Shelter Coverage Analysis by Radius', fontsize=20, fontweight='bold', pad=20)
        ax.legend(fontsize=12)
        ax.grid(True, alpha=0.3)
        
        # Add value labels
        for i, (r, existing, total) in enumerate(zip(radii, existing_coverage, total_coverage)):
            ax.text(r, existing - 1.5, f'{existing:.1f}%', ha='center', va='top', 
                   fontsize=10, fontweight='bold', color='#ff6b6b')
            ax.text(r, total + 1, f'{total:.1f}%', ha='center', va='bottom', 
                   fontsize=10, fontweight='bold', color='#4ecdc4')
        
        plt.tight_layout()
        plt.savefig('output/09_coverage_analysis.jpg', dpi=300, bbox_inches='tight', 
                    facecolor='#1e1e1e', format='jpeg')
        plt.close()
        
        # Buildings covered chart
        fig, ax = plt.subplots(figsize=(12, 8))
        
        buildings_existing = [stats['total_buildings_covered'] - stats['new_buildings_covered'] 
                             for stats in coverage_stats.values()]
        buildings_total = [stats['total_buildings_covered'] for stats in coverage_stats.values()]
        
        x = np.arange(len(radii))
        width = 0.35
        
        bars1 = ax.bar(x - width/2, buildings_existing, width, label='Existing Shelters', 
                      color='#ff6b6b', alpha=0.8)
        bars2 = ax.bar(x + width/2, buildings_total, width, label='With Optimal Additions', 
                      color='#4ecdc4', alpha=0.8)
        
        ax.set_xlabel('Coverage Radius (meters)', fontsize=14, fontweight='bold')
        ax.set_ylabel('Buildings Covered', fontsize=14, fontweight='bold')
        ax.set_title('Number of Buildings Covered by Radius', fontsize=20, fontweight='bold', pad=20)
        ax.set_xticks(x)
        ax.set_xticklabels([f'{r}m' for r in radii])
        ax.legend(fontsize=12)
        ax.grid(True, alpha=0.3, axis='y')
        
        # Add value labels on bars
        for bars in [bars1, bars2]:
            for bar in bars:
                height = bar.get_height()
                ax.text(bar.get_x() + bar.get_width()/2., height + 100,
                       f'{int(height):,}', ha='center', va='bottom', 
                       fontweight='bold', fontsize=10)
        
        plt.tight_layout()
        plt.savefig('output/10_buildings_covered.jpg', dpi=300, bbox_inches='tight', 
                    facecolor='#1e1e1e', format='jpeg')
        plt.close()

def main():
    """Main function to generate all visualizations"""
    print("=== SHELTER STATISTICS GENERATOR ===")
    print("Dark Theme | Individual Charts | JPEG Output")
    
    # Ensure output directory exists
    ensure_output_dir()
    
    # Load data
    df = load_shelter_data()
    
    # Analyze data
    status_counts = analyze_shelter_counts(df)
    built_shelters, type_counts, source_counts, org_counts = analyze_built_shelters(df)
    
    # Create individual charts
    print("\n=== GENERATING INDIVIDUAL CHARTS ===")
    create_status_overview(df)
    create_shelter_types_chart(type_counts)
    create_source_files_chart(source_counts)
    create_organizations_chart(org_counts)
    create_villages_chart(built_shelters)
    create_timeline_chart(built_shelters)
    create_categories_chart(built_shelters)
    create_summary_stats(df, built_shelters, type_counts, source_counts, org_counts)
    create_coverage_analysis()
    
    print("\n=== GENERATION COMPLETE ===")
    print("Generated individual chart files in output/ directory:")
    print("- 01_status_overview.jpg")
    print("- 02_shelter_types.jpg")
    print("- 03_source_files.jpg")
    print("- 04_organizations.jpg")
    print("- 05_villages.jpg")
    print("- 06_timeline.jpg")
    print("- 07_categories.jpg")
    print("- 08_summary_stats.jpg")
    print("- 09_coverage_analysis.jpg")
    print("- 10_buildings_covered.jpg")

if __name__ == "__main__":
    main() 