#!/usr/bin/env python3
"""
Minimal Coverage Shelter Optimizer
Finds the smallest number of non-overlapping cluster centroids that cover the greatest 
extent of buildings, with each centroid covering at least 10 buildings.

Uses both DBSCAN (density-based) and K-means (centroid-based) clustering approaches
to find optimal shelter locations with multithreading support.
"""

import json
import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from tqdm import tqdm
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

class MinimalCoverageShelterOptimizer:
    def __init__(self):
        self.PEOPLE_PER_BUILDING = 7
        self.MIN_BUILDINGS_PER_CLUSTER = 10  # Changed to 10 as requested
        self.RADII_TO_TEST = [100, 150, 200, 250, 300]
        
        # DBSCAN parameters to test (eps should be <= coverage radius for optimal results)
        self.DBSCAN_EPS_MULTIPLIERS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]  # 10 multipliers from 0.1 to 1.0
        self.DBSCAN_MIN_SAMPLES = [10]  # Single min_samples parameter
        
        # K-means parameters (simplified)
        self.KMEANS_K_VALUES = [750, 1500]  # Just two reasonable k values
        self.KMEANS_SEEDS = 2  # Multiple K-means random seeds
        
        # Multithreading settings
        self.USE_MULTITHREADING = True  # Set to False to disable
        self.MAX_WORKERS = 5  # Number of parallel processes
        
    def load_geojson(self, filepath):
        """Load GeoJSON and extract coordinates"""
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        coordinates = []
        for feature in data['features']:
            if feature['geometry']['type'] == 'Point':
                lon, lat = feature['geometry']['coordinates']
                coordinates.append([lat, lon])
        
        return np.array(coordinates), data['features']
    
    def meters_to_degrees(self, meters, lat=31.5):
        """Convert meters to approximate degrees at given latitude"""
        lat_deg_per_meter = 1 / 111000
        lon_deg_per_meter = 1 / (111000 * np.cos(np.radians(lat)))
        return meters * lat_deg_per_meter, meters * lon_deg_per_meter
    
    def process_existing_shelters(self, shelter_features):
        """Process existing built shelters from GeoJSON"""
        existing_shelters = []
        existing_shelter_data = []
        
        for shelter in shelter_features:
            status = shelter['properties'].get('status', '').strip()
            # Only consider built shelters
            if status == 'Built':
                coords = shelter['geometry']['coordinates']
                shelter_coord = [coords[1], coords[0]]  # lat, lon
                
                shelter_info = {
                    'lat': float(coords[1]),
                    'lon': float(coords[0]),
                    'type': 'existing',
                    'properties': shelter['properties']
                }
                
                existing_shelters.append(shelter_coord)
                existing_shelter_data.append(shelter_info)
        
        existing_shelters = np.array(existing_shelters) if existing_shelters else np.empty((0, 2))
        
        return existing_shelters, existing_shelter_data
    
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
    
    def filter_existing_coverage(self, building_coords, existing_shelters, coverage_radius_deg):
        """Remove buildings already covered by existing shelters"""
        if len(existing_shelters) == 0:
            return building_coords, np.arange(len(building_coords))
        
        print(f"    🔍 Filtering buildings already covered by {len(existing_shelters)} existing shelters...")
        uncovered_mask = np.ones(len(building_coords), dtype=bool)
        
        for shelter in existing_shelters:
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
    
    def calculate_coverage_score(self, candidate_coord, building_coords, coverage_radius_deg):
        """Calculate how many buildings a candidate location covers"""
        distances = np.sqrt(np.sum((building_coords - candidate_coord) ** 2, axis=1))
        buildings_covered = np.sum(distances <= coverage_radius_deg)
        return int(buildings_covered)
    
    def find_optimal_clusters(self, building_coords, coverage_radius_deg):
        """
        Find the optimal set of cluster centroids that cover the most buildings
        with the smallest number of clusters, each covering at least 10 buildings.
        Uses both DBSCAN and K-means approaches.
        """
        print(f"    🎯 Finding optimal clusters for {len(building_coords)} buildings...")
        
        all_candidates = []
        
        # Generate DBSCAN candidates
        dbscan_candidates = self.generate_dbscan_candidates(building_coords, coverage_radius_deg)
        all_candidates.extend(dbscan_candidates)
        print(f"    ✓ DBSCAN: {len(dbscan_candidates)} candidates")
        
        # Generate K-means candidates
        kmeans_candidates = self.generate_kmeans_candidates(building_coords, coverage_radius_deg)
        all_candidates.extend(kmeans_candidates)
        print(f"    ✓ K-means: {len(kmeans_candidates)} candidates")
        
        # Find the best combination of non-overlapping clusters
        best_clusters = self.select_minimal_non_overlapping_clusters(all_candidates, coverage_radius_deg)
        
        print(f"    ✓ Final selection: {len(best_clusters)} clusters")
        return best_clusters
    
    def generate_dbscan_candidates(self, building_coords, coverage_radius_deg):
        """Generate candidates using DBSCAN clustering with optional multithreading"""
        candidates = []
        
        if self.USE_MULTITHREADING:
            return self.generate_dbscan_candidates_parallel(building_coords, coverage_radius_deg)
        else:
            return self.generate_dbscan_candidates_sequential(building_coords, coverage_radius_deg)
    
    def generate_dbscan_candidates_parallel(self, building_coords, coverage_radius_deg):
        """Generate DBSCAN candidates using multithreading"""
        candidates = []
        
        # Create list of all configurations
        configs = [(eps_mult, min_samples) 
                  for eps_mult in self.DBSCAN_EPS_MULTIPLIERS 
                  for min_samples in self.DBSCAN_MIN_SAMPLES]
        
        # Run DBSCAN configurations in parallel
        with ThreadPoolExecutor(max_workers=self.MAX_WORKERS) as executor:
            # Submit all jobs
            future_to_config = {
                executor.submit(self.run_single_dbscan_config, building_coords, coverage_radius_deg, eps_mult, min_samples): (eps_mult, min_samples)
                for eps_mult, min_samples in configs
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_config):
                eps_mult, min_samples = future_to_config[future]
                try:
                    config_candidates = future.result()
                    candidates.extend(config_candidates)
                    print(f"        ✓ DBSCAN eps={eps_mult}: {len(config_candidates)} candidates")
                        
                except Exception as exc:
                    print(f'DBSCAN config (eps={eps_mult}, min={min_samples}) generated an exception: {exc}')
        
        return candidates
    
    def generate_dbscan_candidates_sequential(self, building_coords, coverage_radius_deg):
        """Generate DBSCAN candidates sequentially"""
        candidates = []
        
        # Try different DBSCAN eps values to find optimal clustering
        for eps_mult in self.DBSCAN_EPS_MULTIPLIERS:
            eps = coverage_radius_deg * eps_mult
            
            # Use DBSCAN to find clusters
            dbscan = DBSCAN(eps=eps, min_samples=self.MIN_BUILDINGS_PER_CLUSTER)
            cluster_labels = dbscan.fit_predict(building_coords)
            
            unique_labels = set(cluster_labels)
            n_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)
            
            if n_clusters == 0:
                continue
            
            # Process clusters and find centroids
            for cluster_id in unique_labels:
                if cluster_id == -1:  # Skip noise points
                    continue
                    
                # Get buildings in this cluster
                cluster_mask = cluster_labels == cluster_id
                cluster_buildings = building_coords[cluster_mask]
                
                if len(cluster_buildings) < self.MIN_BUILDINGS_PER_CLUSTER:
                    continue
                
                # Calculate centroid
                centroid = np.mean(cluster_buildings, axis=0)
                coverage = self.calculate_coverage_score(centroid, building_coords, coverage_radius_deg)
                
                # Only keep clusters that cover minimum number of buildings
                if coverage >= self.MIN_BUILDINGS_PER_CLUSTER:
                    candidates.append({
                        'lat': float(centroid[0]),
                        'lon': float(centroid[1]),
                        'buildings_covered': int(coverage),
                        'method': f'dbscan_eps{eps_mult}',
                        'cluster_size': int(len(cluster_buildings))
                    })
            
            print(f"        ✓ DBSCAN eps={eps_mult}: {len([c for c in candidates if c['method'] == f'dbscan_eps{eps_mult}'])} candidates")
        
        return candidates
    
    def run_single_dbscan_config(self, building_coords, coverage_radius_deg, eps_mult, min_samples):
        """Run a single DBSCAN configuration - used for multithreading"""
        eps = coverage_radius_deg * eps_mult
        
        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
        cluster_labels = dbscan.fit_predict(building_coords)
        
        unique_labels = set(cluster_labels)
        candidates = []
        
        for cluster_id in unique_labels:
            if cluster_id == -1:  # Skip noise
                continue
            
            cluster_mask = cluster_labels == cluster_id
            cluster_buildings = building_coords[cluster_mask]
            
            if len(cluster_buildings) < self.MIN_BUILDINGS_PER_CLUSTER:
                continue
            
            # Calculate centroid
            centroid = np.mean(cluster_buildings, axis=0)
            coverage = self.calculate_coverage_score(centroid, building_coords, coverage_radius_deg)
            
            if coverage >= self.MIN_BUILDINGS_PER_CLUSTER:
                candidates.append({
                    'lat': float(centroid[0]),
                    'lon': float(centroid[1]),
                    'buildings_covered': int(coverage),
                    'method': f'dbscan_eps{eps_mult}',
                    'cluster_size': int(len(cluster_buildings))
                })
        
        return candidates
    
    def generate_kmeans_candidates(self, building_coords, coverage_radius_deg):
        """Generate candidates using K-means clustering with optional multithreading"""
        if self.USE_MULTITHREADING:
            return self.generate_kmeans_candidates_parallel(building_coords, coverage_radius_deg)
        else:
            return self.generate_kmeans_candidates_sequential(building_coords, coverage_radius_deg)
    
    def generate_kmeans_candidates_parallel(self, building_coords, coverage_radius_deg):
        """Generate K-means candidates using multithreading"""
        candidates = []
        
        # Create list of all configurations
        configs = [(k, seed) for k in self.KMEANS_K_VALUES for seed in range(self.KMEANS_SEEDS)]
        
        # Run K-means configurations in parallel
        with ThreadPoolExecutor(max_workers=self.MAX_WORKERS) as executor:
            # Submit all jobs
            future_to_config = {
                executor.submit(self.run_single_kmeans_config, building_coords, coverage_radius_deg, k, seed): (k, seed)
                for k, seed in configs
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_config):
                k, seed = future_to_config[future]
                try:
                    config_candidates = future.result()
                    candidates.extend(config_candidates)
                    print(f"        ✓ K-means k={k}, seed={seed+1}: {len(config_candidates)} candidates")
                        
                except Exception as exc:
                    print(f'K-means config (k={k}, seed={seed+1}) generated an exception: {exc}')
        
        return candidates
    
    def generate_kmeans_candidates_sequential(self, building_coords, coverage_radius_deg):
        """Generate candidates using K-means clustering"""
        candidates = []
        
        # Use fixed k values with multiple seeds
        k_values = self.KMEANS_K_VALUES
        
        for k in k_values:
            for seed in range(self.KMEANS_SEEDS):
                # Add randomness across runs and seeds
                random_state = 0 * 1000 + k + seed * 100  # run_id=0 for single run
                kmeans = KMeans(n_clusters=k, random_state=random_state, n_init=10)
                cluster_labels = kmeans.fit_predict(building_coords)
                centroids = kmeans.cluster_centers_
                
                candidates_this_config = 0
                for i, centroid in enumerate(centroids):
                    coverage = self.calculate_coverage_score(centroid, building_coords, coverage_radius_deg)
                    
                    if coverage >= self.MIN_BUILDINGS_PER_CLUSTER:
                        candidates_this_config += 1
                        candidates.append({
                            'lat': float(centroid[0]),
                            'lon': float(centroid[1]),
                            'buildings_covered': int(coverage),
                            'method': f'kmeans_k{k}_seed{seed+1}',
                            'cluster_size': int(np.sum(cluster_labels == i))
                        })
                
                print(f"        ✓ K={k}, seed={seed+1}: {candidates_this_config}/{len(centroids)} centroids viable ({100*candidates_this_config/len(centroids):.1f}%)")
        
        return candidates
    
    def run_single_kmeans_config(self, building_coords, coverage_radius_deg, k, seed):
        """Run a single K-means configuration - used for multithreading"""
        # Add randomness across runs and seeds
        random_state = 0 * 1000 + k + seed * 100  # run_id=0 for single run
        kmeans = KMeans(n_clusters=k, random_state=random_state, n_init=10)
        cluster_labels = kmeans.fit_predict(building_coords)
        centroids = kmeans.cluster_centers_
        
        candidates = []
        for i, centroid in enumerate(centroids):
            coverage = self.calculate_coverage_score(centroid, building_coords, coverage_radius_deg)
            
            if coverage >= self.MIN_BUILDINGS_PER_CLUSTER:
                candidates.append({
                    'lat': float(centroid[0]),
                    'lon': float(centroid[1]),
                    'buildings_covered': int(coverage),
                    'method': f'kmeans_k{k}_seed{seed+1}',
                    'cluster_size': int(np.sum(cluster_labels == i))
                })
        
        return candidates
    
    def select_minimal_non_overlapping_clusters(self, clusters, coverage_radius_deg):
        """
        Select the smallest number of non-overlapping clusters that cover the most buildings.
        Uses a greedy approach with coverage optimization.
        """
        if not clusters:
            return []
        
        # Sort clusters by coverage (descending)
        clusters.sort(key=lambda x: x['buildings_covered'], reverse=True)
        
        selected = []
        covered_buildings = set()  # Track which buildings are covered
        
        for cluster in clusters:
            cluster_coord = np.array([cluster['lat'], cluster['lon']])
            
            # Check if this cluster overlaps with already selected clusters
            overlaps = False
            for selected_cluster in selected:
                selected_coord = np.array([selected_cluster['lat'], selected_cluster['lon']])
                distance = np.sqrt(np.sum((cluster_coord - selected_coord) ** 2))
                
                # If clusters are too close, they overlap
                if distance < coverage_radius_deg * 2:
                    overlaps = True
                    break
            
            if not overlaps:
                selected.append(cluster)
                # Note: We don't track individual buildings here since we're working with cluster centroids
                # The coverage is already calculated for each cluster
        
        print(f"    ✓ Selected {len(selected)} non-overlapping clusters")
        return selected
    
    def optimize_for_radius(self, building_coords, building_features, 
                           shelter_features, coverage_radius_m, pbar=None):
        """Optimize shelter locations for specific radius using minimal coverage approach"""
        
        print(f"\n  📊 Optimizing for {coverage_radius_m}m radius (minimal coverage approach)")
        
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        
        # Process existing shelters
        existing_shelters, existing_shelter_data = self.process_existing_shelters(shelter_features)
        
        # Calculate existing shelter coverage if any
        total_people = len(building_features) * self.PEOPLE_PER_BUILDING
        
        if len(existing_shelters) > 0:
            existing_coverage = self.calculate_shelter_coverage(existing_shelters, building_coords, coverage_radius_deg)
            total_existing_coverage = sum(c['buildings_covered'] for c in existing_coverage)
            
            # Update shelter data with coverage info
            for i, coverage in enumerate(existing_coverage):
                if i < len(existing_shelter_data):
                    existing_shelter_data[i].update(coverage)
            
            print(f"    📍 Existing shelters: {len(existing_shelters)} covering {total_existing_coverage} buildings")
        
        # Filter out buildings already covered by existing shelters
        uncovered_buildings, uncovered_indices = self.filter_existing_coverage(
            building_coords, existing_shelters, coverage_radius_deg
        )
        
        if len(uncovered_buildings) == 0:
            print("    ✅ All buildings already covered by existing shelters!")
            return {
                'radius_m': coverage_radius_m,
                'optimal_locations': [],
                'existing_shelters': existing_shelter_data,
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
        
        # Find optimal clusters
        if pbar:
            pbar.set_description("  Finding optimal clusters")
        
        optimal_clusters = self.find_optimal_clusters(uncovered_buildings, coverage_radius_deg)
        
        if pbar:
            pbar.update(1)
            pbar.set_description("  Selecting non-overlapping clusters")
        
        # Select minimal non-overlapping set
        selected_shelters = self.select_minimal_non_overlapping_clusters(optimal_clusters, coverage_radius_deg)
        
        if pbar:
            pbar.update(1)
        
        if not selected_shelters:
            print("    ❌ No viable cluster locations found!")
            return None
        
        # Calculate final coverage statistics
        buildings_covered = sum(s['buildings_covered'] for s in selected_shelters)
        people_covered = buildings_covered * self.PEOPLE_PER_BUILDING
        
        # Add coverage from existing shelters
        already_covered_buildings = len(building_coords) - len(uncovered_buildings)
        already_covered_people = already_covered_buildings * self.PEOPLE_PER_BUILDING
        
        total_buildings_covered = buildings_covered + already_covered_buildings
        total_people_covered = people_covered + already_covered_people
        total_coverage_percentage = (total_buildings_covered / len(building_coords)) * 100
        
        result = {
            'radius_m': coverage_radius_m,
            'optimal_locations': selected_shelters,
            'existing_shelters': existing_shelter_data,
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
        print(f"    📊 Average buildings per new shelter: {result['statistics']['avg_buildings_per_new_shelter']}")
        
        return result
    
    def run_full_optimization(self, buildings_file, shelters_file, output_dir='data/optimal_locations'):
        """Run minimal coverage optimization for all radii"""
        print("🏠 MINIMAL COVERAGE SHELTER OPTIMIZATION")
        print("=" * 70)
        print(f"Goal: Smallest number of non-overlapping cluster centroids")
        print(f"Constraint: Each centroid covers at least {self.MIN_BUILDINGS_PER_CLUSTER} buildings")
        print(f"Radii: {self.RADII_TO_TEST} meters")
        print(f"Methods: DBSCAN (10 eps configs) + K-means (k=750,1500 × {self.KMEANS_SEEDS} seeds)")
        print(f"Strategy: Generate diverse candidates, then optimal non-overlapping selection")
        print(f"Multithreading: {'Enabled' if self.USE_MULTITHREADING else 'Disabled'} ({self.MAX_WORKERS} workers)")
        print("=" * 70)
        print("📁 Loading data...")
        building_coords, building_features = self.load_geojson(buildings_file)
        print(f"    ✓ Loaded {len(building_features)} buildings")
        shelter_coords, shelter_features = self.load_geojson(shelters_file)
        print(f"    ✓ Loaded {len(shelter_features)} shelters")
        os.makedirs(output_dir, exist_ok=True)
        
        for radius_m in self.RADII_TO_TEST:
            print(f"\n🎯 RADIUS: {radius_m}m")
            print("=" * 50)
            
            with tqdm(total=2, desc=f"  {radius_m}m optimization") as pbar:
                result = self.optimize_for_radius(
                    building_coords, building_features, shelter_features, 
                    radius_m, pbar
                )
            
            if result:
                filename = f"optimal_shelters_{radius_m}m.json"
                filepath = os.path.join(output_dir, filename)
                with open(filepath, 'w') as f:
                    json.dump(result, f, indent=2)
                coverage_pct = result['statistics']['coverage_percentage']
                shelters_count = result['statistics']['shelters_selected']
                print(f"    💾 Saved: {filename} ({coverage_pct:.1f}% coverage, {shelters_count} shelters)")
            else:
                print(f"    ❌ No result for radius {radius_m}m")
        
        print(f"\n🎉 Minimal coverage optimization completed!")
        print(f"📁 Results saved in: {output_dir}/")

def main():
    """Example usage"""
    optimizer = MinimalCoverageShelterOptimizer()
    
    # Run minimal coverage optimization
    optimizer.run_full_optimization(
        buildings_file='data/buildings_light.geojson',
        shelters_file='data/shelters.geojson',
        output_dir='data/optimal_locations'
    )

if __name__ == "__main__":
    main()
    