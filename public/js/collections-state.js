// Global collections state manager
window.collectionsState = {
    designers: new Set(),
    objects: new Set(),
    loaded: false,
    listeners: new Set(),

    async init() {
        if (this.loaded) return;

        try {
            const response = await fetch('/api/collections/status');
            if (!response.ok) throw new Error('Failed to fetch collections');

            const data = await response.json();
            this.designers = new Set(data.designers);
            this.objects = new Set(data.objects);
            this.loaded = true;

            // Notify all listeners
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
        this.notifyListeners({ type, id, action: 'add' });
    },

    remove(type, id) {
        if (type === 'designer') {
            this.designers.delete(id);
        } else {
            this.objects.delete(id);
        }
        this.notifyListeners({ type, id, action: 'remove' });
    },

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    },

    notifyListeners(change) {
        this.listeners.forEach(callback => callback(change));
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
