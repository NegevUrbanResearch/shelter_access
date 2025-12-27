var axios = require('axios');
var fs = require('fs');

// Category mapping from tzevaadom to alert types
// Based on historical category mapping from lib/alerts.js
function getAlertTypeByCategory(category) {
    category = parseInt(category);
    switch (category) {
        case 0:
            return 'missiles';
        case 1:
            return 'missiles';
        case 2:
            return 'hostileAircraftIntrusion';
        case 3:
            return 'general';
        case 4:
            return 'general';
        case 5:
            return 'general';
        case 6:
            return 'general';
        case 7:
            return 'earthQuake';
        case 8:
            return 'earthQuake';
        case 9:
            return 'radiologicalEvent';
        case 10:
            return 'terroristInfiltration';
        case 11:
            return 'tsunami';
        case 12:
            return 'hazardousMaterials';
        case 13:
            return 'newsFlash';
        case 14:
            return 'newsFlash';
        case 15:
            return 'missilesDrill';
        case 16:
            return 'hostileAircraftIntrusionDrill';
        case 17:
            return 'generalDrill';
        case 18:
            return 'generalDrill';
        case 19:
            return 'generalDrill';
        case 20:
            return 'generalDrill';
        case 21:
            return 'earthQuakeDrill';
        case 22:
            return 'earthQuakeDrill';
        case 23:
            return 'radiologicalEventDrill';
        case 24:
            return 'terroristInfiltrationDrill';
        case 25:
            return 'tsunamiDrill';
        case 26:
            return 'hazardousMaterialsDrill';
        default:
            return 'unknown';
    }
}

// Load cities metadata
var citiesData = JSON.parse(fs.readFileSync('./places.json', 'utf8'));
var cityMap = {};

// Normalize city name for matching (remove special chars, lowercase)
function normalizeCityName(name) {
    if (!name) return '';
    return name
        .replace(/[''"]/g, "'")  // Normalize apostrophes
        .replace(/[-\s]/g, '')    // Remove dashes and spaces
        .toLowerCase();
}

// Build city name to coordinates mapping
citiesData.forEach(function(city) {
    if (city.name && city.lat && city.lng) {
        cityMap[city.name] = {
            lat: city.lat,
            lng: city.lng,
            id: city.id,
            zone: city.zone,
            name_en: city.name_en
        };
        
        // Also add normalized version for fuzzy matching
        var normalized = normalizeCityName(city.name);
        if (normalized && !cityMap[normalized]) {
            cityMap[normalized] = cityMap[city.name];
        }
    }
});

// Find city with fuzzy matching
function findCity(cityName) {
    // Exact match
    if (cityMap[cityName]) {
        return cityMap[cityName];
    }
    
    // Try normalized match
    var normalized = normalizeCityName(cityName);
    if (cityMap[normalized]) {
        return cityMap[normalized];
    }
    
    // Try partial match - check if city name contains or is contained in known cities
    for (var knownCity in cityMap) {
        if (typeof cityMap[knownCity] === 'object' && cityMap[knownCity].lat) {
            var knownNormalized = normalizeCityName(knownCity);
            var searchNormalized = normalized;
            
            // Check if one contains the other (for compound names)
            if (knownNormalized.length > 5 && searchNormalized.length > 5) {
                if (knownNormalized.includes(searchNormalized) || 
                    searchNormalized.includes(knownNormalized)) {
                    return cityMap[knownCity];
                }
            }
        }
    }
    
    return null;
}

console.log('Loaded', Object.keys(cityMap).length, 'cities with coordinates');

// Fetch and process alerts
function exportGeoJSON() {
    var url = 'https://www.tzevaadom.co.il/static/historical/all.json';
    
    axios.get(url).then(function (res) {
        var data = res.data;
        
        if (!Array.isArray(data)) {
            console.error('Unexpected data format');
            return;
        }
        
        console.log('Total alerts in dataset:', data.length);
        
        // Filter since Oct 7, 2023
        var oct7 = new Date('2023-10-07T00:00:00+03:00').getTime() / 1000;
        
        var features = [];
        var citiesNotFound = new Set();
        var alertsProcessed = 0;
        
        data.forEach(function(item) {
            var timestamp = item[3];
            
            // Skip if before Oct 7, 2023
            if (timestamp < oct7) {
                return;
            }
            
            var alertId = item[0];
            var category = item[1];
            var cityNames = item[2] || [];
            var date = new Date(timestamp * 1000);
            
            var alertType = getAlertTypeByCategory(category);
            
            // Create a feature for each city in the alert
            cityNames.forEach(function(cityName) {
                var cityInfo = findCity(cityName);
                
                if (cityInfo) {
                    features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: [cityInfo.lng, cityInfo.lat]
                        },
                        properties: {
                            alert_id: alertId,
                            date: date.toISOString(),
                            timestamp: timestamp,
                            city_name: cityName,
                            city_name_en: cityInfo.name_en || '',
                            city_id: cityInfo.id,
                            zone: cityInfo.zone || '',
                            alert_type: alertType,
                            category: category,
                            cities_in_alert: cityNames,
                            matched: cityMap[cityName] ? 'exact' : 'fuzzy',
                            has_coordinates: true
                        }
                    });
                } else {
                    // Include unmatched cities with null geometry so they're not lost
                    citiesNotFound.add(cityName);
                    features.push({
                        type: 'Feature',
                        geometry: null,
                        properties: {
                            alert_id: alertId,
                            date: date.toISOString(),
                            timestamp: timestamp,
                            city_name: cityName,
                            city_name_en: '',
                            city_id: null,
                            zone: '',
                            alert_type: alertType,
                            category: category,
                            cities_in_alert: cityNames,
                            matched: 'none',
                            has_coordinates: false,
                            note: 'City name not found in metadata - coordinates unavailable'
                        }
                    });
                }
            });
            
            alertsProcessed++;
        });
        
        console.log('\nProcessed', alertsProcessed, 'alerts since Oct 7, 2023');
        console.log('Created', features.length, 'GeoJSON features');
        console.log('Cities not found in metadata:', citiesNotFound.size);
        
        if (citiesNotFound.size > 0) {
            console.log('\nSample cities not found:', Array.from(citiesNotFound).slice(0, 10).join(', '));
        }
        
        // Create GeoJSON structure
        var geoJSON = {
            type: 'FeatureCollection',
            metadata: {
                title: 'Rocket Alerts in Israel since October 7, 2023',
                source: 'tzevaadom.co.il',
                generated: new Date().toISOString(),
                total_alerts: alertsProcessed,
                total_features: features.length,
                date_range: {
                    start: '2023-10-07T00:00:00+03:00',
                    end: features.length > 0 ? features[features.length - 1].properties.date : null
                }
            },
            features: features
        };
        
        // Write to file
        var outputFile = './alerts-since-oct7-2023.geojson';
        fs.writeFileSync(outputFile, JSON.stringify(geoJSON, null, 2), 'utf8');
        
        console.log('\n✓ Exported to', outputFile);
        console.log('File size:', (fs.statSync(outputFile).size / 1024 / 1024).toFixed(2), 'MB');
        
    }).catch(function (err) {
        console.error('Request failed:', err.message);
        if (err.response) {
            console.error('Status:', err.response.status);
        }
    });
}

exportGeoJSON();

