import type { APIRoute } from 'astro';
import { noindexGraceActive } from '../lib/seo/indexing';

const SITEMAPS = [
  { loc: '/sitemaps/static.xml' },
  { loc: '/sitemaps/designers.xml' },
  { loc: '/sitemaps/designer-directory.xml' },
  { loc: '/sitemaps/designer-locations.xml' },
  // /discover/* is served noindex; kept here only during the grace period so Google
  // recrawls (and sees the noindex) sooner. Drops out automatically afterwards.
  { loc: '/sitemaps/projects.xml', graceOnly: true },
  { loc: '/sitemaps/directory-items.xml' },
  { loc: '/sitemaps/directory-locations.xml' },
  { loc: '/sitemaps/wishlist.xml' },
] as const;

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    return new Response('Missing site config', { status: 500 });
  }

  const grace = noindexGraceActive();

  // No <lastmod> on the index entries: "now" on every request is not a real
  // modification date, and each child sitemap carries its own per-URL dates.
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    SITEMAPS.filter((s) => !('graceOnly' in s) || grace)
      .map(({ loc }) => `  <sitemap><loc>${new URL(loc, site).toString()}</loc></sitemap>`)
      .join('\n') +
    `\n</sitemapindex>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Keep fresh but cacheable at edge
      'Cache-Control': 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
