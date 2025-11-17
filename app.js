// API Configuration - auto-detect production vs local
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8080/api'
    : `${window.location.protocol}//${window.location.host}/api`;

// Base URL for static files (photos)
const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8080'
    : `${window.location.protocol}//${window.location.host}`;

// Application State
const state = {
    map: null,
    trackDetailMap: null, // Map for track detail modal
    tracks: [],
    photos: [],
    labels: [], // All available labels
    layers: {
        tracks: {},
        photos: null // Will be initialized when Leaflet is ready
    },
    currentFilter: 'all',
    currentView: 'map',
    searchTerm: ''
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    attachEventListeners();
    await loadLabelsFromServer();
    await loadTracksFromServer();
    await loadPhotosFromServer();
});

// Initialize Leaflet Map
function initMap() {
    state.map = L.map('map', {
        zoomControl: false // Disable default zoom control
    }).setView([45.5, 2.5], 6);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(state.map);

    // Initialize and add photo layer to map
    state.layers.photos = L.layerGroup();
    state.layers.photos.addTo(state.map);
}

// Event Listeners
function attachEventListeners() {

    // Modal Close
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('photoModal').classList.add('hidden');
    });

    // Close modal on background click
    document.getElementById('photoModal').addEventListener('click', (e) => {
        if (e.target.id === 'photoModal') {
            document.getElementById('photoModal').classList.add('hidden');
        }
    });

    // Delete photo button
    document.getElementById('deletePhotoBtn').addEventListener('click', handlePhotoDelete);

    // Track Info Modal - clickable title to close
    document.getElementById('trackInfoTitle').addEventListener('click', closeTrackInfoModal);
    document.getElementById('trackInfoModal').addEventListener('click', (e) => {
        if (e.target.id === 'trackInfoModal') {
            closeTrackInfoModal();
        }
    });
    // Edit button - support both click and touch events for iOS
    const editBtn = document.getElementById('editTrackFromInfo');
    const handleEdit = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const trackId = editBtn.dataset.trackId;
        console.log('Edit button clicked, trackId:', trackId);
        closeTrackInfoModal();
        editTrack(trackId);
    };
    editBtn.addEventListener('click', handleEdit);
    editBtn.addEventListener('touchend', handleEdit);
    document.getElementById('downloadTrackFromInfo').addEventListener('click', () => {
        const trackId = document.getElementById('downloadTrackFromInfo').dataset.trackId;
        downloadTrack(trackId);
    });

    // Track Edit Modal
    document.getElementById('closeTrackEditModal').addEventListener('click', closeTrackEditModal);
    document.getElementById('cancelTrackEdit').addEventListener('click', closeTrackEditModal);
    document.getElementById('deleteTrackBtn').addEventListener('click', handleTrackDelete);
    document.getElementById('trackEditForm').addEventListener('submit', handleTrackEdit);
    document.getElementById('trackEditModal').addEventListener('click', (e) => {
        if (e.target.id === 'trackEditModal') {
            closeTrackEditModal();
        }
    });

    // Add photos to track
    document.getElementById('addTrackPhotos').addEventListener('change', handleAddTrackPhotos);

    // Labels management
    document.getElementById('addLabelBtn').addEventListener('click', addLabel);
    document.getElementById('newLabel').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addLabel();
        }
    });

    // Labels Management Modal
    document.getElementById('settingsButton').addEventListener('click', showLabelsManagementModal);
    document.getElementById('closeLabelsManagementModal').addEventListener('click', closeLabelsManagementModal);
    document.getElementById('labelsManagementModal').addEventListener('click', (e) => {
        if (e.target.id === 'labelsManagementModal') {
            closeLabelsManagementModal();
        }
    });

    // Settings tabs
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update active tab
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update visible content
            document.querySelectorAll('.settings-tab-content').forEach(content => {
                content.classList.remove('active');
                content.classList.add('hidden');
            });

            const targetContent = document.getElementById(`${targetTab}Tab`);
            targetContent.classList.remove('hidden');
            targetContent.classList.add('active');

            // Load data for the selected tab
            if (targetTab === 'types') {
                loadAndDisplayTrackTypes();
            }
        });
    });

    // Track types management
    document.getElementById('addTrackTypeBtn').addEventListener('click', showAddTrackTypeForm);

    // FAB button - trigger GPX upload directly
    document.getElementById('fabButton').addEventListener('click', () => {
        document.getElementById('gpxUploadFab').click();
    });

    // Upload modal
    document.getElementById('closeUploadModal').addEventListener('click', () => {
        document.getElementById('uploadModal').classList.add('hidden');
    });
    document.getElementById('uploadModal').addEventListener('click', (e) => {
        if (e.target.id === 'uploadModal') {
            document.getElementById('uploadModal').classList.add('hidden');
        }
    });

    // FAB uploads
    document.getElementById('gpxUploadFab').addEventListener('change', handleGPXUpload);
}

