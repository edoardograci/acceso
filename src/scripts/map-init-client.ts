import { initializeMap } from '../lib/map-init.ts';

export function setupMap(studiosData: any[], studioSlug?: string | null) {
  if (studiosData.length > 0) {
    initializeMap(studiosData, studioSlug);
  }
}

// Auto-initialize if data is available
if (window.studiosData) {
  const studioSlug = (window as any).studioSlug || null;
  setupMap(window.studiosData, studioSlug);
}
