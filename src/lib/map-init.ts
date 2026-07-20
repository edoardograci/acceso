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
  recenter: () => void;
  showRecenter: () => void;
  hideRecenter: () => void;
  itemType: 'studio' | 'museum' | 'university';
  // Single, shared hover-pill marker. Created once and reused across every
  // layer rebuild so type switches never leak an extra pill (each leaked pill
  // carried a heavy drop-shadow and stacked into the "big, dark, layered"
  // shadows reported on the map).
  hoverMarker?: any;
  hoverPill?: any;
  showPill?: (text: string, lngLat: any) => void;
  hidePill?: () => void;
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

function convertToGeoJSON(items: MapItem[]): any {
  const result = {
    type: 'FeatureCollection',
    features: items
      .map(s => {
        const lat = typeof s.latitude === 'string' ? parseFloat(s.latitude) : s.latitude;
        const lng = typeof s.longitude === 'string' ? parseFloat(s.longitude) : s.longitude;
        if (lat === null || lng === null || lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return null;

        return {
          type: 'Feature',
          id: s.id,
          properties: {
            id: s.id,
            name: s.name,
            slug: s.slug,
            city: s.city,
            address: s.address,
            cover: (s as any).cover || (s as any).image,
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

// Base stroke width shared between single pins and clusters so the two always
// render at the same pixel weight on every viewport.
const PIN_STROKE_BASE = 3;

// Single (unclustered) pins read a touch large on phones, so shrink them
// on narrow viewports via the layer's circle-radius interpolation.
// Returns [zoom3Radius, zoom12Radius, zoom18Radius].
function getUnclusteredRadius(): [number, number, number] {
  return window.innerWidth <= 768 ? [8, 9, 12] : [9, 10, 13];
}

function setupMapLayers(map: MapLibreMap, state: MapInstance, maplibregl: any) {
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
    data: convertToGeoJSON(state.studiosData as MapItem[]),
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
      'circle-stroke-width': PIN_STROKE_BASE,
      'circle-stroke-color': '#FFFFFF',
    },
  });

  // Cluster count label — only visible for designers (uses Noto Sans glyphs)
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'studios',
    filter: ['has', 'point_count'],
    layout: {
      visibility: isDesigner ? 'visible' : 'none',
      'text-field': '{point_count_abbreviated}',
      'text-font': ['Geist_Bold', 'Noto Sans Bold'],
      'text-size': 13,
    },
    paint: {
      'text-color': '#000000',
    },
  });

  // Individual pin layer — plain yellow circle (no baked letter glyphs),
  // tinted per item type, same sizing/stroke as the previous letter pins.
  const [r3, r12, r18] = getUnclusteredRadius();
  map.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: 'studios',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        3, r3,
        12, r12,
        18, r18,
      ],
      'circle-color': state.itemType === 'museum' ? '#C6F6D6' : state.itemType === 'university' ? '#EAD8FE' : '#EDFF77',
      'circle-stroke-width': PIN_STROKE_BASE,
      'circle-stroke-color': '#FFFFFF',
    },
  });

  // Hover pill: shows the item name above a single pin on hover only.
  // Desktop/touch-capable devices skip it (no hover on touch). Created lazily
  // on first interaction and *reused* (kept on `state`) so switching item
  // types — which rebuilds the layers via setupMapLayers — never leaks a
  // second pill onto the map. Each leaked pill kept its heavy drop-shadow and
  // piled up, producing the "big, dark, layered" shadows reported on the map.
  const isTouch = window.matchMedia('(hover: none)').matches;
  const showPill = (text: string, lngLat: any) => {
    if (isTouch) return;
    // Drop any stale marker left over from a previous layer rebuild before
    // creating a fresh one.
    if (state.hoverMarker) {
      state.hoverMarker.remove();
      state.hoverMarker = undefined;
      state.hoverPill = undefined;
    }
    if (!state.hoverPill) {
      state.hoverPill = document.createElement('div');
      state.hoverPill.className = 'map-hover-pill';
      state.hoverMarker = new maplibregl.Marker({ element: state.hoverPill, anchor: 'bottom', offset: [0, -16] });
    }
    state.hoverPill.textContent = text;
    state.hoverMarker.setLngLat(lngLat).addTo(state.map);
  };
  const hidePill = () => {
    if (state.hoverMarker) state.hoverMarker.remove();
  };

  // Persist the pill handlers on state so they can be (re)used on every layer
  // rebuild without re-registering duplicate listeners on the layer.
  state.showPill = showPill;
  state.hidePill = hidePill;
}

