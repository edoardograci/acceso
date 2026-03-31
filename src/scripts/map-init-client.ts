import { initializeMap } from '../lib/map-init';

export function setupMap(studiosData: any[], studioSlug?: string | null) {
  if (studiosData.length > 0) {
    initializeMap(studiosData, studioSlug);
  }
}

// Auto-initialize if data is available
if ((window as any).studiosData) {
  const studioSlug = (window as any).studioSlug || null;
  setupMap((window as any).studiosData, studioSlug);
}
