import type { Env } from '../env.d';

type Json = any[] | Record<string, any>;

// Reads a JSON file directly from the JSON R2 bucket instead of doing an
// HTTP round-trip to our own origin. This removes the per-request self-fetch
// hop that blocked /map rendering, while still returning whatever the CMS
// last wrote (always fresh — no build step needed).
//
// Dev note: the local miniflare R2 bucket is usually empty, so fall back to
// proxying the production JSON just like the /cdn route does.
export async function readJsonFromBucket(
  filename: string,
  env: Env | Record<string, any>,
  origin: string
): Promise<Json | null> {
  const bucket = env?.JSON_BUCKET;

  if (bucket?.get) {
    try {
      const object = await bucket.get(filename);
      if (object) {
        const text = await object.text();
        return JSON.parse(text);
      }
    } catch (e) {
      console.error(`[readJsonFromBucket] failed to read ${filename} from R2:`, e);
    }
  }

  // Fallback: dev (empty local bucket) or missing binding — fetch from prod.
  try {
    const url = import.meta.env.DEV
      ? `https://json.acceso.design/${filename}`
      : `${origin}/cdn/${filename}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(`[readJsonFromBucket] fallback fetch failed for ${filename}:`, e);
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
