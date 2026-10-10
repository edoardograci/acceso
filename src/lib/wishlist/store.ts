import type { Env } from '../../env.d';
import { readJsonFromBucket, toArray } from '../readJson';
import { isValidSlug } from './routes';
import type { Book, BookCategory, Catalog, WishlistCollection } from './types';

// ── Where the data lives ────────────────────────────────────────────────────
// Single flat file in the `json` R2 bucket keyed by slug.
export const WISHLIST_KEYS = {
  collections: 'wishlist/collections.json',
  books: 'wishlist.json',
} as const;

// Dummy data is only ever served when it is explicitly allowed (local dev, or a
// preview deployment with WISHLIST_USE_SEED=true). It can never silently stand
// in for real data in production if R2 has a hiccup.
function seedAllowed(env: Env | Record<string, any>): boolean {
  return import.meta.env.DEV || (env as any)?.WISHLIST_USE_SEED === 'true';
}

async function loadSeed() {
  const [collections, categories, books] = await Promise.all([
    import('../../data/wishlist/collections.json'),
    import('../../data/wishlist/books/categories.json'),
    import('../../data/wishlist/books/books.json'),
  ]);
  return { collections: collections.default, categories: categories.default, books: books.default };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[&]/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ── Validation (invalid rows are dropped and logged, never rendered) ─────────
function isAllowedCover(v: unknown): v is string {
  if (typeof v !== 'string' || !v.trim()) return false;
  if (v.startsWith('https://img.acceso.design/')) return true;
  if (v.startsWith('https://events.acceso.design/')) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(v) && !v.startsWith('//');
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function toBook(raw: any, slug: string, categories?: Set<string>): Book | null {
  const where = `[wishlist] book "${slug}"`;
  const problems: string[] = [];
  if (!isValidSlug(slug)) problems.push('slug');
  if (!str(raw?.name)) problems.push('name');
  if (!str(raw?.author)) problems.push('author');
  if (!str(raw?.description)) problems.push('description');
  const catSlug = slugify(raw?.subCollection ?? '');
  // Only validate category if categories set is provided (second pass)
  if (categories && !categories.has(catSlug)) problems.push(`category (unknown "${raw?.subCollection}")`);
  if (!isAllowedCover(raw?.cover)) problems.push('cover (R2 key or /path only)');
  if (!str(raw?.asin)) problems.push('asin');
  if (problems.length) {
    console.error(`${where}: skipped, bad ${problems.join(', ')}`);
    return null;
  }
  if (raw.draft === true) return null;

  const amazonUrl = `https://www.amazon.com/dp/${raw.asin}?tag=acceso-books-20`;

  return {
    slug,
    title: raw.name.trim(),
    author: raw.author.trim(),
    description: raw.description.trim(),
    cover: raw.cover,
    amazonUrl,
    publisher: str(raw.editor) ?? 'Unknown',
    published: typeof raw.year === 'number' ? raw.year : undefined,
    language: str(raw.language) ?? 'English',
    pages: typeof raw.pages === 'number' ? raw.pages : undefined,
    category: catSlug,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t: unknown) => typeof t === 'string') : [],
    related: Array.isArray(raw.related) ? raw.related.filter(isValidSlug) : [],
  } as Book;
}

function toCategory(raw: any): BookCategory | null {
  if (!isValidSlug(raw?.slug) || !str(raw?.name)) {
    console.error(`[wishlist] category "${raw?.slug ?? '?'}": skipped, needs slug + name`);
    return null;
  }
  return {
    ...raw,
    tagline: str(raw.tagline) ?? '',
    intro: Array.isArray(raw.intro) ? raw.intro.filter((p: unknown) => typeof p === 'string' && p.trim()) : [],
  } as BookCategory;
}

