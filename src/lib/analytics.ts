// src/lib/analytics.ts
/**
 * Type-safe PostHog analytics utility library
 * Provides standardized event tracking with full TypeScript support
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Page types across the application
 */
export enum PageType {
    HOME = 'home',
    DESIGNERS_INDEX = 'designers_index',
    DESIGNER_PROFILE = 'designer_profile',
    MOODBOARD_INDEX = 'moodboard_index',
    MOODBOARD_DETAIL = 'moodboard_detail',
    MAP = 'map',
    PRICING = 'pricing',
    INFO = 'info',
    PRIVACY = 'privacy',
    TERMS = 'terms',
    LOGIN = 'login',
    PROFILE = 'profile',
    COLLECTIONS_DESIGNERS = 'collections_designers',
    COLLECTIONS_MOODBOARD = 'collections_moodboard',
    REQUEST_STUDIO = 'request_studio',
}

/**
 * User plans
 */
export enum UserPlan {
    FREE = 'free',
    PRO = 'pro',
}

/**
 * Device categories
 */
export enum DeviceCategory {
    MOBILE = 'mobile',
    TABLET = 'tablet',
    DESKTOP = 'desktop',
}

/**
 * Referrer types
 */
export enum ReferrerType {
    DIRECT = 'direct',
    ORGANIC = 'organic',
    SOCIAL = 'social',
    PAID = 'paid',
    REFERRAL = 'referral',
}

/**
 * Login methods
 */
export enum LoginMethod {
    EMAIL = 'email',
    GOOGLE = 'google',
    GITHUB = 'github',
}

/**
 * Person properties (user attributes)
 */
export interface PersonProperties {
    // Identity
    email?: string;
    name?: string;

    // Account status
    created_at?: string;
    plan?: UserPlan;
    role?: 'user' | 'studio_owner';

    // Engagement metrics
    saved_designers_count?: number;
    saved_moodboards_count?: number;
    total_sessions?: number;
    last_login_at?: string;

    // Profile completeness
    has_avatar?: boolean;
    has_bio?: boolean;
    has_completed_profile?: boolean;

    // Derived flags
    is_power_user?: boolean;
    account_age_days?: number;

    // Attribution (set once on signup)
    signup_source?: ReferrerType;
    signup_utm_source?: string;
    signup_utm_campaign?: string;
    signup_utm_medium?: string;
    signup_utm_term?: string;
    signup_utm_content?: string;
}

/**
 * Base event properties (included in all events)
 */
export interface BaseEventProperties {
    authenticated: boolean;
    user_plan?: UserPlan;
    page_type?: PageType;
    device_category?: DeviceCategory;
}

// ============================================================================
// EVENT PROPERTY INTERFACES
// ============================================================================

export interface SessionStartProperties extends BaseEventProperties {
    entry_url: string;
    entry_path: string;
    entry_page_type: PageType;
    referrer?: string;
    referrer_domain?: string;
    referrer_type: ReferrerType;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    viewport_width: number;
    viewport_height: number;
    is_returning_session: boolean;
}

export interface SessionEndProperties extends BaseEventProperties {
    session_duration_sec: number;
    pageviews_in_session: number;
    events_in_session: number;
    exit_page_type: PageType;
}

export interface PageViewProperties extends BaseEventProperties {
    page_title: string;
    page_url: string;
    from_page?: PageType;
}

export interface DesignerViewedProperties extends BaseEventProperties {
    designer_id: string;
    designer_name: string;
    designer_city?: string;
    designer_country?: string;
    from_page: PageType;
}

export interface DesignerSavedProperties extends BaseEventProperties {
    designer_id: string;
    designer_name: string;
    collection_count: number; // Count after save
}

export interface DesignerUnsavedProperties extends BaseEventProperties {
    designer_id: string;
    designer_name: string;
    collection_count: number; // Count after unsave
}

export interface DesignerExternalLinkProperties extends BaseEventProperties {
    designer_id: string;
    designer_name: string;
    link_type: 'website' | 'instagram' | 'other';
    link_url: string;
}

export interface DesignerSearchProperties extends BaseEventProperties {
    search_query: string;
    results_count: number;
}

export interface DesignerFilterProperties extends BaseEventProperties {
    filter_type: 'city' | 'category' | 'country';
    filter_value: string;
}

