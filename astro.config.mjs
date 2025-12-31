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
  site: 'https://acceso.design',
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp' // Use Sharp for local dev
    },
    domains: ['mood.acceso.design', 'img.acceso.design', 'mood.acceso.edoardograci.com'], // Allow external domains
  },
  vite: {
    ssr: {
      external: ['@libsql/client']
    }
  }
});