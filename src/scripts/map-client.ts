import { initializeMap } from '../lib/map-init';

const CITY_COORDS: Record<string, [number, number]> = {
  Milan: [9.19, 45.46],
  Seoul: [126.98, 37.57],
  London: [-0.12, 51.51],
  Berlin: [13.40, 52.52],
  Paris: [2.35, 48.86],
  Copenhagen: [12.57, 55.68],
  Tokyo: [139.69, 35.69],
  Stockholm: [18.07, 59.33],
};

const STUDIOS_PAGE_SIZE = 12;

// Shared with renderCityStudiosPage(), bindMapInteractions(), and
// switchItemType() — the single source of truth for which real,
// SEO-indexable directory path each map type maps to.
function basePathForType(type: 'studio' | 'museum' | 'university'): string {
  return type === 'museum' ? '/directory/museums' : type === 'university' ? '/directory/schools' : '/designers';
}

function hasCoords(studio: { latitude?: unknown; longitude?: unknown }): boolean {
  const lat = typeof studio.latitude === 'string' ? parseFloat(studio.latitude) : studio.latitude;
  const lng = typeof studio.longitude === 'string' ? parseFloat(studio.longitude) : studio.longitude;
  return lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng);
}

function matchesCity(
  studio: { city?: string | null; city_slug?: string | null; name?: string },
  city: string,
  slug?: string
): boolean {
  const target = city.toLowerCase();
  const slugTarget = (slug || city).toLowerCase().replace(/\s+/g, '-');
  const studioCity = (studio.city || '').toLowerCase();
  const studioSlug = (studio.city_slug || '').toLowerCase();
  return (
    studioCity === target ||
    studioCity.startsWith(`${target},`) ||
    studioCity.startsWith(`${target} `) ||
    studioSlug === slugTarget ||
    studioSlug === target.replace(/\s+/g, '-')
  );
}

function resolveCover(cover?: string | null): string {
  if (!cover) return '';
  if (cover.startsWith('http')) {
    if (cover.includes('img.acceso.design') || cover.includes('mood.acceso.design')) {
      return `${window.location.origin}/cdn/${new URL(cover).pathname.replace(/^\/+/, '')}`;
    }
    return cover;
  }
  return `${window.location.origin}/cdn/${cover.replace(/^\/+/, '')}`;
}

function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function medianPoint(points: { lat: number; lng: number }[]): { lat: number; lng: number } {
  return {
    lat: median(points.map((p) => p.lat)),
    lng: median(points.map((p) => p.lng)),
  };
}

function flyToCity(
  mapInstance: Awaited<ReturnType<typeof initializeMap>>,
  cityStudios: any[],
  city: string
) {
  if (!mapInstance?.map) return;
  mapInstance.hideRecenter?.();

  const toNum = (v: unknown) => {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    return typeof n === 'number' && !Number.isNaN(n) ? n : null;
  };

  // Compute the center from the actual items' coordinates so any city
  // (not just the hardcoded ones) zooms correctly.
  const points = cityStudios
    .map((s) => ({ lat: toNum(s.latitude), lng: toNum(s.longitude) }))
    .filter((p) => p.lat != null && p.lng != null) as { lat: number; lng: number }[];

  if (cityStudios.length > 0) {
    mapInstance.updateStudios(cityStudios, false, cityStudios.length > 8);
    if (points.length > 0) {
      // Use the median (not the mean) of the coordinates so a stray
      // out-of-city studio can't drag the zoom center away from the
      // actual cluster (e.g. a Milan entry tagged with SF coordinates).
      const center = medianPoint(points);
      mapInstance.map.flyTo({
        center: [center.lng, center.lat],
        zoom: cityStudios.length > 8 ? 11 : 13,
        duration: 900,
      });
      return;
    }
  }

  // Fallback to the hardcoded coordinates for cities without any geo-tagged items
  const coords = CITY_COORDS[city];
  if (coords) {
    mapInstance.map.flyTo({ center: coords, zoom: 12, duration: 900 });
  }
}

