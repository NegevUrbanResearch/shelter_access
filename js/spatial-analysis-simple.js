/**
 * Simple Spatial Analysis Module - Loads Precomputed Optimal Shelter Locations
 * Uses precalculated data from shelter_optimizer.py DBSCAN + Greedy algorithm
 */

class SimpleSpatialAnalyzer {
    constructor() {
        this.buildings = null;
        this.shelters = null;
        this.optimalData = new Map(); // Cache for precomputed data
        this.coverageRadius = 100;
        this.includeRequestedShelters = false;
        
        // Constants
        this.ACCESSIBILITY_OPTIONS = [100, 150, 200, 250, 300];
        this.MAX_SHELTERS = 150;
        this.PEOPLE_PER_BUILDING = 7;
    }
    
    /**
     * Load spatial data (buildings and shelters)
     */
    async loadData() {
        console.log('Loading spatial data...');
        
        try {
            const [buildingResponse, shelterResponse] = await Promise.all([
                fetch('data/buildings.geojson'),
                fetch('data/shelters.geojson')
            ]);
            
            this.buildings = await buildingResponse.json();
            this.shelters = await shelterResponse.json();
            
            console.log(`✓ Loaded ${this.buildings.features.length} buildings and ${this.shelters.features.length} shelters`);
            
            // Load default optimal data
            await this.loadOptimalData(this.coverageRadius, this.includeRequestedShelters);
            
            return true;
        } catch (error) {
            console.error('Error loading spatial data:', error);
            throw error;
        }
    }
    
