import type { Studio, Museum, University } from './types';
import type { Map as MapLibreMap } from 'maplibre-gl';
// NOTE: maplibre-gl's CSS is imported lazily inside initializeMap() so the
// ~66KB stylesheet stays out of the initial critical path.

type MapItem = Studio | Museum | University;

interface MapInstance {
  map: MapLibreMap;
  markers: any[];
  allStudiosData: MapItem[];
  studiosData: MapItem[];
  currentStudio: MapItem | null;
  visitHistory: MapItem[];
  isUserInteracting: boolean;
  updateStudios: (filteredStudios: MapItem[], autoCenter?: boolean, shouldCluster?: boolean) => void;
  replaceAllStudios: (studios: MapItem[]) => void;
  showAllStudios: () => void;
  navigateToStudio: (studio: MapItem, state?: MapInstance, isBack?: boolean) => void;
  itemType: 'studio' | 'museum' | 'university';
}

function resolveItemCover(cover?: string | null): string {
  if (!cover) return '/images/placeholder-studio.jpg';
  if (cover.startsWith('http')) {
    if (cover.includes('img.acceso.design') || cover.includes('mood.acceso.design')) {
      return `${window.location.origin}/cdn/${new URL(cover).pathname.replace(/^\/+/, '')}`;
    }
    return cover;
  }
  return `${window.location.origin}/cdn/${cover.replace(/^\/+/, '')}`;
}

function resolveIconName(name?: string | null, itemType: 'studio' | 'museum' | 'university' = 'studio'): string {
  // Pins are drawn on a canvas per letter (see loadIcons/createLetterIcon), and
  // loadIcons always registers icons for A-Z + DEFAULT, so we only need to check
  // that the first character is A-Z here.
  const letter = (name || 'D').trim().charAt(0).toUpperCase();
  if (/^[A-Z]$/.test(letter)) {
    const result = `icon-${itemType}-${letter}`;

    return result;
  }
  const result = `icon-${itemType}-DEFAULT`;

  return result;
}

function convertToGeoJSON(items: MapItem[], itemType: 'studio' | 'museum' | 'university' = 'studio'): any {
  const result = {
    type: 'FeatureCollection',
    features: items
      .map(s => {
        const lat = typeof s.latitude === 'string' ? parseFloat(s.latitude) : s.latitude;
        const lng = typeof s.longitude === 'string' ? parseFloat(s.longitude) : s.longitude;
        if (lat === null || lng === null || lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return null;

        return {
          type: 'Feature',
          properties: {
            id: s.id,
            name: s.name,
            slug: s.slug,
            city: s.city,
            address: s.address,
            cover: (s as any).cover || (s as any).image,
            iconName: resolveIconName(s.name, itemType)
          },
          geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          }
        };
      })
      .filter(Boolean)
  };
  

  return result;
}

function createLetterIcon(map: any, key: string, color: string = '#EDFF77', itemType: 'studio' | 'museum' | 'university' = 'studio') {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const logicalSize = 44; // increased from 30 for bigger pins
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(logicalSize * dpr);
  canvas.height = Math.round(logicalSize * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const cx = logicalSize / 2;
  const cy = logicalSize / 2;
  const radius = logicalSize / 2 - 4;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // The stroke is drawn on a canvas that MapLibre then scales by icon-size,
  // whereas cluster strokes are a fixed pixel width. Divide by the icon size
  // so the single-pin stroke renders at the same pixel weight as the clusters.
  const PIN_STROKE = 2.5;
  ctx.lineWidth = PIN_STROKE / getUnclusteredIconSize();
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();

  const letter = key === 'DEFAULT' ? 'A' : String(key).charAt(0);
  ctx.fillStyle = '#000000';
  ctx.font = '700 15px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, cx, cy + 0.5);

  const imageId = `icon-${itemType}-${key}`;
  if (!map.hasImage(imageId)) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    map.addImage(imageId, {
      width: canvas.width,
      height: canvas.height,
      data: imageData.data,
      pixelRatio: dpr,
    });

  } else {

  }
}

