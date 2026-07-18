import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

export const GET: APIRoute = async ({ site, url }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

  const lastmod = toW3CDate(new Date());
  const perPage = 18;

  let total = 0;
  try {
    const res = await fetch(new URL('/cdn/test-studios.json', url.origin).toString());
    if (res.ok) {
      const data = await res.json();
      total = Array.isArray(data) ? data.length : 0;
    }
  } catch {
    total = 0;
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const urls = [];
  // Page 1 canonicalises to /designers — submit /designers directly and skip
  // /designers/page/1 to avoid a canonical conflict in the sitemap.
  urls.push({
    loc: new URL('/designers', site).toString(),
    lastmod,
    changefreq: 'daily' as const,
    priority: 0.9,
  });
  for (let p = 2; p <= totalPages; p++) {
    urls.push({
      loc: new URL(`/designers/page/${p}`, site).toString(),
      lastmod,
      changefreq: 'weekly' as const,
      priority: 0.4,
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