function init() {
  let allStudios: any[] = (window as any).allStudiosData ?? (window as any).studiosData ?? [];
  let mapStudios: any[] = (window as any).studiosData ?? [];
  let mapInstance: Awaited<ReturnType<typeof initializeMap>> | null = null;
  let panelOrigin: 'quick' | 'browse' = 'quick';
  let panelView: 'quick' | 'browse' | 'studios' = (window as any).isMyMap ? 'browse' : 'quick';
  let currentCityName = '';
  let currentCityStudiosList: any[] = [];
  let currentStudiosPage = 1;
  let currentItemType: 'studio' | 'museum' | 'university' = (window as any).itemType || 'studio';

  // Get all data types for switching
  const allDataByType = (window as any).allStudiosDataByType || {
    studio: [],
    museum: [],
    university: []
  };

  const explorePanel = document.getElementById('explore-panel') as HTMLElement | null;
  const explorePanelBackdrop = document.getElementById('explore-panel-backdrop');
  const quickNavDefault = document.getElementById('quick-nav-default');
  const cityBrowse = document.getElementById('city-browse');
  const cityStudios = document.getElementById('city-studios');
  const cityStudiosGrid = document.getElementById('city-studios-grid');
  const cityStudiosTitle = document.getElementById('city-studios-title');
  const cityStudiosPagination = document.getElementById('city-studios-pagination');
  const cityStudiosPrev = document.getElementById('city-studios-prev') as HTMLButtonElement | null;
  const cityStudiosNext = document.getElementById('city-studios-next') as HTMLButtonElement | null;
  const cityStudiosPageInfo = document.getElementById('city-studios-page-info');
  const cityStudiosBack = document.getElementById('city-studios-back');
  const moreCitiesBtn = document.getElementById('more-cities-btn');
  const cityBrowseBack = document.getElementById('city-browse-back');
  const citySearch = document.getElementById('city-search') as HTMLInputElement | null;
  const mapBrowseFab = document.getElementById('map-browse-fab');
  const breadcrumbBrowse = document.getElementById('breadcrumb-browse');
  const breadcrumbStudios = document.getElementById('breadcrumb-studios');

  function isMobilePanel() {
    return window.innerWidth <= 1024;
  }

  // Hide the floating studio card overlay (shown when a pin is focused).
  // Any panel transition means we've left that studio's context, so the card
  // must be dismissed — otherwise it lingers over the map in other cities.
  function hideStudioCardUI() {
    document.getElementById('studio-ui-container')?.classList.remove('visible');
  }

  function isOnQuickNavDefault() {
    return quickNavDefault && !quickNavDefault.classList.contains('hidden');
  }

  function updatePanelNavState() {
    const navigated = !isOnQuickNavDefault();
    explorePanel?.classList.toggle('explore-panel--navigated', navigated);
    if (!isMobilePanel()) {
      explorePanel?.classList.remove('is-compact');
    }
  }

  function setPanelSnap(mode: 'closed' | 'compact' | 'full') {
    if (!isMobilePanel()) return;

    if (mode === 'closed') {
      closeMobilePanel();
      return;
    }

    explorePanel?.classList.add('is-open');
    explorePanelBackdrop?.classList.add('is-visible');
    explorePanelBackdrop?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (mode === 'compact') {
      explorePanel?.classList.add('is-compact');
      const inner = explorePanel?.querySelector('.explore-panel-inner') as HTMLElement | null;
      if (inner) inner.scrollTop = 0;
    } else {
      explorePanel?.classList.remove('is-compact');
    }
  }

  function openMobilePanel(full = true) {
    setPanelSnap(full ? 'full' : 'compact');
    updatePanelNavState();
  }

  function closeMobilePanel() {
    explorePanel?.classList.remove('is-open', 'is-compact');
    explorePanelBackdrop?.classList.remove('is-visible');
    explorePanelBackdrop?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function hideAllPanelViews() {
    quickNavDefault?.classList.add('hidden');
    cityBrowse?.classList.add('hidden');
    cityStudios?.classList.add('hidden');
  }

  function renderCityStudiosPage() {
    if (!cityStudiosGrid) return;

    const totalPages = Math.max(1, Math.ceil(currentCityStudiosList.length / STUDIOS_PAGE_SIZE));
    currentStudiosPage = Math.min(currentStudiosPage, totalPages);
    const start = (currentStudiosPage - 1) * STUDIOS_PAGE_SIZE;
    const pageItems = currentCityStudiosList.slice(start, start + STUDIOS_PAGE_SIZE);

    if (pageItems.length === 0) {
      cityStudiosGrid.innerHTML = '<p class="city-studios-empty">No studios found in this city.</p>';
      cityStudiosPagination?.classList.add('hidden');
      return;
    }

    const basePath = basePathForType(currentItemType);

    cityStudiosGrid.innerHTML = pageItems
      .map((s) => {
        const cover = resolveCover(s.cover || s.image);
        const location = `${s.city || ''}${s.country ? `, ${s.country}` : ''}`;
        const lat = typeof s.latitude === 'string' ? s.latitude : (s.latitude != null ? String(s.latitude) : '');
        const lng = typeof s.longitude === 'string' ? s.longitude : (s.longitude != null ? String(s.longitude) : '');
        return `
          <a href="${basePath}/${encodeURIComponent(s.slug || '')}" class="city-studio-card" data-lat="${lat}" data-lng="${lng}" data-slug="${s.slug || ''}">
            <div class="city-studio-card-media">
              ${cover ? `<img src="${cover}" alt="${s.name || ''}" loading="lazy" decoding="async" />` : ''}
            </div>
            <h3 class="city-studio-card-name">${s.name || ''}</h3>
            <p class="city-studio-card-location">${location}</p>
          </a>
        `;
      })
      .join('');

    if (totalPages > 1 && cityStudiosPagination) {
      cityStudiosPagination.classList.remove('hidden');
      if (cityStudiosPageInfo) {
        cityStudiosPageInfo.textContent = `${currentStudiosPage} / ${totalPages}`;
      }
      if (cityStudiosPrev) cityStudiosPrev.disabled = currentStudiosPage <= 1;
      if (cityStudiosNext) cityStudiosNext.disabled = currentStudiosPage >= totalPages;
    } else {
      cityStudiosPagination?.classList.add('hidden');
    }
  }

  function renderCityStudios(cityName: string, slug: string, country?: string) {
    currentCityStudiosList = allStudios.filter((s) => matchesCity(s, cityName, slug));
    currentStudiosPage = 1;

    if (cityStudiosTitle) {
      const count = currentCityStudiosList.length;
      const location = country ? `${cityName}, ${country}` : cityName;
      const itemTypeLabel = currentItemType === 'museum'
        ? (count === 1 ? 'museum' : 'museums')
        : currentItemType === 'university'
        ? (count === 1 ? 'school' : 'schools')
        : (count === 1 ? 'studio' : 'studios');
      cityStudiosTitle.textContent = `${location} · ${count} ${itemTypeLabel}`;
    }

    renderCityStudiosPage();
  }

  function updateBreadcrumb() {
    const sep = '<span class="breadcrumb-separator" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>';
    const mapLink = '<a href="/" class="breadcrumb-item">Map</a>';
    let html = mapLink;

    if (panelView === 'browse') {
      html += sep + '<span class="breadcrumb-current">More cities</span>';
    } else if (panelView === 'studios') {
      if (panelOrigin === 'browse') {
        html += sep + '<a href="#" class="breadcrumb-item" data-bc="more">More cities</a>' + sep + `<span class="breadcrumb-current">${currentCityName}</span>`;
      } else {
        html += sep + `<span class="breadcrumb-current">${currentCityName}</span>`;
      }
    }

    [breadcrumbBrowse, breadcrumbStudios].forEach((el) => {
      if (el) el.innerHTML = html;
    });
  }

  function showCityStudios(cityName: string, slug: string, country?: string, from: 'quick' | 'browse' = 'browse') {
    hideStudioCardUI();
    panelOrigin = from;
    panelView = 'studios';
    currentCityName = cityName;
    hideAllPanelViews();
    cityStudios?.classList.remove('hidden');
    renderCityStudios(cityName, slug, country);
    updatePanelNavState();
    updateBreadcrumb();

    const withCoords = allStudios.filter((s) => matchesCity(s, cityName, slug) && hasCoords(s));
    flyToCity(mapInstance, withCoords, cityName);

    if (isMobilePanel()) openMobilePanel(true);
  }

  function showAllStudios() {
    if (!mapInstance) return;
    // Restore the full dataset on the map and zoom back out to the world view
    // so going "back" from a city no longer leaves only that city's pins shown.
    mapInstance.hideRecenter?.();
    mapInstance.updateStudios(mapStudios, false, true);
    if (mapInstance.map) {
      mapInstance.map.flyTo({ center: [12.0, 48.0], zoom: 4, duration: 800 });
    }
  }

  function showQuickNav(open = true) {
    // In personal "my map" mode the quick-nav default (title +
    // paragraph + quick-link cards) must never appear, so it's a
    // hard no-op there.
    if ((window as any).isMyMap) return;
    hideStudioCardUI();
    panelView = 'quick';
    currentCityName = '';
    hideAllPanelViews();
    quickNavDefault?.classList.remove('hidden');
    showAllStudios();
    updatePanelNavState();
    updateBreadcrumb();
    if (open && isMobilePanel()) openMobilePanel(true);
  }

  function showCityBrowse() {
    hideStudioCardUI();
    panelOrigin = 'browse';
    panelView = 'browse';
    currentCityName = '';
    hideAllPanelViews();
    cityBrowse?.classList.remove('hidden');
    citySearch?.focus();
    showAllStudios();
    updatePanelNavState();
    updateBreadcrumb();
    if (isMobilePanel()) openMobilePanel(true);
  }

  function hideCityBrowse() {
    if (cityStudios && !cityStudios.classList.contains('hidden')) {
      if (panelOrigin === 'browse') showCityBrowse();
      else showQuickNav();
      return;
    }
    showQuickNav();
  }

  function hideCityStudios() {
    if (panelOrigin === 'browse') showCityBrowse();
    else showQuickNav();
  }

  function selectCity(cityName: string, slug?: string, country?: string, from: 'quick' | 'browse' = 'browse') {
    showCityStudios(cityName, slug || cityName.toLowerCase().replace(/\s+/g, '-'), country, from);
  }

  function bindMapInteractions() {
    if (!mapInstance) return;

    document.querySelectorAll('.quick-nav-card[data-city]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const el = btn as HTMLElement;
        const city = el.dataset.city;
        if (!city) return;
        const href = el.getAttribute('href');
        if (href) window.history.pushState({}, '', href);
        selectCity(city, city.toLowerCase().replace(/\s+/g, '-'), undefined, 'quick');
      });
    });

    document.querySelectorAll('.city-browse-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const el = item as HTMLElement;
        const city = el.dataset.city;
        const slug = el.dataset.slug;
        const country = el.querySelector('.city-browse-meta')?.textContent || '';
        if (!city) return;
        const href = el.getAttribute('href');
        if (href) window.history.pushState({}, '', href);
        selectCity(city, slug, country, 'browse');
      });
    });
  }

  function setupPanelSwipe() {
    if (!explorePanel) return;

    const compactHeight = () => Math.round(window.innerHeight * 0.52);
    const fullHeight = () => Math.round(window.innerHeight * 0.88);

    let startY = 0;
    let startMaxH = 0;
    let currentMaxH = 0;
    let startedOnHandle = false;
    let isDragging = false;

    const onTouchStart = (e: TouchEvent) => {
      if (!isMobilePanel() || !explorePanel!.classList.contains('is-open')) return;
      const target = e.target as HTMLElement | null;
      const onHandle = !!(target && target.closest('.explore-panel-handle'));
      const inner = explorePanel!.querySelector('.explore-panel-inner') as HTMLElement | null;
      // Only start a drag from the body when the list is scrolled to the very
      // top — otherwise the gesture belongs to scrolling the list.
      if (!onHandle && !(inner && inner.scrollTop <= 0)) return;
      startedOnHandle = onHandle;
      startY = e.touches[0].clientY;
      startMaxH = explorePanel!.classList.contains('is-compact') ? compactHeight() : fullHeight();
      currentMaxH = startMaxH;
      isDragging = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const inner = explorePanel!.querySelector('.explore-panel-inner') as HTMLElement | null;
      if (!startedOnHandle && inner && inner.scrollTop > 0) return;

      const delta = e.touches[0].clientY - startY;
      // When expanded (not compact), an upward gesture scrolls the list rather
      // than expanding further — only a downward gesture collapses it.
      if (!startedOnHandle && delta < 0 && !explorePanel!.classList.contains('is-compact')) return;

      // Drag up (negative delta) grows the sheet; drag down shrinks it.
      let next = startMaxH - delta;
      const full = fullHeight();
      if (next > full) next = full + (next - full) * 0.15;
      if (next < 0) next = next * 0.35;

      currentMaxH = next;
      explorePanel!.style.transition = 'none';
      explorePanel!.style.maxHeight = `${Math.max(0, next)}px`;
    };

    const onTouchEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      explorePanel!.style.transition = '';

      const compact = compactHeight();
      const full = fullHeight();
      const mid = (compact + full) / 2;

      explorePanel!.style.maxHeight = '';

      if (currentMaxH <= compact * 0.45) {
        closeMobilePanel();
      } else if (currentMaxH >= mid) {
        setPanelSnap('full');
      } else {
        setPanelSnap('compact');
      }
    };

    explorePanel.addEventListener('touchstart', onTouchStart, { passive: true });
    explorePanel.addEventListener('touchmove', onTouchMove, { passive: true });
    explorePanel.addEventListener('touchend', onTouchEnd, { passive: true });
    explorePanel.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }

  const r2Domain = import.meta.env.DEV
    ? 'https://json.acceso.design'
    : `${window.location.origin}/cdn`;

  async function apiFetch(url: string): Promise<Response> {
    if (import.meta.env.DEV) {
      return fetch(`/api/dev-proxy?url=${encodeURIComponent(url)}`);
    }
    return fetch(url);
  }

  async function refreshStudiosFromApi() {
    try {
      const endpoint =
        currentItemType === 'museum'
          ? `${r2Domain}/museums.json`
          : currentItemType === 'university'
          ? `${r2Domain}/universities.json`
          : `${r2Domain}/test-studios.json`;
      const res = await apiFetch(endpoint);
      if (!res.ok) return;

      const raw = await res.json();
      const all = Array.isArray(raw) ? raw : (raw.items || []);
      allStudios = all;
      const withCoords = all.filter((s: any) => hasCoords(s));
      if (withCoords.length === 0) return;

      mapStudios = withCoords;
      if (mapInstance?.replaceAllStudios) {
        mapInstance.replaceAllStudios(withCoords);
      } else if (mapInstance?.updateStudios) {
        mapInstance.updateStudios(withCoords, false, true);
      }
    } catch {
      /* map still works with initial set */
    }
  }

  function switchItemType(newType: 'studio' | 'museum' | 'university', opts: { skipHistory?: boolean } = {}) {
    if (newType === currentItemType) return;
    
    currentItemType = newType;
    const newData = allDataByType[newType] || [];
    
    // Close any open studio card
    const studioUiContainer = document.getElementById('studio-ui-container');
    studioUiContainer?.classList.remove('visible');

    // In personal "my map" mode the panel always stays on the
    // saved-cities list (the "More cities" view) — never fall back
    // to the quick-nav default, which would re-show the title/paragraph.
    if ((window as any).isMyMap) {
      showCityBrowse();
    } else {
      // Reset panel back to quick-nav so it always looks the same after switching,
      // but don't open the mobile browse sheet (only the browse button should)
      showQuickNav(false);
    }

    // Update map data
    mapStudios = newData;
    allStudios = newData;
    
    // Update window variables
    (window as any).studiosData = newData;
    (window as any).allStudiosData = newData;
    (window as any).itemType = newType;
    
    // Update map instance itemType
    if (mapInstance) {
      (mapInstance as any).itemType = newType;
    }
    
    // Update map (swap type-specific icons)
    if (mapInstance?.replaceAllStudios) {
      mapInstance.replaceAllStudios(newData);
    } else if (mapInstance?.updateStudios) {
      mapInstance.updateStudios(newData, false, true);
    }
    // Reset the view to the same default center/zoom as the initial map load,
    // instead of staying zoomed in on the previous type's position.
    if (mapInstance?.map) {
      mapInstance.map.flyTo({ center: [12.0, 48.0], zoom: 4, duration: 800 });
    }
    
    // Update URL without refresh
    if (!opts.skipHistory) {
      const url = new URL(window.location.href);
      url.searchParams.set('type', newType === 'studio' ? 'designers' : newType === 'museum' ? 'museums' : 'schools');
      window.history.replaceState({}, '', url.toString());
    }
    
    // Update filter button states
    document.querySelectorAll('.map-filter-btn').forEach(btn => {
      const btnType = btn.getAttribute('href')?.includes('designers') ? 'studio' : 
                      btn.getAttribute('href')?.includes('museums') ? 'museum' : 'university';
      btn.classList.toggle('active', btnType === newType);
    });
    
    // Update page title/description
    const titleEl = document.querySelector('.explore-title');
    const descEl = document.querySelector('.explore-description');
    if (titleEl) {
      titleEl.textContent = newType === 'museum' ? 'Explore Museums & Foundations' : 
                           newType === 'university' ? 'Explore Design Schools' : 
                           'Explore Local Design';
    }
    if (descEl) {
      descEl.textContent = newType === 'museum' ? 
        'A directory of permanent collections and institutions preserving design culture and history.' :
        newType === 'university' ?
        'A directory of design schools and institutions shaping the future of design education.' :
        'A modern index of independent furniture & industrial design studios, with projects and events. Built for browsing by city and finding your next collaboration.';
    }
    
    // Update quick-nav card labels AND hrefs to reflect the current type
    // (e.g. "Designers in Milan" -> "Design schools in Milan", and the link
    // target from /designers/in/milan -> /directory/schools/in/milan).
    const typePhrase =
      newType === 'museum' ? 'Design museums in' :
      newType === 'university' ? 'Design schools in' : 'Designers in';
    const newBasePath = basePathForType(newType);

    // Per-city item counts for the new type — used to decide both display
    // (hide cities with 0 items) and, importantly, whether a city is even
    // given a real href at all. A city with 0 items for this type has no
    // real page to link to (its /in/<city> page 404s), so it must not be
    // left crawlable.
    const cityCounts: Record<string, number> = {};
    newData.forEach((item: any) => {
      let slug = item.city_slug;
      if (!slug && item.city) {
        slug = item.city.toLowerCase().replace(/\s+/g, '-');
      }
      if (!slug && item.slug) {
        slug = item.slug;
      }
      if (slug) {
        cityCounts[slug] = (cityCounts[slug] || 0) + 1;
      }
    });

    document.querySelectorAll('.quick-nav-card[data-city]').forEach((btn) => {
      const el = btn as HTMLElement;
      const cityName = el.dataset.city;
      if (!cityName) return;
      const labelEl = el.querySelector('.quick-nav-card-label');
      if (labelEl) labelEl.textContent = `${typePhrase} ${cityName}`;
      const citySlug = cityName.toLowerCase().replace(/\s+/g, '-');
      const count = cityCounts[citySlug] || 0;
      if (count > 0) {
        el.setAttribute('href', `${newBasePath}/in/${citySlug}`);
      } else {
        el.removeAttribute('href');
      }
    });

    const cityBrowseListEl = document.getElementById('city-browse-list');
    if (cityBrowseListEl) {
      const itemTypeLabel = newType === 'museum' ? 'museums' : newType === 'university' ? 'schools' : 'studios';
      cityBrowseListEl.querySelectorAll('.city-browse-item').forEach(item => {
        const el = item as HTMLElement;
        const slug = el.dataset.slug;
        const count = slug ? (cityCounts[slug] || 0) : 0;
        // Hide cities with 0 items for the current type
        el.classList.toggle('hidden', count === 0);
        const nameEl = el.querySelector('.city-browse-name');
        if (nameEl) {
          const cityName = nameEl.textContent?.split('·')[0].trim() || '';
          nameEl.textContent = `${cityName} · ${count} ${itemTypeLabel}`;
        }
        if (!slug) return;
        if (count > 0) {
          el.setAttribute('href', `${newBasePath}/in/${slug}`);
        } else {
          el.removeAttribute('href');
        }
      });
    }
  }

  function openCityFromUrl() {
    if ((window as any).isMyMap) return;
    const params = new URLSearchParams(window.location.search);
    const citySlug = params.get('city');
    if (!citySlug || !mapInstance) return;
    // Resolve the display name from the city browse list when available.
    const itemEl = document.querySelector(`.city-browse-item[data-slug="${citySlug}"]`) as HTMLElement | null;
    const cityName = itemEl?.dataset.city || citySlug;
    const countryMeta = itemEl?.querySelector('.city-browse-meta')?.textContent?.trim() || undefined;
    showCityStudios(cityName, citySlug, countryMeta, 'browse');
  }

  async function tryInitMap() {
    try {
      mapInstance = await initializeMap(mapStudios, (window as any).studioSlug, currentItemType);
    } catch (e) {
      console.error('Failed to initialize map:', e);
      return;
    }

    bindMapInteractions();
    // In personal "my map" mode, open directly on the saved-cities
    // list (the "More cities" view) instead of the quick-nav default.
    if ((window as any).isMyMap) {
      showCityBrowse();
    }
    if (!(window as any).isMyMap) {
      refreshStudiosFromApi();
      openCityFromUrl();
    }
  }

  moreCitiesBtn?.addEventListener('click', showCityBrowse);
  cityBrowseBack?.addEventListener('click', hideCityBrowse);
  cityStudiosBack?.addEventListener('click', hideCityStudios);

  // Breadcrumb "More cities" link returns to the city browse list
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-bc="more"]')) {
      e.preventDefault();
      showCityBrowse();
    }
  });

  explorePanelBackdrop?.addEventListener('click', closeMobilePanel);

  cityStudiosPrev?.addEventListener('click', () => {
    if (currentStudiosPage > 1) {
      currentStudiosPage -= 1;
      renderCityStudiosPage();
      cityStudiosGrid?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  cityStudiosNext?.addEventListener('click', () => {
    const totalPages = Math.ceil(currentCityStudiosList.length / STUDIOS_PAGE_SIZE);
    if (currentStudiosPage < totalPages) {
      currentStudiosPage += 1;
      renderCityStudiosPage();
      cityStudiosGrid?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // Clicking a list card: if the item is on the map (has coordinates) center
  // its pin and reveal the card above it (which links to the slug). If it's
  // list-only (no coordinates) let the card navigate straight to the slug.
  cityStudiosGrid?.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest('.city-studio-card') as HTMLElement | null;
    if (!card) return;

    const lat = card.dataset.lat;
    const lng = card.dataset.lng;
    const slug = card.dataset.slug;

    if (lat && lng && mapInstance) {
      e.preventDefault();
      const studio =
        mapInstance.studiosData.find((s: any) => s.slug === slug) ||
        allStudios.find((s: any) => s.slug === slug);
      if (studio) {
        mapInstance.navigateToStudio(studio);
        // On mobile the sheet covers the map, so collapse it to reveal the
        // centered pin and the card above it.
        if (isMobilePanel()) closeMobilePanel();
      }
    }
  });

  mapBrowseFab?.addEventListener('click', () => {
    if (isMobilePanel()) {
      if (explorePanel?.classList.contains('is-open')) {
        if (isOnQuickNavDefault()) {
          closeMobilePanel();
        } else {
          showQuickNav();
        }
        return;
      }
    }

    if (cityStudios && !cityStudios.classList.contains('hidden')) {
      openMobilePanel(true);
      return;
    }
    if (cityBrowse && !cityBrowse.classList.contains('hidden')) {
      showCityBrowse();
      return;
    }
    showQuickNav();
  });

  citySearch?.addEventListener('input', () => {
    const q = citySearch.value.toLowerCase().trim();
    document.querySelectorAll('.city-browse-item').forEach((item) => {
      const el = item as HTMLElement;
      // Don't surface cities hidden for the current type
      if (el.classList.contains('hidden')) {
        el.style.display = 'none';
        return;
      }
      const name = (el.querySelector('.city-browse-name')?.textContent || '').toLowerCase();
      const meta = (el.querySelector('.city-browse-meta')?.textContent || '').toLowerCase();
      el.style.display = !q || name.includes(q) || meta.includes(q) ? '' : 'none';
    });
  });

  const fullscreenBtn = document.getElementById('map-fullscreen-btn');
  const mapPanel = document.getElementById('map-panel');
  fullscreenBtn?.addEventListener('click', () => {
    mapPanel?.classList.toggle('map-panel--fullscreen');
    setTimeout(() => mapInstance?.map?.resize(), 300);
  });

  // Recenter pill: glide back to the map's original loaded framing.
  const recenterBtn = document.getElementById('map-recenter-btn');
  recenterBtn?.addEventListener('click', () => {
    mapInstance?.recenter();
  });

  // Handle map filter button clicks for client-side switching
  document.querySelectorAll('.map-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const href = btn.getAttribute('href');
      if (!href) return;
      
      if (href.includes('designers')) {
        switchItemType('studio');
      } else if (href.includes('museums')) {
        switchItemType('museum');
      } else if (href.includes('schools')) {
        switchItemType('university');
      }
    });
  });

  window.addEventListener('resize', () => {
    setTimeout(() => mapInstance?.map?.resize(), 200);
    if (!isMobilePanel()) {
      closeMobilePanel();
      explorePanel?.classList.remove('is-compact');
    } else {
      updatePanelNavState();
    }
  });

  // Browser back/forward: pushState navigations from the click handlers above
  // put a real path like /directory/schools/in/turin (or /designers,
  // /directory/museums, etc.) in the address bar. Parse whichever shape is
  // there — pretty path first, legacy ?type=&city= query as a fallback for
  // any state pushed before this URL scheme existed — and restore the
  // matching type + city panel.
  function parseLocationState(): { type: 'studio' | 'university' | 'museum' | null; citySlug: string | null } {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const search = new URLSearchParams(window.location.search);

    let m = path.match(/^\/directory\/schools\/in\/([^/]+)$/);
    if (m) return { type: 'university', citySlug: m[1] };
    m = path.match(/^\/directory\/museums\/in\/([^/]+)$/);
    if (m) return { type: 'museum', citySlug: m[1] };
    m = path.match(/^\/designers\/in\/([^/]+)$/);
    if (m) return { type: 'studio', citySlug: m[1] };

    if (path === '/directory/schools') return { type: 'university', citySlug: null };
    if (path === '/directory/museums') return { type: 'museum', citySlug: null };
    if (path === '/designers') return { type: 'studio', citySlug: null };

    const typeParam = search.get('type');
    const type: 'studio' | 'university' | 'museum' | null =
      typeParam === 'schools' ? 'university' : typeParam === 'museums' ? 'museum' : typeParam === 'designers' ? 'studio' : null;
    return { type, citySlug: search.get('city') };
  }

  window.addEventListener('popstate', () => {
    const { type, citySlug } = parseLocationState();

    if (type && type !== currentItemType) {
      switchItemType(type, { skipHistory: true });
    }

    if (citySlug) {
      const itemEl = document.querySelector(`.city-browse-item[data-slug="${citySlug}"]`) as HTMLElement | null;
      const cityName = itemEl?.dataset.city || citySlug;
      const countryMeta = itemEl?.querySelector('.city-browse-meta')?.textContent?.trim() || undefined;
      showCityStudios(cityName, citySlug, countryMeta, 'browse');
    } else {
      (window as any).isMyMap ? showCityBrowse() : showQuickNav();
    }
  });

  setupPanelSwipe();
  tryInitMap();
  // Personal "my map": the cities-list back button would normally
  // return to the quick-nav default (title/paragraph/quick links),
  // which is forbidden here. Hide it and show the profile "Back"
  // button instead, so the only way "back" works is to the profile.
  const mapBackBtn = document.getElementById('map-back-btn');
  if ((window as any).isMyMap) {
    if (cityBrowseBack) cityBrowseBack.style.display = 'none';
  } else {
    if (mapBackBtn) mapBackBtn.style.display = 'none';
  }
}

init();