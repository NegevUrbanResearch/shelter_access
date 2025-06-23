/**
 * Main Application for Shelter Access Analysis
 * Uses deck.gl for visualization and spatial analysis
 */

class ShelterAccessApp {
    constructor() {
        this.spatialAnalyzer = new SimpleSpatialAnalyzer();
        this.deckgl = null;
        this.currentLayers = [];
        this.proposedShelters = [];
        this.coverageRadius = 100;
        this.numNewShelters = 10;
        this.maxShelters = 150; // Updated to match script's TARGET_SHELTERS
        this.isAnalyzing = false;
        
        // Basemap configuration (satellite as default, like in hospital access app)
        this.currentBasemap = 'satellite';
        this.basemaps = {
            satellite: {
                name: 'Satellite',
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            },
            light: {
                name: 'Light',
                url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
            },
            dark: {
                name: 'Dark',
                url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
            }
        };
        
        // UI elements
        this.elements = {
            accessibilityDistance: document.getElementById('accessibilityDistance'),
            accessibilityDistanceValue: document.getElementById('accessibilityDistanceValue'),
            newSheltersSlider: document.getElementById('newShelters'),
            newSheltersValue: document.getElementById('newSheltersValue'),
            includePlannedCheckbox: document.getElementById('includePlanned'),
            basemapSelect: document.getElementById('basemapSelect'),
            loading: document.getElementById('loading'),
            tooltip: document.getElementById('tooltip'),
            attribution: document.getElementById('attribution'),
            currentCoverage: document.getElementById('currentCoverage'),
            newCoverage: document.getElementById('newCoverage'),
            buildingsCovered: document.getElementById('buildingsCovered'),
            additionalPeople: document.getElementById('additionalPeople'),
            suboptimalPlanned: document.getElementById('suboptimalPlanned'),
            underservedPeople: document.getElementById('underservedPeople')
        };
        
        this.initializeApp();
    }
    
    /**
     * Initialize the application
     */
    async initializeApp() {
        try {
            console.log('🚀 Initializing Shelter Access Analysis App...');
            
            // Initialize UI controls
            this.setupEventListeners();
            
            // Load spatial data
            await this.spatialAnalyzer.loadData();
            
            // Initialize map
            this.initializeMap();
            
            // Set initial attribution
            this.updateAttribution();
            
            // Initialize planned analysis section visibility
            const plannedAnalysisDiv = document.getElementById('plannedAnalysis');
            const includePlannedChecked = this.elements.includePlannedCheckbox.checked;
            if (plannedAnalysisDiv) {
                plannedAnalysisDiv.style.display = includePlannedChecked ? 'none' : 'block';
            }
            
            // Initial analysis
            this.updateCoverageAnalysis();
            
            // Hide loading overlay
            this.hideLoading();
            
            console.log('✅ App initialized successfully!');
            
        } catch (error) {
            console.error('❌ Failed to initialize app:', error);
            this.showError('Failed to load application. Please refresh and try again.');
        }
    }
    
