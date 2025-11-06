globalThis.process ??= {}; globalThis.process.env ??= {};
import { e as createAstro, f as createComponent, h as addAttribute, o as renderHead, p as renderSlot, r as renderTemplate, m as maybeRenderHead } from './astro/server_4boqM8s1.mjs';
/* empty css                           */

const $$Astro$1 = createAstro("https://acceso.pages.dev");
const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$Layout;
  const {
    title,
    description = "Discover Milan's independent design studios",
    image = "/og-default.jpg",
    type = "website"
  } = Astro2.props;
  const canonicalURL = new URL(Astro2.url.pathname, Astro2.site);
  return renderTemplate`<html lang="en"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><meta name="generator"${addAttribute(Astro2.generator, "content")}><title>${title}</title><meta name="title"${addAttribute(title, "content")}><meta name="description"${addAttribute(description, "content")}><link rel="canonical"${addAttribute(canonicalURL, "href")}><meta property="og:type"${addAttribute(type, "content")}><meta property="og:url"${addAttribute(canonicalURL, "content")}><meta property="og:title"${addAttribute(title, "content")}><meta property="og:description"${addAttribute(description, "content")}><meta property="og:image"${addAttribute(new URL(image, Astro2.site), "content")}><meta property="twitter:card" content="summary_large_image"><meta property="twitter:url"${addAttribute(canonicalURL, "content")}><meta property="twitter:title"${addAttribute(title, "content")}><meta property="twitter:description"${addAttribute(description, "content")}><meta property="twitter:image"${addAttribute(new URL(image, Astro2.site), "content")}>${renderHead()}</head> <body> ${renderSlot($$result, $$slots["default"])} </body></html>`;
}, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/layouts/Layout.astro", void 0);

const $$Astro = createAstro("https://acceso.pages.dev");
const $$Navbar = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Navbar;
  const links = [
    { label: "Map", href: "/map" },
    { label: "Designers", href: "/designers" },
    { label: "Moodboard", href: "/moodboard" },
    { label: "Contacts", href: "/contact" }
  ];
  const currentPath = Astro2.url.pathname;
  function isActive(href) {
    if (href === "/") {
      return currentPath === "/";
    }
    return currentPath.startsWith(href);
  }
  return renderTemplate`${maybeRenderHead()}<nav class="navbar" data-astro-cid-5blmo7yk> <div class="navbar-container" data-astro-cid-5blmo7yk> <a href="/" class="navbar-logo" data-astro-cid-5blmo7yk>ACCESO</a> <div class="navbar-links" data-astro-cid-5blmo7yk> ${links.map((link) => renderTemplate`<a${addAttribute(link.href, "href")}${addAttribute(["navbar-link", { active: isActive(link.href) }], "class:list")} data-astro-cid-5blmo7yk> ${link.label} </a>`)} </div> </div> </nav> `;
}, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/components/Navbar.astro", void 0);

export { $$Layout as $, $$Navbar as a };
