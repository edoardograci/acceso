globalThis.process ??= {}; globalThis.process.env ??= {};
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, h as addAttribute } from '../chunks/astro/server_4boqM8s1.mjs';
import { $ as $$Layout, a as $$Navbar } from '../chunks/Navbar_DKhcllsQ.mjs';
import { g as getAllStudios } from '../chunks/db_DiK_9Lwu.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const studios = await getAllStudios();
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Designers - Acceso", "data-astro-cid-6jqjz7f2": true }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Navbar", $$Navbar, { "data-astro-cid-6jqjz7f2": true })} ${maybeRenderHead()}<main class="designers-page" data-astro-cid-6jqjz7f2> <div class="designers-header" data-astro-cid-6jqjz7f2> <h1 data-astro-cid-6jqjz7f2>Designers</h1> <p data-astro-cid-6jqjz7f2>${studios.length} studios in Milan</p> </div> <div class="designers-grid" data-astro-cid-6jqjz7f2> ${studios.map((studio) => renderTemplate`<a${addAttribute(`/designers/${studio.slug}`, "href")} class="studio-card" data-astro-cid-6jqjz7f2> ${studio.cover ? renderTemplate`<img${addAttribute(studio.cover, "src")}${addAttribute(studio.name, "alt")} class="studio-image" data-astro-cid-6jqjz7f2>` : renderTemplate`<div class="studio-image-placeholder" data-astro-cid-6jqjz7f2>No image</div>`} <div class="studio-info" data-astro-cid-6jqjz7f2> <h3 data-astro-cid-6jqjz7f2>${studio.name}</h3> <p data-astro-cid-6jqjz7f2>${studio.city}</p> </div> </a>`)} </div> ${studios.length === 0 && renderTemplate`<div class="empty-state" data-astro-cid-6jqjz7f2> <p data-astro-cid-6jqjz7f2>No studios found. Check your database connection.</p> <p style="margin-top: 16px; color: var(--text-secondary);" data-astro-cid-6jqjz7f2>
Make sure your .env file has correct TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
</p> </div>`} </main> ` })} `;
}, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/pages/designers/index.astro", void 0);

const $$file = "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/pages/designers/index.astro";
const $$url = "/designers";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
