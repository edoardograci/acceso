import type { Studio } from './types';
const L = (window as any).L;

interface MapInstance {
  map: L.Map;
  markers: L.Marker[];
  clusterGroup: any;
  studiosData: Studio[];
  currentStudio: Studio | null;
  visitHistory: Studio[];
  isUserInteracting: boolean;
  updateStudios: (filteredStudios: Studio[], autoCenter?: boolean, shouldCluster?: boolean) => void;
}

function resolveStudioCover(cover?: string | null): string {
  if (!cover) return '/images/placeholder-studio.jpg';
  if (cover.startsWith('http')) {
    if (cover.includes('img.acceso.design')) {
      return `${window.location.origin}/cdn/${new URL(cover).pathname.replace(/^\/+/, '')}`;
    }
    return cover;
  }
  return `${window.location.origin}/cdn/${cover.replace(/^\/+/, '')}`;
}

export function initializeMap(studiosData: Studio[], targetStudioSlug?: string | null): MapInstance | null {
  // Validate map container exists
  const mapContainer = document.getElementById('map');
  if (!mapContainer) {
    console.error('Map container not found');
    return null;
  }

  // Validate Leaflet is loaded
  if (typeof L === 'undefined') {
    console.warn('Leaflet library not loaded - retrying in 500ms...');
    return null;
  }

  // Find target studio if slug provided
  let targetStudio: Studio | null = null;
  if (targetStudioSlug) {
    targetStudio = studiosData.find(s => s.slug === targetStudioSlug) || null;
  }

  const state: MapInstance = {
    map: null as any,
    markers: [],
    clusterGroup: null,
    studiosData,
    currentStudio: null,
    visitHistory: [],
    isUserInteracting: false,
    updateStudios: () => { }
  };

  // Initialize map centered roughly on Europe
  state.map = L.map('map', {
    center: [48.0, 12.0],
    zoom: 4,
    minZoom: 3,
    maxZoom: 18,
    fadeAnimation: true
  });

  // Create cluster group if plugin is available
  if ((L as any).markerClusterGroup) {
     state.clusterGroup = (L as any).markerClusterGroup({
       showCoverageOnHover: false,
       maxClusterRadius: 80, 
       disableClusteringAtZoom: 11, // Dissipate earlier at level 11
       spiderfyOnMaxZoom: false,    // Disable the spiral effect
       iconCreateFunction: function(cluster: any) {
          const childCount = cluster.getChildCount();
          let size = 42;
          if (childCount > 10) size = 48;
          if (childCount > 50) size = 56;
          
          return L.divIcon({ 
             html: `<span>${childCount}</span>`, 
             className: 'cluster-icon', 
             iconSize: L.point(size, size) 
          });
       }
     });
     state.map.addLayer(state.clusterGroup!);
  }

  // Create pane for tiles with brightness filter
  state.map.createPane('baseTiles');
  const basePane = state.map.getPane('baseTiles');
  if (basePane) {
    basePane.style.zIndex = '0'; // Bottom layer
    basePane.style.filter = 'brightness(3)';
  }

  // Add tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '',
    subdomains: 'abcd',
    maxZoom: 20,
    pane: 'baseTiles',
    updateWhenZooming: false,
    updateWhenIdle: true,
    keepBuffer: 4
  }).addTo(state.map);

  // Remove default attribution control
  if (state.map.attributionControl) {
    state.map.attributionControl.remove();
  }

  // Track interaction
  state.map.on('mousedown touchstart', () => {
    state.isUserInteracting = true;
  });

  state.map.on('mouseup touchend dragend', () => {
    state.isUserInteracting = false;
  });

  // Setup studio card interactions
  setupStudioCard(state);

  // Setup navigation
  setupNavigation(state);

  // Define update method
  state.updateStudios = (filteredStudios: Studio[], autoCenter: boolean = true, shouldCluster: boolean = true) => {
    state.studiosData = filteredStudios;
    renderStudios(state, autoCenter, shouldCluster); // Pass clustering flag
  };

  // Initial render - Do not auto-fit bounds on first load
  renderStudios(state, false, true);

  // If target studio provided, center on it and show card overrides default bounds
  if (targetStudio && targetStudio.latitude && targetStudio.longitude) {
    const lat = typeof targetStudio.latitude === 'string' ? parseFloat(targetStudio.latitude) : targetStudio.latitude;
    const lng = typeof targetStudio.longitude === 'string' ? parseFloat(targetStudio.longitude) : targetStudio.longitude;

    if (!isNaN(lat) && !isNaN(lng)) {
      setTimeout(() => {
        if (!state.isUserInteracting) {
          state.map.panTo([lat, lng], { animate: false });
          state.map.flyTo([lat, lng], 16, { duration: 0.6 });
        }
        showStudioCard(targetStudio!, state);

        // Clean up URL by removing query parameter
        window.history.replaceState({}, '', '/map');
      }, 300);
    }
  }

  return state;
}

