export function ensureProtocol(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url === '#') return url;
  const trimmedUrl = url.trim();
  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return `https://${trimmedUrl}`;
  }
  return trimmedUrl;
}
