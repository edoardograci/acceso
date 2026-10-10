/**
 * SEO copy + structured data for /wishlist. Reuses the shared builders in
 * ./schema and ./meta so Wishlist pages follow the same conventions as every
 * other section of the site.
 */
import type { Book, BookCategory, WishlistCollection } from '../wishlist/types';

// ── Affiliate disclosure ────────────────────────────────────────────────────
// Link-level disclosure (FTC: clear, conspicuous, near the links).
export const AFFILIATE_DISCLOSURE = 'Acceso may receive a commission from purchases made via links on this page.';
// Amazon's Associates Operating Agreement separately requires this exact
// statement on the site. Remove only if you are not enrolled in Amazon Associates.
export const AMAZON_ASSOCIATE_STATEMENT = 'As an Amazon Associate I earn from qualifying purchases.';

// ── Titles & descriptions ───────────────────────────────────────────────────
const DESC_MIN = 120;
const DESC_MAX = 155;

/**
 * Meta description: start from the authored sentence, add whole supporting
 * sentences only while they fit, and only cut (at a word) if the base itself is
 * too long. Never pads and then truncates mid-sentence.
 */
function fitDescription(base: string, extras: string[]): string {
  let d = base.trim();
  if (d.length > DESC_MAX) {
    const cut = d.slice(0, DESC_MAX - 1);
    return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
  }
  for (const e of extras) {
    if (d.length >= DESC_MIN) break;
    if ((d + ' ' + e).length <= DESC_MAX) d += ' ' + e;
  }
  return d;
}

const TITLE_BUDGET = 62;

function shortTitle(title: string): string {
  return title.split(/[:–—]/)[0].trim();
}

/** Longest title that fits the SERP budget, most descriptive first. */
export function bookPageTitle(book: Book, category: BookCategory): string {
  const topic = category.topic ?? category.name;
  const candidates = [
    `${book.title} by ${book.author} - ${topic} Book | Acceso`,
    `${book.title} by ${book.author} | Acceso`,
    `${book.title} | Acceso`,
    `${shortTitle(book.title)} by ${book.author} | Acceso`,
  ];
  return candidates.find((c) => c.length <= TITLE_BUDGET) ?? `${shortTitle(book.title)} | Acceso`;
}

export function bookPageDescription(book: Book, category: BookCategory): string {
  const topic = (category.topic ?? category.name).toLowerCase();
  return fitDescription(book.summary || book.description.split(/\n+/)[0], [
    `A ${topic} book by ${book.author}.`,
    'Curated by Acceso.',
  ]);
}

export function categoryPageTitle(category: BookCategory): string {
  return category.seoTitle ?? `${category.h1 ?? category.name} | Acceso`;
}

export function categoryPageDescription(category: BookCategory, count: number): string {
  return fitDescription(
    category.seoDescription || `Curated ${(category.h1 ?? category.name).toLowerCase()} for industrial and furniture designers.`,
    [`${count} hand-picked ${count === 1 ? 'title' : 'titles'}, curated by Acceso.`]
  );
}

export function collectionHubTitle(c: WishlistCollection): string {
  return c.seoTitle ?? `${c.h1 ?? c.title} | Acceso`;
}

// ── Structured data ─────────────────────────────────────────────────────────
const LANG: Record<string, string> = {
  english: 'en', italian: 'it', german: 'de', french: 'fr', spanish: 'es',
  portuguese: 'pt', dutch: 'nl', japanese: 'ja', chinese: 'zh', korean: 'ko', swedish: 'sv', danish: 'da',
};

/** "English / Italian" → ["en", "it"]; unknown languages are dropped, not guessed. */
export function languageCodes(language: string): string[] {
  return language
    .split(/[\/,&]|\band\b/i)
    .map((l) => LANG[l.trim().toLowerCase()])
    .filter((c): c is string => !!c);
}

export function bookSchema(p: {
  book: Book;
  category: BookCategory;
  canonical: string;
  categoryUrl: string;
  imageUrl?: string | null;
}) {
  const { book, category } = p;
  const langs = languageCodes(book.language);
  const authors = (book.authors?.length ? book.authors : [book.author]).map((name) => ({ '@type': 'Person', name }));
  // Deliberately no Offer/Product/AggregateRating: there is no price, stock or
  // review data here, and inventing it would be invalid (and misleading) markup.
  return {
    '@type': 'Book',
    '@id': `${p.canonical}#book`,
    name: book.title,
    url: p.canonical,
    mainEntityOfPage: { '@type': 'WebPage', '@id': p.canonical },
    author: authors.length === 1 ? authors[0] : authors,
    description: book.description.replace(/\s*\n+\s*/g, ' ').trim(),
    ...(p.imageUrl ? { image: p.imageUrl } : {}),
    ...(langs.length ? { inLanguage: langs.length === 1 ? langs[0] : langs } : {}),
    ...(book.isbn ? { isbn: book.isbn } : {}),
    ...(book.published ? { datePublished: book.published } : {}),
    ...(book.publisher ? { publisher: { '@type': 'Organization', name: book.publisher } } : {}),
    ...(book.pages ? { numberOfPages: book.pages } : {}),
    ...(book.format ? { bookFormat: `https://schema.org/${book.format}` } : {}),
    genre: category.name,
    ...(book.tags?.length ? { keywords: book.tags.join(', ') } : {}),
    isPartOf: { '@type': 'CollectionPage', name: category.h1 ?? category.name, url: p.categoryUrl },
  };
}

export function collectionPageSchema(p: {
  url: string;
  name: string;
  description: string;
  items: Array<{ url: string; name: string }>;
}) {
  return {
    '@type': 'CollectionPage',
    '@id': `${p.url}#collection`,
    url: p.url,
    name: p.name,
    description: p.description,
    isPartOf: { '@id': `${new URL('/', p.url).toString()}#website` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: p.items.length,
      itemListElement: p.items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: it.url, name: it.name })),
    },
  };
}
