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
            analyzePlannedCheckbox: document.getElementById('analyzePlanned'),
            basemapControl: document.querySelector('.basemap-control'),
            basemapRadios: document.querySelectorAll('input[name="basemap"]'),
            themeToggle: document.getElementById('themeToggle'),
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
    }
    
    /**
     * Initialize the application
     */
    async initializeApp() {
        try {
            console.log('🚀 Initializing Shelter Access Analysis App...');
            
            // Load theme preference
            this.loadThemePreference();
            
            // Initialize UI controls
            this.setupEventListeners();
            
            // Load spatial data
            await this.spatialAnalyzer.loadData();
            
            // Initialize map
            this.initializeMap();
            
            // Set initial attribution
            this.updateAttribution();
            
            // Initialize planned analysis section and legend visibility
            const plannedAnalysisDiv = document.getElementById('plannedAnalysis');
            const replaceableLegend = document.querySelector('.replaceable-legend');
            const analyzePlannedChecked = this.elements.analyzePlannedCheckbox.checked;
            
            if (plannedAnalysisDiv) {
                plannedAnalysisDiv.style.display = analyzePlannedChecked ? 'block' : 'none';
            }
            if (replaceableLegend) {
                replaceableLegend.style.display = analyzePlannedChecked ? 'flex' : 'none';
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
        
        // Analyze planned shelters checkbox
        this.elements.analyzePlannedCheckbox.addEventListener('change', async (e) => {
            // When checked: analyze planned shelters (treat them as not existing for optimization)
            // When unchecked: show planned shelters normally (treat them as existing, don't analyze)
            const includePlannedAsExisting = !e.target.checked;
            const maxShelters = await this.spatialAnalyzer.setIncludePlannedShelters(includePlannedAsExisting);
            this.maxShelters = maxShelters;
            
            // Update slider max
            this.elements.newSheltersSlider.max = this.maxShelters;
            if (this.numNewShelters > this.maxShelters) {
                this.numNewShelters = this.maxShelters;
                this.elements.newSheltersSlider.value = this.maxShelters;
                this.elements.newSheltersValue.textContent = this.maxShelters;
            }
            
            // Show/hide planned analysis section and legend item
            const plannedAnalysisDiv = document.getElementById('plannedAnalysis');
            const replaceableLegend = document.querySelector('.replaceable-legend');
            
            if (e.target.checked) {
                // Show planned analysis and replaceable legend when analyzing
                plannedAnalysisDiv.style.display = 'block';
                if (replaceableLegend) replaceableLegend.style.display = 'flex';
            } else {
                // Hide planned analysis and replaceable legend when not analyzing
                plannedAnalysisDiv.style.display = 'none';
                if (replaceableLegend) replaceableLegend.style.display = 'none';
            }
            
            // Reset analysis when toggling planned shelters
            this.proposedShelters = [];
            await this.updateOptimalLocations();
        });
        
        // Basemap control - toggle menu
        const basemapHeader = this.elements.basemapControl.querySelector('.basemap-header');
        basemapHeader.addEventListener('click', () => {
            this.elements.basemapControl.classList.toggle('expanded');
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
        
        // Theme toggle
        this.elements.themeToggle.addEventListener('click', () => {
            this.toggleTheme();
        });
        
        // Initial load of optimal locations
        this.updateOptimalLocations();
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
     * Create visualization layers with new color scheme
     */
    createLayers() {
        const layers = [];
        const currentData = this.spatialAnalyzer.getCurrentData();
        
        if (!currentData.shelters) return layers;
        
        // Get planned shelter evaluation for pairing analysis
        const plannedEval = this.spatialAnalyzer.getPlannedShelterEvaluation(this.proposedShelters.length);
        
        // Create lookup for shelters that should be marked as replaceable
        const replaceableIds = new Set();
        if (plannedEval && plannedEval.pairedShelters) {
            plannedEval.pairedShelters.forEach(pair => {
                if (pair.planned.properties && pair.planned.properties.shelter_id) {
                    replaceableIds.add(pair.planned.properties.shelter_id);
                }
            });
        }
        
        // === EXISTING SHELTERS (Blue) ===
        const existingShelters = currentData.shelters.features.filter(shelter => 
            shelter.properties && shelter.properties.status === 'Active'
        );
        
        // Coverage circles for existing shelters
        if (existingShelters.length > 0) {
            layers.push(new deck.GeoJsonLayer({
                id: 'existing-coverage',
                data: this.createCoverageCircles(existingShelters, this.coverageRadius),
                pickable: false,
                stroked: true,
                filled: true,
                lineWidthMinPixels: 2,
                getFillColor: [52, 152, 219, 80], // More visible blue
                getLineColor: [52, 152, 219, 120],
                getLineWidth: 2
            }));
            
            // Existing shelter points
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
                getRadius: 12,
                getFillColor: [52, 152, 219, 255], // Blue for existing
                getLineColor: [255, 255, 255, 255]
            }));
        }
        
        // === PLANNED SHELTERS (Always show, Orange/Red when analyzed) ===
        // Always show planned shelters, but analyze them only when checkbox is checked
        const plannedShelters = currentData.shelters.features.filter(shelter => 
            shelter.properties && shelter.properties.status === 'Planned'
        );
        
        if (plannedShelters.length > 0) {
            // Check if we should analyze planned shelters (when checkbox is checked)
            const shouldAnalyzePlanned = this.elements.analyzePlannedCheckbox.checked;
            
            // Coverage circles for planned shelters
            layers.push(new deck.GeoJsonLayer({
                id: 'planned-coverage',
                data: this.createCoverageCircles(plannedShelters, this.coverageRadius),
                pickable: false,
                stroked: true,
                filled: true,
                lineWidthMinPixels: 2,
                getFillColor: [255, 165, 0, 80], // More visible orange
                getLineColor: [255, 165, 0, 120],
                getLineWidth: 2
            }));
            
            // Get replaceable shelter IDs if analyzing
            let replaceableIds = new Set();
            if (shouldAnalyzePlanned && this.proposedShelters.length > 0) {
                const plannedEval = this.spatialAnalyzer.getPlannedShelterEvaluation(this.proposedShelters.length);
                if (plannedEval && plannedEval.pairedShelters) {
                    replaceableIds = new Set(plannedEval.pairedShelters.map(pair => 
                        pair.planned.properties ? pair.planned.properties.shelter_id : null
                    ).filter(id => id !== null));
                }
            }
            
            // Planned shelter points
            layers.push(new deck.ScatterplotLayer({
                id: 'planned-shelters',
                data: plannedShelters,
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
                    // Red warning for replaceable planned shelters (only when analyzing)
                    if (shouldAnalyzePlanned && replaceableIds.has(d.properties.shelter_id)) {
                        return [220, 53, 69, 255]; // Red warning
                    }
                    return [255, 165, 0, 255]; // Bright orange for planned
                },
                getLineColor: [255, 255, 255, 255]
            }));
            
            // Warning symbols for replaceable planned shelters (only when analyzing)
            if (shouldAnalyzePlanned) {
                const replaceableShelters = plannedShelters.filter(shelter => 
                    replaceableIds.has(shelter.properties.shelter_id)
                );
                
                if (replaceableShelters.length > 0) {
                    layers.push(new deck.TextLayer({
                        id: 'replaceable-markers',
                        data: replaceableShelters,
                        pickable: true,
                        getPosition: d => d.geometry.coordinates,
                        getText: '⚠️',
                        getSize: 16,
                        getAngle: 0,
                        getTextAnchor: 'middle',
                        getAlignmentBaseline: 'center',
                        getColor: [220, 53, 69, 255] // Red for warnings
                    }));
                }
            }
        }
        
        // === OPTIMAL NEW SHELTERS (Yellow-Green Gradient) ===
        if (this.proposedShelters.length > 0) {
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
                getFillColor: [154, 205, 50, 80], // More visible yellow-green
                getLineColor: [154, 205, 50, 120],
                getLineWidth: 2
            }));
            
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
                getRadius: 14,
                getFillColor: d => {
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
        const cacheKey = `${this.spatialAnalyzer.includePlannedShelters ? "with_planned" : "without_planned"}_${this.coverageRadius}m`;
        const data = this.spatialAnalyzer.optimalData.get(cacheKey);
        const plannedEval = this.spatialAnalyzer.getPlannedShelterEvaluation(this.proposedShelters.length);
        
        if (!data || !data.statistics) return;
        
        const stats = data.statistics;
        const newSheltersSelected = this.proposedShelters.length;
        
        // Calculate coverage from selected optimal shelters
        let newBuildingsCovered = 0;
        let newPeopleCovered = 0;
        if (newSheltersSelected > 0) {
            newBuildingsCovered = this.proposedShelters.reduce((sum, shelter) => sum + (shelter.buildings_covered || 0), 0);
            newPeopleCovered = this.proposedShelters.reduce((sum, shelter) => sum + (shelter.people_covered || 0), 0);
        }
        
        const existingCoverage = (stats.total_buildings_covered || 0) - (stats.new_buildings_covered || 0);
        const totalBuildingsCovered = existingCoverage + newBuildingsCovered;
        const totalPeopleCovered = ((totalBuildingsCovered) * 7); // 7 people per building
        const totalCoveragePercentage = (totalBuildingsCovered / stats.total_buildings) * 100;
        
        // Update main statistics
        if (this.elements.currentCoverage) {
            this.elements.currentCoverage.textContent = `${totalCoveragePercentage.toFixed(1)}%`;
        }
        if (this.elements.newCoverage) {
            this.elements.newCoverage.textContent = `${totalCoveragePercentage.toFixed(1)}%`;
        }
        if (this.elements.buildingsCovered) {
            this.elements.buildingsCovered.textContent = totalBuildingsCovered.toLocaleString();
        }
        if (this.elements.additionalPeople) {
            this.elements.additionalPeople.textContent = newPeopleCovered.toLocaleString();
        }
        
        // Update planned shelter analysis with new pairing data
        if (plannedEval && !this.spatialAnalyzer.includePlannedShelters) {
            if (this.elements.suboptimalPlanned) {
                this.elements.suboptimalPlanned.textContent = plannedEval.totalPairs.toString();
            }
            if (this.elements.underservedPeople) {
                this.elements.underservedPeople.textContent = `+${Math.round(plannedEval.totalImprovement)} people`;
            }
        } else {
            // Clear planned analysis when including planned shelters
            if (this.elements.suboptimalPlanned) {
                this.elements.suboptimalPlanned.textContent = '0';
            }
            if (this.elements.underservedPeople) {
                this.elements.underservedPeople.textContent = '0';
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
            
            if (info.layer.id === 'existing-shelters') {
                // Get coverage data from precomputed results
                const cacheKey = `${this.spatialAnalyzer.includePlannedShelters ? "with_planned" : "without_planned"}_${this.coverageRadius}m`;
                const data = this.spatialAnalyzer.optimalData.get(cacheKey);
                const shelterId = object.properties.shelter_id;
                
                let buildingsCovered = 0;
                let peopleCovered = 0;
                
                if (data && data.existing_shelters) {
                    const shelterData = data.existing_shelters.find(s => 
                        s.properties && s.properties.shelter_id === shelterId
                    );
                    if (shelterData) {
                        buildingsCovered = shelterData.buildings_covered || 0;
                        peopleCovered = shelterData.people_covered || 0;
                    }
                }
                
                content = `
                    <strong>Existing Shelter</strong><br>
                    Buildings covered: ${buildingsCovered}<br>
                    People served: ${peopleCovered}
                `;
                
            } else if (info.layer.id === 'planned-shelters') {
                // Get coverage data and check for replacement pairing
                const cacheKey = `without_planned_${this.coverageRadius}m`;
                const data = this.spatialAnalyzer.optimalData.get(cacheKey);
                const shelterId = object.properties.shelter_id;
                const plannedEval = this.spatialAnalyzer.getPlannedShelterEvaluation(this.proposedShelters.length);
                
                let buildingsCovered = 0;
                let peopleCovered = 0;
                
                if (data && data.existing_shelters) {
                    const shelterData = data.existing_shelters.find(s => 
                        s.properties && s.properties.shelter_id === shelterId
                    );
                    if (shelterData) {
                        buildingsCovered = shelterData.buildings_covered || 0;
                        peopleCovered = shelterData.people_covered || 0;
                    }
                }
                
                // Check if this planned shelter has a better replacement
                let replacementInfo = '';
                if (plannedEval && plannedEval.pairedShelters) {
                    const pairing = plannedEval.pairedShelters.find(pair => 
                        pair.planned.properties && pair.planned.properties.shelter_id === shelterId
                    );
                    
                    if (pairing) {
                        replacementInfo = `
                            <br><strong>⚠️ Better location available!</strong><br>
                            Current: ${pairing.plannedCoverage} people<br>
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
                    <strong>Planned Shelter</strong><br>
                    Buildings covered: ${buildingsCovered}<br>
                    People served: ${peopleCovered}${replacementInfo}
                `;
                
            } else if (info.layer.id === 'proposed-shelters') {
                const buildingsCovered = object.buildings_covered || 0;
                const peopleCovered = object.people_covered || 0;
                const rank = object.rank || 1;
                
                content = `
                    <strong>Optimal New Site #${rank}</strong><br>
                    Buildings covered: ${buildingsCovered}<br>
                    People served: ${peopleCovered}
                `;
                
            } else if (info.layer.id === 'replaceable-markers') {
                // Same as planned-shelters but focus on replacement
                const shelterId = object.properties.shelter_id;
                const plannedEval = this.spatialAnalyzer.getPlannedShelterEvaluation(this.proposedShelters.length);
                
                if (plannedEval && plannedEval.pairedShelters) {
                    const pairing = plannedEval.pairedShelters.find(pair => 
                        pair.planned.properties && pair.planned.properties.shelter_id === shelterId
                    );
                    
                    if (pairing) {
                        content = `
                            <strong>⚠️ Replaceable Planned Shelter</strong><br>
                            Current coverage: ${pairing.plannedCoverage} people<br>
                            Better site covers: ${pairing.optimalCoverage} people<br>
                            Improvement: +${pairing.improvement} people<br>
                            <button onclick="app.jumpToOptimalSite(${pairing.optimal.lat}, ${pairing.optimal.lon})" 
                                    style="margin-top:5px; padding:4px 8px; cursor:pointer; background:#28a745; color:white; border:none; border-radius:3px;">
                                Jump to Better Site
                            </button>
                        `;
                    }
                }
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
}); 