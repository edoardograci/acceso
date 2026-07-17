import type { APIRoute } from 'astro';

// Glyph (SDF font) proxy for the map.
//
// MapLibre resolves every `text-font` entry in a layer's stack against the
// single `glyphs` template. It sends the WHOLE fontstack as one
// comma-separated path segment, e.g.
//   /api/fonts/Geist_Regular,Noto Sans Regular/0-255.pbf
// We split that segment and try each font in order, returning the first that
// actually has the requested codepoint range. This gives proper fallback:
// Latin/covered codepoints come from our local Geist (fast, no extra network
// call), and only the ranges Geist lacks (CJK, Arabic, etc.) fall through to
// Noto Sans, proxied from OpenFreeMap — and ONLY when a visible label needs
// them. So a Europe-first homepage stays as fast as before; non-Latin glyphs
// are never fetched until the user pans over a region that uses them.
//
// Fontstack names use underscores to match the on-disk folder names
// (Geist_Regular / Geist_Bold); MapLibre URL-encodes the stack so spaces
// arrive as "Noto Sans Regular".
const OFM_GLYPHS_BASE = 'https://tiles.openfreemap.org/fonts';

export const GET: APIRoute = async ({ params, request }) => {
  const fontstackRaw = decodeURIComponent((params.fontstack as string) || '');
  // MapLibre requests "{range}.pbf", so the captured segment includes the
  // extension — strip it before validating.
  const rangeRaw = decodeURIComponent((params.range as string) || '');
  const range = rangeRaw.replace(/\.pbf$/i, '');

  // Validate shape: "Geist_Regular,Noto Sans Regular" + "0-255".
  if (!fontstackRaw || !/^\d+-\d+$/.test(range)) {
    return new Response('Bad Request', { status: 400 });
  }

  const fonts = fontstackRaw
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  const origin = new URL(request.url).origin;

  for (const font of fonts) {
    // 1) Local Geist glyphs — served as static files from our own origin.
    if (font === 'Geist_Regular' || font === 'Geist_Bold') {
      try {
        const localRes = await fetch(`${origin}/fonts/${font}/${range}.pbf`);
        if (localRes.ok) {
          const buf = await localRes.arrayBuffer();
          // Even if the file exists, our Geist PBFs are empty stubs for
          // non-Latin ranges (≈28 bytes). Treat those as "missing" so we
          // fall through to Noto Sans for the real glyphs.
          if (buf.byteLength > 64) {
            return new Response(buf, {
              status: 200,
              headers: {
                'Content-Type': 'application/x-protobuf',
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            });
          }
        }
      } catch {
        // fall through to the next font / proxy
      }
    }

    // 2) Proxy any other font (Noto Sans) from OpenFreeMap on demand.
    try {
      const upstream = `${OFM_GLYPHS_BASE}/${encodeURIComponent(font)}/${range}.pbf`;
      const res = await fetch(upstream);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-protobuf',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }
    } catch {
      // try the next font in the stack
    }
  }

  return new Response('Not Found', { status: 404 });
};

// No prerender — this is a dynamic proxy.
export const prerender = false;
