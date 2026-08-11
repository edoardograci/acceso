import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

async function fetchList(origin: string, path: string): Promise<any[]> {
  const url = new URL(path, origin).toString();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : (data.items || []);
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
  return [];
}

// A location URL only resolves if at least one item of that type carries a
// matching city_slug or country_slug. Deriving the place list from the actual
// event data (instead of the raw reference tables) prevents the sitemap from
// advertising location pages that 404.
function validPlaces(items: any[]): Set<string> {
  const places = new Set<string>();
  for (const it of items) {
    if (it?.city_slug) places.add(it.city_slug);
    if (it?.country_slug) places.add(it.country_slug);
  }
  return places;
}

export const GET: APIRoute = async ({ site, url }) => {
  if (!site) return new Response('Missing site config', { status: 500 });
  const lastmod = toW3CDate(new Date());

  const [fairsRes, museumsRes, schoolsRes, studiosRes] = await Promise.allSettled([
    fetchList(url.origin, '/cdn/fairs.json'),
    fetchList(url.origin, '/cdn/museums.json'),
    fetchList(url.origin, '/cdn/universities.json'),
    fetchList(url.origin, '/cdn/test-studios.json'),
  ]);

  const fairPlaces = fairsRes.status === 'fulfilled' ? validPlaces(fairsRes.value) : new Set<string>();
  const museumPlaces = museumsRes.status === 'fulfilled' ? validPlaces(museumsRes.value) : new Set<string>();
  const schoolPlaces = schoolsRes.status === 'fulfilled' ? validPlaces(schoolsRes.value) : new Set<string>();
  const studioPlaces = studiosRes.status === 'fulfilled' ? validPlaces(studiosRes.value) : new Set<string>();
  // Awards carry no location fields, so their /in/<place> pages always 404.

  const types: { type: string; places: Set<string>; base: string }[] = [
    { type: 'fairs', places: fairPlaces, base: '/directory/fairs' },
    { type: 'museums', places: museumPlaces, base: '/directory/museums' },
    { type: 'schools', places: schoolPlaces, base: '/directory/schools' },
    { type: 'designers', places: studioPlaces, base: '/designers' },
  ];

  const urls = [];
  for (const { places, base } of types) {
    for (const p of places) {
      urls.push({
        loc: new URL(`${base}/in/${encodeURIComponent(p)}`, site).toString(),
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