// src/lib/admin/icons.ts
//
// Icons for the analytics dashboard. Everything here is local: flags are
// derived from the ISO code as regional-indicator emoji, and the rest are
// small inline SVG paths. Nothing is fetched, so the dashboard leaks no
// traffic-source data to a third party and cannot be broken by a CDN.

/**
 * Flag emoji for an ISO-3166 alpha-2 code.
 *
 * Regional indicator symbols sit at U+1F1E6 + letter offset, so 'IT' becomes
 * U+1F1EE U+1F1F9. Returns a globe for unknown/invalid codes rather than a
 * broken pair of letters.
 */
export function flagEmoji(code: string | null | undefined): string {
  const iso = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso) || iso === 'XX') return '🌐';

  const A = 0x41;
  const BASE = 0x1f1e6;
  return String.fromCodePoint(BASE + (iso.charCodeAt(0) - A), BASE + (iso.charCodeAt(1) - A));
}

/** Inline SVG path data, drawn on a 24x24 viewBox with currentColor stroke. */
const PATHS = {
  desktop: 'M3 5h18v11H3zM8 20h8M12 16v4',
  mobile: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  tablet: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18',
  window: 'M3 5h18v14H3zM3 9h18',
  apple: 'M16 3c0 1.7-1.4 3-3 3 0-1.7 1.4-3 3-3zM19 16c-.6 1.6-1.7 3.5-3 3.5-1 0-1.4-.6-2.5-.6s-1.5.6-2.5.6c-1.4 0-3-2.3-3.6-4.4C6.5 12 7.6 9 10 9c1.1 0 1.8.7 2.7.7S14.3 9 15.6 9c1 0 2 .5 2.6 1.4-2.3 1.4-2 4.5.8 5.6z',
  penguin: 'M12 3c2.2 0 3.5 1.8 3.5 4v3c0 2 2.5 4 2.5 6.5 0 2-1.5 3.5-6 3.5s-6-1.5-6-3.5C6 14 8.5 12 8.5 10V7c0-2.2 1.3-4 3.5-4zM10.5 8h.01M13.5 8h.01',
  robot: 'M7 8h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM12 4v4M9 13h.01M15 13h.01M9.5 16h5',
  link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l4 4',
  share: 'M18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8.6 13.5l6.8 3.4M15.4 7.1L8.6 10.5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
} as const;

type IconName = keyof typeof PATHS;

/**
 * Build a 1em inline SVG. Returned as an element rather than a string so
 * callers can append it without going through innerHTML.
 */
export function icon(name: IconName, size = 14): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.appendChild(path);
  return svg;
}

export function deviceIcon(label: string): SVGSVGElement {
  const value = String(label || '').toLowerCase();
  if (value.includes('mobile') || value.includes('phone')) return icon('mobile');
  if (value.includes('tablet')) return icon('tablet');
  if (value.includes('desktop')) return icon('desktop');
  return icon('globe');
}

/**
 * Browsers get a coloured dot rather than a logo: real browser marks are
 * trademarked, and a stable colour per name reads just as fast in a list.
 */
const BROWSER_COLORS: Record<string, string> = {
  chrome: '#4285F4',
  safari: '#0FB5EE',
  firefox: '#FF7139',
  edge: '#0F7DC2',
  opera: '#EE2950',
  brave: '#FB542B',
  samsung: '#1428A0',
  duckduckgo: '#DE5833',
  vivaldi: '#EF3939',
  yandex: '#FC3F1D',
};

export function browserDot(label: string): HTMLElement {
  const key = String(label || '').toLowerCase();
  const match = Object.keys(BROWSER_COLORS).find((name) => key.includes(name));
  const dot = document.createElement('span');
  dot.className = 'an-dot';
  dot.style.background = match ? BROWSER_COLORS[match] : '#A1A1AA';
  return dot;
}

export function osIcon(label: string): SVGSVGElement {
  const value = String(label || '').toLowerCase();
  if (value.includes('mac') || value.includes('ios')) return icon('apple');
  if (value.includes('windows')) return icon('window');
  if (value.includes('linux') || value.includes('ubuntu')) return icon('penguin');
  if (value.includes('android')) return icon('robot');
  return icon('globe');
}

export function referrerTypeIcon(label: string): SVGSVGElement {
  const value = String(label || '').toLowerCase();
  if (value.includes('search')) return icon('search');
  if (value.includes('social')) return icon('share');
  if (value.includes('ai')) return icon('robot');
  if (value.includes('direct')) return icon('arrow');
  return icon('link');
}
