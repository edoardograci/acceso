globalThis.process ??= {}; globalThis.process.env ??= {};
import { e as createAstro, f as createComponent, m as maybeRenderHead, h as addAttribute, r as renderTemplate, k as renderComponent, l as Fragment, n as renderScript } from '../../chunks/astro/server_4boqM8s1.mjs';
import { $ as $$Layout, a as $$Navbar } from '../../chunks/Navbar_B5DkdIwi.mjs';
/* empty css                                     */
export { renderers } from '../../renderers.mjs';

const $$Astro$2 = createAstro("https://acceso.pages.dev");
const $$Tabs = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$2, $$props, $$slots);
  Astro2.self = $$Tabs;
  const { active } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<div class="tabs" data-astro-cid-xlvzfuxv> <button${addAttribute(["tab", { active: active === "info" }], "class:list")}${addAttribute(active === "info", "disabled")} data-astro-cid-xlvzfuxv>
Info
</button> <button${addAttribute(["tab", { active: active === "moodboard" }], "class:list")}${addAttribute(active === "moodboard", "disabled")} data-astro-cid-xlvzfuxv>
Moodboard
</button> </div> `;
}, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/components/Tabs.astro", void 0);

const $$Astro$1 = createAstro("https://acceso.pages.dev");
const $$DesignerInfo = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$DesignerInfo;
  const { studio } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<div class="designer-info" data-astro-cid-whdgdgql> <div class="info-section" data-astro-cid-whdgdgql> <div class="info-label" data-astro-cid-whdgdgql>Name</div> <div class="info-value" data-astro-cid-whdgdgql>${studio.name}</div> </div> <div class="info-section" data-astro-cid-whdgdgql> <div class="info-label" data-astro-cid-whdgdgql>Location</div> <a${addAttribute(`/designers?city=${studio.city}`, "href")} class="info-value" data-astro-cid-whdgdgql> ${studio.city} </a> </div> ${studio.address && renderTemplate`<div class="info-section" data-astro-cid-whdgdgql> <div class="info-label" data-astro-cid-whdgdgql>Address</div> <a${addAttribute(`/?address=${encodeURIComponent(studio.address)}`, "href")} class="info-value" data-astro-cid-whdgdgql> ${studio.address} </a> </div>`} <div class="info-section" data-astro-cid-whdgdgql> <div class="info-label" data-astro-cid-whdgdgql>Email</div> <div class="info-value" data-astro-cid-whdgdgql> ${studio.email && renderTemplate`<a${addAttribute(`mailto:${studio.email}`, "href")} data-astro-cid-whdgdgql>${studio.email}</a>`} ${studio.email2 && renderTemplate`${renderComponent($$result, "Fragment", Fragment, { "data-astro-cid-whdgdgql": true }, { "default": ($$result2) => renderTemplate` <br data-astro-cid-whdgdgql> <a${addAttribute(`mailto:${studio.email2}`, "href")} data-astro-cid-whdgdgql>${studio.email2}</a> ` })}`} </div> </div> <div class="info-links" data-astro-cid-whdgdgql> ${studio.website && renderTemplate`<a${addAttribute(studio.website, "href")} target="_blank" rel="noopener noreferrer" class="info-link" data-astro-cid-whdgdgql>
Website
</a>`} ${studio.instagram && renderTemplate`<a${addAttribute(studio.instagram, "href")} target="_blank" rel="noopener noreferrer" class="info-link" data-astro-cid-whdgdgql>
Instagram
</a>`} </div> </div> `;
}, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/components/DesignerInfo.astro", void 0);

