import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    mode: 'directory',
    platformProxy: {
      enabled: true,  // Enables local emulation of Cloudflare env
    },
  }),
  site: 'https://acceso.pages.dev',
  image: {
    service: {
      entrypoint: 'astro/assets/services/noop'
    }
  },
  vite: {
    ssr: {
      external: ['@libsql/client']
    }
  }
});