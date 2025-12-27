// Global collections state manager
window.collectionsState = {
    designers: new Set(),
    objects: new Set(),
    loaded: false,
    listeners: new Set(),

    // Config
    CACHE_KEY: 'collections_state_v1',
    CACHE_TTL: 30 * 1000, // 30 seconds freshness preference

    async init() {
        if (this.loaded) return;

        const currentUserId = window.currentUserId;
        if (!currentUserId) return; // Not logged in

        // 1. Instant Load from Cache
        const cachedStr = localStorage.getItem(this.CACHE_KEY);
        let shouldFetch = true;

        if (cachedStr) {
            try {
                const cached = JSON.parse(cachedStr);

                // Only use cache if it belongs to current user
                if (cached.userId === currentUserId) {
                    this.designers = new Set(cached.designers);
                    this.objects = new Set(cached.objects);
                    this.loaded = true;
                    this.notifyListeners(); // Instant UI update
                    console.log('[Collections] Loaded from cache');

                    // Check freshness
                    const age = Date.now() - (cached.timestamp || 0);
                    if (age < this.CACHE_TTL) {
                        shouldFetch = false;
                        console.log('[Collections] Cache acts as fresh (age: ' + Math.round(age / 1000) + 's)');
                    }
                }
            } catch (e) {
                console.error('Failed to parse cached collections:', e);
                localStorage.removeItem(this.CACHE_KEY);
            }
        }

        // 2. Background Sync (Stale-While-Revalidate)
        if (shouldFetch) {
            await this.fetchAndCache(currentUserId);
        }

        // 3. Setup Cross-Tab Sync
        window.addEventListener('storage', (e) => {
            if (e.key === this.CACHE_KEY && e.newValue) {
                try {
                    const synced = JSON.parse(e.newValue);
                    if (synced.userId === window.currentUserId) {
                        console.log('[Collections] Syncing from other tab');
                        this.designers = new Set(synced.designers);
                        this.objects = new Set(synced.objects);
                        this.loaded = true;
                        this.notifyListeners();
                    }
                } catch (err) {
                    console.error('Sync error:', err);
                }
            }
        });
    },

    async fetchAndCache(userId) {
        try {
            console.log('[Collections] Fetching fresh data...');
            const response = await fetch('/api/collections/status');
            if (!response.ok) throw new Error('Failed to fetch collections');

            const data = await response.json();

            // Diff check before updating to avoid unnecessary re-renders
            const newDesigners = new Set(data.designers);
            const newObjects = new Set(data.objects);

            if (this.hasChanged(newDesigners, newObjects)) {
                this.designers = newDesigners;
                this.objects = newObjects;
                this.loaded = true;
                this.updateCache(userId);
                this.notifyListeners();
                console.log('[Collections] Updated from API');
            } else {
                console.log('[Collections] API data matches cache, no update needed');
                // Update timestamp in cache even if data hasn't changed
                this.updateCache(userId);
            }
        } catch (error) {
            console.error('Failed to load collections:', error);
        }
    },

    hasChanged(newDesigners, newObjects) {
        if (this.designers.size !== newDesigners.size) return true;
        if (this.objects.size !== newObjects.size) return true;

        for (let a of newDesigners) if (!this.designers.has(a)) return true;
        for (let a of newObjects) if (!this.objects.has(a)) return true;

        return false;
    },

    isSaved(type, id) {
        return type === 'designer'
            ? this.designers.has(id)
            : this.objects.has(id);
    },

    add(type, id) {
        if (type === 'designer') {
            this.designers.add(id);
        } else {
            this.objects.add(id);
        }
        this.updateCache(window.currentUserId);
        this.notifyListeners({ type, id, action: 'add' });
    },

    remove(type, id) {
        if (type === 'designer') {
            this.designers.delete(id);
        } else {
            this.objects.delete(id);
        }
        this.updateCache(window.currentUserId);
        this.notifyListeners({ type, id, action: 'remove' });
    },

    updateCache(userId) {
        if (!userId) return;
        try {
            localStorage.setItem(this.CACHE_KEY, JSON.stringify({
                userId: userId,
                timestamp: Date.now(),
                designers: Array.from(this.designers),
                objects: Array.from(this.objects)
            }));
        } catch (e) {
            console.error('Failed to save to localStorage', e);
        }
    },

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    },

    notifyListeners(change) {
        this.listeners.forEach(callback => callback(change));
    },

    clear() {
        this.designers.clear();
        this.objects.clear();
        this.loaded = false;
        localStorage.removeItem(this.CACHE_KEY);
        console.log('[Collections] State cleared');
        this.notifyListeners({ action: 'clear' });
    }
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.collectionsState.init();
    });
} else {
    window.collectionsState.init();
}
