/**
 * Wishlist data contracts.
 *
 * These mirror the JSON files that will live in the `json` R2 bucket:
 *   wishlist/collections.json          → WishlistCollection[]
 *   wishlist/books/categories.json     → BookCategory[]
 *   wishlist/books/books.json          → Book[]
 *
 * Nothing in components or pages should know where the data comes from.
 */

export type CollectionStatus = 'active' | 'coming-soon';
export type CollectionMotif = 'books' | 'tools' | 'courses';

/** A top-level Wishlist collection (Books, Tools & Hardware, Courses…). */
export interface WishlistCollection {
  id: string;
  title: string;
  href: string;
  status: CollectionStatus;
  motif: CollectionMotif;
  description: string;
  order?: number;
  // Hub-page copy (only needed for active collections)
  h1?: string;
  seoTitle?: string;
  seoDescription?: string;
  intro?: string[];
  faqs?: Array<{ q: string; a: string }>;
}

/** A sub-collection inside Books (Furniture Design, History & Theory…). */
export interface BookCategory {
  slug: string;
  name: string;
  /** Visible H1; defaults to `name`. Write it the way people search. */
  h1?: string;
  /** Short topical label used in book page titles, e.g. "Furniture Design". */
  topic?: string;
  tagline: string;
  seoTitle?: string;
  seoDescription?: string;
  /** Editorial paragraphs shown on the category page (unique, indexable copy). */
  intro: string[];
  order?: number;
  /** Book slugs to show in the cover stack; defaults to first books in the category. */
  stack?: string[];
}

export interface Book {
  slug: string;
  title: string;
  author: string;
  /** Optional structured list for schema.org Person nodes; falls back to [author]. */
  authors?: string[];
  category: string;
  description: string; // paragraphs separated by blank lines
  summary?: string; // one-liner for cards and meta description
  editorNote?: string; // "why it's on the wishlist"
  language: string;
  /** R2 key (e.g. "wishlist/books/x.webp") or an app-relative path starting with "/". */
  cover: string;
  coverWidth?: number;
  coverHeight?: number;
  coverAlt?: string;
  amazonUrl: string;
  published?: string; // "2011" or ISO date
  publisher?: string;
  isbn?: string;
  pages?: number;
  format?: 'Hardcover' | 'Paperback';
  tags?: string[];
  /** Manual "you may also like" overrides (book slugs), shown first. */
  related?: string[];
  featured?: boolean;
  draft?: boolean;
  added?: string; // ISO date, used for lastmod
  updated?: string;
}

export interface Catalog {
  collections: WishlistCollection[];
  categories: BookCategory[];
  books: Book[];
  /** 'seed' means local dummy data: pages must be noindex, never in sitemaps. */
  source: 'r2' | 'seed';
}

// ── View models (what components actually receive) ─────────────────────────

export interface CoverView {
  src: string | null;
  srcset?: string;
  ratio: number; // width / height
  width: number;
  height: number;
  alt: string;
}

export interface BookView {
  slug: string;
  title: string;
  author: string;
  href: string;
  language: string;
  isEnglish: boolean;
  categorySlug: string;
  categoryName: string;
  categoryHref: string;
  summary: string;
  cover: CoverView;
  featured: boolean;
}

export interface CategoryView {
  slug: string;
  name: string;
  h1: string;
  tagline: string;
  href: string;
  count: number;
  stack: BookView[];
}
