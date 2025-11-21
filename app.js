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
    trackTypes: [], // All available track types
    layers: {
        tracks: {},
        photos: null // Will be initialized when Leaflet is ready
    },
    currentFilter: 'all',
    currentView: 'map',
    searchTerm: '',
    filters: {
        display: 'recent', // 'recent', 'all'
        completion: 'all', // 'all', 'completed', 'todo'
        labels: [] // Array of selected label IDs
    }
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    // Check if this is a shared link
    const urlParams = new URLSearchParams(window.location.search);
    const sharedTrackId = urlParams.get('track');

    if (sharedTrackId) {
        // Shared link mode: only load what's needed for the track detail
        // Hide the main map view
        document.getElementById('mapView').style.display = 'none';

        attachEventListeners();
        await loadTrackTypesFromServer();
        await loadLabelsFromServer();

        // Load only the specific track
        await loadSingleTrack(sharedTrackId);

        // Load photos for this track
        await loadPhotosFromServer();

        // Open the track detail modal
        checkForSharedTrack();
    } else {
        // Normal mode: load everything
        initMap();
        attachEventListeners();
        await loadTrackTypesFromServer();
        await loadLabelsFromServer();
        await loadTracksFromServer();
        await loadPhotosFromServer();
    }
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

    // Share track button
    document.getElementById('shareTrackBtn').addEventListener('click', () => {
        const trackId = document.getElementById('shareTrackBtn').dataset.trackId;
        shareTrack(trackId);
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
    document.getElementById('closeTrackTypeFormModal').addEventListener('click', closeTrackTypeFormModal);
    document.getElementById('cancelTrackTypeForm').addEventListener('click', closeTrackTypeFormModal);
    document.getElementById('trackTypeForm').addEventListener('submit', handleTrackTypeFormSubmit);
    document.getElementById('trackTypeFormModal').addEventListener('click', (e) => {
        if (e.target.id === 'trackTypeFormModal') {
            closeTrackTypeFormModal();
        }
    });

    // FAB button - trigger GPX upload directly
    document.getElementById('fabButton').addEventListener('click', () => {
        document.getElementById('gpxUploadFab').click();
    });

    // Filter button
    document.getElementById('filterButton').addEventListener('click', showFilterModal);
    document.getElementById('closeFilterModal').addEventListener('click', closeFilterModal);
    document.getElementById('filterModal').addEventListener('click', (e) => {
        if (e.target.id === 'filterModal') {
            closeFilterModal();
        }
    });
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);

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

// Global function to expand photo in track detail view
window.expandTrackPhoto = function(photoId, trackId) {
    const photo = state.photos.find(p => p.id === photoId);
    if (!photo) return;

    // Get all photos for this track
    const trackPhotos = state.photos.filter(p => p.trackId === (trackId || photo.trackId));
    const currentIndex = trackPhotos.findIndex(p => p.id === photoId);

    const photoUrl = `${BASE_URL}${photo.path}`;
    const trackDetailMap = document.getElementById('trackDetailMap');

    // Create expanded photo overlay
    const overlay = document.createElement('div');
    overlay.id = 'expandedPhotoOverlay';
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.9);
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    `;

    // Show navigation buttons only if there are multiple photos
    const navigationButtons = trackPhotos.length > 1 ? `
        <button id="prevPhotoBtn" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.3); border: none; border-radius: 4px; padding: 12px 16px; cursor: pointer; font-size: 24px; z-index: 2001; color: white; backdrop-filter: blur(8px);" title="Photo précédente">‹</button>
        <button id="nextPhotoBtn" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.3); border: none; border-radius: 4px; padding: 12px 16px; cursor: pointer; font-size: 24px; z-index: 2001; color: white; backdrop-filter: blur(8px);" title="Photo suivante">›</button>
        <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); background: rgba(255,255,255,0.3); border-radius: 4px; padding: 8px 12px; font-size: 14px; z-index: 2001; color: white; backdrop-filter: blur(8px);">${currentIndex + 1} / ${trackPhotos.length}</div>
    ` : '';

    overlay.innerHTML = `
        <img id="expandedPhotoImg" src="${photoUrl}" style="max-width: 95%; max-height: 95%; object-fit: contain; border-radius: 8px;">
        <button id="closePhotoBtn" style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.3); border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; font-size: 20px; z-index: 2001; color: white; backdrop-filter: blur(8px);" title="Fermer">✕</button>
        ${navigationButtons}
    `;

    overlay.onclick = function(e) {
        // Close only if clicking on overlay background or close button
        if (e.target === overlay || e.target.id === 'closePhotoBtn') {
            overlay.remove();
        }
    };

    // Add navigation event listeners if there are multiple photos
    if (trackPhotos.length > 1) {
        overlay.querySelector('#prevPhotoBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const prevIndex = (currentIndex - 1 + trackPhotos.length) % trackPhotos.length;
            overlay.remove();
            window.expandTrackPhoto(trackPhotos[prevIndex].id, trackId || photo.trackId);
        });

        overlay.querySelector('#nextPhotoBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const nextIndex = (currentIndex + 1) % trackPhotos.length;
            overlay.remove();
            window.expandTrackPhoto(trackPhotos[nextIndex].id, trackId || photo.trackId);
        });
    }

    trackDetailMap.parentElement.style.position = 'relative';
    trackDetailMap.parentElement.appendChild(overlay);
};

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
function showTrackInfoModal(track, isSharedLink = false) {
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

    // Hide/show back arrow and edit button based on shared link mode
    const backArrow = document.querySelector('.back-arrow');
    const editBtn = document.getElementById('editTrackFromInfo');
    if (isSharedLink) {
        backArrow.style.display = 'none';
        editBtn.style.display = 'none';
    } else {
        backArrow.style.display = 'inline';
        editBtn.style.display = 'inline-block';
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

    // Store track ID in edit, download and share buttons
    document.getElementById('editTrackFromInfo').dataset.trackId = track.id;
    document.getElementById('downloadTrackFromInfo').dataset.trackId = track.id;
    document.getElementById('shareTrackBtn').dataset.trackId = track.id;

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

        // Add photos associated with this track
        if (state.photos && state.photos.length > 0) {
            const trackPhotos = state.photos.filter(photo => photo.trackId === track.id);
            trackPhotos.forEach(photo => {
                // Use divIcon with emoji for better PWA compatibility
                const icon = L.divIcon({
                    className: 'photo-marker',
                    html: '<div style="font-size: 28px; text-align: center; margin-top: -14px; cursor: pointer;">📷</div>',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });

                const marker = L.marker([photo.latitude, photo.longitude], { icon })
                    .addTo(state.trackDetailMap);

                // Click on marker opens full-size photo directly
                marker.on('click', () => {
                    window.expandTrackPhoto(photo.id);
                });
            });
        }

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
    // Apply filters to show/hide tracks on map
    state.tracks.forEach(track => {
        let shouldShow = true;

        // Apply completion filter
        if (state.filters.completion === 'completed' && !track.completedAt) {
            shouldShow = false;
        } else if (state.filters.completion === 'todo' && track.completedAt) {
            shouldShow = false;
        }

        // Apply label filters (if any labels are selected)
        if (shouldShow && state.filters.labels.length > 0) {
            // Track must have at least one of the selected labels
            const trackLabelIds = track.labels ? track.labels.map(tl => tl.label.id) : [];
            const hasMatchingLabel = state.filters.labels.some(labelId => trackLabelIds.includes(labelId));
            if (!hasMatchingLabel) {
                shouldShow = false;
            }
        }

        // Get or create layer
        const layerGroup = state.layers.tracks[track.id];

        if (shouldShow) {
            // Track should be visible
            if (!layerGroup) {
                // Create layer if it doesn't exist
                addTrackToMap(track);
            } else if (!state.map.hasLayer(layerGroup)) {
                // Add existing layer to map
                state.map.addLayer(layerGroup);
            }
        } else {
            // Track should be hidden
            if (layerGroup && state.map.hasLayer(layerGroup)) {
                state.map.removeLayer(layerGroup);
            }
        }
    });
}

// Get icon for track type
function getTypeIcon(type) {
    const trackType = state.trackTypes.find(t => t.value === type);
    return trackType ? trackType.icon : '🥾';
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
        // Create a download link to the GPX file - encode filename for special characters
        const encodedFilename = encodeURIComponent(track.filename);
        const downloadUrl = `${API_BASE_URL}/gpx/${encodedFilename}`;

        // Create a temporary anchor element and trigger download
        const link = document.createElement('a');
        link.href = `/uploads/gpx/${encodedFilename}`;
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
            // Update on server - encode filename for special characters
            const encodedFilename = encodeURIComponent(track.filename);
            const response = await fetch(`${API_BASE_URL}/gpx/${encodedFilename}`, {
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
                // Delete from server - encode filename for special characters
                if (track.filename) {
                    const encodedFilename = encodeURIComponent(track.filename);
                    await fetch(`${API_BASE_URL}/gpx/${encodedFilename}`, {
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
                    const encodedFilename = encodeURIComponent(track.filename);
                    await fetch(`${API_BASE_URL}/gpx/${encodedFilename}`, {
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

// Load single track (for shared links)
async function loadSingleTrack(trackId) {
    try {
        console.log('Loading single track:', trackId);
        const response = await fetch(`${API_BASE_URL}/gpx/list`);

        if (!response.ok) {
            console.error('Failed to fetch tracks:', response.status, response.statusText);
            alert(`Erreur lors du chargement de la trace: ${response.status}`);
            return;
        }

        const result = await response.json();

        if (result.success && result.tracks) {
            // Find the specific track
            const trackData = result.tracks.find(t => t.id === trackId);

            if (!trackData) {
                console.error('Track not found:', trackId);
                alert('Trace introuvable');
                return;
            }

            console.log(`📄 Loading GPX file: ${trackData.filename}`);
            const encodedFilename = encodeURIComponent(trackData.filename);
            const contentResponse = await fetch(`${API_BASE_URL}/gpx/${encodedFilename}`);

            if (!contentResponse.ok) {
                console.error(`❌ GPX file not found: ${trackData.filename}`);
                alert('Fichier GPX introuvable');
                return;
            }

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
                    console.log('✅ Track loaded:', track.name);
                }
            }
        }
    } catch (error) {
        console.error('Error loading track:', error);
        alert(`Erreur lors du chargement de la trace: ${error.message}`);
    }
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
            // If in "recent" mode, only load the 3 most recent tracks
            let tracksToLoad = result.tracks;
            if (state.filters.display === 'recent') {
                // Sort by createdAt descending and take first 3
                tracksToLoad = [...result.tracks]
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(0, 3);
                console.log(`📍 Loading ${tracksToLoad.length} recent tracks (out of ${result.tracks.length} total)...`);
            } else {
                console.log(`📍 Loading ${result.tracks.length} tracks from database...`);
            }

            for (const trackData of tracksToLoad) {
                console.log(`📄 Loading GPX file: ${trackData.filename}`);
                // Get GPX content - encode filename to handle special characters
                const encodedFilename = encodeURIComponent(trackData.filename);
                console.log(`🔗 Encoded URL: ${API_BASE_URL}/gpx/${encodedFilename}`);
                const contentResponse = await fetch(`${API_BASE_URL}/gpx/${encodedFilename}`);

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
                        // Don't add to map here - renderTracks() will handle it with filters
                    }
                }
            }
        }

        // renderTracks() will add tracks to map based on active filters
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
            // Don't add photos to main map - they will be shown in track detail modal
            // result.photos.forEach(photo => {
            //     addPhotoToMap(photo);
            // });
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
            // Store full label objects (with id and name), sorted by name
            state.labels = result.labels.sort((a, b) => a.name.localeCompare(b.name));
        }
    } catch (error) {
        console.error('Error loading labels from server:', error);
    }
}

// Load track types from server
async function loadTrackTypesFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/track-types/list`);
        const result = await response.json();

        if (result.success && result.trackTypes) {
            state.trackTypes = result.trackTypes;
        }
    } catch (error) {
        console.error('Error loading track types from server:', error);
    }
}