export interface MoodboardViewedProperties extends BaseEventProperties {
    moodboard_id: string;
    moodboard_title: string;
    from_page: PageType;
}

export interface MoodboardSavedProperties extends BaseEventProperties {
    moodboard_id: string;
    moodboard_title: string;
    collection_count: number;
}

export interface MoodboardUnsavedProperties extends BaseEventProperties {
    moodboard_id: string;
    moodboard_title: string;
    collection_count: number;
}

export interface MoodboardImageClickedProperties extends BaseEventProperties {
    moodboard_id: string;
    image_index: number;
    related_designer_id?: string;
}

export interface MapPinClickedProperties extends BaseEventProperties {
    designer_id: string;
    designer_name: string;
    designer_city: string;
}

export interface CollectionLimitReachedProperties extends BaseEventProperties {
    limit_type: 'designers' | 'moodboards';
    current_count: number;
    max_count: number;
}

export interface UserSignedUpProperties extends BaseEventProperties {
    signup_method: LoginMethod;
    referrer_domain?: string;
}

export interface UserLoggedInProperties extends BaseEventProperties {
    login_method: LoginMethod;
    is_first_login: boolean;
}

export interface UserLoggedOutProperties extends BaseEventProperties {
    session_duration_sec: number;
}

export interface AccountUpgradedProperties extends BaseEventProperties {
    from_plan: UserPlan;
    to_plan: UserPlan;
    from_page: PageType;
}

export interface StudioRequestedProperties extends BaseEventProperties {
    studio_name: string;
    studio_website?: string;
}

export interface SessionEngagedProperties extends BaseEventProperties {
    time_to_engagement_sec: number;
}

export interface ScrollDepthProperties extends BaseEventProperties {
    scroll_depth_percent: 25 | 50 | 75 | 100;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Safely access window.posthog
 */
function getPostHog() {
    if (typeof window === 'undefined') return null;
    return (window as any).posthog || null;
}

/**
 * Get current page type from pathname
 */
export function getPageType(pathname?: string): PageType {
    const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '/');

    if (path === '/') return PageType.HOME;
    if (path === '/designers') return PageType.DESIGNERS_INDEX;
    if (path.startsWith('/designers/')) return PageType.DESIGNER_PROFILE;
    if (path === '/moodboard') return PageType.MOODBOARD_INDEX;
    if (path.startsWith('/moodboard/')) return PageType.MOODBOARD_DETAIL;
    if (path === '/map') return PageType.MAP;
    if (path === '/pricing') return PageType.PRICING;
    if (path === '/info') return PageType.INFO;
    if (path === '/privacy') return PageType.PRIVACY;
    if (path === '/terms') return PageType.TERMS;
    if (path === '/login') return PageType.LOGIN;
    if (path === '/profile') return PageType.PROFILE;
    if (path === '/collections/designers') return PageType.COLLECTIONS_DESIGNERS;
    if (path === '/collections/moodboard') return PageType.COLLECTIONS_MOODBOARD;
    if (path === '/request-studio') return PageType.REQUEST_STUDIO;

    return PageType.HOME; // Default fallback
}

/**
 * Get device category from viewport width
 */
export function getDeviceCategory(): DeviceCategory {
    if (typeof window === 'undefined') return DeviceCategory.DESKTOP;

    const width = window.innerWidth;
    if (width < 768) return DeviceCategory.MOBILE;
    if (width < 1024) return DeviceCategory.TABLET;
    return DeviceCategory.DESKTOP;
}

/**
 * Get referrer domain from document.referrer
 */
export function getReferrerDomain(): string | undefined {
    if (typeof document === 'undefined') return undefined;

    const referrer = document.referrer;
    if (!referrer) return undefined;

    try {
        const url = new URL(referrer);
        return url.hostname;
    } catch {
        return undefined;
    }
}

/**
 * Classify referrer type
 */
