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
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