// Edit track - open modal
let currentEditingTrackId = null;
let currentTrackLabels = [];

// Get all unique labels from database
function getAllExistingLabels() {
    return state.labels;
}

// Populate track type select with options from database
function populateTrackTypeSelect(selectedValue) {
    const select = document.getElementById('editTrackType');

    // Clear existing options
    select.innerHTML = '';

    // Add options from state.trackTypes
    state.trackTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type.value;
        option.textContent = `${type.icon} ${type.label}`;
        if (type.value === selectedValue) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // If no type matches and we have a fallback, select first option
    if (!selectedValue && state.trackTypes.length > 0) {
        select.selectedIndex = 0;
    }
}

function editTrack(trackId) {
    const track = state.tracks.find(t => t.id.toString() === trackId.toString());
    if (!track) return;

    currentEditingTrackId = trackId;

    // Fill form with current values
    // If title is empty, pre-fill with GPX name if available
    document.getElementById('editTrackTitle').value = track.title || track.name || '';

    // Populate track type select dynamically
    populateTrackTypeSelect(track.type || 'gravel');

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

    container.innerHTML = existingLabels.map(labelObj => {
        const labelName = labelObj.name;
        const isAlreadyAdded = currentTrackLabels.includes(labelName);
        const disabledClass = isAlreadyAdded ? ' disabled' : '';

        return `<span class="label-suggestion${disabledClass}" data-label="${labelName.replace(/"/g, '&quot;')}">${labelName}</span>`;
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
        const encodedFilename = encodeURIComponent(track.filename);
        const response = await fetch(`${API_BASE_URL}/gpx/${encodedFilename}`, {
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
        const encodedFilename = encodeURIComponent(track.filename);
        const response = await fetch(`${API_BASE_URL}/gpx/${encodedFilename}`, {
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

// Track Type Form Modal Management
let currentEditingTrackTypeId = null;

// Show add track type form
function showAddTrackTypeForm() {
    currentEditingTrackTypeId = null;
    document.getElementById('trackTypeFormTitle').textContent = 'Ajouter un type de trace';
    document.getElementById('trackTypeValue').value = '';
    document.getElementById('trackTypeValue').disabled = false;
    document.getElementById('trackTypeLabel').value = '';
    document.getElementById('trackTypeIcon').value = '';
    document.getElementById('trackTypeFormModal').classList.remove('hidden');
}

// Show edit track type form
function showEditTrackTypeForm(type) {
    currentEditingTrackTypeId = type.id;
    document.getElementById('trackTypeFormTitle').textContent = 'Modifier le type de trace';
    document.getElementById('trackTypeValue').value = type.value;
    document.getElementById('trackTypeValue').disabled = true; // Can't change value once created
    document.getElementById('trackTypeLabel').value = type.label;
    document.getElementById('trackTypeIcon').value = type.icon;
    document.getElementById('trackTypeFormModal').classList.remove('hidden');
}

// Close track type form modal
function closeTrackTypeFormModal() {
    document.getElementById('trackTypeFormModal').classList.add('hidden');
    currentEditingTrackTypeId = null;
}

// Handle track type form submission
async function handleTrackTypeFormSubmit(event) {
    event.preventDefault();

    const value = document.getElementById('trackTypeValue').value.trim();
    const label = document.getElementById('trackTypeLabel').value.trim();
    const icon = document.getElementById('trackTypeIcon').value.trim();

    if (!value || !label || !icon) {
        alert('Tous les champs sont requis');
        return;
    }

    if (currentEditingTrackTypeId) {
        // Update existing type
        await updateTrackType(currentEditingTrackTypeId, value, label, icon);
    } else {
        // Create new type
        await createTrackType(value, label, icon);
    }
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
            closeTrackTypeFormModal();
            await loadAndDisplayTrackTypes();
            await loadTrackTypesFromServer(); // Refresh track types in state
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
async function updateTrackType(id, value, label, icon, order = 0) {
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
            closeTrackTypeFormModal();
            await loadAndDisplayTrackTypes();
            await loadTrackTypesFromServer(); // Refresh track types in state
            alert('Type mis à jour avec succès !');
        } else {
            alert('Erreur lors de la mise à jour du type');
        }
    } catch (error) {
        console.error('Error updating track type:', error);
        alert('Erreur lors de la mise à jour du type');
    }
}

// Share track - generate and copy shareable link
function shareTrack(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) {
        alert('Trace introuvable');
        return;
    }

    // Generate shareable URL with track ID as query parameter
    const shareUrl = `${window.location.origin}${window.location.pathname}?track=${trackId}`;

    // Copy to clipboard
    navigator.clipboard.writeText(shareUrl).then(() => {
        alert('Lien copié dans le presse-papier !\n\n' + shareUrl);
    }).catch(err => {
        console.error('Error copying to clipboard:', err);
        // Fallback: show URL in alert for manual copy
        prompt('Copiez ce lien pour partager la trace:', shareUrl);
    });
}

// Check if URL contains a track ID and open it automatically
function checkForSharedTrack() {
    const urlParams = new URLSearchParams(window.location.search);
    const trackId = urlParams.get('track');

    if (trackId) {
        // Add a delay to ensure everything is loaded and rendered
        setTimeout(() => {
            const track = state.tracks.find(t => t.id === trackId);
            if (track) {
                showTrackInfoModal(track, true); // true = shared link mode
            } else {
                console.warn('Track not found:', trackId);
            }
        }, 500);
    }
}

// Filter Modal Functions
function showFilterModal() {
    // Set current filter values in the modal
    const displayFilter = state.filters.display;
    document.querySelector(`input[name="displayFilter"][value="${displayFilter}"]`).checked = true;

    const completionFilter = state.filters.completion;
    document.querySelector(`input[name="completionFilter"][value="${completionFilter}"]`).checked = true;

    // Populate label filters
    const labelFiltersContainer = document.getElementById('labelFiltersContainer');
    labelFiltersContainer.innerHTML = '';

    if (state.labels.length === 0) {
        labelFiltersContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">Aucun libellé disponible</p>';
    } else {
        state.labels.forEach(label => {
            const isChecked = state.filters.labels.includes(label.id);
            const labelFilterHtml = `
                <label class="filter-option">
                    <input type="checkbox" name="labelFilter" value="${label.id}" ${isChecked ? 'checked' : ''}>
                    <span>${label.name}</span>
                </label>
            `;
            labelFiltersContainer.insertAdjacentHTML('beforeend', labelFilterHtml);
        });
    }

    document.getElementById('filterModal').classList.remove('hidden');
}

function closeFilterModal() {
    document.getElementById('filterModal').classList.add('hidden');
}

async function applyFilters() {
    const previousDisplayFilter = state.filters.display;

    // Get selected display filter
    const displayFilter = document.querySelector('input[name="displayFilter"]:checked').value;
    state.filters.display = displayFilter;

    // Get selected completion filter
    const completionFilter = document.querySelector('input[name="completionFilter"]:checked').value;
    state.filters.completion = completionFilter;

    // Get selected label filters
    const selectedLabelCheckboxes = document.querySelectorAll('input[name="labelFilter"]:checked');
    state.filters.labels = Array.from(selectedLabelCheckboxes).map(checkbox => checkbox.value);

    console.log(`🔍 Filter change: ${previousDisplayFilter} -> ${displayFilter}`);

    // If display filter changed, reload tracks
    if (displayFilter !== previousDisplayFilter) {
        console.log('🔄 Display filter changed, reloading tracks...');
        // Clear current tracks and layers completely
        state.tracks.forEach(track => {
            const layerGroup = state.layers.tracks[track.id];
            if (layerGroup) {
                state.map.removeLayer(layerGroup);
                layerGroup.clearLayers(); // Clear all layers in the group
            }
        });
        state.tracks = [];
        state.layers.tracks = {};

        // Reload with new filter
        await loadTracksFromServer();
    } else {
        console.log('🎨 Display filter unchanged, just re-rendering...');
        // Just re-render with existing tracks
        renderTracks();
    }

    closeFilterModal();
}

async function resetFilters() {
    const previousDisplayFilter = state.filters.display;

    // Reset all filters to default
    state.filters.display = 'recent';
    state.filters.completion = 'all';
    state.filters.labels = [];

    document.querySelector('input[name="displayFilter"][value="recent"]').checked = true;
    document.querySelector('input[name="completionFilter"][value="all"]').checked = true;
    document.querySelectorAll('input[name="labelFilter"]:checked').forEach(checkbox => {
        checkbox.checked = false;
    });

    // If display filter changed, reload tracks
    if ('recent' !== previousDisplayFilter) {
        // Clear current tracks and layers completely
        state.tracks.forEach(track => {
            const layerGroup = state.layers.tracks[track.id];
            if (layerGroup) {
                state.map.removeLayer(layerGroup);
                layerGroup.clearLayers(); // Clear all layers in the group
            }
        });
        state.tracks = [];
        state.layers.tracks = {};

        // Reload with new filter
        await loadTracksFromServer();
    } else {
        // Just re-render with existing tracks
        renderTracks();
    }

    closeFilterModal();
}