// Handle GPX File Upload
async function handleGPXUpload(event) {
    const files = Array.from(event.target.files);

    for (const file of files) {
        try {
            // Read and parse the GPX file first
            const text = await file.text();
            const gpxData = parseGPX(text);

            if (gpxData) {
                const type = guessActivityType(gpxData.name);
                const color = '#2563eb'; // Blue color for all tracks
                const distance = calculateDistance(gpxData.points);
                const elevation = calculateElevation(gpxData.points);
                const duration = calculateDuration(gpxData.points);
                const direction = detectDirection(gpxData.points);

                // Upload file with metadata to server
                const formData = new FormData();
                formData.append('gpx', file);
                formData.append('name', gpxData.name || file.name.replace('.gpx', ''));
                formData.append('type', type);
                formData.append('direction', direction);
                formData.append('color', color);
                formData.append('distance', distance.toString());
                formData.append('elevation', elevation.toString());
                if (duration) formData.append('duration', duration.toString());

                const response = await fetch(`${API_BASE_URL}/gpx/upload`, {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (result.success && result.track) {
                    const track = {
                        ...result.track,
                        points: gpxData.points,
                        bounds: calculateBounds(gpxData.points)
                    };

                    state.tracks.push(track);
                    addTrackToMap(track);

                    // Fit map to the newly added track
                    state.map.fitBounds(track.bounds, { padding: [50, 50] });
                }
            }
        } catch (error) {
            console.error('Error uploading GPX:', error);
            alert('Erreur lors de l\'upload du fichier GPX');
        }
    }

    renderTracks();
    if (state.currentView === 'list') {
        renderListView();
    }

    // Close upload modal if open
    document.getElementById('uploadModal').classList.add('hidden');

    event.target.value = '';
}

// Parse GPX File
function parseGPX(gpxText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'text/xml');

    // Check for parsing errors
    if (xmlDoc.querySelector('parsererror')) {
        console.error('Error parsing GPX');
        return null;
    }

    // Get track name
    const nameElement = xmlDoc.querySelector('name');
    const name = nameElement ? nameElement.textContent : 'Trace sans nom';

    // Get track points - respect track segments to avoid straight lines
    const points = [];

    // Try to get track segments first (proper GPX structure)
    const trksegs = xmlDoc.querySelectorAll('trkseg');

    if (trksegs.length > 0) {
        // Process each segment separately
        trksegs.forEach((trkseg, segIndex) => {
            const trkpts = trkseg.querySelectorAll('trkpt');

            trkpts.forEach((trkpt) => {
                const lat = parseFloat(trkpt.getAttribute('lat'));
                const lon = parseFloat(trkpt.getAttribute('lon'));

                // Skip invalid coordinates (NaN or out of valid range)
                if (isNaN(lat) || isNaN(lon) ||
                    lat < -90 || lat > 90 ||
                    lon < -180 || lon > 180) {
                    console.warn(`Skipping invalid coordinates: lat=${lat}, lon=${lon}`);
                    return;
                }

                const eleElement = trkpt.querySelector('ele');
                const timeElement = trkpt.querySelector('time');

                points.push({
                    lat,
                    lon,
                    ele: eleElement ? parseFloat(eleElement.textContent) : null,
                    time: timeElement ? new Date(timeElement.textContent) : null,
                    segment: segIndex // Track which segment this point belongs to
                });
            });
        });
    } else {
        // Fallback: if no segments, get all trkpt directly
        const trkpts = xmlDoc.querySelectorAll('trkpt');

        trkpts.forEach(trkpt => {
            const lat = parseFloat(trkpt.getAttribute('lat'));
            const lon = parseFloat(trkpt.getAttribute('lon'));

            // Skip invalid coordinates (NaN or out of valid range)
            if (isNaN(lat) || isNaN(lon) ||
                lat < -90 || lat > 90 ||
                lon < -180 || lon > 180) {
                console.warn(`Skipping invalid coordinates: lat=${lat}, lon=${lon}`);
                return;
            }

            const eleElement = trkpt.querySelector('ele');
            const timeElement = trkpt.querySelector('time');

            points.push({
                lat,
                lon,
                ele: eleElement ? parseFloat(eleElement.textContent) : null,
                time: timeElement ? new Date(timeElement.textContent) : null,
                segment: 0
            });
        });
    }

    return { name, points };
}

// Guess activity type from track name
function guessActivityType(name) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('velo') || nameLower.includes('bike') || nameLower.includes('cycling')) {
        return 'cycling';
    }
    if (nameLower.includes('rando') || nameLower.includes('hiking') || nameLower.includes('marche')) {
        return 'hiking';
    }
    return 'gravel'; // Default
}

// Calculate total distance
function calculateDistance(points) {
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
        distance += haversineDistance(
            points[i - 1].lat, points[i - 1].lon,
            points[i].lat, points[i].lon
        );
    }
    return distance;
}

// Haversine formula for distance calculation
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(degrees) {
    return degrees * Math.PI / 180;
}

// Calculate elevation gain
function calculateElevation(points) {
    let elevationGain = 0;
    for (let i = 1; i < points.length; i++) {
        if (points[i].ele && points[i - 1].ele) {
            const diff = points[i].ele - points[i - 1].ele;
            if (diff > 0) {
                elevationGain += diff;
            }
        }
    }
    return elevationGain;
}

// Calculate duration
function calculateDuration(points) {
    const firstPoint = points.find(p => p.time);
    const lastPoint = [...points].reverse().find(p => p.time);

    if (firstPoint && lastPoint && firstPoint.time && lastPoint.time) {
        return (lastPoint.time - firstPoint.time) / 1000 / 60; // minutes
    }
    return null;
}

// Detect track direction (one-way, round-trip, or loop)
function detectDirection(points) {
    if (!points || points.length < 2) {
        return 'one-way';
    }

    const start = points[0];
    const end = points[points.length - 1];

    // Calculate distance between start and end points
    const R = 6371; // Earth radius in km
    const dLat = toRad(end.lat - start.lat);
    const dLon = toRad(end.lon - start.lon);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(start.lat)) * Math.cos(toRad(end.lat)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceStartEnd = R * c * 1000; // Distance in meters

    // If start and end are close (< 100m), it's likely a loop
    if (distanceStartEnd < 100) {
        return 'loop';
    }

    // Check if it's a round trip by analyzing if the track "folds back"
    // Compare distance of first quarter vs last quarter
    const quarterLength = Math.floor(points.length / 4);
    if (quarterLength > 10) {
        const firstQuarter = points.slice(0, quarterLength);
        const lastQuarter = points.slice(-quarterLength);

        // Calculate average distance between corresponding points
        let avgDistance = 0;
        const samplesToCheck = Math.min(10, quarterLength);
        for (let i = 0; i < samplesToCheck; i++) {
            const p1 = firstQuarter[i];
            const p2 = lastQuarter[samplesToCheck - 1 - i];

            const dLat = toRad(p2.lat - p1.lat);
            const dLon = toRad(p2.lon - p1.lon);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            avgDistance += R * c * 1000;
        }
        avgDistance /= samplesToCheck;

        // If first and last quarters are close on average (< 200m), likely round-trip
        if (avgDistance < 200) {
            return 'round-trip';
        }
    }

    // Otherwise, it's a one-way track
    return 'one-way';
}

// Calculate bounds
function calculateBounds(points) {
    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    return [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)]
    ];
}

