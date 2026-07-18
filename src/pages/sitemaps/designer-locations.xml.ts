import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

export const GET: APIRoute = async ({ site, url }) => {
  if (!site) return new Response('Missing site config', { status: 500 });
  const lastmod = toW3CDate(new Date());

  // Derive location slugs from actual studio data so we never submit an empty
  // /designers/in/{slug} page. Mirrors the pattern already used by
  // directory-locations.xml.ts (see comment there for the rationale).
  let studios: any[] = [];
  try {
    const res = await fetch(new URL('/cdn/test-studios.json', url.origin).toString());
    if (res.ok) {
      const data = await res.json();
      studios = Array.isArray(data) ? data : [];
    }
  } catch {
    studios = [];
  }

  // Collect unique city and country slugs that have at least one studio.
  const citySlugs = new Set<string>();
  const countrySlugs = new Set<string>();
  for (const s of studios) {
    if (s?.city_slug) citySlugs.add(s.city_slug);
    if (s?.country_slug) countrySlugs.add(s.country_slug);
  }

  const urls = [];
  for (const slug of citySlugs) {
    urls.push({
      loc: new URL(`/designers/in/${encodeURIComponent(slug)}`, site).toString(),
      lastmod,
      changefreq: 'weekly' as const,
      priority: 0.6,
    });
  }
  for (const slug of countrySlugs) {
    // Skip country slugs that are already covered as a city (avoids dupes).
    if (citySlugs.has(slug)) continue;
    urls.push({
      loc: new URL(`/designers/in/${encodeURIComponent(slug)}`, site).toString(),
      lastmod,
      changefreq: 'weekly' as const,
      priority: 0.5,
    });
  }

  return new Response(renderUrlSet(urls), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
