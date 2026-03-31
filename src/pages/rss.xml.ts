import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';

type Studio = { slug: string; name: string; updated_at?: string | null; description?: string | null; city?: string | null };
type Project = { slug: string; name: string; updated_at?: string | null; designer?: string | null };

export const GET: APIRoute = async ({ site, url }) => {
  if (!site) return new Response('Missing site config', { status: 500 });

  const origin = url.origin;

  const [studios, projects] = await Promise.allSettled([
    fetch(new URL('/cdn/test-studios.json', origin)).then((r) => (r.ok ? r.json() : [])) as Promise<Studio[]>,
    fetch(new URL('/cdn/moodboard.json', origin)).then((r) => (r.ok ? r.json() : [])) as Promise<Project[]>,
  ]);

  const studioItems =
    studios.status === 'fulfilled'
      ? (Array.isArray(studios.value) ? studios.value : []).slice(0, 80).map((s) => {
          const link = new URL(`/designers/${encodeURIComponent(s.slug)}`, site).toString();
          const pubDate = s.updated_at ? new Date(s.updated_at) : new Date();
          const description =
            s.description ||
            (s.city ? `${s.name} — independent design studio in ${s.city}.` : `${s.name} — independent design studio.`);
          return {
            title: s.name,
            link,
            pubDate,
            description,
          };
        })
      : [];

  const projectItems =
    projects.status === 'fulfilled'
      ? (Array.isArray(projects.value) ? projects.value : []).slice(0, 80).map((p) => {
          const link = new URL(`/projects/${encodeURIComponent(p.slug)}`, site).toString();
          const pubDate = p.updated_at ? new Date(p.updated_at) : new Date();
          const description = p.designer ? `${p.name} by ${p.designer}.` : `${p.name}.`;
          return {
            title: p.designer ? `${p.name} — ${p.designer}` : p.name,
            link,
            pubDate,
            description,
          };
        })
      : [];

  const items = [...studioItems, ...projectItems]
    .filter((i) => i.title && i.link)
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
    .slice(0, 60);

  return rss({
    title: 'Acceso — Updates',
    description: 'New studios and projects added to Acceso.',
    site,
    items,
    customData: `<language>en</language>`,
  });
};

