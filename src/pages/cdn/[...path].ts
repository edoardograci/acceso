import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals, request }) => {
  const { path } = params;
  if (!path) {
    return new Response('Not Found', { status: 404 });
  }

  // Get Cloudflare bindings from context
  const env = (locals.runtime?.env || (request as any).cf?.env || {}) as any;
  
  // Determine bucket and adjusted key
  // Select bucket based on whether path starts with 'moodboard'
  let bucket;
  if (path.startsWith('moodboard')) {
    bucket = env.MOODBOARD_BUCKET;
  } else if (
    path === 'metadata.json' || 
    path.startsWith('test-') || 
    path.startsWith('studios/')
  ) {
    bucket = env.JSON_BUCKET;
  } else {
    bucket = env.INDEX_BUCKET;
  }

  const key = path;

  if (!bucket) {
    console.error(`Bucket not found. Path: ${path}, Available bindings:`, Object.keys(env));
    return new Response('Internal Server Error - Bucket binding unavailable', { status: 500 });
  }

  // Security Check for JSON
  // JSON files contain the "intelligence" (coordinates, links, metadata)
  if (path.endsWith('.json')) {
    // Allow public access to studios and metadata JSONs as they are required for the public designers directory
    const isPublicJson = path.startsWith('test-') || 
                        path === 'metadata.json' || 
                        path.startsWith('studios/') ||
                        path === 'moodboard.json';
    
    if (!isPublicJson && !locals.user) {
      return new Response('Unauthorized: Please log in to access this data.', { status: 403 });
    }
  }



  try {
    const object = await bucket.get(key);

    if (!object) {
      const bucketName = path.startsWith('moodboard') ? 'MOODBOARD' : (path === 'metadata.json' || path.startsWith('test-') || path.startsWith('studios/') ? 'JSON' : 'INDEX');
      return new Response(`Not Found: ${key} in ${bucketName} bucket`, { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    
    // Performance: Add Cache-Control
    // Images are immutable once uploaded to R2, so we can cache them heavily.
    // JSON files might change, so we use no-cache to ensure fresh data for logged-in users.
    if (!path.endsWith('.json')) {
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
        headers.set('Cache-Control', 'no-cache');
    }

    // Convert to arrayBuffer for Node/dev runtime compatibility.
    const body = await object.arrayBuffer();
    return new Response(body, {
      headers,
    });
  } catch (e: any) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`CDN Error for path ${path}:`, errorMsg, e);
    return new Response(`Error fetching ${path}: ${errorMsg}`, { status: 500 });
  }
};