const $$ActionButtons = createComponent(async ($$result, $$props, $$slots) => {
  return renderTemplate`${maybeRenderHead()}<div class="action-buttons" data-astro-cid-szcpt32e> <button class="action-btn action-btn-copy" id="copyButton" aria-label="Copy link" data-astro-cid-szcpt32e> <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-astro-cid-szcpt32e> <path d="M15.75 15.75H20.25V3.75H8.25V8.25" stroke="#A6A6A6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-szcpt32e></path> <path d="M15.75 8.25H3.75V20.25H15.75V8.25Z" stroke="#A6A6A6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-astro-cid-szcpt32e></path> </svg> </button> <button class="action-btn action-btn-share" id="shareButton" aria-label="Share" data-astro-cid-szcpt32e> <svg width="20" height="16" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg" data-astro-cid-szcpt32e> <path d="M19.7914 7.16038L12.6484 0.204021C12.5486 0.106677 12.4213 0.0403535 12.2828 0.0134392C12.1442 -0.0134751 12.0006 0.000228543 11.87 0.0528169C11.7395 0.105405 11.6279 0.194516 11.5493 0.30888C11.4708 0.423244 11.4288 0.557725 11.4287 0.695314V4.20393C9.11262 4.39697 6.55454 5.50129 4.45003 7.23951C1.91605 9.33338 0.338345 12.0316 0.00708871 14.8367C-0.0187977 15.0548 0.0266083 15.2753 0.136845 15.4668C0.247081 15.6583 0.416531 15.8111 0.62108 15.9033C0.825628 15.9956 1.05485 16.0227 1.27613 15.9808C1.49741 15.9388 1.69947 15.83 1.85355 15.6698C2.83571 14.6515 6.33042 11.4316 11.4287 11.1481V14.608C11.4288 14.7456 11.4708 14.8801 11.5493 14.9945C11.6279 15.1088 11.7395 15.1979 11.87 15.2505C12.0006 15.3031 12.1442 15.3168 12.2828 15.2899C12.4213 15.263 12.5486 15.1967 12.6484 15.0993L19.7914 8.14297C19.925 8.01256 20 7.83588 20 7.65168C20 7.46747 19.925 7.29079 19.7914 7.16038ZM12.8573 12.9289V10.4342C12.8573 10.2497 12.7821 10.0728 12.6481 9.94233C12.5142 9.81187 12.3325 9.73858 12.143 9.73858C9.63584 9.73858 7.19383 10.376 4.88486 11.6342C3.7089 12.2779 2.61322 13.0517 1.61962 13.9402C2.13749 11.8672 3.44287 9.89597 5.37416 8.30036C7.44741 6.58822 9.97782 5.56477 12.143 5.56477C12.3325 5.56477 12.5142 5.49148 12.6481 5.36102C12.7821 5.23056 12.8573 5.05362 12.8573 4.86913V2.37528L18.2762 7.65168L12.8573 12.9289Z" fill="black" data-astro-cid-szcpt32e></path> <path d="M12.8573 12.9289V10.4342C12.8573 10.2497 12.7821 10.0728 12.6481 9.94233C12.5142 9.81187 12.3325 9.73858 12.143 9.73858C9.63584 9.73858 7.19383 10.376 4.88486 11.6342C3.7089 12.2779 2.61322 13.0517 1.61962 13.9402C2.13749 11.8672 3.44287 9.89597 5.37416 8.30036C7.44741 6.58822 9.97782 5.56477 12.143 5.56477C12.3325 5.56477 12.5142 5.49148 12.6481 5.36102C12.7821 5.23056 12.8573 5.05362 12.8573 4.86913V2.37528L18.2762 7.65168L12.8573 12.9289Z" fill="black" data-astro-cid-szcpt32e></path> </svg> </button> </div> ${renderScript($$result, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/components/ActionButtons.astro?astro&type=script&index=0&lang.ts")} `;
}, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/components/ActionButtons.astro", void 0);

const $$Astro = createAstro("https://acceso.pages.dev");
const $$slug = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$slug;
  const { slug } = Astro2.params;
  let studio = null;
  let error = null;
  try {
    const studiosUrl = new URL("/studios.json", Astro2.url.origin);
    const response = await fetch(studiosUrl.toString());
    if (!response.ok) throw new Error("Failed to load studios data");
    const studios = await response.json();
    studio = studios.find((s) => s.slug === slug) || null;
  } catch (e) {
    error = e;
    console.error("Failed to fetch studio:", e);
  }
  if (!studio && !error) {
    return Astro2.redirect("/404");
  }
  const pageTitle = studio ? `${studio.name} - Acceso` : "Studio Not Found";
  const pageDescription = studio ? `Discover ${studio.name}, an independent design studio in ${studio.city}` : "";
  const pageImage = studio?.cover || "/og-default.jpg";
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": pageTitle, "description": pageDescription, "image": pageImage, "type": "article", "data-astro-cid-6kwzvfqb": true }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Navbar", $$Navbar, { "data-astro-cid-6kwzvfqb": true })} ${maybeRenderHead()}<main class="designer-page" data-astro-cid-6kwzvfqb> <div class="designer-header" data-astro-cid-6kwzvfqb> <h1 class="designer-page-title" data-astro-cid-6kwzvfqb>Designers</h1> <p class="designer-breadcrumb" data-astro-cid-6kwzvfqb>/ ${studio?.name || "Not Found"}</p> </div> ${error ? renderTemplate`<div class="error-state" data-astro-cid-6kwzvfqb> <h2 style="color: #ff6b6b; margin-bottom: 16px;" data-astro-cid-6kwzvfqb>Error Loading Studio</h2> <p style="color: var(--text-secondary); margin-bottom: 16px;" data-astro-cid-6kwzvfqb>
Unable to load studio data. Please try again later.
</p> </div>` : renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-6kwzvfqb": true }, { "default": async ($$result3) => renderTemplate` <div class="designer-image-container" data-astro-cid-6kwzvfqb> ${studio.cover ? renderTemplate`<img${addAttribute(studio.cover, "src")}${addAttribute(studio.name, "alt")} class="designer-image" loading="eager" data-astro-cid-6kwzvfqb>` : renderTemplate`<div class="designer-image-placeholder" data-astro-cid-6kwzvfqb> <span data-astro-cid-6kwzvfqb>No image available</span> </div>`} </div> <div class="designer-content" data-astro-cid-6kwzvfqb> ${renderComponent($$result3, "Tabs", $$Tabs, { "active": "info", "data-astro-cid-6kwzvfqb": true })} ${renderComponent($$result3, "DesignerInfo", $$DesignerInfo, { "studio": studio, "data-astro-cid-6kwzvfqb": true })} ${renderComponent($$result3, "ActionButtons", $$ActionButtons, { "data-astro-cid-6kwzvfqb": true })} </div> ` })}`} </main> ` })} `;
}, "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/pages/designers/[slug].astro", void 0);

const $$file = "C:/Users/edoar/OneDrive/Desktop/Acceso-1/src/pages/designers/[slug].astro";
const $$url = "/designers/[slug]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$slug,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
