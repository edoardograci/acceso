import { normalizeImage } from '../images';
import type { Book, CoverView } from './types';

const DEFAULT_RATIO = 2 / 3;
const CARD_WIDTHS = [240, 360, 480, 720];

/**
 * Covers are either
 *  - an R2 key ("wishlist/books/foo.webp"), served through the existing /cdn
 *    proxy (with on-the-fly resize), or
 *  - an app-relative path ("/images/…") for local/seed assets, used as-is.
 * Anything else is resolved by normalizeImage, which also rewrites the legacy
 * img.acceso.design host onto the proxy.
 */
function isLocal(cover: string): boolean {
  return cover.startsWith('/');
}

export function coverSrc(cover: string | null | undefined, origin: string, width?: number): string | null {
  if (!cover) return null;
  if (isLocal(cover)) return cover;
  return normalizeImage(cover, origin, width ? { width, quality: 82 } : undefined);
}

export function coverView(
  book: Book,
  origin: string,
  opts: { width?: number; srcset?: boolean; widths?: number[] } = {}
): CoverView {
  const width = book.coverWidth && book.coverWidth > 0 ? book.coverWidth : 600;
  const height = book.coverHeight && book.coverHeight > 0 ? book.coverHeight : Math.round(width / DEFAULT_RATIO);
  const src = coverSrc(book.cover, origin, opts.width);
  const srcset =
    opts.srcset && src && !isLocal(book.cover)
      ? (opts.widths ?? CARD_WIDTHS).map((w) => `${coverSrc(book.cover, origin, w)} ${w}w`).join(', ')
      : undefined;
  return {
    src,
    srcset,
    ratio: width / height,
    width,
    height,
    alt: book.coverAlt || `Cover of ${book.title} by ${book.author}`,
  };
}
