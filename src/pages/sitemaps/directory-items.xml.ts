import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

import { normalizeImage } from '../../lib/images';

type DirectoryItem = { slug: string; image?: string | null; updated_at?: string | null };

async function fetchList(origin: string, path: string): Promise<DirectoryItem[]> {
  const url = new URL(path, origin).toString();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
      const data = await res.json();
      const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      return Array.isArray(items) ? items : [];
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
  return [];
}

export const GET: APIRoute = async ({ site, url: requestUrl }) => {
  if (!site) return new Response('Missing site config', { status: 500 });
  const lastmod = toW3CDate(new Date());

  const [fairs, museums, awards, schools, studios] = await Promise.allSettled([
    fetchList(requestUrl.origin, '/cdn/fairs.json'),
    fetchList(requestUrl.origin, '/cdn/museums.json'),
    fetchList(requestUrl.origin, '/cdn/awards.json'),
    fetchList(requestUrl.origin, '/cdn/universities.json'),
    fetchList(requestUrl.origin, '/cdn/test-studios.json'),
  ]);

  const urls: import('../../lib/seo/sitemap').SitemapUrl[] = [];
  const add = (base: string, list: DirectoryItem[]) => {
    for (const e of list) {
      if (!e?.slug) continue;
      const loc = new URL(`${base}/${encodeURIComponent(e.slug)}`, site).toString();
      const images: string[] = [];
      const normalized = normalizeImage(e.image, requestUrl.origin);
      if (normalized) images.push(normalized);
      urls.push({ loc, lastmod, changefreq: 'monthly' as const, priority: 0.5, images });
    }
  };

  if (fairs.status === 'fulfilled') add('/directory/fairs', fairs.value);
  if (museums.status === 'fulfilled') add('/directory/museums', museums.value);
  if (awards.status === 'fulfilled') add('/directory/awards', awards.value);
  if (schools.status === 'fulfilled') add('/directory/schools', schools.value);
  if (studios.status === 'fulfilled') add('/designers', studios.value);

  return new Response(renderUrlSet(urls), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};