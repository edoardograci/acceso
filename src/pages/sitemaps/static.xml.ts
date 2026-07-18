import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

export const GET: APIRoute = ({ site }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

  const lastmod = toW3CDate(new Date());
  // Static pages have a real "Last updated" date on-page — use it so Google
  // doesn't see these as changing every crawl.
  const privacyLastmod = '2025-12-30';
  const termsLastmod = '2025-12-30';

  const urls = [
    { loc: new URL('/', site).toString(), lastmod, changefreq: 'daily' as const, priority: 1.0 },
    { loc: new URL('/designers', site).toString(), lastmod, changefreq: 'daily' as const, priority: 0.9 },
    { loc: new URL('/discover', site).toString(), lastmod, changefreq: 'daily' as const, priority: 0.8 },
    { loc: new URL('/directory', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.7 },
    { loc: new URL('/directory/fairs', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.6 },
    { loc: new URL('/directory/museums', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.6 },
    { loc: new URL('/directory/awards', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.6 },
    { loc: new URL('/directory/schools', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.6 },
    // The map is the homepage ("/"); /map redirects there.
    { loc: new URL('/info', site).toString(), lastmod, changefreq: 'monthly' as const, priority: 0.5 },
    { loc: new URL('/submission', site).toString(), lastmod, changefreq: 'monthly' as const, priority: 0.4 },
    { loc: new URL('/privacy', site).toString(), lastmod: privacyLastmod, changefreq: 'yearly' as const, priority: 0.2 },
    { loc: new URL('/terms', site).toString(), lastmod: termsLastmod, changefreq: 'yearly' as const, priority: 0.2 },
  ];

  return new Response(renderUrlSet(urls), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};

