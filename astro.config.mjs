import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'hybrid',
  site: 'https://acceso.design',
  vite: {
    ssr: {
      external: ['@libsql/client']
    }
  }
});