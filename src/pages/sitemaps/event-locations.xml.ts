import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

type City = { slug: string };
type Country = { slug: string };

async function fetchList<T>(origin: string, path: string): Promise<T[]> {
  const url = new URL(path, origin).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export const GET: APIRoute = async ({ site, url }) => {
  if (!site) return new Response('Missing site config', { status: 500 });
  const lastmod = toW3CDate(new Date());

  const [citiesRes, countriesRes] = await Promise.allSettled([
    fetchList<City>(url.origin, '/cdn/test-cities.json'),
    fetchList<Country>(url.origin, '/cdn/test-countries.json'),
  ]);

  const places: string[] = [];
  if (citiesRes.status === 'fulfilled') {
    for (const c of citiesRes.value) if (c?.slug) places.push(c.slug);
  }
  if (countriesRes.status === 'fulfilled') {
    for (const c of countriesRes.value) if (c?.slug) places.push(c.slug);
  }

  const types = ['fairs', 'museums', 'awards'] as const;
  const urls = [];
  for (const t of types) {
    for (const p of places) {
      urls.push({
        loc: new URL(`/events/${t}/in/${encodeURIComponent(p)}`, site).toString(),
        lastmod,
        changefreq: 'weekly' as const,
        priority: 0.3,
      });
    }
  }

  return new Response(renderUrlSet(urls), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};