export function classifyReferrer(): ReferrerType {
    const referrerDomain = getReferrerDomain();

    if (!referrerDomain) return ReferrerType.DIRECT;

    // Social media domains
    const socialDomains = ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'pinterest.com', 'tiktok.com'];
    if (socialDomains.some(domain => referrerDomain.includes(domain))) {
        return ReferrerType.SOCIAL;
    }

    // Search engines (organic)
    const searchDomains = ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com'];
    if (searchDomains.some(domain => referrerDomain.includes(domain))) {
        return ReferrerType.ORGANIC;
    }

    // Check for UTM params (indicates paid)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('utm_source') || urlParams.has('utm_medium')) {
        return ReferrerType.PAID;
    }

    // Everything else is referral
    return ReferrerType.REFERRAL;
}

/**
 * Get UTM parameter from URL
 */
export function getUtmParam(param: string): string | undefined {
    if (typeof window === 'undefined') return undefined;

    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param) || undefined;
}

/**
 * Check if user has visited before in this session
 */
export function hasViewedPageBefore(): boolean {
    if (typeof sessionStorage === 'undefined') return false;

    const hasVisited = sessionStorage.getItem('acceso_has_visited');
    if (!hasVisited) {
        sessionStorage.setItem('acceso_has_visited', 'true');
        return false;
    }
    return true;
}

/**
 * Sanitize URL to remove PII (email query params, etc.)
 */
export function sanitizeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        const params = urlObj.searchParams;

        // Remove common PII params
        const piiParams = ['email', 'phone', 'name', 'address'];
        piiParams.forEach(param => params.delete(param));

        return urlObj.toString();
    } catch {
        return url;
    }
}

/**
 * Get base event properties (included in all events)
 */
export function getBaseProperties(authenticated: boolean, userPlan?: UserPlan): BaseEventProperties {
    return {
        authenticated,
        user_plan: userPlan,
        page_type: getPageType(),
        device_category: getDeviceCategory(),
    };
}

// ============================================================================
// EVENT TRACKING FUNCTIONS
// ============================================================================

/**
 * Track page view
 */
export function trackPageView(properties: Partial<PageViewProperties> = {}) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('page_viewed', {
        page_title: document.title,
        page_url: window.location.href,
        ...properties,
    });
}

/**
 * Track session start
 */
export function trackSessionStart(properties: Partial<SessionStartProperties> = {}) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('session_start', {
        entry_url: window.location.href,
        entry_path: window.location.pathname,
        entry_page_type: getPageType(),
        referrer: document.referrer,
        referrer_domain: getReferrerDomain(),
        referrer_type: classifyReferrer(),
        utm_source: getUtmParam('utm_source'),
        utm_medium: getUtmParam('utm_medium'),
        utm_campaign: getUtmParam('utm_campaign'),
        utm_term: getUtmParam('utm_term'),
        utm_content: getUtmParam('utm_content'),
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        is_returning_session: hasViewedPageBefore(),
        ...properties,
    });
}

/**
 * Track session end
 */
export function trackSessionEnd(
    sessionStartTime: number,
    pageviewCount: number,
    eventCount: number,
    properties: Partial<SessionEndProperties> = {}
) {
    const posthog = getPostHog();
    if (!posthog) return;

    const sessionDuration = Math.floor((Date.now() - sessionStartTime) / 1000);

    posthog.capture('session_end', {
        session_duration_sec: sessionDuration,
        pageviews_in_session: pageviewCount,
        events_in_session: eventCount,
        exit_page_type: getPageType(),
        ...properties,
    });
}

/**
 * Track engaged session (after 30s)
 */
export function trackSessionEngaged(timeToEngagementSec: number = 30) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('session_engaged', {
        time_to_engagement_sec: timeToEngagementSec,
    });
}

/**
 * Track designer viewed
 */
export function trackDesignerViewed(properties: DesignerViewedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('designer_viewed', properties);
}

/**
 * Track designer saved
 */
export function trackDesignerSaved(properties: DesignerSavedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('designer_saved', properties);
}

/**
 * Track designer unsaved
 */
export function trackDesignerUnsaved(properties: DesignerUnsavedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('designer_unsaved', properties);
}

/**
 * Track designer external link click
 */
export function trackDesignerExternalLink(properties: DesignerExternalLinkProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('designer_clicked_external_link', properties);
}

/**
 * Track designer search
 */
export function trackDesignerSearch(properties: DesignerSearchProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('designer_searched', properties);
}

/**
 * Track designer filter
 */
export function trackDesignerFilter(properties: DesignerFilterProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('designer_filtered', properties);
}

/**
 * Track moodboard viewed
 */