// Add track to map
function addTrackToMap(track) {
    const color = track.color || '#2563eb'; // Default blue color
    const layers = [];

    // Group points by segment to avoid straight lines between segments
    const segments = {};
    track.points.forEach(point => {
        const segmentId = point.segment || 0;
        if (!segments[segmentId]) {
            segments[segmentId] = [];
        }
        segments[segmentId].push([point.lat, point.lon]);
    });

    // Create a polyline for each segment
    Object.values(segments).forEach(segmentPoints => {
        if (segmentPoints.length < 2) return; // Skip segments with less than 2 points

        const polyline = L.polyline(segmentPoints, {
            color: color,
            weight: 6, // Increased from 4 for better touch on mobile
            opacity: 0.7
        }).addTo(state.map);

        // Add direction arrows along this segment
        const decorator = L.polylineDecorator(polyline, {
            patterns: [
                {
                    offset: '10%',
                    repeat: '15%',
                    symbol: L.Symbol.arrowHead({
                        pixelSize: 15,
                        polygon: false,
                        pathOptions: {
                            fillOpacity: 1,
                            weight: 2,
                            color: color,
                            fill: true,
                            stroke: true
                        }
                    })
                }
            ]
        }).addTo(state.map);

        // Add click handler to each segment
        polyline.on('click', () => {
            showTrackInfoModal(track);
        });

        layers.push(polyline, decorator);
    });

    // Add markers at the start and end of the track
    const displayTitle = track.title || track.name;
    const segmentArray = Object.values(segments);
    const firstSegmentPoints = segmentArray[0];
    const lastSegmentPoints = segmentArray[segmentArray.length - 1];

    // Start marker (generic location pin)
    if (firstSegmentPoints && firstSegmentPoints.length > 0) {
        const startMarker = L.marker(firstSegmentPoints[0], {
            icon: L.divIcon({
                className: 'track-info-marker',
                html: `<div class="track-info-marker-content track-start-marker" style="background-color: ${color}">
                          <span style="font-size: 18px;">📍</span>
                       </div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            })
        }).addTo(state.map);

        startMarker.on('click', () => {
            showTrackInfoModal(track);
        });

        layers.push(startMarker);
    }

    // End marker (checkered flag)
    if (lastSegmentPoints && lastSegmentPoints.length > 0) {
        const endMarker = L.marker(lastSegmentPoints[lastSegmentPoints.length - 1], {
            icon: L.divIcon({
                className: 'track-info-marker',
                html: `<div class="track-info-marker-content track-end-marker" style="background-color: ${color}">
                          <span style="font-size: 16px;">🏁</span>
                       </div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            })
        }).addTo(state.map);

        endMarker.on('click', () => {
            showTrackInfoModal(track);
        });

        layers.push(endMarker);
    }

    // Store all polylines, decorators and markers in a layer group
    const layerGroup = L.layerGroup(layers);
    state.layers.tracks[track.id] = layerGroup;
}