function setupStudioCard(state: MapInstance): void {
  const card = document.getElementById('studio-card');
  const mapContainer = document.getElementById('map');

  if (!card || !mapContainer) return;

  // Close card when clicking on map
  mapContainer.addEventListener('click', (e) => {
    // Only close if clicking directly on the map, not on markers
    if (e.target === mapContainer || (e.target as HTMLElement).closest('.leaflet-container')) {
      hideStudioCard();
    }
  });

  // Prevent card clicks from closing the card
  card.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function setupNavigation(state: MapInstance): void {
  const nextBtn = document.getElementById('nav-btn-next');
  const backBtn = document.getElementById('nav-btn-back');

  if (!nextBtn || !backBtn) return;

  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const activeStudios = state.studiosData.filter(s => s.latitude && s.longitude);
    if (activeStudios.length <= 1) return;

    let nextStudio: Studio;
    let tries = 0;
    do {
      const randomIndex = Math.floor(Math.random() * activeStudios.length);
      nextStudio = activeStudios[randomIndex];
      tries++;
    } while (nextStudio === state.currentStudio && tries < 10);

    if (nextStudio && nextStudio !== state.currentStudio) {
      navigateToStudio(nextStudio, state);
    }
  });

  backBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.visitHistory.length === 0) return;

    const previousStudio = state.visitHistory.pop();
    if (previousStudio) {
      navigateToStudio(previousStudio, state, true);
    }
  });
}

function navigateToStudio(studio: Studio, state: MapInstance, isBack: boolean = false): void {
  if (!isBack && state.currentStudio && state.currentStudio !== studio) {
    state.visitHistory.push(state.currentStudio);
  }

  const lat = typeof studio.latitude === 'string' ? parseFloat(studio.latitude) : studio.latitude;
  const lng = typeof studio.longitude === 'string' ? parseFloat(studio.longitude) : studio.longitude;

  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
    if (!state.isUserInteracting) {
      state.map.panTo([lat, lng], { animate: false });
      state.map.flyTo([lat, lng], 16, { duration: 0.6 });
    }
    showStudioCard(studio, state);
  }
}

function showStudioCard(studio: Studio, state: MapInstance): void {
  const container = document.getElementById('studio-ui-container');
  const title = document.getElementById('studio-card-title');
  const address = document.getElementById('studio-card-address');
  const image = document.getElementById('studio-card-image') as HTMLImageElement;
  const link = document.getElementById('studio-card-link') as HTMLAnchorElement;

  if (!container || !title || !address || !image || !link) return;

  state.currentStudio = studio;
  title.textContent = studio.name;
  address.textContent = studio.address || 'No address available';
  image.src = resolveStudioCover(studio.cover);
  image.alt = studio.name;
  link.href = `/designers/${studio.slug}`;

  requestAnimationFrame(() => {
    container.classList.add('visible');
  });
}

function hideStudioCard(): void {
  const container = document.getElementById('studio-ui-container');
  if (container) {
    container.classList.remove('visible');
  }
}

function getIconForPlace(name: string): L.DivIcon {
  const iconMap = (window as any).iconMap ?? {};
  const firstLetter = (name || 'D').trim().charAt(0).toUpperCase();
  const svg = iconMap[firstLetter] || iconMap['DEFAULT'] || '';

  return L.divIcon({
    html: svg,
    className: 'custom-div-icon',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
  });
}

function renderStudios(state: MapInstance, fit: boolean = false, shouldCluster: boolean = true): void {
  // Clear existing markers
  state.markers.forEach(marker => state.map.removeLayer(marker));
  if (state.clusterGroup) state.clusterGroup.clearLayers();
  state.markers = [];

  const activeStudios = state.studiosData;
  if (activeStudios.length === 0) return;

  const currentMarkers: L.Marker[] = [];

  // Add markers
  activeStudios.forEach(studio => {
    const lat = typeof studio.latitude === 'string' ? parseFloat(studio.latitude) : studio.latitude;
    const lng = typeof studio.longitude === 'string' ? parseFloat(studio.longitude) : studio.longitude;

    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return;

    const marker = L.marker(
      [lat, lng],
      { icon: getIconForPlace(studio.name) }
    );

    marker.on('click', function (e: any) {
      L.DomEvent.stopPropagation(e);
      navigateToStudio(studio, state);
    });

    currentMarkers.push(marker);
  });

  state.markers = currentMarkers;

  // Decide how to add to map
  if (shouldCluster && state.clusterGroup) {
     state.clusterGroup.addLayers(currentMarkers);
  } else {
     currentMarkers.forEach(m => m.addTo(state.map));
  }

  // Automatically adapt bounds
  if (fit && currentMarkers.length > 0) {
    const group = L.featureGroup(currentMarkers);
    state.map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 13 });
  }
}
