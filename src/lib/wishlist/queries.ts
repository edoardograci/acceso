/**
 * Pure transformations: Catalog → view models. No I/O, no Astro, no markup.
 * Every "which books go where" decision lives here, so making related books
 * smarter later means editing this file and nothing else.
 */
import { coverView } from './covers';
import { wishlistPaths } from './routes';
import type { Book, BookCategory, BookView, Catalog, CategoryView } from './types';

export interface CatalogIndex {
  catalog: Catalog;
  categoryBySlug: Map<string, BookCategory>;
  bookBySlug: Map<string, Book>;
  booksByCategory: Map<string, Book[]>;
}

export function indexCatalog(catalog: Catalog): CatalogIndex {
  const booksByCategory = new Map<string, Book[]>();
  for (const c of catalog.categories) booksByCategory.set(c.slug, []);
  for (const b of catalog.books) booksByCategory.get(b.category)?.push(b);
  return {
    catalog,
    categoryBySlug: new Map(catalog.categories.map((c) => [c.slug, c])),
    bookBySlug: new Map(catalog.books.map((b) => [b.slug, b])),
    booksByCategory,
  };
}

export interface ViewCtx {
  origin: string;
}

export function toBookView(book: Book, idx: CatalogIndex, ctx: ViewCtx, opts: { width?: number; srcset?: boolean; widths?: number[] } = {}): BookView {
  const category = idx.categoryBySlug.get(book.category)!;
  const lang = book.language.trim();
  return {
    slug: book.slug,
    title: book.title,
    author: book.author,
    href: wishlistPaths.book(book.category, book.slug),
    language: lang,
    isEnglish: /^english$/i.test(lang),
    categorySlug: category.slug,
    categoryName: category.name,
    categoryHref: wishlistPaths.category(category.slug),
    summary: book.summary ?? '',
    cover: coverView(book, ctx.origin, { width: 480, srcset: true, ...opts }),
    featured: !!book.featured,
  };
}

export function toCategoryView(cat: BookCategory, idx: CatalogIndex, ctx: ViewCtx): CategoryView {
  const books = idx.booksByCategory.get(cat.slug) ?? [];
  const pinned = (cat.stack ?? []).map((s) => idx.bookBySlug.get(s)).filter((b): b is Book => !!b && b.category === cat.slug);
  const stackBooks = [...pinned, ...books.filter((b) => !pinned.includes(b))].slice(0, 4);
  return {
    slug: cat.slug,
    name: cat.name,
    h1: cat.h1 ?? cat.name,
    tagline: cat.tagline,
    href: wishlistPaths.category(cat.slug),
    count: books.length,
    stack: stackBooks.map((b) => toBookView(b, idx, ctx, { width: 360, srcset: false })),
  };
}

/** Categories that actually contain books (empty ones never get a page). */
export function publishedCategories(idx: CatalogIndex): BookCategory[] {
  return idx.catalog.categories.filter((c) => (idx.booksByCategory.get(c.slug)?.length ?? 0) > 0);
}

export function featuredBooks(idx: CatalogIndex, limit = 6): Book[] {
  return idx.catalog.books.filter((b) => b.featured).slice(0, limit);
}

/**
 * Related books for a book page.
 *  1. Manually pinned `related` slugs.
 *  2. Same category, walking forward from this book and wrapping around, so every
 *     book in a collection gets linked to (instead of always the first few).
 *  3. Other categories, ranked by shared tags, then same author.
 */
export function relatedBooks(idx: CatalogIndex, book: Book, limit = 5): { books: Book[]; sameCollection: boolean } {
  const picked: Book[] = [];
  const add = (b?: Book) => {
    if (b && b.slug !== book.slug && !picked.includes(b) && picked.length < limit) picked.push(b);
  };

  (book.related ?? []).forEach((s) => add(idx.bookBySlug.get(s)));

  const siblings = idx.booksByCategory.get(book.category) ?? [];
  const at = siblings.findIndex((b) => b.slug === book.slug);
  [...siblings.slice(at + 1), ...siblings.slice(0, Math.max(at, 0))].forEach(add);

  const sameCollection = picked.length >= Math.min(limit, 3) || picked.every((b) => b.category === book.category);

  if (picked.length < limit) {
    const tags = new Set((book.tags ?? []).map((t) => t.toLowerCase()));
    idx.catalog.books
      .filter((b) => b.category !== book.category)
      .map((b) => ({
        b,
        score: (b.tags ?? []).filter((t) => tags.has(t.toLowerCase())).length * 2 + (b.author === book.author ? 3 : 0),
      }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .forEach((x) => add(x.b));
  }
  return { books: picked, sameCollection };
}

export function moreByAuthor(idx: CatalogIndex, book: Book, limit = 4): Book[] {
  return idx.catalog.books.filter((b) => b.author === book.author && b.slug !== book.slug).slice(0, limit);
}
