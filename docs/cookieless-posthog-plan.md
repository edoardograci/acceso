# Cookieless PostHog Implementation Plan

## Prerequisite
Enable **"Cookieless server hash mode"** in PostHog project settings under Project Settings > Web analytics.

---

## Current Problem

| Current behavior | Problem |
|---|---|
| `persistence: 'memory'` when no consent | New session every page load → inflated sessions, useless bounce rate |
| Cookie banner gates PostHog init | Banner shown, consent cookie required |
| `identify()` on login | Creates persistent cross-session user ID (requires cookies) |

## Target Behavior

| New behavior | Result |
|---|---|
| `cookieless_mode: "always"` | Server hash for distinct_id, accurate session-level data, no cross-session tracking |
| No cookie banner | Clean UX, no consent prompt for analytics |
| No `identify()` calls | Compliant with cookieless mode |
| `register()` / `register_once()` kept | Session-level properties attached per page load |

---

## Files to Modify

### 1. `src/components/PostHogEnhanced.astro` (primary loader)
**Remove:**
- `userId`, `userEmail`, `userPlan`, `userName`, `userCreatedAt` from `define:vars`
- `CONSENT_COOKIE_NAME` constant and all cookie consent checks
- `hasConsent` variable
- Entire `identify()` block
- `set_config({ persistence: 'localStorage+cookie' })` after identify
- `analytics-consent-granted` event listener
- `persistence` and `persistence_name` options

**Add to `posthog.init()` config:**
```javascript
cookieless_mode: "always",
```

### 2. `src/components/posthog.astro` (legacy, unused)
Same changes as above.

### 3. `src/layouts/Layout.astro`
- Remove `CookieBanner` import
- Remove `<CookieBanner />` from body

### 4. `src/pages/profile.astro`
- Remove inline `window.posthog.identify()` + `set_config()` script block

### 5. `src/pages/privacy.astro`
- Update Analytics section to describe cookieless tracking

---

## Files NOT Changing
- `src/components/SaveButton.astro` — `capture()` works in cookieless mode
- `src/middleware.ts` — CSP stays
- `src/lib/analytics.ts` — dead code, not imported
- `src/env.d.ts` — type declarations stay

---

## Critical Warnings
1. `identify()` is forbidden in `cookieless_mode: "always"`
2. `register()` properties are session-only (current code already calls it per page load)
3. No cross-session tracking — hash resets daily by design
4. App auth cookies (Lucia) are completely unaffected
5. PostHog project setting must be enabled first
