// API Configuration - auto-detect production vs local
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8080/api'
    : `${window.location.protocol}//${window.location.host}/api`;

// Base URL for static files (photos)
const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8080'
    : `${window.location.protocol}//${window.location.host}`;

// Toast notification helper
function showToast(icon, title, message, duration = 2000) {
    const toast = document.createElement('div');
    toast.innerHTML = `
        <div style="position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: white; padding: 20px 30px; border-radius: 12px; box-shadow: var(--shadow-lg); z-index: 10000; min-width: 250px; text-align: center; animation: slideDown 0.3s ease-out;">
            <div style="font-size: 32px; margin-bottom: 10px;">${icon}</div>
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 5px;">${title}</div>
            ${message ? `<div style="font-size: 14px; color: var(--text-secondary);">${message}</div>` : ''}
        </div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
}

// Application State
const state = {
    map: null,
    trackDetailMap: null, // Map for track detail modal
    mainCanvasRenderer: null, // Canvas renderer for main map
    detailCanvasRenderer: null, // Canvas renderer for detail map
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
    filters: loadFiltersFromStorage(), // Load saved filters or use defaults
    averageSpeed: loadAverageSpeedFromStorage() // Load saved average speed or use default (17 km/h)
};

// Load filters from localStorage or use defaults
function loadFiltersFromStorage() {
    try {
        const savedFilters = localStorage.getItem('memorides_filters');
        if (savedFilters) {
            return JSON.parse(savedFilters);
        }
    } catch (error) {
        console.error('Error loading filters from storage:', error);
    }

    // Default filters - 'done' and 'soon' checked by default, 'later' unchecked
    return {
        statuses: ['done', 'soon'], // Array of selected status values: 'done', 'soon', 'later'
        labels: [], // Array of selected label IDs
        minDistance: 0, // Minimum distance in km
        maxDistance: 200 // Maximum distance in km
    };
}

// Save filters to localStorage
function saveFiltersToStorage() {
    try {
        localStorage.setItem('memorides_filters', JSON.stringify(state.filters));
    } catch (error) {
        console.error('Error saving filters to storage:', error);
    }
}

// Load average speed from localStorage or use default
function loadAverageSpeedFromStorage() {
    try {
        const savedSpeed = localStorage.getItem('memorides_average_speed');
        if (savedSpeed) {
            const speed = parseFloat(savedSpeed);
            return speed;
        }
    } catch (error) {
        console.error('Error loading average speed from storage:', error);
    }
    return 17; // Default: 17 km/h
}

// Save average speed to localStorage
function saveAverageSpeedToStorage(speed) {
    try {
        localStorage.setItem('memorides_average_speed', speed.toString());
    } catch (error) {
        console.error('Error saving average speed to storage:', error);
    }
}

// ==========================================
// GPX Files Management
// ==========================================

// Load and display GPX files
async function loadAndDisplayGpxFiles() {
    try {
        const response = await fetch(`${API_BASE_URL}/gpx-files/list`);
        const result = await response.json();

        const container = document.getElementById('gpxFilesList');

        if (!result.files || result.files.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">Aucun fichier GPX trouvé</p>';
            return;
        }

        container.innerHTML = result.files.map(file => {
            const fileSize = formatFileSize(file.size);
            const modifiedDate = file.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString('fr-FR') : 'N/A';

            let trackStatus = '';
            if (file.hasTrack && file.trackInfo) {
                trackStatus = `<div class="gpx-file-track-info">📌 Lié à: ${file.trackInfo.title || file.trackInfo.name}</div>`;
            } else {
                trackStatus = '<div class="gpx-file-track-info orphan">⚠️ Fichier orphelin (non lié à une trace)</div>';
            }

            return `
                <div class="gpx-file-item">
                    <div class="gpx-file-info">
                        <div class="gpx-file-name">${file.filename}</div>
                        <div class="gpx-file-meta">
                            <span>📦 ${fileSize}</span>
                            <span>📅 ${modifiedDate}</span>
                        </div>
                        ${trackStatus}
                    </div>
                    <div class="gpx-file-actions">
                        <button
                            class="gpx-file-delete-btn"
                            data-filename="${file.filename}"
                            ${file.hasTrack ? 'disabled title="Supprimez d\'abord la trace liée"' : ''}
                        >
                            🗑️ Supprimer
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach delete event listeners
        container.querySelectorAll('.gpx-file-delete-btn:not([disabled])').forEach(button => {
            button.addEventListener('click', () => {
                const filename = button.dataset.filename;
                handleDeleteGpxFile(filename);
            });
        });
    } catch (error) {
        alert('Erreur lors du chargement des fichiers GPX');
    }
}

// Format file size in human-readable format
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Handle delete GPX file
async function handleDeleteGpxFile(filename) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le fichier "${filename}" ?\n\nCette action est irréversible.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/gpx-files/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            alert('Fichier supprimé avec succès');
            await loadAndDisplayGpxFiles();
        } else {
            alert(result.error || 'Erreur lors de la suppression du fichier');
        }
    } catch (error) {
        alert('Erreur lors de la suppression du fichier');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    // Check if this is a track link (from admin page)
    const urlParams = new URLSearchParams(window.location.search);
    const trackId = urlParams.get('track');

    // Always initialize in normal mode with full map and all tracks
    initMap();
    attachEventListeners();
    await loadTrackTypesFromServer();
    await loadLabelsFromServer();

    // If there's a track ID in URL, temporarily disable filters to ensure the track loads
    if (trackId) {
        const originalFilters = { ...state.filters };
        // Clear filters temporarily
        state.filters.statuses = ['done', 'soon', 'later'];
        state.filters.labels = [];

        await loadTracksFromServer();
        await loadPhotosFromServer();

        // Restore original filters
        state.filters = originalFilters;

        // Open the track detail modal
        checkForSharedTrack();
    } else {
        await loadTracksFromServer();
        await loadPhotosFromServer();
    }
});

