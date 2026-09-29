import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

/**
 * Guides collection - long-form editorial content (e.g. "Best Industrial
 * Design Competitions for Students"). Supports both:
 *  - Markdown files in src/content/guides/*.md  (body rendered via render())
 *  - JSON files in src/content/guides/*.json    (body stored as a markdown
 *    string in the `body` field, rendered manually in the layout)
 *
 * The file name (without extension) becomes the URL slug at /guides/<slug>.
 */
const guideSchema = z.object({
  // Evergreen on-page title (H1). Keep this free of dates/years.
  title: z.string(),
  // Optional override for <title>/OG title. Falls back to `${title} | Acceso Guides`.
  metaTitle: z.string().optional(),
  // Meta description (~150-155 chars) and OG/Twitter description.
  description: z.string(),
  // Short teaser used on the /guides index cards. Falls back to `description`.
  excerpt: z.string().optional(),
  // Path or absolute URL to the cover image (optional; used on the guide page and its card).
  coverImage: z.string().optional(),
  coverImageAlt: z.string().optional(),
  publishDate: z.coerce.date(),
  // Bump this whenever fees/prizes/deadlines are re-checked.
  updatedDate: z.coerce.date().optional(),
  author: z.object({
    name: z.string(),
    role: z.string().optional(),
    avatar: z.string().optional(),
  }),
  // Broad topical tags (also used as meta keywords + Article schema keywords).
  tags: z.array(z.string()).default([]),
  // Long-tail phrases this guide targets.
  longtailTags: z.array(z.string()).default([]),
  readingTime: z.string().optional(),
  // Rendered as an on-page FAQ + FAQPage schema.
  faqs: z
    .array(
      z.object({
        q: z.string(),
        a: z.string(),
      })
    )
    .default([]),
  usefulLinks: z
    .array(
      z.object({
        label: z.string(),
        href: z.string(),
      })
    )
    .default([]),
  draft: z.boolean().default(false),
  // JSON-sourced guides store their body as a markdown string here.
  // MD-sourced guides leave this empty (body comes from render()).
  body: z.string().optional(),
  // Optional related-directory promo shown in the sidebar after the article.
  sidebarCta: z
    .object({
      title: z.string(),
      text: z.string(),
      href: z.string(),
      ctaLabel: z.string(),
    })
    .optional(),
  // Structured inline cards referenced from the markdown body as {{embed:id}}.
  embeds: z
    .array(
      z.object({
        id: z.string(),
        image: z.string().optional(),
        imageAlt: z.string().optional(),
        href: z.string().optional(),
        linkLabel: z.string().optional(),
      })
    )
    .default([]),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.{md,json}', base: './src/content/guides' }),
  schema: guideSchema,
});

export const collections = { guides };