// Bind the per-layer interaction listeners exactly once. Layer rebuilds
// (setupMapLayers, called on every item-type switch) remove the layer but
// cannot detach its listeners, so registering these inside setupMapLayers
// would stack duplicate click/hover handlers each time the user toggles
// between museums, designers and universities.
function bindLayerInteractions(map: MapLibreMap, state: MapInstance) {
  const showPill = (text: string, lngLat: any) => state.showPill?.(text, lngLat);
  const hidePill = () => state.hidePill?.();

  map.on('click', 'unclustered-point', (e: any) => {
    if (!e.features || !e.features.length) return;
    const feature = e.features[0];
    const studio = state.studiosData.find((s: any) => s.id === feature.properties.id);
    if (studio) navigateToStudio(studio, state);
  });

  map.on('mouseenter', 'unclustered-point', (e: any) => {
    if (window.matchMedia('(hover: none)').matches) return;
    state.map.getCanvas().style.cursor = 'pointer';
    const f = e.features && e.features[0];
    if (f) {
      // Don't show the pill on the specific pin that is currently focused
      // (its card is open) — avoids two elements stacked on top of each
      // other. Other pins still show their pill normally.
      const focused = state.currentStudio;
      if (focused && String(f.properties.id) === String(focused.id)) return;
      showPill(f.properties.name || '', f.geometry.coordinates);
    }
  });
  map.on('mouseleave', 'unclustered-point', () => {
    state.map.getCanvas().style.cursor = '';
    hidePill();
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

export async function initializeMap(
  studiosData: MapItem[],
  targetStudioSlug?: string | null,
  itemType: 'studio' | 'museum' | 'university' = 'studio',
  initialBounds?: [[number, number], [number, number]] | null
): Promise<MapInstance | null> {

  
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
    recenter: () => { },
    showRecenter: () => { },
    hideRecenter: () => { },
    itemType,
    hoverMarker: undefined,
    hoverPill: undefined,
    showPill: undefined,
    hidePill: undefined,
  };

  const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

  // Fetch the base style and drop layers we don't need: those that only use
  // the "Noto Sans Italic" font (water-body names, state/region labels,
  // generic "other" POIs) plus all road/highway name + shield labels. This
  // removes an entire glyph stack from the critical path and cuts visual
  // clutter, while keeping useful geographic context (villages, towns,
  // cities, capitals, countries, airports).
  // Falls back to the raw style URL if the fetch/parse fails.
  const STRIP_LAYERS = new Set([
    // Italic-only decorative layers
    'waterway_line_label',
    'water_name_point_label',
    'water_name_line_label',
    'label_other',
    'label_state',
    // Route shields / highway badges (clutter for a directory map)
    'highway-shield-non-us',
    'highway-shield-us-interstate',
    'road_shield_us',
  ]);
  let mapStyle: any = STYLE_URL;
  try {
    const styleRes = await fetch(STYLE_URL);
    if (styleRes.ok) {
      const styleJson = await styleRes.json();
      if (styleJson && Array.isArray(styleJson.layers)) {
        styleJson.layers = styleJson.layers.filter(
          (l: any) => !STRIP_LAYERS.has(l.id)
        );
        // Serve glyphs through our own origin. The /api/fonts proxy serves
        // our self-hosted Geist glyphs locally (fast, no extra network call)
        // and lazily proxies any other fontstack (Noto Sans) from
        // OpenFreeMap — but ONLY for the codepoint ranges a visible label
        // actually needs, so non-Latin glyphs are never fetched until the
        // user pans over a region that uses them. This keeps the Europe-first
        // homepage load as fast as it already is.
        // Fontstack names use underscores to match the on-disk folder names
        // (Geist_Regular / Geist_Bold); MapLibre URL-encodes the stack and
        // won't resolve spaces otherwise.
        styleJson.glyphs = `${window.location.origin}/api/fonts/{fontstack}/{range}.pbf`;
        // Each label layer gets a fallback stack: Latin/covered codepoints
        // render in Geist (local), everything else falls back to Noto Sans
        // (proxied on demand). MapLibre picks the first font that has the
        // glyph, so we never mix fonts within a single label.
        const FONT_MAP: Record<string, string[]> = {
          'Noto Sans Regular': ['Geist_Regular', 'Noto Sans Regular'],
          'Noto Sans Bold': ['Geist_Bold', 'Noto Sans Bold'],
          'Noto Sans Italic': ['Geist_Regular', 'Noto Sans Regular'],
        };
        for (const layer of styleJson.layers) {
          const tf = layer?.layout?.['text-font'];
          if (Array.isArray(tf)) {
            const mapped = tf.flatMap((f: string) => FONT_MAP[f] || [f]);
            layer.layout['text-font'] = Array.from(new Set(mapped));
          }
        }
        mapStyle = styleJson;
      }
    }
  } catch (e) {
    console.warn('[map] failed to pre-process style, using raw URL:', e);
  }

  // When a location is known up-front (e.g. a /designers/in/<place> page),
  // start the map framed on that area instead of the default Europe view so
  // there is no visible recenter animation after the tiles load.
  const initialCenter: [number, number] = initialBounds
    ? [
        (initialBounds[0][0] + initialBounds[1][0]) / 2,
        (initialBounds[0][1] + initialBounds[1][1]) / 2,
      ]
    : [12.0, 48.0];

  // Instantiate MapLibre Map
  state.map = new maplibregl.Map({
    container: 'map',
    style: mapStyle,
    center: initialCenter,
    zoom: 4,
    minZoom: 2,
    maxZoom: 18,
    attributionControl: false,
    fadeDuration: 100,
  });

  state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  // "Recenter" pill — appears only after the user moves the map away from its
  // loaded framing, and disappears once they recenter. We capture the camera
  // exactly as the map first settles, so recentering restores the initial view
  // (homepage world view, or the city the designers page was framed on).
  const recenterBtn = document.getElementById('map-recenter-btn');
  let loadedCamera: { center: [number, number]; zoom: number; bearing: number; pitch: number } | null = null;
  let isProgrammaticMove = false;
  let recenterVisible = false;

  const showRecenter = () => {
    if (!recenterBtn || recenterVisible) return;
    recenterVisible = true;
    recenterBtn.classList.add('visible');
  };
  const hideRecenter = () => {
    if (!recenterBtn || !recenterVisible) return;
    recenterVisible = false;
    recenterBtn.classList.remove('visible');
  };

  // Track movements triggered by the user (drag, scroll, pinch, cluster zoom)
  // vs. movements our own code performs (recenter / flyTo / fitBounds). The
  // latter must not pop the button back up.
  // Show the button as soon as the user starts a non-programmatic move, so
  // even a tiny pan reveals it (a small drag can change center by < 0.001°,
  // which a post-hoc threshold check would wrongly ignore).
  state.map.on('mousedown touchstart', () => { isProgrammaticMove = false; });
  state.map.on('wheel', () => { isProgrammaticMove = false; });
  state.map.on('moveend', () => { isProgrammaticMove = false; });
  state.map.on('movestart', () => {
    if (isProgrammaticMove || !loadedCamera) return;
    if (!recenterVisible) showRecenter();
  });

  let isMapLoaded = false;
  let pendingData: { studios: MapItem[], autoCenter: boolean, shouldCluster: boolean } | null = null;
  let layerInteractionsBound = false;

  function updateMapData(studios: MapItem[], autoCenter: boolean = true, shouldCluster: boolean = true) {
    if (!isMapLoaded) {
      pendingData = { studios, autoCenter, shouldCluster };
      return;
    }

    const source: any = state.map.getSource('studios');
    if (source) {
      source.setData(convertToGeoJSON(studios));
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

    isMapLoaded = true;
    setupMapLayers(state.map, state, maplibregl);

    // Bind the per-layer click/hover listeners exactly once (the layer gets
    // rebuilt on every item-type switch, which would otherwise stack
    // duplicate handlers). The pill handlers are created in setupMapLayers
    // and stored on state.
    if (!layerInteractionsBound) {
      bindLayerInteractions(state.map, state);
      layerInteractionsBound = true;
    }

    // Update dynamic layers
    const initialStudios = pendingData ? pendingData.studios : state.studiosData;
    const fit = pendingData ? pendingData.autoCenter : false;
    const cluster = pendingData ? pendingData.shouldCluster : true;

    updateMapData(initialStudios, fit, cluster);
    pendingData = null;

      // If a location was supplied up-front, frame the view on it immediately
      // (no animation) so the map is already centered on load.
      if (initialBounds) {
        state.map.resize();
        const camera = state.map.cameraForBounds(initialBounds, { padding: 50 });
        if (camera) {
          const zoom = camera.zoom != null ? Math.min(camera.zoom, 13) : 13;
          state.map.jumpTo({ center: camera.center, zoom });
        }
      }

      // Capture the just-loaded camera as the "home" view once everything has
      // settled. We wait for `idle` so the initial fitBounds (if any) or the
      // up-front framing is fully applied before we snapshot the position.
      const captureLoadedCamera = () => {
        if (loadedCamera) return;
        const c = state.map.getCenter();
        loadedCamera = {
          center: [c.lng, c.lat],
          zoom: state.map.getZoom(),
          bearing: state.map.getBearing(),
          pitch: state.map.getPitch(),
        };
      };
      if (state.map.loaded()) {
        captureLoadedCamera();
      } else {
        state.map.once('idle', captureLoadedCamera);
      }
  });

  // Track interaction
  state.map.on('mousedown touchstart', () => {
    state.isUserInteracting = true;
    isProgrammaticMove = false;
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
      const expansionZoom = zoomResult instanceof Promise
        ? await zoomResult
        : await new Promise<number>((resolve, reject) =>
          source.getClusterExpansionZoom(clusterId, (err: any, z: number) =>
            err ? reject(err) : resolve(z)
          )
        );
      // expansionZoom is the *minimum* zoom at which the cluster first splits,
      // so zooming to exactly that leaves any slightly-outlier pins in a fresh
      // edge cluster — forcing the user to click repeatedly. Overshoot the
      // split point so each click unfolds the cluster further and stray pins
      // get revealed in far fewer clicks. The coarse overview clusters (set by
      // clusterRadius/clusterMaxZoom) are untouched; we only zoom in more per tap.
      const clickZoomDelta = 2.75;
      const nextZoom = Math.min(expansionZoom + clickZoomDelta, 18);
      state.map.easeTo({
        center: (features[0].geometry as any).coordinates,
        zoom: nextZoom
      });
      // Zooming into a cluster moves the camera off the loaded framing.
      showRecenter();
    } catch (err) {
      console.warn('getClusterExpansionZoom failed:', err);
    }
  });

  setupStudioCard(state);
  setupNavigation(state);

  // Keep single-pin stroke and the cluster stroke consistent when crossing the
  // mobile/desktop breakpoint.
  const syncPinSize = () => {
    if (state.map.getLayer('clusters')) {
      state.map.setPaintProperty('clusters', 'circle-stroke-width', PIN_STROKE_BASE);
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

    // Rebuild source + layers so cluster:true/false matches the new itemType
    setupMapLayers(state.map, state, maplibregl);
    updateMapData(studios, false, true);
  };

  state.showAllStudios = () => {
    state.studiosData = state.allStudiosData;
    updateMapData(state.allStudiosData, false, true);
  };

  state.navigateToStudio = (studio: MapItem) => {
    navigateToStudio(studio, state);
  };

  state.recenter = () => {
    if (!loadedCamera) return;
    // Mark the move as programmatic so the button doesn't reappear while we
    // glide back to the loaded framing.
    isProgrammaticMove = true;
    hideRecenter();
    state.map.easeTo({
      center: loadedCamera.center,
      zoom: loadedCamera.zoom,
      bearing: loadedCamera.bearing,
      pitch: loadedCamera.pitch,
      duration: 700,
      essential: true,
    });
  };

  state.showRecenter = () => {
    if (!loadedCamera) return;
    showRecenter();
  };

  state.hideRecenter = () => {
    isProgrammaticMove = true;
    hideRecenter();
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
        // Clicking a pin moves the camera off the loaded framing — reveal the
        // recenter pill so the user can return to the original view.
        showRecenter();
        showStudioCard(targetStudio!, state);

        // Clean up URL parameter
        window.history.replaceState({}, '', '/');
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
      hideStudioCard(state);
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
    // Focusing a pin moves the camera off the loaded framing.
    state.showRecenter();
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
    link.href = `/directory/schools/${studio.slug}`;
  } else {
    link.href = `/designers/${studio.slug}`;
  }

  container.classList.add('visible');

  requestAnimationFrame(() => {
    positionStudioCard(studio, state);
    requestAnimationFrame(() => positionStudioCard(studio, state));
  });
}

function hideStudioCard(state: MapInstance): void {
  const container = document.getElementById('studio-ui-container');
  if (container) {
    container.classList.remove('visible');
  }
  // Release focus so the pin's hover pill works again after closing the card.
  state.currentStudio = null;
}