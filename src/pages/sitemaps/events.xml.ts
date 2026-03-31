import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

type EventItem = { slug: string; image?: string | null; updated_at?: string | null };

async function fetchEventList(origin: string, path: string): Promise<EventItem[]> {
  const url = new URL(path, origin).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
  return Array.isArray(items) ? items : [];
}

export const GET: APIRoute = async ({ site, url }) => {
  if (!site) return new Response('Missing site config', { status: 500 });
  const lastmod = toW3CDate(new Date());

  const [fairs, museums, awards] = await Promise.allSettled([
    fetchEventList(url.origin, '/cdn/fairs.json'),
    fetchEventList(url.origin, '/cdn/museums.json'),
    fetchEventList(url.origin, '/cdn/awards.json'),
  ]);

  const urls = [];
  const add = (base: string, list: EventItem[]) => {
    for (const e of list) {
      if (!e?.slug) continue;
      const loc = new URL(`${base}/${encodeURIComponent(e.slug)}`, site).toString();
      const images: string[] = [];
      if (e.image && typeof e.image === 'string') images.push(e.image);
      urls.push({ loc, lastmod, changefreq: 'monthly' as const, priority: 0.5, images });
    }
  };

  if (fairs.status === 'fulfilled') add('/events/fairs', fairs.value);
  if (museums.status === 'fulfilled') add('/events/museums', museums.value);
  if (awards.status === 'fulfilled') add('/events/awards', awards.value);

  return new Response(renderUrlSet(urls), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};

