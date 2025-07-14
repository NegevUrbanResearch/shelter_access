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
        
        // Optimized icon sizing for smooth scaling transitions
        this.ICON_ZOOM_BREAKPOINTS = {
            low: { size: 1.2, minPixels: 8, maxPixels: 40 },
            medium: { size: 2.5, minPixels: 16, maxPixels: 65 },
            high: { size: 4.5, minPixels: 28, maxPixels: 95 },
            ultra: { size: 7.0, minPixels: 35, maxPixels: 130 }
        };
        
        // Icon type-specific scaling factors
        this.ICON_TYPE_SCALES = {
            existing: 1.0,
            requested: 0.9,
            optimal: 1.1
        };
        
        // Add state for hover highlighting
        this.hoveredShelter = null;
        this.hoveredBuildings = [];
        
        // Add state for selected polygons
        this.selectedPolygon = null;
        
        // Layer visibility state
        this.layerVisibility = {
            buildings: true, 
            existingShelters: true,
            requestedShelters: false,
            optimalShelters: true,
            statisticalAreas: false, 
            habitationClusters: false, 
            accessibilityHeatmap: false 
        };
        
        // Precomputed shelter coverage data
        this.shelterCoverageData = null;
        
        // Accessibility heatmap data
        this.accessibilityData = null;
        this.allAccessibilityData = null; // Stores all radii data
        this.isCalculatingAccessibility = false;
        
        // Layer management optimization
        this.baseTileLayer = null;
        this.currentBasemapConfig = null;
        this.layerUpdateInProgress = false;
        

        
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
        this._currentZoom = 11;
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
            // Statistics - simplified
            currentCoverage: document.getElementById('currentCoverage'),
            currentRadius: document.getElementById('currentRadius'),
            newSheltersCount: document.getElementById('newSheltersCount'),
            newCoverage: document.getElementById('newCoverage'),
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
            const response = await fetch('data/shelter_coverage_precomputed.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.shelterCoverageData = await response.json();
        } catch (error) {
            console.error('Error loading precomputed shelter coverage:', error);
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
            
            // Show the about modal on startup to guide users
            setTimeout(() => {
                const aboutModal = document.getElementById('aboutModal');
                if (aboutModal) {
                    aboutModal.classList.add('show');
                }
            }, 500); // Small delay to ensure app is fully loaded
            
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to load application. Please refresh and try again.');
        }
    }
    
    /**
     * Setup unified main menu functionality
     */
    setupMainMenu() {
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
     * Setup tab functionality for modal
     */
    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                
                // Remove active class from all buttons and content
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked button and corresponding content
                button.classList.add('active');
                const targetContent = document.getElementById(`${targetTab}-tab`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    }
    
    /**
     * Setup expandable sections functionality
     */
    setupExpandableSections() {
        // Make toggleSection function available globally
        window.toggleSection = (sectionId) => {
            const section = document.querySelector(`#${sectionId}-content`).closest('.expandable-section');
            const content = document.getElementById(`${sectionId}-content`);
            const icon = section.querySelector('.expand-icon');
            
            if (section.classList.contains('expanded')) {
                section.classList.remove('expanded');
                icon.textContent = '+';
            } else {
                section.classList.add('expanded');
                icon.textContent = '−';
            }
        };
    }
    
    /**
     * Setup event listeners for UI controls
     */
    setupEventListeners() {
        // Setup modals using generic setup function
        this.setupModal('about');
        
        // Handle methods button to open about modal (merged modal)
        const methodsButton = document.getElementById('methodsButton');
        const aboutModal = document.getElementById('aboutModal');
        if (methodsButton && aboutModal) {
            methodsButton.addEventListener('click', () => aboutModal.classList.add('show'));
        }
        
        // Setup tab functionality
        this.setupTabs();
        
        // Setup expandable sections
        this.setupExpandableSections();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Close any open modal
                const openModal = document.querySelector('.modal-overlay.show');
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
                    
                    // If accessibility heatmap is active, update accessibility data for new radius
                    if (this.layerVisibility.accessibilityHeatmap && this.allAccessibilityData) {
                        this.updateAccessibilityDataForRadius();
                        // Update visualization to refresh the heatmap
                        this.updateVisualization();
                    } else {
                        // Otherwise just update optimal locations
                        await this.updateOptimalLocations();
                    }
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
                zoom: 11,
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
        this._currentZoom = 11;
        
        // Initialize scale bar
        this.updateScaleBar();
        
        // Initial visualization update
        this.updateVisualization();
    }
    
    /**
     * Initialize deck.gl widgets (zoom, fullscreen, compass)
     */
    initializeWidgets() {
            // Compass Widget - keep in top-center
            const compassWidget = new deck.CompassWidget({
                id: 'compass-widget',
                placement: 'bottom-right', // Will be repositioned via CSS
                onViewStateChange: ({viewState}) => {
                    this.deckgl.setProps({viewState});
                    this.handleViewStateChange(viewState);
                }
            });
            
            // Store widgets for later use (only compass now)
            this.widgets = [compassWidget];
            
            // Attach widgets to deck.gl instance
            this.deckgl.setProps({
                widgets: this.widgets
            });
            
            // Setup custom zoom and fullscreen controls in legend panel
            this.setupCustomControls();
        }
    
    /**
     * Setup custom zoom and fullscreen controls integrated into legend panel
     */
    setupCustomControls() {
        // Wait for legend panel to be created with increased timeout
        setTimeout(() => {
            this.addControlsToLegend();
        }, 500);
    }
    
    /**
     * Add zoom and fullscreen controls to legend panel
     */
    addControlsToLegend() {
        const legendPanel = document.querySelector('.map-legend-panel');
        if (!legendPanel) {
            console.warn('Legend panel not found, retrying in 200ms...');
            setTimeout(() => this.addControlsToLegend(), 200);
            return;
        }
        
        // Check if controls already exist
        if (legendPanel.querySelector('.legend-controls-section')) {
            console.log('Zoom controls already exist');
            return;
        }
        
        console.log('Adding zoom controls to legend panel...');
        
        // Create controls section
        const controlsSection = document.createElement('div');
        controlsSection.className = 'legend-controls-section';
        controlsSection.innerHTML = `
            <div class="legend-controls">
                <button class="legend-control-btn zoom-in-btn" title="Zoom In">+</button>
                <button class="legend-control-btn zoom-out-btn" title="Zoom Out">−</button>
                <button class="legend-control-btn fullscreen-btn" title="Toggle Fullscreen">⛶</button>
            </div>
        `;
        
        // Insert after scale section (controls go at the bottom)
        const scaleSection = legendPanel.querySelector('.legend-scale-section');
        if (scaleSection) {
            legendPanel.insertBefore(controlsSection, scaleSection.nextSibling);
        } else {
            legendPanel.appendChild(controlsSection);
        }
        
        // Add event listeners
        const zoomInBtn = controlsSection.querySelector('.zoom-in-btn');
        const zoomOutBtn = controlsSection.querySelector('.zoom-out-btn');
        const fullscreenBtn = controlsSection.querySelector('.fullscreen-btn');
        
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                console.log('Zoom in button clicked');
                this.zoomIn();
            });
        }
        
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                console.log('Zoom out button clicked');
                this.zoomOut();
            });
        }
        
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                console.log('Fullscreen button clicked');
                this.toggleFullscreen();
            });
        }
        
        console.log('Zoom controls added successfully');
    }
    
    /**
     * Zoom in functionality
     */
    zoomIn() {
        console.log('Attempting to zoom in...');
        try {
            if (!this.deckgl) {
                console.error('Deck.gl instance not available');
                return;
            }
            
            // Use the stored current view state instead of trying to get it from deck.gl
            const currentViewState = this._currentViewState || this.deckgl.props.initialViewState;
            if (!currentViewState) {
                console.error('No current view state available');
                return;
            }
            
            const currentZoom = currentViewState.zoom || 11;
            const newZoom = Math.min(currentZoom + 1, 19);
            
            console.log(`Zooming from ${currentZoom} to ${newZoom}`);
            
            const newViewState = { 
                ...currentViewState, 
                zoom: newZoom,
                transitionDuration: 300,
                transitionEasing: t => t * t
            };
            
            // Update the view state directly
            this.deckgl.setProps({ viewState: newViewState });
            
            // Update our stored view state
            this._currentViewState = newViewState;
            this._currentZoom = newZoom;
            
            // Update scale bar
            this.updateScaleBar();
            
            console.log('Zoom in successful');
        } catch (error) {
            console.error('Error during zoom in:', error);
        }
    }
    
    /**
     * Zoom out functionality
     */
    zoomOut() {
        console.log('Attempting to zoom out...');
        try {
            if (!this.deckgl) {
                console.error('Deck.gl instance not available');
                return;
            }
            
            // Use the stored current view state instead of trying to get it from deck.gl
            const currentViewState = this._currentViewState || this.deckgl.props.initialViewState;
            if (!currentViewState) {
                console.error('No current view state available');
                return;
            }
            
            const currentZoom = currentViewState.zoom || 11;
            const newZoom = Math.max(currentZoom - 1, 7);
            
            console.log(`Zooming from ${currentZoom} to ${newZoom}`);
            
            const newViewState = { 
                ...currentViewState, 
                zoom: newZoom,
                transitionDuration: 300,
                transitionEasing: t => t * t
            };
            
            // Update the view state directly
            this.deckgl.setProps({ viewState: newViewState });
            
            // Update our stored view state
            this._currentViewState = newViewState;
            this._currentZoom = newZoom;
            
            // Update scale bar
            this.updateScaleBar();
            
            console.log('Zoom out successful');
        } catch (error) {
            console.error('Error during zoom out:', error);
        }
    }
    
    /**
     * Toggle fullscreen functionality
     */
    toggleFullscreen() {
        console.log('Fullscreen button clicked');
        try {
            // Use the entire app container instead of just the map
            const appContainer = document.getElementById('app');
            
            if (!document.fullscreenElement) {
                console.log('Entering fullscreen mode');
                // Enter fullscreen
                if (appContainer.requestFullscreen) {
                    appContainer.requestFullscreen();
                } else if (appContainer.webkitRequestFullscreen) {
                    appContainer.webkitRequestFullscreen();
                } else if (appContainer.mozRequestFullScreen) {
                    appContainer.mozRequestFullScreen();
                } else if (appContainer.msRequestFullscreen) {
                    appContainer.msRequestFullscreen();
                } else {
                    console.warn('Fullscreen not supported by this browser');
                }
            } else {
                console.log('Exiting fullscreen mode');
                // Exit fullscreen
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        } catch (error) {
            console.error('Error toggling fullscreen:', error);
        }
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
                            return [59, 130, 246, 180]; // Blue for all other buildings when layer is enabled (matches menu buttons)
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
                            return [59, 130, 246, 220]; // Blue outline for all other buildings (matches menu buttons)
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
                    lineWidthMinPixels: 2,
                    lineWidthMaxPixels: 4,
                    getFillColor: d => {
                        const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                         this.selectedPolygon?._index === d._index;
                        return isSelected ? [52, 152, 219, 120] : [52, 152, 219, 50];
                    },
                    getLineColor: d => {
                        const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                         this.selectedPolygon?._index === d._index;
                        return isSelected ? [30, 100, 150, 255] : [52, 152, 219, 180];
                    },
                    getLineWidth: d => {
                        const isSelected = this.selectedPolygon?.layerType === 'habitationCluster' && 
                                         this.selectedPolygon?._index === d._index;
                        return isSelected ? 6 : 2;
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
                    onHover: (info) => this.handleHover(info),
                    onClick: (info) => this.handleClick(info),
                    loadOptions: this.getSVGLoadOptions(),
                    textureParameters: this.getTextureParameters(),
                    alphaCutoff: 0.05, // Clean edges for better visual quality
                    ...this.getIconSizeConfig('existing')
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
                    onHover: (info) => this.handleHover(info),
                    onClick: (info) => this.handleClick(info),
                    loadOptions: this.getSVGLoadOptions(),
                    textureParameters: this.getTextureParameters(),
                    alphaCutoff: 0.05, // Clean edges for better visual quality
                    ...this.getIconSizeConfig('requested')
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
                onHover: (info) => this.handleHover(info),
                onClick: (info) => {
                    if (info.object) {
                        this.jumpToOptimalSite(info.object.coordinates[1], info.object.coordinates[0]);
                    }
                },
                loadOptions: this.getSVGLoadOptions(),
                textureParameters: this.getTextureParameters(),
                alphaCutoff: 0.05, // Clean edges for better visual quality
                ...this.getIconSizeConfig('optimal')
            }));
        }

        
        return layers;
    }
    
    /**
     * Update legend to show only visible layers
     */
    updateLegend() {
        if (!this.elements.legendItems) return;
        
        if (this.layerVisibility.accessibilityHeatmap) {
            // Create continuous heatmap legend
            this.createHeatmapLegend();
            return; // Only show heatmap legend when heatmap is active
        }
        
        const legendItems = [];
        
        // Building Footprints - always show when visible
        if (this.layerVisibility.buildings) {
            legendItems.push({
                type: 'color-box',
                className: 'building-footprints',
                label: 'Building Footprints',
                color: 'rgb(59, 130, 246)', // Blue to match the current buildings color
                description: 'Residential buildings'
            });
        }
        
        // Shelter layers - only when visible
        if (this.layerVisibility.existingShelters) {
            legendItems.push({
                type: 'svg-icon',
                className: 'existing-shelter', 
                label: 'Existing Shelters',
                iconSrc: 'data/existing.svg',
                description: 'Current shelter locations'
            });
        }
        
        if (this.layerVisibility.requestedShelters) {
            legendItems.push({
                type: 'svg-icon',
                className: 'requested-shelter',
                label: 'Community Requested',
                iconSrc: 'data/user-location-icon.svg',
                description: 'Resident suggestions'
            });
        }
        
        if (this.layerVisibility.optimalShelters && this.proposedShelters.length > 0) {
            legendItems.push({
                type: 'svg-icon',
                className: 'optimal-shelter',
                label: 'Optimal Shelters',
                iconSrc: 'data/proposed.svg',
                description: 'Algorithm-generated sites'
            });
        }
        
        // Polygon layers
        if (this.layerVisibility.statisticalAreas) {
            legendItems.push({
                type: 'color-box',
                className: 'statistical-areas',
                label: 'Statistical Zones',
                color: 'rgba(128, 128, 128, 0.6)', // Grey with transparency
                description: 'Census areas'
            });
        }
        
        if (this.layerVisibility.habitationClusters) {
            legendItems.push({
                type: 'color-box',
                className: 'habitation-clusters',
                label: 'Habitation Clusters',
                color: 'rgba(52, 152, 219, 0.6)', // Blue with transparency
                description: 'Settlement groups'
            });
        }
        
        // Clear existing legend items
        this.elements.legendItems.innerHTML = '';
        
        // Only show legend if there are visible items
        if (legendItems.length === 0) {
            this.elements.legendItems.style.display = 'none';
            return;
        }
        
        this.elements.legendItems.style.display = 'block';
        
        // Add new legend items with proper symbology
        legendItems.forEach(item => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            
            const iconDiv = document.createElement('div');
            iconDiv.className = `legend-icon ${item.className}`;
            
            if (item.type === 'svg-icon') {
                // Use actual SVG icons that match the map icons exactly
                const img = document.createElement('img');
                img.src = item.iconSrc;
                img.width = 18;
                img.height = 18;
                img.style.display = 'block';
                iconDiv.appendChild(img);
            } else if (item.type === 'color-box') {
                // Use color boxes for polygon layers and building footprints
                iconDiv.style.cssText = `
                    width: 18px;
                    height: 18px;
                    background: ${item.color};
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    border-radius: 3px;
                    flex-shrink: 0;
                `;
            }
            
            const label = document.createElement('span');
            label.textContent = item.label;
            label.style.cssText = `
                margin-left: 10px;
                font-size: 13px;
                font-weight: 500;
                color: var(--text-primary);
                flex: 1;
            `;
            
            legendItem.appendChild(iconDiv);
            legendItem.appendChild(label);
            this.elements.legendItems.appendChild(legendItem);
        });
        
        // Controls are handled by setupCustomControls() function
    }
    


    /**
     * Create simple heatmap legend
     */
    createHeatmapLegend() {
        if (!this.elements.legendItems) return;
        
        // Clear existing legend items
        this.elements.legendItems.innerHTML = '';
        this.elements.legendItems.style.display = 'block';
        
        // Simple legend items for accessibility heatmap
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
            legendItem.className = 'legend-item';
            
            const colorBox = document.createElement('div');
            colorBox.style.cssText = `
                width: 18px;
                height: 18px;
                background: ${item.color};
                border-radius: 3px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                flex-shrink: 0;
            `;
            
            const label = document.createElement('span');
            label.textContent = item.label;
            label.style.cssText = `
                margin-left: 10px;
                font-size: 13px;
                font-weight: 500;
                color: var(--text-primary);
                flex: 1;
            `;
            
            legendItem.appendChild(colorBox);
            legendItem.appendChild(label);
            this.elements.legendItems.appendChild(legendItem);
        });
        
        // Distance info
        const distanceInfo = document.createElement('div');
        distanceInfo.style.cssText = `
            font-size: 11px;
            color: var(--text-secondary);
            text-align: center;
            margin-top: var(--space-md);
            padding: var(--space-xs) var(--space-sm);
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: var(--radius-sm);
        `;
        distanceInfo.textContent = `Within ${this.coverageRadius}m radius`;
        this.elements.legendItems.appendChild(distanceInfo);
        
        // Controls are handled by setupCustomControls() function
    }

    /**
     * Update visualization layers
     */
    updateVisualization() {
        if (!this.deckgl || this.layerUpdateInProgress) return;
        
        this.layerUpdateInProgress = true;
        
        try {
            const layers = [];
            
            // Ensure base tile layer exists
            this._ensureBaseTileLayer();
            if (this.baseTileLayer) {
                layers.push(this.baseTileLayer);
            }
            
            // Add data layers
            const dataLayers = this.createLayers();
            layers.push(...dataLayers);
            
            // Update deck.gl
            this.currentLayers = layers;
            this.deckgl.setProps({ layers: this.currentLayers });
            
        } catch (error) {
            console.error('Layer update failed:', error);
            
            // Attempt recovery with minimal layers
            try {
                const dataLayers = this.createLayers();
                const recoveryLayers = this.baseTileLayer ? [this.baseTileLayer, ...dataLayers] : dataLayers;
                this.deckgl.setProps({ layers: recoveryLayers });
            } catch (recoveryError) {
                console.error('Recovery failed:', recoveryError);
            }
        } finally {
            this.layerUpdateInProgress = false;
        }
        
        this.updateCoverageAnalysis();
        this.updateLegend();
    }

    /**
     * Efficiently update only data layers, reusing base tile layer
     */
    updateDataLayersOnly() {
        if (!this.deckgl || this.layerUpdateInProgress) return;
        
        this.layerUpdateInProgress = true;
        
        try {
            const layers = [];
            
            // Reuse existing base tile layer
            if (this.baseTileLayer) {
                layers.push(this.baseTileLayer);
            }
            
            // Update data layers only
            const dataLayers = this.createLayers();
            layers.push(...dataLayers);
            
            this.currentLayers = layers;
            this.deckgl.setProps({ layers: this.currentLayers });
            
        } catch (error) {
            console.warn('Data layer update failed:', error);
        } finally {
            this.layerUpdateInProgress = false;
        }
        
        this.updateLegend();
    }

    /**
     * Ensure base tile layer exists and is current
     */
    _ensureBaseTileLayer() {
        const basemapConfig = this.basemaps[this.currentBasemap];
        
        if (!basemapConfig) {
            console.error(`Invalid basemap: ${this.currentBasemap}`);
            return;
        }
        
        // Always recreate if layer doesn't exist or config changed
        if (!this.baseTileLayer || 
            !this.currentBasemapConfig || 
            this.currentBasemapConfig.url !== basemapConfig.url ||
            this.currentBasemapConfig.name !== basemapConfig.name) {
            
            // Clear old layer reference
            this.baseTileLayer = null;
            
            try {
                // Create new tile layer
                this.baseTileLayer = this.createStandardTileLayer(basemapConfig);
                this.currentBasemapConfig = { ...basemapConfig }; // Store copy
            } catch (error) {
                console.error(`Failed to create tile layer for ${basemapConfig.name}:`, error);
                this.baseTileLayer = null;
                this.currentBasemapConfig = null;
            }
        }
    }
    
    /**
     * Get icon configuration for different shelter types using external SVG files
     * Uses pixel-based sizing for consistent, crisp rendering at all zoom levels
     */
    getShelterIcon(type) {
        const baseConfig = {
            width: 48,
            height: 66,
            anchorX: 24,
            anchorY: 66, // Anchor at bottom of pin for proper positioning
            mask: false, // Preserve SVG colors instead of using tinting
            alphaCutoff: 0.05 // Clean edges for crisp rendering
        };

        switch (type) {
            case 'existing':
                return {
                    ...baseConfig,
                    url: 'data/existing.svg',
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
                    url: 'data/proposed.svg',
                    id: 'optimal-shelter'
                };
            default:
                return {
                    ...baseConfig,
                    url: 'data/existing.svg',
                    id: 'default-shelter'
                };
        }
    }
    
    /**
     * Get optimized loading options for SVG icons
     * Based on deck.gl IconLayer documentation best practices
     */
    getSVGLoadOptions() {
        return {
            imagebitmap: {
                resizeWidth: 48,
                resizeHeight: 66,
                resizeQuality: 'high',
                premultiplyAlpha: 'none'
            }
        };
    }
    
    /**
     * Get texture parameters for crisp icon rendering
     * Based on deck.gl IconLayer documentation
     */
    getTextureParameters() {
        return {
            minFilter: 'linear',
            magFilter: 'linear', 
            mipmapFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge'
        };
    }
    
    /**
     * Get zoom-dependent icon configuration with smooth interpolation
     */
    getZoomConfig() {
        const currentZoom = this._currentZoom || 11;
        
        // Define breakpoint ranges for ultra-smooth interpolation
        const breakpoints = [
            { zoom: 7, config: this.ICON_ZOOM_BREAKPOINTS.low },
            { zoom: 9, config: this.ICON_ZOOM_BREAKPOINTS.low },
            { zoom: 12, config: this.ICON_ZOOM_BREAKPOINTS.medium },
            { zoom: 15, config: this.ICON_ZOOM_BREAKPOINTS.medium },
            { zoom: 17, config: this.ICON_ZOOM_BREAKPOINTS.high },
            { zoom: 19, config: this.ICON_ZOOM_BREAKPOINTS.ultra }
        ];
        
        // Handle edge cases
        if (currentZoom <= breakpoints[0].zoom) {
            return breakpoints[0].config;
        }
        if (currentZoom >= breakpoints[breakpoints.length - 1].zoom) {
            return breakpoints[breakpoints.length - 1].config;
        }
        
        // Find the two breakpoints to interpolate between
        let lowerPoint = breakpoints[0];
        let upperPoint = breakpoints[1];
        
        for (let i = 0; i < breakpoints.length - 1; i++) {
            if (currentZoom >= breakpoints[i].zoom && currentZoom <= breakpoints[i + 1].zoom) {
                lowerPoint = breakpoints[i];
                upperPoint = breakpoints[i + 1];
                break;
            }
        }
        
                 // Calculate interpolation factor (0 to 1)
         const range = upperPoint.zoom - lowerPoint.zoom;
         const factor = range > 0 ? (currentZoom - lowerPoint.zoom) / range : 0;
         
         // Apply subtle easing for more natural feel
         const easedFactor = this.easeInOutQuad(factor);
         
         // Smooth interpolation between breakpoints
         return {
             size: this.lerp(lowerPoint.config.size, upperPoint.config.size, easedFactor),
             minPixels: Math.round(this.lerp(lowerPoint.config.minPixels, upperPoint.config.minPixels, easedFactor)),
             maxPixels: Math.round(this.lerp(lowerPoint.config.maxPixels, upperPoint.config.maxPixels, easedFactor))
         };
    }
    
    /**
     * Linear interpolation utility for smooth transitions
     */
    lerp(start, end, factor) {
        return start + (end - start) * factor;
    }
    
    /**
     * Enhanced easing function for smoother zoom scaling
     */
    easeInOutQuad(t) {
        // Smoother cubic easing for more natural feel
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    /**
     * Get icon sizing configuration (simplified for faster updates)
     */
    getIconSizeConfig(iconType = 'existing') {
        const zoomConfig = this.getZoomConfig();
        const typeScale = this.ICON_TYPE_SCALES[iconType] || 1.0;
        
        return {
            getSize: () => zoomConfig.size * typeScale,
            sizeScale: 1,
            sizeUnits: 'meters',
            sizeMinPixels: Math.round(zoomConfig.minPixels * typeScale),
            sizeMaxPixels: Math.round(zoomConfig.maxPixels * typeScale),
            billboard: true
        };
    }


    



    
    /**
     * Create simplified tile layer with minimal configuration
     */
    createStandardTileLayer(basemapConfig) {
        return new deck.TileLayer({
            id: `basemap-${this.currentBasemap}`,
            data: basemapConfig.url,
            minZoom: 0,
            maxZoom: 19,
            tileSize: 256,
            
            renderSubLayers: props => {
                const { tile } = props;
                
                if (!tile || !props.data) {
                    return null;
                }
                
                const { boundingBox } = tile;
                if (!boundingBox || boundingBox.length !== 2 || boundingBox[0].length !== 2) {
                    return null;
                }
                
                const bounds = [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]];
                
                return new deck.BitmapLayer({
                    ...props,
                    data: null,
                    image: props.data,
                    bounds: bounds
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
            
            // Update data layers only - tile layer doesn't need update
            this.updateDataLayersOnly();
            
            // Update coverage analysis
            this.updateCoverageAnalysis();
            
        } catch (error) {
            console.error('Loading optimal locations failed:', error);
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
        
        // Update simplified statistics
        if (this.elements.currentCoverage) {
            this.elements.currentCoverage.textContent = `${currentCoveragePercentage.toFixed(1)}%`;
        }
        if (this.elements.currentRadius) {
            this.elements.currentRadius.textContent = `${this.coverageRadius}m`;
        }
        if (this.elements.newSheltersCount) {
            this.elements.newSheltersCount.textContent = newSheltersSelected.toLocaleString();
        }
        if (this.elements.newCoverage) {
            this.elements.newCoverage.textContent = `${totalCoveragePercentage.toFixed(1)}%`;
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
     * Handle viewport changes with minimal debouncing
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
        
        // Optimized debounce for smooth scaling
        this._viewStateDebounceTimer = setTimeout(() => {
            this._processViewStateChange(this._pendingViewState);
        }, 10); // 10ms for balanced responsiveness and smoothness
    }
    
    /**
     * Process view state changes with smooth scaling support
     */
    _processViewStateChange(viewState) {
        const previousZoom = this._currentZoom;
        this._currentZoom = viewState.zoom;
        
        if (!previousZoom) {
            // Initial load
            this.updateVisualization();
        } else {
            const zoomDelta = Math.abs(this._currentZoom - previousZoom);
            
            // Ignore micro-changes to prevent stuttering
            if (zoomDelta < 0.05) {
                return;
            }
            
            if (zoomDelta > 0.15) {
                // Smoother threshold for more responsive scaling
                this.updateDataLayersOnly();
            }
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
        const zoom = this._currentZoom || 11;
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
     * Change basemap with proper cleanup and recreation
     */
    changeBasemap(basemap) {
        if (this.currentBasemap === basemap) return; // No change needed
        
        const oldBasemap = this.currentBasemap;
        this.currentBasemap = basemap;
        

        
        // Force complete recreation of tile layer
        this.baseTileLayer = null;
        this.currentBasemapConfig = null;
        
        // Update UI styling based on basemap
        const body = document.body;
        if (basemap === 'light') {
            body.classList.add('light-basemap');
        } else {
            body.classList.remove('light-basemap');
        }
        
        this.updateAttribution();
        
        // Clear any pending basemap timer
        if (this._basemapDebounceTimer) {
            clearTimeout(this._basemapDebounceTimer);
            this._basemapDebounceTimer = null;
        }
        
        // Immediate update for basemap changes - no debouncing needed
        this.updateVisualization();
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
        
        // Safety check: return early if tooltip element doesn't exist
        if (!tooltip) {
            return;
        }
        
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
                    return [59, 130, 246, 180];
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
                    return [59, 130, 246, 220];
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
    
    /**
     * Handle click events for shelter icons and polygons
     */
    handleClick(info) {
        // Handle polygon clicks for selection/highlighting
        if (info.object && info.layer) {
            if (info.layer.id === 'statistical-areas-geojson') {
                this.selectPolygon({
                    ...info.object, 
                    layerType: 'statisticalArea',
                    _index: info.object._index
                }, 'statisticalArea');
            } else if (info.layer.id === 'habitation-clusters-geojson') {
                this.selectPolygon({
                    ...info.object, 
                    layerType: 'habitationCluster',
                    _index: info.object._index
                }, 'habitationCluster');
            }
        } else {
            // Click on empty space - clear selection
            this.clearPolygonSelection();
        }
    }
    
    /**
     * Jump to optimal shelter site location with smooth animation
     */
    jumpToOptimalSite(lat, lon) {
        if (!this.deckgl) return;
        
        // Get current view state
        const currentViewState = this.deckgl.viewState || this._currentViewState || {
            longitude: lon,
            latitude: lat,
            zoom: 16,
            pitch: 0,
            bearing: 0
        };
        
        // Animate to the shelter location
        this.deckgl.setProps({
            viewState: {
                ...currentViewState,
                longitude: lon,
                latitude: lat,
                zoom: Math.max(currentViewState.zoom, 16), // Ensure we zoom in close enough
                transitionDuration: 1000,
                transitionInterpolator: new deck.FlyToInterpolator()
            }
        });
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