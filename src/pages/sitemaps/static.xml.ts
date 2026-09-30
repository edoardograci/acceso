import type { APIRoute } from 'astro';
import { listGuides, guideDate } from '../../lib/guideStore';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';

export const GET: APIRoute = async ({ site, locals }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

  const lastmod = toW3CDate(new Date());
  // Static pages have a real "Last updated" date on-page — use it so Google
  // doesn't see these as changing every crawl.
  const privacyLastmod = '2025-12-30';
  const termsLastmod = '2025-12-30';

  // Guides live in R2 (json bucket, guides/*.json). A failure here must never take
  // down the rest of the sitemap, so it degrades to "no guide URLs".
  let guideUrls: { loc: string; lastmod: string; changefreq: 'monthly'; priority: number }[] = [];
  let guidesLastmod = lastmod;
  try {
    const env = (locals as any)?.runtime?.env || import.meta.env;
    const guides = await listGuides(env);
    guideUrls = guides.map((g) => ({
      loc: new URL(`/guides/${g.id}`, site).toString(),
      lastmod: toW3CDate(guideDate(g.updatedDate) ?? guideDate(g.publishDate) ?? new Date()),
      changefreq: 'monthly' as const,
      priority: 0.6,
    }));
    // The index changes when any guide does, so mirror the newest guide date.
    if (guideUrls.length) guidesLastmod = [...guideUrls.map((u) => u.lastmod)].sort().at(-1)!;
  } catch (e) {
    console.error('[sitemap] failed to list guides:', e);
  }

  const urls = [
    { loc: new URL('/', site).toString(), lastmod, changefreq: 'daily' as const, priority: 1.0 },
    // /designers lives in sitemaps/designer-directory.xml, which also owns its
    // pagination. Listing it here as well duplicated it across two sitemaps.
    { loc: new URL('/discover', site).toString(), lastmod, changefreq: 'daily' as const, priority: 0.8 },
    { loc: new URL('/directory', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.7 },
    { loc: new URL('/directory/fairs', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.6 },
    { loc: new URL('/directory/museums', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.6 },
    { loc: new URL('/directory/awards', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.6 },
    { loc: new URL('/directory/schools', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.6 },
    { loc: new URL('/guides', site).toString(), lastmod: guidesLastmod, changefreq: 'weekly' as const, priority: 0.6 },
    ...guideUrls,
    { loc: new URL('/info', site).toString(), lastmod, changefreq: 'monthly' as const, priority: 0.5 },
    { loc: new URL('/submission', site).toString(), lastmod, changefreq: 'monthly' as const, priority: 0.4 },
    // The HTML index at /sitemap is itself an indexable page.
    { loc: new URL('/sitemap', site).toString(), lastmod, changefreq: 'weekly' as const, priority: 0.3 },
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