// Initialize Leaflet Map
function initMap() {
    state.map = L.map('map', {
        zoomControl: false // Disable default zoom control
    }).setView([45.5, 2.5], 6);

    // Create Canvas renderer for main map (better performance with many points)
    state.mainCanvasRenderer = L.canvas({ padding: 0.5 });

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

    // Roadmap status change - toggle completed date field visibility
    document.getElementById('editTrackRoadmap').addEventListener('change', (e) => {
        toggleCompletedAtField(e.target.value);
    });

    // Labels management
    document.getElementById('addLabelBtn').addEventListener('click', addLabel);
    document.getElementById('newLabel').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addLabel();
        }
    });

    // Hamburger Menu
    const hamburgerButton = document.getElementById('hamburgerButton');
    const menuOverlay = document.getElementById('menuOverlay');
    const closeMenu = document.getElementById('closeMenu');

    function openMenu() {
        menuOverlay.classList.remove('hidden');
        hamburgerButton.classList.add('active');
    }

    function closeMenuFunc() {
        menuOverlay.classList.add('hidden');
        hamburgerButton.classList.remove('active');
    }

    hamburgerButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menuOverlay.classList.contains('hidden')) {
            openMenu();
        } else {
            closeMenuFunc();
        }
    });

    closeMenu.addEventListener('click', closeMenuFunc);

    // Close menu when clicking outside
    menuOverlay.addEventListener('click', (e) => {
        if (e.target === menuOverlay) {
            closeMenuFunc();
        }
    });

    // Menu Settings
    document.getElementById('menuSettings').addEventListener('click', (e) => {
        e.preventDefault();
        closeMenuFunc();
        showLabelsManagementModal();
    });

    // Menu Share Links
    document.getElementById('menuShareLinks').addEventListener('click', (e) => {
        e.preventDefault();
        closeMenuFunc();
        showAllShareLinksModal();
    });

    // Menu Export Human-readable
    document.getElementById('menuExportHuman').addEventListener('click', async (e) => {
        e.preventDefault();
        closeMenuFunc();
        await exportHumanReadable();
    });

    // Menu Export Backup (for reimport)
    document.getElementById('menuExportBackup').addEventListener('click', async (e) => {
        e.preventDefault();
        closeMenuFunc();
        await exportBackup();
    });

    // Menu Clear Storage
    document.getElementById('menuClearStorage').addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Êtes-vous sûr de vouloir vider le cache ? Cela supprimera tous les filtres et préférences enregistrés.')) {
            localStorage.clear();
            closeMenuFunc();
            alert('Cache vidé avec succès !');
            window.location.reload();
        } else {
            closeMenuFunc();
        }
    });

    // Menu Logout
    document.getElementById('menuLogout').addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
            try {
                const response = await fetch(`${API_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                const result = await response.json();
                if (result.success) {
                    window.location.href = '/login';
                }
            } catch (error) {
                console.error('Erreur lors de la déconnexion:', error);
            }
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
            } else if (targetTab === 'gpxFiles') {
                loadAndDisplayGpxFiles();
            }
        });
    });

    // Average speed setting
    const averageSpeedInput = document.getElementById('averageSpeedInput');
    if (averageSpeedInput) {
        // Initialize with saved value
        averageSpeedInput.value = state.averageSpeed;

        // Save on change
        averageSpeedInput.addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            if (speed > 0 && speed <= 50) {
                state.averageSpeed = speed;
                saveAverageSpeedToStorage(speed);
                // Refresh display to update durations
                renderTracks();
            }
        });
    }

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

    // Share modal
    document.getElementById('closeShareModal').addEventListener('click', closeShareModal);
    document.getElementById('shareModal').addEventListener('click', (e) => {
        if (e.target.id === 'shareModal') {
            closeShareModal();
        }
    });
    document.getElementById('createShareLinkBtn').addEventListener('click', createShareLink);

    // Distance sliders
    const minDistanceSlider = document.getElementById('minDistance');
    const maxDistanceSlider = document.getElementById('maxDistance');
    const distanceFilterTitle = document.getElementById('distanceFilterTitle');
    const maxDistanceLimitInput = document.getElementById('maxDistanceLimit');
    const sliderRange = document.getElementById('sliderRange');

    // Load saved max distance limit from localStorage
    const savedMaxLimit = localStorage.getItem('maxDistanceLimit');
    if (savedMaxLimit) {
        const limit = parseInt(savedMaxLimit);
        maxDistanceLimitInput.value = limit;
        minDistanceSlider.max = limit;
        maxDistanceSlider.max = limit;
        maxDistanceSlider.value = Math.min(parseInt(maxDistanceSlider.value), limit);
    }

    function updateDistanceRange() {
        const minValue = parseInt(minDistanceSlider.value);
        const maxValue = parseInt(maxDistanceSlider.value);

        // Ensure min doesn't exceed max
        if (minValue > maxValue) {
            minDistanceSlider.value = maxValue;
        }

        // Ensure max doesn't go below min
        if (maxValue < minValue) {
            maxDistanceSlider.value = minValue;
        }

        const finalMin = parseInt(minDistanceSlider.value);
        const finalMax = parseInt(maxDistanceSlider.value);

        // Update title
        distanceFilterTitle.textContent = `Entre ${finalMin} km et ${finalMax} km`;

        // Update the range bar position and width
        const min = parseInt(minDistanceSlider.min);
        const max = parseInt(minDistanceSlider.max);
        const leftPercent = ((finalMin - min) / (max - min)) * 100;
        const rightPercent = ((finalMax - min) / (max - min)) * 100;

        sliderRange.style.left = leftPercent + '%';
        sliderRange.style.width = (rightPercent - leftPercent) + '%';
    }

    function updateMaxDistanceLimit() {
        const newLimit = parseInt(maxDistanceLimitInput.value);

        // Save to localStorage
        localStorage.setItem('maxDistanceLimit', newLimit);

        // Update slider max attributes
        minDistanceSlider.max = newLimit;
        maxDistanceSlider.max = newLimit;

        // Adjust current values if they exceed new limit
        if (parseInt(minDistanceSlider.value) > newLimit) {
            minDistanceSlider.value = newLimit;
        }
        if (parseInt(maxDistanceSlider.value) > newLimit) {
            maxDistanceSlider.value = newLimit;
        }

        // Update display
        updateDistanceRange();
    }

    minDistanceSlider.addEventListener('input', updateDistanceRange);
    maxDistanceSlider.addEventListener('input', updateDistanceRange);
    maxDistanceLimitInput.addEventListener('change', updateMaxDistanceLimit);

    // Initialize range bar
    updateDistanceRange();

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
                // Duration is calculated dynamically on the client based on distance and average speed

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

                    // Invalidate cache when new track added
                    cacheManager.saveMetadata('lastSync', 0).catch(err =>
                        console.error('Error invalidating cache:', err)
                    );

                    // Open edit modal for the newly added track
                    editTrack(track.id);
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

// Calculate duration based on distance and average speed
function calculateDuration(distance) {
    // Distance from calculateDistance() is in meters, need to convert to km
    const distanceKm = distance ? distance / 1000 : 0;

    // Use average speed from state (configurable in settings)
    const averageSpeed = state.averageSpeed || 17; // km/h

    // Duration = Distance / Speed (result in hours, convert to minutes)
    const durationMinutes = (distanceKm / averageSpeed) * 60;

    return durationMinutes;
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
            opacity: 0.7,
            renderer: state.mainCanvasRenderer
        });

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
        });

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
        });

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
        });

        endMarker.on('click', () => {
            showTrackInfoModal(track);
        });

        layers.push(endMarker);
    }

    // Store all polylines, decorators and markers in a layer group and add to map
    const layerGroup = L.layerGroup(layers).addTo(state.map);
    state.layers.tracks[track.id] = layerGroup;
}

// Compress image to be under 1MB
async function compressImage(file, maxSizeMB = 1) {
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = function(e) {
            const img = new Image();
            img.src = e.target.result;

            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                let width = img.width;
                let height = img.height;
                let quality = 0.9;

                // Start with original dimensions
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                // Function to try compression
                const tryCompress = () => {
                    canvas.toBlob((blob) => {
                        const sizeMB = blob.size / (1024 * 1024);

                        if (sizeMB <= maxSizeMB || quality <= 0.1) {
                            // Success or can't compress more
                            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                        } else {
                            // Try with lower quality
                            quality -= 0.1;

                            // If quality is getting too low, try reducing dimensions
                            if (quality < 0.5 && width > 1920) {
                                width = Math.floor(width * 0.8);
                                height = Math.floor(height * 0.8);
                                canvas.width = width;
                                canvas.height = height;
                                ctx.drawImage(img, 0, 0, width, height);
                                quality = 0.9; // Reset quality for new size
                            }

                            tryCompress();
                        }
                    }, 'image/jpeg', quality);
                };

                tryCompress();
            };
        };

        reader.readAsDataURL(file);
    });
}

// Process and upload a single photo
async function processAndUploadPhoto(file, index, total) {
    try {

        // Extract EXIF data first (before compression)
        let gpsData = await extractGPSData(file);

        // If no GPS data, try using the end point of the current viewing track
        if (!gpsData) {
            if (currentViewingTrack && currentViewingTrack.points && currentViewingTrack.points.length > 0) {
                const lastPoint = currentViewingTrack.points[currentViewingTrack.points.length - 1];
                gpsData = {
                    latitude: lastPoint.lat,
                    longitude: lastPoint.lon
                };
            } else {
            }
        }

        // Compress image if larger than 1MB
        let uploadFile = file;
        if (file.size > 1024 * 1024) {
            uploadFile = await compressImage(file);
        }

        // Upload file with metadata to server
        const formData = new FormData();
        formData.append('photo', uploadFile);
        formData.append('name', file.name);

        // Only add GPS coordinates if available
        if (gpsData) {
            formData.append('latitude', gpsData.latitude.toString());
            formData.append('longitude', gpsData.longitude.toString());
        }

        if (currentViewingTrack) {
            formData.append('trackId', currentViewingTrack.id);
        }

        const response = await fetch(`${API_BASE_URL}/photos/upload`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success && result.photo) {
            return result.photo;
        } else {
            throw new Error(result.error || 'Upload failed');
        }
    } catch (error) {
        console.error(`❌ [${index + 1}/${total}] Failed: ${file.name}`, error.message);
        throw error;
    }
}

// Handle Photo Upload
async function handlePhotoUpload(event) {
    const files = Array.from(event.target.files);

    if (files.length === 0) return;

    // Check for HEIC files (not supported by browsers)
    const heicFiles = files.filter(f =>
        f.name.toLowerCase().endsWith('.heic') ||
        f.name.toLowerCase().endsWith('.heif') ||
        f.type === 'image/heic' ||
        f.type === 'image/heif'
    );

    if (heicFiles.length > 0) {
        const fileList = heicFiles.map(f => `• ${f.name}`).join('\n');
        alert(`❌ Format HEIC non supporté\n\n${heicFiles.length} photo(s) au format HEIC détectée(s):\n${fileList}\n\nSur iOS:\n1. Réglages → Appareil photo → Formats\n2. Sélectionnez "Le plus compatible"\n\nOu utilisez l'app Photos pour partager en JPEG.`);
        event.target.value = '';
        return;
    }

    const startTime = Date.now();

    // Create and show progress toast
    const progressToast = document.createElement('div');
    progressToast.id = 'uploadProgressToast';
    progressToast.innerHTML = `
        <div style="position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: white; padding: 20px 30px; border-radius: 12px; box-shadow: var(--shadow-lg); z-index: 10000; min-width: 250px; text-align: center;">
            <div style="font-size: 32px; margin-bottom: 10px;">📸</div>
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 5px;">Upload en cours...</div>
            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 15px;">
                <span id="uploadProgress">0</span>/${files.length} photo(s)
            </div>
            <div class="spinner"></div>
        </div>
    `;
    document.body.appendChild(progressToast);

    // Upload photos in batches with progress update
    const results = [];
    const errors = [];

    for (let i = 0; i < files.length; i += 3) {
        const batch = files.slice(i, i + 3);
        const batchPromises = batch.map((file, batchIndex) =>
            processAndUploadPhoto(file, i + batchIndex, files.length)
                .then(photo => {
                    // Update progress
                    const progressEl = document.getElementById('uploadProgress');
                    if (progressEl) {
                        progressEl.textContent = results.length + 1;
                    }
                    return { success: true, photo };
                })
                .catch(error => ({ success: false, error: error.message, filename: file.name }))
        );

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach(result => {
            if (result.success) {
                results.push(result.photo);
            } else {
                errors.push(result);
            }
        });
    }

    // Add successful uploads to state (but not to map - photos are only shown in track detail modal)
    results.forEach(photo => {
        state.photos.push(photo);
        // Don't add photos to main map
        // addPhotoToMap(photo);
    });

    renderPhotos();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Update toast with results
    if (errors.length > 0) {
        progressToast.innerHTML = `
            <div style="position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: white; padding: 20px 30px; border-radius: 12px; box-shadow: var(--shadow-lg); z-index: 10000; min-width: 250px; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 10px;">⚠️</div>
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 5px;">Upload partiel</div>
                <div style="font-size: 14px; color: var(--text-secondary);">
                    ${results.length} réussie(s), ${errors.length} erreur(s)
                </div>
            </div>
        `;
        setTimeout(() => {
            progressToast.remove();
            const errorMessages = errors.map(e => `• ${e.filename}: ${e.error}`).join('\n');
            alert(`${results.length} photo(s) uploadée(s).\n\n${errors.length} erreur(s):\n${errorMessages}`);
        }, 1500);
    } else {
        progressToast.innerHTML = `
            <div style="position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: white; padding: 20px 30px; border-radius: 12px; box-shadow: var(--shadow-lg); z-index: 10000; min-width: 250px; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 10px;">✅</div>
                <div style="font-size: 16px; font-weight: 600; margin-bottom: 5px;">Upload terminé !</div>
                <div style="font-size: 14px; color: var(--text-secondary);">
                    ${results.length} photo(s) en ${duration}s
                </div>
            </div>
        `;
        setTimeout(() => {
            progressToast.remove();
        }, 2000);
    }

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
    // Skip photos without GPS coordinates
    if (!photo.latitude || !photo.longitude) {
        return;
    }

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

    // Handle photos without GPS coordinates
    const locationText = photo.latitude && photo.longitude
        ? `Coordonnées: ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`
        : 'Pas de coordonnées GPS';
    document.getElementById('modalPhotoLocation').textContent = locationText;

    document.getElementById('photoModal').classList.remove('hidden');
}

