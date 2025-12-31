const tabs = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const tabIndicator = document.querySelector('.tab-indicator');

function updateIndicator() {
  const activeTab = document.querySelector('.tab-button.active');
  if (activeTab && tabIndicator) {
    tabIndicator.style.left = activeTab.offsetLeft + 'px';
    tabIndicator.style.width = activeTab.offsetWidth + 'px';
  }
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    
    // Remove active class from all tabs and contents
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('tab-content-active'));
    
    // Add active class to clicked tab and corresponding content
    tab.classList.add('active');
    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
      activeContent.classList.add('tab-content-active');
    }
    
    // Update indicator position
    updateIndicator();
  });
});

