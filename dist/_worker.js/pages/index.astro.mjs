globalThis.process ??= {}; globalThis.process.env ??= {};
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_4boqM8s1.mjs';
import { $ as $$Layout, a as $$Navbar } from '../chunks/Navbar_DKhcllsQ.mjs';
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Acceso - Milan Design Studios" }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Navbar", $$Navbar, {})} ${maybeRenderHead()}<main style="padding-top: var(--navbar-height); min-height: 100vh;"> <div style="padding: 48px var(--spacing-page); text-align: center;"> <p style="font-size: 18px; color: var(--text-secondary); margin-bottom: 32px;">
Discover Milan's independent design studios
</p> <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;"> <a href="/designers" style="background: var(--accent-yellow); color: #000; padding: 16px 32px; text-decoration: none; font-weight: 600;">
Browse Designers
</a> <a href="/moodboard" style="background: var(--gray-dark); color: #fff; padding: 16px 32px; text-decoration: none; font-weight: 600;">
View Moodboard
</a> </div> </div> </main> ` })}`;
}, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/pages/index.astro", void 0);

const $$file = "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
