// IndexedDB Cache Manager for Memorides
// Stores tracks, GPX data, and metadata for faster loading

class CacheManager {
    constructor() {
        this.dbName = 'MemoridesCache';
        this.version = 1;
        this.db = null;
    }

    // Initialize the database
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store for tracks metadata
                if (!db.objectStoreNames.contains('tracks')) {
                    const tracksStore = db.createObjectStore('tracks', { keyPath: 'id' });
                    tracksStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                // Store for GPX content
                if (!db.objectStoreNames.contains('gpx')) {
                    db.createObjectStore('gpx', { keyPath: 'trackId' });
                }

                // Store for metadata (last sync time, etc.)
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }

                console.log('📦 IndexedDB stores created');
            };
        });
    }

    // Get all tracks from cache
    async getTracks() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tracks'], 'readonly');
            const store = transaction.objectStore('tracks');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                console.error('Error getting tracks from cache:', request.error);
                reject(request.error);
            };
        });
    }

    // Save tracks to cache
    async saveTracks(tracks) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');

            tracks.forEach(track => {
                store.put(track);
            });

            transaction.oncomplete = () => {
                console.log(`💾 Saved ${tracks.length} tracks to cache`);
                resolve();
            };

            transaction.onerror = () => {
                console.error('Error saving tracks:', transaction.error);
                reject(transaction.error);
            };
        });
    }

    // Get GPX content for a specific track
    async getGPX(trackId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['gpx'], 'readonly');
            const store = transaction.objectStore('gpx');
            const request = store.get(trackId);

            request.onsuccess = () => {
                resolve(request.result?.content);
            };

            request.onerror = () => {
                console.error('Error getting GPX from cache:', request.error);
                reject(request.error);
            };
        });
    }

    // Save GPX content for a track
    async saveGPX(trackId, gpxContent) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['gpx'], 'readwrite');
            const store = transaction.objectStore('gpx');
            const request = store.put({ trackId, content: gpxContent });

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                console.error('Error saving GPX:', request.error);
                reject(request.error);
            };
        });
    }

    // Get metadata (like last sync time)
    async getMetadata(key) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readonly');
            const store = transaction.objectStore('metadata');
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result?.value);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Save metadata
    async saveMetadata(key, value) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readwrite');
            const store = transaction.objectStore('metadata');
            const request = store.put({ key, value });

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Update a single track in cache
    async updateTrack(track) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction('tracks', 'readwrite');
            const store = transaction.objectStore('tracks');

            const request = store.put(track);

            request.onsuccess = () => {
                console.log(`✏️ Track ${track.id} updated in cache`);
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    // Remove a single track from cache
    async removeTrack(trackId) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tracks', 'gpx'], 'readwrite');

            // Remove from tracks store
            transaction.objectStore('tracks').delete(trackId);

            // Remove from gpx store
            transaction.objectStore('gpx').delete(trackId);

            transaction.oncomplete = () => {
                console.log(`🗑️ Track ${trackId} removed from cache`);
                resolve();
            };

            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }

    // Clear all cache
    async clearAll() {
        if (!this.db) await this.init();

        const stores = ['tracks', 'gpx', 'metadata'];
        const transaction = this.db.transaction(stores, 'readwrite');

        stores.forEach(storeName => {
            transaction.objectStore(storeName).clear();
        });

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log('🗑️ Cache cleared');
                resolve();
            };

            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }

    // Check if cache is fresh (less than 1 hour old)
    async isCacheFresh(maxAgeMinutes = 60) {
        const lastSync = await this.getMetadata('lastSync');
        if (!lastSync) return false;

        const now = Date.now();
        const age = (now - lastSync) / 1000 / 60; // age in minutes
        return age < maxAgeMinutes;
    }

    // Update last sync timestamp
    async updateLastSync() {
        await this.saveMetadata('lastSync', Date.now());
    }

    // Get cache statistics
    async getStats() {
        if (!this.db) await this.init();

        const tracks = await this.getTracks();
        const lastSync = await this.getMetadata('lastSync');

        return {
            trackCount: tracks.length,
            lastSync: lastSync ? new Date(lastSync).toLocaleString() : 'Never',
            cacheAge: lastSync ? Math.round((Date.now() - lastSync) / 1000 / 60) : null
        };
    }
}

// Export singleton instance
const cacheManager = new CacheManager();