export function trackMoodboardViewed(properties: MoodboardViewedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('moodboard_viewed', properties);
}

/**
 * Track moodboard saved
 */
export function trackMoodboardSaved(properties: MoodboardSavedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('moodboard_saved', properties);
}

/**
 * Track moodboard unsaved
 */
export function trackMoodboardUnsaved(properties: MoodboardUnsavedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('moodboard_unsaved', properties);
}

/**
 * Track moodboard image clicked
 */
export function trackMoodboardImageClicked(properties: MoodboardImageClickedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('moodboard_image_clicked', properties);
}

/**
 * Track map pin clicked
 */
export function trackMapPinClicked(properties: MapPinClickedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('map_pin_clicked', properties);
}

/**
 * Track collection limit reached
 */
export function trackCollectionLimitReached(properties: CollectionLimitReachedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('collection_limit_reached', properties);
}

/**
 * Track user signed up
 */
export function trackUserSignedUp(properties: UserSignedUpProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('user_signed_up', properties);
}

/**
 * Track user logged in
 */
export function trackUserLoggedIn(properties: UserLoggedInProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('user_logged_in', properties);
}

/**
 * Track user logged out
 */
export function trackUserLoggedOut(properties: UserLoggedOutProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('user_logged_out', properties);
}

/**
 * Track account upgraded
 */
export function trackAccountUpgraded(properties: AccountUpgradedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('account_upgraded', properties);
}

/**
 * Track studio requested
 */
export function trackStudioRequested(properties: StudioRequestedProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('studio_requested', properties);
}

/**
 * Track scroll depth milestone
 */
export function trackScrollDepth(properties: ScrollDepthProperties) {
    const posthog = getPostHog();
    if (!posthog) return;

    posthog.capture('scroll_depth_reached', properties);
}

/**
 * Identify user (call on login)
 */
export function identifyUser(userId: string, properties: PersonProperties = {}) {
    const posthog = getPostHog();
    if (!posthog || !posthog.identify) return;

    posthog.identify(userId, properties);

    // Upgrade from memory-only to persistent storage
    if (posthog.set_config) {
        posthog.set_config({ persistence: 'localStorage+cookie' });
    }
}

/**
 * Alias user (call once on first login to merge anonymous → identified)
 */
export function aliasUser(userId: string) {
    const posthog = getPostHog();
    if (!posthog || !posthog.alias) return;

    posthog.alias(userId);
}

/**
 * Reset user (call on logout)
 */
export function resetUser() {
    const posthog = getPostHog();
    if (!posthog || !posthog.reset) return;

    posthog.reset();
}

// ============================================================================
// SESSION TRACKING HELPERS
// ============================================================================

/**
 * Initialize session tracking on page load
 */
export function initializeSessionTracking() {
    if (typeof window === 'undefined') return;

    let sessionStartTime = Date.now();
    let pageviewCount = 0;
    let eventCount = 0;
    let engagementTracked = false;

    // Track session start
    trackSessionStart();

    // Track engaged session after 30s
    const engagementTimer = setTimeout(() => {
        if (!engagementTracked) {
            trackSessionEngaged(30);
            engagementTracked = true;
        }
    }, 30000);

    // Track pageviews
    pageviewCount++;

    // Listen for PostHog events to count them
    const posthog = getPostHog();
    if (posthog) {
        const originalCapture = posthog.capture;
        posthog.capture = function (...args: any[]) {
            eventCount++;
            return originalCapture.apply(this, args);
        };
    }

    // Track session end on page unload
    window.addEventListener('beforeunload', () => {
        trackSessionEnd(sessionStartTime, pageviewCount, eventCount);
        clearTimeout(engagementTimer);
    });

    // Track scroll depth
    const scrollMilestones = [25, 50, 75, 100];
    const trackedMilestones = new Set<number>();

    window.addEventListener('scroll', () => {
        const scrollPercent = Math.round(
            (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
        );

        scrollMilestones.forEach(milestone => {
            if (scrollPercent >= milestone && !trackedMilestones.has(milestone)) {
                trackScrollDepth({
                    scroll_depth_percent: milestone as 25 | 50 | 75 | 100,
                    authenticated: false, // Update based on actual auth state
                });
                trackedMilestones.add(milestone);
            }
        });
    });
}
