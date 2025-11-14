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
    tracks: [],
    photos: [],
    labels: [], // All available labels
    layers: {
        tracks: {},
        photos: L.layerGroup()
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

    // Add photo layer to map
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

    // Track Info Modal
    document.getElementById('closeTrackInfoModal').addEventListener('click', closeTrackInfoModal);
    document.getElementById('trackInfoModal').addEventListener('click', (e) => {
        if (e.target.id === 'trackInfoModal') {
            closeTrackInfoModal();
        }
    });
    document.getElementById('editTrackFromInfo').addEventListener('click', () => {
        const trackId = document.getElementById('editTrackFromInfo').dataset.trackId;
        closeTrackInfoModal();
        editTrack(trackId);
    });
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
    document.getElementById('photoUploadFab').addEventListener('change', handlePhotoUpload);
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
    return 'hiking'; // Default
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
    const typeIcon = getTypeIcon(track.type);
    const displayTitle = track.title || track.name;
    const segmentArray = Object.values(segments);
    const firstSegmentPoints = segmentArray[0];
    const lastSegmentPoints = segmentArray[segmentArray.length - 1];

    // Start marker
    if (firstSegmentPoints && firstSegmentPoints.length > 0) {
        const startMarker = L.marker(firstSegmentPoints[0], {
            icon: L.divIcon({
                className: 'track-info-marker',
                html: `<div class="track-info-marker-content track-start-marker" style="background-color: ${color}">
                          <span style="font-size: 16px;">${typeIcon}</span>
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

    document.getElementById('trackInfoTitle').textContent = `${typeIcon} ${displayTitle}`;
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
        document.getElementById('trackInfoCompleted').textContent = `✅ Réalisé le ${formattedDate}`;
    } else {
        document.getElementById('trackInfoCompleted').textContent = '📝 Projet à réaliser';
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

    document.getElementById('trackInfoModal').classList.remove('hidden');
}

// Close track info modal
function closeTrackInfoModal() {
    document.getElementById('trackInfoModal').classList.add('hidden');
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
        'gravel': '🚵',
        'road': '🚴‍♂️'
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
async function loadTracksFromServer() {
    try {
        console.log('Loading tracks from:', API_BASE_URL);
        const response = await fetch(`${API_BASE_URL}/gpx/list`);

        if (!response.ok) {
            console.error('Failed to fetch tracks:', response.status, response.statusText);
            alert(`Erreur lors du chargement des traces: ${response.status}`);
            return;
        }

        const result = await response.json();
        console.log('Tracks loaded:', result);

        if (result.success && result.tracks && result.tracks.length > 0) {
            for (const trackData of result.tracks) {
                // Get GPX content
                const contentResponse = await fetch(`${API_BASE_URL}/gpx/${trackData.filename}`);

                // Skip if file not found (happens when volume is not persistent)
                if (!contentResponse.ok) {
                    console.warn(`GPX file not found: ${trackData.filename} - skipping`);
                    continue;
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
                        addTrackToMap(track);
                    }
                }
            }
        }

        renderTracks();
    } catch (error) {
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
    document.getElementById('editTrackTitle').value = track.title || '';
    document.getElementById('editTrackType').value = track.type || 'hiking';
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
            <img src="${BASE_URL}${photo.path}" alt="${photo.name}" onclick='showPhotoModal(${JSON.stringify(photo)})'>
            <button class="delete-photo" onclick="deleteTrackPhoto('${photo.id}')" title="Supprimer">×</button>
        </div>
    `).join('');
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
            <button type="button" class="label-tag-remove" onclick="removeLabel(${index})" title="Supprimer">×</button>
        </span>
    `).join('');
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
        const onclick = isAlreadyAdded ? '' : `onclick="addLabel('${label.replace(/'/g, "\\'")}')"`;

        return `<span class="label-suggestion${disabledClass}" ${onclick}>${label}</span>`;
    }).join('');
}

// Handle track edit form submission
async function handleTrackEdit(event) {
    event.preventDefault();

    if (!currentEditingTrackId) return;

    const track = state.tracks.find(t => t.id.toString() === currentEditingTrackId.toString());
    if (!track) return;

    const title = document.getElementById('editTrackTitle').value;
    const type = document.getElementById('editTrackType').value;
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
                         onclick='showPhotoModal(${JSON.stringify(photo)})'>`
                ).join('')}
                ${track.photos.length > 5 ? `<span style="color: var(--text-secondary); font-size: 0.9rem;">+${track.photos.length - 5} photos</span>` : ''}
               </div>`
            : '';

        return `
            <div class="track-card">
                <div class="track-card-header">
                    <div class="track-card-title">
                        <h3>${typeIcon} ${displayTitle}</h3>
                        <div class="track-card-subtitle">${track.name}</div>
                    </div>
                    <input type="color"
                           value="${track.color}"
                           class="track-card-color"
                           onchange="changeTrackColor('${track.id}', this.value)">
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
                    <button class="btn btn-primary btn-small" onclick="focusTrackFromList('${track.id}')">
                        🗺️ Voir sur la carte
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="editTrack('${track.id}')">
                        ✏️ Éditer
                    </button>
                    <button class="btn btn-danger btn-small" onclick="deleteTrack('${track.id}')">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Focus track from list view
function focusTrackFromList(trackId) {
    // Switch to map view
    switchView('map');

    // Focus on the track
    setTimeout(() => focusTrack(trackId), 200);
}
