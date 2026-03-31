export function normalizeImage(path: string | null | undefined, Astro: any): string | null {
  if (!path) return null;

  let cleanPath = path;

  // 1. Rewrite legacy domains to use native proxy
  if (cleanPath.startsWith('https://img.acceso.design/')) {
    cleanPath = cleanPath.replace('https://img.acceso.design/', '');
  } else if (cleanPath.startsWith('https://mood.acceso.design/')) {
    cleanPath = cleanPath.replace('https://mood.acceso.design/', '');
  } 
  // 2. If it's still a full URL from somewhere else, return it
  else if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
    return cleanPath;
  }

  // 3. Go through your working CDN proxy
  const origin = Astro.url.origin;
  const key = cleanPath.replace(/^\/+/, ''); // remove leading slashes
  return `${origin}/cdn/${key}`;
}