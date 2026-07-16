import type { APIRoute } from 'astro';

const SITEMAPS = [
  { loc: '/sitemaps/static.xml' },
  { loc: '/sitemaps/designers.xml' },
  { loc: '/sitemaps/designer-directory.xml' },
  { loc: '/sitemaps/designer-locations.xml' },
  { loc: '/sitemaps/projects.xml' },
  { loc: '/sitemaps/directory-items.xml' },
  { loc: '/sitemaps/directory-locations.xml' },
] as const;

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    return new Response('Missing site config', { status: 500 });
  }

  const now = new Date().toISOString();
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    SITEMAPS.map(({ loc }) => {
      const abs = new URL(loc, site).toString();
      return `  <sitemap><loc>${abs}</loc><lastmod>${now}</lastmod></sitemap>`;
    }).join('\n') +
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

