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
  // NEW ROUTING LOGIC – supports all your buckets
  // ─────────────────────────────────────────────────────────────
  let bucket;
  if (path.endsWith('.json')) {
    bucket = env.JSON_BUCKET;                    // All JSON files
  } 
  else if (path.startsWith('moodboard/')) {
    bucket = env.MOODBOARD_BUCKET;               // Moodboard images
  } 
  else if (
    path.startsWith('events/') ||
    path.startsWith('fairs/') ||
    path.startsWith('museums/') ||
    path.startsWith('awards/') ||
    path.endsWith('-cover.webp')
  ) {
    bucket = env.EVENTS_BUCKET;                  // ← All event-related images
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
      'studios.json',
      'test-studios.json',
    ];
    if (PRIVATE_JSON.includes(path) && !locals.user) {
      return new Response('Unauthorized', { status: 403 });
    }
  }

  try {
    const isImage = /\.(jpg|jpeg|png|webp|avif|heic)$/i.test(path);
    
    // Fetch from bucket
    const object = await bucket.get(key);

    if (!object) {
      return new Response(`Not Found: ${key}`, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    // Cache policy
    if (!path.endsWith('.json')) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      headers.set('Cache-Control', 'no-cache');
    }

    let body: any = await object.arrayBuffer();

    // CLOUDFLARE IMAGE RESIZING (Option 3: Image Bindings)
    // If resizing is requested, we use the IMAGES binding if it exists
    if (isImage && (w || h || q)) {
      const imagesBinding = env.IMAGES;
      if (imagesBinding && typeof imagesBinding.resize === 'function') {
        try {
          const resizeOptions: any = {
            format: 'auto', // Cloudflare will pick the best format (WebP/AVIF)
            fit: 'cover',
          };
          if (w) resizeOptions.width = parseInt(w);
          if (h) resizeOptions.height = parseInt(h);
          if (q) resizeOptions.quality = parseInt(q);

          // Perform the resize on the blob directly
          const resizedImage = await imagesBinding.resize(body, resizeOptions);
          body = await resizedImage.arrayBuffer();
          
          // Update content-type header if it was changed by auto-format
          // imagesBinding.resize typically returns a Blob with the new type
          headers.set('Content-Type', resizedImage.type || 'image/webp');
          
          // Debug header (optional, helps you verify it's working)
          headers.set('X-Resized', 'true');
        } catch (resizeErr) {
          console.error(`Resizing failed for ${path}:`, resizeErr);
          // Fallback: original body is still there
        }
      }
    }
    
    return new Response(body, { headers });
  } catch (e: any) {
    console.error(`CDN Error for path ${path}:`, e);
    return new Response(`Error fetching ${path}`, { status: 500 });
  }
};