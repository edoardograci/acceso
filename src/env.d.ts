// env.d.ts (entire file)
/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

declare module '@libsql/client';

export type Env = {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  PUBLIC_SITE_URL: string;
  RESEND_API_KEY: string;
  JWT_SECRET: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  INDEX_BUCKET: R2Bucket;
  MOODBOARD_BUCKET: R2Bucket;
  JSON_BUCKET: R2Bucket;
  EVENTS_BUCKET: R2Bucket;
  IMAGES: {
    resize: (input: ArrayBuffer | ReadableStream | Response, options: Record<string, any>) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer>; type?: string }>;
  };
};

type Runtime = {
  env: Env;
  cf?: any;
  ctx?: any;
};

declare global {
  namespace App {
    interface Locals {
      runtime?: Runtime;
      user: {
        id: string;
        email: string;
        emailVerified: boolean;
        name?: string;
        plan?: string;
        createdAt?: string;
      } | null;
      session: {
        id: string;
        expiresAt: Date;
      } | null;
    }
  }

  interface ImportMetaEnv {
    readonly TURSO_DATABASE_URL?: string;
    readonly TURSO_AUTH_TOKEN?: string;
    readonly GOOGLE_CLIENT_ID?: string;
    readonly GOOGLE_CLIENT_SECRET?: string;
    readonly PUBLIC_SITE_URL?: string;
    readonly RESEND_API_KEY?: string;
    readonly TURNSTILE_SITE_KEY?: string;
    readonly TURNSTILE_SECRET_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    posthog?: {
      capture: (event: string, properties?: any) => void;
      identify: (distinctId: string, properties?: any) => void;
      alias: (alias: string) => void;
      reset: () => void;
      set_config: (config: any) => void;
      register: (properties: any) => void;
      init: (key: string, config: any) => void;
      [key: string]: any;
    };
    collectionsState?: {
      loaded: boolean;
      init: () => void;
      designers: Set<string>;
      objects: Set<string>;
      museums: Set<string>;
      universities: Set<string>;
      subscribe: (fn: () => void) => () => void;
      isSaved: (type: string, id: string) => boolean;
      getCount: (type: string) => number;
      addItem: (type: string, id: string) => Promise<void>;
      removeItem: (type: string, id: string) => Promise<void>;
      clear: () => void;
    };
    studiosData?: any[];
    __posthog_loaded?: boolean;
  }
}