// Calculate photo's distance along track from start
function calculatePhotoDistanceAlongTrack(photo, trackPoints) {
    if (!trackPoints || trackPoints.length === 0) return 0;

    let minDistance = Infinity;
    let closestPointIndex = 0;

    // Find the closest track point to the photo
    for (let i = 0; i < trackPoints.length; i++) {
        const dist = haversineDistance(
            photo.latitude, photo.longitude,
            trackPoints[i].lat, trackPoints[i].lon
        );
        if (dist < minDistance) {
            minDistance = dist;
            closestPointIndex = i;
        }
    }

    // Calculate cumulative distance from start to this point
    let distanceFromStart = 0;
    for (let i = 1; i <= closestPointIndex; i++) {
        distanceFromStart += haversineDistance(
            trackPoints[i - 1].lat, trackPoints[i - 1].lon,
            trackPoints[i].lat, trackPoints[i].lon
        );
    }

    return distanceFromStart;
}

// Global function to expand photo in track detail view
window.expandTrackPhoto = function(photoId, trackId) {
    const photo = state.photos.find(p => p.id === photoId);
    if (!photo) return;

    // Get all photos for this track
    let trackPhotos = state.photos.filter(p => p.trackId === (trackId || photo.trackId));

    // Sort photos chronologically by their position along the track
    const track = state.tracks.find(t => t.id === (trackId || photo.trackId));
    if (track && track.points && track.points.length > 0) {
        trackPhotos = trackPhotos
            .map(p => ({
                ...p,
                distanceAlongTrack: calculatePhotoDistanceAlongTrack(p, track.points)
            }))
            .sort((a, b) => a.distanceAlongTrack - b.distanceAlongTrack);
    }

    const currentIndex = trackPhotos.findIndex(p => p.id === photoId);

    const photoUrl = `${BASE_URL}${photo.path}`;
    const trackDetailMap = document.getElementById('trackDetailMap');

    // Create expanded photo overlay
    const overlay = document.createElement('div');
    overlay.id = 'expandedPhotoOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    `;

    // Show navigation buttons only if there are multiple photos
    const navigationButtons = trackPhotos.length > 1 ? `
        <button id="prevPhotoBtn" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; padding: 12px; cursor: pointer; font-size: 48px; z-index: 2001; color: white; text-shadow: 0 2px 8px rgba(0,0,0,0.8);" title="Photo précédente">‹</button>
        <button id="nextPhotoBtn" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; padding: 12px; cursor: pointer; font-size: 48px; z-index: 2001; color: white; text-shadow: 0 2px 8px rgba(0,0,0,0.8);" title="Photo suivante">›</button>
        <div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 12px; font-size: 14px; z-index: 2001; color: white; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 4px 12px rgba(0,0,0,0.3);">${currentIndex + 1} / ${trackPhotos.length}</div>
    ` : '';

    overlay.innerHTML = `
        <img id="expandedPhotoImg" src="${photoUrl}" style="max-width: 95%; max-height: 95%; object-fit: contain; border-radius: 8px;">
        <button id="closePhotoBtn" style="position: absolute; top: 10px; right: 10px; background: none; border: none; padding: 8px; cursor: pointer; font-size: 32px; z-index: 2001; color: white; text-shadow: 0 2px 8px rgba(0,0,0,0.8);" title="Fermer">✕</button>
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

    try {
        // Find the photo to get its filename
        const photo = state.photos.find(p => p.id === currentPhotoId);
        if (!photo) {
            showToast('❌', 'Erreur', 'Photo introuvable');
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
            const photoModal = document.getElementById('photoModal');
            photoModal.classList.add('hidden');
            currentPhotoId = null;
            showToast('🗑️', 'Photo supprimée', null, 1500);
        } else {
            showToast('❌', 'Erreur', 'Impossible de supprimer la photo');
        }
    } catch (error) {
        console.error('Error deleting photo:', error);
        showToast('❌', 'Erreur', 'Impossible de supprimer la photo');
    }
}

// Show track info modal
function showTrackInfoModal(track, isSharedLink = false) {

    try {
        // Store current track for photo upload fallback
        currentViewingTrack = track;

        const displayTitle = track.title || track.name;
        const typeIcon = getTypeIcon(track.type);

        document.getElementById('trackInfoTitleText').textContent = `${typeIcon} ${displayTitle}`;
        document.getElementById('trackInfoDistance').textContent = formatDistance(track.distance);
        document.getElementById('trackInfoElevation').textContent = formatElevation(track.elevation);
        // Calculate duration dynamically based on distance and average speed
        const duration = track.distance ? calculateDuration(track.distance * 1000) : 0;
        document.getElementById('trackInfoDuration').textContent = formatDuration(duration);
        // Display completion status
        // Display roadmap status
        const roadmap = track.roadmap;
        const roadmapLabels = {
            'soon': '📅 Bientôt',
            'later': '⏰ Plus tard',
            'done': '✅ Faite'
        };

        let statusText = '-';

        if (roadmap && roadmapLabels[roadmap]) {
            statusText = roadmapLabels[roadmap];

            // If done, add the date
            if (roadmap === 'done' && track.completedAt) {
                const date = new Date(track.completedAt);
                const formattedDate = date.toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                statusText = `✅ ${formattedDate}`;
            }
        }

        document.getElementById('trackInfoCompleted').textContent = statusText;
    } catch (error) {
        console.error('❌ Error in showTrackInfoModal (part 1):', error);
        return;
    }

    try {
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
        const modal = document.getElementById('trackInfoModal');
        modal.classList.remove('hidden');
    } catch (error) {
        console.error('❌ Error in showTrackInfoModal (part 2):', error);
        return;
    }

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

        // Create separate Canvas renderer for detail map
        state.detailCanvasRenderer = L.canvas({ padding: 0.5 });

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
                opacity: 0.7,
                renderer: state.detailCanvasRenderer
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
        // Store photo markers for toggle functionality
        const photoMarkers = [];
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

                photoMarkers.push(marker);
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

        // Setup toggle photos button
        const togglePhotosBtn = document.getElementById('togglePhotosBtn');
        if (togglePhotosBtn) {
            if (photoMarkers.length > 0) {
                // Show button
                togglePhotosBtn.style.display = 'flex';

                // Remove existing event listeners
                const newTogglePhotosBtn = togglePhotosBtn.cloneNode(true);
                togglePhotosBtn.parentNode.replaceChild(newTogglePhotosBtn, togglePhotosBtn);

                // Start with photos visible
                newTogglePhotosBtn.classList.add('active');
                newTogglePhotosBtn.style.display = 'flex';

                // Add new event listener
                newTogglePhotosBtn.addEventListener('click', () => {
                    newTogglePhotosBtn.classList.toggle('active');
                    const isActive = newTogglePhotosBtn.classList.contains('active');

                    // Show or hide photo markers
                    photoMarkers.forEach(marker => {
                        if (isActive) {
                            marker.addTo(state.trackDetailMap);
                        } else {
                            state.trackDetailMap.removeLayer(marker);
                        }
                    });
                });
            } else {
                // Hide button if no photos
                togglePhotosBtn.style.display = 'none';
            }
        }
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

    // Remove track parameter from URL if present
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('track')) {
        // Remove the track parameter and update URL without page reload
        window.history.replaceState({}, '', window.location.pathname);
    }
}

// Render tracks list (simplified - no sidebar)
function renderTracks() {
    // Apply filters to show/hide tracks on map
    state.tracks.forEach(track => {
        let shouldShow = true;

        // Apply roadmap status filter
        if (state.filters.statuses && state.filters.statuses.length > 0) {
            // Only show tracks whose roadmap status is in the selected statuses
            if (!state.filters.statuses.includes(track.roadmap)) {
                shouldShow = false;
            }
        }

        // Apply label filters (if any labels are selected)
        if (shouldShow && state.filters.labels.length > 0) {
            const trackLabelIds = track.labels ? track.labels.map(tl => tl.label.id) : [];
            const hasNoLabel = !track.labels || track.labels.length === 0;

            // Check if "no label" filter is active
            const noLabelFilterActive = state.filters.labels.includes('__no_label__');
            // Get regular label filters (excluding the special "no label" filter)
            const regularLabelFilters = state.filters.labels.filter(id => id !== '__no_label__');

            let hasMatchingLabel = false;

            // If "no label" filter is active and track has no labels, it matches
            if (noLabelFilterActive && hasNoLabel) {
                hasMatchingLabel = true;
            }

            // If any regular label filters are active, check if track has at least one
            if (regularLabelFilters.length > 0 && regularLabelFilters.some(labelId => trackLabelIds.includes(labelId))) {
                hasMatchingLabel = true;
            }

            if (!hasMatchingLabel) {
                shouldShow = false;
            }
        }

        // Apply distance filter
        if (shouldShow && track.distance !== null && track.distance !== undefined) {
            const trackDistance = track.distance; // Distance is in km
            if (trackDistance < state.filters.minDistance || trackDistance > state.filters.maxDistance) {
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
    const track = state.tracks.find(t => t.id.toString() === trackId.toString());
    if (!track) return;

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

        // Remove track from cache (instead of invalidating entire cache)
        cacheManager.removeTrack(track.id).catch(err =>
            console.error('Error removing track from cache:', err)
        );

        renderTracks();

        // Show success toast
        showToast('🗑️', 'Trace supprimée', track.title || track.name);
    } catch (error) {
        console.error('Error deleting track:', error);
        showToast('❌', 'Erreur', 'Impossible de supprimer la trace');
    }
}


// Clear all data
async function handleClearAll() {
    try {
        const trackCount = state.tracks.length;
        const photoCount = state.photos.length;

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

        showToast('🗑️', 'Données supprimées', `${trackCount} traces et ${photoCount} photos`);
    } catch (error) {
        console.error('Error clearing all data:', error);
        showToast('❌', 'Erreur', 'Impossible de supprimer les données');
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
    const totalMinutes = Math.round(minutes);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
}

// Load single track (for shared links)
async function loadSingleTrack(trackId) {
    try {
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
                }
            }
        }
    } catch (error) {
        console.error('Error loading track:', error);
        alert(`Erreur lors du chargement de la trace: ${error.message}`);
    }
}

// Show loading overlay
function showLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
    // Reset counter
    updateLoadingCounter(0, 0);
}

// Hide loading overlay
function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// Update loading counter
function updateLoadingCounter(loaded, total) {
    const counter = document.getElementById('loadingCounter');
    if (counter && total > 0) {
        counter.textContent = `${loaded} / ${total}`;
        counter.style.display = 'block';
    } else if (counter) {
        counter.style.display = 'none';
    }
}

// Load tracks from server (with cache support)
async function loadTracksFromServer(retryCount = 0, forceRefresh = false) {
    try {
        // Try to load from cache first (if not forcing refresh)
        if (!forceRefresh) {
            const isCacheFresh = await cacheManager.isCacheFresh(60); // Cache valid for 60 minutes

            if (isCacheFresh) {
                console.log('📦 Loading tracks from cache...');
                // Only show overlay briefly for cache loading
                showLoadingOverlay();
                const cachedTracks = await cacheManager.getTracks();

                if (cachedTracks && cachedTracks.length > 0) {
                    // Apply filters to cached tracks
                    let tracksToLoad = cachedTracks;

                    const allStatuses = ['done', 'soon', 'later'];
                    const allStatusesSelected = state.filters.statuses &&
                        state.filters.statuses.length === 3 &&
                        allStatuses.every(status => state.filters.statuses.includes(status));

                    if (state.filters.statuses && state.filters.statuses.length > 0 && !allStatusesSelected) {
                        tracksToLoad = tracksToLoad.filter(track => state.filters.statuses.includes(track.roadmap));
                    }

                    if (state.filters.labels.length > 0) {
                        tracksToLoad = tracksToLoad.filter(track => {
                            const trackLabelIds = track.labels ? track.labels.map(tl => tl.label.id) : [];
                            return state.filters.labels.some(labelId => trackLabelIds.includes(labelId));
                        });
                    }

                    // Load tracks from cache
                    const totalTracks = tracksToLoad.length;
                    let loadedTracks = 0;

                    for (const trackData of tracksToLoad) {
                        // Get cached GPX
                        const cachedGPX = await cacheManager.getGPX(trackData.id);

                        if (cachedGPX) {
                            const gpxData = parseGPX(cachedGPX);

                            if (gpxData) {
                                const track = {
                                    ...trackData,
                                    points: gpxData.points,
                                    bounds: calculateBounds(gpxData.points)
                                };

                                state.tracks.push(track);
                                addTrackToMap(track);

                                loadedTracks++;
                                updateLoadingCounter(loadedTracks, totalTracks);
                            } else {
                                console.warn(`Failed to parse GPX for track ${trackData.id}`);
                            }
                        } else {
                            console.warn(`No cached GPX found for track ${trackData.id}`);
                        }
                    }

                    console.log(`Cache load: ${loadedTracks}/${totalTracks} tracks loaded`);

                    // If cache is incomplete (missing GPX files), force refresh from server
                    if (loadedTracks < totalTracks * 0.8) {
                        console.warn(`⚠️ Cache incomplete (${loadedTracks}/${totalTracks}), loading from server...`);
                        // Clear partial cache and reload from server
                        await cacheManager.saveMetadata('lastSync', 0);
                        // Fall through to load from server
                    } else {
                        hideLoadingOverlay();
                        renderTracks();

                        console.log(`✅ Loaded ${loadedTracks} tracks from cache`);

                        // Fetch updates in background (don't wait)
                        fetchAndUpdateCache().catch(err => console.error('Background sync error:', err));

                        return;
                    }
                }
            }
        }

        // If cache miss or force refresh, load from server
        console.log('🌐 Loading tracks from server...');
        showLoadingOverlay();
        const response = await fetch(`${API_BASE_URL}/gpx/list`);

        if (!response.ok) {
            // Retry once on first load before showing error (handles PWA first-load race condition)
            if (retryCount === 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return loadTracksFromServer(1);
            }
            console.error('Failed to fetch tracks:', response.status, response.statusText);
            alert(`Erreur lors du chargement des traces: ${response.status}`);
            return;
        }

        const result = await response.json();

        if (result.success && result.tracks && result.tracks.length > 0) {
            // Apply filters to determine which tracks to load
            let tracksToLoad = result.tracks;

            // First, apply roadmap status filters
            // Only filter if not all statuses are selected (all 3 possible values)
            const allStatuses = ['done', 'soon', 'later'];
            const allStatusesSelected = state.filters.statuses &&
                state.filters.statuses.length === 3 &&
                allStatuses.every(status => state.filters.statuses.includes(status));

            if (state.filters.statuses && state.filters.statuses.length > 0 && !allStatusesSelected) {
                // Filter tracks to only include those with selected statuses
                tracksToLoad = tracksToLoad.filter(track => state.filters.statuses.includes(track.roadmap));
            }

            // Apply label filters
            if (state.filters.labels.length > 0) {
                tracksToLoad = tracksToLoad.filter(track => {
                    const trackLabelIds = track.labels ? track.labels.map(tl => tl.label.id) : [];
                    return state.filters.labels.some(labelId => trackLabelIds.includes(labelId));
                });
            }

            const totalTracks = tracksToLoad.length;
            let loadedTracks = 0;

            for (const trackData of tracksToLoad) {
                // Get GPX content - encode filename to handle special characters
                const encodedFilename = encodeURIComponent(trackData.filename);
                const contentResponse = await fetch(`${API_BASE_URL}/gpx/${encodedFilename}`);

                // Skip if file not found (happens when volume is not persistent)
                if (!contentResponse.ok) {
                    console.error(`❌ GPX file not found: ${trackData.filename} (status: ${contentResponse.status})`);
                    console.error(`   URL attempted: ${API_BASE_URL}/gpx/${trackData.filename}`);
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
                        loadedTracks++;
                        // Update counter after each track is loaded
                        updateLoadingCounter(loadedTracks, totalTracks);
                        // Don't add to map here - renderTracks() will handle it with filters

                        // Save to cache (async, don't wait)
                        cacheManager.saveGPX(trackData.id, contentResult.content).catch(err =>
                            console.error('Error caching GPX:', err)
                        );
                    }
                }
            }
        }

        // Save tracks metadata to cache
        await cacheManager.saveTracks(result.tracks);
        await cacheManager.updateLastSync();

        console.log(`💾 Saved ${result.tracks.length} tracks to cache`);

        // renderTracks() will add tracks to map based on active filters
        renderTracks();
    } catch (error) {
        // Retry once on first load before showing error (handles PWA first-load race condition)
        if (retryCount === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return loadTracksFromServer(1);
        }
        console.error('Error loading tracks from server:', error);
        alert(`Erreur lors du chargement des traces: ${error.message}`);
    } finally {
        // Always hide loading overlay when done
        hideLoadingOverlay();
    }
}

// Background sync function to update cache silently
async function fetchAndUpdateCache() {
    try {
        console.log('🔄 Background sync starting...');
        const response = await fetch(`${API_BASE_URL}/gpx/list`);

        if (!response.ok) return;

        const result = await response.json();

        if (result.success && result.tracks) {
            await cacheManager.saveTracks(result.tracks);
            await cacheManager.updateLastSync();
            console.log('✅ Background sync completed');
        }
    } catch (error) {
        console.error('Background sync failed:', error);
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
let currentViewingTrack = null; // Track currently displayed in info modal

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

    // Set roadmap status (default to 'done' if completedAt exists, otherwise 'soon')
    const roadmapValue = track.roadmap || (track.completedAt ? 'done' : 'soon');
    document.getElementById('editTrackRoadmap').value = roadmapValue;

    document.getElementById('editTrackColor').value = track.color || '#2563eb';
    document.getElementById('editTrackComments').value = track.comments || '';

    // Set completed date (format: YYYY-MM-DD for input type="date")
    if (track.completedAt) {
        const date = new Date(track.completedAt);
        document.getElementById('editTrackCompletedAt').value = date.toISOString().split('T')[0];
    } else {
        document.getElementById('editTrackCompletedAt').value = '';
    }

    // Show/hide completed date field based on roadmap status
    toggleCompletedAtField(roadmapValue)

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
            <button type="button" class="delete-photo" data-photo-id="${photo.id}" title="Supprimer">×</button>
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

// Toggle completed date field visibility based on roadmap status
function toggleCompletedAtField(roadmapValue) {
    const completedAtGroup = document.getElementById('completedAtGroup');
    if (roadmapValue === 'done') {
        completedAtGroup.style.display = 'block';
    } else {
        completedAtGroup.style.display = 'none';
        // Clear the date when hiding
        document.getElementById('editTrackCompletedAt').value = '';
    }
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
    const roadmap = document.getElementById('editTrackRoadmap').value;
    const completedAt = document.getElementById('editTrackCompletedAt').value; // YYYY-MM-DD or empty string
    const labels = currentTrackLabels; // Send as array instead of comma-separated string

    // Validate that completedAt is required when roadmap is 'done'
    if (roadmap === 'done' && !completedAt) {
        alert('La date de la ride est obligatoire pour les traces terminées.');
        return;
    }

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
                roadmap: roadmap,
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

            // Update track in cache (instead of invalidating entire cache)
            cacheManager.updateTrack(track).catch(err =>
                console.error('Error updating track in cache:', err)
            );

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

            showToast('🗑️', 'Trace supprimée', track.title || track.name);
        } else {
            showToast('❌', 'Erreur', 'Impossible de supprimer la trace');
        }
    } catch (error) {
        console.error('Error deleting track:', error);
        showToast('❌', 'Erreur', 'Impossible de supprimer la trace');
    }
}

// Handle adding photos to a track
async function handleAddTrackPhotos(event) {
    if (!currentEditingTrackId) {
        showToast('❌', 'Erreur', 'Aucune trace sélectionnée');
        return;
    }

    const files = Array.from(event.target.files);
    const track = state.tracks.find(t => t.id.toString() === currentEditingTrackId.toString());

    if (!track) return;

    // Check for HEIC files
    const heicFiles = files.filter(f =>
        f.name.toLowerCase().endsWith('.heic') ||
        f.name.toLowerCase().endsWith('.heif') ||
        f.type === 'image/heic' ||
        f.type === 'image/heif'
    );

    if (heicFiles.length > 0) {
        const fileList = heicFiles.map(f => `• ${f.name}`).join('\n');
        alert(`❌ Format HEIC non supporté\n\n${heicFiles.length} photo(s) au format HEIC détectée(s):\n${fileList}\n\nSur iOS:\n1. Réglages → Appareil photo → Formats\n2. Sélectionnez "Le plus compatible"\n\nOu utilisez l'app Photos pour partager en JPEG.`);
        event.target.value = '';
        return;
    }

    // Create progress toast
    const progressToastDiv = document.createElement('div');
    progressToastDiv.innerHTML = `
        <div style="position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
             background: white; padding: 20px 30px; border-radius: 12px;
             box-shadow: var(--shadow-lg); z-index: 10000; min-width: 300px;
             text-align: center;">
            <div class="spinner" style="margin: 0 auto 15px;"></div>
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 5px;">Upload en cours...</div>
            <div style="font-size: 14px; color: var(--text-secondary);">
                <span id="uploadProgress">0</span> / ${files.length} photo(s)
            </div>
        </div>
    `;
    document.body.appendChild(progressToastDiv);

    const results = [];
    const errors = [];

    // Helper function to process and upload a single photo
    const processAndUploadTrackPhoto = async (file) => {
        try {
            // Extract GPS data from ORIGINAL photo BEFORE compression (compression removes EXIF data)
            let gpsData = await extractGPSData(file);

            // Fallback: use track end point if no GPS data
            if (!gpsData) {
                if (track && track.points && track.points.length > 0) {
                    const lastPoint = track.points[track.points.length - 1];
                    gpsData = {
                        latitude: lastPoint.lat,
                        longitude: lastPoint.lon
                    };
                } else {
                }
            }

            // Now compress image for upload
            const compressedFile = await compressImage(file);

            // Upload photo with trackId
            const formData = new FormData();
            formData.append('photo', compressedFile);
            formData.append('name', file.name);

            // Only add GPS coordinates if available
            if (gpsData) {
                formData.append('latitude', gpsData.latitude.toString());
                formData.append('longitude', gpsData.longitude.toString());
            }

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

                // Don't add photos to main map - they are only shown in track detail modal
                // addPhotoToMap(result.photo);

                // Update photos list
                state.photos.push(result.photo);

                return result.photo;
            } else {
                errors.push(`${file.name}: ${result.error || 'Erreur inconnue'}`);
                return null;
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            errors.push(`${file.name}: ${error.message}`);
            return null;
        }
    };

    // Upload in batches of 3
    for (let i = 0; i < files.length; i += 3) {
        const batch = files.slice(i, i + 3);
        const batchPromises = batch.map((file, batchIndex) =>
            processAndUploadTrackPhoto(file).then(photo => {
                if (photo) {
                    results.push(photo);
                }
                // Update progress counter
                const progressEl = document.getElementById('uploadProgress');
                if (progressEl) {
                    progressEl.textContent = results.length + errors.length;
                }
                return photo;
            })
        );

        await Promise.all(batchPromises);
    }

    // Remove progress toast
    progressToastDiv.remove();

    // Refresh track photos display
    renderPhotos();
    displayTrackPhotos(track);

    // Show result toast
    if (errors.length === 0) {
        showToast('✅', 'Upload terminé', `${results.length} photo(s) ajoutée(s)`);
    } else if (results.length > 0) {
        showToast('⚠️', 'Upload partiel', `${results.length} photo(s) ajoutée(s), ${errors.length} erreur(s)`);
    } else {
        showToast('❌', 'Échec upload', `${errors.length} erreur(s)`);
    }

    // Reset input
    event.target.value = '';
}

