// Get initial city from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const initialCity = urlParams.get('city') || 'all';

const searchInput = document.getElementById('search-input');
const filterButtons = document.querySelectorAll('.filter-btn');
const studioCards = document.querySelectorAll('.studio-card');
const studiosGrid = document.getElementById('studios-grid');
const emptyResult = document.getElementById('empty-result');
const studioCount = document.getElementById('studio-count');

let currentCity = initialCity;
let currentSearch = '';

function filterStudios() {
  let visibleCount = 0;

  studioCards.forEach(card => {
    const name = card.dataset.name || '';
    const city = card.dataset.city || '';

    const matchesSearch = name.includes(currentSearch.toLowerCase());
    const matchesCity = currentCity === 'all' || city === currentCity;

    if (matchesSearch && matchesCity) {
      card.style.display = '';
      visibleCount++;
    } else {
      card.style.display = 'none';
    }
  });

  // Update count and show/hide empty state
  if (studioCount) {
    studioCount.textContent = `${visibleCount} Design Studio${visibleCount !== 1 ? 's' : ''} ${currentCity === 'all' ? '' : `in ${currentCity}`}`;
  }

  if (emptyResult && studiosGrid) {
    if (visibleCount === 0) {
      studiosGrid.style.display = 'none';
      emptyResult.style.display = 'block';
    } else {
      studiosGrid.style.display = 'grid';
      emptyResult.style.display = 'none';
    }
  }
}

// Search input handler
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    filterStudios();
  });
}

// City filter handlers
filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    const selectedCity = button.dataset.city || 'all';
    
    // Update URL with query parameter
    const url = new URL(window.location);
    if (selectedCity === 'all') {
      url.searchParams.delete('city');
    } else {
      url.searchParams.set('city', selectedCity);
    }
    window.history.pushState({}, '', url);
    
    // Update current city and filter
    currentCity = selectedCity;
    
    // Update active button state
    filterButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    
    filterStudios();
  });
});

// Initial filter on page load
filterStudios();