// Handle Photo Upload
async function handlePhotoUpload(event) {
    const files = Array.from(event.target.files);

    for (const file of files) {
        try {
            // Extract EXIF data first
            const gpsData = await extractGPSData(file);

            if (!gpsData) {
                alert(`La photo ${file.name} ne contient pas de données GPS`);
                continue;
            }

            // Upload file with metadata to server
            const formData = new FormData();
            formData.append('photo', file);
            formData.append('name', file.name);
            formData.append('latitude', gpsData.latitude.toString());
            formData.append('longitude', gpsData.longitude.toString());

            const response = await fetch(`${API_BASE_URL}/photos/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success && result.photo) {
                state.photos.push(result.photo);
                addPhotoToMap(result.photo);
            } else {
                alert('Erreur lors de l\'upload de la photo');
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            alert('Erreur lors de l\'upload de la photo');
        }
    }

    renderPhotos();

    // Close upload modal if open
    document.getElementById('uploadModal').classList.add('hidden');

    event.target.value = '';
}

// Extract GPS data from photo
function extractGPSData(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = function(e) {
            const img = new Image();
            img.src = e.target.result;

            img.onload = function() {
                EXIF.getData(img, function() {
                    const lat = EXIF.getTag(this, 'GPSLatitude');
                    const lon = EXIF.getTag(this, 'GPSLongitude');
                    const latRef = EXIF.getTag(this, 'GPSLatitudeRef');
                    const lonRef = EXIF.getTag(this, 'GPSLongitudeRef');

                    if (lat && lon) {
                        const latitude = convertDMSToDD(lat, latRef);
                        const longitude = convertDMSToDD(lon, lonRef);
                        resolve({ latitude, longitude });
                    } else {
                        resolve(null);
                    }
                });
            };
        };

        reader.readAsDataURL(file);
    });
}

// Convert GPS coordinates from DMS to Decimal Degrees
function convertDMSToDD(dms, ref) {
    const degrees = dms[0];
    const minutes = dms[1];
    const seconds = dms[2];

    let dd = degrees + minutes / 60 + seconds / 3600;

    if (ref === 'S' || ref === 'W') {
        dd = dd * -1;
    }

    return dd;
}

// Add photo to map
function addPhotoToMap(photo) {
    const icon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const photoUrl = `${BASE_URL}${photo.path}`;
    const marker = L.marker([photo.latitude, photo.longitude], { icon, photoId: photo.id })
        .bindPopup(`<h4>${photo.name}</h4><img src="${photoUrl}" style="max-width: 200px; border-radius: 4px;">`)
        .on('click', () => showPhotoModal(photo));

    state.layers.photos.addLayer(marker);
}

// Show photo modal
let currentPhotoId = null;

function showPhotoModal(photo) {
    currentPhotoId = photo.id;
    const photoUrl = `${BASE_URL}${photo.path}`;
    document.getElementById('modalImage').src = photoUrl;
    document.getElementById('modalPhotoName').textContent = photo.name;
    document.getElementById('modalPhotoLocation').textContent =
        `Coordonnées: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`;
    document.getElementById('photoModal').classList.remove('hidden');
}

// Handle photo deletion
async function handlePhotoDelete() {
    if (!currentPhotoId) return;

    if (!confirm('Êtes-vous sûr de vouloir supprimer cette photo ?')) {
        return;
    }

    try {
        // Find the photo to get its filename
        const photo = state.photos.find(p => p.id === currentPhotoId);
        if (!photo) {
            alert('Photo introuvable');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/photos/${photo.filename}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            // Remove photo from state
            state.photos = state.photos.filter(p => p.id !== currentPhotoId);

            // Remove photo marker from map
            state.layers.photos.eachLayer(layer => {
                if (layer.options.photoId === currentPhotoId) {
                    state.layers.photos.removeLayer(layer);
                }
            });

            // Close modal
            document.getElementById('photoModal').classList.add('hidden');
            currentPhotoId = null;

            alert('Photo supprimée avec succès');
        } else {
            alert('Erreur lors de la suppression de la photo');
        }
    } catch (error) {
        console.error('Error deleting photo:', error);
        alert('Erreur lors de la suppression de la photo');
    }
}

// Show track info modal
function showTrackInfoModal(track) {
    const displayTitle = track.title || track.name;
    const typeIcon = getTypeIcon(track.type);

    document.getElementById('trackInfoTitleText').textContent = `${typeIcon} ${displayTitle}`;
    document.getElementById('trackInfoDistance').textContent = formatDistance(track.distance);
    document.getElementById('trackInfoElevation').textContent = formatElevation(track.elevation);
    document.getElementById('trackInfoDuration').textContent = formatDuration(track.duration);
    // Display completion status
    if (track.completedAt) {
        const date = new Date(track.completedAt);
        const formattedDate = date.toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById('trackInfoCompleted').textContent = `✅ Le ${formattedDate}`;
    } else {
        document.getElementById('trackInfoCompleted').textContent = 'A faire !';
    }

    // Show/hide labels section
    const labelsContainer = document.getElementById('trackInfoLabelsContainer');
    if (track.labels && Array.isArray(track.labels) && track.labels.length > 0) {
        const labelsHtml = track.labels.map(trackLabel =>
            `<span class="label-tag">${trackLabel.label.name}</span>`
        ).join('');
        document.getElementById('trackInfoLabels').innerHTML = labelsHtml;
        labelsContainer.style.display = 'block';
    } else {
        labelsContainer.style.display = 'none';
    }

    // Show/hide comments section
    const commentsContainer = document.getElementById('trackInfoCommentsContainer');
    if (track.comments && track.comments.trim()) {
        document.getElementById('trackInfoComments').textContent = track.comments;
        commentsContainer.style.display = 'block';
    } else {
        commentsContainer.style.display = 'none';
    }

    // Store track ID in edit and download buttons
    document.getElementById('editTrackFromInfo').dataset.trackId = track.id;
    document.getElementById('downloadTrackFromInfo').dataset.trackId = track.id;

    // Show modal
    document.getElementById('trackInfoModal').classList.remove('hidden');

    // Initialize or reset track detail map
    setTimeout(() => {
        const mapContainer = document.getElementById('trackDetailMap');

        // Clear existing map if any
        if (state.trackDetailMap) {
            state.trackDetailMap.remove();
            state.trackDetailMap = null;
        }

        // Create new map
        state.trackDetailMap = L.map('trackDetailMap', {
            zoomControl: false
        });

        // Add tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(state.trackDetailMap);

        // Draw the track on the detail map
        const color = track.color || '#2563eb';

        // Group points by segment
        const segments = {};
        track.points.forEach(point => {
            const segmentId = point.segment || 0;
            if (!segments[segmentId]) {
                segments[segmentId] = [];
            }
            segments[segmentId].push([point.lat, point.lon]);
        });

        // Draw each segment
        Object.values(segments).forEach(segmentPoints => {
            if (segmentPoints.length < 2) return;

            const polyline = L.polyline(segmentPoints, {
                color: color,
                weight: 4,
                opacity: 0.7
            }).addTo(state.trackDetailMap);

            // Add direction arrows
            L.polylineDecorator(polyline, {
                patterns: [{
                    offset: '10%',
                    repeat: '15%',
                    symbol: L.Symbol.arrowHead({
                        pixelSize: 12,
                        polygon: false,
                        pathOptions: {
                            fillOpacity: 1,
                            weight: 2,
                            color: color
                        }
                    })
                }]
            }).addTo(state.trackDetailMap);
        });

        // Add start and end markers
        const segmentArray = Object.values(segments);
        const firstSegmentPoints = segmentArray[0];
        const lastSegmentPoints = segmentArray[segmentArray.length - 1];

        if (firstSegmentPoints && firstSegmentPoints.length > 0) {
            L.marker(firstSegmentPoints[0], {
                icon: L.divIcon({
                    className: 'track-info-marker',
                    html: `<div class="track-info-marker-content track-start-marker" style="background-color: ${color}">
                              <span style="font-size: 18px;">📍</span>
                           </div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            }).addTo(state.trackDetailMap);
        }

        if (lastSegmentPoints && lastSegmentPoints.length > 0) {
            L.marker(lastSegmentPoints[lastSegmentPoints.length - 1], {
                icon: L.divIcon({
                    className: 'track-info-marker',
                    html: `<div class="track-info-marker-content track-end-marker" style="background-color: ${color}">
                              <span style="font-size: 16px;">🏁</span>
                           </div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            }).addTo(state.trackDetailMap);
        }

        // Force map to recalculate size (needed when container was hidden)
        state.trackDetailMap.invalidateSize();

        // Fit bounds to show entire track
        state.trackDetailMap.fitBounds(track.bounds, { padding: [30, 30] });

        // Setup expand/collapse button
        const expandBtn = document.getElementById('expandMapBtn');
        const mapElement = document.getElementById('trackDetailMap');

        // Remove existing event listeners
        const newExpandBtn = expandBtn.cloneNode(true);
        expandBtn.parentNode.replaceChild(newExpandBtn, expandBtn);

        // Add new event listener
        newExpandBtn.addEventListener('click', () => {
            mapElement.classList.toggle('expanded');

            // Update button icon and title
            if (mapElement.classList.contains('expanded')) {
                newExpandBtn.textContent = '⤡';
                newExpandBtn.title = 'Réduire la carte';
            } else {
                newExpandBtn.textContent = '⤢';
                newExpandBtn.title = 'Agrandir la carte';
            }

            // Refresh map after animation
            setTimeout(() => {
                if (state.trackDetailMap) {
                    state.trackDetailMap.invalidateSize();
                    state.trackDetailMap.fitBounds(track.bounds, { padding: [30, 30] });
                }
            }, 300);
        });
    }, 200); // Delay to ensure modal is visible and rendered
}

// Close track info modal
function closeTrackInfoModal() {
    document.getElementById('trackInfoModal').classList.add('hidden');

    // Remove expanded class from map
    const mapElement = document.getElementById('trackDetailMap');
    mapElement.classList.remove('expanded');

    // Clean up track detail map
    if (state.trackDetailMap) {
        state.trackDetailMap.remove();
        state.trackDetailMap = null;
    }
}

// Render tracks list (simplified - no sidebar)
function renderTracks() {
    // No sidebar to render anymore
}

// Get icon for track type
function getTypeIcon(type) {
    const icons = {
        'hiking': '🥾',
        'cycling': '🚴',
        'gravel': '🚵'
    };
    return icons[type] || '🥾';
}

// Render photos list (simplified - no sidebar)
function renderPhotos() {
    // No sidebar to render anymore
}

// Focus on track
function focusTrack(trackId) {
    const track = state.tracks.find(t => t.id.toString() === trackId.toString());
    if (track && state.layers.tracks[track.id]) {
        state.map.fitBounds(track.bounds, { padding: [50, 50] });
        showTrackInfoModal(track);
    }
}

// Download track GPX file
function downloadTrack(trackId) {
    const track = state.tracks.find(t => t.id.toString() === trackId.toString());
    if (track && track.filename) {
        // Create a download link to the GPX file
        const downloadUrl = `${API_BASE_URL}/gpx/${track.filename}`;

        // Create a temporary anchor element and trigger download
        const link = document.createElement('a');
        link.href = `/uploads/gpx/${track.filename}`;
        link.download = track.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Change track color
async function changeTrackColor(trackId, newColor) {
    const track = state.tracks.find(t => t.id.toString() === trackId.toString());
    if (track) {
        try {
            // Update on server
            const response = await fetch(`${API_BASE_URL}/gpx/${track.filename}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ color: newColor })
            });

            const result = await response.json();

            if (result.success) {
                track.color = newColor;

                // Remove old layer and recreate with new color
                const layerGroup = state.layers.tracks[track.id];
                if (layerGroup) {
                    state.map.removeLayer(layerGroup);
                    delete state.layers.tracks[track.id];
                    addTrackToMap(track);
                }
            }
        } catch (error) {
            console.error('Error updating track color:', error);
            alert('Erreur lors de la mise à jour de la couleur');
        }
    }
}