// Delete a photo from a track
async function deleteTrackPhoto(photoId) {
    const photo = state.photos.find(p => p.id.toString() === photoId.toString());
    if (!photo) {
        console.error('Photo not found:', photoId);
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/photos/${photo.filename}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            // Remove from state
            state.photos = state.photos.filter(p => p.id.toString() !== photoId.toString());

            // Remove from track
            const track = state.tracks.find(t => t.id.toString() === currentEditingTrackId.toString());
            if (track && track.photos) {
                track.photos = track.photos.filter(p => p.id.toString() !== photoId.toString());
                displayTrackPhotos(track);
            }

            // Remove from map
            state.layers.photos.eachLayer(layer => {
                if (layer.options && layer.options.photoId && layer.options.photoId.toString() === photoId.toString()) {
                    state.layers.photos.removeLayer(layer);
                }
            });

            renderPhotos();
            showToast('🗑️', 'Photo supprimée', null, 1500);
        } else {
            showToast('❌', 'Erreur', 'Impossible de supprimer la photo');
        }
    } catch (error) {
        console.error('Error deleting photo:', error);
        showToast('❌', 'Erreur', 'Impossible de supprimer la photo');
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

    // Filter tracks using the same filters as renderTracks()
    let filteredTracks = state.tracks.filter(track => {
        let shouldShow = true;

        // Apply roadmap status filter
        if (state.filters.statuses && state.filters.statuses.length > 0) {
            // Only show tracks whose roadmap status is in the selected statuses
            if (!state.filters.statuses.includes(track.roadmap)) {
                shouldShow = false;
            }
        }

        // Apply label filters (if any labels are selected)
        if (shouldShow && state.filters.labels.length > 0) {
            const trackLabelIds = track.labels ? track.labels.map(tl => tl.label.id) : [];
            const hasMatchingLabel = state.filters.labels.some(labelId => trackLabelIds.includes(labelId));
            if (!hasMatchingLabel) {
                shouldShow = false;
            }
        }

        // Apply type filter
        if (shouldShow) {
            const matchesFilter = state.currentFilter === 'all' || track.type === state.currentFilter;
            if (!matchesFilter) {
                shouldShow = false;
            }
        }

        // Apply search filter
        if (shouldShow && state.searchTerm) {
            const matchesSearch = (track.title && track.title.toLowerCase().includes(state.searchTerm)) ||
                track.name.toLowerCase().includes(state.searchTerm) ||
                (track.comments && track.comments.toLowerCase().includes(state.searchTerm));
            if (!matchesSearch) {
                shouldShow = false;
            }
        }

        return shouldShow;
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
                    ${track.distance ? `
                    <div class="track-card-stat">
                        <div class="track-card-stat-label">Durée</div>
                        <div class="track-card-stat-value">${formatDuration(calculateDuration(track.distance * 1000))}</div>
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

            showToast('🗑️', 'Libellé supprimé', labelName);
        } else {
            showToast('❌', 'Erreur', 'Impossible de supprimer le libellé');
        }
    } catch (error) {
        console.error('Error deleting label:', error);
        showToast('❌', 'Erreur', 'Impossible de supprimer le libellé');
    }
}

// Export Human-Readable (organized by tracks)
async function exportHumanReadable() {
    try {
        showToast('👤', 'Export en cours...', 'Organisation des données', 3000);

        const response = await fetch(`${API_BASE_URL}/export/organized`);

        if (!response.ok) {
            throw new Error('Erreur lors de l\'export');
        }

        // Get the blob from the response
        const blob = await response.blob();

        // Get filename from header or use default
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'memorides-export.zip';
        if (contentDisposition) {
            const matches = /filename="([^"]+)"/.exec(contentDisposition);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast('✅', 'Export réussi !', 'Archive organisée téléchargée', 2000);
    } catch (error) {
        console.error('Error exporting data:', error);
        showToast('❌', 'Erreur', 'Impossible d\'exporter les données');
    }
}

// Export Backup (for reimport/machine)
async function exportBackup() {
    try {
        showToast('💾', 'Backup en cours...', 'Sauvegarde complète', 3000);

        const response = await fetch(`${API_BASE_URL}/export/backup`);

        if (!response.ok) {
            throw new Error('Erreur lors du backup');
        }

        // Get the blob from the response
        const blob = await response.blob();

        // Get filename from header or use default
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'memorides-backup.zip';
        if (contentDisposition) {
            const matches = /filename="([^"]+)"/.exec(contentDisposition);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }

        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast('✅', 'Backup réussi !', 'Sauvegarde complète téléchargée', 2000);
    } catch (error) {
        console.error('Error creating backup:', error);
        showToast('❌', 'Erreur', 'Impossible de créer le backup');
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

// Share track modal state
let currentShareTrackId = null;

// Share track - open share modal
async function shareTrack(trackId) {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) {
        alert('Trace introuvable');
        return;
    }

    currentShareTrackId = trackId;

    // Show modal
    const modal = document.getElementById('shareModal');
    modal.classList.remove('hidden');

    // Load existing share links
    await loadShareLinks(trackId);
}

// Load share links for a track
async function loadShareLinks(trackId) {
    const loadingEl = document.getElementById('shareLinksLoading');
    const contentEl = document.getElementById('shareLinksContent');
    const listEl = document.getElementById('shareLinksList');

    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';

    try {
        const response = await fetch(`/api/tracks/${trackId}/share-links`);
        const data = await response.json();

        listEl.innerHTML = '';

        if (data.shareLinks && data.shareLinks.length > 0) {
            data.shareLinks.forEach(link => {
                const linkEl = createShareLinkElement(link);
                listEl.appendChild(linkEl);
            });
            contentEl.style.display = 'block';
        } else {
            listEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Aucun lien de partage actif</p>';
            contentEl.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading share links:', error);
        listEl.innerHTML = '<p style="color: var(--error-color); text-align: center;">Erreur lors du chargement des liens</p>';
        contentEl.style.display = 'block';
    } finally {
        loadingEl.style.display = 'none';
    }
}

// Create share link element
function createShareLinkElement(link) {
    const div = document.createElement('div');
    div.className = `share-link-item${link.isExpired ? ' expired' : ''}`;

    const shareUrl = `${window.location.origin}/share/${link.token}`;
    const expiryDate = new Date(link.expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    div.innerHTML = `
        <div class="share-link-header">
            <span style="font-weight: 600;">${link.isExpired ? '⚠️ Expiré' : '✅ Actif'}</span>
            <div class="share-link-actions">
                <button class="btn btn-small btn-secondary share-link-copy-btn" data-url="${shareUrl}">📋 Copier</button>
                <button class="btn btn-small btn-danger share-link-delete-btn" data-link-id="${link.id}">🗑️ Supprimer</button>
            </div>
        </div>
        <a href="${shareUrl}" target="_blank" class="share-link-url" style="color: var(--primary-color); text-decoration: none;">${shareUrl}</a>
        <div class="share-link-info">
            <span>Créé le ${new Date(link.createdAt).toLocaleDateString('fr-FR')}</span>
            <span>${link.isExpired ? 'Expiré' : `Expire dans ${daysLeft} jour(s)`}</span>
            <span>${link.viewCount || 0} vue(s)</span>
        </div>
    `;

    // Add event listeners
    const copyBtn = div.querySelector('.share-link-copy-btn');
    const deleteBtn = div.querySelector('.share-link-delete-btn');

    copyBtn.addEventListener('click', () => copyShareLink(shareUrl));
    deleteBtn.addEventListener('click', () => deleteShareLink(link.id));

    return div;
}

// Copy share link to clipboard
async function copyShareLink(url) {
    try {
        await navigator.clipboard.writeText(url);
        alert('Lien copié dans le presse-papier !\n\n' + url);
    } catch (err) {
        console.error('Error copying to clipboard:', err);
        prompt('Copiez ce lien pour partager la trace:', url);
    }
}

// Delete share link
async function deleteShareLink(linkId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce lien de partage ?')) {
        return;
    }

    console.log('Deleting share link with ID:', linkId);

    try {
        const response = await fetch(`/api/share-links/${linkId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        console.log('Delete response:', response.status, data);

        if (response.ok) {
            console.log('Share link deleted successfully');
            await loadShareLinks(currentShareTrackId);
        } else {
            console.error('Failed to delete share link:', data);
            alert(`Erreur lors de la suppression du lien: ${data.error || 'Erreur inconnue'}`);
        }
    } catch (error) {
        console.error('Error deleting share link:', error);
        alert('Erreur lors de la suppression du lien: ' + error.message);
    }
}

// Create new share link
async function createShareLink() {
    if (!currentShareTrackId) return;

    const btn = document.getElementById('createShareLinkBtn');
    btn.disabled = true;
    btn.textContent = 'Création...';

    try {
        const response = await fetch('/api/share-links', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ trackId: currentShareTrackId })
        });

        const data = await response.json();

        if (data.success) {
            await loadShareLinks(currentShareTrackId);
            const shareUrl = `${window.location.origin}${data.url}`;
            await copyShareLink(shareUrl);
        } else {
            alert('Erreur lors de la création du lien');
        }
    } catch (error) {
        console.error('Error creating share link:', error);
        alert('Erreur lors de la création du lien');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Créer un nouveau lien';
    }
}

