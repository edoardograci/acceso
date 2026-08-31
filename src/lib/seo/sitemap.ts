export type SitemapUrl = {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
  images?: string[];
};

export function toW3CDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Control characters are not representable in XML 1.0 at all, so a single one in
// a CMS field makes the whole sitemap unparseable for a crawler. Tab (9), LF (10)
// and CR (13) are the three that are legal and are kept.
// Written as an explicit scan rather than a regex so the source carries no
// literal control characters of its own.
function stripXmlControlChars(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) as number;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    out += ch;
  }
  return out;
}

export function escapeXml(s: string): string {
  return stripXmlControlChars(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderUrlSet(urls: SitemapUrl[]): string {
  const hasImages = urls.some((u) => (u.images?.length ?? 0) > 0);
  const ns =
    hasImages
      ? `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`
      : `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`;

  const body = urls
    .map((u) => {
      const parts: string[] = [];
      parts.push(`  <url>`);
      parts.push(`    <loc>${escapeXml(u.loc)}</loc>`);
      if (u.lastmod) parts.push(`    <lastmod>${escapeXml(u.lastmod)}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (typeof u.priority === 'number') parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
      for (const img of u.images ?? []) {
        parts.push(`    <image:image><image:loc>${escapeXml(img)}</image:loc></image:image>`);
      }
      parts.push(`  </url>`);
      return parts.join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${ns}>\n${body}\n</urlset>\n`;
}