// Delete track
async function deleteTrack(trackId) {
    if (confirm('Voulez-vous vraiment supprimer cette trace ?')) {
        const track = state.tracks.find(t => t.id.toString() === trackId.toString());

        if (track) {
            try {
                // Delete from server
                if (track.filename) {
                    await fetch(`${API_BASE_URL}/gpx/${track.filename}`, {
                        method: 'DELETE'
                    });
                }

                // Remove from map
                if (state.layers.tracks[track.id]) {
                    state.map.removeLayer(state.layers.tracks[track.id]);
                    delete state.layers.tracks[track.id];
                }

                // Remove from state
                state.tracks = state.tracks.filter(t => t.id.toString() !== trackId.toString());


                renderTracks();
            } catch (error) {
                console.error('Error deleting track:', error);
                alert('Erreur lors de la suppression de la trace');
            }
        }
    }
}


// Clear all data
async function handleClearAll() {
    if (confirm('Voulez-vous vraiment effacer toutes les traces et photos ?')) {
        try {
            // Delete all tracks from server
            for (const track of state.tracks) {
                if (track.filename) {
                    await fetch(`${API_BASE_URL}/gpx/${track.filename}`, {
                        method: 'DELETE'
                    });
                }
            }

            // Delete all photos from server
            for (const photo of state.photos) {
                if (photo.filename) {
                    await fetch(`${API_BASE_URL}/photos/${photo.filename}`, {
                        method: 'DELETE'
                    });
                }
            }

            // Remove all layers
            Object.values(state.layers.tracks).forEach(layer => {
                state.map.removeLayer(layer);
            });
            state.layers.photos.clearLayers();

            // Clear state
            state.tracks = [];
            state.photos = [];
            state.layers.tracks = {};

            renderTracks();
            renderPhotos();

            document.getElementById('trackInfo').classList.add('hidden');
        } catch (error) {
            console.error('Error clearing all data:', error);
            alert('Erreur lors de la suppression des données');
        }
    }
}

// Format helpers
function formatDistance(km) {
    return km >= 1 ? `${km.toFixed(2)} km` : `${(km * 1000).toFixed(0)} m`;
}

function formatElevation(m) {
    return m ? `+${Math.round(m)} m` : 'N/A';
}

function formatDuration(minutes) {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
}

// Load tracks from server
async function loadTracksFromServer(retryCount = 0) {
    try {
        console.log('Loading tracks from:', API_BASE_URL);
        const response = await fetch(`${API_BASE_URL}/gpx/list`);

        if (!response.ok) {
            // Retry once on first load before showing error (handles PWA first-load race condition)
            if (retryCount === 0) {
                console.log('First load failed, retrying in 1 second...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                return loadTracksFromServer(1);
            }
            console.error('Failed to fetch tracks:', response.status, response.statusText);
            alert(`Erreur lors du chargement des traces: ${response.status}`);
            return;
        }

        const result = await response.json();
        console.log('Tracks loaded:', result);

        if (result.success && result.tracks && result.tracks.length > 0) {
            console.log(`📍 Loading ${result.tracks.length} tracks from database...`);
            for (const trackData of result.tracks) {
                console.log(`📄 Loading GPX file: ${trackData.filename}`);
                // Get GPX content
                const contentResponse = await fetch(`${API_BASE_URL}/gpx/${trackData.filename}`);

                // Skip if file not found (happens when volume is not persistent)
                if (!contentResponse.ok) {
                    console.error(`❌ GPX file not found: ${trackData.filename} (status: ${contentResponse.status})`);
                    console.error(`   URL attempted: ${API_BASE_URL}/gpx/${trackData.filename}`);
                    continue;
                }
                console.log(`✅ GPX file loaded: ${trackData.filename}`);

                const contentResult = await contentResponse.json();

                if (contentResult.success) {
                    const gpxData = parseGPX(contentResult.content);

                    if (gpxData) {
                        const track = {
                            ...trackData,
                            points: gpxData.points,
                            bounds: calculateBounds(gpxData.points)
                        };

                        state.tracks.push(track);
                        addTrackToMap(track);
                    }
                }
            }
        }

        renderTracks();
    } catch (error) {
        // Retry once on first load before showing error (handles PWA first-load race condition)
        if (retryCount === 0) {
            console.log('First load error, retrying in 1 second...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            return loadTracksFromServer(1);
        }
        console.error('Error loading tracks from server:', error);
        alert(`Erreur lors du chargement des traces: ${error.message}`);
    }
}

// Load photos from server
async function loadPhotosFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/photos/list`);
        const result = await response.json();

        if (result.success && result.photos && result.photos.length > 0) {
            state.photos = result.photos;
            result.photos.forEach(photo => {
                addPhotoToMap(photo);
            });
        }

        renderPhotos();
    } catch (error) {
        console.error('Error loading photos from server:', error);
    }
}

// Load labels from server
async function loadLabelsFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/labels/list`);
        const result = await response.json();

        if (result.success && result.labels) {
            state.labels = result.labels.map(label => label.name).sort();
        }
    } catch (error) {
        console.error('Error loading labels from server:', error);
    }
}

// Edit track - open modal
let currentEditingTrackId = null;
let currentTrackLabels = [];

// Get all unique labels from database
function getAllExistingLabels() {
    return state.labels;
}