// Close share modal
function closeShareModal() {
    document.getElementById('shareModal').classList.add('hidden');
    currentShareTrackId = null;
}

// ========== ALL SHARE LINKS MODAL ==========

// Show all share links modal
async function showAllShareLinksModal() {
    const modal = document.getElementById('allShareLinksModal');
    modal.classList.remove('hidden');
    await loadAllShareLinks();
}

// Load all share links
async function loadAllShareLinks() {
    const loadingEl = document.getElementById('allShareLinksLoading');
    const contentEl = document.getElementById('allShareLinksContent');
    const emptyEl = document.getElementById('allShareLinksEmpty');
    const listEl = document.getElementById('allShareLinksList');

    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    emptyEl.style.display = 'none';

    try {
        const response = await fetch('/api/share-links');
        const data = await response.json();

        loadingEl.style.display = 'none';

        if (!data.shareLinks || data.shareLinks.length === 0) {
            emptyEl.style.display = 'block';
            return;
        }

        contentEl.style.display = 'block';
        listEl.innerHTML = '';

        data.shareLinks.forEach(link => {
            const linkEl = createAllShareLinkElement(link);
            listEl.appendChild(linkEl);
        });
    } catch (error) {
        console.error('Error loading all share links:', error);
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
        emptyEl.innerHTML = '<p style="color: var(--error-color);">Erreur lors du chargement des liens.</p>';
    }
}

