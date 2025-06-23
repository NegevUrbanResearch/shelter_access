#!/usr/bin/env python3
"""
Simple DBSCAN + Greedy Shelter Optimizer with Multi-Radius and Planned Shelter Logic
Finds optimal shelter locations using a three-step approach:
1. DBSCAN to find dense building clusters
2. Get cluster centroids as candidates  
3. Greedy selection with non-overlapping constraint

Supports multiple radii and planned shelter scenarios.
"""

import json
import numpy as np
from sklearn.cluster import DBSCAN
from tqdm import tqdm
import os

class SimpleShelterOptimizer:
    def __init__(self):
        self.PEOPLE_PER_BUILDING = 7
        self.TARGET_SHELTERS = 150    # Reduced to 150 as requested
        self.RADII_TO_TEST = [100, 150, 200, 250, 300]  # Multiple radii to test
        self.MIN_BUILDINGS_PER_CLUSTER = 5  # Minimum buildings to consider a cluster viable
        
    def load_geojson(self, filepath):
        """Load GeoJSON and extract coordinates"""
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        coordinates = []
        for feature in data['features']:
            if feature['geometry']['type'] == 'Point':
                lon, lat = feature['geometry']['coordinates']
                coordinates.append([lat, lon])  # Note: lat, lon for distance calculations
        
        return np.array(coordinates), data['features']
    
    def meters_to_degrees(self, meters, lat=31.5):
        """Convert meters to approximate degrees at given latitude (Israel region)"""
        lat_deg_per_meter = 1 / 111000
        lon_deg_per_meter = 1 / (111000 * np.cos(np.radians(lat)))
        return meters * lat_deg_per_meter, meters * lon_deg_per_meter
    
    def process_existing_shelters(self, shelter_features, include_planned=False):
        """Process existing and planned shelters from GeoJSON"""
        existing_shelters = []
        planned_shelters = []
        existing_shelter_data = []
        planned_shelter_data = []
        
        for shelter in shelter_features:
            is_planned = shelter['properties'].get('type') == 'planned'
            coords = shelter['geometry']['coordinates']
            shelter_coord = [coords[1], coords[0]]  # lat, lon
            
            shelter_info = {
                'lat': float(coords[1]),
                'lon': float(coords[0]),
                'type': 'planned' if is_planned else 'existing',
                'properties': shelter['properties']
            }
            
            if is_planned:
                planned_shelters.append(shelter_coord)
                planned_shelter_data.append(shelter_info)
            else:
                existing_shelters.append(shelter_coord)
                existing_shelter_data.append(shelter_info)
        
        existing_shelters = np.array(existing_shelters) if existing_shelters else np.empty((0, 2))
        planned_shelters = np.array(planned_shelters) if planned_shelters else np.empty((0, 2))
        
        # Determine which shelters to treat as "active" for coverage filtering
        active_shelters = existing_shelters.copy() if len(existing_shelters) > 0 else np.empty((0, 2))
        if include_planned and len(planned_shelters) > 0:
            active_shelters = np.vstack([active_shelters, planned_shelters]) if len(active_shelters) > 0 else planned_shelters
        
        return active_shelters, existing_shelter_data, planned_shelter_data
    
    def calculate_shelter_coverage(self, shelter_coords, building_coords, coverage_radius_deg):
        """Calculate how many buildings each shelter covers using vectorized operations"""
        if len(shelter_coords) == 0:
            return []
        
        shelter_coverage = []
        
        for i in range(len(shelter_coords)):
            shelter = shelter_coords[i]
            
            # Vectorized distance calculation
            lat_diff = building_coords[:, 0] - shelter[0]
            lon_diff = building_coords[:, 1] - shelter[1]
            distances_squared = lat_diff**2 + lon_diff**2
            
            # Count buildings within radius (using squared distance to avoid sqrt)
            buildings_covered = np.sum(distances_squared <= coverage_radius_deg**2)
            people_covered = buildings_covered * self.PEOPLE_PER_BUILDING
            
            shelter_coverage.append({
                'buildings_covered': int(buildings_covered),
                'people_covered': int(people_covered)
            })
        
        return shelter_coverage
    
    def filter_existing_coverage(self, building_coords, active_shelters, coverage_radius_deg):
        """Remove buildings already covered by existing/planned shelters"""
        if len(active_shelters) == 0:
            return building_coords, np.arange(len(building_coords))
        
        print(f"    🔍 Filtering buildings already covered by {len(active_shelters)} active shelters...")
        uncovered_mask = np.ones(len(building_coords), dtype=bool)
        
        for shelter in active_shelters:
            # Vectorized distance calculation
            lat_diff = building_coords[:, 0] - shelter[0]
            lon_diff = building_coords[:, 1] - shelter[1]
            distances_squared = lat_diff**2 + lon_diff**2
            
            # Find buildings covered by this shelter
            covered_by_this_shelter = distances_squared <= coverage_radius_deg**2
            uncovered_mask &= ~covered_by_this_shelter
        
        uncovered_buildings = building_coords[uncovered_mask]
        uncovered_indices = np.where(uncovered_mask)[0]
        
        print(f"    ✓ Buildings needing coverage: {len(uncovered_buildings)}/{len(building_coords)}")
        return uncovered_buildings, uncovered_indices
    
    def find_building_clusters(self, building_coords, coverage_radius_m):
        """Step 1: Use DBSCAN to find dense building clusters"""
        print(f"    🏘️  Finding building clusters with DBSCAN...")
        
        # Convert coverage radius to degrees for DBSCAN eps parameter
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        
        # Use coverage radius as eps - clusters will contain buildings within shelter range
        dbscan = DBSCAN(eps=coverage_radius_deg, min_samples=self.MIN_BUILDINGS_PER_CLUSTER)
        cluster_labels = dbscan.fit_predict(building_coords)
        
        # Count clusters and noise points
        unique_labels = set(cluster_labels)
        n_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)
        n_noise = list(cluster_labels).count(-1)
        
        print(f"      ✓ Found {n_clusters} building clusters, {n_noise} noise points")
        
        return cluster_labels
    
    def get_cluster_centroids(self, building_coords, cluster_labels, coverage_radius_m):
        """Step 2: Calculate centroid of each cluster as candidate shelter location"""
        print(f"    📍 Calculating cluster centroids...")
        
        candidates = []
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        
        unique_labels = set(cluster_labels)
        
        for cluster_id in unique_labels:
            if cluster_id == -1:  # Skip noise points
                continue
                
            # Get buildings in this cluster
            cluster_mask = cluster_labels == cluster_id
            cluster_buildings = building_coords[cluster_mask]
            
            # Calculate centroid
            centroid = np.mean(cluster_buildings, axis=0)
            
            # Count buildings actually covered by placing shelter at centroid
            distances = np.sqrt(np.sum((cluster_buildings - centroid) ** 2, axis=1))
            buildings_within_radius = np.sum(distances <= coverage_radius_deg)
            
            # Only keep candidates that cover minimum number of buildings
            if buildings_within_radius >= self.MIN_BUILDINGS_PER_CLUSTER:
                candidates.append({
                    'lat': float(centroid[0]),
                    'lon': float(centroid[1]),
                    'buildings_covered': int(buildings_within_radius),
                    'people_covered': int(buildings_within_radius * self.PEOPLE_PER_BUILDING),
                    'cluster_id': int(cluster_id),
                    'cluster_size': int(len(cluster_buildings))
                })
        
        # Sort candidates by buildings covered (descending)
        candidates.sort(key=lambda x: x['buildings_covered'], reverse=True)
        
        print(f"      ✓ Generated {len(candidates)} candidate locations")
        
        return candidates
    
    def greedy_non_overlapping_selection(self, candidates, coverage_radius_m):
        """Step 3: Greedy selection ensuring minimum separation between shelters"""
        print(f"    🎯 Greedy selection with {coverage_radius_m * 2}m minimum separation...")
        
        if len(candidates) <= self.TARGET_SHELTERS:
            print(f"      ✓ All {len(candidates)} candidates selected (less than target)")
            return candidates
        
        # Minimum separation is 2x coverage radius (no overlap)
        min_separation_m = coverage_radius_m * 2
        min_separation_deg, _ = self.meters_to_degrees(min_separation_m)
        
        selected_shelters = []
        
        for candidate in candidates:
            if len(selected_shelters) >= self.TARGET_SHELTERS:
                break
            
            candidate_coord = np.array([candidate['lat'], candidate['lon']])
            
            # Check if this candidate is far enough from all selected shelters
            too_close = False
            
            for selected in selected_shelters:
                selected_coord = np.array([selected['lat'], selected['lon']])
                distance = np.sqrt(np.sum((candidate_coord - selected_coord) ** 2))
                
                if distance < min_separation_deg:
                    too_close = True
                    break
            
            # If candidate is far enough from all selected shelters, add it
            if not too_close:
                selected_shelters.append(candidate)
        
        print(f"      ✓ Selected {len(selected_shelters)} non-overlapping shelters")
        
        return selected_shelters
    
    def calculate_total_coverage(self, selected_shelters, building_coords, coverage_radius_m):
        """Calculate total building coverage from selected shelters"""
        if not selected_shelters:
            return 0, 0, 0
        
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        covered_buildings = set()
        
        # Find all buildings covered by any shelter
        for shelter in selected_shelters:
            shelter_coord = np.array([shelter['lat'], shelter['lon']])
            
            # Calculate distances to all buildings
            distances = np.sqrt(np.sum((building_coords - shelter_coord) ** 2, axis=1))
            
            # Add covered building indices to set
            covered_indices = np.where(distances <= coverage_radius_deg)[0]
            covered_buildings.update(covered_indices)
        
        total_buildings = len(building_coords)
        buildings_covered = len(covered_buildings)
        people_covered = buildings_covered * self.PEOPLE_PER_BUILDING
        coverage_percentage = (buildings_covered / total_buildings) * 100
        
        return buildings_covered, people_covered, coverage_percentage
    
    def optimize_for_radius_and_scenario(self, building_coords, building_features, 
                                       shelter_features, radius_m, include_planned):
        """Optimize shelter locations for specific radius and planned shelter scenario"""
        
        scenario_name = "with_planned" if include_planned else "without_planned"
        print(f"\n  📊 Scenario: {scenario_name.replace('_', ' ').title()}")
        
        coverage_radius_deg, _ = self.meters_to_degrees(radius_m)
        
        # Process existing and planned shelters
        active_shelters, existing_shelter_data, planned_shelter_data = self.process_existing_shelters(
            shelter_features, include_planned
        )
        
        # Calculate existing shelter coverage if any
        total_people = len(building_features) * self.PEOPLE_PER_BUILDING
        
        if len(active_shelters) > 0:
            existing_coverage = self.calculate_shelter_coverage(active_shelters, building_coords, coverage_radius_deg)
            total_existing_coverage = sum(c['buildings_covered'] for c in existing_coverage)
            
            # Update shelter data with coverage info
            for i, coverage in enumerate(existing_coverage):
                if i < len(existing_shelter_data):
                    existing_shelter_data[i].update(coverage)
                elif i - len(existing_shelter_data) < len(planned_shelter_data):
                    planned_shelter_data[i - len(existing_shelter_data)].update(coverage)
            
            print(f"    📍 Active shelters: {len(active_shelters)} covering {total_existing_coverage} buildings")
        
        # Filter out buildings already covered by active shelters
        uncovered_buildings, uncovered_indices = self.filter_existing_coverage(
            building_coords, active_shelters, coverage_radius_deg
        )
        
        if len(uncovered_buildings) == 0:
            print("    ✅ All buildings already covered by existing shelters!")
            return {
                'radius_m': radius_m,
                'include_planned': include_planned,
                'scenario': scenario_name,
                'optimal_locations': [],
                'existing_shelters': existing_shelter_data,
                'planned_shelters': planned_shelter_data,
                'statistics': {
                    'total_buildings': len(building_features),
                    'total_people': total_people,
                    'shelters_selected': 0,
                    'buildings_covered': len(building_coords),
                    'people_covered': total_people,
                    'coverage_percentage': 100.0,
                    'avg_buildings_per_shelter': 0
                }
            }
        
        # Run optimization on uncovered buildings
        print(f"    🎯 Optimizing for {len(uncovered_buildings)} uncovered buildings...")
        
        # Step 1: Find building clusters
        cluster_labels = self.find_building_clusters(uncovered_buildings, radius_m)
        
        # Step 2: Get cluster centroids as candidates
        candidates = self.get_cluster_centroids(uncovered_buildings, cluster_labels, radius_m)
        
        if not candidates:
            print("    ❌ No viable candidate locations found!")
            return None
        
        # Step 3: Greedy selection with non-overlapping constraint
        selected_shelters = self.greedy_non_overlapping_selection(candidates, radius_m)
        
        # Calculate final coverage statistics
        buildings_covered, people_covered, coverage_percentage = self.calculate_total_coverage(
            selected_shelters, building_coords, radius_m
        )
        
        # Add coverage from existing shelters
        already_covered_buildings = len(building_coords) - len(uncovered_buildings)
        already_covered_people = already_covered_buildings * self.PEOPLE_PER_BUILDING
        
        total_buildings_covered = buildings_covered + already_covered_buildings
        total_people_covered = people_covered + already_covered_people
        total_coverage_percentage = (total_buildings_covered / len(building_coords)) * 100
        
        result = {
            'radius_m': radius_m,
            'include_planned': include_planned,
            'scenario': scenario_name,
            'optimal_locations': selected_shelters,
            'existing_shelters': existing_shelter_data,
            'planned_shelters': planned_shelter_data,
            'statistics': {
                'total_buildings': len(building_features),
                'total_people': total_people,
                'shelters_selected': len(selected_shelters),
                'new_buildings_covered': buildings_covered,
                'new_people_covered': people_covered,
                'total_buildings_covered': total_buildings_covered,
                'total_people_covered': total_people_covered,
                'coverage_percentage': round(total_coverage_percentage, 2),
                'avg_buildings_per_new_shelter': round(buildings_covered / len(selected_shelters), 1) if selected_shelters else 0
            }
        }
        
        print(f"    ✅ Results: {len(selected_shelters)} new shelters, {total_coverage_percentage:.1f}% total coverage")
        
        return result
    
    def run_full_optimization(self, buildings_file, shelters_file, output_dir='data/optimal_locations'):
        """Run optimization for all radii and scenarios"""
        print("🏠 SIMPLE DBSCAN + GREEDY SHELTER OPTIMIZATION")
        print("=" * 70)
        print(f"Target: {self.TARGET_SHELTERS} shelters per scenario")
        print(f"Radii: {self.RADII_TO_TEST} meters")
        print(f"Scenarios: Without planned, With planned")
        print("=" * 70)
        
        # Load data
        print("📁 Loading data...")
        building_coords, building_features = self.load_geojson(buildings_file)
        shelter_coords, shelter_features = self.load_geojson(shelters_file)
        
        print(f"    ✓ Loaded {len(building_features)} buildings")
        print(f"    ✓ Loaded {len(shelter_features)} shelters")
        
        # Create output directory
        os.makedirs(output_dir, exist_ok=True)
        
        # Run all combinations
        total_scenarios = len(self.RADII_TO_TEST) * 2  # 2 scenarios per radius
        current_scenario = 0
        
        for radius_m in self.RADII_TO_TEST:
            print(f"\n🎯 RADIUS: {radius_m}m")
            print("-" * 50)
            
            for include_planned in [False, True]:
                current_scenario += 1
                print(f"[{current_scenario}/{total_scenarios}]", end=" ")
                
                result = self.optimize_for_radius_and_scenario(
                    building_coords, building_features, shelter_features,
                    radius_m, include_planned
                )
                
                if result:
                    # Save result
                    scenario_name = "with_planned" if include_planned else "without_planned"
                    filename = f"optimal_shelters_{scenario_name}_{radius_m}m.json"
                    filepath = os.path.join(output_dir, filename)
                    
                    with open(filepath, 'w') as f:
                        json.dump(result, f, indent=2)
                    
                    print(f"    💾 Saved: {filename}")
        
        print(f"\n🎉 All optimizations completed!")
        print(f"📁 Results saved in: {output_dir}/")
        
        # Print summary
        print(f"\n📊 SUMMARY:")
        print(f"    🎯 Total scenarios: {total_scenarios}")
        print(f"    📏 Radii tested: {len(self.RADII_TO_TEST)}")
        print(f"    🏗️  Shelters per scenario: {self.TARGET_SHELTERS}")

def main():
    """Example usage"""
    optimizer = SimpleShelterOptimizer()
    
    # Run full optimization for all radii and scenarios
    optimizer.run_full_optimization(
        buildings_file='data/buildings_light.geojson',
        shelters_file='data/shelters.geojson',
        output_dir='data/optimal_locations'
    )

if __name__ == "__main__":
    main()