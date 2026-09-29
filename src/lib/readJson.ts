import type { Env } from '../env.d';

type Json = any[] | Record<string, any>;

function bucketFor(filename: string, env: Env | Record<string, any>) {
  // moodboard.json lives in a separate R2 bucket from the rest of the CMS JSON.
  if (filename === 'moodboard.json' || filename.startsWith('moodboard/')) {
    return env?.MOODBOARD_BUCKET;
  }
  return env?.JSON_BUCKET;
}

// Keys are flat R2 object names, but they are also interpolated into a URL for
// the HTTP fallback, so refuse anything that could climb out of the host root
// or smuggle a query/fragment. Callers pass literals today; this keeps it safe
// if someone ever passes a route param.
function isSafeKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length < 200 &&
    /^[A-Za-z0-9._\-\/]+$/.test(key) &&
    !key.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')
  );
}

// Reads a JSON file directly from R2 instead of doing an HTTP round-trip
// to our own origin. Self-origin /cdn fetches are throttled on Cloudflare
// workers and were the source of 10s+ TTFB on directory/designer pages.
//
// Dev note: the local miniflare R2 bucket is usually empty, so fall back to
// the production JSON host (never this worker's own /cdn route).
export async function readJsonFromBucket(
  filename: string,
  env: Env | Record<string, any>,
  _origin?: string
): Promise<Json | null> {
  const key = String(filename || '').replace(/^\/+/, '');
  if (!isSafeKey(key)) {
    console.error(`[readJsonFromBucket] rejected unsafe key: ${key}`);
    return null;
  }
  const bucket = bucketFor(key, env);

  if (bucket?.get) {
    try {
      const object = await bucket.get(key);
      if (object) {
        const text = await object.text();
        return JSON.parse(text);
      }
    } catch (e) {
      console.error(`[readJsonFromBucket] failed to read ${key} from R2:`, e);
    }
  }

  try {
    const res = await fetch(`https://json.acceso.design/${key}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(`[readJsonFromBucket] fallback fetch failed for ${key}:`, e);
    return null;
  }
}

// Normalizes the mixed shapes the JSON files use (some are arrays, some are
// { items: [...] }) into a plain array.
export function toArray(data: Json | null): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as any).items)) return (data as any).items;
  return [];
}

// Keeps only the fields the map actually renders. The full CMS records can
// carry large text (bios, projects, socials); dropping them shrinks the
// inlined script payload and speeds up GeoJSON conversion + filtering.
const MAP_FIELDS = [
  'id', 'slug', 'name', 'city', 'city_slug', 'country', 'address',
  'latitude', 'longitude', 'cover', 'image',
] as const;

export function trimForMap(item: any): any {
  if (!item || typeof item !== 'object') return item;
  const out: any = {};
  for (const f of MAP_FIELDS) {
    if (item[f] !== undefined) out[f] = item[f];
  }
  return out;
}

export function trimArrayForMap(items: any[]): any[] {
  return items.map(trimForMap);
}
