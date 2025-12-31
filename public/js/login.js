const form = document.getElementById('magic-link-form');
const resultDiv = document.getElementById('magic-link-result');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(form);
  const email = formData.get('email');
  const submitButton = form.querySelector('button[type="submit"]');
  
  if (!email) return;
  
  submitButton.disabled = true;
  submitButton.textContent = 'Sending...';
  resultDiv.className = 'magic-link-result';
  resultDiv.textContent = '';
  
  try {
    const response = await fetch('/auth/magic-link/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    
    const data = await response.json();
    
    if (response.status === 429) {
      resultDiv.className = 'magic-link-result show error';
      resultDiv.textContent = data.error || 'Too many requests. Please try again later.';
      return;
    }

    if (data.success) {
      resultDiv.className = 'magic-link-result show success';
      
      resultDiv.innerHTML = `
        <strong>Check your email!</strong><br>
        <small>We've sent a login link to ${email}. Check your inbox and spam folder.</small>
      `;
    } else {
      resultDiv.className = 'magic-link-result show error';
      resultDiv.textContent = data.error || 'Failed to send magic link';
    }
  } catch (error) {
    resultDiv.className = 'magic-link-result show error';
    resultDiv.textContent = 'Failed to send magic link. Please try again.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Send Magic Link';
  }
});

