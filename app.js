// API Configuration
const API_BASE_URL = 'http://localhost:3001/api';

// Application State
const state = {
    map: null,
    tracks: [],
    photos: [],
    layers: {
        tracks: {},
        photos: L.layerGroup()
    },
    currentFilter: 'all'
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    initMap();
    attachEventListeners();
    await loadTracksFromServer();
    await loadPhotosFromServer();
});

// Initialize Leaflet Map
function initMap() {
    state.map = L.map('map').setView([45.5, 2.5], 6);

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
    // GPX Upload
    document.getElementById('gpxUpload').addEventListener('change', handleGPXUpload);

    // Photo Upload
    document.getElementById('photoUpload').addEventListener('change', handlePhotoUpload);

    // Activity Filter
    document.getElementById('activityFilter').addEventListener('change', handleFilterChange);

    // Clear All
    document.getElementById('clearAll').addEventListener('click', handleClearAll);

    // Track Info Close
    document.getElementById('closeTrackInfo').addEventListener('click', () => {
        document.getElementById('trackInfo').classList.add('hidden');
    });

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
                const color = type === 'cycling' ? '#2563eb' : '#10b981';
                const distance = calculateDistance(gpxData.points);
                const elevation = calculateElevation(gpxData.points);
                const duration = calculateDuration(gpxData.points);

                // Upload file with metadata to server
                const formData = new FormData();
                formData.append('gpx', file);
                formData.append('name', gpxData.name || file.name.replace('.gpx', ''));
                formData.append('type', type);
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
                }
            }
        } catch (error) {
            console.error('Error uploading GPX:', error);
            alert('Erreur lors de l\'upload du fichier GPX');
        }
    }

    renderTracks();
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

    // Get track points
    const trkpts = xmlDoc.querySelectorAll('trkpt');
    const points = [];

    trkpts.forEach(trkpt => {
        const lat = parseFloat(trkpt.getAttribute('lat'));
        const lon = parseFloat(trkpt.getAttribute('lon'));
        const eleElement = trkpt.querySelector('ele');
        const timeElement = trkpt.querySelector('time');

        points.push({
            lat,
            lon,
            ele: eleElement ? parseFloat(eleElement.textContent) : null,
            time: timeElement ? new Date(timeElement.textContent) : null
        });
    });

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
    const latLngs = track.points.map(p => [p.lat, p.lon]);
    const color = track.color || (track.type === 'cycling' ? '#2563eb' : '#10b981');

    const polyline = L.polyline(latLngs, {
        color: color,
        weight: 4,
        opacity: 0.7
    }).addTo(state.map);

    polyline.bindPopup(`<h4>${track.name}</h4><p>${formatDistance(track.distance)}</p>`);

    state.layers.tracks[track.id] = polyline;
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

    const photoUrl = `http://localhost:3001${photo.path}`;
    const marker = L.marker([photo.latitude, photo.longitude], { icon })
        .bindPopup(`<h4>${photo.name}</h4><img src="${photoUrl}" style="max-width: 200px; border-radius: 4px;">`)
        .on('click', () => showPhotoModal(photo));

    state.layers.photos.addLayer(marker);
}

// Show photo modal
function showPhotoModal(photo) {
    const photoUrl = `http://localhost:3001${photo.path}`;
    document.getElementById('modalImage').src = photoUrl;
    document.getElementById('modalPhotoName').textContent = photo.name;
    document.getElementById('modalPhotoLocation').textContent =
        `Coordonnées: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`;
    document.getElementById('photoModal').classList.remove('hidden');
}

// Render tracks list
function renderTracks() {
    const tracksList = document.getElementById('tracksList');
    const filteredTracks = state.tracks.filter(track =>
        state.currentFilter === 'all' || track.type === state.currentFilter
    );

    if (filteredTracks.length === 0) {
        tracksList.innerHTML = '<p class="empty-state">Aucune trace importée</p>';
        return;
    }

    tracksList.innerHTML = filteredTracks.map(track => `
        <div class="track-item" data-id="${track.id}">
            <div class="track-item-header">
                <span class="track-item-name">${track.name}</span>
                <span class="track-item-type">${track.type === 'cycling' ? '🚴' : '🥾'}</span>
            </div>
            <div class="track-item-stats">
                ${formatDistance(track.distance)} • ${formatElevation(track.elevation)}
            </div>
            <div class="track-item-color">
                <label>
                    <input type="color" value="${track.color}" onchange="changeTrackColor('${track.id}', this.value)">
                </label>
            </div>
            <div class="track-item-actions">
                <button class="btn btn-primary btn-small" onclick="focusTrack('${track.id}')">Voir</button>
                <button class="btn btn-danger btn-small" onclick="deleteTrack('${track.id}')">Supprimer</button>
            </div>
        </div>
    `).join('');
}

// Render photos list
function renderPhotos() {
    const photosList = document.getElementById('photosList');

    if (state.photos.length === 0) {
        photosList.innerHTML = '<p class="empty-state">Aucune photo importée</p>';
        return;
    }

    photosList.innerHTML = state.photos.map(photo => {
        const photoUrl = `http://localhost:3001${photo.path}`;
        const photoData = JSON.stringify(photo).replace(/'/g, "\\'");
        return `
            <div class="photo-item" onclick='showPhotoModal(${photoData})'>
                <img src="${photoUrl}" alt="${photo.name}">
            </div>
        `;
    }).join('');
}

// Focus on track
function focusTrack(trackId) {
    const track = state.tracks.find(t => t.id.toString() === trackId.toString());
    if (track && state.layers.tracks[track.id]) {
        state.map.fitBounds(track.bounds, { padding: [50, 50] });

        // Show track info
        document.getElementById('trackName').textContent = track.name;
        document.getElementById('trackDistance').textContent = formatDistance(track.distance);
        document.getElementById('trackElevation').textContent = formatElevation(track.elevation);
        document.getElementById('trackDuration').textContent = formatDuration(track.duration);
        document.getElementById('trackInfo').classList.remove('hidden');

        // Highlight track item
        document.querySelectorAll('.track-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-id="${trackId}"]`).classList.add('active');
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

                // Update the polyline color on the map
                const layer = state.layers.tracks[track.id];
                if (layer) {
                    layer.setStyle({ color: newColor });
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

// Handle filter change
function handleFilterChange(event) {
    state.currentFilter = event.target.value;
    renderTracks();

    // Update track visibility
    state.tracks.forEach(track => {
        const layer = state.layers.tracks[track.id];
        if (layer) {
            if (state.currentFilter === 'all' || track.type === state.currentFilter) {
                layer.addTo(state.map);
            } else {
                state.map.removeLayer(layer);
            }
        }
    });
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
        const response = await fetch(`${API_BASE_URL}/gpx/list`);
        const result = await response.json();

        if (result.success && result.tracks && result.tracks.length > 0) {
            for (const trackData of result.tracks) {
                // Get GPX content
                const contentResponse = await fetch(`${API_BASE_URL}/gpx/${trackData.filename}`);
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
