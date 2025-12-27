var fs = require('fs');

// Point in polygon algorithm (ray casting)
function pointInPolygon(point, polygon) {
    var x = point[0];
    var y = point[1];
    var inside = false;
    
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        var xi = polygon[i][0];
        var yi = polygon[i][1];
        var xj = polygon[j][0];
        var yj = polygon[j][1];
        
        var intersect = ((yi > y) !== (yj > y)) && 
                        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
}

// Load convex hull
var hullData = JSON.parse(fs.readFileSync('./convex_hull.geojson', 'utf8'));
var hullPolygon = hullData.features[0].geometry.coordinates[0];

console.log('Loaded convex hull with', hullPolygon.length, 'vertices');

// Load alerts
var alertsData = JSON.parse(fs.readFileSync('./alerts-since-oct7-2023.geojson', 'utf8'));

console.log('Loaded', alertsData.features.length, 'total alert features');

// Filter alerts
var filteredFeatures = [];
var uniqueAlertEvents = new Set();
var uniqueAlertIds = new Set();
var alertsWithCoords = 0;
var alertsWithoutCoords = 0;
var alertsOutsideHull = 0;

alertsData.features.forEach(function(feature) {
    var props = feature.properties || {};
    var hasCoords = props.has_coordinates !== false && feature.geometry && feature.geometry.coordinates;
    
    if (hasCoords) {
        alertsWithCoords++;
        var coords = feature.geometry.coordinates;
        
        // Check if point is inside hull
        if (pointInPolygon(coords, hullPolygon)) {
            filteredFeatures.push(feature);
            if (props.alert_id !== null && props.alert_id !== undefined && props.timestamp) {
                // Count unique alert events (alert_id + timestamp)
                uniqueAlertEvents.add(props.alert_id + '_' + props.timestamp);
                uniqueAlertIds.add(props.alert_id);
            }
        } else {
            alertsOutsideHull++;
        }
    } else {
        // Include alerts without coordinates (they might still be relevant)
        // Or exclude them - let's exclude for now since we can't verify location
        alertsWithoutCoords++;
    }
});

console.log('\nFiltering results:');
console.log('  Alerts with coordinates:', alertsWithCoords);
console.log('  Alerts without coordinates (excluded):', alertsWithoutCoords);
console.log('  Alerts outside hull (excluded):', alertsOutsideHull);
console.log('  Alerts inside hull:', filteredFeatures.length);
console.log('  Unique alert events (alert_id + timestamp):', uniqueAlertEvents.size);
console.log('  Unique alert IDs:', uniqueAlertIds.size);

// Create filtered GeoJSON
var filteredGeoJSON = {
    type: 'FeatureCollection',
    metadata: {
        title: 'Rocket Alerts in Israel since October 7, 2023 (Filtered by Convex Hull)',
        source: 'tzevaadom.co.il',
        generated: new Date().toISOString(),
        original_total_features: alertsData.features.length,
        filtered_features: filteredFeatures.length,
        unique_alert_events: uniqueAlertEvents.size,
        unique_alert_ids: uniqueAlertIds.size,
        filter_applied: 'convex_hull',
        alerts_with_coords: alertsWithCoords,
        alerts_without_coords: alertsWithoutCoords,
        alerts_outside_hull: alertsOutsideHull
    },
    features: filteredFeatures
};

// Write filtered dataset
var outputFile = './alerts-since-oct7-2023-filtered.geojson';
fs.writeFileSync(outputFile, JSON.stringify(filteredGeoJSON, null, 2), 'utf8');

console.log('\n✓ Exported filtered dataset to', outputFile);
console.log('File size:', (fs.statSync(outputFile).size / 1024 / 1024).toFixed(2), 'MB');

