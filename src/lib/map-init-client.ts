import { initializeMap } from '../lib/map-init';

// Wait for DOM and all dependencies to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure Leaflet and icon map are fully loaded
  setTimeout(() => {
    const studiosData = (window as any).studiosData || [];
    const studioSlug = (window as any).studioSlug || null;
    
    if (studiosData.length > 0) {
      initializeMap(studiosData, studioSlug);
    } else {
      console.warn('No studios data available');
    }
  }, 100);
});