// env.d.ts (entire file)
/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

declare module '@libsql/client';

interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {};
}

interface ImportMetaEnv {
  readonly TURSO_DATABASE_URL?: string;
  readonly TURSO_AUTH_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}