// Create share link element for all links view
function createAllShareLinkElement(link) {
    const div = document.createElement('div');
    div.className = `share-link-item${link.isExpired ? ' expired' : ''}`;
    div.style.marginBottom = '1rem';

    const shareUrl = `${window.location.origin}/share/${link.token}`;
    const expiryDate = new Date(link.expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    div.innerHTML = `
        <div class="share-link-header">
            <div>
                <span style="font-weight: 600;">${link.isExpired ? '⚠️ Expiré' : '✅ Actif'}</span>
                <span style="margin-left: 1rem; color: var(--text-secondary);">${link.track.name || link.track.filename}</span>
            </div>
            <div class="share-link-actions">
                <button class="btn btn-small btn-secondary all-share-link-copy-btn" data-url="${shareUrl}">📋 Copier</button>
                <button class="btn btn-small btn-danger all-share-link-delete-btn" data-link-id="${link.id}">🗑️ Supprimer</button>
            </div>
        </div>
        <a href="${shareUrl}" target="_blank" class="share-link-url" style="color: var(--primary-color); text-decoration: none;">${shareUrl}</a>
        <div class="share-link-info">
            <span>Créé le ${new Date(link.createdAt).toLocaleDateString('fr-FR')}</span>
            <span>${link.isExpired ? 'Expiré' : `Expire dans ${daysLeft} jour(s)`}</span>
            <span>${link.viewCount || 0} vue(s)</span>
            <span>${link.track.distance ? `${link.track.distance.toFixed(1)} km` : ''}</span>
        </div>
    `;

    // Add event listeners
    const copyBtn = div.querySelector('.all-share-link-copy-btn');
    const deleteBtn = div.querySelector('.all-share-link-delete-btn');

    copyBtn.addEventListener('click', () => copyShareLink(shareUrl));
    deleteBtn.addEventListener('click', async () => {
        await deleteShareLinkFromAll(link.id);
    });

    return div;
}

// Delete share link from all links view
async function deleteShareLinkFromAll(linkId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce lien de partage ?')) {
        return;
    }

    console.log('Deleting share link with ID:', linkId);

    try {
        const response = await fetch(`/api/share-links/${linkId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        console.log('Delete response:', response.status, data);

        if (response.ok) {
            console.log('Share link deleted successfully');
            await loadAllShareLinks();
        } else {
            console.error('Failed to delete share link:', data);
            alert(`Erreur lors de la suppression du lien: ${data.error || 'Erreur inconnue'}`);
        }
    } catch (error) {
        console.error('Error deleting share link:', error);
        alert('Erreur lors de la suppression du lien: ' + error.message);
    }
}

// Close all share links modal
function closeAllShareLinksModal() {
    document.getElementById('allShareLinksModal').classList.add('hidden');
}

// Setup close button for all share links modal
document.getElementById('closeAllShareLinksModal').addEventListener('click', closeAllShareLinksModal);

// Check if URL contains a track ID and open it automatically
function checkForSharedTrack() {
    const urlParams = new URLSearchParams(window.location.search);
    const trackId = urlParams.get('track');

    if (trackId) {
        // Add a delay to ensure everything is loaded and rendered
        setTimeout(() => {
            const track = state.tracks.find(t => t.id == trackId); // Use == to handle string/type comparison
            if (track) {
                showTrackInfoModal(track, false); // false = not shared link mode (show normal modal)
            } else {
                console.warn('Track not found:', trackId);
                console.warn('Available tracks:', state.tracks.map(t => t.id));
            }
        }, 500);
    }
}

// Filter Modal Functions
function showFilterModal() {
    // Set current filter values in the modal - check the status checkboxes based on state
    const statusCheckboxes = document.querySelectorAll('input[name="statusFilter"]');
    statusCheckboxes.forEach(checkbox => {
        checkbox.checked = state.filters.statuses && state.filters.statuses.includes(checkbox.value);
    });

    // Populate label filters
    const labelFiltersContainer = document.getElementById('labelFiltersContainer');
    labelFiltersContainer.innerHTML = '';

    // Add "Sans libellé" chip first
    const noLabelChip = document.createElement('span');
    const isNoLabelActive = state.filters.labels.includes('__no_label__');
    noLabelChip.className = `label-chip${isNoLabelActive ? ' active' : ''}`;
    noLabelChip.textContent = '🚫 Sans libellé';
    noLabelChip.dataset.labelId = '__no_label__';
    noLabelChip.style.fontStyle = 'italic';
    noLabelChip.addEventListener('click', () => {
        noLabelChip.classList.toggle('active');
    });
    labelFiltersContainer.appendChild(noLabelChip);

    if (state.labels.length === 0) {
        // Show message only if there are no regular labels
        const message = document.createElement('p');
        message.style.cssText = 'color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;';
        message.textContent = 'Aucun libellé disponible';
        labelFiltersContainer.appendChild(message);
    } else {
        state.labels.forEach(label => {
            const isActive = state.filters.labels.includes(label.id);
            const chip = document.createElement('span');
            chip.className = `label-chip${isActive ? ' active' : ''}`;
            chip.textContent = label.name;
            chip.dataset.labelId = label.id;
            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
            });
            labelFiltersContainer.appendChild(chip);
        });
    }

    // Set distance slider values from state
    const minDistanceSlider = document.getElementById('minDistance');
    const maxDistanceSlider = document.getElementById('maxDistance');
    const distanceFilterTitle = document.getElementById('distanceFilterTitle');
    const sliderRange = document.getElementById('sliderRange');

    minDistanceSlider.value = state.filters.minDistance || 0;
    maxDistanceSlider.value = state.filters.maxDistance || 200;
    distanceFilterTitle.textContent = `Entre ${state.filters.minDistance || 0} km et ${state.filters.maxDistance || 200} km`;

    // Update the range bar
    const min = parseInt(minDistanceSlider.min);
    const max = parseInt(minDistanceSlider.max);
    const leftPercent = ((parseInt(minDistanceSlider.value) - min) / (max - min)) * 100;
    const rightPercent = ((parseInt(maxDistanceSlider.value) - min) / (max - min)) * 100;
    sliderRange.style.left = leftPercent + '%';
    sliderRange.style.width = (rightPercent - leftPercent) + '%';

    document.getElementById('filterModal').classList.remove('hidden');
}

function closeFilterModal() {
    document.getElementById('filterModal').classList.add('hidden');
}

async function applyFilters() {
    const applyButton = document.getElementById('applyFilters');
    const originalText = applyButton.textContent;

    // Show loader
    applyButton.disabled = true;
    applyButton.innerHTML = '<span class="spinner"></span> Application...';

    try {
        // Get selected status filters from checked checkboxes
        const checkedStatuses = document.querySelectorAll('input[name="statusFilter"]:checked');
        state.filters.statuses = Array.from(checkedStatuses).map(checkbox => checkbox.value);

        // Get selected label filters from active chips
        const activeChips = document.querySelectorAll('.label-chip.active');
        state.filters.labels = Array.from(activeChips).map(chip => chip.dataset.labelId);

        // Get distance filter values
        state.filters.minDistance = parseInt(document.getElementById('minDistance').value);
        state.filters.maxDistance = parseInt(document.getElementById('maxDistance').value);

        // Save filters to localStorage
        saveFiltersToStorage();

        // Clear current tracks and reload from server with new filters
        state.tracks.forEach(track => {
            const layerGroup = state.layers.tracks[track.id];
            if (layerGroup) {
                state.map.removeLayer(layerGroup);
                layerGroup.clearLayers();
            }
        });
        state.tracks = [];
        state.layers.tracks = {};

        // Reload all tracks with new filters
        await loadTracksFromServer();

        closeFilterModal();
    } finally {
        // Restore button state
        applyButton.disabled = false;
        applyButton.textContent = originalText;
    }
}

async function resetFilters() {
    // Reset all filters to default ('done' and 'soon' checked, 'later' unchecked)
    state.filters.statuses = ['done', 'soon'];
    state.filters.labels = [];
    state.filters.minDistance = 0;
    state.filters.maxDistance = 200;

    // Save reset filters to localStorage
    saveFiltersToStorage();

    // Check all status checkboxes
    document.querySelectorAll('input[name="statusFilter"]').forEach(checkbox => {
        checkbox.checked = state.filters.statuses.includes(checkbox.value);
    });

    // Deactivate all label chips
    document.querySelectorAll('.label-chip.active').forEach(chip => {
        chip.classList.remove('active');
    });

    // Reset distance sliders
    const minDistanceSlider = document.getElementById('minDistance');
    const maxDistanceSlider = document.getElementById('maxDistance');
    const minDistanceValue = document.getElementById('minDistanceValue');
    const maxDistanceValue = document.getElementById('maxDistanceValue');
    const sliderRange = document.getElementById('sliderRange');

    if (minDistanceSlider) minDistanceSlider.value = 0;
    if (maxDistanceSlider) maxDistanceSlider.value = 200;
    if (minDistanceValue) minDistanceValue.textContent = 0;
    if (maxDistanceValue) maxDistanceValue.textContent = 200;

    // Update the range bar
    if (sliderRange) {
        sliderRange.style.left = '0%';
        sliderRange.style.width = '100%';
    }

    // Always reload tracks when resetting to ensure all tracks are shown
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

    // Reload all tracks
    await loadTracksFromServer();

    closeFilterModal();
}
