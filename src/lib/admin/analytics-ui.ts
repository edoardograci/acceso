// src/lib/admin/analytics-ui.ts
//
// DOM builders for the analytics dashboard. Every breakdown row is a button
// that appends a filter, so the panels double as the navigation.

import { el } from './queue-ui';
import { browserDot, deviceIcon, flagEmoji, osIcon, referrerTypeIcon } from './icons';
import { FILTER_LABELS, type AnalyticsFilter, type FilterKey } from '../analytics-filters';

export interface BreakdownItem {
  label: string;
  visitors: number;
  pageviews: number;
  code?: string;
}

export const ACCENT = '#2a78d6';
export const ACCENT_SOFT = '#eb6834';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(Number(value) || 0));
}

export function formatCompact(value: number): string {
  const n = Math.round(Number(value) || 0);
  if (Math.abs(n) < 10000) return formatNumber(n);
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds || 0));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  return `${minutes}m ${String(total % 60).padStart(2, '0')}s`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round((Number(fraction) || 0) * 100)}%`;
}

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

/* ---------------------------------------------------------------- Tiles */

export interface TileOptions {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  /** Marks the tile as the active graph metric. */
  active?: boolean;
  onClick?: () => void;
}

export function tile(options: TileOptions): HTMLElement {
  // Spans, not <p>/<div>: a metric tile can be a <button>, which only accepts
  // phrasing content. The CSS gives them block layout.
  const children: (Node | null)[] = [
    el('span', { class: 'an-tile-label', text: options.label }),
    el('span', { class: 'an-tile-value', text: options.value }),
  ];

  const footer = el('span', { class: 'an-tile-foot' });
  if (options.delta !== undefined && options.delta !== null && Number.isFinite(options.delta)) {
    const delta = options.delta;
    const flat = Math.abs(delta) < 0.05;
    const tone = flat ? 'is-flat' : delta > 0 ? 'is-up' : 'is-down';
    footer.appendChild(
      el('span', {
        class: `an-delta ${tone}`,
        text: `${flat ? '→' : delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}%`,
      })
    );
  } else if (options.delta === null) {
    footer.appendChild(el('span', { class: 'an-delta is-flat', text: 'no baseline' }));
  }
  if (options.hint) footer.appendChild(el('span', { class: 'an-tile-hint', text: options.hint }));
  if (footer.childNodes.length) children.push(footer);

  if (options.onClick) {
    const button = el('button', {
      class: `an-tile is-button ${options.active ? 'is-active' : ''}`,
      attrs: { type: 'button', 'aria-pressed': String(Boolean(options.active)) },
      children,
    });
    button.addEventListener('click', options.onClick);
    return button;
  }

  return el('div', { class: 'an-tile', children });
}

/* ----------------------------------------------------------- Breakdowns */

/** Small leading glyph per dimension, so rows are scannable at a glance. */
function rowGlyph(filterKey: FilterKey | undefined, item: BreakdownItem): Node | null {
  switch (filterKey) {
    case 'country':
      return el('span', { class: 'an-flag', text: flagEmoji(item.code) });
    case 'browser':
      return browserDot(item.label);
    case 'os':
      return osIcon(item.label);
    case 'device':
      return deviceIcon(item.label);
    case 'referrerType':
      return referrerTypeIcon(item.label);
    default:
      return null;
  }
}

export interface BreakdownOptions {
  title: string;
  items: BreakdownItem[];
  /** Dimension these rows filter on. Omit to render non-clickable rows. */
  filterKey?: FilterKey;
  /** Value used for the filter, when it differs from the label (country codes). */
  filterValue?: (item: BreakdownItem) => string;
  limit?: number;
  emptyText?: string;
  /** Column heading for the right-hand number. */
  valueLabel?: string;
  onFilter?: (filter: AnalyticsFilter) => void;
}

export function breakdown(options: BreakdownOptions): HTMLElement {
  const {
    title,
    items,
    filterKey,
    filterValue,
    limit = 10,
    emptyText = 'No data in this period.',
    valueLabel = 'visitors',
    onFilter,
  } = options;

  const section = el('section', { class: 'an-card' });
  section.appendChild(
    el('header', {
      class: 'an-card-head',
      children: [
        el('h2', { class: 'an-card-title', text: title }),
        el('span', { class: 'an-card-metric', text: valueLabel }),
      ],
    })
  );

  const visible = (items || []).slice(0, limit);
  if (!visible.length) {
    section.appendChild(el('p', { class: 'an-empty', text: emptyText }));
    return section;
  }

  const max = visible.reduce((acc, item) => Math.max(acc, item.visitors || 0), 0);
  const list = el('ul', { class: 'an-list' });

  for (const item of visible) {
    // The bar is a pale fill *behind* the label rather than a separate rail
    // underneath — the Plausible idiom, and it keeps rows to one line.
    const width = max > 0 ? Math.max((item.visitors / max) * 100, 1) : 0;
    const fill = el('span', { class: 'an-row-fill' });
    fill.style.width = `${width}%`;

    const glyph = rowGlyph(filterKey, item);
    const label = el('span', { class: 'an-row-label', text: item.label, attrs: { title: item.label } });
    const value = el('span', { class: 'an-row-value', text: formatCompact(item.visitors) });
    const secondary = el('span', { class: 'an-row-secondary', text: formatCompact(item.pageviews) });

    const inner: (Node | null)[] = [fill, glyph, label, value, secondary];

    let row: HTMLElement;
    if (filterKey && onFilter) {
      const value_ = filterValue ? filterValue(item) : item.label;
      row = el('button', {
        class: 'an-row is-clickable',
        attrs: {
          type: 'button',
          title: `Filter by ${FILTER_LABELS[filterKey]}: ${item.label}`,
        },
        children: inner,
      });
      row.addEventListener('click', () => onFilter({ key: filterKey, value: value_ }));
    } else {
      row = el('div', { class: 'an-row', children: inner });
    }

    list.appendChild(el('li', { children: [row] }));
  }

  section.appendChild(list);

  if ((items || []).length > limit) {
    section.appendChild(
      el('p', { class: 'an-card-foot', text: `+${(items || []).length - limit} more` })
    );
  }

  return section;
}

/* --------------------------------------------------------- Filter pills */

export function filterPills(
  filters: AnalyticsFilter[],
  onRemove: (index: number) => void,
  onClear: () => void
): HTMLElement | null {
  if (!filters.length) return null;

  const bar = el('div', { class: 'an-filters' });
  bar.appendChild(el('span', { class: 'an-filters-label', text: 'Filtered by' }));

  filters.forEach((filter, index) => {
    const remove = el('button', {
      class: 'an-pill-remove',
      text: '×',
      attrs: { type: 'button', 'aria-label': `Remove ${FILTER_LABELS[filter.key]} filter` },
    });
    remove.addEventListener('click', () => onRemove(index));

    bar.appendChild(
      el('span', {
        class: 'an-pill',
        children: [
          el('span', { class: 'an-pill-key', text: FILTER_LABELS[filter.key] }),
          el('span', { class: 'an-pill-value', text: filter.value }),
          remove,
        ],
      })
    );
  });

  const clear = el('button', { class: 'an-filters-clear', text: 'Clear all', attrs: { type: 'button' } });
  clear.addEventListener('click', onClear);
  bar.appendChild(clear);

  return bar;
}
