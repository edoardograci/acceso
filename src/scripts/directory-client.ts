const PER_PAGE = 20;

function init() {
  const r2Domain = (window as any).isDev ? 'https://json.acceso.design' : `${window.location.origin}/cdn`;

  async function apiFetch(url: string): Promise<Response> {
    if ((window as any).isDev) {
      return fetch(`/api/dev-proxy?url=${encodeURIComponent(url)}`);
    }
    return fetch(url);
  }

  const slider = document.querySelector('.city-filter-bar') as HTMLElement;
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let moved = false;

  slider?.addEventListener('mousedown', (e) => {
    isDown = true;
    moved = false;
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });
  slider?.addEventListener('mouseleave', () => { isDown = false; });
  slider?.addEventListener('mouseup', () => { isDown = false; });
  slider?.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const walk = (e.pageX - slider.offsetLeft - startX) * 2;
    if (Math.abs(walk) > 5) moved = true;
    slider.scrollLeft = scrollLeft - walk;
  });
  slider?.addEventListener('click', (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  let currentCity = 'all';
  let currentQuery = '';
  let currentPage = 1;
  let sortAsc = true;

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const searchRow = document.getElementById('search-row');
  const searchToggle = document.getElementById('search-toggle');
  const sortBtn = document.getElementById('sort-btn');
  const viewBtn = document.getElementById('view-btn');
  const studioCount = document.getElementById('studio-count');
  const cityPills = document.querySelectorAll('.city-pill');
  const emptyResult = document.getElementById('empty-result');
  const studiosGrid = document.getElementById('studios-grid');
  const paginationContainer = document.getElementById('pagination-container');
  const filterTrigger = document.getElementById('filter-trigger');
  const filterPopover = document.getElementById('filter-popover');
  const countryCheckboxes = document.querySelectorAll('.country-checkbox') as NodeListOf<HTMLInputElement>;
  const cityCheckboxes = document.querySelectorAll('.city-checkbox') as NodeListOf<HTMLInputElement>;
  const clearAllBtn = document.getElementById('filter-clear-all');

  searchToggle?.addEventListener('click', () => {
    const open = searchRow?.classList.toggle('hidden') === false;
    searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) searchInput?.focus();
  });

  sortBtn?.addEventListener('click', () => {
    sortAsc = !sortAsc;
    execFetch();
  });

  viewBtn?.addEventListener('click', () => {
    studiosGrid?.classList.toggle('compact');
  });

  filterTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = filterPopover?.classList.toggle('show');
    document.body.style.overflow = open && window.innerWidth <= 640 ? 'hidden' : '';
  });

  document.getElementById('filter-close-btn')?.addEventListener('click', () => {
    filterPopover?.classList.remove('show');
    document.body.style.overflow = '';
  });

  document.addEventListener('click', (e) => {
    if (filterPopover?.classList.contains('show') && !filterPopover.contains(e.target as Node) && e.target !== filterTrigger) {
      filterPopover.classList.remove('show');
      document.body.style.overflow = '';
    }
  });

  // Keep a country checkbox in sync with its child city checkboxes.
  function syncCountryFromCities(group: Element | null) {
    if (!group) return;
    const countryCb = group.querySelector('.country-checkbox') as HTMLInputElement | null;
    if (!countryCb) return;
    const cityCbs = Array.from(group.querySelectorAll('.city-checkbox')) as HTMLInputElement[];
    const checkedCount = cityCbs.filter(c => c.checked).length;
    countryCb.checked = checkedCount === cityCbs.length;
    countryCb.indeterminate = checkedCount > 0 && checkedCount < cityCbs.length;
  }

  countryCheckboxes.forEach(cb => cb.addEventListener('change', () => {
    const group = cb.closest('.filter-group');
    group?.querySelectorAll<HTMLInputElement>('.city-checkbox').forEach(cityCb => { cityCb.checked = cb.checked; });
    currentCity = 'all';
    cityPills.forEach(p => p.classList.remove('active'));
    currentPage = 1;
    execFetch();
  }));
  cityCheckboxes.forEach(cb => cb.addEventListener('change', () => {
    syncCountryFromCities(cb.closest('.filter-group'));
    currentCity = 'all';
    cityPills.forEach(p => p.classList.remove('active'));
    currentPage = 1;
    execFetch();
  }));
  clearAllBtn?.addEventListener('click', () => {
    countryCheckboxes.forEach(cb => { cb.checked = false; cb.indeterminate = false; });
    cityCheckboxes.forEach(cb => cb.checked = false);
    currentCity = 'all';
    cityPills.forEach(p => p.classList.remove('active'));
    currentPage = 1;
    execFetch();
  });

  cityPills.forEach(pill => {
    pill.addEventListener('click', () => {
      cityPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentCity = (pill as HTMLElement).dataset.city || 'all';
      countryCheckboxes.forEach(cb => { cb.checked = false; cb.indeterminate = false; });
      cityCheckboxes.forEach(cb => cb.checked = false);
      currentPage = 1;
      execFetch();
    });
  });

  searchInput?.addEventListener('change', (e) => {
    currentQuery = (e.target as HTMLInputElement).value;
    currentPage = 1;
    execFetch();
  });

  let globalSearchCache: any[] | null = null;
  let isFirstLoad = true;

  function resolveCover(cover?: string) {
    if (!cover) {
      return '';
    }
    
    let cleanPath = cover;
    
    // Rewrite legacy domains to use native proxy
    if (cleanPath.startsWith('https://img.acceso.design/')) {
      cleanPath = cleanPath.replace('https://img.acceso.design/', '');
    } else if (cleanPath.startsWith('https://mood.acceso.design/')) {
      cleanPath = cleanPath.replace('https://mood.acceso.design/', '');
    }
    // If it's still a full URL from somewhere else, rewrite known CDN hosts or return as-is
    else if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
      if (cleanPath.includes('img.acceso.design') || cleanPath.includes('mood.acceso.design')) {
        const url = new URL(cleanPath);
        return `${window.location.origin}/cdn/${url.pathname.replace(/^\/+/, '')}`;
      }
      return cleanPath;
    }
    
    // Go through CDN proxy
    const key = cleanPath.replace(/^\/+/, '');
    return `${window.location.origin}/cdn/${key}`;
  }

  async function buildCards(data: any[]) {
    if (!studiosGrid) return;
    const sorted = [...data].sort((a, b) => {
      const cmp = String(a.name || '').localeCompare(String(b.name || ''));
      return sortAsc ? cmp : -cmp;
    });
    const frag = document.createDocumentFragment();

    for (const s of sorted) {
      const a = document.createElement('a');
      a.className = 'directory-card';
      a.style.minWidth = '0';
      a.href = `/designers/${encodeURIComponent(String(s.slug || ''))}`;

      const media = document.createElement('div');
      media.className = 'directory-card-media';
      const cover = resolveCover(s.cover);
      if (cover) {
        const img = document.createElement('img');
        img.className = 'directory-card-image';
        img.src = cover;
        img.alt = String(s.name || '');
        img.loading = 'lazy';
        media.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'directory-card-placeholder';
        media.appendChild(ph);
      }

      const h3 = document.createElement('h3');
      h3.className = 'directory-card-name';
      h3.textContent = String(s.name || '');

      const p = document.createElement('p');
      p.className = 'directory-card-location';
      p.textContent = `${s.city || ''}${s.country ? `, ${s.country}` : ''}`;

      a.append(media, h3, p);
      frag.appendChild(a);
    }

    studiosGrid.replaceChildren(frag);
  }

  const slugifyValue = (v: string) => (v || '').toLowerCase().trim().replace(/\s+/g, '-');

  async function execFetch() {
    if (isFirstLoad) {
      isFirstLoad = false;
      renderPagination(Math.ceil((window as any).totalAllStudios / PER_PAGE));
      return;
    }

    try {
      let visibleData: any[] = [];
      let totalVisibleCount = 0;
      let calculatedTotalPages = 1;
      const q = currentQuery.toLowerCase().trim();
      const mData = (window as any).metadataGlobal || {};

      if (q) {
        if (!globalSearchCache) {
          const res = await apiFetch(`${r2Domain}/test-studios.json`);
          globalSearchCache = res.ok ? await res.json() : [];
        }
        const matched = globalSearchCache!.filter((s: any) =>
          s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q)
        );
        totalVisibleCount = matched.length;
        calculatedTotalPages = Math.ceil(totalVisibleCount / PER_PAGE) || 1;
        if (currentPage > calculatedTotalPages) currentPage = Math.max(1, calculatedTotalPages);
        visibleData = matched.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
      } else {
        let endpoint = '';
        const checkedCities = Array.from(document.querySelectorAll('.city-checkbox:checked')) as HTMLInputElement[];
        const checkedCountries = Array.from(document.querySelectorAll('.country-checkbox:checked')) as HTMLInputElement[];

        if (checkedCities.length + checkedCountries.length > 1) {
          if (!globalSearchCache) {
            const rAll = await apiFetch(`${r2Domain}/test-studios.json`);
            globalSearchCache = rAll.ok ? await rAll.json() : [];
          }
          const selectedCitySlugs = new Set(checkedCities.map(c => String(c.dataset.slug || '')));
          const selectedCountrySlugs = new Set(checkedCountries.map(c => String(c.dataset.slug || '')));
          const matched = (globalSearchCache || []).filter((s: any) => {
            const sCitySlug = String(s.city_slug || slugifyValue(s.city || ''));
            const sCountrySlug = String(s.country_slug || slugifyValue(s.country || ''));
            return selectedCitySlugs.has(sCitySlug) || selectedCountrySlugs.has(sCountrySlug);
          });
          totalVisibleCount = matched.length;
          calculatedTotalPages = Math.ceil(totalVisibleCount / PER_PAGE) || 1;
          visibleData = matched.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
        } else if (checkedCities.length > 0) {
          const slug = checkedCities[0].dataset.slug;
          endpoint = `${r2Domain}/studios/city/${slug}/page-${currentPage}.json`;
          calculatedTotalPages = mData.cities?.[slug!]?.pages || 1;
          totalVisibleCount = mData.cities?.[slug!]?.total || 0;
        } else if (checkedCountries.length > 0) {
          const slug = checkedCountries[0].dataset.slug;
          endpoint = `${r2Domain}/studios/country/${slug}/page-${currentPage}.json`;
          calculatedTotalPages = mData.countries?.[slug!]?.pages || 1;
          totalVisibleCount = mData.countries?.[slug!]?.total || 0;
        } else if (currentCity !== 'all') {
          const slug = currentCity.toLowerCase().replace(/\s+/g, '-');
          endpoint = `${r2Domain}/studios/city/${slug}/page-${currentPage}.json`;
          calculatedTotalPages = mData.cities?.[slug]?.pages || 1;
          totalVisibleCount = mData.cities?.[slug]?.total || 0;
        } else {
          if (!globalSearchCache) {
            const rAll = await apiFetch(`${r2Domain}/test-studios.json`);
            if (rAll.ok) globalSearchCache = await rAll.json();
          }
          totalVisibleCount = (window as any).totalAllStudios;
          calculatedTotalPages = Math.ceil(totalVisibleCount / PER_PAGE) || 1;
          visibleData = (globalSearchCache || []).slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
        }

        if (endpoint) {
          const chunkRes = await apiFetch(endpoint);
          if (chunkRes.ok) visibleData = await chunkRes.json();
        }
      }

      if (studioCount) studioCount.textContent = `${totalVisibleCount} results`;
      if (visibleData.length === 0) {
        studiosGrid?.classList.add('hidden');
        emptyResult?.classList.remove('hidden');
      } else {
        studiosGrid?.classList.remove('hidden');
        emptyResult?.classList.add('hidden');
        await buildCards(visibleData);
      }
      renderPagination(calculatedTotalPages);
    } catch {
      /* silent */
    }
  }

  function renderPagination(totalPages: number) {
    if (!paginationContainer) return;
    if (totalPages <= 1) { paginationContainer.innerHTML = ''; return; }

    let html = `<button class="pagination-btn pagination-arrow" ${currentPage === 1 ? 'disabled' : ''} data-page="prev">‹</button>`;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="pagination-btn pagination-arrow" ${currentPage === totalPages ? 'disabled' : ''} data-page="next">›</button>`;
    paginationContainer.innerHTML = html;

    paginationContainer.querySelectorAll('.pagination-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = (btn as HTMLElement).dataset.page;
        if (page === 'prev') currentPage--;
        else if (page === 'next') currentPage++;
        else currentPage = parseInt(page!, 10);
        execFetch();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  const paramCity = urlParams.get('city');
  const paramCountry = urlParams.get('country');

  if (paramCity) {
    isFirstLoad = false;
    let pillActivated = false;
    cityPills.forEach(pill => {
      const pillCity = (pill as HTMLElement).dataset.city || '';
      if (pillCity.toLowerCase().replace(/\s+/g, '-') === paramCity) {
        cityPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentCity = pillCity;
        pillActivated = true;
      }
    });
    if (!pillActivated) {
      cityCheckboxes.forEach(cb => { if (cb.dataset.slug === paramCity) cb.checked = true; });
    }
    history.replaceState(null, '', '/directory');
    execFetch();
  } else if (paramCountry) {
    isFirstLoad = false;
    countryCheckboxes.forEach(cb => { if (cb.dataset.slug === paramCountry) cb.checked = true; });
    history.replaceState(null, '', '/directory');
    execFetch();
  } else {
    execFetch();
  }
}

init();
