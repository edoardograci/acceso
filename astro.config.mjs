import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server', // Changed from 'hybrid' to 'server'
  adapter: cloudflare({
    mode: 'directory'
  }),
  site: 'https://acceso.edoardograci.workers.dev/',
  vite: {
    ssr: {
      external: ['@libsql/client']
    }
  }
});