function toCollection(raw: any): WishlistCollection | null {
  if (!str(raw?.id) || !str(raw?.title) || !str(raw?.href)) {
    console.error(`[wishlist] collection "${raw?.id ?? '?'}": skipped, needs id, title, href`);
    return null;
  }
  return {
    ...raw,
    status: raw.status === 'active' ? 'active' : 'coming-soon',
    motif: ['books', 'tools', 'courses'].includes(raw.motif) ? raw.motif : 'books',
    description: str(raw.description) ?? '',
  } as WishlistCollection;
}

const byOrder = <T extends { order?: number }>(a: T, b: T) => (a.order ?? 999) - (b.order ?? 999);

function deriveCategoriesFromBooks(books: Book[]): BookCategory[] {
  const catMap = new Map<string, { name: string; slug: string; count: number }>();
  for (const book of books) {
    const existing = catMap.get(book.category);
    if (existing) {
      existing.count++;
    } else {
      catMap.set(book.category, {
        name: book.category
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        slug: book.category,
        count: 1,
      });
    }
  }
  return Array.from(catMap.values())
    .sort((a, b) => b.count - a.count)
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      tagline: '',
      intro: [],
    }));
}

function normalize(rawCollections: any, rawBooks: any, source: Catalog['source']): Catalog {
  const collections = toArray(rawCollections).map(toCollection).filter((c): c is WishlistCollection => !!c).sort(byOrder);
  const rawBookEntries = Object.entries(rawBooks ?? {}) as [string, any][];
  
  // First pass: collect all valid books without category validation to derive categories
  const booksFirstPass = rawBookEntries
    .map(([slug, data]) => toBook(data, slug))
    .filter((b): b is Book => !!b);

  // Derive categories from books' subCollection
  const categories = deriveCategoriesFromBooks(booksFirstPass);

  // Second pass: validate with proper categories
  const knownCats = new Set(categories.map((c) => c.slug));
  const seen = new Set<string>();
  const finalBooks = rawBookEntries
    .map(([slug, data]) => toBook(data, slug, knownCats))
    .filter((b): b is Book => {
      if (!b) return false;
      if (seen.has(b.slug)) {
        console.error(`[wishlist] book "${b.slug}": duplicate slug, skipped`);
        return false;
      }
      seen.add(b.slug);
      return true;
    });

  return { collections, categories, books: finalBooks, source };
}

// ── Public API ──────────────────────────────────────────────────────────────
// Short in-isolate memo: a category page would otherwise read and parse the
// catalog several times per request. Bounded staleness, same order of magnitude
// as the edge Cache-Control the pages set.
const TTL_MS = import.meta.env.DEV ? 0 : 60_000;
let memo: { at: number; value: Catalog } | null = null;

/**
 * Loads the whole Wishlist catalog, or null if it could not be loaded
 * (callers should answer 503, not 404, since that is a transient failure).
 */
export async function loadCatalog(env: Env | Record<string, any>): Promise<Catalog | null> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;

  const [c, b] = await Promise.all([
    readJsonFromBucket(WISHLIST_KEYS.collections, env),
    readJsonFromBucket(WISHLIST_KEYS.books, env),
  ]);

  let catalog: Catalog | null = null;
  if (c && b) {
    catalog = normalize(c, b, 'r2');
  } else if (b && !c && seedAllowed(env)) {
    // Collections missing from R2 but books present - use seed collections + R2 books
    const seed = await loadSeed();
    catalog = normalize(seed.collections, b, 'r2+seed');
  } else if (!c && !b && seedAllowed(env)) {
    // Both missing - use full seed
    const seed = await loadSeed();
    catalog = normalize(seed.collections, seed.books, 'seed');
  } else {
    const missing = Object.entries({ collections: c, books: b }).filter(([, v]) => !v).map(([k]) => k);
    console.error(`[wishlist] catalog unavailable (missing: ${missing.join(', ') || 'none'})`);
    return null;
  }

  memo = { at: Date.now(), value: catalog };
  return catalog;
}
