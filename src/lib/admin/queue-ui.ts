// src/lib/admin/queue-ui.ts
//
// Client-side helpers shared by the two admin review queues
// (/admin/submissions and /admin/recommendations).
//
// This is imported from bundled Astro <script> tags rather than `is:inline`,
// so the queues can build real DOM nodes instead of concatenating HTML
// strings. Nothing here touches the server.

export interface InboxCounts {
  submissions: Record<string, number>;
  suggestions: Record<string, number>;
  pendingSubmissions: number;
  newSuggestions: number;
}

export interface AdminInboxResponse {
  submissions: any[];
  suggestions: any[];
  counts: InboxCounts;
  errors: string[];
}

/** Fetch the admin inbox. Throws with a readable message on failure. */
export async function fetchInbox(): Promise<AdminInboxResponse> {
  const res = await fetch('/api/admin/inbox', { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Not authorised' : 'Failed to load the inbox');
  }
  const data = (await res.json()) as AdminInboxResponse;
  // An un-migrated database still returns rows but no counts block.
  if (!data.counts) {
    data.counts = { submissions: {}, suggestions: {}, pendingSubmissions: 0, newSuggestions: 0 };
  }
  return data;
}

/**
 * POST/DELETE JSON to an admin route.
 * Rejects with the server's own error message so the UI can show it verbatim.
 */
export async function adminAction(
  url: string,
  method: 'POST' | 'DELETE',
  body?: Record<string, unknown>
): Promise<any> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

/**
 * Rows store timestamps inconsistently: `created_at` is a unix integer on some
 * tables and an ISO string on others. Normalise both to a Date.
 */
export function toDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 1e8) {
    return new Date(numeric > 1e12 ? numeric : numeric * 1000);
  }
  const parsed = new Date(String(value));
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: unknown): string {
  const date = toDate(value);
  if (!date) return '-';
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** "3 days ago" / "just now" — the useful reading in a review queue. */
export function formatRelative(value: unknown): string {
  const date = toDate(value);
  if (!date) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [604800, 'week'],
    [2629800, 'month'],
    [31557600, 'year'],
  ];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  let chosen: [number, Intl.RelativeTimeFormatUnit] = units[0];
  for (const unit of units) {
    if (seconds >= unit[0]) chosen = unit;
  }
  return rtf.format(-Math.floor(seconds / chosen[0]), chosen[1]);
}

/** Slugify a studio name the same way the submission API does. */
export function slugify(input: string): string {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Create an element with classes, text and attributes in one call. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    class?: string;
    text?: string;
    html?: string;
    attrs?: Record<string, string>;
    children?: (Node | null | false | undefined)[];
  } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text != null) node.textContent = options.text;
  if (options.html != null) node.innerHTML = options.html;
  for (const [key, value] of Object.entries(options.attrs || {})) {
    node.setAttribute(key, value);
  }
  for (const child of options.children || []) {
    if (child) node.appendChild(child);
  }
  return node;
}

/** Case-insensitive "does this row match the search box" test. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => String(field ?? '').toLowerCase().includes(needle));
}

/** A transient status line at the top of a queue. */
export function toast(container: HTMLElement, message: string, tone: 'ok' | 'error' = 'ok') {
  container.textContent = message;
  container.className = `admin-toast is-visible ${tone === 'error' ? 'is-error' : 'is-ok'}`;
  window.clearTimeout((container as any)._timer);
  (container as any)._timer = window.setTimeout(() => {
    container.className = 'admin-toast';
  }, 4000);
}