    /**
     * Setup event listeners for UI controls
     */
    setupEventListeners() {
        // Accessibility distance slider
        this.elements.accessibilityDistance.addEventListener('input', async (e) => {
            this.coverageRadius = parseInt(e.target.value);
            this.elements.accessibilityDistanceValue.textContent = `${this.coverageRadius}m`;
            
            const maxShelters = await this.spatialAnalyzer.setCoverageRadius(this.coverageRadius);
            this.maxShelters = maxShelters;
            
            // Update slider max
            this.elements.newSheltersSlider.max = this.maxShelters;
            if (this.numNewShelters > this.maxShelters) {
                this.numNewShelters = this.maxShelters;
                this.elements.newSheltersSlider.value = this.maxShelters;
                this.elements.newSheltersValue.textContent = this.maxShelters;
            }
            
            // Clear previous analysis and update
            this.proposedShelters = [];
            await this.updateOptimalLocations();
        });
        
        // New shelters slider - real-time updates
        this.elements.newSheltersSlider.addEventListener('input', async (e) => {
            this.numNewShelters = parseInt(e.target.value);
            this.elements.newSheltersValue.textContent = this.numNewShelters;
            await this.updateOptimalLocations();
        });
        
        // Planned shelters checkbox
        this.elements.includePlannedCheckbox.addEventListener('change', async (e) => {
            const maxShelters = await this.spatialAnalyzer.setIncludePlannedShelters(e.target.checked);
            this.maxShelters = maxShelters;
            
            // Update slider max
            this.elements.newSheltersSlider.max = this.maxShelters;
            if (this.numNewShelters > this.maxShelters) {
                this.numNewShelters = this.maxShelters;
                this.elements.newSheltersSlider.value = this.maxShelters;
                this.elements.newSheltersValue.textContent = this.maxShelters;
            }
            
            // Show/hide planned analysis section
            const plannedAnalysisDiv = document.getElementById('plannedAnalysis');
            if (e.target.checked) {
                // Hide planned analysis when planned shelters are included as existing
                plannedAnalysisDiv.style.display = 'none';
            } else {
                // Show planned analysis when planned shelters are not included
                plannedAnalysisDiv.style.display = 'block';
            }
            
            // Reset analysis when toggling planned shelters
            this.proposedShelters = [];
            await this.updateOptimalLocations();
        });
        
        // Basemap selection
        this.elements.basemapSelect.addEventListener('change', (e) => {
            this.changeBasemap(e.target.value);
        });
        
        // Analyze button
        this.elements.analyzeBtn.addEventListener('click', () => {
            this.runOptimalLocationAnalysis();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.runOptimalLocationAnalysis();
            }
        });
    }
    
    /**
     * Initialize deck.gl map
     */
    initializeMap() {
        // Get data bounds for initial view
        const bounds = this.spatialAnalyzer.getDataBounds();
        
        // Calculate center and zoom level
        const centerLng = (bounds.west + bounds.east) / 2;
        const centerLat = (bounds.south + bounds.north) / 2;
        
        // Initialize deck.gl without Mapbox dependency
        this.deckgl = new deck.DeckGL({
            container: 'map',
            initialViewState: {
                longitude: centerLng,
                latitude: centerLat,
                zoom: 12,
                pitch: 0,
                bearing: 0
            },
            controller: true,
            onHover: (info) => this.handleHover(info),
            onClick: (info) => this.handleClick(info),
            onViewStateChange: ({viewState}) => this.handleViewStateChange(viewState)
        });
        
        // Store initial zoom level
        this._currentZoom = 12;
        
        // Initial layer setup
        this.updateVisualization();
    }
    
    /**
     * Create visualization layers (no buildings - satellite imagery shows the area)
     */
    createLayers() {
        const layers = [];
        
        // Active shelters layer (existing + planned if included)
        const activeShelters = this.spatialAnalyzer.getActiveShelters();
        layers.push(new deck.ScatterplotLayer({
            id: 'active-shelters',
            data: activeShelters,
            pickable: true,
            opacity: 0.9,
            stroked: true,
            filled: true,
            radiusScale: 1,
            radiusMinPixels: 8,
            radiusMaxPixels: 15,
            lineWidthMinPixels: 2,
            getPosition: d => d.geometry.coordinates,
            getRadius: 12,
            getFillColor: d => {
                if (d.properties.status === 'Active') {
                    return [231, 76, 60, 255]; // Red for existing
                } else {
                    return [52, 152, 219, 255]; // Blue for planned
                }
            },
            getLineColor: [255, 255, 255, 255]
        }));
        
        // Planned shelters layer (when not included as active)
        if (!this.spatialAnalyzer.includePlannedShelters) {
            const plannedShelters = this.spatialAnalyzer.getPlannedShelters();
            const plannedEval = this.spatialAnalyzer.getPlannedShelterEvaluation();
            
            // Get IDs of suboptimal planned shelters
            const suboptimalIds = new Set();
            if (plannedEval && plannedEval.suboptimalPlanned) {
                plannedEval.suboptimalPlanned.forEach(shelter => {
                    if (shelter.properties && shelter.properties.shelter_id) {
                        suboptimalIds.add(shelter.properties.shelter_id);
                    }
                });
            }
            
            layers.push(new deck.ScatterplotLayer({
                id: 'planned-shelters',
                data: plannedShelters,
                pickable: true,
                opacity: 0.8,
                stroked: true,
                filled: true,
                radiusScale: 1,
                radiusMinPixels: 8,
                radiusMaxPixels: 15,
                lineWidthMinPixels: 2,
                getPosition: d => d.geometry.coordinates,
                getRadius: 10,
                getFillColor: d => {
                    // Highlight suboptimal planned shelters
                    if (suboptimalIds.has(d.properties.shelter_id)) {
                        return [255, 193, 7, 255]; // Warning yellow/orange for suboptimal
                    }
                    return [52, 152, 219, 200]; // Blue for planned
                },
                getLineColor: [255, 255, 255, 255]
            }));
            
            // Add warning markers for suboptimal planned shelters
            if (plannedEval && plannedEval.suboptimalPlanned.length > 0) {
                const suboptimalShelters = plannedShelters.filter(shelter => 
                    suboptimalIds.has(shelter.properties.shelter_id)
                );
                
                layers.push(new deck.TextLayer({
                    id: 'suboptimal-markers',
                    data: suboptimalShelters,
                    pickable: true,
                    getPosition: d => d.geometry.coordinates,
                    getText: '⚠️',
                    getSize: 16,
                    getAngle: 0,
                    getTextAnchor: 'middle',
                    getAlignmentBaseline: 'center',
                    getColor: [255, 87, 34, 255] // Deep orange for warnings
                }));
            }
        }
        
        // Proposed/Optimal shelters layer
        if (this.proposedShelters.length > 0) {
            layers.push(new deck.ScatterplotLayer({
                id: 'proposed-shelters',
                data: this.proposedShelters.map(shelter => ({
                    coordinates: [shelter.lon, shelter.lat],
                    ...shelter
                })),
                pickable: true,
                opacity: 0.9,
                stroked: true,
                filled: true,
                radiusScale: 1,
                radiusMinPixels: 10,
                radiusMaxPixels: 18,
                lineWidthMinPixels: 2,
                getPosition: d => d.coordinates,
                getRadius: 14,
                getFillColor: [243, 156, 18, 255], // Orange for proposed
                getLineColor: [255, 255, 255, 255]
            }));
            
            // Coverage circles for proposed shelters
            const proposedCoverageData = this.proposedShelters.map(shelter => {
                const center = [shelter.lon, shelter.lat];
                return turf.buffer(turf.point(center), this.coverageRadius, { units: 'meters' });
            });
            
            layers.push(new deck.GeoJsonLayer({
                id: 'proposed-coverage',
                data: turf.featureCollection(proposedCoverageData),
                pickable: false,
                stroked: true,
                filled: true,
                lineWidthMinPixels: 2,
                getFillColor: [243, 156, 18, 40], // Semi-transparent orange
                getLineColor: [243, 156, 18, 120],
                getLineWidth: 2
            }));
        }
        
        // Coverage circles for active shelters
        layers.push(new deck.GeoJsonLayer({
            id: 'active-coverage',
            data: this.createCoverageCircles(activeShelters, this.coverageRadius),
            pickable: false,
            stroked: true,
            filled: true,
            lineWidthMinPixels: 2,
            getFillColor: [231, 76, 60, 30], // Semi-transparent red
            getLineColor: [231, 76, 60, 100],
            getLineWidth: 2
        }));
        
        return layers;
    }
    
    /**
     * Create coverage circle geometries
     */
    createCoverageCircles(shelters, radius) {
        const circles = shelters.map(shelter => {
            const center = shelter.geometry ? shelter.geometry.coordinates : shelter.coordinates;
            return turf.buffer(turf.point(center), radius, { units: 'meters' });
        });
        
        return turf.featureCollection(circles);
    }
    
    /**
     * Update visualization layers
     */
    updateVisualization() {
        if (!this.deckgl) return;

        const dataLayers = this.createLayers();
        
        // Get current basemap configuration
        const basemapConfig = this.basemaps[this.currentBasemap];
        
        // Create tile layer with proper URL handling
        const tileLayer = new deck.TileLayer({
            id: 'base-tiles',
            data: basemapConfig.url,
            minZoom: 0,
            maxZoom: 19,
            tileSize: 256,
            getTileData: (tile) => {
                const { x, y, z } = tile.index;
                let tileUrl = basemapConfig.url;
                
                // Handle different URL patterns
                if (tileUrl.includes('{s}')) {
                    // For Carto maps with subdomain pattern
                    const subdomains = ['a', 'b', 'c', 'd'];
                    const subdomain = subdomains[Math.abs(x + y) % subdomains.length];
                    tileUrl = tileUrl.replace('{s}', subdomain);
                }
                
                // Replace standard tile parameters
                tileUrl = tileUrl
                    .replace('{z}', z)
                    .replace('{y}', y)
                    .replace('{x}', x)
                    .replace('{r}', ''); // Remove retina suffix if present
                
                return tileUrl;
            },
            renderSubLayers: props => {
                const {
                    bbox: {west, south, east, north}
                } = props.tile;
                
                return new deck.BitmapLayer(props, {
                    data: null,
                    image: props.data,
                    bounds: [west, south, east, north]
                });
            }
        });
        
        // Combine base layer with data layers
        const allLayers = [tileLayer, ...dataLayers];
        
        this.deckgl.setProps({ layers: allLayers });
        this.updateCoverageAnalysis();
    }
    
    /**
     * Run optimal location analysis using precomputed data
     */
    async runOptimalLocationAnalysis() {
        if (this.isAnalyzing) return;
        
        try {
            this.isAnalyzing = true;
            this.showLoading('🔄 Loading optimal locations...');
            this.elements.analyzeBtn.disabled = true;
            this.elements.analyzeBtn.textContent = '🔄 Loading...';
            
            // Load optimal locations from precomputed data
            const optimalLocations = await this.spatialAnalyzer.getOptimalLocations(this.numNewShelters);
            
            // Store directly - they're already in the right format
            this.proposedShelters = optimalLocations;
            
            // Update visualization
            this.updateVisualization();
            
            console.log(`✅ Loaded ${optimalLocations.length} optimal locations`);
            
        } catch (error) {
            console.error('❌ Loading optimal locations failed:', error);
            this.showError('Failed to load optimal locations. Please try again.');
        } finally {
            this.isAnalyzing = false;
            this.hideLoading();
            this.elements.analyzeBtn.disabled = false;
            this.elements.analyzeBtn.textContent = '🔍 Analyze Optimal Locations';
        }
    }
    
    /**
     * Update coverage analysis and statistics
     */
    updateCoverageAnalysis() {
        if (!this.spatialAnalyzer.isDataReady()) return;
        
        const stats = this.spatialAnalyzer.calculateCoverageStats(this.proposedShelters);
        const plannedEval = this.spatialAnalyzer.getPlannedShelterEvaluation();
        
        // Update main statistics
        if (this.elements.currentCoverage) {
            this.elements.currentCoverage.textContent = `${((stats.currentCoverage / stats.totalPeople) * 100).toFixed(1)}%`;
        }
        if (this.elements.newCoverage) {
            this.elements.newCoverage.textContent = `${stats.coveragePercent.toFixed(1)}%`;
        }
        if (this.elements.buildingsCovered) {
            this.elements.buildingsCovered.textContent = stats.buildingsCovered.toLocaleString();
        }
        if (this.elements.additionalPeople) {
            this.elements.additionalPeople.textContent = stats.newCoverage.toLocaleString();
        }
        
        // Update planned shelter analysis
        if (plannedEval && !this.spatialAnalyzer.includePlannedShelters) {
            if (this.elements.suboptimalPlanned) {
                this.elements.suboptimalPlanned.textContent = plannedEval.totalSuboptimal.toString();
            }
            if (this.elements.underservedPeople) {
                this.elements.underservedPeople.textContent = plannedEval.totalUnderservedPeople.toLocaleString();
            }
        } else {
            // Clear planned analysis when including planned shelters
            if (this.elements.suboptimalPlanned) {
                this.elements.suboptimalPlanned.textContent = '--';
            }
            if (this.elements.underservedPeople) {
                this.elements.underservedPeople.textContent = '--';
            }
        }
    }
    
    /**
     * Handle hover events
     */
    handleHover(info) {
        const { object, x, y } = info;
        const tooltip = this.elements.tooltip;
        
        if (object) {
            let content = '';
            
                         if (info.layer.id === 'buildings') {
                 const area = object.properties.area_m2 || 'Unknown';
                 const displayArea = typeof area === 'number' ? area.toFixed(0) + ' m²' : area;
                 content = `
                     <strong>Building</strong><br>
                     Area: ${displayArea}
                 `;
            } else if (info.layer.id === 'active-shelters') {
                const status = object.properties.status;
                const capacity = object.properties.capacity || 'Unknown';
                content = `
                    <strong>${status} Shelter</strong><br>
                    Coverage: ${this.coverageRadius}m radius<br>
                    Capacity: ${capacity} people
                `;
            } else if (info.layer.id === 'planned-shelters') {
                const capacity = object.properties.capacity || 'Unknown';
                content = `
                    <strong>Planned Shelter</strong><br>
                    Coverage: ${this.coverageRadius}m radius<br>
                    Capacity: ${capacity} people<br>
                    Status: Approved but not active
                `;
            } else if (info.layer.id === 'proposed-shelters') {
                const score = object.score ? object.score.toFixed(1) : 'N/A';
                content = `
                    <strong>Proposed Shelter</strong><br>
                    Coverage: ${this.coverageRadius}m radius<br>
                    Score: ${score}
                `;
            } else if (info.layer.id === 'suboptimal-planned') {
                const uncoveredPeople = object.uncoveredPeople || 0;
                const distance = object.distanceToOptimal ? 
                    `${Math.round(object.distanceToOptimal)}m` : 'Unknown';
                const plannedRank = object.plannedRank || '?';
                const optimalRank = object.optimalRank || '?';
                const pairingStrategy = object.pairingStrategy || 'No pairing info';
                
                content = `
                    <strong>⚠️ Suboptimal Planned Shelter</strong><br>
                    Coverage: ${this.coverageRadius}m radius<br>
                    Underserving: ~${uncoveredPeople} people<br>
                    Distance to optimal: ${distance}<br>
                    <strong>Pairing Analysis:</strong><br>
                    ${pairingStrategy}<br>
                    <em>Planned rank ${plannedRank} of ${this.plannedEvaluation?.totalPlanned || '?'} (worst=1)</em><br>
                    <em>Paired with optimal rank ${optimalRank} (best=1)</em>
                `;
            }
            
            if (content) {
                tooltip.innerHTML = content;
                tooltip.style.display = 'block';
                tooltip.style.left = `${x + 10}px`;
                tooltip.style.top = `${y - 10}px`;
            }
        } else {
            tooltip.style.display = 'none';
        }
    }
    
    /**
     * Handle click events
     */
    handleClick(info) {
        const { object } = info;
        
        if (object && info.layer.id === 'proposed-shelters') {
            console.log('Proposed shelter clicked:', object);
            // Could add functionality to remove/modify proposed shelters
        }
    }
    
    /**
     * Handle viewport changes 
     */
    handleViewStateChange(viewState) {
        // Store current zoom for any future zoom-dependent functionality
        this._currentZoom = viewState.zoom;
        
        return viewState;
    }
    
    /**
     * Show loading overlay
     */
    showLoading(message = 'Loading...') {
        this.elements.loading.style.display = 'flex';
        this.elements.loading.classList.remove('hidden');
        if (message !== 'Loading...') {
            this.elements.loading.querySelector('p').textContent = message;
        }
    }
    
    /**
     * Hide loading overlay
     */
    hideLoading() {
        this.elements.loading.classList.add('hidden');
        setTimeout(() => {
            this.elements.loading.style.display = 'none';
        }, 300);
    }
    
    /**
     * Show error message
     */
    showError(message) {
        alert(`Error: ${message}`);
        console.error(message);
    }
    
    /**
     * Get current basemap URL
     */
    getBasemapUrl() {
        return this.basemaps[this.currentBasemap].url;
    }
    
    /**
     * Change basemap
     */
    changeBasemap(basemap) {
        this.currentBasemap = basemap;
        this.updateAttribution();
        this.updateVisualization();
    }
    
    /**
     * Update attribution display
     */
    updateAttribution() {
        if (this.elements.attribution) {
            this.elements.attribution.innerHTML = this.basemaps[this.currentBasemap].attribution;
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Validate required libraries
    if (typeof deck === 'undefined') {
        console.error('deck.gl library not loaded');
        return;
    }
    
    if (typeof turf === 'undefined') {
        console.error('Turf.js library not loaded');
        return;
    }
    
    if (typeof SimpleSpatialAnalyzer === 'undefined') {
        console.error('SimpleSpatialAnalyzer not loaded');
        return;
    }
    
    // Initialize the application
    window.app = new ShelterAccessApp();
}); 