globalThis.process ??= {}; globalThis.process.env ??= {};
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, h as addAttribute } from '../chunks/astro/server_4boqM8s1.mjs';
import { $ as $$Layout, a as $$Navbar } from '../chunks/Navbar_B5DkdIwi.mjs';
import { g as getAllStudios } from '../chunks/db_Bu8hGfrn.mjs';
/* empty css                                 */
export { renderers } from '../renderers.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  let studios = [];
  let error = null;
  try {
    studios = await getAllStudios();
  } catch (e) {
    error = e;
    console.error("Failed to fetch studios:", e);
  }
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Designers - Acceso", "data-astro-cid-6jqjz7f2": true }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Navbar", $$Navbar, { "data-astro-cid-6jqjz7f2": true })} ${maybeRenderHead()}<main class="designers-page" data-astro-cid-6jqjz7f2> <div class="designers-header" data-astro-cid-6jqjz7f2> <h1 data-astro-cid-6jqjz7f2>Designers</h1> ${!error && renderTemplate`<p data-astro-cid-6jqjz7f2>${studios.length} studios in Milan</p>`} </div> ${error && renderTemplate`<div class="error-state" data-astro-cid-6jqjz7f2> <h2 style="color: #ff6b6b; margin-bottom: 16px;" data-astro-cid-6jqjz7f2>Database Connection Error</h2> <p style="color: var(--text-secondary); margin-bottom: 16px;" data-astro-cid-6jqjz7f2>
Unable to connect to the database. Please check:
</p> <ul style="color: var(--text-secondary); text-align: left; max-width: 600px; margin: 0 auto;" data-astro-cid-6jqjz7f2> <li data-astro-cid-6jqjz7f2>Environment variables are set in Cloudflare Pages settings</li> <li data-astro-cid-6jqjz7f2>TURSO_DATABASE_URL is correct</li> <li data-astro-cid-6jqjz7f2>TURSO_AUTH_TOKEN is valid</li> <li data-astro-cid-6jqjz7f2>Database is accessible from Cloudflare</li> </ul> <details style="margin-top: 24px; padding: 16px; background: var(--gray-dark); border-radius: 8px; text-align: left; max-width: 800px; margin: 24px auto;" data-astro-cid-6jqjz7f2> <summary style="cursor: pointer; color: var(--accent-yellow);" data-astro-cid-6jqjz7f2>View Error Details</summary> <pre style="margin-top: 16px; overflow: auto; font-size: 12px; color: #ff6b6b;" data-astro-cid-6jqjz7f2>${JSON.stringify(error, null, 2)}</pre> </details> </div>`} ${!error && studios.length > 0 && renderTemplate`<div class="designers-grid" data-astro-cid-6jqjz7f2> ${studios.map((studio) => renderTemplate`<a${addAttribute(`/designers/${studio.slug}`, "href")} class="studio-card" data-astro-cid-6jqjz7f2> ${studio.cover ? renderTemplate`<img${addAttribute(studio.cover, "src")}${addAttribute(studio.name, "alt")} class="studio-image" data-astro-cid-6jqjz7f2>` : renderTemplate`<div class="studio-image-placeholder" data-astro-cid-6jqjz7f2>No image</div>`} <div class="studio-info" data-astro-cid-6jqjz7f2> <h3 data-astro-cid-6jqjz7f2>${studio.name}</h3> <p data-astro-cid-6jqjz7f2>${studio.city}</p> </div> </a>`)} </div>`} ${!error && studios.length === 0 && renderTemplate`<div class="empty-state" data-astro-cid-6jqjz7f2> <p data-astro-cid-6jqjz7f2>No studios found in the database.</p> <p style="margin-top: 16px; color: var(--text-secondary);" data-astro-cid-6jqjz7f2>
The database connection works, but no published studios were found.
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
