function initCollectionsFilter(gridId, emptyStateId, countLabelId, type) {
  const filterGrid = () => {
    const grid = document.getElementById(gridId);
    const emptyState = document.getElementById(emptyStateId);
    const countLabel = document.getElementById(countLabelId);
    if (!grid || !window.collectionsState) return;

    const cards = grid.querySelectorAll(`.${type === 'object' ? 'object-card-wrapper' : 'studio-card-wrapper'}`);
    let visibleCount = 0;

    cards.forEach(card => {
      const id = card.getAttribute('data-id');
      if (window.collectionsState.isSaved(type, id)) {
        card.style.display = 'block';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (visibleCount === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (countLabel) countLabel.innerText = '0 saved';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      if (countLabel) countLabel.innerText = `${visibleCount} saved`;
    }

    grid.style.opacity = '1';
  };

  // Run on init
  if (window.collectionsState?.loaded) {
    filterGrid();
  } else {
    // Wait for state to load
    const checkState = setInterval(() => {
      if (window.collectionsState?.loaded) {
        filterGrid();
        clearInterval(checkState);
      }
    }, 50);
  }

  // Sync on changes
  document.addEventListener('save-change', (e) => {
    const { saved, type: changeType } = e.detail;
    if (changeType === type) {
      filterGrid();
    }
  });

  // Sync on cross-tab storage changes
  window.addEventListener('storage', (e) => {
    if (e.key === 'collections_state_v1') {
      filterGrid();
    }
  });
}

