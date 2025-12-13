import type { Studio } from './types';
import L from 'leaflet';

const iconMap = (window as any).iconMap ?? {};

// City configuration with bounds and map settings
const CITY_CONFIG = {
  Milan: {
    center: [45.4642, 9.19] as [number, number],
    zoom: 13,
    bounds: L.latLngBounds(
      L.latLng(45.4, 9.04),
      L.latLng(45.535, 9.278)
    )
  },
  Seoul: {
    center: [37.55, 126.975] as [number, number],
    zoom: 12,
    bounds: L.latLngBounds(
      L.latLng(37.45, 126.85),
      L.latLng(37.65, 127.15)
    )
  }
} as const;

type CityKey = keyof typeof CITY_CONFIG;

interface MapInstance {
  map: L.Map;
  markers: L.Marker[];
  currentCity: CityKey;
  studiosData: Studio[];
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
    console.error('Leaflet library not loaded');
    return null;
  }

  // Find target studio if slug provided
  let targetStudio: Studio | null = null;
  if (targetStudioSlug) {
    targetStudio = studiosData.find(s => s.slug === targetStudioSlug) || null;
  }

  // Determine initial city based on target studio or default to Milan
  let initialCityKey: CityKey = 'Milan';
  if (targetStudio && (targetStudio.city === 'Milan' || targetStudio.city === 'Seoul')) {
    initialCityKey = targetStudio.city as CityKey;
  }

  const state: MapInstance = {
    map: null as any,
    markers: [],
    currentCity: initialCityKey,
    studiosData
  };

  const initialCity = CITY_CONFIG[state.currentCity];

  // Initialize map
  state.map = L.map('map', {
    center: initialCity.center,
    zoom: initialCity.zoom,
    minZoom: 10,
    maxZoom: 18
  });

  // Create pane for tiles with brightness filter
  state.map.createPane('baseTiles');
  const basePane = state.map.getPane('baseTiles');
  if (basePane) {
    basePane.style.zIndex = '200';
    basePane.style.filter = 'brightness(3)';
  }

  // Add tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '',
    subdomains: 'abcd',
    maxZoom: 20,
    pane: 'baseTiles'
  }).addTo(state.map);

  // Remove default attribution control
  if (state.map.attributionControl) {
    state.map.attributionControl.remove();
  }

  // Set initial bounds
  state.map.setMaxBounds(initialCity.bounds);
  state.map.on('drag', function() {
    state.map.panInsideBounds(initialCity.bounds, { animate: false });
  });

  // Setup city selector
  const citySelect = document.getElementById('city-select') as HTMLSelectElement;
  if (citySelect) {
    citySelect.value = state.currentCity;
    citySelect.addEventListener('change', function(e) {
      const newCity = (e.target as HTMLSelectElement).value as CityKey;
      if (newCity in CITY_CONFIG) {
        state.currentCity = newCity;
        const cityInfo = CITY_CONFIG[newCity];
        
        // Update map bounds
        state.map.setMaxBounds(cityInfo.bounds);
        
        // Pan and zoom to new city
        state.map.flyTo(cityInfo.center, cityInfo.zoom, { duration: 1 });
        
        // Re-render studios
        renderStudios(state);
      }
    });
  }

  // Initial render
  renderStudios(state);

  // If target studio provided, center on it and open popup
  if (targetStudio && targetStudio.latitude && targetStudio.longitude) {
    const lat = typeof targetStudio.latitude === 'string' ? parseFloat(targetStudio.latitude) : targetStudio.latitude;
    const lng = typeof targetStudio.longitude === 'string' ? parseFloat(targetStudio.longitude) : targetStudio.longitude;
    
    if (!isNaN(lat) && !isNaN(lng)) {
      // Delay to ensure markers are rendered
      setTimeout(() => {
        state.map.flyTo([lat, lng], 16, { duration: 0.6 });
        
        // Find and open the popup for this studio
        state.markers.forEach(marker => {
          const markerLatLng = marker.getLatLng();
          if (markerLatLng.lat === lat && markerLatLng.lng === lng) {
            marker.openPopup();
          }
        });
        
        // Clean up URL by removing query parameter
        window.history.replaceState({}, '', '/map');
      }, 300);
    }
  }

  return state;
}

function getIconForPlace(name: string): L.DivIcon {
  if (!name || typeof name !== 'string') {
    name = 'DEFAULT';
  }
  const firstLetter = name.trim().charAt(0).toUpperCase();
  const svg = iconMap[firstLetter] || iconMap['DEFAULT'] || '';

  return L.divIcon({
    html: svg,
    className: 'custom-div-icon',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
  });
}

function createPopupContent(studio: Studio): string {
  return `
    <div class="studio-popup">
      <div class="popup-header">
        <div class="popup-title">${studio.name}</div>
        <a href="/designers/${studio.slug}" class="popup-link" aria-label="View ${studio.name}">
          <span class="arrow-icon">→</span>
        </a>
      </div>
      <div class="popup-address">${studio.address || 'No address available'}</div>
    </div>
  `;
}

function renderStudios(state: MapInstance): void {
  // Clear existing markers
  state.markers.forEach(marker => state.map.removeLayer(marker));
  state.markers = [];

  // Filter studios by city
  const cityStudios = state.studiosData.filter(s => s.city === state.currentCity);

  if (cityStudios.length === 0) return;

  // Add markers
  cityStudios.forEach(studio => {
    const lat = typeof studio.latitude === 'string' ? parseFloat(studio.latitude) : studio.latitude;
    const lng = typeof studio.longitude === 'string' ? parseFloat(studio.longitude) : studio.longitude;
    
    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return;

    const marker = L.marker(
      [lat, lng],
      { icon: getIconForPlace(studio.name) }
    ).addTo(state.map);

    // Bind popup with custom content
    marker.bindPopup(createPopupContent(studio), {
      closeButton: false,
      className: 'custom-popup'
    });

    // Zoom in and center on marker when clicked
    marker.on('click', function() {
      state.map.flyTo([lat, lng], 16, { duration: 0.4 });
    });

    state.markers.push(marker);
  });

  // Fit bounds to show all markers
  const group = L.featureGroup(state.markers);
  state.map.fitBounds(group.getBounds(), { padding: [50, 50] });
}
