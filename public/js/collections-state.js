// Global collections state manager
window.collectionsState = {
    designers: new Set(),
    objects: new Set(),
    loaded: false,
    listeners: new Set(),

    async init() {
        if (this.loaded) return;

        // Try to load from sessionStorage first
        const cached = sessionStorage.getItem('collections_state');
        if (cached) {
            try {
                const data = JSON.parse(cached);

                // Validate that cached data belongs to current user
                // Fetch current user's collections to verify
                const response = await fetch('/api/collections/status');
                if (!response.ok) throw new Error('Failed to fetch collections');

                const currentData = await response.json();

                // Check if cached data matches current user's data
                // If the counts are drastically different, it's likely a different user
                const cachedCount = (data.designers?.length || 0) + (data.objects?.length || 0);
                const currentCount = (currentData.designers?.length || 0) + (currentData.objects?.length || 0);

                // If cached data seems valid (similar count), use it for faster load
                // Otherwise, use fresh data
                if (Math.abs(cachedCount - currentCount) <= 5) {
                    this.designers = new Set(data.designers);
                    this.objects = new Set(data.objects);
                    this.loaded = true;
                    this.notifyListeners();
                    console.log('[Collections] Loaded from cache');

                    // Still update cache with fresh data in background
                    this.designers = new Set(currentData.designers);
                    this.objects = new Set(currentData.objects);
                    this.updateCache();
                    return;
                } else {
                    // Cache is stale (different user), clear it
                    console.log('[Collections] Cache is stale, clearing...');
                    sessionStorage.removeItem('collections_state');
                }
            } catch (e) {
                console.error('Failed to parse cached collections:', e);
                sessionStorage.removeItem('collections_state');
            }
        }

        // Fetch from API if no cache or cache was invalid
        try {
            const response = await fetch('/api/collections/status');
            if (!response.ok) throw new Error('Failed to fetch collections');

            const data = await response.json();
            this.designers = new Set(data.designers);
            this.objects = new Set(data.objects);
            this.loaded = true;

            // Cache in sessionStorage
            sessionStorage.setItem('collections_state', JSON.stringify({
                designers: data.designers,
                objects: data.objects
            }));

            console.log('[Collections] Loaded from API and cached');
            this.notifyListeners();
        } catch (error) {
            console.error('Failed to load collections:', error);
        }
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
        this.updateCache();
        this.notifyListeners({ type, id, action: 'add' });
    },

    remove(type, id) {
        if (type === 'designer') {
            this.designers.delete(id);
        } else {
            this.objects.delete(id);
        }
        this.updateCache();
        this.notifyListeners({ type, id, action: 'remove' });
    },

    updateCache() {
        sessionStorage.setItem('collections_state', JSON.stringify({
            designers: Array.from(this.designers),
            objects: Array.from(this.objects)
        }));
    },

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    },

    notifyListeners(change) {
        this.listeners.forEach(callback => callback(change));
    },

    clear() {
        // Clear all state
        this.designers.clear();
        this.objects.clear();
        this.loaded = false;

        // Remove from sessionStorage
        sessionStorage.removeItem('collections_state');

        console.log('[Collections] State cleared');
        this.notifyListeners({ action: 'clear' });
    }
};

// Auto-initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.collectionsState.init();
    });
} else {
    window.collectionsState.init();
}
