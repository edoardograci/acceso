/** Single source of truth for Wishlist URLs. Change the hierarchy here only. */
export const WISHLIST_BASE = '/wishlist';
export const BOOKS_BASE = `${WISHLIST_BASE}/books`;

export const wishlistPaths = {
  hub: () => WISHLIST_BASE,
  books: () => BOOKS_BASE,
  category: (category: string) => `${BOOKS_BASE}/${category}`,
  book: (category: string, slug: string) => `${BOOKS_BASE}/${category}/${slug}`,
};

// Lowercase letters, digits and single hyphens. Also used to reject anything
// that could become a path or a key from a route param.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isValidSlug(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 160 && SLUG_RE.test(v);
}

/** Edge/browser caching for all Wishlist pages (same policy as /guides). */
export const WISHLIST_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
