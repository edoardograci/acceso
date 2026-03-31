import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

export const GET: APIRoute = ({ site }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

  const lastmod = toW3CDate(new Date());
  const urls = [
    { loc: new URL('/', site).toString(), lastmod, changefreq: 'weekly', priority: 1.0 },
    { loc: new URL('/designers', site).toString(), lastmod, changefreq: 'daily', priority: 0.9 },
    { loc: new URL('/projects', site).toString(), lastmod, changefreq: 'daily', priority: 0.8 },
    { loc: new URL('/events', site).toString(), lastmod, changefreq: 'weekly', priority: 0.7 },
    // Discover is the homepage ("/"); keep "/discover" only if it exists as a route.
    { loc: new URL('/map', site).toString(), lastmod, changefreq: 'weekly', priority: 0.6 },
    { loc: new URL('/info', site).toString(), lastmod, changefreq: 'monthly', priority: 0.5 },
    { loc: new URL('/get-listed', site).toString(), lastmod, changefreq: 'monthly', priority: 0.4 },
    { loc: new URL('/privacy', site).toString(), lastmod, changefreq: 'yearly', priority: 0.2 },
    { loc: new URL('/terms', site).toString(), lastmod, changefreq: 'yearly', priority: 0.2 },
  ];

  return new Response(renderUrlSet(urls), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};

