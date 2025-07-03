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
        this.isAnalyzing = false;
        
        // Icon sizing constants - tunable in one place
        this.ICON_SIZE = 0.006; // Increased from 0.003 for better visibility
        this.ICON_SIZE_SCALE = 2; 
        this.ICON_MIN_PIXELS = 20; // Increased from 14 for better visibility
        this.ICON_MAX_PIXELS = 140; // Increased from 124 for better visibility
        
        // Add state for hover highlighting
        this.hoveredShelter = null;
        this.hoveredBuildings = [];
        
        // Add state for selected polygons
        this.selectedPolygon = null;
        
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
        
        // Precomputed shelter coverage data - replaces expensive calculations
        this.shelterCoverageData = null;
        
        // Accessibility heatmap data
        this.accessibilityData = null;
        this.allAccessibilityData = null; // Stores all radii data
        this.isCalculatingAccessibility = false;
        
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
        
        // Debouncing for view state changes
        this._viewStateDebounceTimer = null;
        this._pendingViewState = null;
        this._basemapDebounceTimer = null;
        
        // UI Elements - simplified
        this.elements = {
            loading: document.getElementById('loading'),
            attribution: document.getElementById('attribution'),
            tooltip: document.getElementById('tooltip'),
            // Core controls
            distanceButtons: document.getElementById('distanceButtons'),
            newSheltersSlider: document.getElementById('newShelters'),
            newSheltersValue: document.getElementById('newSheltersValue'),
            heatmapToggle: document.getElementById('heatmapToggle'), // Now a checkbox
            // Statistics
            currentCoverage: document.getElementById('currentCoverage'),
            currentRadius: document.getElementById('currentRadius'),
            residentsLeftOut: document.getElementById('residentsLeftOut'),
            newSheltersCount: document.getElementById('newSheltersCount'),
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
    
    /**
     * Load precomputed shelter coverage data for instant lookups
     */
    async loadShelterCoverageData() {
        try {
            console.log('🚀 Loading precomputed shelter coverage data...');
            const response = await fetch('data/shelter_coverage_precomputed.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.shelterCoverageData = await response.json();
            console.log(`✅ Loaded precomputed coverage for ${Object.keys(this.shelterCoverageData.shelter_coverage_map).length} shelters`);
            
        } catch (error) {
            console.error('❌ Error loading precomputed shelter coverage:', error);
            this.shelterCoverageData = null;
        }
    }
    
    /**
     * Generate lookup key for precomputed shelter coverage
     */
    generateShelterKey(shelter) {
        if (!shelter) return null;
        
        let coords;
        if (shelter.geometry && shelter.geometry.coordinates) {
            coords = shelter.geometry.coordinates;
        } else if (shelter.coordinates) {
            coords = shelter.coordinates;
        } else if (shelter.lat && shelter.lon) {
            coords = [shelter.lon, shelter.lat];
        } else {
            return null;
        }
        
        // Use same format as precomputed data: "lng_lat"
        return `${coords[0]}_${coords[1]}`;
    }
    
    /**
     * Get precomputed shelter coverage - instant lookup instead of expensive calculation
     */
    getPrecomputedCoverage(shelter) {
        if (!this.shelterCoverageData || !shelter) {
            return [];
        }
        
        const shelterKey = this.generateShelterKey(shelter);
        if (!shelterKey) return [];
        
        const shelterData = this.shelterCoverageData.shelter_coverage_map[shelterKey];
        if (!shelterData) return [];
        
        const radiusKey = `${this.coverageRadius}m`;
        const coverageData = shelterData.coverage_by_radius[radiusKey];
        
        return coverageData ? (coverageData.building_indices || []) : [];
    }
    
    /**
     * Get shelter coverage - uses precomputed data when available, falls back to calculation
     */
    getShelterCoverage(shelter) {
        // Try precomputed data first (instant lookup)
        const precomputedCoverage = this.getPrecomputedCoverage(shelter);
        if (precomputedCoverage.length > 0) {
            return precomputedCoverage;
        }
        
        // Fallback to calculation for optimal shelters or missing data
        return this.calculateShelterCoverage(shelter);
    }
    
    /**
     * Initialize the application
     */
    async initializeApp() {
        try {
            this.setupEventListeners();
            this.setupMainMenu();
            await this.spatialAnalyzer.loadData();
            
            // Load precomputed shelter coverage data for instant lookups
            await this.loadShelterCoverageData();
            
            await this.initializeMap();
            this.updateAttribution();
            
            // Initial load of optimal locations and coverage analysis
            await this.updateOptimalLocations();
            
            // Initialize legend
            this.updateLegend();
            
            // Hide loading overlay
            this.hideLoading();
            
            console.log('✅ App initialized with precomputed shelter coverage data');
            
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
        const statsPanel = document.querySelector('.stats-panel');
        if (statsMinimize && statsPanel) {
            statsMinimize.addEventListener('click', () => {
                statsPanel.classList.toggle('collapsed');
                const icon = statsMinimize.querySelector('span');
                if (statsPanel.classList.contains('collapsed')) {
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
        this.setupModal('layers');
    }
    
    /**
     * Setup modal functionality for any modal by name
     */
    setupModal(modalName) {
        const button = document.getElementById(`${modalName}Button`);
        const modal = document.getElementById(`${modalName}Modal`);
        const closeButton = document.getElementById(`close${modalName.charAt(0).toUpperCase() + modalName.slice(1)}Modal`);
        
        // Open modal
        if (button) {
            button.addEventListener('click', () => modal.classList.add('show'));
        }
        
        // Close modal - close button
        if (closeButton) {
            closeButton.addEventListener('click', () => modal.classList.remove('show'));
        }
        
        // Close modal - click outside
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('show');
            });
        }
    }
    
    /**
     * Setup event listeners for UI controls
     */
    setupEventListeners() {
        // Setup modals using generic setup function
        this.setupModal('about');
        this.setupModal('methods');
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Close any open modal
                const openModal = document.querySelector('.modal.show');
                if (openModal) openModal.classList.remove('show');
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
                    
                    // Update spatial analyzer and refresh
                    await this.spatialAnalyzer.setCoverageRadius(this.coverageRadius);
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
        
        // Heatmap checkbox toggle - updated for new checkbox structure
        if (this.elements.heatmapToggle) {
            this.elements.heatmapToggle.addEventListener('change', async (e) => {
                const isActive = e.target.checked;
                this.layerVisibility.accessibilityHeatmap = isActive;
                
                // Toggle new shelter control state
                this.toggleNewShelterControl(isActive);
                
                if (isActive) {
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
                    // Update optimal locations when disabling heatmap
                    await this.updateOptimalLocations();
                }
                
                this.updateVisualization();
            });
            
            // Set initial state based on checkbox
            this.toggleNewShelterControl(this.elements.heatmapToggle.checked);
        }
        
        // Basemap button selection
        const basemapButtons = document.querySelectorAll('.view-button');
        basemapButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                // Remove active class from all buttons
                basemapButtons.forEach(btn => btn.classList.remove('active'));
                // Add active class to clicked button
                e.target.classList.add('active');
                // Change basemap
                this.changeBasemap(e.target.dataset.basemap);
            });
        });
        
        // Layer visibility toggles - simplified using mapping
        const layerMappings = {
            buildingsLayer: 'buildings',
            existingSheltersLayer: 'existingShelters',
            requestedSheltersLayer: 'requestedShelters',
            optimalSheltersLayer: 'optimalShelters',
            statisticalAreasLayer: 'statisticalAreas',
            habitationClustersLayer: 'habitationClusters'
        };
        
        Object.entries(layerMappings).forEach(([elementKey, visibilityKey]) => {
            const element = this.elements[elementKey];
            if (element) {
                element.addEventListener('change', (e) => {
                    this.layerVisibility[visibilityKey] = e.target.checked;
                    this.updateVisualization();
                });
            }
        });
        
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
                                  (this.hoveredShelter && this.hoveredBuildings.length > 0);
        
        if (shouldShowBuildings && currentData.buildings && currentData.buildings.features.length > 0) {
            let buildingsToShow;
            if (this.layerVisibility.buildings) {
                // Show all buildings when layer is enabled
                buildingsToShow = currentData.buildings.features;
            } else {
                // Only show covered buildings when layer is disabled (highlighting mode)
                const coveredIndices = new Set([
                    ...(this.hoveredShelter ? this.hoveredBuildings : [])
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
                            return [255, 0, 0, 180]; // Red outline for all other buildings
                        } else {
                            // Buildings layer is disabled - only show covered building outlines in green
                            return [0, 255, 0, 255]; // Bright green outline for covered buildings
                        }
                    },
                    getLineWidth: d => {
                        const buildingIndex = d._index || 0;
                        
                        // Thicker outline for highlighted buildings
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
        
        // === COVERAGE BRUSH LAYER (for hovered shelters) ===
        if (this.hoveredShelter && this.spatialAnalyzer.buildings) {
            const activeShelter = this.hoveredShelter;
            const coveredBuildingIndices = this.hoveredBuildings;
            
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
                        getFillColor: () => [0, 255, 0, 120], // Green for hover coverage
                        getLineColor: () => [0, 200, 0, 200], // Green outline for hover
                        getLineWidth: () => 2 // Standard width for hover
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
                    getColor: () => [255, 255, 255, 230], // White tint (90% opacity)
                    onHover: (info) => this.handleHover(info),
                    onClick: (info) => this.handleClick(info),
                    ...this.getIconSizeConfig()
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
                    getColor: () => [255, 255, 255, 230], // White tint (90% opacity)
                    onHover: (info) => this.handleHover(info),
                    onClick: (info) => this.handleClick(info),
                    ...this.getIconSizeConfig()
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
                getColor: () => [255, 255, 255, 230], // White tint (90% opacity)
                onHover: (info) => this.handleHover(info),
                onClick: (info) => {
                    if (info.object) {
                        this.jumpToOptimalSite(info.object.coordinates[1], info.object.coordinates[0]);
                    }
                },
                ...this.getIconSizeConfig()
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
        
        // Add legend title
        const legendTitle = document.createElement('div');
        legendTitle.style.cssText = `
            font-size: 11px;
            color: var(--text-muted);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-bottom: var(--space-sm);
        `;
        legendTitle.textContent = 'Map Legend';
        this.elements.legendItems.appendChild(legendTitle);
        
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
                img.width = 18;
                img.height = 18;
                img.style.display = 'block';
                iconDiv.appendChild(img);
            } else if (item.className === 'requested-shelter') {
                const img = document.createElement('img');
                img.src = 'data/user-location-icon.svg';
                img.width = 18;
                img.height = 18;
                img.style.display = 'block';
                iconDiv.appendChild(img);
            } else if (item.className === 'optimal-shelter') {
                const img = document.createElement('img');
                img.src = 'data/add-location-icon.svg';
                img.width = 18;
                img.height = 18;
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
     * Create simple heatmap legend
     */
    createHeatmapLegend() {
        if (!this.elements.legendItems) return;
        
        // Clear existing legend items
        this.elements.legendItems.innerHTML = '';
        
        // Add legend title
        const legendTitle = document.createElement('div');
        legendTitle.style.cssText = `
            font-size: 11px;
            color: var(--text-muted);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-bottom: var(--space-sm);
        `;
        legendTitle.textContent = 'Map Legend';
        
        // Create heatmap legend container
        const heatmapLegend = document.createElement('div');
        heatmapLegend.className = 'heatmap-legend-compact';
        heatmapLegend.appendChild(legendTitle);
        
        // Simple legend items
        const legendItems = [
            {
                color: 'rgb(20, 180, 20)',
                label: 'Well Covered',
            },
            {
                color: 'rgb(200, 20, 20)', 
                label: 'Underserved',
            }
        ];
        
        legendItems.forEach(item => {
            const legendItem = document.createElement('div');
            legendItem.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 6px;
                font-size: 13px;
                color: var(--text-primary);
            `;
            
            const colorBox = document.createElement('div');
            colorBox.style.cssText = `
                width: 12px;
                height: 12px;
                background: ${item.color};
                border-radius: 2px;
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
            margin-top: 6px;
            padding: 4px 6px;
            background: rgba(var(--text-secondary-rgb), 0.05);
            border-radius: 3px;
        `;
        distanceInfo.textContent = `Within ${this.coverageRadius}m radius`;
        heatmapLegend.appendChild(distanceInfo);
        
        this.elements.legendItems.appendChild(heatmapLegend);
    }

    /**
     * Update visualization layers
     */
    updateVisualization() {
        if (!this.deckgl) return;

        const layers = [];
        
        // Base layer - create once and reuse when possible
        const basemapConfig = this.basemaps[this.currentBasemap];
        const baseLayer = this.createStandardTileLayer(basemapConfig);
        layers.push(baseLayer);
        
        // Data layers
        const dataLayers = this.createLayers();
        layers.push(...dataLayers);
        
        // Update deck.gl with error handling
        try {
            this.currentLayers = layers;
            this.deckgl.setProps({ layers: this.currentLayers });
        } catch (error) {
            console.warn('Layer update failed:', error);
            // Try to recover by just updating data layers
            if (this.currentLayers.length > 0) {
                this.deckgl.setProps({ layers: [this.currentLayers[0], ...dataLayers] });
            }
        }
        
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
     * Get common icon sizing configuration for all shelter types
     */
    getIconSizeConfig() {
        return {
            getSize: () => this.ICON_SIZE * 10000, // Scale up for visibility
            sizeScale: this.ICON_SIZE_SCALE,
            sizeUnits: 'meters',
            sizeMinPixels: this.ICON_MIN_PIXELS,
            sizeMaxPixels: this.ICON_MAX_PIXELS
        };
    }
    
    /**
     * Create simplified tile layer for basemaps with error handling
     */
    createStandardTileLayer(basemapConfig) {
        return new deck.TileLayer({
            id: 'base-tiles',
            data: basemapConfig.url,
            minZoom: 0,
            maxZoom: 19,
            tileSize: 256,
            // Simplified tile loading with better error handling
            getTileData: (tile) => {
                const { x, y, z } = tile.index;
                const tileUrl = basemapConfig.url
                    .replace('{z}', z)
                    .replace('{y}', y)
                    .replace('{x}', x);
                
                return tileUrl;
            },
            renderSubLayers: props => {
                const {
                    bbox: {west, south, east, north}
                } = props.tile;
                
                return new deck.BitmapLayer(props, {
                    data: null,
                    image: props.data,
                    bounds: [west, south, east, north],
                    // Improved error handling for failed tile loads
                    onError: (error) => {
                        console.warn('Tile load failed:', error);
                        // Return false to continue rendering other tiles
                        return false;
                    }
                });
            },
            // Improved tile layer error handling
            onTileError: (error) => {
                console.warn('Tile layer error:', error);
                // Continue execution, don't break the app
                return false;
            },
            // Add retry mechanism for failed tiles
            refinementStrategy: 'best-available',
            // Reduce concurrent tile loading to prevent overload
            maxConcurrentLoads: 6
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
        
        if (!data || !data.statistics) {
            return;
        }
        
        const stats = data.statistics;
        const newSheltersSelected = this.proposedShelters.length;
        
        // Calculate coverage from selected optimal shelters
        let newBuildingsCovered = 0;
        if (newSheltersSelected > 0) {
            newBuildingsCovered = this.proposedShelters.reduce((sum, shelter) => sum + (shelter.buildings_covered || 0), 0);
        }
        
        const existingCoverage = (stats.total_buildings_covered || 0) - (stats.new_buildings_covered || 0);
        const totalBuildingsCovered = existingCoverage + newBuildingsCovered;
        const totalCoveragePercentage = (totalBuildingsCovered / stats.total_buildings) * 100;
        const currentCoveragePercentage = (existingCoverage / stats.total_buildings) * 100;
        
        // Calculate additional people (7 people per building)
        const additionalPeople = Math.max(0, newBuildingsCovered * 7);
        
        // Calculate residents left out (uncovered buildings * 7 people per building)
        const uncoveredBuildings = Math.max(0, stats.total_buildings - existingCoverage);
        const residentsLeftOut = uncoveredBuildings * 7;
        
        // Update narrative statistics
        if (this.elements.currentCoverage) {
            this.elements.currentCoverage.textContent = `${currentCoveragePercentage.toFixed(1)}%`;
        }
        if (this.elements.currentRadius) {
            this.elements.currentRadius.textContent = `${this.coverageRadius}m`;
        }
        if (this.elements.residentsLeftOut) {
            this.elements.residentsLeftOut.textContent = residentsLeftOut.toLocaleString();
        }
        if (this.elements.newSheltersCount) {
            this.elements.newSheltersCount.textContent = newSheltersSelected.toLocaleString();
        }
        if (this.elements.newCoverage) {
            this.elements.newCoverage.textContent = `${totalCoveragePercentage.toFixed(1)}%`;
        }
        if (this.elements.buildingsCovered) {
            this.elements.buildingsCovered.textContent = newBuildingsCovered.toLocaleString();
        }
        if (this.elements.additionalPeople) {
            this.elements.additionalPeople.textContent = additionalPeople.toLocaleString();
        }
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
            } else if (info.layer.id === 'statistical-areas-geojson') {
                // Select statistical area (lowest priority)
                this.selectPolygon(object, 'statisticalArea');
            }
        } else {
            // Clicked on empty space - clear all selections
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
     * Handle viewport changes with debouncing
     */
    handleViewStateChange(viewState) {
        // Store pending view state
        this._pendingViewState = viewState;
        
        // Clear existing timer
        if (this._viewStateDebounceTimer) {
            clearTimeout(this._viewStateDebounceTimer);
        }
        
        // Update scale bar immediately for smooth UX
        this._currentViewState = viewState;
        this.updateScaleBar();
        
        // Debounce expensive operations
        this._viewStateDebounceTimer = setTimeout(() => {
            this._processViewStateChange(this._pendingViewState);
        }, 150); // 150ms debounce
    }
    
    /**
     * Process view state changes after debouncing
     */
    _processViewStateChange(viewState) {
        const previousZoom = this._currentZoom;
        this._currentZoom = viewState.zoom;
        
        // Only recreate layers if zoom level significantly changed
        if (!previousZoom || Math.abs(this._currentZoom - previousZoom) > 1.0) {
            this.updateVisualization();
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
     * Change basemap with debouncing
     */
    changeBasemap(basemap) {
        if (this.currentBasemap === basemap) return; // No change needed
        
        this.currentBasemap = basemap;
        
        // Update UI styling based on basemap
        const body = document.body;
        if (basemap === 'light') {
            body.classList.add('light-basemap');
        } else {
            body.classList.remove('light-basemap');
        }
        
        this.updateAttribution();
        
        // Debounce basemap updates to prevent rapid switching issues
        if (this._basemapDebounceTimer) {
            clearTimeout(this._basemapDebounceTimer);
        }
        
        this._basemapDebounceTimer = setTimeout(() => {
            this.updateVisualization();
        }, 100);
    }
    
    /**
     * Cleanup method to clear timers
     */
    cleanup() {
        if (this._viewStateDebounceTimer) {
            clearTimeout(this._viewStateDebounceTimer);
            this._viewStateDebounceTimer = null;
        }
        if (this._basemapDebounceTimer) {
            clearTimeout(this._basemapDebounceTimer);
            this._basemapDebounceTimer = null;
        }
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
     * Calculate which buildings are covered by a specific shelter (optimized fallback)
     * Only used when precomputed data is not available
     */
    calculateShelterCoverage(shelter) {
        if (!this.spatialAnalyzer.buildings || !shelter) {
            return [];
        }
        
        const shelterCoords = shelter.geometry ? shelter.geometry.coordinates : [shelter.lon, shelter.lat];
        const coverageRadiusMeters = this.coverageRadius;
        
        // Optimized: Use Haversine distance for more accurate calculation
        const coveredBuildings = [];
        const buildings = this.spatialAnalyzer.buildings.features;
        
        for (let i = 0; i < buildings.length; i++) {
            const building = buildings[i];
            
            // Calculate building centroid
            let buildingCentroid;
            if (building.geometry.type === 'Point') {
                buildingCentroid = building.geometry.coordinates;
            } else if (building.geometry.type === 'Polygon') {
                // Fast centroid calculation for polygons
                const coords = building.geometry.coordinates[0];
                let sumX = 0, sumY = 0;
                for (let j = 0; j < coords.length - 1; j++) {
                    sumX += coords[j][0];
                    sumY += coords[j][1];
                }
                buildingCentroid = [sumX / (coords.length - 1), sumY / (coords.length - 1)];
            } else {
                continue;
            }
            
            // Fast distance check using spherical approximation
            const distance = this.calculateDistance(shelterCoords, buildingCentroid);
            if (distance <= coverageRadiusMeters) {
                coveredBuildings.push(i);
            }
        }
        
        return coveredBuildings;
    }
    
    /**
     * Calculate distance between two coordinates in meters (optimized)
     */
    calculateDistance(coord1, coord2) {
        const R = 6371000; // Earth's radius in meters
        const lat1 = coord1[1] * Math.PI / 180;
        const lat2 = coord2[1] * Math.PI / 180;
        const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
        const deltaLng = (coord2[0] - coord1[0]) * Math.PI / 180;
        
        const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c;
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
        
        console.log(`🔄 Extracted ${radiusKey} data: ${this.accessibilityData.length} points`);
    }
    

    

    
    /**
     * Select a polygon and highlight its coverage
     */
    selectPolygon(polygon, type) {
        this.selectedPolygon = polygon;
        this.updateVisualization();
    }
    
    /**
     * Clear polygon selection
     */
    clearPolygonSelection() {
        this.selectedPolygon = null;
        this.updateVisualization();
    }
    
    /**
     * Show tooltip for a specific shelter (simplified and compact)
     */
    showShelterTooltip(shelter, layerId, x, y) {
        const tooltip = document.getElementById('tooltip');
        
        // Handle hover state directly here - no recursive calls
        if (this.hoveredShelter !== shelter) {
            this.hoveredShelter = shelter;
            this.hoveredBuildings = this.getShelterCoverage(shelter);
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
    
    /**
     * Create buildings layer for coverage updates (simplified inline version)
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
                ...(this.hoveredShelter ? this.hoveredBuildings : [])
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
                    return [255, 0, 0, 180];
                } else {
                    return [0, 255, 0, 255];
                }
            },
            getLineWidth: d => {
                const buildingIndex = d._index || 0;
                
                if (this.hoveredShelter && this.hoveredBuildings.includes(buildingIndex)) {
                    return 2;
                }
                return 1;
            }
        });
    }
    
    /**
     * Create coverage brush layer for coverage updates (simplified inline version)
     */
    createCoverageBrushLayer() {
        if (!this.spatialAnalyzer.buildings) return null;
        
        const activeShelter = this.hoveredShelter;
        const coveredBuildingIndices = this.hoveredBuildings;
        
        if (!activeShelter || coveredBuildingIndices.length === 0) {
            return null;
        }
        
        // Create a brush layer to highlight covered buildings
        const coveredBuildings = coveredBuildingIndices.map(index => 
            this.spatialAnalyzer.buildings.features[index]
        ).filter(building => building);
        
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
            getFillColor: () => [0, 255, 0, 120], // Green for hover coverage
            getLineColor: () => [0, 200, 0, 200], // Green outline for hover
            getLineWidth: () => 2 // Standard width for hover
        });
    }
   
    /**
     * Clear hover state immediately 
     */
    clearShelterHover() {
        this.hoveredShelter = null;
        this.hoveredBuildings = [];
        
        // Hide tooltip immediately
        const tooltip = document.getElementById('tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
            tooltip.innerHTML = '';
        }
        
        // Update visualization
        this.updateCoverageLayersOnly();
    }
    
    /**
     * Lightweight update that only refreshes coverage-related layers
     */
    updateCoverageLayersOnly() {
        if (!this.deckgl || !this.currentLayers) return;
        
        const hasHoverData = this.hoveredShelter && this.hoveredBuildings.length > 0;
        
        if (!hasHoverData) {
            // No coverage data to show, just update existing layers
            this.updateVisualization();
            return;
        }
        
        // Quick update: only recreate coverage-sensitive layers
        const updatedLayers = [];
        const shelterLayers = [];
        
        // Separate shelter layers from other layers to ensure correct ordering
        for (const layer of this.currentLayers) {
            if (layer.id === 'existing-shelters' || layer.id === 'requested-shelters' || layer.id === 'proposed-shelters') {
                // Store shelter layers to add last (on top)
                shelterLayers.push(layer);
            } else if (layer.id !== 'coverage-brush' && layer.id !== 'buildings-geojson') {
                // Add non-coverage, non-shelter layers first
                updatedLayers.push(layer);
            }
        }
        
        // Add buildings layer with coverage highlighting
        if (this.layerVisibility.buildings || hasHoverData) {
            const buildingsLayer = this.createBuildingsLayer();
            if (buildingsLayer) {
                updatedLayers.push(buildingsLayer);
            }
        }
        
        // Add coverage brush layer
        if (hasHoverData) {
            const coverageBrushLayer = this.createCoverageBrushLayer();
            if (coverageBrushLayer) {
                updatedLayers.push(coverageBrushLayer);
            }
        }
        
        // Add shelter layers last to ensure they're always on top
        updatedLayers.push(...shelterLayers);
        
        // Update deck.gl
        this.currentLayers = updatedLayers;
        this.deckgl.setProps({ layers: this.currentLayers });
    }
    
    /**
     * Toggle new shelter control enable/disable state based on accessibility grid
     */
    toggleNewShelterControl(isAccessibilityGridActive) {
        const shelterSection = document.getElementById('addedSheltersSection');
        
        if (isAccessibilityGridActive) {
            // Disable new shelter control when accessibility grid is active
            shelterSection.classList.add('disabled');
        } else {
            // Enable new shelter control when accessibility grid is inactive
            shelterSection.classList.remove('disabled');
        }
    }

}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ShelterAccessApp();
    window.app.initializeApp();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.cleanup();
    }
});