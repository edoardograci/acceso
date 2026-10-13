import type { APIRoute } from 'astro';
import { renderUrlSet, toW3CDate } from '../../lib/seo/sitemap';
import { readJsonFromBucket, toArray } from '../../lib/readJson';
import { isStudioIndexable, noindexGraceActive, NOINDEX_CHANGE_DATE } from '../../lib/seo/indexing';

export const GET: APIRoute = async ({ site, locals }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

  const env = (locals as any)?.runtime?.env || import.meta.env;
  const perPage = 18;

  let total = 0;
  // lastmod for the hub = newest indexable studio change, not "now" (a fabricated
  // date on every crawl teaches Google to ignore this sitemap's dates).
  let hubLastmod: string | undefined;
  try {
    const studios = toArray(await readJsonFromBucket('test-studios.json', env));
    total = studios.length;
    let newest = NaN;
    for (const s of studios) {
      if (!isStudioIndexable(s) || !s?.updated_at) continue;
      const t = new Date(s.updated_at).getTime();
      if (!isNaN(t) && (isNaN(newest) || t > newest)) newest = t;
    }
    if (!isNaN(newest)) hubLastmod = toW3CDate(new Date(newest));
  } catch {
    total = 0;
  }

  const urls: import('../../lib/seo/sitemap').SitemapUrl[] = [
    {
      loc: new URL('/designers', site).toString(),
      lastmod: hubLastmod,
      changefreq: 'daily' as const,
      priority: 0.9,
    },
  ];

  // /designers/page/2..N are served `noindex, follow` (designers/page/[page].astro).
  // Page 1 canonicalises to /designers, so it is not listed. They stay in the sitemap
  // only for the grace period (lib/seo/indexing.ts) so Google recrawls them and sees the
  // noindex sooner; afterwards they drop out automatically. Their lastmod is the day the
  // noindex shipped, which is when those pages really changed.
  if (noindexGraceActive()) {
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    for (let p = 2; p <= totalPages; p++) {
      urls.push({
        loc: new URL(`/designers/page/${p}`, site).toString(),
        lastmod: NOINDEX_CHANGE_DATE,
        changefreq: 'weekly' as const,
        priority: 0.4,
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
