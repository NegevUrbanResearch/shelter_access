#!/usr/bin/env python3
"""
Enhanced DBSCAN + K-means Shelter Optimizer
Finds optimal shelter locations using two complementary methods:
1. DBSCAN variants (24 configurations) to find density-based clusters  
2. K-means clustering (k=750, 1500) for systematic space coverage
Then uses advanced selection strategies across multiple runs.
"""

import json
import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from tqdm import tqdm
import os
import random

class EnhancedShelterOptimizer:
    def __init__(self):
        self.PEOPLE_PER_BUILDING = 7
        self.TARGET_SHELTERS = 150
        self.RADII_TO_TEST = [100, 150, 200, 250, 300]
        self.MIN_BUILDINGS_PER_CLUSTER = 5
        self.N_RUNS_PER_RADIUS = 10  # Multiple runs for stochastic methods
        
        # DBSCAN parameters to test (eps should be <= coverage radius for optimal results)
        self.DBSCAN_EPS_MULTIPLIERS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]  # Multipliers of coverage radius
        self.DBSCAN_MIN_SAMPLES = [3, 5, 7, 10]
        
        # K-means parameters (simplified)
        self.KMEANS_K_VALUES = [750, 1500]  # Just two reasonable k values
        
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
    
    def calculate_coverage_score(self, candidate_coord, building_coords, coverage_radius_deg):
        """Calculate how many buildings a candidate location covers"""
        distances = np.sqrt(np.sum((building_coords - candidate_coord) ** 2, axis=1))
        buildings_covered = np.sum(distances <= coverage_radius_deg)
        return int(buildings_covered)
    
    def generate_dbscan_candidates(self, building_coords, coverage_radius_m, run_id=0, progress_callback=None):
        """Generate candidates using multiple DBSCAN configurations"""
        candidates = []
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        
        # Track candidate sources for reporting
        candidate_sources = {}
        
        total_configs = len(self.DBSCAN_EPS_MULTIPLIERS) * len(self.DBSCAN_MIN_SAMPLES)
        config_count = 0
        
        for eps_mult in self.DBSCAN_EPS_MULTIPLIERS:
            for min_samples in self.DBSCAN_MIN_SAMPLES:
                config_count += 1
                
                if progress_callback:
                    progress_callback(f"DBSCAN {config_count}/{total_configs} (eps={eps_mult}, min={min_samples})")
                
                eps = coverage_radius_deg * eps_mult
                
                dbscan = DBSCAN(eps=eps, min_samples=min_samples)
                cluster_labels = dbscan.fit_predict(building_coords)
                
                unique_labels = set(cluster_labels)
                
                config_key = f"dbscan_eps{eps_mult}_min{min_samples}"
                candidate_sources[config_key] = 0
                
                for cluster_id in unique_labels:
                    if cluster_id == -1:  # Skip noise
                        continue
                    
                    cluster_mask = cluster_labels == cluster_id
                    cluster_buildings = building_coords[cluster_mask]
                    
                    if len(cluster_buildings) < self.MIN_BUILDINGS_PER_CLUSTER:
                        continue
                    
                    # Generate multiple candidates per cluster
                    # 1. Centroid
                    centroid = np.mean(cluster_buildings, axis=0)
                    coverage = self.calculate_coverage_score(centroid, building_coords, coverage_radius_deg)
                    
                    if coverage >= self.MIN_BUILDINGS_PER_CLUSTER:
                        candidates.append({
                            'lat': float(centroid[0]),
                            'lon': float(centroid[1]),
                            'buildings_covered': coverage,
                            'method': f'dbscan_centroid_eps{eps_mult}_min{min_samples}',
                            'cluster_size': len(cluster_buildings)
                        })
                        candidate_sources[config_key] += 1
                    
                    # 2. Medoid (point in cluster closest to centroid)
                    distances_to_centroid = np.sqrt(np.sum((cluster_buildings - centroid) ** 2, axis=1))
                    medoid_idx = np.argmin(distances_to_centroid)
                    medoid = cluster_buildings[medoid_idx]
                    coverage = self.calculate_coverage_score(medoid, building_coords, coverage_radius_deg)
                    
                    if coverage >= self.MIN_BUILDINGS_PER_CLUSTER:
                        candidates.append({
                            'lat': float(medoid[0]),
                            'lon': float(medoid[1]),
                            'buildings_covered': coverage,
                            'method': f'dbscan_medoid_eps{eps_mult}_min{min_samples}',
                            'cluster_size': len(cluster_buildings)
                        })
                        candidate_sources[config_key] += 1
                    
                    # 3. Best point in cluster (highest coverage)
                    if len(cluster_buildings) <= 50:  # Only for smaller clusters to avoid computational cost
                        best_coverage = 0
                        best_point = None
                        
                        for building in cluster_buildings:
                            coverage = self.calculate_coverage_score(building, building_coords, coverage_radius_deg)
                            if coverage > best_coverage:
                                best_coverage = coverage
                                best_point = building
                        
                        if best_coverage >= self.MIN_BUILDINGS_PER_CLUSTER:
                            candidates.append({
                                'lat': float(best_point[0]),
                                'lon': float(best_point[1]),
                                'buildings_covered': best_coverage,
                                'method': f'dbscan_best_eps{eps_mult}_min{min_samples}',
                                'cluster_size': len(cluster_buildings)
                            })
                            candidate_sources[config_key] += 1
        
        return candidates, candidate_sources
    
    def generate_kmeans_candidates(self, building_coords, coverage_radius_m, run_id=0):
        """Generate candidates using K-means clustering"""
        candidates = []
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        
        print(f"    🎯 K-means candidates (run {run_id + 1})...")
        
        # Use fixed k values
        k_values = self.KMEANS_K_VALUES
        
        k_pbar = tqdm(k_values, desc="      K-means values", leave=False)
        for k in k_pbar:
            k_pbar.set_description(f"      K-means k={k}")
            
            # Add randomness across runs
            random_state = run_id * 1000 + k
            kmeans = KMeans(n_clusters=k, random_state=random_state, n_init=10)
            cluster_labels = kmeans.fit_predict(building_coords)
            centroids = kmeans.cluster_centers_
            
            centroid_pbar = tqdm(enumerate(centroids), total=len(centroids), desc="        centroids", leave=False)
            candidates_this_k = 0
            for i, centroid in centroid_pbar:
                coverage = self.calculate_coverage_score(centroid, building_coords, coverage_radius_deg)
                
                if coverage >= self.MIN_BUILDINGS_PER_CLUSTER:
                    candidates_this_k += 1
                    candidates.append({
                        'lat': float(centroid[0]),
                        'lon': float(centroid[1]),
                        'buildings_covered': coverage,
                        'method': f'kmeans_k{k}',
                        'cluster_size': np.sum(cluster_labels == i)
                    })
                
                centroid_pbar.set_postfix(viable=candidates_this_k)
            
            centroid_pbar.close()
            print(f"        ✓ K={k}: {candidates_this_k}/{len(centroids)} centroids viable ({100*candidates_this_k/len(centroids):.1f}%)")
        
        k_pbar.close()
        return candidates
    
    def remove_duplicate_candidates(self, candidates, min_distance_deg):
        """Remove candidates that are too close to each other"""
        if not candidates:
            return candidates
        
        # Sort by coverage (descending)
        candidates.sort(key=lambda x: x['buildings_covered'], reverse=True)
        
        filtered_candidates = []
        
        for candidate in candidates:
            candidate_coord = np.array([candidate['lat'], candidate['lon']])
            
            # Check if too close to any already selected candidate
            too_close = False
            for selected in filtered_candidates:
                selected_coord = np.array([selected['lat'], selected['lon']])
                distance = np.sqrt(np.sum((candidate_coord - selected_coord) ** 2))
                
                if distance < min_distance_deg:
                    too_close = True
                    break
            
            if not too_close:
                filtered_candidates.append(candidate)
        
        return filtered_candidates
    
    def advanced_selection(self, candidates, coverage_radius_m, target_count):
        """Advanced selection using multiple strategies"""
        if len(candidates) <= target_count:
            return candidates
        
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        min_distance_deg = coverage_radius_deg * 2  # No overlap
        
        # Strategy 1: Greedy (baseline)
        greedy_selected = self.greedy_selection(candidates.copy(), min_distance_deg, target_count)
        
        # Strategy 2: Iterative improvement
        iterative_selected = self.iterative_improvement_selection(
            candidates.copy(), min_distance_deg, target_count, greedy_selected
        )
        
        # Strategy 3: Coverage-weighted random selection (multiple tries)
        best_random_selected = None
        best_random_coverage = 0
        
        for _ in range(5):  # Try 5 random selections
            random_selected = self.weighted_random_selection(candidates.copy(), min_distance_deg, target_count)
            total_coverage = sum(s['buildings_covered'] for s in random_selected)
            
            if total_coverage > best_random_coverage:
                best_random_coverage = total_coverage
                best_random_selected = random_selected
        
        # Compare strategies and return best
        strategies = [
            ('greedy', greedy_selected),
            ('iterative', iterative_selected),
            ('random', best_random_selected)
        ]
        
        best_strategy = None
        best_total_coverage = 0
        
        for name, selected in strategies:
            if selected:
                total_coverage = sum(s['buildings_covered'] for s in selected)
                if total_coverage > best_total_coverage:
                    best_total_coverage = total_coverage
                    best_strategy = (name, selected)
        
        if best_strategy:
            print(f"      ✓ Best strategy: {best_strategy[0]} ({best_total_coverage} total coverage)")
            return best_strategy[1]
        
        return greedy_selected
    
    def greedy_selection(self, candidates, min_distance_deg, target_count):
        """Standard greedy selection"""
        candidates.sort(key=lambda x: x['buildings_covered'], reverse=True)
        selected = []
        
        for candidate in candidates:
            if len(selected) >= target_count:
                break
            
            candidate_coord = np.array([candidate['lat'], candidate['lon']])
            too_close = any(
                np.sqrt(np.sum((candidate_coord - np.array([s['lat'], s['lon']])) ** 2)) < min_distance_deg
                for s in selected
            )
            
            if not too_close:
                selected.append(candidate)
        
        return selected
    
    def print_candidate_summary(self, candidate_sources, shelters_selected, run_id, coverage_radius_m):
        """Print a nice table summarizing candidate sources"""
        print(f"\n    📊 Run {run_id + 1} Candidate Summary ({coverage_radius_m}m radius):")
        print("    " + "=" * 60)
        
        # Group by method type
        dbscan_sources = {k: v for k, v in candidate_sources.items() if k.startswith('dbscan_')}
        kmeans_sources = {k: v for k, v in candidate_sources.items() if k.startswith('kmeans_')}
        
        total_candidates = sum(candidate_sources.values())
        
        # DBSCAN section
        if dbscan_sources:
            dbscan_total = sum(dbscan_sources.values())
            print(f"    🔍 DBSCAN: {dbscan_total} candidates ({100*dbscan_total/total_candidates:.1f}%)")
            
            # Group by eps value
            eps_groups = {}
            for key, count in dbscan_sources.items():
                # Extract eps value from key like "dbscan_eps0.7_min5"
                eps_val = key.split('_')[1].replace('eps', '')
                if eps_val not in eps_groups:
                    eps_groups[eps_val] = 0
                eps_groups[eps_val] += count
            
            for eps_val in sorted(eps_groups.keys(), key=float):
                count = eps_groups[eps_val]
                print(f"      eps={eps_val}: {count:4d} ({100*count/total_candidates:4.1f}%)")
        
        # K-means section
        if kmeans_sources:
            kmeans_total = sum(kmeans_sources.values())
            print(f"    🎯 K-means: {kmeans_total} candidates ({100*kmeans_total/total_candidates:.1f}%)")
            
            for key, count in sorted(kmeans_sources.items()):
                k_val = key.replace('kmeans_k', '')
                print(f"      k={k_val}: {count:4d} ({100*count/total_candidates:4.1f}%)")
        
        print(f"    ✅ Total: {total_candidates} candidates → {shelters_selected} selected")
        print("    " + "=" * 60)
    
    def iterative_improvement_selection(self, candidates, min_distance_deg, target_count, initial_selection):
        """Try to improve selection by swapping shelters"""
        if not initial_selection:
            return initial_selection
        
        current_selection = initial_selection.copy()
        candidates.sort(key=lambda x: x['buildings_covered'], reverse=True)
        
        improved = True
        iterations = 0
        max_iterations = 50
        
        while improved and iterations < max_iterations:
            improved = False
            iterations += 1
            
            # Try replacing each selected shelter with unused candidates
            for i, selected_shelter in enumerate(current_selection):
                current_coverage = sum(s['buildings_covered'] for s in current_selection)
                
                for candidate in candidates:
                    if candidate in current_selection:
                        continue
                    
                    # Check if candidate would conflict with other selected shelters
                    candidate_coord = np.array([candidate['lat'], candidate['lon']])
                    conflicts = any(
                        np.sqrt(np.sum((candidate_coord - np.array([s['lat'], s['lon']])) ** 2)) < min_distance_deg
                        for j, s in enumerate(current_selection) if j != i
                    )
                    
                    if not conflicts:
                        # Try replacement
                        test_selection = current_selection.copy()
                        test_selection[i] = candidate
                        test_coverage = sum(s['buildings_covered'] for s in test_selection)
                        
                        if test_coverage > current_coverage:
                            current_selection = test_selection
                            improved = True
                            break
                
                if improved:
                    break
        
        return current_selection
    
    def weighted_random_selection(self, candidates, min_distance_deg, target_count):
        """Random selection weighted by coverage scores"""
        if not candidates:
            return []
        
        selected = []
        available = candidates.copy()
        
        while len(selected) < target_count and available:
            # Create weights based on coverage
            weights = [c['buildings_covered'] ** 2 for c in available]  # Square for stronger preference
            total_weight = sum(weights)
            
            if total_weight == 0:
                break
            
            # Weighted random selection
            rand_val = random.uniform(0, total_weight)
            cumulative = 0
            selected_candidate = None
            
            for i, weight in enumerate(weights):
                cumulative += weight
                if cumulative >= rand_val:
                    selected_candidate = available[i]
                    break
            
            if selected_candidate:
                selected.append(selected_candidate)
                
                # Remove selected candidate and any that are too close
                candidate_coord = np.array([selected_candidate['lat'], selected_candidate['lon']])
                available = [
                    c for c in available
                    if np.sqrt(np.sum((candidate_coord - np.array([c['lat'], c['lon']])) ** 2)) >= min_distance_deg
                ]
        
        return selected
    
    def optimize_single_run(self, building_coords, coverage_radius_m, run_id=0, main_pbar=None):
        """Run complete optimization for a single run"""
        
        all_candidates = []
        all_candidate_sources = {}
        
        def progress_callback(msg):
            if main_pbar:
                main_pbar.set_description(f"  Run {run_id + 1}: {msg}")
        
        # Generate candidates using the two strong methods
        progress_callback("Starting DBSCAN...")
        dbscan_candidates, dbscan_sources = self.generate_dbscan_candidates(
            building_coords, coverage_radius_m, run_id, progress_callback
        )
        all_candidates.extend(dbscan_candidates)
        all_candidate_sources.update(dbscan_sources)
        
        progress_callback("Starting K-means...")
        kmeans_candidates, kmeans_sources = self.generate_kmeans_candidates(
            building_coords, coverage_radius_m, run_id, progress_callback
        )
        all_candidates.extend(kmeans_candidates)
        all_candidate_sources.update(kmeans_sources)
        
        progress_callback("Selection and deduplication...")
        
        if not all_candidates:
            return None
        
        # Remove duplicates
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        min_distance_deg = coverage_radius_deg * 0.1  # Small distance for deduplication
        deduplicated = self.remove_duplicate_candidates(all_candidates, min_distance_deg)
        
        # Advanced selection
        selected_shelters = self.advanced_selection(deduplicated, coverage_radius_m, self.TARGET_SHELTERS)
        
        total_coverage = sum(s['buildings_covered'] for s in selected_shelters)
        
        # Print candidate source summary table
        self.print_candidate_summary(all_candidate_sources, len(selected_shelters), run_id, coverage_radius_m)
        
        return {
            'run_id': run_id,
            'shelters': selected_shelters,
            'total_coverage': total_coverage,
            'candidates_generated': len(all_candidates),
            'candidates_after_dedup': len(deduplicated),
            'candidate_sources': all_candidate_sources
        }
    
    def optimize_for_radius(self, building_coords, building_features, coverage_radius_m):
        """Run multiple optimization runs for a given radius and return best result"""
        print(f"\n🎯 OPTIMIZING RADIUS: {coverage_radius_m}m")
        print("-" * 60)
        
        all_runs = []
        
        # Simple progress bar for runs
        with tqdm(total=self.N_RUNS_PER_RADIUS, desc=f"  Runs for {coverage_radius_m}m") as pbar:
            for run_id in range(self.N_RUNS_PER_RADIUS):
                result = self.optimize_single_run(building_coords, coverage_radius_m, run_id, pbar)
                if result:
                    all_runs.append(result)
                    best_coverage = max(r['total_coverage'] for r in all_runs)
                    pbar.set_postfix(best_coverage=best_coverage)
                pbar.update(1)
        
        if not all_runs:
            return None
        
        # Find best run
        best_run = max(all_runs, key=lambda x: x['total_coverage'])
        
        print(f"\n  🏆 BEST RUN RESULTS:")
        print(f"    🥇 Run {best_run['run_id'] + 1}: {best_run['total_coverage']} total coverage")
        print(f"    📈 Range: {min(r['total_coverage'] for r in all_runs)} - {max(r['total_coverage'] for r in all_runs)}")
        
        # Add statistics
        total_people = len(building_features) * self.PEOPLE_PER_BUILDING
        coverage_percentage = (best_run['total_coverage'] / len(building_features)) * 100
        
        return {
            'radius_m': coverage_radius_m,
            'optimal_locations': best_run['shelters'],
            'best_run_id': best_run['run_id'],
            'all_runs_summary': {
                'runs_completed': len(all_runs),
                'coverage_range': [min(r['total_coverage'] for r in all_runs), 
                                 max(r['total_coverage'] for r in all_runs)],
                'avg_coverage': sum(r['total_coverage'] for r in all_runs) / len(all_runs)
            },
            'statistics': {
                'total_buildings': len(building_features),
                'total_people': total_people,
                'shelters_selected': len(best_run['shelters']),
                'buildings_covered': best_run['total_coverage'],
                'people_covered': best_run['total_coverage'] * self.PEOPLE_PER_BUILDING,
                'coverage_percentage': round(coverage_percentage, 2),
                'avg_buildings_per_shelter': round(best_run['total_coverage'] / len(best_run['shelters']), 1)
            }
        }
    
    def run_full_optimization(self, buildings_file, output_dir='data/enhanced_optimal_locations'):
        """Run enhanced optimization for all radii"""
        print("🏠 ENHANCED DBSCAN + K-MEANS SHELTER OPTIMIZATION")
        print("=" * 70)
        print(f"Target: {self.TARGET_SHELTERS} shelters per radius")
        print(f"Radii: {self.RADII_TO_TEST} meters")
        print(f"Runs per radius: {self.N_RUNS_PER_RADIUS}")
        print(f"Methods: DBSCAN (24 configs), K-means (k=750,1500)")
        print("=" * 70)
        
        # Load data
        print("📁 Loading data...")
        building_coords, building_features = self.load_geojson(buildings_file)
        print(f"    ✓ Loaded {len(building_features)} buildings")
        
        # Create output directory
        os.makedirs(output_dir, exist_ok=True)
        
        # Run optimization for each radius
        for radius_m in self.RADII_TO_TEST:
            result = self.optimize_for_radius(building_coords, building_features, radius_m)
            
            if result:
                # Save result
                filename = f"enhanced_optimal_shelters_{radius_m}m.json"
                filepath = os.path.join(output_dir, filename)
                
                with open(filepath, 'w') as f:
                    json.dump(result, f, indent=2)
                
                print(f"    💾 Saved: {filename} ({result['statistics']['coverage_percentage']:.1f}% coverage)")
        
        print(f"\n🎉 Enhanced optimization completed!")
        print(f"📁 Results saved in: {output_dir}/")

def main():
    """Example usage"""
    optimizer = EnhancedShelterOptimizer()
    
    # Run enhanced optimization
    optimizer.run_full_optimization(
        buildings_file='data/buildings_light.geojson',
        output_dir='data/enhanced_optimal_locations'
    )

if __name__ == "__main__":
    main()