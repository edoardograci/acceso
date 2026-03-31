// src/lib/images.ts
export function normalizeImage(path: string | null | undefined, Astro: any): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  // Always go through your working CDN proxy
  const origin = Astro.url.origin;
  const cleanPath = path.replace(/^\/+/, '');   // remove leading slashes
  return `${origin}/cdn/${cleanPath}`;
}