function editTrack(trackId) {
    const track = state.tracks.find(t => t.id.toString() === trackId.toString());
    if (!track) return;

    currentEditingTrackId = trackId;

    // Fill form with current values
    // If title is empty, pre-fill with GPX name if available
    document.getElementById('editTrackTitle').value = track.title || track.name || '';
    document.getElementById('editTrackType').value = track.type || 'gravel';
    document.getElementById('editTrackColor').value = track.color || '#2563eb';
    document.getElementById('editTrackComments').value = track.comments || '';

    // Set completed date (format: YYYY-MM-DD for input type="date")
    if (track.completedAt) {
        const date = new Date(track.completedAt);
        document.getElementById('editTrackCompletedAt').value = date.toISOString().split('T')[0];
    } else {
        document.getElementById('editTrackCompletedAt').value = '';
    }

    // Load labels from new structure
    currentTrackLabels = [];
    if (track.labels && Array.isArray(track.labels)) {
        currentTrackLabels = track.labels.map(trackLabel => trackLabel.label.name);
    }
    renderLabels();
    renderLabelSuggestions();

    // Display track photos
    displayTrackPhotos(track);

    // Show modal
    document.getElementById('trackEditModal').classList.remove('hidden');
}

// Display photos for a track
function displayTrackPhotos(track) {
    const container = document.getElementById('trackPhotosContainer');

    if (!track.photos || track.photos.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;">Aucune photo associée</p>';
        return;
    }

    container.innerHTML = track.photos.map(photo => `
        <div class="track-photo-item">
            <img src="${BASE_URL}${photo.path}" alt="${photo.name}" data-photo='${JSON.stringify(photo)}'>
            <button class="delete-photo" data-photo-id="${photo.id}" title="Supprimer">×</button>
        </div>
    `).join('');

    // Attach event listeners to photo images
    container.querySelectorAll('.track-photo-item img').forEach(img => {
        img.addEventListener('click', () => {
            const photo = JSON.parse(img.dataset.photo);
            showPhotoModal(photo);
        });
    });

    // Attach event listeners to delete buttons
    container.querySelectorAll('.delete-photo').forEach(button => {
        button.addEventListener('click', () => {
            const photoId = button.dataset.photoId;
            deleteTrackPhoto(photoId);
        });
    });
}

// Close track edit modal
function closeTrackEditModal() {
    document.getElementById('trackEditModal').classList.add('hidden');
    currentEditingTrackId = null;
    currentTrackLabels = [];
}

// Add label
function addLabel(labelText = null) {
    const input = document.getElementById('newLabel');

    // Check if labelText is an event object (from button click) or actual text
    let label;
    if (labelText && typeof labelText === 'string') {
        label = labelText.trim();
    } else {
        label = input.value.trim();
    }

    if (label && !currentTrackLabels.includes(label)) {
        currentTrackLabels.push(label);
        renderLabels();
        renderLabelSuggestions();
        // Only clear input if we got the value from the input field
        if (!labelText || typeof labelText !== 'string') {
            input.value = '';
        }
    }
}

// Remove label
function removeLabel(index) {
    currentTrackLabels.splice(index, 1);
    renderLabels();
    renderLabelSuggestions();
}

// Render labels
function renderLabels() {
    const container = document.getElementById('labelsDisplay');

    if (currentTrackLabels.length === 0) {
        container.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.9rem;">Aucun libellé</span>';
        return;
    }

    container.innerHTML = currentTrackLabels.map((label, index) => `
        <span class="label-tag">
            ${label}
            <button type="button" class="label-tag-remove" data-index="${index}" title="Supprimer">×</button>
        </span>
    `).join('');

    // Attach event listeners to remove buttons
    container.querySelectorAll('.label-tag-remove').forEach(button => {
        button.addEventListener('click', () => {
            const index = parseInt(button.dataset.index);
            removeLabel(index);
        });
    });
}

// Render label suggestions
function renderLabelSuggestions() {
    const container = document.getElementById('labelsSuggestionsContainer');
    const existingLabels = getAllExistingLabels();

    if (existingLabels.length === 0) {
        container.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.85rem;">Aucun libellé existant</span>';
        return;
    }

    container.innerHTML = existingLabels.map(label => {
        const isAlreadyAdded = currentTrackLabels.includes(label);
        const disabledClass = isAlreadyAdded ? ' disabled' : '';

        return `<span class="label-suggestion${disabledClass}" data-label="${label.replace(/"/g, '&quot;')}">${label}</span>`;
    }).join('');

    // Attach event listeners to suggestion buttons
    container.querySelectorAll('.label-suggestion:not(.disabled)').forEach(span => {
        span.addEventListener('click', () => {
            const label = span.dataset.label;
            addLabel(label);
        });
    });
}

// Handle track edit form submission
async function handleTrackEdit(event) {
    event.preventDefault();

    if (!currentEditingTrackId) return;

    const track = state.tracks.find(t => t.id.toString() === currentEditingTrackId.toString());
    if (!track) return;

    const title = document.getElementById('editTrackTitle').value;
    const type = document.getElementById('editTrackType').value;
    const color = document.getElementById('editTrackColor').value;
    const comments = document.getElementById('editTrackComments').value;
    const completedAt = document.getElementById('editTrackCompletedAt').value; // YYYY-MM-DD or empty string
    const labels = currentTrackLabels; // Send as array instead of comma-separated string

    try {
        const response = await fetch(`${API_BASE_URL}/gpx/${track.filename}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title || null,
                type: type,
                color: color,
                comments: comments || null,
                completedAt: completedAt || null,
                labels: labels // Send array of label names
            })
        });

        const result = await response.json();

        if (result.success) {
            // Update local state with ALL fields from server response
            Object.assign(track, result.track);

            // Reload labels list (new labels may have been added)
            await loadLabelsFromServer();

            // Redraw the track on the map with new color
            if (state.layers.tracks[track.id]) {
                // Remove old layer from map
                state.layers.tracks[track.id].clearLayers();
                state.map.removeLayer(state.layers.tracks[track.id]);
                delete state.layers.tracks[track.id];

                // Redraw with new color
                addTrackToMap(track);
            }

            // Re-render tracks list
            renderTracks();

            // Close modal
            closeTrackEditModal();

            alert('Trace mise à jour avec succès !');
        } else {
            alert('Erreur lors de la mise à jour de la trace');
        }
    } catch (error) {
        console.error('Error updating track:', error);
        alert('Erreur lors de la mise à jour de la trace');
    }
}

// Handle track deletion
async function handleTrackDelete() {
    if (!currentEditingTrackId) return;

    const track = state.tracks.find(t => t.id.toString() === currentEditingTrackId.toString());
    if (!track) return;

    // Confirm deletion
    const confirmed = confirm(
        `Êtes-vous sûr de vouloir supprimer la trace "${track.title || track.name}" ?\n\n` +
        `Cela supprimera :\n` +
        `- Le fichier GPX\n` +
        `- Toutes les données de la base de données\n` +
        `- Toutes les photos associées\n\n` +
        `Cette action est irréversible.`
    );

    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE_URL}/gpx/${track.filename}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            // Remove track from state
            state.tracks = state.tracks.filter(t => t.id !== track.id);

            // Remove track from map
            if (state.layers.tracks[track.id]) {
                state.map.removeLayer(state.layers.tracks[track.id]);
                delete state.layers.tracks[track.id];
            }

            // Re-render
            renderTracks();
            if (state.currentView === 'list') {
                renderListView();
            }

            // Close modal
            closeTrackEditModal();

            alert('Trace supprimée avec succès !');
        } else {
            alert('Erreur lors de la suppression de la trace');
        }
    } catch (error) {
        console.error('Error deleting track:', error);
        alert('Erreur lors de la suppression de la trace');
    }
}

// Handle adding photos to a track
async function handleAddTrackPhotos(event) {
    if (!currentEditingTrackId) {
        alert('Erreur: Aucune trace sélectionnée');
        return;
    }

    const files = Array.from(event.target.files);
    const track = state.tracks.find(t => t.id.toString() === currentEditingTrackId.toString());

    if (!track) return;

    for (const file of files) {
        try {
            // Extract GPS data from photo
            const gpsData = await extractGPSData(file);

            if (!gpsData) {
                alert(`La photo ${file.name} ne contient pas de données GPS`);
                continue;
            }

            // Upload photo with trackId
            const formData = new FormData();
            formData.append('photo', file);
            formData.append('name', file.name);
            formData.append('latitude', gpsData.latitude.toString());
            formData.append('longitude', gpsData.longitude.toString());
            formData.append('trackId', track.id);

            const response = await fetch(`${API_BASE_URL}/photos/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Add photo to track in state
                if (!track.photos) {
                    track.photos = [];
                }
                track.photos.push(result.photo);

                // Add photo to map
                addPhotoToMap(result.photo);

                // Update photos list
                state.photos.push(result.photo);
                renderPhotos();

                // Refresh track photos display
                displayTrackPhotos(track);

                alert(`Photo ${file.name} ajoutée avec succès !`);
            } else {
                alert(`Erreur lors de l'ajout de la photo ${file.name}`);
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            alert(`Erreur lors de l'ajout de la photo ${file.name}`);
        }
    }

    // Reset input
    event.target.value = '';
}