function loadIcons(map: any, callback: () => void, itemType: 'studio' | 'museum' | 'university' = 'studio') {
  const keys = new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), 'DEFAULT']);
  
  const color = itemType === 'museum' ? '#C6F6D6' : itemType === 'university' ? '#EAD8FE' : '#EDFF77';



  keys.forEach((key) => {
    try {
      createLetterIcon(map, key, color, itemType);
    } catch (e) {
      console.warn(`Failed to create canvas icon for: ${key}`, e);
    }
  });


  callback();
}

const UNCLUSTERED_ICON_SIZE_DESKTOP = 0.85;
const UNCLUSTERED_ICON_SIZE_MOBILE = 0.7;

// Single (unclustered) pins read a touch large on phones, so shrink them
// on narrow viewports. The icon image is generated once, so we scale it via
// the layer's icon-size and keep it in sync on resize.
function getUnclusteredIconSize(): number {
  if (typeof window === 'undefined') return UNCLUSTERED_ICON_SIZE_DESKTOP;
  return window.innerWidth <= 768 ? UNCLUSTERED_ICON_SIZE_MOBILE : UNCLUSTERED_ICON_SIZE_DESKTOP;
}

function setupMapLayers(map: MapLibreMap, state: MapInstance) {
  // Always tear down existing layers/source so we can rebuild with the correct
  // cluster setting for the current itemType.
  if (map.getLayer('clusters')) map.removeLayer('clusters');
  if (map.getLayer('cluster-count')) map.removeLayer('cluster-count');
  if (map.getLayer('unclustered-point')) map.removeLayer('unclustered-point');
  if (map.getSource('studios')) map.removeSource('studios');

  // Clustering only for designers (studio). Museums & universities show individual pins.
  const isDesigner = state.itemType === 'studio';

  map.addSource('studios', {
    type: 'geojson',
    data: convertToGeoJSON(state.studiosData as MapItem[], state.itemType),
    cluster: isDesigner,
    // Keep clusters coarse: only merge when pins are very close on screen.
    // clusterMaxZoom 9 means clusters dissolve above zoom 9 (city level).
    // clusterRadius 120 merges pins within ~120px — large enough to avoid
    // tiny clusters of 2-3 nearby pins at continent zoom.
    clusterMaxZoom: 9,
    clusterRadius: 120,
  });

  // Cluster circle layer — only visible for designers
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'studios',
    filter: ['has', 'point_count'],
    layout: {
      visibility: isDesigner ? 'visible' : 'none',
    },
    paint: {
      'circle-color': '#EDFF77',
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        24,   // < 10 points
        10,
        34,   // 10–49 points
        50,
        44,   // ≥ 50 points
      ],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#FFFFFF',
    },
  });

  // Cluster count label — only visible for designers
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'studios',
    filter: ['has', 'point_count'],
    layout: {
      visibility: isDesigner ? 'visible' : 'none',
      'text-field': '{point_count_abbreviated}',
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
    },
    paint: {
      'text-color': '#000000',
    },
  });

  // Individual pin layer
  map.addLayer({
    id: 'unclustered-point',
    type: 'symbol',
    source: 'studios',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'iconName'],
      'icon-size': getUnclusteredIconSize(),
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': '',
    },
  });

  // Event listeners — registered once; guard with layer-existence checks
  map.on('click', 'unclustered-point', (e: any) => {
    if (!e.features || !e.features.length) return;
    const feature = e.features[0];
    const studio = state.studiosData.find((s: any) => s.id === feature.properties.id);
    if (studio) navigateToStudio(studio, state);
  });

  map.on('mouseenter', 'unclustered-point', () => {
    state.map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'unclustered-point', () => {
    state.map.getCanvas().style.cursor = '';
  });
}

function cleanMapBorders(map: MapLibreMap) {
  try {
    const layers = map.getStyle().layers;
    if (!layers) return;
    layers.forEach(layer => {
      // Hide administrative boundaries, country lines, and state lines for a clean layout
      if (
        layer.id.includes('boundary') ||
        layer.id.includes('admin') ||
        layer.id.includes('border')
      ) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    });
  } catch (e) {
    console.error('Failed to clean map borders:', e);
  }
}

