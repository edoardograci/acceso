import type { APIRoute } from 'astro';
import { loadCatalog } from '../../lib/wishlist/store';
import { coverSrc } from '../../lib/wishlist/covers';
import { wishlistPaths } from '../../lib/wishlist/routes';
import { renderUrlSet, toW3CDate, type SitemapUrl } from '../../lib/seo/sitemap';

export const GET: APIRoute = async ({ site, locals, url }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

  const env = (locals as any)?.runtime?.env || import.meta.env;
  const catalog = await loadCatalog(env).catch(() => null);

  // Local seed data is never listed; a failed load degrades to an empty set.
  const urls: SitemapUrl[] = [];
  if (catalog && catalog.source === 'r2') {
    const abs = (p: string) => new URL(p, site).toString();
    const date = (v?: string) => {
      const d = v ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? toW3CDate(d) : undefined;
    };
    const newest = (items: { added?: string; updated?: string }[]) =>
      items.map((b) => date(b.updated) ?? date(b.added)).filter(Boolean).sort().at(-1);
    const siteLastmod = newest(catalog.books) ?? toW3CDate(new Date());

    urls.push({ loc: abs(wishlistPaths.hub()), lastmod: siteLastmod, changefreq: 'weekly', priority: 0.7 });
    urls.push({ loc: abs(wishlistPaths.books()), lastmod: siteLastmod, changefreq: 'weekly', priority: 0.7 });

    for (const c of catalog.categories) {
      const books = catalog.books.filter((b) => b.category === c.slug);
      if (!books.length) continue; // empty categories 404, so they stay out
      urls.push({ loc: abs(wishlistPaths.category(c.slug)), lastmod: newest(books) ?? siteLastmod, changefreq: 'weekly', priority: 0.7 });
    }
    for (const b of catalog.books) {
      const img = coverSrc(b.cover, url.origin);
      urls.push({
        loc: abs(wishlistPaths.book(b.category, b.slug)),
        lastmod: date(b.updated) ?? date(b.added) ?? siteLastmod,
        changefreq: 'monthly',
        priority: 0.6,
        images: img ? [new URL(img, url.origin).toString()] : undefined,
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
