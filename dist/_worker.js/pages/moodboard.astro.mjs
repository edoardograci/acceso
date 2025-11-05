globalThis.process ??= {}; globalThis.process.env ??= {};
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_4boqM8s1.mjs';
import { $ as $$Layout, a as $$Navbar } from '../chunks/Navbar_DKhcllsQ.mjs';
export { renderers } from '../renderers.mjs';

const $$Moodboard = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Moodboard - Acceso" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Navbar", $$Navbar, {})} ${maybeRenderHead()}<main style="padding-top: var(--navbar-height); min-height: 100vh;"> <div style="padding: 48px var(--spacing-page); text-align: center;"> <h1 style="font-size: 48px; margin-bottom: 24px;">Moodboard</h1> <p style="color: var(--text-secondary);">Coming soon...</p> </div> </main> ` })}`;
}, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/pages/moodboard.astro", void 0);

const $$file = "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/pages/moodboard.astro";
const $$url = "/moodboard";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Moodboard,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