// Delete a photo from a track
async function deleteTrackPhoto(photoId) {
    if (!confirm('Supprimer cette photo ?')) return;

    const photo = state.photos.find(p => p.id === photoId);
    if (!photo) return;

    try {
        const response = await fetch(`${API_BASE_URL}/photos/${photo.filename}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            // Remove from state
            state.photos = state.photos.filter(p => p.id !== photoId);

            // Remove from track
            const track = state.tracks.find(t => t.id.toString() === currentEditingTrackId.toString());
            if (track && track.photos) {
                track.photos = track.photos.filter(p => p.id !== photoId);
                displayTrackPhotos(track);
            }

            // Remove from map
            state.layers.photos.eachLayer(layer => {
                if (layer.options && layer.options.photoId === photoId) {
                    state.layers.photos.removeLayer(layer);
                }
            });

            renderPhotos();
            alert('Photo supprimée avec succès');
        } else {
            alert('Erreur lors de la suppression de la photo');
        }
    } catch (error) {
        console.error('Error deleting photo:', error);
        alert('Erreur lors de la suppression de la photo');
    }
}

// Switch between Map and List views
function switchView(view) {
    state.currentView = view;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Update view containers
    document.getElementById('mapView').classList.toggle('active', view === 'map');
    document.getElementById('listView').classList.toggle('active', view === 'list');

    // Refresh map if switching to map view
    if (view === 'map' && state.map) {
        setTimeout(() => state.map.invalidateSize(), 100);
    }

    // Render list view if switching to list
    if (view === 'list') {
        renderListView();
    }
}

// Render list view
function renderListView() {
    const container = document.getElementById('tracksListDetailed');

    // Filter and search tracks
    let filteredTracks = state.tracks.filter(track => {
        const matchesFilter = state.currentFilter === 'all' || track.type === state.currentFilter;
        const matchesSearch = !state.searchTerm ||
            (track.title && track.title.toLowerCase().includes(state.searchTerm)) ||
            track.name.toLowerCase().includes(state.searchTerm) ||
            (track.comments && track.comments.toLowerCase().includes(state.searchTerm));
        return matchesFilter && matchesSearch;
    });

    if (filteredTracks.length === 0) {
        container.innerHTML = '<p class="empty-state">Aucune trace trouvée</p>';
        return;
    }

    container.innerHTML = filteredTracks.map(track => {
        const typeIcon = getTypeIcon(track.type);
        const displayTitle = track.title || track.name;
        const photosHtml = track.photos && track.photos.length > 0
            ? `<div class="track-card-photos">
                ${track.photos.slice(0, 5).map(photo =>
                    `<img src="${BASE_URL}${photo.path}"
                         alt="${photo.name}"
                         class="track-card-photo"
                         data-photo='${JSON.stringify(photo)}'>`
                ).join('')}
                ${track.photos.length > 5 ? `<span style="color: var(--text-secondary); font-size: 0.9rem;">+${track.photos.length - 5} photos</span>` : ''}
               </div>`
            : '';

        return `
            <div class="track-card" data-track-id="${track.id}">
                <div class="track-card-header">
                    <div class="track-card-title">
                        <h3>${typeIcon} ${displayTitle}</h3>
                        <div class="track-card-subtitle">${track.name}</div>
                    </div>
                    <input type="color"
                           value="${track.color}"
                           class="track-card-color"
                           data-track-id="${track.id}">
                </div>

                ${track.comments ? `<div class="track-card-comments">${track.comments}</div>` : ''}

                <div class="track-card-stats">
                    <div class="track-card-stat">
                        <div class="track-card-stat-label">Distance</div>
                        <div class="track-card-stat-value">${formatDistance(track.distance)}</div>
                    </div>
                    <div class="track-card-stat">
                        <div class="track-card-stat-label">Dénivelé</div>
                        <div class="track-card-stat-value">${formatElevation(track.elevation)}</div>
                    </div>
                    ${track.duration ? `
                    <div class="track-card-stat">
                        <div class="track-card-stat-label">Durée</div>
                        <div class="track-card-stat-value">${formatDuration(track.duration)}</div>
                    </div>
                    ` : ''}
                    ${track.photos ? `
                    <div class="track-card-stat">
                        <div class="track-card-stat-label">Photos</div>
                        <div class="track-card-stat-value">${track.photos.length}</div>
                    </div>
                    ` : ''}
                </div>

                ${photosHtml}

                <div class="track-card-actions">
                    <button class="btn btn-primary btn-small track-focus-btn">
                        🗺️ Voir sur la carte
                    </button>
                    <button class="btn btn-secondary btn-small track-edit-btn">
                        ✏️ Éditer
                    </button>
                    <button class="btn btn-danger btn-small track-delete-btn">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Attach event listeners to photos
    container.querySelectorAll('.track-card-photo').forEach(img => {
        img.addEventListener('click', () => {
            const photo = JSON.parse(img.dataset.photo);
            showPhotoModal(photo);
        });
    });

    // Attach event listeners to color inputs
    container.querySelectorAll('.track-card-color').forEach(input => {
        input.addEventListener('change', (e) => {
            const trackId = input.dataset.trackId;
            changeTrackColor(trackId, e.target.value);
        });
    });

    // Attach event listeners to action buttons
    container.querySelectorAll('.track-card').forEach(card => {
        const trackId = card.dataset.trackId;

        card.querySelector('.track-focus-btn')?.addEventListener('click', () => {
            focusTrackFromList(trackId);
        });

        card.querySelector('.track-edit-btn')?.addEventListener('click', () => {
            editTrack(trackId);
        });

        card.querySelector('.track-delete-btn')?.addEventListener('click', () => {
            deleteTrack(trackId);
        });
    });
}

// Focus track from list view
function focusTrackFromList(trackId) {
    // Switch to map view
    switchView('map');

    // Focus on the track
    setTimeout(() => focusTrack(trackId), 200);
}

// Show labels management modal
async function showLabelsManagementModal() {
    document.getElementById('labelsManagementModal').classList.remove('hidden');
    await loadAndDisplayLabelsManagement();
}

// Close labels management modal
function closeLabelsManagementModal() {
    document.getElementById('labelsManagementModal').classList.add('hidden');
}

// Load and display labels in management modal
async function loadAndDisplayLabelsManagement() {
    try {
        const response = await fetch(`${API_BASE_URL}/labels/list`);
        const result = await response.json();

        if (result.success && result.labels) {
            const container = document.getElementById('labelsManagementList');

            if (result.labels.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Aucun libellé pour le moment</p>';
                return;
            }

            container.innerHTML = result.labels.map(label => `
                <div class="label-management-item">
                    <div class="label-management-info">
                        <span class="label-management-name">${label.name}</span>
                        <span class="label-management-count">${label.trackCount} trace${label.trackCount > 1 ? 's' : ''}</span>
                    </div>
                    <div class="label-management-actions">
                        <button class="btn btn-danger btn-small" data-label-id="${label.id}" data-label-name="${label.name}">Supprimer</button>
                    </div>
                </div>
            `).join('');

            // Attach event listeners to delete buttons
            container.querySelectorAll('.btn-danger').forEach(button => {
                button.addEventListener('click', async () => {
                    const labelId = button.dataset.labelId;
                    const labelName = button.dataset.labelName;
                    await deleteLabel(labelId, labelName);
                });
            });
        }
    } catch (error) {
        console.error('Error loading labels:', error);
        alert('Erreur lors du chargement des libellés');
    }
}

// Delete a label
async function deleteLabel(labelId, labelName) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le libellé "${labelName}" ?\nIl sera retiré de toutes les traces associées.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/labels/${labelId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            // Reload labels management list
            await loadAndDisplayLabelsManagement();

            // Reload labels from server to update suggestions
            await loadLabelsFromServer();

            // Reload tracks to update their labels
            state.tracks = [];
            Object.values(state.layers.tracks).forEach(layers => {
                layers.forEach(layer => state.map.removeLayer(layer));
            });
            state.layers.tracks = {};
            await loadTracksFromServer();
        } else {
            alert('Erreur lors de la suppression du libellé');
        }
    } catch (error) {
        console.error('Error deleting label:', error);
        alert('Erreur lors de la suppression du libellé');
    }
}

