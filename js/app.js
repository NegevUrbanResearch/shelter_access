/**
 * Main Application for Shelter Access Analysis
 * Uses deck.gl for visualization and spatial analysis with optimized tile layers
 */

class ShelterAccessApp {
    constructor() {
        this.spatialAnalyzer = new SimpleSpatialAnalyzer();
        this.deckgl = null;
        this.currentLayers = [];
        this.proposedShelters = [];
        this.coverageRadius = 100;
        this.numNewShelters = 10;
        this.maxShelters = 500; // Updated to match script's TARGET_SHELTERS
        this.isAnalyzing = false;
        
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
            buildings: false, // Off by default - only show when enabled
            existingShelters: true,
            requestedShelters: true,
            optimalShelters: true,
            statisticalAreas: false, // Off by default
            habitationClusters: false // Off by default
        };
        
        // Tile layer settings
        this.useBuildingTiles = true; // Use tiled buildings for better performance
        this.buildingTileUrl = 'data/building_tiles/{z}/{x}/{y}.json';
        
        // Mapbox token for terrain and other services
        this.mapboxToken = 'pk.eyJ1Ijoibm9hbWpnYWwiLCJhIjoiY20zbHJ5MzRvMHBxZTJrcW9uZ21pMzMydiJ9.B_aBdP5jxu9nwTm3CoNhlg';
        
