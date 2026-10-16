/** Edge/browser caching for public SSR HTML (same idea as wishlist/guides). */
export const SSR_CACHE_CONTROL = 'public, max-age=0, s-maxage=300';

const NO_STORE_EXACT = new Set(['/login', '/submission', '/profile', '/map/mine']);
const NO_STORE_PREFIXES = ['/api', '/admin', '/profile', '/collections', '/login', '/auth', '/submission', '/cdn'];

/** Pages whose HTML is the same for every visitor (auth UI hydrates client-side). */
export function isPublicCacheablePath(pathname: string): boolean {
  if (NO_STORE_EXACT.has(pathname)) return false;
  if (pathname.startsWith('/map/mine')) return false;
  return !NO_STORE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function applySsrCacheControl(res: Response): void {
  if (res.status !== 200) return;
  if (res.headers.has('Cache-Control')) return;
  if (res.headers.has('Set-Cookie')) return;
  const ct = res.headers.get('Content-Type') || '';
  if (!ct.includes('text/html')) return;
  res.headers.set('Cache-Control', SSR_CACHE_CONTROL);
  res.headers.set('CDN-Cache-Control', SSR_CACHE_CONTROL);
}
