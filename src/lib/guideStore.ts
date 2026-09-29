import type { Env } from '../env.d';
import { readJsonFromBucket, toArray } from './readJson';

// Guides are JSON files in the `json` R2 bucket at `guides/<slug>.json`.
// The filename is the slug (single source of truth for the URL).
//
// Required: title, description, publishDate (ISO date), body (markdown).
// Optional: lede, excerpt, updatedDate, draft, tags[], readingTime, coverImage,
//           coverImageAlt, embeds[] (anything else is passed through to the layout).
//
// Entries are returned in the same { id, data } shape as an Astro content
// collection entry, so GuideLayout.astro and the existing helpers keep working.

export const GUIDES_PREFIX = 'guides/';

// Lowercase letters, digits and single hyphens only, so a request like
// /guides/..%2Fmetadata can never become an R2 key.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidGuideSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length > 0 && slug.length <= 120 && SLUG_RE.test(slug);
}

export type GuideEntry = {
  id: string;
  data: {
    title: string;
    description: string;
    publishDate: Date;
    updatedDate?: Date;
    draft: boolean;
    tags: string[];
    embeds: any[];
    body?: string;
    lede?: string;
    excerpt?: string;
    readingTime?: string;
    coverImage?: string;
    coverImageAlt?: string;
    [key: string]: any;
  };
};

function parseDate(v: unknown): Date | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toEntry(slug: string, raw: any): GuideEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    console.error(`[guides] ${slug}: JSON root must be an object`);
    return null;
  }
  const publishDate = parseDate(raw.publishDate);
  const problems: string[] = [];
  if (typeof raw.title !== 'string' || !raw.title.trim()) problems.push('title');
  if (typeof raw.description !== 'string' || !raw.description.trim()) problems.push('description');
  if (typeof raw.body !== 'string' || !raw.body.trim()) problems.push('body');
  if (!publishDate) problems.push('publishDate (ISO date)');
  if (problems.length) {
    console.error(`[guides] ${slug}: invalid, missing/bad ${problems.join(', ')}`);
    return null;
  }
  return {
    id: slug, // filename wins over any "slug" field inside the JSON
    data: {
      ...raw,
      publishDate: publishDate!,
      updatedDate: parseDate(raw.updatedDate),
      draft: raw.draft === true,
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t: unknown) => typeof t === 'string') : [],
      embeds: Array.isArray(raw.embeds) ? raw.embeds : [],
    },
  };
}

export function guideDate(d: Date | undefined): Date | undefined {
  return d && Number.isFinite(d.getTime()) ? d : undefined;
}

/** Published guide or null (missing, invalid, or draft unless includeDrafts). */
export async function getGuide(
  slug: string,
  env: Env | Record<string, any>,
  opts: { includeDrafts?: boolean } = {}
): Promise<GuideEntry | null> {
  if (!isValidGuideSlug(slug)) return null;
  const raw = await readJsonFromBucket(`${GUIDES_PREFIX}${slug}.json`, env);
  const entry = toEntry(slug, raw);
  if (!entry || (entry.data.draft && !opts.includeDrafts)) return null;
  return entry;
}

/**
 * Published guides, newest first. Uses R2 list() when the binding exists;
 * otherwise (empty local miniflare bucket) falls back to an optional
 * `guides/index.json` containing an array of slugs.
 */
export async function listGuides(env: Env | Record<string, any>): Promise<GuideEntry[]> {
  const slugs = new Set<string>();
  const bucket = (env as any)?.JSON_BUCKET;

  if (bucket?.list) {
    try {
      let cursor: string | undefined;
      do {
        const res = await bucket.list({ prefix: GUIDES_PREFIX, cursor });
        for (const obj of res.objects ?? []) {
          const name = String(obj.key).slice(GUIDES_PREFIX.length);
          if (!name.endsWith('.json') || name.includes('/')) continue;
          const slug = name.slice(0, -'.json'.length);
          if (isValidGuideSlug(slug)) slugs.add(slug);
        }
        cursor = res.truncated ? res.cursor : undefined;
      } while (cursor);
    } catch (e) {
      console.error('[guides] R2 list failed:', e);
    }
  }

  if (slugs.size === 0) {
    const index = await readJsonFromBucket(`${GUIDES_PREFIX}index.json`, env);
    for (const s of toArray(index)) {
      const slug = typeof s === 'string' ? s : s?.slug;
      if (isValidGuideSlug(slug)) slugs.add(slug);
    }
  }

  const entries = (await Promise.all([...slugs].map((s) => getGuide(s, env)))).filter(
    (g): g is GuideEntry => !!g
  );
  return entries.sort((a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf());
}