    /**
     * Load precomputed optimal shelter data
     */
    async loadOptimalData(radius, includeRequested) {
        // Only support 'optimal_shelters' scenario
        const cacheKey = `optimal_shelters_${radius}m`;
        if (this.optimalData.has(cacheKey)) {
            return this.optimalData.get(cacheKey);
        }
        try {
            console.log(`Loading optimal data: ${cacheKey}...`);
            const response = await fetch(`data/optimal_locations/${cacheKey}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load: ${response.status}`);
            }
            const data = await response.json();
            this.optimalData.set(cacheKey, data);
            console.log(`✓ Loaded ${data.optimal_locations.length} optimal locations for ${cacheKey}`);
            return data;
        } catch (error) {
            console.error(`Error loading ${cacheKey}:`, error);
            return { optimal_locations: [], existing_shelters: [], statistics: {} };
        }
    }
    
    /**
     * Set coverage radius
     */
    async setCoverageRadius(radius) {
        this.coverageRadius = radius;
        await this.loadOptimalData(radius);
        return this.MAX_SHELTERS;
    }
    
    /**
     * Set whether to include requested shelters
     */
    async setIncludeRequestedShelters(includeRequested) {
        // No longer supports includeRequested, always false
        this.includeRequestedShelters = false;
        await this.loadOptimalData(this.coverageRadius, false);
        return this.MAX_SHELTERS;
    }
    
    /**
     * Get top N optimal shelter locations
     */
    async getOptimalLocations(numShelters) {
        const data = await this.loadOptimalData(this.coverageRadius);
        const maxShelters = Math.min(numShelters, this.MAX_SHELTERS, data.optimal_locations.length);
        return data.optimal_locations.slice(0, maxShelters);
    }
    
    /**
     * Get requested shelter evaluation with specific pairing to optimal locations
     */
    getRequestedShelterEvaluation(numNewShelters = 0) {
        const cacheKey = `optimal_shelters_${this.coverageRadius}m`;
        const data = this.optimalData.get(cacheKey);
        if (!data || !data.existing_shelters || !data.optimal_locations) return null;
        
        // Get requested shelters (status "Request")
        const requestedShelters = data.existing_shelters.filter(shelter => 
            shelter.properties && shelter.properties.status === "Request"
        );
        
        if (requestedShelters.length === 0) return null;
        
        // We can only replace as many requested shelters as we're building new ones
        const maxReplacements = Math.min(numNewShelters, requestedShelters.length);
        
        if (maxReplacements === 0) {
            return {
                pairedShelters: [],
                totalPairs: 0,
                totalImprovement: 0,
                totalRequested: requestedShelters.length
            };
        }
        
        // Sort requested shelters by coverage (worst first)
        const sortedRequested = [...requestedShelters].sort((a, b) => 
            (a.people_covered || 0) - (b.people_covered || 0)
        );
        
        // Get the top N optimal locations we're actually building
        const optimalLocations = data.optimal_locations.slice(0, numNewShelters);
        
        // Pair worst requested with best optimal, but only up to the number we're building
        const pairedShelters = [];
        for (let i = 0; i < maxReplacements; i++) {
            const requested = sortedRequested[i];
            const optimal = optimalLocations[i];
            
            const requestedCoverage = requested.people_covered || 0;
            const optimalCoverage = optimal.people_covered || 0;
            const improvement = optimalCoverage - requestedCoverage;
            
            if (improvement > 0) {
                pairedShelters.push({
                    requested: requested,
                    optimal: optimal,
                    improvement: improvement,
                    requestedCoverage: requestedCoverage,
                    optimalCoverage: optimalCoverage,
                    requestedRank: i + 1, // Rank among worst requested (1 = worst)
                    optimalRank: i + 1  // Rank among selected optimal (1 = best)
                });
            }
        }
        
        const totalImprovement = pairedShelters.reduce((sum, pair) => sum + pair.improvement, 0);
        
        return {
            pairedShelters,
            totalPairs: pairedShelters.length,
            totalImprovement,
            totalRequested: requestedShelters.length
        };
    }
    
    /**
     * Calculate coverage statistics
     */
    calculateCoverageStats(proposedShelters = null) {
        const cacheKey = `optimal_shelters_${this.coverageRadius}m`;
        const data = this.optimalData.get(cacheKey);
        
        if (!data || !data.statistics) {
            return {
                currentCoverage: 0,
                newCoverage: 0,
                totalCoverage: 0,
                buildingsCovered: 0,
                totalBuildings: 0,
                peopleCovered: 0,
                totalPeople: 0,
                coveragePercent: 0
            };
        }
        
        const stats = data.statistics;
        const numSelected = proposedShelters ? proposedShelters.length : 0;
        
        // Calculate coverage for selected shelters
        const selectedOptimal = data.optimal_locations.slice(0, numSelected);
        const newPeopleCovered = selectedOptimal.reduce((sum, loc) => sum + (loc.people_covered || 0), 0);
        const newBuildingsCovered = selectedOptimal.reduce((sum, loc) => sum + (loc.buildings_covered || 0), 0);
        
        // Existing coverage (total - new from all optimal locations)
        const existingCoverage = (stats.total_people_covered || 0) - (stats.new_people_covered || 0);
        const totalCoverage = existingCoverage + newPeopleCovered;
        
        return {
            currentCoverage: Math.max(0, existingCoverage),
            newCoverage: newPeopleCovered,
            totalCoverage: totalCoverage,
            buildingsCovered: newBuildingsCovered,
            totalBuildings: stats.total_buildings || 0,
            peopleCovered: totalCoverage,
            totalPeople: stats.total_people || 0,
            coveragePercent: stats.total_people > 0 ? (totalCoverage / stats.total_people) * 100 : 0
        };
    }
    
    /**
     * Get active shelters for visualization
     */
    getActiveShelters() {
        if (!this.shelters) return [];
        
        return this.shelters.features.filter(shelter => {
            if (!shelter.properties) return false;
            
            if (this.includeRequestedShelters) {
                // Include both built and requested
                return shelter.properties.status === 'Built' || shelter.properties.status === 'Request';
            } else {
                // Only built shelters
                return shelter.properties.status === 'Built';
            }
        });
    }
    
    /**
     * Get requested shelters for visualization
     */
    getRequestedShelters() {
        if (!this.shelters || this.includeRequestedShelters) return [];
        
        return this.shelters.features.filter(shelter => 
            shelter.properties && shelter.properties.status === 'Request'
        );
    }
    
    /**
     * Get data bounds for map initialization
     */
    getDataBounds() {
        return {
            west: 34.5,
            east: 35.5,
            south: 30.5,
            north: 32.0
        };
    }
    
    /**
     * Get current data for visualization
     */
    getCurrentData() {
        return {
            buildings: this.buildings,
            shelters: this.shelters,
            coverageRadius: this.coverageRadius,
            includeRequestedShelters: this.includeRequestedShelters
        };
    }
    
    /**
     * Get accessibility options
     */
    getAccessibilityOptions() {
        return this.ACCESSIBILITY_OPTIONS.map(distance => ({
            value: distance,
            label: `${distance}m`
        }));
    }
    
    /**
     * Validate that all required data is loaded
     */
    isDataReady() {
        return this.buildings !== null && this.shelters !== null;
    }
}

// Export for use in main application
window.SimpleSpatialAnalyzer = SimpleSpatialAnalyzer; 