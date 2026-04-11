import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

import { normalizeImage } from '../../lib/images';

type Studio = {
  slug: string;
  cover?: string | null;
  updated_at?: string | null;
};

async function fetchStudios(origin: string): Promise<Studio[]> {
  // Prefer server-local proxy in prod (fast + same-origin), fall back to json domain in dev.
  const url = new URL('/cdn/test-studios.json', origin).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch studios: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export const GET: APIRoute = async ({ site, url }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

  const lastmod = toW3CDate(new Date());
  let studios: Studio[] = [];
  try {
    studios = await fetchStudios(url.origin);
  } catch {
    studios = [];
  }

  const urls: import('../../lib/seo/sitemap').SitemapUrl[] = studios
    .filter((s) => typeof s?.slug === 'string' && s.slug.length > 0)
    .map((s) => {
      const loc = new URL(`/designers/${encodeURIComponent(s.slug)}`, site).toString();
      const images: string[] = [];
      const normalized = normalizeImage(s.cover, url.origin);
      if (normalized) images.push(normalized);
      return { loc, lastmod, changefreq: 'monthly' as const, priority: 0.7, images };
    });

  return new Response(renderUrlSet(urls), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};

