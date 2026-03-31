import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals, request }) => {
  const { path } = params;
  if (!path) {
    return new Response('Not Found', { status: 404 });
  }

  // Get Cloudflare bindings from context
  const env = (locals.runtime?.env || {}) as any;

  // Route by type:
  //   .json files  → JSON_BUCKET   (ALL event + studio JSON lives here)
  //   moodboard/…  → MOODBOARD_BUCKET  (image subdirectory only)
  //   everything else → INDEX_BUCKET  (studio covers, submissions)
  let bucket;
  if (path.endsWith('.json')) {
    bucket = env.JSON_BUCKET;
  } else if (path.startsWith('moodboard/') || (path.startsWith('moodboard') && path.includes('/'))) {
    bucket = env.MOODBOARD_BUCKET;
  } else {
    bucket = env.INDEX_BUCKET;
  }

  const key = path;

  if (!bucket) {
    console.error(`Bucket not found. Path: ${path}`, Object.keys(env));
    return new Response('Internal Server Error - Bucket binding unavailable', { status: 500 });
  }

  // Only gate truly private enrichment files.
  // All content JSON MUST be public — SSR pages fetch them server-side
  // with no session cookie, so locals.user is always null there.
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
