import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server', // Changed from 'hybrid' to 'server'
  adapter: cloudflare({
    mode: 'directory'
  }),
  site: 'https://acceso.design',
  vite: {
    ssr: {
      external: ['@libsql/client']
    }
  }
});