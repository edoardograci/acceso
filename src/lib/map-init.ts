import type { Studio } from './types';
import L from 'leaflet';



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
  currentStudio: Studio | null;
  visitHistory: Studio[];
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
    studiosData,
    currentStudio: null,
    visitHistory: []
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
  state.map.on('drag', function () {
    state.map.panInsideBounds(initialCity.bounds, { animate: false });
  });

  // Setup custom city selector
  setupCitySelector(state);

  // Setup studio card interactions
  setupStudioCard(state);

  // Setup navigation
  setupNavigation(state);

  // Initial render
  renderStudios(state);

  // If target studio provided, center on it and show card
  if (targetStudio && targetStudio.latitude && targetStudio.longitude) {
    const lat = typeof targetStudio.latitude === 'string' ? parseFloat(targetStudio.latitude) : targetStudio.latitude;
    const lng = typeof targetStudio.longitude === 'string' ? parseFloat(targetStudio.longitude) : targetStudio.longitude;

    if (!isNaN(lat) && !isNaN(lng)) {
      setTimeout(() => {
        state.map.flyTo([lat, lng], 16, { duration: 0.6 });
        showStudioCard(targetStudio, state);

        // Clean up URL by removing query parameter
        window.history.replaceState({}, '', '/map');
      }, 300);
    }
  }

  return state;
}

function setupCitySelector(state: MapInstance): void {
  const button = document.getElementById('city-select-button');
  const dropdown = document.getElementById('city-dropdown');
  const wrapper = button?.closest('.city-select-wrapper');
  const selectedCitySpan = document.getElementById('selected-city');
  const options = dropdown?.querySelectorAll('.city-option');

  if (!button || !dropdown || !wrapper || !selectedCitySpan || !options) return;

  // Set initial selected state
  options.forEach(option => {
    const cityValue = (option as HTMLElement).dataset.city as CityKey;
    if (cityValue === state.currentCity) {
      option.classList.add('selected');
    }
  });

  // Toggle dropdown
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrapper.classList.contains('open');

    if (isOpen) {
      wrapper.classList.remove('open');
      dropdown.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    } else {
      wrapper.classList.add('open');
      dropdown.classList.add('open');
      button.setAttribute('aria-expanded', 'true');
    }
  });

  // Handle city selection
  options.forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const newCity = (option as HTMLElement).dataset.city as CityKey;

      if (newCity && newCity in CITY_CONFIG && newCity !== state.currentCity) {
        state.currentCity = newCity;
        const cityInfo = CITY_CONFIG[newCity];

        // Update UI
        selectedCitySpan.textContent = newCity;
        options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        // Update map bounds
        state.map.setMaxBounds(cityInfo.bounds);

        // Pan and zoom to new city
        state.map.flyTo(cityInfo.center, cityInfo.zoom, { duration: 1 });

        // Hide studio card when switching cities
        hideStudioCard();

        // Re-render studios
        renderStudios(state);
      }

      // Close dropdown
      wrapper.classList.remove('open');
      dropdown.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target as Node)) {
      wrapper.classList.remove('open');
      dropdown.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    }
  });
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
    const cityStudios = state.studiosData.filter(s => s.city === state.currentCity);
    if (cityStudios.length <= 1) return;

    let nextStudio: Studio;
    // Try to find a random different studio
    // Safety break after 10 tries just in case
    let tries = 0;
    do {
      const randomIndex = Math.floor(Math.random() * cityStudios.length);
      nextStudio = cityStudios[randomIndex];
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
  // If not going back, and we have a current studio, save it to history
  if (!isBack && state.currentStudio && state.currentStudio !== studio) {
    state.visitHistory.push(state.currentStudio);
  }

  const lat = typeof studio.latitude === 'string' ? parseFloat(studio.latitude) : studio.latitude;
  const lng = typeof studio.longitude === 'string' ? parseFloat(studio.longitude) : studio.longitude;

  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
    state.map.flyTo([lat, lng], 16, { duration: 0.6 });
    showStudioCard(studio, state);
  }
}

function showStudioCard(studio: Studio, state: MapInstance): void {
  // We now target the container for visibility
  const container = document.getElementById('studio-ui-container');
  const title = document.getElementById('studio-card-title');
  const address = document.getElementById('studio-card-address');
  const image = document.getElementById('studio-card-image') as HTMLImageElement;
  const link = document.getElementById('studio-card-link') as HTMLAnchorElement;

  if (!container || !title || !address || !image || !link) return;

  state.currentStudio = studio;

  // Update card content
  title.textContent = studio.name;
  address.textContent = studio.address || 'No address available';
  image.src = studio.cover || '/images/placeholder-studio.jpg';
  image.alt = studio.name;
  link.href = `/designers/${studio.slug}`;

  // Show container
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
  if (!name || typeof name !== 'string') {
    name = 'DEFAULT';
  }
  const iconMap = (window as any).iconMap ?? {};
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

    // Handle marker click
    marker.on('click', function (e) {
      L.DomEvent.stopPropagation(e);
      navigateToStudio(studio, state);
    });

    state.markers.push(marker);
  });

  // Fit bounds to show all markers
  if (state.markers.length > 0) {
    const group = L.featureGroup(state.markers);
    state.map.fitBounds(group.getBounds(), { padding: [50, 50] });
  }
}