export async function initializeMap(studiosData: MapItem[], targetStudioSlug?: string | null, itemType: 'studio' | 'museum' | 'university' = 'studio'): Promise<MapInstance | null> {

  
  const mapContainer = document.getElementById('map');
  if (!mapContainer) {
    console.error('Map container not found');
    return null;
  }

  // Load the map library and its stylesheet together, lazily, so neither is in
  // the initial page load critical path.
  const [maplibregl] = await Promise.all([
    import('maplibre-gl').then((m) => m.default),
    // @ts-ignore - side-effect CSS import, no type declaration needed
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]);

  let targetStudio: MapItem | null = null;
  if (targetStudioSlug) {
    targetStudio = studiosData.find(s => s.slug === targetStudioSlug) || null;
  }

  const state: MapInstance = {
    map: null as any,
    markers: [],
    allStudiosData: studiosData,
    studiosData,
    currentStudio: null,
    visitHistory: [],
    isUserInteracting: false,
    updateStudios: () => { },
    replaceAllStudios: () => { },
    showAllStudios: () => { },
    navigateToStudio: () => { },
    itemType
  };

  const styleUrl = 'https://tiles.openfreemap.org/styles/positron';

  // Instantiate MapLibre Map
  state.map = new maplibregl.Map({
    container: 'map',
    style: styleUrl,
    center: [12.0, 48.0],
    zoom: 4,
    minZoom: 2,
    maxZoom: 18,
    attributionControl: false,
    fadeDuration: 100,
  });

  state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  let isMapLoaded = false;
  let pendingData: { studios: MapItem[], autoCenter: boolean, shouldCluster: boolean } | null = null;

  function updateMapData(studios: MapItem[], autoCenter: boolean = true, shouldCluster: boolean = true) {
    if (!isMapLoaded) {
      pendingData = { studios, autoCenter, shouldCluster };
      return;
    }

    const source: any = state.map.getSource('studios');
    if (source) {
      source.setData(convertToGeoJSON(studios, state.itemType));
    }

    if (autoCenter && studios.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      studios.forEach(s => {
        const lat = typeof s.latitude === 'string' ? parseFloat(s.latitude) : s.latitude;
        const lng = typeof s.longitude === 'string' ? parseFloat(s.longitude) : s.longitude;
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
          bounds.extend([lng, lat]);
        }
      });
      if (!bounds.isEmpty()) {
        state.map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 800 });
      }
    }
  }

  // Handle map style loading and styling setups
  state.map.on('style.load', () => {
    // Clean borders immediately — don't wait for icons
    cleanMapBorders(state.map);

    loadIcons(state.map, () => {
      isMapLoaded = true;
      setupMapLayers(state.map, state);

      // Update dynamic layers
      const initialStudios = pendingData ? pendingData.studios : state.studiosData;
      const fit = pendingData ? pendingData.autoCenter : false;
      const cluster = pendingData ? pendingData.shouldCluster : true;

      updateMapData(initialStudios, fit, cluster);
      pendingData = null;
    }, itemType);
  });

  // Track interaction
  state.map.on('mousedown touchstart', () => {
    state.isUserInteracting = true;
  });

  state.map.on('mouseup touchend dragend', () => {
    state.isUserInteracting = false;
  });

  // Click on a cluster to zoom in
  state.map.on('click', 'clusters', async (e: any) => {
    if (!state.map.getLayer('clusters')) return;
    const features = state.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (!features.length) return;

    const clusterId = features[0].properties.cluster_id;
    const source: any = state.map.getSource('studios');

    try {
      // MapLibre GL JS v4+ returns a Promise; v3 uses a callback.
      // Support both to be safe.
      const zoomResult = source.getClusterExpansionZoom(clusterId);
      const zoom = zoomResult instanceof Promise
        ? await zoomResult
        : await new Promise<number>((resolve, reject) =>
          source.getClusterExpansionZoom(clusterId, (err: any, z: number) =>
            err ? reject(err) : resolve(z)
          )
        );
      state.map.easeTo({
        center: (features[0].geometry as any).coordinates,
        zoom: zoom + 0.5 // slight extra zoom ensures the cluster actually splits
      });
    } catch (err) {
      console.warn('getClusterExpansionZoom failed:', err);
    }
  });

  // Click on an individual point
  state.map.on('click', 'unclustered-point', (e: any) => {
    if (!state.map.getLayer('unclustered-point')) return;
    const features = state.map.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] });
    if (!features.length) return;

    const props = features[0].properties;
    const target =
      state.allStudiosData.find(s => s.slug === props.slug) ||
      state.studiosData.find(s => s.slug === props.slug);
    if (target) {
      navigateToStudio(target as MapItem, state);
    }
  });

  // Cursor pointers
  state.map.on('mouseenter', 'unclustered-point', () => {
    if (!state.map.getLayer('unclustered-point')) return;
    state.map.getCanvas().style.cursor = 'pointer';
  });
  state.map.on('mouseleave', 'unclustered-point', () => {
    state.map.getCanvas().style.cursor = '';
  });
  state.map.on('mouseenter', 'clusters', () => {
    if (!state.map.getLayer('clusters')) return;
    state.map.getCanvas().style.cursor = 'pointer';
  });
  state.map.on('mouseleave', 'clusters', () => {
    state.map.getCanvas().style.cursor = '';
  });

  setupStudioCard(state);
  setupNavigation(state);

  // Keep single-pin size correct when crossing the mobile/desktop breakpoint.
  const syncPinSize = () => {
    if (state.map.getLayer('unclustered-point')) {
      state.map.setLayoutProperty('unclustered-point', 'icon-size', getUnclusteredIconSize());
    }
  };
  window.addEventListener('resize', syncPinSize);

  state.updateStudios = (filteredStudios: MapItem[], autoCenter: boolean = true, shouldCluster: boolean = true) => {
    state.studiosData = filteredStudios;
    updateMapData(filteredStudios, autoCenter, shouldCluster);
  };

  state.replaceAllStudios = (studios: MapItem[]) => {
    state.allStudiosData = studios;
    state.studiosData = studios;
    
    // Remove ALL existing icons for all types
    const keys = new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), 'DEFAULT']);
    const types = ['studio', 'museum', 'university'] as const;
    
    types.forEach((type) => {
      keys.forEach((key) => {
        const imageId = `icon-${type}-${key}`;
        if (state.map.hasImage(imageId)) {
          state.map.removeImage(imageId);
        }
      });
    });
    
    // Also remove any old-style icons without type prefix (for backward compatibility)
    keys.forEach((key) => {
      const oldImageId = `icon-${key}`;
      if (state.map.hasImage(oldImageId)) {
        state.map.removeImage(oldImageId);
      }
    });
    
    // Reload icons with current item type color, then rebuild layers with correct cluster setting
    loadIcons(state.map, () => {
      // Rebuild source + layers so cluster:true/false matches the new itemType
      setupMapLayers(state.map, state);
      updateMapData(studios, false, true);
    }, state.itemType);
  };

  state.showAllStudios = () => {
    state.studiosData = state.allStudiosData;
    updateMapData(state.allStudiosData, false, true);
  };

  state.navigateToStudio = (studio: MapItem) => {
    navigateToStudio(studio, state);
  };

  // If target studio provided, center on it and show card
  if (targetStudio && targetStudio.latitude && targetStudio.longitude) {
    const lat = typeof targetStudio.latitude === 'string' ? parseFloat(targetStudio.latitude) : targetStudio.latitude;
    const lng = typeof targetStudio.longitude === 'string' ? parseFloat(targetStudio.longitude) : targetStudio.longitude;

    if (!isNaN(lat) && !isNaN(lng)) {
      setTimeout(() => {
        if (!state.isUserInteracting) {
          state.map.jumpTo({ center: [lng, lat] });
          state.map.flyTo({ center: [lng, lat], zoom: 16, duration: 600 });
        }
        showStudioCard(targetStudio!, state);

        // Clean up URL parameter
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

  state.map.on('click', (e) => {
    const features = state.map.queryRenderedFeatures(e.point, {
      layers: ['clusters', 'unclustered-point']
    });
    if (features.length === 0) {
      hideStudioCard();
    }
  });

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

    let nextStudio: MapItem;
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

function navigateToStudio(studio: MapItem, state: MapInstance, isBack: boolean = false): void {
  if (!isBack && state.currentStudio && state.currentStudio !== studio) {
    state.visitHistory.push(state.currentStudio);
  }

  const lat = typeof studio.latitude === 'string' ? parseFloat(studio.latitude) : studio.latitude;
  const lng = typeof studio.longitude === 'string' ? parseFloat(studio.longitude) : studio.longitude;

  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
    if (!state.isUserInteracting) {
      state.map.flyTo({
        center: [lng, lat],
        zoom: 16,
        duration: 800,
        essential: true
      });
    }
    showStudioCard(studio, state);
  }
}

const DOCK_RESERVE = 88;
const CARD_PIN_GAP = 52;
const MARKER_RADIUS = 16;

function positionStudioCard(studio: MapItem, state: MapInstance): void {
  const container = document.getElementById('studio-ui-container');
  const mapEl = document.getElementById('map');
  if (!container || !mapEl || !state.map) return;

  const lat = typeof studio.latitude === 'string' ? parseFloat(studio.latitude) : studio.latitude;
  const lng = typeof studio.longitude === 'string' ? parseFloat(studio.longitude) : studio.longitude;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return;

  const point = state.map.project([lng, lat]);
  const mapWidth = mapEl.clientWidth;
  const mapHeight = mapEl.clientHeight;
  const cardWidth = container.offsetWidth || 320;
  const cardHeight = container.offsetHeight || 260;
  const padding = 12;

  let left = point.x - cardWidth / 2;
  let top = point.y - cardHeight - CARD_PIN_GAP - MARKER_RADIUS;

  left = Math.max(padding, Math.min(left, mapWidth - cardWidth - padding));
  top = Math.max(padding, Math.min(top, mapHeight - DOCK_RESERVE - cardHeight - padding));

  container.style.left = `${left}px`;
  container.style.top = `${top}px`;
}

let cardPositionListenersBound = false;

function bindCardPositionListeners(state: MapInstance): void {
  if (cardPositionListenersBound) return;
  cardPositionListenersBound = true;

  const reposition = () => {
    if (state.currentStudio) {
      positionStudioCard(state.currentStudio, state);
    }
  };

  state.map.on('move', reposition);
  state.map.on('zoom', reposition);
  state.map.on('resize', reposition);
  window.addEventListener('resize', reposition);
}

function showStudioCard(studio: MapItem, state: MapInstance): void {
  const container = document.getElementById('studio-ui-container');
  const title = document.getElementById('studio-card-title');
  const address = document.getElementById('studio-card-address');
  const city = document.getElementById('studio-card-city');
  const image = document.getElementById('studio-card-image') as HTMLImageElement;
  const link = document.getElementById('studio-card-link') as HTMLAnchorElement;

  if (!container || !title || !address || !image || !link) return;

  bindCardPositionListeners(state);

  state.currentStudio = studio;
  title.textContent = studio.name;
  address.textContent = studio.address || 'View profile';
  if (city) {
    city.textContent = studio.city ? `${studio.city}${studio.country ? `, ${studio.country}` : ''}` : '';
    city.style.display = studio.city ? '' : 'none';
  }
  const cover = (studio as any).cover || (studio as any).image;
  image.src = resolveItemCover(cover);
  image.alt = studio.name;
  
  // Set link based on item type
  const itemType = state.itemType;
  if (itemType === 'museum') {
    link.href = `/directory/museums/${studio.slug}`;
  } else if (itemType === 'university') {
    link.href = `/directory/universities/${studio.slug}`;
  } else {
    link.href = `/designers/${studio.slug}`;
  }

  container.classList.add('visible');

  requestAnimationFrame(() => {
    positionStudioCard(studio, state);
    requestAnimationFrame(() => positionStudioCard(studio, state));
  });
}

function hideStudioCard(): void {
  const container = document.getElementById('studio-ui-container');
  if (container) {
    container.classList.remove('visible');
  }
}