import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    mode: 'directory',
    kvNamespaces: [], // disable KV sessions
  }),
  site: 'https://acceso.edoardograci.workers.dev/',
  image: {
    service: {
      entrypoint: "astro/assets/services/noop" // disables sharp at runtime
    }
  },
  vite: {
    ssr: {
      external: ['@libsql/client']
    }
  }
});
