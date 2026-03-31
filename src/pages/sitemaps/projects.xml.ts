import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

type MoodboardItem = {
  slug: string;
  cover?: string | null;
  updated_at?: string | null;
};

async function fetchProjects(origin: string): Promise<MoodboardItem[]> {
  const url = new URL('/cdn/moodboard.json', origin).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch moodboard: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export const GET: APIRoute = async ({ site, url }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

  const lastmod = toW3CDate(new Date());
  let items: MoodboardItem[] = [];
  try {
    items = await fetchProjects(url.origin);
  } catch {
    items = [];
  }

  const urls = items
    .filter((i) => typeof i?.slug === 'string' && i.slug.length > 0)
    .map((i) => {
      const loc = new URL(`/projects/${encodeURIComponent(i.slug)}`, site).toString();
      const images: string[] = [];
      if (i.cover && typeof i.cover === 'string') images.push(i.cover);
      return { loc, lastmod, changefreq: 'monthly' as const, priority: 0.6, images };
    });

  return new Response(renderUrlSet(urls), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};

