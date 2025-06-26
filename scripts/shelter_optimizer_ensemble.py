#!/usr/bin/env python3
"""
Enhanced DBSCAN + K-means Shelter Optimizer
Finds optimal shelter locations using two complementary methods:
1. DBSCAN variants (24 configurations) to find density-based clusters  
2. K-means clustering (k=750, 1500) for systematic space coverage
Then uses advanced selection strategies.

Optimizes for new shelter locations while accounting for existing built shelters.
"""

import json
import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from tqdm import tqdm
import os
import random
from concurrent.futures import ThreadPoolExecutor, as_completed

class EnhancedShelterOptimizer:
    def __init__(self):
        self.PEOPLE_PER_BUILDING = 7
        self.TARGET_SHELTERS = 150
        self.RADII_TO_TEST = [100, 150, 200, 250, 300]
        self.MIN_BUILDINGS_PER_CLUSTER = 5
        self.N_RUNS_PER_RADIUS = 1  # Single run since DBSCAN is deterministic
        self.N_KMEANS_SEEDS = 2  # Multiple K-means random seeds
        
        # DBSCAN parameters to test (eps should be <= coverage radius for optimal results)
        self.DBSCAN_EPS_MULTIPLIERS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]  # 10 multipliers from 0.1 to 1.0
        self.DBSCAN_MIN_SAMPLES = [10]  # Single min_samples parameter
        
        # K-means parameters (simplified)
        self.KMEANS_K_VALUES = [750, 1500]  # Just two reasonable k values
        
        # Multithreading settings
        self.USE_MULTITHREADING = True  # Set to False to disable
        self.MAX_WORKERS = 5  # Number of parallel DBSCAN processes
        
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
    
    def generate_original_dbscan_candidates(self, building_coords, coverage_radius_m, progress_callback=None):
        """Generate candidates using the exact original DBSCAN approach for baseline comparison"""
        candidates = []
        candidate_sources = {}
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        
        if progress_callback:
            progress_callback("Original DBSCAN (eps=1.0, min=5)")
        
        # Use exact original parameters: eps=coverage_radius_deg, min_samples=5
        dbscan = DBSCAN(eps=coverage_radius_deg, min_samples=self.MIN_BUILDINGS_PER_CLUSTER)
        cluster_labels = dbscan.fit_predict(building_coords)
        
        unique_labels = set(cluster_labels)
        n_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)
        
        candidate_count = 0
        
        for cluster_id in unique_labels:
            if cluster_id == -1:  # Skip noise points
                continue
                
            # Get buildings in this cluster
            cluster_mask = cluster_labels == cluster_id
            cluster_buildings = building_coords[cluster_mask]
            
            if len(cluster_buildings) < self.MIN_BUILDINGS_PER_CLUSTER:
                continue
            
            # Calculate centroid (original approach only uses centroids)
            centroid = np.mean(cluster_buildings, axis=0)
            coverage = self.calculate_coverage_score(centroid, building_coords, coverage_radius_deg)
            
            # Only keep candidates that cover minimum number of buildings
            if coverage >= self.MIN_BUILDINGS_PER_CLUSTER:
                candidates.append({
                    'lat': float(centroid[0]),
                    'lon': float(centroid[1]),
                    'buildings_covered': int(coverage),
                    'method': 'original_dbscan_centroid',
                    'cluster_size': int(len(cluster_buildings))
                })
                candidate_count += 1
        
        candidate_sources['original_dbscan'] = candidate_count
        
        if progress_callback:
            progress_callback("step_complete")
        
        print(f"        ✓ Original DBSCAN: {candidate_count}/{n_clusters} centroids viable")
        
        return candidates, candidate_sources
    
    def generate_dbscan_candidates_parallel(self, building_coords, coverage_radius_deg, progress_callback=None):
        """Generate DBSCAN candidates using multithreading"""
        candidates = []
        candidate_sources = {}
        
        # Create list of all configurations
        configs = [(eps_mult, min_samples) 
                  for eps_mult in self.DBSCAN_EPS_MULTIPLIERS 
                  for min_samples in self.DBSCAN_MIN_SAMPLES]
        
        total_configs = len(configs)
        completed_configs = 0
        
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
                    config_key, config_candidates, candidate_count = future.result()
                    candidates.extend(config_candidates)
                    candidate_sources[config_key] = candidate_count
                    
                    completed_configs += 1
                    if progress_callback:
                        progress_callback(f"DBSCAN {completed_configs}/{total_configs} (eps={eps_mult}, min={min_samples}) - {len(candidates)} total candidates")
                        progress_callback("step_complete")
                        
                except Exception as exc:
                    print(f'DBSCAN config (eps={eps_mult}, min={min_samples}) generated an exception: {exc}')
        
        return candidates, candidate_sources
    
    def generate_dbscan_candidates_sequential(self, building_coords, coverage_radius_deg, progress_callback=None):
        """Generate DBSCAN candidates sequentially (original method)"""
        candidates = []
        candidate_sources = {}
        
        total_configs = len(self.DBSCAN_EPS_MULTIPLIERS) * len(self.DBSCAN_MIN_SAMPLES)
        config_count = 0
        
        for eps_mult in self.DBSCAN_EPS_MULTIPLIERS:
            for min_samples in self.DBSCAN_MIN_SAMPLES:
                config_count += 1
                
                if progress_callback:
                    progress_callback(f"DBSCAN {config_count}/{total_configs} (eps={eps_mult}, min={min_samples})")
                
                config_key, config_candidates, candidate_count = self.run_single_dbscan_config(
                    building_coords, coverage_radius_deg, eps_mult, min_samples
                )
                
                candidates.extend(config_candidates)
                candidate_sources[config_key] = candidate_count
                
                # Update progress after each config completes
                if progress_callback:
                    progress_callback("step_complete")
        
        return candidates, candidate_sources
    
    def generate_dbscan_candidates(self, building_coords, coverage_radius_m, run_id=0, progress_callback=None):
        """Generate candidates using multiple DBSCAN configurations"""
        all_candidates = []
        all_candidate_sources = {}
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        
        # First, include the original approach
        original_candidates, original_sources = self.generate_original_dbscan_candidates(
            building_coords, coverage_radius_m, progress_callback
        )
        all_candidates.extend(original_candidates)
        all_candidate_sources.update(original_sources)
        
        # Then run the enhanced DBSCAN variants
        if self.USE_MULTITHREADING:
            enhanced_candidates, enhanced_sources = self.generate_dbscan_candidates_parallel(
                building_coords, coverage_radius_deg, progress_callback
            )
        else:
            enhanced_candidates, enhanced_sources = self.generate_dbscan_candidates_sequential(
                building_coords, coverage_radius_deg, progress_callback
            )
        
        all_candidates.extend(enhanced_candidates)
        all_candidate_sources.update(enhanced_sources)
        
        return all_candidates, all_candidate_sources
    
    def generate_kmeans_candidates(self, building_coords, coverage_radius_m, run_id=0, progress_callback=None):
        """Generate candidates using K-means clustering"""
        candidates = []
        candidate_sources = {}
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        
        if progress_callback:
            progress_callback("Starting K-means...")
        
        # Use fixed k values with multiple seeds
        k_values = self.KMEANS_K_VALUES
        
        total_k_configs = len(k_values) * self.N_KMEANS_SEEDS
        completed_configs = 0
        
        for k in k_values:
            for seed in range(self.N_KMEANS_SEEDS):
                if progress_callback:
                    progress_callback(f"K-means k={k}, seed={seed+1}/{self.N_KMEANS_SEEDS}")
                
                # Add randomness across runs and seeds
                random_state = run_id * 1000 + k + seed * 100
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
                
                # Track candidates by configuration
                config_key = f'kmeans_k{k}_seed{seed+1}'
                candidate_sources[config_key] = candidates_this_config
                
                completed_configs += 1
                
                if progress_callback:
                    progress_callback("step_complete")
                
                print(f"        ✓ K={k}, seed={seed+1}: {candidates_this_config}/{len(centroids)} centroids viable ({100*candidates_this_config/len(centroids):.1f}%)")
        
        return candidates, candidate_sources
    
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
    
    def optimize_single_run_for_buildings(self, building_coords, coverage_radius_m, pbar=None):
        """Run complete optimization for a specific set of buildings (used with shelter filtering)"""
        
        all_candidates = []
        all_candidate_sources = {}
        
        def progress_callback(msg):
            if pbar:
                if msg == "step_complete":
                    pbar.update(1)
                else:
                    pbar.set_description(f"  {msg}")
        
        # Generate candidates using the two strong methods
        progress_callback("Starting DBSCAN...")
        dbscan_candidates, dbscan_sources = self.generate_dbscan_candidates(
            building_coords, coverage_radius_m, run_id=0, progress_callback=progress_callback
        )
        all_candidates.extend(dbscan_candidates)
        all_candidate_sources.update(dbscan_sources)
        
        progress_callback("Starting K-means...")
        kmeans_candidates, kmeans_sources = self.generate_kmeans_candidates(
            building_coords, coverage_radius_m, run_id=0, progress_callback=progress_callback
        )
        all_candidates.extend(kmeans_candidates)
        all_candidate_sources.update(kmeans_sources)
        
        progress_callback("Selection and deduplication...")
        
        if not all_candidates:
            return None
        
        # Remove duplicates efficiently
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        min_distance_deg = coverage_radius_deg * 0.1  # Small distance for deduplication
        deduplicated = self.remove_duplicate_candidates_fast(all_candidates, min_distance_deg)
        
        # Efficient final selection - get best 150 non-overlapping
        selected_shelters = self.optimal_shelter_selection(deduplicated, coverage_radius_m, self.TARGET_SHELTERS)
        
        # Ensure we're generating the expected number of shelters
        assert len(selected_shelters) <= self.TARGET_SHELTERS, f"Selected {len(selected_shelters)} shelters, expected <= {self.TARGET_SHELTERS}"
        
        total_coverage = sum(s['buildings_covered'] for s in selected_shelters)
        
        # Update progress for selection step completion
        if pbar:
            pbar.update(1)
        
        # Print candidate source summary table
        self.print_candidate_summary(all_candidate_sources, len(selected_shelters), coverage_radius_m)
        
        return {
            'run_id': 0,
            'shelters': selected_shelters,
            'total_coverage': total_coverage,
            'candidates_generated': len(all_candidates),
            'candidates_after_dedup': len(deduplicated),
            'candidate_sources': all_candidate_sources
        }
    
    def remove_duplicate_candidates_fast(self, candidates, min_distance_deg):
        """Fast duplicate removal using spatial indexing"""
        if not candidates:
            return candidates
        
        # Sort by coverage (descending) - keep best candidates
        candidates.sort(key=lambda x: x['buildings_covered'], reverse=True)
        
        # Use spatial grid for fast neighbor lookup
        filtered_candidates = []
        occupied_positions = set()
        
        # Grid size for spatial hashing
        grid_size = min_distance_deg
        
        for candidate in candidates:
            lat, lon = candidate['lat'], candidate['lon']
            
            # Convert to grid coordinates
            grid_x = int(lat / grid_size)
            grid_y = int(lon / grid_size)
            
            # Check surrounding grid cells for conflicts
            conflict = False
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    if (grid_x + dx, grid_y + dy) in occupied_positions:
                        # Check actual distance
                        for existing in filtered_candidates:
                            dist_sq = (lat - existing['lat'])**2 + (lon - existing['lon'])**2
                            if dist_sq < min_distance_deg**2:
                                conflict = True
                                break
                    if conflict:
                        break
                if conflict:
                    break
            
            if not conflict:
                filtered_candidates.append(candidate)
                occupied_positions.add((grid_x, grid_y))
        
        return filtered_candidates
    
    def optimal_shelter_selection(self, candidates, coverage_radius_m, target_count):
        """Efficient selection of best non-overlapping shelters"""
        if len(candidates) <= target_count:
            return candidates
        
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        min_distance_deg = coverage_radius_deg * 2.0  # No overlap constraint
        
        print(f"    🧠 Selecting best {target_count} from {len(candidates)} candidates...")
        
        # Use improved greedy algorithm with lookahead
        return self.greedy_selection_with_lookahead(candidates, min_distance_deg, target_count)
    
    def greedy_selection_with_lookahead(self, candidates, min_distance_deg, target_count):
        """Greedy selection with limited lookahead for better results"""
        candidates = candidates.copy()
        candidates.sort(key=lambda x: x['buildings_covered'], reverse=True)
        
        selected = []
        available = candidates.copy()
        
        while len(selected) < target_count and available:
            best_candidate = None
            best_score = 0
            
            # Look at top candidates and pick best considering future options
            lookahead_count = min(10, len(available))
            
            for i in range(lookahead_count):
                candidate = available[i]
                
                # Base score is the coverage
                score = candidate['buildings_covered']
                
                # Bonus for leaving more good options available
                candidate_coord = np.array([candidate['lat'], candidate['lon']])
                remaining_after = [
                    c for c in available[i+1:] 
                    if np.sqrt(np.sum((candidate_coord - np.array([c['lat'], c['lon']])) ** 2)) >= min_distance_deg
                ]
                
                # Small bonus for preserving high-value future options
                if remaining_after:
                    future_value = sum(c['buildings_covered'] for c in remaining_after[:5]) / 5
                    score += future_value * 0.1  # Small lookahead bonus
                
                if score > best_score:
                    best_score = score
                    best_candidate = candidate
            
            if best_candidate:
                selected.append(best_candidate)
                
                # Remove selected candidate and conflicting candidates
                candidate_coord = np.array([best_candidate['lat'], best_candidate['lon']])
                available = [
                    c for c in available 
                    if c != best_candidate and 
                    np.sqrt(np.sum((candidate_coord - np.array([c['lat'], c['lon']])) ** 2)) >= min_distance_deg
                ]
            else:
                break
        
        return selected
    
    def run_single_dbscan_config(self, building_coords, coverage_radius_deg, eps_mult, min_samples):
        """Run a single DBSCAN configuration - used for multithreading"""
        eps = coverage_radius_deg * eps_mult
        
        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
        cluster_labels = dbscan.fit_predict(building_coords)
        
        unique_labels = set(cluster_labels)
        
        config_key = f"dbscan_eps{eps_mult}_min{min_samples}"
        candidates = []
        candidate_count = 0
        
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
                    'buildings_covered': int(coverage),
                    'method': f'dbscan_centroid_eps{eps_mult}_min{min_samples}',
                    'cluster_size': int(len(cluster_buildings))
                })
                candidate_count += 1
            
            # 2. Medoid (point in cluster closest to centroid)
            distances_to_centroid = np.sqrt(np.sum((cluster_buildings - centroid) ** 2, axis=1))
            medoid_idx = np.argmin(distances_to_centroid)
            medoid = cluster_buildings[medoid_idx]
            coverage = self.calculate_coverage_score(medoid, building_coords, coverage_radius_deg)
            
            if coverage >= self.MIN_BUILDINGS_PER_CLUSTER:
                candidates.append({
                    'lat': float(medoid[0]),
                    'lon': float(medoid[1]),
                    'buildings_covered': int(coverage),
                    'method': f'dbscan_medoid_eps{eps_mult}_min{min_samples}',
                    'cluster_size': int(len(cluster_buildings))
                })
                candidate_count += 1
            
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
                        'buildings_covered': int(best_coverage),
                        'method': f'dbscan_best_eps{eps_mult}_min{min_samples}',
                        'cluster_size': int(len(cluster_buildings))
                    })
                    candidate_count += 1
        
        return config_key, candidates, candidate_count
    
    def print_candidate_summary(self, candidate_sources, shelters_selected, coverage_radius_m):
        """Print a nice table summarizing candidate sources"""
        print(f"\n    📊 Candidate Summary ({coverage_radius_m}m radius):")
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
            
            # Group by k value
            k_groups = {}
            for key, count in kmeans_sources.items():
                # Extract k value from key like "kmeans_k750_seed1"
                k_val = key.split('_')[1].replace('k', '')
                if k_val not in k_groups:
                    k_groups[k_val] = 0
                k_groups[k_val] += count
            
            for k_val in sorted(k_groups.keys(), key=int):
                count = k_groups[k_val]
                print(f"      k={k_val}: {count:4d} ({100*count/total_candidates:4.1f}%) [{self.N_KMEANS_SEEDS} seeds]")
        
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
        """Run complete optimization for a single run (legacy interface)"""
        return self.optimize_single_run_for_buildings(building_coords, coverage_radius_m, main_pbar)
    
    def optimize_for_radius(self, building_coords, building_features, 
                           shelter_features, coverage_radius_m, pbar=None):
        """Optimize shelter locations for specific radius"""
        
        print(f"\n  📊 Optimizing for {coverage_radius_m}m radius")
        
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
        
        # Run optimization on uncovered buildings
        print(f"    🎯 Optimizing for {len(uncovered_buildings)} uncovered buildings...")
        
        result = self.optimize_single_run_for_buildings(uncovered_buildings, coverage_radius_m, pbar)
        
        if not result:
            print("    ❌ No viable candidate locations found!")
            return None
        
        selected_shelters = result['shelters']
        
        # Calculate final coverage statistics
        buildings_covered = result['total_coverage']
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
        
        return result
    
    def run_full_optimization(self, buildings_file, shelters_file, output_dir='data/optimal_locations'):
        """Run enhanced optimization for all radii"""
        print("🏠 ENHANCED ENSEMBLE SHELTER OPTIMIZATION")
        print("=" * 70)
        print(f"Target: {self.TARGET_SHELTERS} shelters per radius")
        print(f"Radii: {self.RADII_TO_TEST} meters")
        print(f"Methods: Original DBSCAN + Enhanced DBSCAN (24 configs) + K-means (k=750,1500 × {self.N_KMEANS_SEEDS} seeds)")
        print(f"Strategy: Generate diverse candidates, then optimal non-overlapping selection")
        print(f"Multithreading: {'Enabled' if self.USE_MULTITHREADING else 'Disabled'} ({self.MAX_WORKERS} workers)" if self.USE_MULTITHREADING else "Multithreading: Disabled")
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
            dbscan_steps = 1 + (len(self.DBSCAN_EPS_MULTIPLIERS) * len(self.DBSCAN_MIN_SAMPLES))
            kmeans_steps = len(self.KMEANS_K_VALUES) * self.N_KMEANS_SEEDS
            total_steps = dbscan_steps + kmeans_steps + 2
            with tqdm(total=total_steps, desc=f"  {radius_m}m optimization") as pbar:
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
        print(f"\n🎉 Enhanced optimization completed!")
        print(f"📁 Results saved in: {output_dir}/")

def main():
    """Example usage"""
    optimizer = EnhancedShelterOptimizer()
    
    # Run enhanced optimization with correct file names
    optimizer.run_full_optimization(
        buildings_file='data/buildings_light.geojson',
        shelters_file='data/shelters.geojson',
        output_dir='data/optimal_locations'
    )

if __name__ == "__main__":
    main()
    