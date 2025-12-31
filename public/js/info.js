// Smooth accordion animation
document.querySelectorAll('.faq-item').forEach(item => {
  item.addEventListener('toggle', () => {
    if (item.open) {
      const answer = item.querySelector('.faq-answer');
      if (answer) {
        answer.style.animation = 'fadeIn 0.3s ease';
      }
    }
  });
});

