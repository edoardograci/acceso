export type GuideEmbed = {
  id: string;
  image?: string;
  imageAlt?: string;
  href?: string;
  linkLabel?: string;
};

export type GuideHeading = {
  depth: number;
  slug: string;
  text: string;
};

export function slugifyHeading(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function expandGuideEmbeds(markdown: string, embeds: GuideEmbed[]): string {
  if (!embeds.length) return markdown;
  const byId = new Map(embeds.map((e) => [e.id, e]));
  return markdown.replace(/\{\{embed:([a-z0-9-]+)\}\}/gi, (_m, id: string) => {
    const embed = byId.get(id);
    if (!embed) return '';
    const alt = escapeHtml(embed.imageAlt || embed.linkLabel || '');
    const img = embed.image
      ? `<img class="guide-embed-img" src="${escapeHtml(embed.image)}" alt="${alt}" loading="lazy" decoding="async" />`
      : '';
    const link = embed.href
      ? `<a class="guide-embed-link" href="${escapeHtml(embed.href)}">${escapeHtml(embed.linkLabel || 'Read more')} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></a>`
      : '';
    return `<div class="guide-embed-card">${img}${link}</div>\n`;
  });
}

export function finalizeGuideHtml(html: string): { html: string; headings: GuideHeading[] } {
  let bodyHtml = html
    .replace(/<table>/g, '<div class="table-scroll-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');

  bodyHtml = bodyHtml.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, (_m, attrs: string, inner: string) => {
    const existing = /id="([^"]+)"/.exec(attrs);
    const id = existing?.[1] || slugifyHeading(inner);
    const cleanedAttrs = attrs.replace(/\s*id="[^"]*"/, '');
    return `<h2 id="${id}"${cleanedAttrs}>${inner}</h2>`;
  });

  const headings: GuideHeading[] = [];
  bodyHtml.replace(/<h2[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g, (_m, slug: string, inner: string) => {
    headings.push({ depth: 2, slug, text: stripTags(inner) });
    return '';
  });

  return { html: bodyHtml, headings };
}

export function wordCountFromMarkdown(markdown?: string): number | undefined {
  if (!markdown) return undefined;
  const words = markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{embed:[^}]+\}\}/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length || undefined;
}
