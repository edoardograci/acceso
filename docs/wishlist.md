# Wishlist

Curated affiliate-link collections. Only **Books** is live; Tools & Hardware and Courses are
"coming soon" cards driven by the same registry.

    data (R2 JSON) → lib/wishlist/store.ts (load + validate)
                  → lib/wishlist/queries.ts (view models, related books)
                  → components/wishlist/* → pages/wishlist/*

## Routes
    /wishlist                              hub
    /wishlist/books                        collections + picks + FAQ
    /wishlist/books/[category]             category page
    /wishlist/books/[category]/[slug]      book page (wrong category → 301 to canonical)
    /sitemaps/wishlist.xml                 listed in /sitemap.xml

URL shapes live in `src/lib/wishlist/routes.ts`.

## Data (`json` R2 bucket)
- `wishlist/collections.json` → hub registry. Add a collection = add a row.
- `wishlist/books/categories.json` → name, `h1`, `topic`, tagline, SEO fields, `intro[]`.
- `wishlist/books/books.json` → see `src/lib/wishlist/types.ts`.

Seed copies live in `src/data/wishlist/` (same relative paths). Invalid rows (bad slug, unknown
category, non-https/non-Amazon `amazonUrl`, third-party cover host) are logged and skipped.

**Covers:** an R2 key (e.g. `wishlist/books/<slug>.webp`, served by `/cdn`, supports `?w=`) or an
app path starting with `/`. Set `coverWidth`/`coverHeight` for exact layout and OG sizes.

**Seed data** is served in `astro dev`, or on previews with `WISHLIST_USE_SEED=true`, only when R2
has none of the three files. Seed pages are `noindex` and left out of the sitemap. Publisher, year,
ISBN and all Amazon URLs in the seed are illustrative; replace before publishing.

## SEO
Unique title/description, canonical, one H1, breadcrumbs + `BreadcrumbList`, Open Graph
(`og:type=book`, cover as image). `Book` on books; `CollectionPage` + `ItemList` on hubs and
categories; `FAQPage` on the books hub. No `Offer`/`Product`/ratings (no price or review data).
Buy links use `rel="sponsored nofollow noopener"`.

## Affiliate disclosure
`src/lib/seo/wishlist.ts` holds the link-level disclosure and Amazon's required Associates
statement as separate constants.
