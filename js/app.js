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
        this.numNewShelters = 0;
        this.maxShelters = 500; // Updated to match script's TARGET_SHELTERS
        this.isAnalyzing = false;
        
        // Icon sizing constants - tunable in one place
        this.ICON_SIZE = 0.0015; // Common units (0.0015 * 2^zoom pixels, before scale/constraints) - tripled for better visibility
        this.ICON_SIZE_SCALE = 2; // Global size multiplier (doubles the effective size)
        this.ICON_MIN_PIXELS = 14; // Minimum size in pixels (icons never smaller than this)
        this.ICON_MAX_PIXELS = 124; // Maximum size in pixels (icons never larger than this)
        
        // Add state for selected shelter and coverage highlighting
        this.selectedShelter = null;
        this.highlightedBuildings = [];
        
        // Add state for hover highlighting
        this.hoveredShelter = null;
        this.hoveredBuildings = [];
        
        // Add state for selected polygons
        this.selectedPolygon = null;
        this.selectedPolygonType = null;
        
        // Layer visibility state
        this.layerVisibility = {
            buildings: true, // On by default - building footprints are useful
            existingShelters: true,
            requestedShelters: true,
            optimalShelters: true,
            statisticalAreas: false, // Off by default
            habitationClusters: false, // Off by default
            accessibilityHeatmap: false // Off by default
        };
        
        // Simplified - no layer caching needed
        
        // Accessibility heatmap data
        this.accessibilityData = null;
        this.allAccessibilityData = null; // Stores all radii data
        this.isCalculatingAccessibility = false;
        
        // Simplified - no tile system needed
        
        // Mapbox token for terrain and other services
        this.mapboxToken = 'pk.eyJ1Ijoibm9hbWpnYWwiLCJhIjoiY20zbHJ5MzRvMHBxZTJrcW9uZ21pMzMydiJ9.B_aBdP5jxu9nwTm3CoNhlg';
        
        // Simplified basemap configuration
        this.currentBasemap = 'satellite';
        this.basemaps = {
            satellite: {
                name: 'Satellite Streets',
                url: `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${this.mapboxToken}`,
                attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                type: 'raster'
            },
            light: {
                name: 'Light Streets',
                url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${this.mapboxToken}`,
                attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                type: 'raster'
            }
        };
        
        // Current zoom and view state for zoom-dependent features
        this._currentZoom = 12;
        this._currentViewState = null;
        
        // Simplified - using direct calculations with caching
        
        // Performance monitoring
        this.lastCoverageCalculation = 0;
        
        // Simple hover state
        this.hoverState = {
            coverageCache: new Map(), // Cache coverage results per shelter
            currentShelter: null
        };
        
        // UI Elements - simplified
        this.elements = {
            loading: document.getElementById('loading'),
            attribution: document.getElementById('attribution'),
            tooltip: document.getElementById('tooltip'),
            // Core controls
            distanceButtons: document.getElementById('distanceButtons'),
            newSheltersSlider: document.getElementById('newShelters'),
            newSheltersValue: document.getElementById('newSheltersValue'),
            heatmapToggle: document.getElementById('heatmapToggle'),
            heatmapToggleText: document.getElementById('heatmapToggleText'),
            // Statistics
            currentCoverage: document.getElementById('currentCoverage'),
            newCoverage: document.getElementById('newCoverage'),
            buildingsCovered: document.getElementById('buildingsCovered'),
            additionalPeople: document.getElementById('additionalPeople'),
            // Legend
            legendItems: document.getElementById('legend-items'),
            // Layer toggles
            buildingsLayer: document.getElementById('buildingsLayer'),
            existingSheltersLayer: document.getElementById('existingSheltersLayer'),
            requestedSheltersLayer: document.getElementById('requestedSheltersLayer'),
            optimalSheltersLayer: document.getElementById('optimalSheltersLayer'),
            statisticalAreasLayer: document.getElementById('statisticalAreasLayer'),
            habitationClustersLayer: document.getElementById('habitationClustersLayer')
        };
    }
    

    
    // Layer caching system removed - direct layer creation is simpler and fast enough
    
    /**
     * Generate cache key for shelter coverage results
     */
    generateCoverageKey(shelter) {
        if (!shelter) return null;
        
        // Create unique key based on shelter location and current coverage radius
        if (shelter.geometry && shelter.geometry.coordinates) {
            // Existing/requested shelter
            const coords = shelter.geometry.coordinates;
            return `${coords[0].toFixed(6)}_${coords[1].toFixed(6)}_${this.coverageRadius}`;
        } else if (shelter.coordinates) {
            // Optimal shelter
            const coords = shelter.coordinates;
            return `${coords[0].toFixed(6)}_${coords[1].toFixed(6)}_${this.coverageRadius}`;
        } else if (shelter.lat && shelter.lon) {
            // Alternative format
            return `${shelter.lon.toFixed(6)}_${shelter.lat.toFixed(6)}_${this.coverageRadius}`;
        }
        
        return null;
    }
    
    /**
     * Get cached coverage or calculate new coverage (simplified)
     */
    getCachedCoverage(shelter) {
        const cacheKey = this.generateCoverageKey(shelter);
        if (!cacheKey) return [];
        
        // Check cache first
        if (this.hoverState.coverageCache.has(cacheKey)) {
            return this.hoverState.coverageCache.get(cacheKey);
        }
        
        // Calculate and cache using simple method
        const coverage = this.calculateShelterCoverage(shelter);
        this.hoverState.coverageCache.set(cacheKey, coverage);
        
        // Limit cache size to prevent memory issues
        if (this.hoverState.coverageCache.size > 100) {
            // Remove oldest entries (FIFO)
            const firstKey = this.hoverState.coverageCache.keys().next().value;
            this.hoverState.coverageCache.delete(firstKey);
        }
        
        return coverage;
    }
    
    /**
     * Clear coverage cache when radius changes
     */
    clearCoverageCache() {
        this.hoverState.coverageCache.clear();
        console.log('🧹 Cleared coverage cache');
    }
    

    
    /**
     * Initialize the application
     */
    async initializeApp() {
        try {
            this.setupEventListeners();
            this.setupMainMenu();
            await this.spatialAnalyzer.loadData();
            
            // Layer caching removed - no longer needed
            
            // Clear coverage cache when data loads
            this.clearCoverageCache();
            
            await this.initializeMap();
            this.updateAttribution();
            
            // Initial load of optimal locations and coverage analysis
            await this.updateOptimalLocations();
            
            // Initialize legend
            this.updateLegend();
            
            // Hide loading overlay
            this.hideLoading();
            
            console.log('✅ Simple hover system initialized');
            console.log('✅ Coverage calculation system initialized');
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to load application. Please refresh and try again.');
        }
    }
    
    /**
     * Setup unified main menu functionality
     */
    setupMainMenu() {
        // Handle stats panel minimize button
        const statsMinimize = document.getElementById('statsMinimize');
        const statsLegendPanel = document.querySelector('.stats-legend-panel');
        if (statsMinimize && statsLegendPanel) {
            statsMinimize.addEventListener('click', () => {
                statsLegendPanel.classList.toggle('collapsed');
                const icon = statsMinimize.querySelector('span');
                if (statsLegendPanel.classList.contains('collapsed')) {
                    icon.textContent = '+';
                    statsMinimize.title = 'Expand';
                } else {
                    icon.textContent = '−';
                    statsMinimize.title = 'Minimize';
                }
            });
        }
        
        // Handle menu minimize button
        const menuMinimize = document.getElementById('menuMinimize');
        const mainMenu = document.querySelector('.main-menu');
        if (menuMinimize && mainMenu) {
            menuMinimize.addEventListener('click', () => {
                mainMenu.classList.toggle('minimized');
                const icon = menuMinimize.querySelector('span');
                if (mainMenu.classList.contains('minimized')) {
                    icon.textContent = '+';
                    menuMinimize.title = 'Expand';
                } else {
                    icon.textContent = '−';
                    menuMinimize.title = 'Minimize';
                }
            });
        }
        

        
        // Handle layers modal
        this.setupLayersModal();
    }
    
    /**
     * Setup layers modal functionality
     */
    setupLayersModal() {
        const layersButton = document.getElementById('layersButton');
        const layersModal = document.getElementById('layersModal');
        const closeLayersModal = document.getElementById('closeLayersModal');
        
        // Open modal
        if (layersButton) {
            layersButton.addEventListener('click', () => {
                layersModal.classList.add('show');
            });
        }
        
        // Close modal - close button
        if (closeLayersModal) {
            closeLayersModal.addEventListener('click', () => {
                layersModal.classList.remove('show');
            });
        }
        
        // Close modal - click outside
        if (layersModal) {
            layersModal.addEventListener('click', (e) => {
                if (e.target === layersModal) {
                    layersModal.classList.remove('show');
                }
            });
        }
    }
    
    /**
     * Setup about modal functionality
     */
    setupAboutModal() {
        const aboutButton = document.getElementById('aboutButton');
        const aboutModal = document.getElementById('aboutModal');
        const closeAboutModal = document.getElementById('closeAboutModal');
        
        // Open modal
        if (aboutButton) {
            aboutButton.addEventListener('click', () => {
                aboutModal.classList.add('show');
            });
        }
        
        // Close modal - close button
        if (closeAboutModal) {
            closeAboutModal.addEventListener('click', () => {
                aboutModal.classList.remove('show');
            });
        }
        
        // Close modal - click outside
        if (aboutModal) {
            aboutModal.addEventListener('click', (e) => {
                if (e.target === aboutModal) {
                    aboutModal.classList.remove('show');
                }
            });
        }
    }
    
    /**
     * Setup methods modal functionality
     */
    setupMethodsModal() {
        const methodsButton = document.getElementById('methodsButton');
        const methodsModal = document.getElementById('methodsModal');
        const closeMethodsModal = document.getElementById('closeMethodsModal');
        
        // Open modal
        if (methodsButton) {
            methodsButton.addEventListener('click', () => {
                methodsModal.classList.add('show');
            });
        }
        
        // Close modal - close button
        if (closeMethodsModal) {
            closeMethodsModal.addEventListener('click', () => {
                methodsModal.classList.remove('show');
            });
        }
        
        // Close modal - click outside
        if (methodsModal) {
            methodsModal.addEventListener('click', (e) => {
                if (e.target === methodsModal) {
                    methodsModal.classList.remove('show');
                }
            });
        }
    }
    
    /**
     * Setup event listeners for UI controls
     */
    setupEventListeners() {
        // Setup about modal
        this.setupAboutModal();
        
        // Setup methods modal
        this.setupMethodsModal();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Priority: close modals first, then clear shelter selection
                const aboutModal = document.getElementById('aboutModal');
                const methodsModal = document.getElementById('methodsModal');
                const layersModal = document.getElementById('layersModal');
                
                if (aboutModal && aboutModal.classList.contains('show')) {
                    aboutModal.classList.remove('show');
                } else if (methodsModal && methodsModal.classList.contains('show')) {
                    methodsModal.classList.remove('show');
                } else if (layersModal && layersModal.classList.contains('show')) {
                    layersModal.classList.remove('show');
                } else {
                    this.clearShelterSelection();
                }
            }
        });
        
        // Distance buttons - only if they exist
        if (this.elements.distanceButtons) {
            this.elements.distanceButtons.addEventListener('click', async (e) => {
                if (e.target.classList.contains('distance-button')) {
                    const newDistance = parseInt(e.target.dataset.distance);
                    
                    // Update active state
                    this.elements.distanceButtons.querySelectorAll('.distance-button').forEach(btn => 
                        btn.classList.remove('active')
                    );
                    e.target.classList.add('active');
                    
                    // Update distance
                    this.coverageRadius = newDistance;
                    
                    // Clear coverage cache when radius changes (important for hover optimization)
                    this.clearCoverageCache();
                    
                    // Update spatial analyzer and refresh
                    await this.spatialAnalyzer.setCoverageRadius(this.coverageRadius);
                    this.clearShelterSelection(); // Clear selection when radius changes
                    await this.updateOptimalLocations();
                }
            });
        }
        
        // New shelters slider - only if it exists
        if (this.elements.newSheltersSlider) {
            this.elements.newSheltersSlider.addEventListener('input', async (e) => {
                this.numNewShelters = parseInt(e.target.value);
                if (this.elements.newSheltersValue) {
                    this.elements.newSheltersValue.textContent = this.numNewShelters;
                }
                await this.updateOptimalLocations();
            });
        }
        
        // Heatmap toggle - only if it exists
        if (this.elements.heatmapToggle) {
            this.elements.heatmapToggle.addEventListener('click', async (e) => {
                const isActive = !this.layerVisibility.accessibilityHeatmap;
                this.layerVisibility.accessibilityHeatmap = isActive;
                
                // Update button state
                const button = e.target.closest('button');
                if (this.elements.heatmapToggleText) {
                    this.elements.heatmapToggleText.textContent = isActive ? 'Hide Grid' : 'Accessibility Grid';
                }
                
                if (isActive) {
                    button.classList.add('active');
                    // Reset shelters when enabling heatmap
                    this.numNewShelters = 0;
                    if (this.elements.newSheltersSlider) {
                        this.elements.newSheltersSlider.value = 0;
                    }
                    if (this.elements.newSheltersValue) {
                        this.elements.newSheltersValue.textContent = '0';
                    }
                    
                    // First time enabling - load precomputed accessibility data
                    if (!this.accessibilityData) {
                        await this.loadAccessibilityData();
                    }
                } else {
                    button.classList.remove('active');
                    // Update optimal locations when disabling heatmap
                    await this.updateOptimalLocations();
                }
                
                this.updateVisualization();
            });
        }
        
        // Basemap radio selection
        const basemapRadios = document.querySelectorAll('input[name="basemap"]');
        basemapRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.changeBasemap(e.target.value);
                }
            });
        });
        
        // Layer visibility toggles - only setup if elements exist
        if (this.elements.buildingsLayer) {
            this.elements.buildingsLayer.addEventListener('change', (e) => {
                this.layerVisibility.buildings = e.target.checked;
                this.updateVisualization();
            });
        }
        
        if (this.elements.existingSheltersLayer) {
            this.elements.existingSheltersLayer.addEventListener('change', (e) => {
                this.layerVisibility.existingShelters = e.target.checked;
                this.updateVisualization();
            });
        }
        
        if (this.elements.requestedSheltersLayer) {
            this.elements.requestedSheltersLayer.addEventListener('change', (e) => {
                this.layerVisibility.requestedShelters = e.target.checked;
                this.updateVisualization();
            });
        }
        
        if (this.elements.optimalSheltersLayer) {
            this.elements.optimalSheltersLayer.addEventListener('change', (e) => {
                this.layerVisibility.proposedShelters = e.target.checked;
                this.updateVisualization();
            });
        }
        
        if (this.elements.statisticalAreasLayer) {
            this.elements.statisticalAreasLayer.addEventListener('change', (e) => {
                this.layerVisibility.statisticalAreas = e.target.checked;
                this.updateVisualization();
            });
        }
        
        if (this.elements.habitationClustersLayer) {
            this.elements.habitationClustersLayer.addEventListener('change', (e) => {
                this.layerVisibility.habitationClusters = e.target.checked;
                this.updateVisualization();
            });
        }
        
        // Accessibility heatmap toggle - only if it exists
        const heatmapToggle = document.getElementById('accessibilityHeatmapLayer');
        if (heatmapToggle) {
            heatmapToggle.addEventListener('change', async (e) => {
                const isActive = e.target.checked;
                this.layerVisibility.accessibilityHeatmap = isActive;
                
                if (isActive && !this.accessibilityData) {
                    // First time enabling - load precomputed accessibility data
                    await this.loadAccessibilityData();
                }
                
                this.updateVisualization();
            });
        }
    }
    
    /**
     * Initialize deck.gl map
     */
    async initializeMap() {
        // Calculate center from loaded spatial data if available
        let centerLat = 31.25;  // Fallback center (Israel)
        let centerLng = 34.95;  // Fallback center (Israel)
        
        // Try to get center from buildings data if available
        const currentData = this.spatialAnalyzer.getCurrentData();
        if (currentData.buildings && currentData.buildings.features && currentData.buildings.features.length > 0) {
            // Calculate center from building bounds
            const features = currentData.buildings.features;
            let sumLat = 0, sumLng = 0, count = 0;
            
            features.forEach(feature => {
                if (feature.geometry && feature.geometry.coordinates) {
                    if (feature.geometry.type === 'Point') {
                        sumLng += feature.geometry.coordinates[0];
                        sumLat += feature.geometry.coordinates[1];
                        count++;
                    } else if (feature.geometry.type === 'Polygon') {
                        // Use first coordinate of polygon
                        const coords = feature.geometry.coordinates[0][0];
                        sumLng += coords[0];
                        sumLat += coords[1];
                        count++;
                    }
                }
            });
            
            if (count > 0) {
                centerLng = sumLng / count;
                centerLat = sumLat / count;
            }
        }
        
        // Create and set up deck.gl
        this.deckgl = new deck.DeckGL({
            container: 'map',
            mapboxApiAccessToken: this.mapboxToken,
            initialViewState: {
                longitude: centerLng,
                latitude: centerLat,
                zoom: 12,
                pitch: 0,
                bearing: 0,
                minZoom: 7,
                maxZoom: 19
            },
            controller: true,
            onViewStateChange: ({viewState}) => this.handleViewStateChange(viewState),
            getCursor: ({isDragging, isHovering}) => {
                if (isDragging) return 'grabbing';
                if (isHovering) return 'pointer';
                return 'grab';
            }
        });
        
        // Status indicators removed - no longer needed
        
        // Initialize widgets (zoom, fullscreen, compass)
        this.initializeWidgets();
        
        // Create initial layers
        this.currentLayers = this.createLayers();
        this.deckgl.setProps({layers: this.currentLayers});
        
        // Store initial zoom level
        this._currentZoom = 12;
        
        // Initialize scale bar
        this.updateScaleBar();
        
        // Initial visualization update
        this.updateVisualization();
    }
    
    /**
     * Initialize deck.gl widgets (zoom, fullscreen, compass)
     */
    initializeWidgets() {
            // Zoom Control Widget
            const zoomWidget = new deck.ZoomWidget({
                id: 'zoom-widget',
                placement: 'bottom-right',
                onViewStateChange: ({viewState}) => {
                    this.deckgl.setProps({viewState});
                    this.handleViewStateChange(viewState);
                }
            });
            
            // Fullscreen Control Widget
            const fullscreenWidget = new deck.FullscreenWidget({
                id: 'fullscreen-widget',
                placement: 'bottom-right',
                container: document.getElementById('map')
            });
            
            // Compass Widget
            const compassWidget = new deck.CompassWidget({
                id: 'compass-widget',
                placement: 'bottom-right',
                onViewStateChange: ({viewState}) => {
                    this.deckgl.setProps({viewState});
                    this.handleViewStateChange(viewState);
                }
            });
            
            // Store widgets for later use
            this.widgets = [zoomWidget, fullscreenWidget, compassWidget];
            
            // Attach widgets to deck.gl instance
            this.deckgl.setProps({
                widgets: this.widgets
            });
        }
    
    /**
     * Create visualization layers with new color scheme
     */
    createLayers() {
        const layers = [];
        const currentData = this.spatialAnalyzer.getCurrentData();
        
        if (!currentData.shelters) return layers;
        
        // === UNIFIED ACCESSIBILITY HEATMAP LAYER ===
        if (this.layerVisibility.accessibilityHeatmap && this.accessibilityData && this.accessibilityData.length > 0) {
            // When heatmap is active, only show heatmap - hide all other layers
            const coveredCount = this.accessibilityData.filter(d => d.type === 'covered').length;
            const uncoveredCount = this.accessibilityData.filter(d => d.type === 'uncovered').length;
            console.log(`🔥 Unified Heatmap data: ${this.accessibilityData.length} total points`);
            console.log(`   🟢 Covered: ${coveredCount} buildings (${(coveredCount/this.accessibilityData.length*100).toFixed(1)}%)`);
            console.log(`   🔴 Uncovered: ${uncoveredCount} buildings (${(uncoveredCount/this.accessibilityData.length*100).toFixed(1)}%)`);
            
            // Create simplified heatmap layer with intuitive weighting
            layers.push(new deck.ScreenGridLayer({
                id: 'accessibility-grid-unified',
                data: this.accessibilityData,
                getPosition: d => d.position,
                getWeight: d => d.weight, // Simple: +1 for covered, -1 for uncovered
                cellSizePixels: 8,  // Smaller cells for better detail when zoomed in
                cellMarginPixels: 0,
                gpuAggregation: true,
                aggregation: 'MEAN',
                // Proportional color scheme: Red (100% uncovered) → Yellow (50/50) → Green (100% covered)
                colorRange: [
                    [200, 20, 20, 255],     // Pure red: 100% uncovered buildings
                    [255, 255, 0, 255],     // Pure yellow: 50/50 split
                    [20, 180, 20, 255]      // Pure green: 100% covered buildings
                ],
                // Perfect proportional domain: -1 = 100% uncovered, 0 = 50/50, +1 = 100% covered
                colorDomain: [-1, 0, 1],
                pickable: false, // Disabled tooltips
                opacity: 0.85
            }));
            
            // Return only heatmap layer when heatmap is active
            return layers;
        }
        
        // Get requested shelter evaluation for pairing analysis
        const requestedEval = this.spatialAnalyzer.getRequestedShelterEvaluation(this.proposedShelters.length);
        
        // Create lookup for shelters that should be marked as replaceable
        const replaceableIds = new Set();
        if (requestedEval && requestedEval.pairedShelters) {
            requestedEval.pairedShelters.forEach(pair => {
                if (pair.requested.properties && pair.requested.properties.shelter_id) {
                    replaceableIds.add(pair.requested.properties.shelter_id);
                }
            });
        }
        
        // === BUILDINGS LAYER (Simplified GeoJSON) ===
        const shouldShowBuildings = this.layerVisibility.buildings || 
                                  (this.hoveredShelter && this.hoveredBuildings.length > 0) ||
                                  (this.selectedShelter && this.highlightedBuildings.length > 0);
        
        if (shouldShowBuildings && currentData.buildings && currentData.buildings.features.length > 0) {
            let buildingsToShow;
            if (this.layerVisibility.buildings) {
                // Show all buildings when layer is enabled
                buildingsToShow = currentData.buildings.features;
            } else {
                // Only show covered buildings when layer is disabled (highlighting mode)
                const coveredIndices = new Set([
                    ...(this.hoveredShelter ? this.hoveredBuildings : []),
                    ...(this.selectedShelter ? this.highlightedBuildings : [])
                ]);
                buildingsToShow = currentData.buildings.features.filter((_, index) => 
                    coveredIndices.has(index)
                );
            }
            
            if (buildingsToShow.length > 0) {
                layers.push(new deck.GeoJsonLayer({
                    id: 'buildings-geojson',
                    data: buildingsToShow.map((feature, index) => ({
                        ...feature,
                        _index: index // Add array index for identification
                    })),
                    pickable: false,
                    stroked: true,
                    filled: true,
                    lineWidthMinPixels: 1,
                    lineWidthMaxPixels: 2,
                    getFillColor: d => {
                        const buildingIndex = d._index || 0;
                        
                        if (this.layerVisibility.buildings) {
                            // Check if this building is covered by hovered shelter (turn green)
                            if (this.hoveredShelter && this.hoveredBuildings.includes(buildingIndex)) {
                                return [0, 255, 0, 150]; // Bright green for hover coverage
                            }
                            // Check if this building is covered by selected shelter (turn green)
                            if (this.selectedShelter && this.highlightedBuildings.includes(buildingIndex)) {
                                return [0, 255, 0, 200]; // Bright green for selected coverage
                            }
                            return [255, 0, 0, 120]; // Red for all other buildings when layer is enabled
                        } else {
                            // Buildings layer is disabled - only show covered buildings in green
                            return [0, 255, 0, 200]; // Bright green for covered buildings
                        }
                    },
                    getLineColor: d => {
                        const buildingIndex = d._index || 0;
                        
                        if (this.layerVisibility.buildings) {
                            // Check if this building is covered by hovered shelter (turn green)
                            if (this.hoveredShelter && this.hoveredBuildings.includes(buildingIndex)) {
                                return [0, 255, 0, 255]; // Bright green outline for hover
                            }
                            // Check if this building is covered by selected shelter (turn green)
                            if (this.selectedShelter && this.highlightedBuildings.includes(buildingIndex)) {
                                return [0, 255, 0, 255]; // Bright green outline for selected
                            }
                            return [255, 0, 0, 180]; // Red outline for all other buildings
                        } else {
                            // Buildings layer is disabled - only show covered building outlines in green
                            return [0, 255, 0, 255]; // Bright green outline for covered buildings
                        }
                    },
                    getLineWidth: d => {
                        const buildingIndex = d._index || 0;
                        
                        // Thicker outline for highlighted buildings
                        if (this.selectedShelter && this.highlightedBuildings.includes(buildingIndex)) {
                            return 3;
                        }
                        if (this.hoveredShelter && this.hoveredBuildings.includes(buildingIndex)) {
                            return 2;
                        }
                        return 1;
                    }
                }));
            }
        }
        
        // === STATISTICAL AREAS LAYER (Grey outlines) ===
        if (this.layerVisibility.statisticalAreas) {
            // Load statistical areas if not already loaded
            if (!currentData.statisticalAreas || currentData.statisticalAreas.length === 0) {
                this.spatialAnalyzer.loadStatisticalAreasGeoJson().then(() => {
                    // Redraw when data is loaded
                    this.updateVisualization();
                });
            }
            
            if (currentData.statisticalAreas && currentData.statisticalAreas.length > 0) {
                // GeoJSON layer for statistical areas
                layers.push(new deck.GeoJsonLayer({
                    id: 'statistical-areas-geojson',
                    data: currentData.statisticalAreas.map((feature, index) => ({
                        ...feature,
                        _layerType: 'statisticalArea',
                        _index: index
                    })),
                    pickable: true,
                    stroked: true,
                    filled: true,
                    lineWidthMinPixels: 2,
                    lineWidthMaxPixels: 4,
                    getFillColor: d => {
                        const isSelected = this.selectedPolygon?.layerType === 'statisticalArea' && 
                                         this.selectedPolygon?._index === d._index;
                        return isSelected ? [128, 128, 128, 100] : [128, 128, 128, 30]; // Grey fill
                    },
                    getLineColor: d => {
                        const isSelected = this.selectedPolygon?.layerType === 'statisticalArea' && 
                                         this.selectedPolygon?._index === d._index;
                        return isSelected ? [80, 80, 80, 255] : [128, 128, 128, 200]; // Grey outline
                    },
                    getLineWidth: d => {
                        const isSelected = this.selectedPolygon?.layerType === 'statisticalArea' && 
                                         this.selectedPolygon?._index === d._index;
                        return isSelected ? 4 : 2;
                    },
                    updateTriggers: {
                        getFillColor: [this.selectedPolygon],
                        getLineColor: [this.selectedPolygon],
                        getLineWidth: [this.selectedPolygon]
                    },
                    // Performance optimizations
                    parameters: {
                        blend: true,
                        blendFunc: [770, 771, 1, 0]
                    }
                }));
            }
        }
        
        // === HABITATION CLUSTERS LAYER (Simplified GeoJSON) ===
        if (this.layerVisibility.habitationClusters) {
            // Load habitation clusters if not already loaded
            if (!currentData.habitationClusters || currentData.habitationClusters.length === 0) {
                this.spatialAnalyzer.loadHabitationClustersGeoJson().then(() => {
                    this.updateVisualization();
                });
            }
            
            if (currentData.habitationClusters && currentData.habitationClusters.length > 0) {
                layers.push(new deck.GeoJsonLayer({
                    id: 'habitation-clusters-geojson',
                    data: currentData.habitationClusters.map((feature, index) => ({
                        ...feature,
                        _layerType: 'habitationCluster',
                        _index: index
                    })),
                    pickable: true,
                    stroked: true,
                    filled: true,
                    lineWidthMinPixels: 1,
                    lineWidthMaxPixels: 2,
                    getFillColor: d => {
                        const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                         this.selectedPolygon?._index === d._index;
                        return isSelected ? [52, 152, 219, 100] : [52, 152, 219, 25];
                    },
                    getLineColor: d => {
                        const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                         this.selectedPolygon?._index === d._index;
                        return isSelected ? [30, 100, 150, 255] : [52, 152, 219, 120];
                    },
                    getLineWidth: d => {
                        const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                         this.selectedPolygon?._index === d._index;
                        return isSelected ? 3 : 1;
                    },
                    updateTriggers: {
                        getFillColor: [this.selectedPolygon],
                        getLineColor: [this.selectedPolygon],
                        getLineWidth: [this.selectedPolygon]
                    }
                }));
            }
        }
        
        // === COVERAGE BRUSH LAYER (for selected/hovered shelters) ===
        if ((this.selectedShelter || this.hoveredShelter) && this.spatialAnalyzer.buildings) {
            const activeShelter = this.selectedShelter || this.hoveredShelter;
            const coveredBuildingIndices = this.selectedShelter ? this.highlightedBuildings : this.hoveredBuildings;
            
            if (coveredBuildingIndices.length > 0) {
                // Create a brush layer to highlight covered buildings
                const coveredBuildings = coveredBuildingIndices.map(index => 
                    this.spatialAnalyzer.buildings.features[index]
                ).filter(building => building); // Filter out any undefined buildings
                
                if (coveredBuildings.length > 0) {
                    layers.push(new deck.GeoJsonLayer({
                        id: 'coverage-brush',
                        data: coveredBuildings,
                        pickable: false,
                        stroked: true,
                        filled: true,
                        lineWidthMinPixels: 2,
                        lineWidthMaxPixels: 4,
                        // Use brush extension for better visual effect
                        extensions: [new deck.BrushingExtension()],
                        // High opacity for coverage highlighting
                        getFillColor: () => {
                            if (this.selectedShelter) {
                                return [0, 255, 0, 180]; // Bright green for selected coverage
                            } else {
                                return [0, 255, 0, 120]; // Lighter green for hover coverage
                            }
                        },
                        getLineColor: () => {
                            if (this.selectedShelter) {
                                return [0, 200, 0, 255]; // Darker green outline for selected
                            } else {
                                return [0, 200, 0, 200]; // Lighter green outline for hover
                            }
                        },
                        getLineWidth: () => {
                            if (this.selectedShelter) {
                                return 3; // Thicker for selected
                            } else {
                                return 2; // Thinner for hover
                            }
                        }
                    }));
                }
            }
        }
        
        // === EXISTING SHELTERS (Blue Circles) ===
        // Hide all shelters when heatmap is active
        if (this.layerVisibility.existingShelters && !this.layerVisibility.accessibilityHeatmap) {
            const existingShelters = currentData.shelters.features.filter(shelter => 
                shelter.properties && shelter.properties.status === 'Built'
            );
            
            if (existingShelters.length > 0) {
                layers.push(new deck.IconLayer({
                    id: 'existing-shelters',
                    data: existingShelters,
                    pickable: true,
                    getIcon: () => this.getShelterIcon('existing'),
                    getPosition: d => d.geometry.coordinates,
                    getSize: () => this.ICON_SIZE * 8000, // Scale up for visibility
                    getColor: d => {
                        // Highlight selected shelter
                        if (this.selectedShelter && this.selectedShelter.properties && 
                            this.selectedShelter.properties.shelter_id === d.properties.shelter_id) {
                            return [255, 255, 255, 255]; // White for selected (100% opacity)
                        }
                        return [255, 255, 255, 230]; // White tint (90% opacity)
                    },
                    sizeScale: this.ICON_SIZE_SCALE,
                    sizeUnits: 'meters',
                    sizeMinPixels: this.ICON_MIN_PIXELS,
                    sizeMaxPixels: this.ICON_MAX_PIXELS,
                    onHover: (info) => this.handleHover(info),
                    onClick: (info) => this.handleClick(info)
                }));
            }
        }
        
        // === PLANNED SHELTERS (Orange/Red when analyzed) ===
        if (this.layerVisibility.requestedShelters && !this.layerVisibility.accessibilityHeatmap) {
            // Show requested shelters (status "Request")
            const requestedShelters = currentData.shelters.features.filter(shelter => 
                shelter.properties && shelter.properties.status === 'Request'
            );
            
            if (requestedShelters.length > 0) {
                // Community requested shelter triangles using IconLayer
                layers.push(new deck.IconLayer({
                    id: 'requested-shelters',
                    data: requestedShelters,
                    pickable: true,
                    getIcon: () => this.getShelterIcon('requested'),
                    getPosition: d => d.geometry.coordinates,
                    getSize: () => this.ICON_SIZE * 8000, // Scale up for visibility
                    getColor: d => {
                        // Highlight selected shelter
                        if (this.selectedShelter && this.selectedShelter.properties && 
                            this.selectedShelter.properties.shelter_id === d.properties.shelter_id) {
                            return [255, 255, 255, 255]; // White for selected (100% opacity)
                        }
                        return [255, 255, 255, 230]; // White tint (90% opacity)
                    },
                    sizeScale: this.ICON_SIZE_SCALE,
                    sizeUnits: 'meters',
                    sizeMinPixels: this.ICON_MIN_PIXELS,
                    sizeMaxPixels: this.ICON_MAX_PIXELS,
                    onHover: (info) => this.handleHover(info),
                    onClick: (info) => this.handleClick(info)
                }));
            }
        }
        
        // === OPTIMAL ADDED SHELTERS (Green Squares) ===
        if (this.layerVisibility.optimalShelters && this.proposedShelters.length > 0 && !this.layerVisibility.accessibilityHeatmap) {
            // Added shelter squares with quality-based coloring
            layers.push(new deck.IconLayer({
                id: 'proposed-shelters',
                data: this.proposedShelters.map((shelter, index) => ({
                    coordinates: [shelter.lon, shelter.lat],
                    rank: index + 1,
                    ...shelter
                })),
                pickable: true,
                getIcon: () => this.getShelterIcon('optimal'),
                getPosition: d => d.coordinates,
                getSize: () => this.ICON_SIZE * 8000, // Scale up for visibility
                getColor: d => {
                        // Highlight selected shelter
                        if (this.selectedShelter && this.selectedShelter.coordinates && 
                            this.selectedShelter.coordinates[0] === d.coordinates[0] && 
                            this.selectedShelter.coordinates[1] === d.coordinates[1]) {
                            return [255, 255, 255, 255]; // White for selected (100% opacity)
                        }
                        return [255, 255, 255, 230]; // White tint (90% opacity)
                    },
                sizeScale: this.ICON_SIZE_SCALE,
                sizeUnits: 'meters',
                sizeMinPixels: this.ICON_MIN_PIXELS,
                sizeMaxPixels: this.ICON_MAX_PIXELS,
                onHover: (info) => this.handleHover(info),
                onClick: (info) => {
                    if (info.object) {
                        this.selectShelter(info.object);
                        this.jumpToOptimalSite(info.object.coordinates[1], info.object.coordinates[0]);
                    }
                }
            }));
        }

        
        return layers;
    }
    
    /**
     * Update legend to show only visible layers
     */
    updateLegend() {
        if (!this.elements.legendItems) return;
        
        const legendItems = [];
        
        // Add legend items only for visible layers
        if (this.layerVisibility.optimalShelters && this.proposedShelters.length > 0) {
            legendItems.push({
                className: 'optimal-shelter',
                label: 'Added Shelters'
            });
        }
        
        if (this.layerVisibility.existingShelters) {
            legendItems.push({
                className: 'existing-shelter', 
                label: 'Existing Shelters'
            });
        }
        
        if (this.layerVisibility.requestedShelters) {
            legendItems.push({
                className: 'requested-shelter',
                label: 'Community Requested'
            });
        }
        

        
        if (this.layerVisibility.accessibilityHeatmap) {
            // Create continuous heatmap legend
            this.createHeatmapLegend();
            return; // Only show heatmap legend when heatmap is active
        }
        
        // Clear existing legend items
        this.elements.legendItems.innerHTML = '';
        
        // Add new legend items with actual SVG icons
        legendItems.forEach(item => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            
            const iconDiv = document.createElement('div');
            iconDiv.className = `legend-icon ${item.className}`;
            
            // Use actual SVG icons that match the map icons exactly
            if (item.className === 'existing-shelter') {
                const img = document.createElement('img');
                img.src = 'data/airtight-hatch-svgrepo-com.svg';
                img.width = 16;
                img.height = 16;
                img.style.display = 'block';
                iconDiv.appendChild(img);
            } else if (item.className === 'requested-shelter') {
                const img = document.createElement('img');
                img.src = 'data/user-location-icon.svg';
                img.width = 16;
                img.height = 16;
                img.style.display = 'block';
                iconDiv.appendChild(img);
            } else if (item.className === 'optimal-shelter') {
                const img = document.createElement('img');
                img.src = 'data/add-location-icon.svg';
                img.width = 16;
                img.height = 16;
                img.style.display = 'block';
                iconDiv.appendChild(img);

            } else {
                // Fallback to color box for unknown types
                iconDiv.innerHTML = '';
                iconDiv.className = `legend-color ${item.className}`;
            }
            
            const label = document.createElement('span');
            label.textContent = item.label;
            
            legendItem.appendChild(iconDiv);
            legendItem.appendChild(label);
            this.elements.legendItems.appendChild(legendItem);
        });
    }
    
    /**
     * Handle heatmap mode zoom behavior without breaking controls
     */
    adjustZoomForHeatmap(isHeatmapActive) {
        if (!this.deckgl) return;
        
        if (isHeatmapActive) {
            // Optional: Zoom to a good level for heatmap viewing without breaking controls
            const currentViewState = this.deckgl.viewState || this.deckgl.props.initialViewState;
            const currentZoom = currentViewState.zoom;
            
            // Only auto-zoom if currently zoomed too far in (beyond zoom 14)
            if (currentZoom > 14) {
                this.deckgl.setProps({
                    viewState: {
                        ...currentViewState,
                        zoom: 12, // Zoom to a reasonable level for heatmap viewing
                        transitionDuration: 800,
                        transitionInterpolator: new deck.FlyToInterpolator()
                    }
                });
            }
        }
        // Note: No longer modifying controller properties to avoid breaking zoom controls
    }

    /**
     * Create simple heatmap legend
     */
    createHeatmapLegend() {
        if (!this.elements.legendItems) return;
        
        // Clear existing legend items
        this.elements.legendItems.innerHTML = '';
        
        // Create heatmap legend container
        const heatmapLegend = document.createElement('div');
        heatmapLegend.className = 'heatmap-legend';
        
        // Legend title
        const title = document.createElement('h4');
        title.textContent = 'Accessibility Coverage';
        title.style.cssText = `
            margin: 0 0 15px 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
        `;
        heatmapLegend.appendChild(title);
        
        // Simple legend items
        const legendItems = [
            {
                color: 'rgb(20, 180, 20)',
                label: 'Well Covered Areas',

            },
            {
                color: 'rgb(200, 20, 20)', 
                label: 'Underserved Areas',
            }
        ];
        
        legendItems.forEach(item => {
            const legendItem = document.createElement('div');
            legendItem.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
                font-size: 13px;
                color: var(--text-primary);
            `;
            
            const colorBox = document.createElement('div');
            colorBox.style.cssText = `
                width: 16px;
                height: 16px;
                background: ${item.color};
                border-radius: 3px;
                border: 1px solid rgba(0,0,0,0.1);
                flex-shrink: 0;
            `;
            
            const label = document.createElement('span');
            label.textContent = `${item.label}`;
            
            legendItem.appendChild(colorBox);
            legendItem.appendChild(label);
            heatmapLegend.appendChild(legendItem);
        });
        
        // Distance info
        const distanceInfo = document.createElement('div');
        distanceInfo.style.cssText = `
            font-size: 11px;
            color: var(--text-secondary);
            text-align: center;
            margin-top: 10px;
            padding: 8px;
            background: rgba(var(--text-secondary-rgb), 0.05);
            border-radius: 4px;
            font-style: italic;
        `;
        distanceInfo.textContent = `Within ${this.coverageRadius}m of existing shelters`;
        heatmapLegend.appendChild(distanceInfo);
        
        this.elements.legendItems.appendChild(heatmapLegend);
    }

    /**
     * Update visualization layers (simplified)
     */
    updateVisualization() {
        if (!this.deckgl) return;

        // Create layers directly - much simpler
        const layers = [];
        
        // Base layer
        const basemapConfig = this.basemaps[this.currentBasemap];
        const baseLayer = this.createStandardTileLayer(basemapConfig);
        layers.push(baseLayer);
        
        // Data layers
        const dataLayers = this.createLayers();
        layers.push(...dataLayers);
        
        // Update deck.gl
        this.currentLayers = layers;
        this.deckgl.setProps({ layers: this.currentLayers });
        
        this.updateCoverageAnalysis();
        this.updateLegend();
    }
    
    /**
     * Get icon configuration for different shelter types using external SVG files
     * Uses deck.gl's auto-packing approach for high-quality icons
     */
    getShelterIcon(type) {
        const baseConfig = {
            width: 32,
            height: 32,
            anchorX: 16,
            anchorY: 16
        };

        switch (type) {
            case 'existing':
                return {
                    ...baseConfig,
                    url: 'data/airtight-hatch-svgrepo-com.svg',
                    id: 'existing-shelter'
                };
            case 'requested':
                return {
                    ...baseConfig,
                    url: 'data/user-location-icon.svg',
                    id: 'requested-shelter'
                };
            case 'optimal':
                return {
                    ...baseConfig,
                    url: 'data/add-location-icon.svg',
                    id: 'optimal-shelter'
                };
            default:
                return {
                    ...baseConfig,
                    url: 'data/airtight-hatch-svgrepo-com.svg',
                    id: 'default-shelter'
                };
        }
    }
    
    /**
     * Create standard tile layer for raster basemaps
     */
    createStandardTileLayer(basemapConfig) {
        return new deck.TileLayer({
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
    }
    
    /**
     * Update optimal locations in real-time
     */
    async updateOptimalLocations() {
        if (this.isAnalyzing) return;
        
        try {
            this.isAnalyzing = true;
            
            // Load optimal locations from precomputed data
            const optimalLocations = await this.spatialAnalyzer.getOptimalLocations(this.numNewShelters);
            
            // Store directly - they're already in the right format
            this.proposedShelters = optimalLocations;
            
            // Layer caching removed - no longer needed
            
            // Update visualization
            this.updateVisualization();
            
            // Update coverage analysis
            this.updateCoverageAnalysis();
            
        } catch (error) {
            console.error('❌ Loading optimal locations failed:', error);
        } finally {
            this.isAnalyzing = false;
        }
    }
    
    /**
     * Update coverage analysis and statistics
     */
    updateCoverageAnalysis() {
        const cacheKey = `optimal_shelters_${this.coverageRadius}m`;
        const data = this.spatialAnalyzer.optimalData.get(cacheKey);
        const requestedEval = this.spatialAnalyzer.getRequestedShelterEvaluation(this.proposedShelters.length);
        
        if (!data || !data.statistics) {
            return;
        }
        
        const stats = data.statistics;
        const newSheltersSelected = this.proposedShelters.length;
        
        // Calculate coverage from selected optimal shelters
        let newBuildingsCovered = 0;
        let newPeopleCovered = 0;
        if (newSheltersSelected > 0) {
            newBuildingsCovered = this.proposedShelters.reduce((sum, shelter) => sum + (shelter.buildings_covered || 0), 0);
            newPeopleCovered = this.proposedShelters.reduce((sum, shelter) => sum + ((shelter.buildings_covered || 0) * 7), 0); // Use consistent 7 people per building calculation
        }
        
        const existingCoverage = (stats.total_buildings_covered || 0) - (stats.new_buildings_covered || 0);
        const totalBuildingsCovered = existingCoverage + newBuildingsCovered;
        const totalPeopleCovered = ((totalBuildingsCovered) * 7); // 7 people per building
        const totalCoveragePercentage = (totalBuildingsCovered / stats.total_buildings) * 100;
        const currentCoveragePercentage = (existingCoverage / stats.total_buildings) * 100;
        
        // Calculate net additional buildings (new coverage minus existing coverage)
        const netAdditionalBuildings = newBuildingsCovered - (existingCoverage * 0); // No overlap in this case since we're adding to existing
        
        // Update main statistics
        if (this.elements.currentCoverage) {
            this.elements.currentCoverage.textContent = `${currentCoveragePercentage.toFixed(1)}%`;
        }
        if (this.elements.newCoverage) {
            this.elements.newCoverage.textContent = `${totalCoveragePercentage.toFixed(1)}%`;
        }
        if (this.elements.buildingsCovered) {
            this.elements.buildingsCovered.textContent = totalBuildingsCovered.toLocaleString();
        }
        if (this.elements.additionalPeople) {
            this.elements.additionalPeople.textContent = Math.max(0, netAdditionalBuildings).toLocaleString();
        }
        
        // Requested shelter analysis removed - these statistics were confusing and not needed
    }
    
    /**
     * Handle hover events (simplified for better clearing)
     */
    handleHover(info) {
        const { object, x, y } = info;
        const tooltip = this.elements.tooltip;
        
        // Direct object detection only - no nearby shelter searching
        if (object) {
            // Shelter objects have highest priority
            if (info.layer.id === 'existing-shelters' || info.layer.id === 'requested-shelters' || info.layer.id === 'proposed-shelters') {
                this.showShelterTooltip(object, info.layer.id, x, y);
                return;
            } 
            
            // Handle other object types - clear shelter hover first
            this.clearShelterHover();
            
            if (info.layer.id === 'accessibility-grid-unified') {
                // Heatmap active - no tooltips for grid cells
                tooltip.style.display = 'none';
                return;
            } else if (info.layer.id === 'habitation-clusters') {
                this.showPolygonTooltip(object, 'habitationCluster', x, y);
                return;
            } else if (info.layer.id === 'statistical-areas-geojson') {
                this.showPolygonTooltip(object, 'statisticalArea', x, y);
                return;
            } else if (info.layer.id === 'buildings' || info.layer.id === 'buildings-geojson' || info.layer.id === 'coverage-brush') {
                tooltip.style.display = 'none';
                return;
            }
        }
        
        // No object - clear everything
        this.clearShelterHover();
        tooltip.style.display = 'none';
    }
    
    /**
     * Show tooltip for polygon features
     */
    showPolygonTooltip(polygon, type, x, y) {
        const tooltip = this.elements.tooltip;
        let content = '';
        
        if (type === 'statisticalArea') {
            // Extract properties from the polygon
            const props = polygon.properties || {};
            const areaId = props.YISHUV_STAT11 || props.id || props.ID || 'Unknown';
            const areaName = props.SHEM_YISHUV || props.name || props.NAME || 'Unnamed Area';
            
            content = `
                <strong>📊 Statistical Area</strong><br>
                ID: ${areaId}<br>
                ${areaName !== 'Unnamed Area' ? `Name: ${areaName}<br>` : ''}
                <em>Click to select and highlight</em>
            `;
            
        } else if (type === 'habitationCluster') {
            // Extract properties from the polygon
            const props = polygon.properties || {};
            const clusterId = props.OBJECTID || props.id || props.ID || polygon._index || 'Unknown';
            const clusterName = props.Name || props.name || props.NAME || 'Unnamed Cluster';
            const population = props.Population || props.population || props.POP || '';
            
            content = `
                <strong>🏘️ Habitation Cluster</strong><br>
                ID: ${clusterId}<br>
                ${clusterName !== 'Unnamed Cluster' ? `Name: ${clusterName}<br>` : ''}
                ${population ? `Population: ${population}<br>` : ''}
                <em>Click to select and highlight</em>
            `;
        }
        
        if (content) {
            tooltip.innerHTML = content;
            tooltip.style.display = 'block';
            tooltip.style.left = `${x + 10}px`;
            tooltip.style.top = `${y - 10}px`;
        }
    }
    


    /**
     * Handle click events (shelter clicking disabled - hover only)
     */
    handleClick(info) {
        const { object } = info;
        
        if (object) {
            // Shelter clicking disabled - hover only mode
            if (info.layer.id === 'existing-shelters' || info.layer.id === 'requested-shelters' || info.layer.id === 'proposed-shelters') {
                // Shelter clicks disabled - do nothing
                return;
            } else if (info.layer.id === 'habitation-clusters') {
                // Select habitation cluster (medium priority)
                this.selectPolygon(object, 'habitationCluster');
                this.clearShelterSelection();
            } else if (info.layer.id === 'statistical-areas-geojson') {
                // Select statistical area (lowest priority)
                this.selectPolygon(object, 'statisticalArea');
                this.clearShelterSelection();
            }
        } else {
            // Clicked on empty space - clear all selections
            this.clearShelterSelection();
            this.clearPolygonSelection();
        }
    }
    
    /**
     * Jump to a specific optimal site location
     */
    jumpToOptimalSite(lat, lon) {
        if (this.deckgl) {
            this.deckgl.setProps({
                viewState: {
                    longitude: lon,
                    latitude: lat,
                    zoom: 16,
                    pitch: 0,
                    bearing: 0,
                    transitionDuration: 1000,
                    transitionInterpolator: new deck.FlyToInterpolator()
                }
            });
        }
    }
    
    /**
     * Handle viewport changes 
     */
    handleViewStateChange(viewState) {
        const previousZoom = this._currentZoom;
        this._currentViewState = viewState;
        this._currentZoom = viewState.zoom;
        
        // Building layer status indicators removed
        
        // Update scale bar
        this.updateScaleBar();
        
        // Only recreate layers if zoom level significantly changed (affects tile/geojson choice)
        if (!previousZoom || Math.abs(this._currentZoom - previousZoom) > 0.5) {
            const layers = this.createLayers();
            this.deckgl.setProps({layers});
        }
    }
    
    /**
     * Initialize and update scale bar
     */
    updateScaleBar() {
        const scaleBar = document.getElementById('scaleBar');
        const scaleLine = document.getElementById('scaleLine');
        const scaleText = document.getElementById('scaleText');
        
        if (!scaleBar || !scaleLine || !scaleText) return;
        
        // Calculate scale based on zoom and latitude
        const zoom = this._currentZoom || 12;
        const latitude = (this._currentViewState && this._currentViewState.latitude) || 31.25; // Fallback to center of Israel
        
        // Earth circumference in meters at the equator
        const earthCircumference = 40075016.686;
        
        // Calculate meters per pixel at current zoom and latitude
        const metersPerPixel = (earthCircumference * Math.cos(latitude * Math.PI / 180)) / Math.pow(2, zoom + 8);
        
        // Target scale bar width in pixels
        const targetPixelWidth = 100;
        
        // Calculate actual distance for target width
        let scaleDistance = metersPerPixel * targetPixelWidth;
        
        // Round to nice numbers and determine units
        let scaleText_value, actualPixelWidth;
        
        if (scaleDistance >= 1000) {
            // Use kilometers
            const km = scaleDistance / 1000;
            if (km >= 10) {
                scaleText_value = Math.round(km) + ' km';
                actualPixelWidth = (Math.round(km) * 1000) / metersPerPixel;
            } else if (km >= 1) {
                scaleText_value = Math.round(km * 10) / 10 + ' km';
                actualPixelWidth = (Math.round(km * 10) / 10 * 1000) / metersPerPixel;
            } else {
                scaleText_value = Math.round(km * 100) / 100 + ' km';
                actualPixelWidth = (Math.round(km * 100) / 100 * 1000) / metersPerPixel;
            }
        } else {
            // Use meters
            if (scaleDistance >= 100) {
                const roundedMeters = Math.round(scaleDistance / 10) * 10;
                scaleText_value = roundedMeters + ' m';
                actualPixelWidth = roundedMeters / metersPerPixel;
            } else if (scaleDistance >= 10) {
                const roundedMeters = Math.round(scaleDistance);
                scaleText_value = roundedMeters + ' m';
                actualPixelWidth = roundedMeters / metersPerPixel;
            } else {
                const roundedMeters = Math.round(scaleDistance * 10) / 10;
                scaleText_value = roundedMeters + ' m';
                actualPixelWidth = roundedMeters / metersPerPixel;
            }
        }
        
        // Update scale bar
        scaleLine.style.width = Math.round(actualPixelWidth) + 'px';
        scaleText.textContent = scaleText_value;
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
    
    // Tile utility methods removed - no longer needed

    /**
     * Change basemap
     */
    changeBasemap(basemap) {
        this.currentBasemap = basemap;
        
        // Update UI styling based on basemap
        const body = document.body;
        if (basemap === 'light') {
            body.classList.add('light-basemap');
        } else {
            body.classList.remove('light-basemap');
        }
        
        // Layer caching removed - no longer needed
        
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
    

    
    /**
     * Calculate which buildings are covered by a specific shelter
     */
    calculateShelterCoverage(shelter) {
        if (!this.spatialAnalyzer.buildings || !shelter) {
            return [];
        }
        
        const shelterCoords = shelter.geometry ? shelter.geometry.coordinates : [shelter.lon, shelter.lat];
        const coverageRadiusDeg = this.coverageRadius / 111000; // Approximate conversion to degrees
        const coverageRadiusSquared = coverageRadiusDeg * coverageRadiusDeg; // Use squared distance for efficiency
        
        const coveredBuildings = [];
        
        // Simple loop through all buildings with distance calculation
        for (let i = 0; i < this.spatialAnalyzer.buildings.features.length; i++) {
            const building = this.spatialAnalyzer.buildings.features[i];
            
            // Calculate building centroid for distance calculation
            let buildingCentroid;
            if (building.geometry.type === 'Point') {
                buildingCentroid = building.geometry.coordinates;
            } else if (building.geometry.type === 'Polygon') {
                // Calculate centroid of polygon
                const coords = building.geometry.coordinates[0]; // First ring (exterior)
                let sumX = 0, sumY = 0;
                for (let j = 0; j < coords.length - 1; j++) { // Skip last point (same as first)
                    sumX += coords[j][0];
                    sumY += coords[j][1];
                }
                buildingCentroid = [sumX / (coords.length - 1), sumY / (coords.length - 1)];
            } else {
                // Skip if not point or polygon
                continue;
            }
            
            // Calculate squared distance (faster than sqrt)
            const dx = buildingCentroid[0] - shelterCoords[0];
            const dy = buildingCentroid[1] - shelterCoords[1];
            const distanceSquared = dx * dx + dy * dy;
            
            if (distanceSquared <= coverageRadiusSquared) {
                coveredBuildings.push(i); // Use array index as building ID
            }
        }
        
        return coveredBuildings;
    }
    
    /**
     * Select a shelter and highlight its coverage
     */
    selectShelter(shelter) {
        this.selectedShelter = shelter;
        // Use cached coverage for consistency with hover optimization
        this.highlightedBuildings = this.getCachedCoverage(shelter);
        
        // Layer caching removed - no longer needed
        
        this.updateVisualization();
        this.updateSelectionUI();
    }
    
    /**
     * Clear shelter selection
     */
    clearShelterSelection() {
        this.selectedShelter = null;
        this.highlightedBuildings = [];
        
        // Layer caching removed - no longer needed
        
        this.updateVisualization();
        this.updateSelectionUI();
    }
    
    /**
     * Update UI to show selection status
     */
    updateSelectionUI() {
        // Selection status updated - UI changes handled by layer updates
    }
    
    /**
     * Load optimized accessibility data for heatmap visualization
     */
    async loadAccessibilityData() {
        if (this.isCalculatingAccessibility) return;
        
        this.isCalculatingAccessibility = true;
        this.showLoading('Loading accessibility data...');
        
        try {
            // Load accessibility data
            const response = await fetch('data/accessibility_heatmap.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const accessibilityDataAll = await response.json();
            
            // Store raw data and extract for current radius
            this.allAccessibilityData = accessibilityDataAll;
            this.updateAccessibilityDataForRadius();
            console.log(`🚀 Loaded accessibility data: ${accessibilityDataAll.accessibility_points.length} buildings, ${accessibilityDataAll.radii_available.length} radii`);
            
        } catch (error) {
            console.error('Error loading accessibility data:', error);
            this.accessibilityData = null;
        } finally {
            this.isCalculatingAccessibility = false;
            this.hideLoading();
        }
    }
    
    /**
     * Update accessibility data when coverage radius changes
     */
    updateAccessibilityDataForRadius() {
        if (!this.allAccessibilityData) return;
        
        // Extract coverage for current radius from optimized data
        const radiusKey = `${this.coverageRadius}m`;
        const rawPoints = this.allAccessibilityData.accessibility_points;
        
        // Transform optimized data to format expected by ScreenGridLayer
        this.accessibilityData = rawPoints.map(point => ({
            position: point.position,
            type: point.coverage[radiusKey] ? 'covered' : 'uncovered',
            weight: point.coverage[radiusKey] ? 1 : -1  // +1 for covered (green), -1 for uncovered (red)
        }));
        
        // Layer caching removed - no longer needed
        
        console.log(`🔄 Extracted ${radiusKey} data: ${this.accessibilityData.length} points`);
    }
    

    

    
    /**
     * Select a polygon and highlight its coverage
     */
    selectPolygon(polygon, type) {
        this.selectedPolygon = polygon;
        this.selectedPolygonType = type;
        this.updateVisualization();
        this.updateSelectionUI();
    }
    
    /**
     * Clear polygon selection
     */
    clearPolygonSelection() {
        this.selectedPolygon = null;
        this.selectedPolygonType = null;
        this.updateVisualization();
        this.updateSelectionUI();
    }
    
    // findNearestShelterWithinRadius method removed - no longer needed with simplified hover logic
    
    /**
     * Show tooltip for a specific shelter (simplified and compact)
     */
    showShelterTooltip(shelter, layerId, x, y) {
        const tooltip = document.getElementById('tooltip');
        
        // Handle hover state directly here - no recursive calls
        if (this.hoverState.currentShelter !== shelter) {
            this.hoverState.currentShelter = shelter;
            this.hoveredShelter = shelter;
            this.hoveredBuildings = this.getCachedCoverage(shelter);
            this.updateCoverageLayersOnly();
        }
        
        // Generate compact tooltip content
        let content = '';
        
        if (layerId === 'existing-shelters') {
            const buildingsCovered = this.hoveredBuildings.length;
            content = `Existing • ${buildingsCovered} buildings covered`;
            
        } else if (layerId === 'requested-shelters') {
            const buildingsCovered = this.hoveredBuildings.length;
            content = `Requested • ${buildingsCovered} buildings covered`;
            
        } else if (layerId === 'proposed-shelters') {
            const buildingsCovered = shelter.buildings_covered || 0;
            const rank = shelter.rank || 1;
            content = `New Site #${rank} • ${buildingsCovered} buildings covered`;
        }
        
        // Show compact tooltip
        if (content) {
            tooltip.innerHTML = content;
            tooltip.style.display = 'block';
            tooltip.style.left = `${x + 10}px`;
            tooltip.style.top = `${y - 10}px`;
        }
    }

    // Building layer status indicators removed - no longer needed

    // createLayersWithCache method removed - using createLayers directly
    
    /**
     * Create accessibility heatmap layer
     */
    createAccessibilityHeatmapLayer() {
        if (!this.accessibilityData || this.accessibilityData.length === 0) return null;
        
        const coveredCount = this.accessibilityData.filter(d => d.type === 'covered').length;
        const uncoveredCount = this.accessibilityData.filter(d => d.type === 'uncovered').length;
        console.log(`🔥 Unified Heatmap data: ${this.accessibilityData.length} total points`);
        console.log(`   🟢 Covered: ${coveredCount} buildings (${(coveredCount/this.accessibilityData.length*100).toFixed(1)}%)`);
        console.log(`   🔴 Uncovered: ${uncoveredCount} buildings (${(uncoveredCount/this.accessibilityData.length*100).toFixed(1)}%)`);
        
        return new deck.ScreenGridLayer({
            id: 'accessibility-grid-unified',
            data: this.accessibilityData,
            getPosition: d => d.position,
            getWeight: d => d.weight, // Simple: +1 for covered, -1 for uncovered
            cellSizePixels: 8,  // Smaller cells for better detail when zoomed in
            cellMarginPixels: 0,
            gpuAggregation: true,
            aggregation: 'MEAN',
            // Proportional color scheme: Red (100% uncovered) → Yellow (50/50) → Green (100% covered)
            colorRange: [
                [200, 20, 20, 255],     // Pure red: 100% uncovered buildings
                [255, 255, 0, 255],     // Pure yellow: 50/50 split
                [20, 180, 20, 255]      // Pure green: 100% covered buildings
            ],
            // Perfect proportional domain: -1 = 100% uncovered, 0 = 50/50, +1 = 100% covered
            colorDomain: [-1, 0, 1],
            pickable: false, // Disabled tooltips
            opacity: 0.85
        });
    }
    
    /**
     * Create existing shelters layer
     */
    createExistingSheltersLayer() {
        const currentData = this.spatialAnalyzer.getCurrentData();
        const existingShelters = currentData.shelters.features.filter(shelter => 
            shelter.properties && shelter.properties.status === 'Built'
        );
        
        if (existingShelters.length === 0) return null;
        
        return new deck.IconLayer({
            id: 'existing-shelters',
            data: existingShelters,
            pickable: true,
            getIcon: () => this.getShelterIcon('existing'),
            getPosition: d => d.geometry.coordinates,
            getSize: () => this.ICON_SIZE * 8000, // Scale up for visibility
            getColor: d => {
                // Highlight selected shelter
                if (this.selectedShelter && this.selectedShelter.properties && 
                    this.selectedShelter.properties.shelter_id === d.properties.shelter_id) {
                    return [255, 255, 255, 255]; // White for selected (100% opacity)
                }
                return [255, 255, 255, 230]; // White tint (90% opacity)
            },
            sizeScale: this.ICON_SIZE_SCALE,
            sizeUnits: 'meters',
            sizeMinPixels: this.ICON_MIN_PIXELS,
            sizeMaxPixels: this.ICON_MAX_PIXELS,
            onHover: (info) => this.handleHover(info),
            onClick: (info) => this.handleClick(info)
        });
    }
    
    /**
     * Create requested shelters layer
     */
    createRequestedSheltersLayer() {
        const currentData = this.spatialAnalyzer.getCurrentData();
        const requestedShelters = currentData.shelters.features.filter(shelter => 
            shelter.properties && shelter.properties.status === 'Request'
        );
        
        if (requestedShelters.length === 0) return null;
        
        return new deck.IconLayer({
            id: 'requested-shelters',
            data: requestedShelters,
            pickable: true,
            getIcon: () => this.getShelterIcon('requested'),
            getPosition: d => d.geometry.coordinates,
            getSize: () => this.ICON_SIZE * 8000, // Scale up for visibility
            getColor: d => {
                // Highlight selected shelter
                if (this.selectedShelter && this.selectedShelter.properties && 
                    this.selectedShelter.properties.shelter_id === d.properties.shelter_id) {
                    return [255, 255, 255, 255]; // White for selected (100% opacity)
                }
                return [255, 255, 255, 230]; // White tint (90% opacity)
            },
            sizeScale: this.ICON_SIZE_SCALE,
            sizeUnits: 'meters',
            sizeMinPixels: this.ICON_MIN_PIXELS,
            sizeMaxPixels: this.ICON_MAX_PIXELS,
            onHover: (info) => this.handleHover(info),
            onClick: (info) => this.handleClick(info)
        });
    }
    
    /**
     * Create optimal shelters layer
     */
    createOptimalSheltersLayer() {
        if (this.proposedShelters.length === 0) return null;
        
        return new deck.IconLayer({
            id: 'proposed-shelters',
            data: this.proposedShelters.map((shelter, index) => ({
                coordinates: [shelter.lon, shelter.lat],
                rank: index + 1,
                ...shelter
            })),
            pickable: true,
            getIcon: () => this.getShelterIcon('optimal'),
            getPosition: d => d.coordinates,
            getSize: () => this.ICON_SIZE * 8000, // Scale up for visibility
            getColor: d => {
                // Highlight selected shelter
                if (this.selectedShelter && this.selectedShelter.coordinates && 
                    this.selectedShelter.coordinates[0] === d.coordinates[0] && 
                    this.selectedShelter.coordinates[1] === d.coordinates[1]) {
                    return [255, 255, 255, 255]; // White for selected (100% opacity)
                }
                return [255, 255, 255, 230]; // White tint (90% opacity)
            },
            sizeScale: this.ICON_SIZE_SCALE,
            sizeUnits: 'meters',
            sizeMinPixels: this.ICON_MIN_PIXELS,
            sizeMaxPixels: this.ICON_MAX_PIXELS,
            onHover: (info) => this.handleHover(info),
            onClick: (info) => {
                if (info.object) {
                    this.selectShelter(info.object);
                    this.jumpToOptimalSite(info.object.coordinates[1], info.object.coordinates[0]);
                }
            }
        });
    }
    
    /**
     * Create buildings layer specifically (simplified)
     */
    createBuildingsLayer() {
        const currentData = this.spatialAnalyzer.getCurrentData();
        
        if (!currentData.buildings || currentData.buildings.features.length === 0) {
            return null;
        }
        
        let buildingsToShow;
        if (this.layerVisibility.buildings) {
            buildingsToShow = currentData.buildings.features;
        } else {
            const coveredIndices = new Set([
                ...(this.hoveredShelter ? this.hoveredBuildings : []),
                ...(this.selectedShelter ? this.highlightedBuildings : [])
            ]);
            buildingsToShow = currentData.buildings.features.filter((_, index) => 
                coveredIndices.has(index)
            );
        }
        
        if (buildingsToShow.length === 0) {
            return null;
        }
        
        return new deck.GeoJsonLayer({
            id: 'buildings-geojson',
            data: buildingsToShow.map((feature, index) => ({
                ...feature,
                _index: index
            })),
            pickable: false,
            stroked: true,
            filled: true,
            lineWidthMinPixels: 1,
            lineWidthMaxPixels: 2,
            getFillColor: d => {
                const buildingIndex = d._index || 0;
                
                if (this.layerVisibility.buildings) {
                    if (this.hoveredShelter && this.hoveredBuildings.includes(buildingIndex)) {
                        return [0, 255, 0, 150];
                    }
                    if (this.selectedShelter && this.highlightedBuildings.includes(buildingIndex)) {
                        return [0, 255, 0, 200];
                    }
                    return [255, 0, 0, 120];
                } else {
                    return [0, 255, 0, 200];
                }
            },
            getLineColor: d => {
                const buildingIndex = d._index || 0;
                
                if (this.layerVisibility.buildings) {
                    if (this.hoveredShelter && this.hoveredBuildings.includes(buildingIndex)) {
                        return [0, 255, 0, 255];
                    }
                    if (this.selectedShelter && this.highlightedBuildings.includes(buildingIndex)) {
                        return [0, 255, 0, 255];
                    }
                    return [255, 0, 0, 180];
                } else {
                    return [0, 255, 0, 255];
                }
            },
            getLineWidth: d => {
                const buildingIndex = d._index || 0;
                
                if (this.selectedShelter && this.highlightedBuildings.includes(buildingIndex)) {
                    return 3;
                }
                if (this.hoveredShelter && this.hoveredBuildings.includes(buildingIndex)) {
                    return 2;
                }
                return 1;
            }
        });
    }
    
    /**
     * Create statistical areas layer specifically
     */
    createStatisticalAreasLayer() {
        const currentData = this.spatialAnalyzer.getCurrentData();
        
        if (!currentData.statisticalAreas || currentData.statisticalAreas.length === 0) {
            return null;
        }
        
        return new deck.GeoJsonLayer({
            id: 'statistical-areas-geojson',
            data: currentData.statisticalAreas.map((feature, index) => ({
                ...feature,
                _layerType: 'statisticalArea',
                _index: index
            })),
            pickable: true,
            stroked: true,
            filled: true,
            lineWidthMinPixels: 2,
            lineWidthMaxPixels: 4,
            getFillColor: d => {
                const isSelected = this.selectedPolygon?.layerType === 'statisticalArea' && 
                                 this.selectedPolygon?._index === d._index;
                return isSelected ? [128, 128, 128, 100] : [128, 128, 128, 30]; // Grey fill
            },
            getLineColor: d => {
                const isSelected = this.selectedPolygon?.layerType === 'statisticalArea' && 
                                 this.selectedPolygon?._index === d._index;
                return isSelected ? [80, 80, 80, 255] : [128, 128, 128, 200]; // Grey outline
            },
            getLineWidth: d => {
                const isSelected = this.selectedPolygon?.layerType === 'statisticalArea' && 
                                 this.selectedPolygon?._index === d._index;
                return isSelected ? 4 : 2;
            }
        });
    }
    
    /**
     * Create habitation clusters layer specifically (simplified)
     */
    createHabitationClustersLayer() {
        const currentData = this.spatialAnalyzer.getCurrentData();
        
        if (!currentData.habitationClusters || currentData.habitationClusters.length === 0) {
            return null;
        }
        
        return new deck.GeoJsonLayer({
            id: 'habitation-clusters-geojson',
            data: currentData.habitationClusters.map((feature, index) => ({
                ...feature,
                _layerType: 'habitationCluster',
                _index: index
            })),
            pickable: true,
            stroked: true,
            filled: true,
            lineWidthMinPixels: 1,
            lineWidthMaxPixels: 2,
            getFillColor: d => {
                const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                 this.selectedPolygon?._index === d._index;
                return isSelected ? [52, 152, 219, 100] : [52, 152, 219, 25];
            },
            getLineColor: d => {
                const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                 this.selectedPolygon?._index === d._index;
                return isSelected ? [30, 100, 150, 255] : [52, 152, 219, 120];
            },
            getLineWidth: d => {
                const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                 this.selectedPolygon?._index === d._index;
                return isSelected ? 3 : 1;
            }
        });
    }
    
    /**
     * Create coverage brush layer specifically
     */
    createCoverageBrushLayer() {
        if (!this.spatialAnalyzer.buildings) return null;
        
        const activeShelter = this.selectedShelter || this.hoveredShelter;
        const coveredBuildingIndices = this.selectedShelter ? this.highlightedBuildings : this.hoveredBuildings;
        
        if (!activeShelter || coveredBuildingIndices.length === 0) {
            return null;
        }
        
        // Create a brush layer to highlight covered buildings
        const coveredBuildings = coveredBuildingIndices.map(index => 
            this.spatialAnalyzer.buildings.features[index]
        ).filter(building => building); // Filter out any undefined buildings
        
        if (coveredBuildings.length === 0) {
            return null;
        }
        
        return new deck.GeoJsonLayer({
            id: 'coverage-brush',
            data: coveredBuildings,
            pickable: false,
            stroked: true,
            filled: true,
            lineWidthMinPixels: 2,
            lineWidthMaxPixels: 4,
            // Use brush extension for better visual effect (if available)
            extensions: deck.BrushingExtension ? [new deck.BrushingExtension()] : [],
            // High opacity for coverage highlighting
            getFillColor: () => {
                if (this.selectedShelter) {
                    return [0, 255, 0, 180]; // Bright green for selected coverage
                } else {
                    return [0, 255, 0, 120]; // Lighter green for hover coverage
                }
            },
            getLineColor: () => {
                if (this.selectedShelter) {
                    return [0, 200, 0, 255]; // Darker green outline for selected
                } else {
                    return [0, 200, 0, 200]; // Lighter green outline for hover
                }
            },
            getLineWidth: () => {
                if (this.selectedShelter) {
                    return 3; // Thicker for selected
                } else {
                    return 2; // Thinner for hover
                }
            }
        });
    }
   
    /**
     * Clear hover state immediately 
     */
    clearShelterHover() {
        // Always clear state - don't check if there was a previous shelter
        this.hoverState.currentShelter = null;
        this.hoveredShelter = null;
        this.hoveredBuildings = [];
        
        // Hide tooltip immediately and ensure it's hidden
        const tooltip = document.getElementById('tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
            tooltip.innerHTML = ''; // Clear content too
        }
        
        // Update visualization only if we actually had hover state
        this.updateCoverageLayersOnly();
    }
    
    /**
     * Lightweight update that only refreshes coverage-related layers
     * Bypasses full visualization pipeline for instant clearing
     */
    updateCoverageLayersOnly() {
        if (!this.deckgl || !this.currentLayers) return;
        
        // Only update if we have coverage data that needs updating
        const hasHoverData = this.hoveredShelter && this.hoveredBuildings.length > 0;
        const hasSelectedData = this.selectedShelter && this.highlightedBuildings.length > 0;
        
        // Track if we actually need to update
        let needsUpdate = false;
        
        // Create minimal layer updates
        const updatedLayers = [];
        
        // Copy all non-coverage layers unchanged
        for (const layer of this.currentLayers) {
            if (layer.id !== 'coverage-brush' && 
                layer.id !== 'buildings-geojson') {
                updatedLayers.push(layer);
            } else {
                needsUpdate = true; // Found a layer that needs updating
            }
        }
        
        // Add buildings layer with updated highlighting (only if buildings are visible)
        if (this.layerVisibility.buildings || hasHoverData || hasSelectedData) {
            const buildingsLayer = this.createBuildingsLayer();
            if (buildingsLayer) {
                updatedLayers.push(buildingsLayer);
                needsUpdate = true;
            }
        }
        
        // Add coverage brush layer if needed
        if (hasHoverData || hasSelectedData) {
            const coverageBrushLayer = this.createCoverageBrushLayer();
            if (coverageBrushLayer) {
                updatedLayers.push(coverageBrushLayer);
                needsUpdate = true;
            }
        }
        
        // Only update deck.gl if something actually changed
        if (needsUpdate) {
            this.currentLayers = updatedLayers;
            this.deckgl.setProps({ layers: this.currentLayers });
        }
    }
    

    
    /**
     * Get layer ID for a shelter to pass to showShelterTooltip
     */
    getLayerIdForShelter(shelter) {
        if (shelter.properties && shelter.properties.status === 'Built') {
            return 'existing-shelters';
        } else if (shelter.properties && shelter.properties.status === 'Request') {
            return 'requested-shelters';
        } else {
            return 'proposed-shelters';
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the application
    window.app = new ShelterAccessApp();
    window.app.initializeApp();
    
    // Add global debug functions
    window.debugCoverage = () => {
        if (window.app) {
            window.app.debugCoverageCalculation();
        } else {
            console.log('❌ App not initialized yet');
        }
    };
    
    window.testShelterSelection = (shelterIndex = 0) => {
        if (window.app && window.app.spatialAnalyzer.shelters) {
            const shelter = window.app.spatialAnalyzer.shelters.features[shelterIndex];
            if (shelter) {
                window.app.selectShelter(shelter);
                console.log(`✅ Selected shelter ${shelterIndex}:`, shelter.properties?.shelter_id);
            } else {
                console.log('❌ Shelter not found at index:', shelterIndex);
            }
        } else {
            console.log('❌ App or data not ready');
        }
    };
    
    window.debugLayers = () => {
        if (window.app) {
            window.app.debugLayerVisibility();
        } else {
            console.log('❌ App not initialized yet');
        }
    };
    
    window.toggleBuildings = () => {
        if (window.app) {
            const checkbox = document.getElementById('buildingsLayer');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
                console.log('🔄 Toggled buildings layer');
            }
        } else {
            console.log('❌ App not initialized yet');
        }
    };
    
    window.toggleHeatmap = () => {
        if (window.app) {
            const checkbox = document.getElementById('accessibilityHeatmapLayer');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
                console.log('🔥 Toggled accessibility heatmap');
            }
        } else {
            console.log('❌ App not initialized yet');
        }
    };
});