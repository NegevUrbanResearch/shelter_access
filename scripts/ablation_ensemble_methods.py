#!/usr/bin/env python3
"""
Ablation: compare candidate-generation strategies for shelter siting.

Variants (same greedy non-overlap selection for all):
  1. original_dbscan  — single DBSCAN (eps=radius, min_samples=5), centroids
  2. enhanced_dbscan  — multi-eps DBSCAN + original DBSCAN (no K-means)
  3. kmeans_k500      — K-means only with k=500 (matches planning ceiling)
  4. kmeans_only      — K-means only (k=750,1500 × 2 seeds; production setting)
  5. ensemble         — full pipeline (enhanced DBSCAN + K-means)

Writes output/ablation_ensemble_methods.json and a short CSV summary.
Run from repo root:
  python scripts/ablation_ensemble_methods.py
K-means k justification only (faster):
  python scripts/ablation_ensemble_methods.py --modes kmeans_k500 kmeans_only --out output/ablation_kmeans_k.json
Optional: restrict radii for a quicker smoke test:
  python scripts/ablation_ensemble_methods.py --radii 200
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from copy import deepcopy

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shelter_optimizer_ensemble import EnhancedShelterOptimizer


# Default Table A.1 variants (kmeans_k500 is opt-in for k-justification)
VARIANTS = (
    "original_dbscan",
    "enhanced_dbscan",
    "kmeans_only",
    "ensemble",
)
ALL_VARIANTS = VARIANTS + ("kmeans_k500",)


class AblationOptimizer(EnhancedShelterOptimizer):
    """Same optimizer with pluggable candidate-generation modes."""

    def optimize_single_run_for_buildings(self, building_coords, coverage_radius_m, pbar=None, mode="ensemble"):
        all_candidates = []
        all_candidate_sources = {}

        def progress_callback(msg):
            if pbar:
                if msg == "step_complete":
                    pbar.update(1)
                else:
                    pbar.set_description(f"  {msg}")

        if mode == "original_dbscan":
            progress_callback("Original DBSCAN only...")
            cands, sources = self.generate_original_dbscan_candidates(
                building_coords, coverage_radius_m, progress_callback=progress_callback
            )
            all_candidates.extend(cands)
            all_candidate_sources.update(sources)
        elif mode == "enhanced_dbscan":
            progress_callback("Enhanced DBSCAN (no K-means)...")
            cands, sources = self.generate_dbscan_candidates(
                building_coords, coverage_radius_m, run_id=0, progress_callback=progress_callback
            )
            all_candidates.extend(cands)
            all_candidate_sources.update(sources)
        elif mode == "kmeans_k500":
            progress_callback("K-means k=500 only...")
            cands, sources = self.generate_kmeans_candidates(
                building_coords,
                coverage_radius_m,
                run_id=0,
                progress_callback=progress_callback,
                k_values=[500],
            )
            all_candidates.extend(cands)
            all_candidate_sources.update(sources)
        elif mode == "kmeans_only":
            progress_callback("K-means only...")
            cands, sources = self.generate_kmeans_candidates(
                building_coords, coverage_radius_m, run_id=0, progress_callback=progress_callback
            )
            all_candidates.extend(cands)
            all_candidate_sources.update(sources)
        elif mode == "ensemble":
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
        else:
            raise ValueError(f"Unknown mode: {mode}")

        if not all_candidates:
            return None

        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        deduplicated = self.remove_duplicate_candidates_fast(
            all_candidates, coverage_radius_deg * 0.1
        )
        selected_shelters = self.optimal_shelter_selection(
            deduplicated, coverage_radius_m, self.TARGET_SHELTERS
        )

        return {
            "run_id": 0,
            "mode": mode,
            "shelters": selected_shelters,
            "total_coverage": sum(s["buildings_covered"] for s in selected_shelters),
            "candidates_generated": len(all_candidates),
            "candidates_after_dedup": len(deduplicated),
            "candidate_sources": all_candidate_sources,
            "method_counts": _count_methods(selected_shelters),
        }

    def run_ablation_for_radius(
        self, building_coords, building_features, shelter_features, coverage_radius_m, modes
    ):
        coverage_radius_deg, _ = self.meters_to_degrees(coverage_radius_m)
        existing_shelters, _ = self.process_existing_shelters(shelter_features)
        uncovered_buildings, _ = self.filter_existing_coverage(
            building_coords, existing_shelters, coverage_radius_deg
        )
        already_covered = len(building_coords) - len(uncovered_buildings)
        n_buildings = len(building_coords)

        rows = []
        for mode in modes:
            print(f"\n  --- mode={mode} @ {coverage_radius_m}m ---")
            result = self.optimize_single_run_for_buildings(
                uncovered_buildings, coverage_radius_m, pbar=None, mode=mode
            )
            if not result:
                rows.append(
                    {
                        "radius_m": coverage_radius_m,
                        "mode": mode,
                        "shelters_selected": 0,
                        "new_buildings_covered": 0,
                        "total_buildings_covered": already_covered,
                        "coverage_percentage": round(100.0 * already_covered / n_buildings, 2),
                        "candidates_generated": 0,
                        "candidates_after_dedup": 0,
                        "method_counts": {},
                    }
                )
                continue

            new_covered = result["total_coverage"]
            total_covered = new_covered + already_covered
            rows.append(
                {
                    "radius_m": coverage_radius_m,
                    "mode": mode,
                    "shelters_selected": len(result["shelters"]),
                    "new_buildings_covered": new_covered,
                    "total_buildings_covered": total_covered,
                    "coverage_percentage": round(100.0 * total_covered / n_buildings, 2),
                    "candidates_generated": result["candidates_generated"],
                    "candidates_after_dedup": result["candidates_after_dedup"],
                    "method_counts": result["method_counts"],
                }
            )
            print(
                f"    → {rows[-1]['coverage_percentage']:.1f}% coverage "
                f"({rows[-1]['shelters_selected']} shelters, "
                f"{rows[-1]['candidates_after_dedup']} unique candidates)"
            )
        return rows


def _count_methods(shelters):
    counts = {}
    for s in shelters:
        m = s.get("method", "unknown")
        if m.startswith("kmeans"):
            family = "kmeans"
        elif m.startswith("original_dbscan"):
            family = "original_dbscan"
        elif m.startswith("dbscan"):
            family = "enhanced_dbscan"
        else:
            family = m
        counts[family] = counts.get(family, 0) + 1
    return counts


def main():
    parser = argparse.ArgumentParser(description="Ablation of ensemble candidate sources")
    parser.add_argument(
        "--radii",
        type=int,
        nargs="+",
        default=None,
        help="Accessibility radii to test (default: all five)",
    )
    parser.add_argument(
        "--modes",
        nargs="+",
        default=list(VARIANTS),
        choices=list(ALL_VARIANTS),
        help="Which variants to run (include kmeans_k500 to test k=planning ceiling)",
    )
    parser.add_argument(
        "--buildings",
        default="data/buildings_light.geojson",
    )
    parser.add_argument(
        "--shelters",
        default="data/shelters.geojson",
    )
    parser.add_argument(
        "--out",
        default="output/ablation_ensemble_methods.json",
    )
    args = parser.parse_args()

    opt = AblationOptimizer()
    radii = args.radii or deepcopy(opt.RADII_TO_TEST)

    print("ABLATION: candidate-generation strategies")
    print(f"Radii: {radii}")
    print(f"Modes: {args.modes}")
    print(f"Target shelters: {opt.TARGET_SHELTERS}")

    building_coords, building_features = opt.load_geojson(args.buildings)
    _, shelter_features = opt.load_geojson(args.shelters)
    print(f"Buildings: {len(building_features)}; shelter features: {len(shelter_features)}")

    all_rows = []
    for radius_m in radii:
        print(f"\n===== RADIUS {radius_m}m =====")
        all_rows.extend(
            opt.run_ablation_for_radius(
                building_coords,
                building_features,
                shelter_features,
                radius_m,
                args.modes,
            )
        )

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    payload = {
        "description": (
            "Coverage after greedy non-overlap selection (min separation = 2×radius). "
            "buildings_covered scores are precomputed per candidate on uncovered buildings; "
            "non-overlap makes summed coverage a valid total under the model."
        ),
        "parameters": {
            "target_shelters": opt.TARGET_SHELTERS,
            "dbscan_eps_multipliers": opt.DBSCAN_EPS_MULTIPLIERS,
            "dbscan_min_samples": opt.DBSCAN_MIN_SAMPLES,
            "kmeans_k_values": opt.KMEANS_K_VALUES,
            "n_kmeans_seeds": opt.N_KMEANS_SEEDS,
            "min_buildings_per_cluster": opt.MIN_BUILDINGS_PER_CLUSTER,
        },
        "results": all_rows,
    }
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=2)

    csv_path = args.out.replace(".json", ".csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "radius_m",
                "mode",
                "shelters_selected",
                "new_buildings_covered",
                "total_buildings_covered",
                "coverage_percentage",
                "candidates_generated",
                "candidates_after_dedup",
            ],
        )
        writer.writeheader()
        for row in all_rows:
            writer.writerow({k: row[k] for k in writer.fieldnames})

    print("\n=== SUMMARY (coverage %) ===")
    by_radius = {}
    for row in all_rows:
        by_radius.setdefault(row["radius_m"], {})[row["mode"]] = row["coverage_percentage"]
    header = ["radius_m"] + list(args.modes)
    print("\t".join(header))
    for r in radii:
        vals = [str(r)] + [str(by_radius.get(r, {}).get(m, "")) for m in args.modes]
        print("\t".join(vals))

    print(f"\nSaved {args.out}")
    print(f"Saved {csv_path}")


if __name__ == "__main__":
    main()