        // Basemap configuration with terrain support
        this.currentBasemap = 'satellite';
        this.basemaps = {
            satellite: {
                name: 'Satellite Streets',
                url: `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${this.mapboxToken}`,
                attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                type: 'raster'
            },
            light: {
                name: 'Streets',
                url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}@2x?access_token=${this.mapboxToken}`,
                attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                type: 'raster'
            },
            dark: {
                name: 'Dark',
                url: `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}@2x?access_token=${this.mapboxToken}`,
                attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                type: 'raster'
            },
            topography: {
                name: 'Topography',
                url: `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}@2x?access_token=${this.mapboxToken}`,
                attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                type: 'raster'
            }
        };
        
        // Widgets
        this.widgets = [];
        
        // UI elements
        this.elements = {
            accessibilityDistance: document.getElementById('accessibilityDistance'),
            accessibilityDistanceValue: document.getElementById('accessibilityDistanceValue'),
            newSheltersSlider: document.getElementById('newShelters'),
            newSheltersValue: document.getElementById('newSheltersValue'),
            basemapControl: document.querySelector('.basemap-control'),
            basemapHeader: document.querySelector('.basemap-header'),
            layerControl: document.querySelector('.layer-control'),
            layerHeader: document.querySelector('.layer-header'),
            basemapRadios: document.querySelectorAll('input[name="basemap"]'),
            buildingsLayer: document.getElementById('buildingsLayer'),
            existingSheltersLayer: document.getElementById('existingSheltersLayer'),
            requestedSheltersLayer: document.getElementById('requestedSheltersLayer'),
            optimalSheltersLayer: document.getElementById('optimalSheltersLayer'),
            statisticalAreasLayer: document.getElementById('statisticalAreasLayer'),
            habitationClustersLayer: document.getElementById('habitationClustersLayer'),
            themeToggle: document.getElementById('themeToggle'),
            loading: document.getElementById('loading'),
            tooltip: document.getElementById('tooltip'),
            attribution: document.getElementById('attribution'),
            currentCoverage: document.getElementById('currentCoverage'),
            newCoverage: document.getElementById('newCoverage'),
            buildingsCovered: document.getElementById('buildingsCovered'),
            additionalPeople: document.getElementById('additionalPeople'),
            suboptimalRequested: document.getElementById('suboptimalRequested'),
            underservedPeople: document.getElementById('underservedPeople')
        };
    }
    
    /**
     * Initialize the application
     */
    async initializeApp() {
        try {
            console.log('🚀 Initializing Shelter Access Analysis App...');
            this.loadThemePreference();
            this.setupEventListeners();
            await this.spatialAnalyzer.loadData();
            this.initializeMap();
            this.updateAttribution();
            
            // Initial load of optimal locations and coverage analysis
            await this.updateOptimalLocations();
            
            // Debug coverage calculation
            setTimeout(() => this.debugCoverageCalculation(), 1000);
            
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
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearShelterSelection();
            }
        });
        
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
            this.clearShelterSelection(); // Clear selection when radius changes
            await this.updateOptimalLocations();
        });
        
        // New shelters slider - real-time updates
        this.elements.newSheltersSlider.addEventListener('input', async (e) => {
            this.numNewShelters = parseInt(e.target.value);
            this.elements.newSheltersValue.textContent = this.numNewShelters;
            await this.updateOptimalLocations();
        });
        
        // Basemap control - toggle menu
        this.elements.basemapHeader.addEventListener('click', () => {
            this.elements.basemapControl.classList.toggle('expanded');
        });
        
        // Layer control - toggle menu
        this.elements.layerHeader.addEventListener('click', () => {
            this.elements.layerControl.classList.toggle('expanded');
        });
        
        // Basemap radio selection
        this.elements.basemapRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.changeBasemap(e.target.value);
                    // Close menu after selection
                    this.elements.basemapControl.classList.remove('expanded');
                }
            });
        });
        
        // Layer visibility toggles
        this.elements.buildingsLayer.addEventListener('change', (e) => {
            this.layerVisibility.buildings = e.target.checked;
            this.updateVisualization();
        });
        
        this.elements.existingSheltersLayer.addEventListener('change', (e) => {
            this.layerVisibility.existingShelters = e.target.checked;
            this.updateVisualization();
        });
        
        this.elements.requestedSheltersLayer.addEventListener('change', (e) => {
            this.layerVisibility.requestedShelters = e.target.checked;
            this.updateVisualization();
        });
        
        this.elements.optimalSheltersLayer.addEventListener('change', (e) => {
            this.layerVisibility.optimalShelters = e.target.checked;
            this.updateVisualization();
        });
        
        this.elements.statisticalAreasLayer.addEventListener('change', (e) => {
            this.layerVisibility.statisticalAreas = e.target.checked;
            this.updateVisualization();
        });
        
        this.elements.habitationClustersLayer.addEventListener('change', (e) => {
            this.layerVisibility.habitationClusters = e.target.checked;
            this.updateVisualization();
        });
        
        // Theme toggle
        this.elements.themeToggle.addEventListener('click', () => {
            this.toggleTheme();
        });
        
        // Initial load of optimal locations
        this.updateOptimalLocations();
    }
    
    /**
     * Initialize deck.gl map with widgets and terrain support
     */
    initializeMap() {
        // Get data bounds for initial view
        const bounds = this.spatialAnalyzer.getDataBounds();
        
        // Calculate center and zoom level
        const centerLng = (bounds.west + bounds.east) / 2;
        const centerLat = (bounds.south + bounds.north) / 2;
        
        // Initialize deck.gl widgets first
        this.initializeWidgets();
        
        // Initialize deck.gl with enhanced features and widgets
        this.deckgl = new deck.DeckGL({
            container: 'map',
            initialViewState: {
                longitude: centerLng,
                latitude: centerLat,
                zoom: 12,
                pitch: 0,
                bearing: 0,
                minZoom: 7,  // Prevent zooming out beyond level 7
                maxZoom: 19
            },
            controller: {
                minZoom: 7,  // Enforce minimum zoom level
                maxZoom: 19
            },
            onHover: (info) => this.handleHover(info),
            onClick: (info) => this.handleClick(info),
            onViewStateChange: ({viewState}) => this.handleViewStateChange(viewState),
            // Enable WebGL features for better performance
            parameters: {
                clearColor: [0.1, 0.1, 0.1, 1],
                blend: true,
                blendFunc: [770, 771, 1, 0]
            },
            // Use high DPI for crisp rendering
            useDevicePixels: true,
            // Add widgets to deck.gl
            widgets: this.widgets
        });
        
        // Store initial zoom level
        this._currentZoom = 12;
        
        // Initial layer setup
        this.updateVisualization();
    }
    
    /**
     * Initialize deck.gl widgets (zoom, fullscreen, compass)
     */
    initializeWidgets() {
        try {
            // Check if widgets are available in this deck.gl version
            if (!deck.ZoomWidget || !deck.FullscreenWidget || !deck.CompassWidget) {
                console.warn('⚠️ Widgets not available in this deck.gl version');
                return;
            }
            
            // Zoom Control Widget
            const zoomWidget = new deck.ZoomWidget({
                id: 'zoom-widget',
                placement: 'top-left',
                onViewStateChange: ({viewState}) => {
                    this.deckgl.setProps({viewState});
                    this.handleViewStateChange(viewState);
                }
            });
            
            // Fullscreen Control Widget
            const fullscreenWidget = new deck.FullscreenWidget({
                id: 'fullscreen-widget',
                placement: 'top-left',
                container: document.getElementById('map')
            });
            
            // Compass Widget
            const compassWidget = new deck.CompassWidget({
                id: 'compass-widget',
                placement: 'top-left',
                onViewStateChange: ({viewState}) => {
                    this.deckgl.setProps({viewState});
                    this.handleViewStateChange(viewState);
                }
            });
            
            // Store widgets for later use
            this.widgets = [zoomWidget, fullscreenWidget, compassWidget];
            
            console.log('✅ Deck.gl widgets initialized');
            
        } catch (error) {
            console.warn('⚠️ Widgets not available in this deck.gl version:', error);
            // Widgets might not be available in all deck.gl versions
            // Fall back to basic functionality
        }
    }
    
    /**
     * Create visualization layers with new color scheme
     */
    createLayers() {
        const layers = [];
        const currentData = this.spatialAnalyzer.getCurrentData();
        
        if (!currentData.shelters) return layers;
        
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
        
        // === BUILDINGS LAYER (Tiled or GeoJSON) ===
        const shouldShowBuildings = this.layerVisibility.buildings || 
                                  (this.hoveredShelter && this.hoveredBuildings.length > 0) ||
                                  (this.selectedShelter && this.highlightedBuildings.length > 0);
        
        if (shouldShowBuildings) {
            const currentZoom = this._currentZoom || 12;
            
            if (this.useBuildingTiles && this.layerVisibility.buildings && currentZoom >= 7) {
                // Use optimized tile layer for zoom levels 7+ when layer is enabled
                layers.push(new deck.TileLayer({
                    id: 'buildings-tiles',
                    data: this.buildingTileUrl,
                    minZoom: 7, // Tiles now available from zoom 7
                    maxZoom: 16,
                    tileSize: 256,
                    pickable: false,
                    
                    renderSubLayers: props => {
                        const {data, tile} = props;
                        
                        if (!data || !data.features || data.features.length === 0) {
                            return null;
                        }
                        
                        return new deck.GeoJsonLayer({
                            ...props,
                            id: `buildings-tile-${tile.x}-${tile.y}-${tile.z}`,
                            data: data.features,
                            stroked: true,
                            filled: true,
                            lineWidthMinPixels: 1,
                            lineWidthMaxPixels: 2,
                            getFillColor: [255, 0, 0, 120], // Red for all buildings
                            getLineColor: [255, 0, 0, 180], // Red outline
                            getLineWidth: 1,
                            // Performance optimizations
                            updateTriggers: {
                                getFillColor: [this._currentZoom],
                                getLineColor: [this._currentZoom]
                            }
                        });
                    }
                }));
            } else if (currentData.buildings && currentData.buildings.features.length > 0) {
                // Fallback to GeoJSON layer for:
                // 1. Coverage highlighting when layer is disabled
                // 2. Zoom levels below 7 when tiles aren't available (shouldn't happen with minZoom=7)
                // 3. When tiles are disabled
                
                let buildingsToShow;
                if (this.layerVisibility.buildings) {
                    // Show all buildings when layer is enabled
                    if (currentZoom < 7) {
                        // For zoom levels below 7, show simplified buildings for performance
                        // Only show every nth building to avoid performance issues
                        const simplificationFactor = Math.max(1, Math.floor(Math.pow(2, 10 - currentZoom)));
                        buildingsToShow = currentData.buildings.features.filter((_, index) => 
                            index % simplificationFactor === 0
                        );
                        console.log(`🔍 Showing simplified buildings (1/${simplificationFactor}) for zoom ${currentZoom}`);
                    } else {
                        buildingsToShow = currentData.buildings.features;
                    }
                } else {
                    // Only show covered buildings when layer is disabled
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
                        // Performance optimizations for large datasets
                        parameters: {
                            blend: true,
                            blendFunc: [770, 771, 1, 0]
                        },
                        // New symbology logic
                        getFillColor: d => {
                            const buildingIndex = d._index || 0;
                            
                            // If buildings layer is enabled, show all buildings in red
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
                            
                            // If buildings layer is enabled, show all building outlines
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
        
        // === HABITATION CLUSTERS LAYER (Blue outlines) ===
        if (this.layerVisibility.habitationClusters) {
            // Use optimized tile layer for better performance
            const currentZoom = this.map?.deck?.props?.viewState?.zoom || this.map?.viewState?.zoom || 12;
            
            if (currentZoom >= 7 && currentZoom <= 14) {
                // Use tile layer for supported zoom levels
                layers.push(new deck.TileLayer({
                    id: 'habitation-clusters-tiles',
                    data: 'data/cluster_tiles/{z}/{x}/{y}.json',
                    minZoom: 7,
                    maxZoom: 14,
                    tileSize: 256,
                    pickable: true,
                    
                    renderSubLayers: props => {
                        const {data, tile} = props;
                        
                        if (!data || !data.features || data.features.length === 0) {
                            return null;
                        }
                        
                        return new deck.GeoJsonLayer({
                            ...props,
                            id: `habitation-clusters-tile-${tile.x}-${tile.y}-${tile.z}`,
                            data: data.features.map((feature, index) => ({
                                ...feature,
                                _layerType: 'habitationCluster',
                                _index: index,
                                _tileInfo: `${tile.z}/${tile.x}/${tile.y}`
                            })),
                            stroked: true,
                            filled: true,
                            lineWidthMinPixels: 2,
                            lineWidthMaxPixels: 4,
                            getFillColor: d => {
                                const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                                 this.selectedPolygon?.feature?.properties?.OBJECTID === d.properties?.OBJECTID;
                                return isSelected ? [52, 152, 219, 100] : [52, 152, 219, 40]; // Blue fill
                            },
                            getLineColor: d => {
                                const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                                 this.selectedPolygon?.feature?.properties?.OBJECTID === d.properties?.OBJECTID;
                                return isSelected ? [30, 100, 150, 255] : [52, 152, 219, 220]; // Blue outline
                            },
                            getLineWidth: d => {
                                const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                                 this.selectedPolygon?.feature?.properties?.OBJECTID === d.properties?.OBJECTID;
                                return isSelected ? 4 : 2; // Thicker when selected
                            },
                            updateTriggers: {
                                getFillColor: [this.selectedPolygon],
                                getLineColor: [this.selectedPolygon],
                                getLineWidth: [this.selectedPolygon]
                            }
                        });
                    }
                }));
            } else {
                // Load habitation clusters for fallback if not already loaded
                if (!currentData.habitationClusters || currentData.habitationClusters.length === 0) {
                    // Trigger loading in background
                    this.spatialAnalyzer.loadHabitationClustersGeoJson().then(() => {
                        // Redraw when data is loaded
                        this.updateVisualization();
                    });
                }
                
                if (currentData.habitationClusters && currentData.habitationClusters.length > 0) {
                    // Fallback GeoJSON layer for zoom levels outside tile range
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
                        lineWidthMinPixels: 2,
                        lineWidthMaxPixels: 4,
                        getFillColor: d => {
                            const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                             this.selectedPolygon?._index === d._index;
                            return isSelected ? [52, 152, 219, 100] : [52, 152, 219, 40];
                        },
                        getLineColor: d => {
                            const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                             this.selectedPolygon?._index === d._index;
                            return isSelected ? [30, 100, 150, 255] : [52, 152, 219, 220];
                        },
                        getLineWidth: d => {
                            const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                             this.selectedPolygon?._index === d._index;
                            return isSelected ? 4 : 2;
                        },
                        updateTriggers: {
                            getFillColor: [this.selectedPolygon],
                            getLineColor: [this.selectedPolygon],
                            getLineWidth: [this.selectedPolygon]
                        }
                    }));
                }
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
        
        // === EXISTING SHELTERS (Blue) ===
        if (this.layerVisibility.existingShelters) {
            const existingShelters = currentData.shelters.features.filter(shelter => 
                shelter.properties && shelter.properties.status === 'Built'
            );
            
            // Existing shelter points (no coverage circles for performance)
            if (existingShelters.length > 0) {
                layers.push(new deck.ScatterplotLayer({
                    id: 'existing-shelters',
                    data: existingShelters,
                    pickable: true,
                    opacity: 0.9,
                    stroked: true,
                    filled: true,
                    radiusScale: 1,
                    radiusMinPixels: 8,
                    radiusMaxPixels: 15,
                    lineWidthMinPixels: 2,
                    getPosition: d => d.geometry.coordinates,
                    getRadius: d => {
                        // Make selected shelter larger
                        if (this.selectedShelter && this.selectedShelter.properties && 
                            this.selectedShelter.properties.shelter_id === d.properties.shelter_id) {
                            return 18;
                        }
                        return 12;
                    },
                    getFillColor: d => {
                        // Highlight selected shelter
                        if (this.selectedShelter && this.selectedShelter.properties && 
                            this.selectedShelter.properties.shelter_id === d.properties.shelter_id) {
                            return [52, 152, 219, 255]; // Bright blue for selected
                        }
                        return [52, 152, 219, 255]; // Blue for existing
                    },
                    getLineColor: [255, 255, 255, 255]
                }));
            }
        }
        
        // === PLANNED SHELTERS (Orange/Red when analyzed) ===
        if (this.layerVisibility.requestedShelters) {
            // Show requested shelters (status "Request")
            const requestedShelters = currentData.shelters.features.filter(shelter => 
                shelter.properties && shelter.properties.status === 'Request'
            );
            
            if (requestedShelters.length > 0) {
                // Requested shelter points
                layers.push(new deck.ScatterplotLayer({
                    id: 'requested-shelters',
                    data: requestedShelters,
                    pickable: true,
                    opacity: 0.9,
                    stroked: true,
                    filled: true,
                    radiusScale: 1,
                    radiusMinPixels: 8,
                    radiusMaxPixels: 15,
                    lineWidthMinPixels: 2,
                    getPosition: d => d.geometry.coordinates,
                    getRadius: d => {
                        // Make selected shelter larger
                        if (this.selectedShelter && this.selectedShelter.properties && 
                            this.selectedShelter.properties.shelter_id === d.properties.shelter_id) {
                            return 18;
                        }
                        return 12;
                    },
                    getFillColor: d => {
                        // Highlight selected shelter
                        if (this.selectedShelter && this.selectedShelter.properties && 
                            this.selectedShelter.properties.shelter_id === d.properties.shelter_id) {
                            return [255, 165, 0, 255]; // Bright orange for selected
                        }
                        return [255, 165, 0, 255]; // Bright orange for requested
                    },
                    getLineColor: [255, 255, 255, 255]
                }));
            }
        }
        
        // === OPTIMAL NEW SHELTERS (Yellow-Green Gradient) ===
        if (this.layerVisibility.optimalShelters && this.proposedShelters.length > 0) {
            // Proposed shelter points with quality-based coloring
            layers.push(new deck.ScatterplotLayer({
                id: 'proposed-shelters',
                data: this.proposedShelters.map((shelter, index) => ({
                    coordinates: [shelter.lon, shelter.lat],
                    rank: index + 1,
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
                getRadius: d => {
                    // Make selected shelter larger
                    if (this.selectedShelter && this.selectedShelter.coordinates && 
                        this.selectedShelter.coordinates[0] === d.coordinates[0] && 
                        this.selectedShelter.coordinates[1] === d.coordinates[1]) {
                        return 22;
                    }
                    return 14;
                },
                getFillColor: d => {
                    // Highlight selected shelter
                    if (this.selectedShelter && this.selectedShelter.coordinates && 
                        this.selectedShelter.coordinates[0] === d.coordinates[0] && 
                        this.selectedShelter.coordinates[1] === d.coordinates[1]) {
                        return [154, 205, 50, 255]; // Bright yellow-green for selected
                    }
                    // Yellow-green gradient: brighter = better
                    const rank = d.rank || 1;
                    const quality = Math.max(0, 1 - (rank - 1) / this.proposedShelters.length);
                    
                    // Interpolate from bright yellow-green to darker green
                    const r = Math.round(255 * quality + 50 * (1 - quality)); // 255 -> 50
                    const g = Math.round(255 * quality + 150 * (1 - quality)); // 255 -> 150  
                    const b = Math.round(50 * quality + 0 * (1 - quality)); // 50 -> 0
                    
                    return [r, g, b, 255];
                },
                getLineColor: [255, 255, 255, 255]
            }));
        }
        
        return layers;
    }
    
    /**
     * Update visualization layers
     */
    updateVisualization() {
        if (!this.deckgl) return;

        const dataLayers = this.createLayers();
        
        // Get current basemap configuration
        const basemapConfig = this.basemaps[this.currentBasemap];
        let baseLayer;
        
        // Standard raster tile layer for all basemaps
        baseLayer = this.createStandardTileLayer(basemapConfig);
        
        // Combine base layer with data layers
        const allLayers = [baseLayer, ...dataLayers];
        
        this.deckgl.setProps({ layers: allLayers });
        
        console.log(`🗺️ Updated visualization with ${dataLayers.length} data layers on ${basemapConfig.name} basemap`);
        this.updateCoverageAnalysis();
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
        console.log('🔄 Updating coverage analysis...');
        const cacheKey = `optimal_shelters_${this.coverageRadius}m`;
        console.log('📊 Cache key:', cacheKey);
        
        const data = this.spatialAnalyzer.optimalData.get(cacheKey);
        console.log('📊 Data available:', !!data);
        console.log('📊 Statistics available:', !!(data && data.statistics));
        
        const requestedEval = this.spatialAnalyzer.getRequestedShelterEvaluation(this.proposedShelters.length);
        console.log('📊 Requested evaluation:', requestedEval);
        
        if (!data || !data.statistics) {
            console.log('❌ No data or statistics available');
            return;
        }
        
        const stats = data.statistics;
        const newSheltersSelected = this.proposedShelters.length;
        console.log('📊 Stats:', stats);
        console.log('📊 New shelters selected:', newSheltersSelected);
        
        // Calculate coverage from selected optimal shelters
        let newBuildingsCovered = 0;
        let newPeopleCovered = 0;
        if (newSheltersSelected > 0) {
            newBuildingsCovered = this.proposedShelters.reduce((sum, shelter) => sum + (shelter.buildings_covered || 0), 0);
            newPeopleCovered = this.proposedShelters.reduce((sum, shelter) => sum + (shelter.people_covered || 0), 0);
        }
        console.log('📊 New buildings covered:', newBuildingsCovered);
        console.log('📊 New people covered:', newPeopleCovered);
        
        const existingCoverage = (stats.total_buildings_covered || 0) - (stats.new_buildings_covered || 0);
        const totalBuildingsCovered = existingCoverage + newBuildingsCovered;
        const totalPeopleCovered = ((totalBuildingsCovered) * 7); // 7 people per building
        const totalCoveragePercentage = (totalBuildingsCovered / stats.total_buildings) * 100;
        const currentCoveragePercentage = (existingCoverage / stats.total_buildings) * 100;
        
        // Calculate net additional buildings (new coverage minus existing coverage)
        const netAdditionalBuildings = newBuildingsCovered - (existingCoverage * 0); // No overlap in this case since we're adding to existing
        
        console.log('📊 Existing coverage:', existingCoverage);
        console.log('📊 Total buildings covered:', totalBuildingsCovered);
        console.log('📊 Total people covered:', totalPeopleCovered);
        console.log('📊 Current coverage percentage:', currentCoveragePercentage);
        console.log('📊 Total coverage percentage:', totalCoveragePercentage);
        console.log('📊 Net additional buildings:', netAdditionalBuildings);
        
        // Update main statistics
        if (this.elements.currentCoverage) {
            this.elements.currentCoverage.textContent = `${currentCoveragePercentage.toFixed(1)}%`;
            console.log('✅ Updated current coverage:', `${currentCoveragePercentage.toFixed(1)}%`);
        }
        if (this.elements.newCoverage) {
            this.elements.newCoverage.textContent = `${totalCoveragePercentage.toFixed(1)}%`;
            console.log('✅ Updated new coverage:', `${totalCoveragePercentage.toFixed(1)}%`);
        }
        if (this.elements.buildingsCovered) {
            this.elements.buildingsCovered.textContent = totalBuildingsCovered.toLocaleString();
            console.log('✅ Updated buildings covered:', totalBuildingsCovered.toLocaleString());
        }
        if (this.elements.additionalPeople) {
            this.elements.additionalPeople.textContent = Math.max(0, netAdditionalBuildings).toLocaleString();
            console.log('✅ Updated additional buildings:', Math.max(0, netAdditionalBuildings).toLocaleString());
        }
        
        // Update requested shelter analysis with new pairing data
        if (requestedEval) {
            if (this.elements.suboptimalRequested) {
                this.elements.suboptimalRequested.textContent = requestedEval.totalPairs.toString();
            }
            if (this.elements.underservedPeople) {
                this.elements.underservedPeople.textContent = `+${Math.round(requestedEval.totalImprovement)} people`;
            }
        } else {
            // Clear requested analysis when no evaluation available
            if (this.elements.suboptimalRequested) {
                this.elements.suboptimalRequested.textContent = '0';
            }
            if (this.elements.underservedPeople) {
                this.elements.underservedPeople.textContent = '0';
            }
        }
        console.log('✅ Coverage analysis update complete');
    }
    
    /**
     * Handle hover events
     */
    handleHover(info) {
        const { object, x, y, coordinate } = info;
        const tooltip = this.elements.tooltip;
        
        console.log('Hover event:', info.layer?.id, object ? 'with object' : 'no object');
        
        // Priority system for hover tooltips: shelter > habitation cluster > statistical areas
        if (object) {
            if (info.layer.id === 'existing-shelters' || info.layer.id === 'requested-shelters' || info.layer.id === 'proposed-shelters') {
                // Shelter objects have highest priority
                this.showShelterTooltip(object, info.layer.id, x, y);
                return;
            } else if (info.layer.id === 'habitation-clusters') {
                // Habitation cluster has medium priority
                this.showPolygonTooltip(object, 'habitationCluster', x, y);
                return;
            } else if (info.layer.id === 'statistical-areas-geojson') {
                // Statistical area has lowest priority
                this.showPolygonTooltip(object, 'statisticalArea', x, y);
                return;
            }
        }
        
        // If hovering over coordinate but no direct object, check for nearby shelters within 100m
        if (coordinate && this.spatialAnalyzer.isDataReady() && !object) {
            const nearbyShelter = this.findNearestShelterWithinRadius(coordinate, 100); // 100 meters
            if (nearbyShelter) {
                this.showShelterTooltip(nearbyShelter.shelter, nearbyShelter.layerId, x, y);
                return;
            }
        }
        
        // No object or shelter nearby - clear hover
        this.clearShelterHover();
        tooltip.style.display = 'none';
        console.log('Tooltip hidden');
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
            console.log(`${type} tooltip shown with content:`, content.substring(0, 100) + '...');
        }
    }
    
    /**
     * Handle click events
     */
    handleClick(info) {
        const { object } = info;
        
        if (object) {
            // Priority system: shelter > habitation cluster > statistical areas
            if (info.layer.id === 'existing-shelters' || info.layer.id === 'requested-shelters') {
                // Select existing or requested shelter (highest priority)
                this.selectShelter(object);
                this.clearPolygonSelection();
            } else if (info.layer.id === 'proposed-shelters') {
                // Select proposed shelter (highest priority)
                this.selectShelter(object);
                this.clearPolygonSelection();
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
    
    /**
     * Toggle between light and dark themes
     */
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        
        // Update theme toggle icon
        const themeIcon = this.elements.themeToggle.querySelector('.theme-icon');
        themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
        
        // Store preference in localStorage
        localStorage.setItem('theme', newTheme);
        
        console.log(`🎨 Theme switched to ${newTheme} mode`);
    }
    
    /**
     * Load saved theme preference or set default
     */
    loadThemePreference() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Update theme toggle icon
        const themeIcon = this.elements.themeToggle.querySelector('.theme-icon');
        themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
        
        console.log(`🎨 Loaded ${savedTheme} theme`);
    }
    
    /**
     * Calculate which buildings are covered by a specific shelter
     */
    calculateShelterCoverage(shelter) {
        if (!this.spatialAnalyzer.buildings || !shelter) {
            console.log('Coverage calculation: No buildings data or shelter provided');
            return [];
        }
        
        const shelterCoords = shelter.geometry ? shelter.geometry.coordinates : [shelter.lon, shelter.lat];
        const coverageRadiusDeg = this.coverageRadius / 111000; // Approximate conversion to degrees
        const coverageRadiusSquared = coverageRadiusDeg * coverageRadiusDeg; // Use squared distance for efficiency
        
        console.log(`Coverage calculation for shelter at [${shelterCoords[0]}, ${shelterCoords[1]}]`);
        console.log(`Coverage radius: ${this.coverageRadius}m = ${coverageRadiusDeg} degrees`);
        
        const coveredBuildings = [];
        let totalBuildings = 0;
        let validBuildings = 0;
        
        // Use a more efficient loop with early termination
        for (let i = 0; i < this.spatialAnalyzer.buildings.features.length; i++) {
            const building = this.spatialAnalyzer.buildings.features[i];
            totalBuildings++;
            
            // Calculate building centroid for distance calculation
            let buildingCentroid;
            if (building.geometry.type === 'Point') {
                buildingCentroid = building.geometry.coordinates;
                validBuildings++;
            } else if (building.geometry.type === 'Polygon') {
                // Calculate centroid of polygon
                const coords = building.geometry.coordinates[0]; // First ring (exterior)
                let sumX = 0, sumY = 0;
                for (let j = 0; j < coords.length - 1; j++) { // Skip last point (same as first)
                    sumX += coords[j][0];
                    sumY += coords[j][1];
                }
                buildingCentroid = [sumX / (coords.length - 1), sumY / (coords.length - 1)];
                validBuildings++;
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
        
        console.log(`Coverage calculation complete: ${coveredBuildings.length} buildings covered out of ${validBuildings} valid buildings (${totalBuildings} total)`);
        console.log(`Coverage percentage: ${((coveredBuildings.length / validBuildings) * 100).toFixed(2)}%`);
        
        return coveredBuildings;
    }
    
    /**
     * Select a shelter and highlight its coverage
     */
    selectShelter(shelter) {
        this.selectedShelter = shelter;
        this.highlightedBuildings = this.calculateShelterCoverage(shelter);
        this.updateVisualization();
        this.updateSelectionUI();
        
        console.log(`Selected shelter: ${shelter.properties?.shelter_id || 'Optimal site'}`);
        console.log(`Buildings covered: ${this.highlightedBuildings.length}`);
    }
    
    /**
     * Clear shelter selection
     */
    clearShelterSelection() {
        this.selectedShelter = null;
        this.highlightedBuildings = [];
        this.updateVisualization();
        this.updateSelectionUI();
    }
    
    /**
     * Update UI to show selection status
     */
    updateSelectionUI() {
        // Show shelter selection status
        if (this.selectedShelter) {
            const shelterName = this.selectedShelter.properties?.name || 
                               this.selectedShelter.properties?.shelter_id || 
                               'Optimal site';
            console.log(`📍 Selected: ${shelterName} (${this.highlightedBuildings.length} buildings highlighted)`);
        }
        
        // Show polygon selection status
        if (this.selectedPolygon) {
            const polygonType = this.selectedPolygonType === 'statisticalArea' ? 'Statistical Area' : 'Habitation Cluster';
            const props = this.selectedPolygon.properties || {};
            let polygonName = 'Unknown';
            
            if (this.selectedPolygonType === 'statisticalArea') {
                polygonName = props.YISHUV_STAT11 || props.id || props.ID || this.selectedPolygon._index;
            } else if (this.selectedPolygonType === 'habitationCluster') {
                polygonName = props.OBJECTID || props.id || props.ID || this.selectedPolygon._index;
            }
            
            console.log(`📍 Selected: ${polygonType} (ID: ${polygonName})`);
        }
        
        // If no selections
        if (!this.selectedShelter && !this.selectedPolygon) {
            console.log('📍 No selections');
        }
    }
    
    /**
     * Debug method to test coverage calculation
     */
    debugCoverageCalculation() {
        if (!this.spatialAnalyzer.shelters || !this.spatialAnalyzer.buildings) {
            console.log('❌ Data not loaded yet');
            return;
        }
        
        // Test with first shelter
        const testShelter = this.spatialAnalyzer.shelters.features[0];
        if (testShelter) {
            console.log('🧪 Testing coverage calculation...');
            console.log('Test shelter:', testShelter.properties?.shelter_id);
            console.log('Coverage radius:', this.coverageRadius, 'm');
            
            const startTime = performance.now();
            const coveredBuildings = this.calculateShelterCoverage(testShelter);
            const endTime = performance.now();
            
            console.log(`✅ Coverage calculation completed in ${(endTime - startTime).toFixed(2)}ms`);
            console.log(`📊 Buildings covered: ${coveredBuildings.length}`);
            console.log(`📊 Total buildings: ${this.spatialAnalyzer.buildings.features.length}`);
            console.log(`📊 Coverage percentage: ${((coveredBuildings.length / this.spatialAnalyzer.buildings.features.length) * 100).toFixed(2)}%`);
        }
    }
    
    /**
     * Handle shelter hover for building highlighting
     */
    handleShelterHover(shelter) {
        this.hoveredShelter = shelter;
        this.hoveredBuildings = this.calculateShelterCoverage(shelter);
        this.updateVisualization();
    }
    
    /**
     * Clear shelter hover highlighting
     */
    clearShelterHover() {
        this.hoveredShelter = null;
        this.hoveredBuildings = [];
        this.updateVisualization();
    }
    
    /**
     * Select a polygon and highlight its coverage
     */
    selectPolygon(polygon, type) {
        this.selectedPolygon = polygon;
        this.selectedPolygonType = type;
        this.updateVisualization();
        this.updateSelectionUI();
        
        console.log(`Selected polygon: ${type} (${this.selectedPolygon._index})`);
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
    
    /**
     * Find the nearest shelter within a given radius (in meters)
     */
    findNearestShelterWithinRadius(coordinate, radiusMeters) {
        if (!this.spatialAnalyzer.shelters) return null;
        
        const [hoverLon, hoverLat] = coordinate;
        const radiusKm = radiusMeters / 1000;
        let nearestShelter = null;
        let minDistance = Infinity;
        
        // Check existing shelters
        if (this.layerVisibility.existingShelters) {
            const existingShelters = this.spatialAnalyzer.shelters.features.filter(shelter => 
                shelter.properties && shelter.properties.status === 'Built'
            );
            
            for (const shelter of existingShelters) {
                const [shelterLon, shelterLat] = shelter.geometry.coordinates;
                const distance = turf.distance([hoverLon, hoverLat], [shelterLon, shelterLat], { units: 'kilometers' });
                
                if (distance <= radiusKm && distance < minDistance) {
                    minDistance = distance;
                    nearestShelter = { shelter, layerId: 'existing-shelters' };
                }
            }
        }
        
        // Check requested shelters
        if (this.layerVisibility.requestedShelters) {
            const requestedShelters = this.spatialAnalyzer.shelters.features.filter(shelter => 
                shelter.properties && shelter.properties.status === 'Request'
            );
            
            for (const shelter of requestedShelters) {
                const [shelterLon, shelterLat] = shelter.geometry.coordinates;
                const distance = turf.distance([hoverLon, hoverLat], [shelterLon, shelterLat], { units: 'kilometers' });
                
                if (distance <= radiusKm && distance < minDistance) {
                    minDistance = distance;
                    nearestShelter = { shelter, layerId: 'requested-shelters' };
                }
            }
        }
        
        // Check proposed/optimal shelters
        if (this.layerVisibility.optimalShelters && this.proposedShelters.length > 0) {
            for (const shelter of this.proposedShelters) {
                const distance = turf.distance([hoverLon, hoverLat], [shelter.lon, shelter.lat], { units: 'kilometers' });
                
                if (distance <= radiusKm && distance < minDistance) {
                    minDistance = distance;
                    // Convert to format expected by showShelterTooltip
                    const shelterObject = {
                        coordinates: [shelter.lon, shelter.lat],
                        rank: shelter.rank || 1,
                        ...shelter
                    };
                    nearestShelter = { shelter: shelterObject, layerId: 'proposed-shelters' };
                }
            }
        }
        
        return nearestShelter;
    }
    
    /**
     * Show tooltip for a specific shelter
     */
    showShelterTooltip(shelter, layerId, x, y) {
        const tooltip = this.elements.tooltip;
        let content = '';
        
        if (layerId === 'existing-shelters') {
            // Handle hover highlighting
            this.handleShelterHover(shelter);
            
            // Calculate coverage for this specific shelter
            const coveredBuildings = this.calculateShelterCoverage(shelter);
            const buildingsCovered = coveredBuildings.length;
            const peopleCovered = buildingsCovered * 7; // 7 people per building
            
            content = `
                <strong>🔍 Existing Shelter</strong><br>
                Buildings covered: ${buildingsCovered}<br>
                People served: ${peopleCovered}<br>
                <em>Click to highlight coverage area</em>
            `;
            
            console.log(`Existing shelter tooltip: ${buildingsCovered} buildings, ${peopleCovered} people`);
            
        } else if (layerId === 'requested-shelters') {
            // Handle hover highlighting
            this.handleShelterHover(shelter);
            
            // Calculate coverage for this specific shelter
            const coveredBuildings = this.calculateShelterCoverage(shelter);
            const buildingsCovered = coveredBuildings.length;
            const peopleCovered = buildingsCovered * 7; // 7 people per building
            
            // Check if this requested shelter has a better replacement
            let replacementInfo = '';
            const requestedEval = this.spatialAnalyzer.getRequestedShelterEvaluation(this.proposedShelters.length);
            if (requestedEval && requestedEval.pairedShelters) {
                const pairing = requestedEval.pairedShelters.find(pair => 
                    pair.requested.properties && pair.requested.properties.shelter_id === shelter.properties.shelter_id
                );
                
                if (pairing) {
                    replacementInfo = `
                        <br><strong>⚠️ Better location available!</strong><br>
                        Current: ${pairing.requestedCoverage} people<br>
                        Better site: ${pairing.optimalCoverage} people<br>
                        Improvement: +${pairing.improvement} people<br>
                        <button onclick="app.jumpToOptimalSite(${pairing.optimal.lat}, ${pairing.optimal.lon})" 
                                style="margin-top:5px; padding:2px 6px; font-size:11px; cursor:pointer;">
                            Jump to Better Site
                        </button>
                    `;
                }
            }
            
            content = `
                <strong>🔍 Requested Shelter</strong><br>
                Buildings covered: ${buildingsCovered}<br>
                People served: ${peopleCovered}<br>
                <em>Click to highlight coverage area</em>${replacementInfo}
            `;
            
            console.log(`Requested shelter tooltip: ${buildingsCovered} buildings, ${peopleCovered} people`);
            
        } else if (layerId === 'proposed-shelters') {
            // Handle hover highlighting
            this.handleShelterHover(shelter);
            
            const buildingsCovered = shelter.buildings_covered || 0;
            const peopleCovered = shelter.people_covered || 0;
            const rank = shelter.rank || 1;
            
            content = `
                <strong>🔍 Optimal New Site #${rank}</strong><br>
                Buildings covered: ${buildingsCovered}<br>
                People served: ${peopleCovered}<br>
                <em>Click to highlight coverage area</em>
            `;
            
            console.log(`Proposed shelter tooltip: ${buildingsCovered} buildings, ${peopleCovered} people`);
        }
        
        if (content) {
            tooltip.innerHTML = content;
            tooltip.style.display = 'block';
            tooltip.style.left = `${x + 10}px`;
            tooltip.style.top = `${y - 10}px`;
            console.log('Shelter tooltip shown with content:', content.substring(0, 100) + '...');
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
});