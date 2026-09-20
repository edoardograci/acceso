import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

export const GET: APIRoute = async ({ site, url }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

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

  // Collect unique city and country slugs that have at least one studio, and
  // the most recent updated_at among the studios at each — never "now".
  const citySlugs = new Set<string>();
  const countrySlugs = new Set<string>();
  const latest = new Map<string, number>();
  const bump = (slug: string | undefined | null, t: number) => {
    if (!slug || isNaN(t)) return;
    const cur = latest.get(slug);
    if (cur === undefined || t > cur) latest.set(slug, t);
  };
  for (const s of studios) {
    const t = s?.updated_at ? new Date(s.updated_at).getTime() : NaN;
    if (s?.city_slug) { citySlugs.add(s.city_slug); bump(s.city_slug, t); }
    if (s?.country_slug) { countrySlugs.add(s.country_slug); bump(s.country_slug, t); }
  }
  const lastmodFor = (slug: string): string | undefined => {
    const t = latest.get(slug);
    return t === undefined ? undefined : toW3CDate(new Date(t));
  };

  const urls = [];
  for (const slug of citySlugs) {
    urls.push({
      loc: new URL(`/designers/in/${encodeURIComponent(slug)}`, site).toString(),
      lastmod: lastmodFor(slug),
      changefreq: 'weekly' as const,
      priority: 0.6,
    });
  }
  for (const slug of countrySlugs) {
    // Skip country slugs that are already covered as a city (avoids dupes).
    if (citySlugs.has(slug)) continue;
    urls.push({
      loc: new URL(`/designers/in/${encodeURIComponent(slug)}`, site).toString(),
      lastmod: lastmodFor(slug),
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
