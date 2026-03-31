import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  // Only allow this in development
  if (!import.meta.env.DEV) {
    return new Response('Not Found', { status: 404 });
  }

  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) {
    return new Response('Missing URL parameter', { status: 400 });
  }

  try {
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return new Response('Invalid URL parameter', { status: 400 });
    }

    // SSRF hardening: only allow known public hosts over https
    const allowedHosts = new Set([
      'json.acceso.design',
      'mood.acceso.design',
      'img.acceso.design',
      'mood.acceso.edoardograci.com',
      'acceso.design',
    ]);

    if (target.protocol !== 'https:') {
      return new Response('Only https URLs are allowed', { status: 400 });
    }
    if (!allowedHosts.has(target.hostname)) {
      return new Response('Host not allowed', { status: 403 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(target.toString(), { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      return new Response('Upstream fetch failed', { status: 502 });
    }
    
    // Attempt to pass through as JSON
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  } catch (error: any) {
    return new Response('Proxy error', { status: 500 });
  }
};
