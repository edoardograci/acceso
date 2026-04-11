export function normalizeImage(
  path: string | null | undefined, 
  context: any | string, 
  options?: { width?: number; height?: number; quality?: number }
): string | null {
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
  const origin = typeof context === 'string' ? context : context.url.origin;
  const key = cleanPath.replace(/^\/+/, ''); // remove leading slashes
  
  let url = `${origin}/cdn/${key}`;
  
  if (options) {
    const params = new URLSearchParams();
    if (options.width) params.set('w', options.width.toString());
    if (options.height) params.set('h', options.height.toString());
    if (options.quality) params.set('q', options.quality.toString());
    
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}