// Track Types Management

// Load and display track types
async function loadAndDisplayTrackTypes() {
    try {
        const response = await fetch(`${API_BASE_URL}/track-types/list`);
        const result = await response.json();

        if (result.success && result.trackTypes) {
            const container = document.getElementById('trackTypesManagementList');

            if (result.trackTypes.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Aucun type de trace</p>';
                return;
            }

            container.innerHTML = result.trackTypes.map(type => `
                <div class="label-management-item">
                    <div class="label-management-info">
                        <span class="label-management-name">${type.icon} ${type.label}</span>
                        <span class="label-management-count">Valeur: ${type.value}</span>
                    </div>
                    <div class="label-management-actions">
                        <button class="btn btn-secondary btn-small" data-type-id="${type.id}" data-type='${JSON.stringify(type)}'>Modifier</button>
                    </div>
                </div>
            `).join('');

            // Attach event listeners
            container.querySelectorAll('.btn-secondary').forEach(button => {
                button.addEventListener('click', () => {
                    const type = JSON.parse(button.dataset.type);
                    showEditTrackTypeForm(type);
                });
            });
        }
    } catch (error) {
        console.error('Error loading track types:', error);
        alert('Erreur lors du chargement des types');
    }
}

// Show add track type form
function showAddTrackTypeForm() {
    const value = prompt('Valeur du type (ex: mtb):');
    if (!value) return;

    const label = prompt('Libellé (ex: VTT):');
    if (!label) return;

    const icon = prompt('Icône emoji (ex: 🚵):');
    if (!icon) return;

    createTrackType(value, label, icon);
}

// Show edit track type form
function showEditTrackTypeForm(type) {
    const label = prompt('Nouveau libellé:', type.label);
    if (!label) return;

    const icon = prompt('Nouvelle icône emoji:', type.icon);
    if (!icon) return;

    updateTrackType(type.id, type.value, label, icon, type.order);
}

// Create a new track type
async function createTrackType(value, label, icon) {
    try {
        const response = await fetch(`${API_BASE_URL}/track-types`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value, label, icon })
        });

        const result = await response.json();

        if (result.success) {
            await loadAndDisplayTrackTypes();
            alert('Type créé avec succès !');
        } else {
            alert('Erreur lors de la création du type');
        }
    } catch (error) {
        console.error('Error creating track type:', error);
        alert('Erreur lors de la création du type');
    }
}

// Update a track type
async function updateTrackType(id, value, label, icon, order) {
    try {
        const response = await fetch(`${API_BASE_URL}/track-types/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value, label, icon, order })
        });

        const result = await response.json();

        if (result.success) {
            await loadAndDisplayTrackTypes();
            alert('Type mis à jour avec succès !');
        } else {
            alert('Erreur lors de la mise à jour du type');
        }
    } catch (error) {
        console.error('Error updating track type:', error);
        alert('Erreur lors de la mise à jour du type');
    }
}
