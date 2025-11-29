globalThis.process ??= {}; globalThis.process.env ??= {};
import { e as createAstro, f as createComponent, k as renderComponent, n as renderScript, r as renderTemplate, m as maybeRenderHead, l as Fragment, h as addAttribute } from '../chunks/astro/server_4boqM8s1.mjs';
import { $ as $$Layout, a as $$Navbar } from '../chunks/Navbar_B5DkdIwi.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro("https://acceso.pages.dev");
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Index;
  let studios = [];
  let error = null;
  try {
    const studiosUrl = new URL("/studios.json", Astro2.url.origin);
    const response = await fetch(studiosUrl.toString());
    if (!response.ok) throw new Error("Failed to load studios data");
    studios = await response.json();
  } catch (e) {
    error = e;
    console.error("Failed to fetch studios:", e);
  }
  const cities = [...new Set(studios.map((s) => s.city))].sort();
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Designers - Acceso", "data-astro-cid-6jqjz7f2": true }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Navbar", $$Navbar, { "data-astro-cid-6jqjz7f2": true })} ${maybeRenderHead()}<main class="designers-page" data-astro-cid-6jqjz7f2> <div class="designers-header" data-astro-cid-6jqjz7f2> <h1 data-astro-cid-6jqjz7f2>Designers</h1> ${!error && renderTemplate`<p id="studio-count" data-astro-cid-6jqjz7f2>${studios.length} Design Studios</p>`} </div> ${error && renderTemplate`<div class="error-state" data-astro-cid-6jqjz7f2> <h2 style="color: #ff6b6b; margin-bottom: 16px;" data-astro-cid-6jqjz7f2>Error Loading Studios</h2> <p style="color: var(--text-secondary);" data-astro-cid-6jqjz7f2>
Unable to load studio data. Please try again later.
</p> </div>`} ${!error && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-6jqjz7f2": true }, { "default": async ($$result3) => renderTemplate` <div class="filters-container" data-astro-cid-6jqjz7f2> <div class="search-bar" data-astro-cid-6jqjz7f2> <input type="text" id="search-input" placeholder="Search by name..." aria-label="Search studios" data-astro-cid-6jqjz7f2> </div> <div class="filter-buttons" data-astro-cid-6jqjz7f2> <button class="filter-btn active" data-city="all" data-astro-cid-6jqjz7f2>All</button> ${cities.map((city) => renderTemplate`<button class="filter-btn"${addAttribute(city, "data-city")} data-astro-cid-6jqjz7f2>${city}</button>`)} </div> </div> <div class="designers-grid" id="studios-grid" data-astro-cid-6jqjz7f2> ${studios.map((studio) => renderTemplate`<a${addAttribute(`/designers/${studio.slug}`, "href")} class="studio-card"${addAttribute(studio.name.toLowerCase(), "data-name")}${addAttribute(studio.city, "data-city")} data-astro-cid-6jqjz7f2> ${studio.cover ? renderTemplate`<img${addAttribute(studio.cover, "src")}${addAttribute(studio.name, "alt")} class="studio-image" loading="lazy" data-astro-cid-6jqjz7f2>` : renderTemplate`<div class="studio-image-placeholder" data-astro-cid-6jqjz7f2>No image</div>`} <div class="studio-info" data-astro-cid-6jqjz7f2> <h3 data-astro-cid-6jqjz7f2>${studio.name}</h3> <p data-astro-cid-6jqjz7f2>${studio.city}</p> </div> </a>`)} </div> <div class="empty-result" id="empty-result" style="display: none;" data-astro-cid-6jqjz7f2> <p data-astro-cid-6jqjz7f2>No studios found matching your criteria.</p> </div> ` })}`} </main> ` })} ${renderScript($$result, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/pages/designers/index.astro?astro&type=script&index=0&lang.ts")} `;
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
