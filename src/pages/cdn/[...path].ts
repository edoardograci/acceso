import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals, request }) => {
  const { path } = params;
  if (!path) {
    return new Response('Not Found', { status: 404 });
  }

  const url = new URL(request.url);
  const w = url.searchParams.get('w');
  const h = url.searchParams.get('h');
  const q = url.searchParams.get('q');

  const env = (locals.runtime?.env || {}) as any;

  // ─────────────────────────────────────────────────────────────
  // REFINED ROUTING - Routes moodboard.json to its correct bucket
  // ─────────────────────────────────────────────────────────────
  let bucket;
  if (path === 'moodboard.json' || path.startsWith('moodboard/')) {
    bucket = env.MOODBOARD_BUCKET;               // Moodboard bucket (R2)
  } 
  else if (path.endsWith('.json')) {
    bucket = env.JSON_BUCKET;                    // All other JSON files
  } 
  else if (
    path.startsWith('events/') ||
    path.startsWith('fairs/') ||
    path.startsWith('museums/') ||
    path.startsWith('awards/') ||
    path.startsWith('universities/') ||
    path.endsWith('-cover.webp')
  ) {
    bucket = env.EVENTS_BUCKET;               // ← All event-related images
  } 
  else {
    bucket = env.INDEX_BUCKET;                   // Studio covers, submissions, etc.
  }

  const key = path;

  if (!bucket) {
    console.error(`Bucket not found for path: ${path}`);
    return new Response('Internal Server Error - Bucket binding unavailable', { status: 500 });
  }

  // Private JSON protection (unchanged)
  if (path.endsWith('.json')) {
    const PRIVATE_JSON = [
      'enrichment-metadata.json',
      'moodboard-enrichment.json',
      'moodboard-metadata.json',
      'spotlight-metadata.json',
      'studios-metadata.json',
    ];
    if (PRIVATE_JSON.includes(path) && !locals.user) {
      return new Response('Unauthorized', { status: 403 });
    }
  }

  try {
    const isImage = /\.(jpg|jpeg|png|webp|avif|heic)$/i.test(path);
    let object = await bucket.get(key);

    // ─────────────────────────────────────────────────────────────
    // FALLBACK: fairs/{slug}.webp -> fairs/{slug}/logo.webp
    // Some fairs store the logo as fairs/{slug}.webp in the data
    // but the actual R2 key is fairs/{slug}/logo.webp
    // ─────────────────────────────────────────────────────────────
    if (!object && isImage && path.startsWith('fairs/')) {
      const logoKey = path.replace(/\.webp$/, '') + '/logo.webp';
      object = await bucket.get(logoKey);
    }

    // ─────────────────────────────────────────────────────────────
    // DEV FALLBACK: If local R2 is empty, proxy from production
    // Try the original path first, then the logo fallback for fairs
    // ─────────────────────────────────────────────────────────────
    if (!object && import.meta.env.DEV) {
      const urlsToTry = [path];
      if (isImage && path.startsWith('fairs/')) {
        const logoKey = path.replace(/\.webp$/, '') + '/logo.webp';
        urlsToTry.push(logoKey);
      }
      for (const tryPath of urlsToTry) {
        const prodUrl = `https://acceso.design/cdn/${tryPath}`;
        const prodRes = await fetch(prodUrl);
        if (prodRes.ok) {
          const body = await prodRes.arrayBuffer();
          return new Response(body, {
            headers: {
              'Content-Type': prodRes.headers.get('Content-Type') || (isImage ? 'image/webp' : 'application/json'),
              'Cache-Control': 'no-cache',
              'X-Proxy-Fallback': 'true'
            }
          });
        }
      }
    }

    if (!object) {
      return new Response(`Not Found: ${key}`, { status: 404 });
    }

    const headers = new Headers();
    const meta = (object as any).httpMetadata || {};
    if (meta.contentType) {
      headers.set('Content-Type', meta.contentType);
    } else if (isImage) {
      const ext = path.split('.').pop()?.toLowerCase();
      const typeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        webp: 'image/webp', avif: 'image/avif', heic: 'image/heic'
      };
      if (ext && typeMap[ext]) headers.set('Content-Type', typeMap[ext]);
    }
    headers.set('etag', (object as any).httpEtag);

    // Cache policy
    if (!path.endsWith('.json')) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // JSON is CMS-driven: a short max-age speeds up repeat loads, while
      // stale-while-revalidate keeps things fast even right after an update.
      // A Cloudflare cache purge on publish invalidates immediately, so this
      // never shows stale data for more than a few minutes if a purge is missed.
      headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    }

    let body: any = await object.arrayBuffer();

    // CLOUDFLARE IMAGE RESIZING (Option 3: Image Bindings)
    if (isImage && (w || h || q)) {
      const imagesBinding = env.IMAGES;
      if (imagesBinding && typeof imagesBinding.resize === 'function') {
        try {
          const resizeOptions: any = {
            format: 'auto',
            fit: 'cover',
          };
          if (w) resizeOptions.width = parseInt(w);
          if (h) resizeOptions.height = parseInt(h);
          if (q) resizeOptions.quality = parseInt(q);

          const resizedImage = await imagesBinding.resize(body, resizeOptions);
          body = await resizedImage.arrayBuffer();
          headers.set('Content-Type', resizedImage.type || 'image/webp');
          headers.set('X-Resized', 'true');
        } catch (resizeErr) {
          console.error(`Resizing failed for ${path}:`, resizeErr);
        }
      }
    }

    return new Response(body, { headers });
  } catch (e: any) {
    console.error(`CDN Error for path ${path}:`, e);
    return new Response(`Error fetching ${path}`, { status: 500 });
  }
};