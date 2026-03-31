import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    mode: 'directory',
    platformProxy: {
      enabled: true,
    },
  }),
  site: 'https://acceso.design',
  trailingSlash: 'never', // Prevent duplicate content SEO issues
  image: {
    domains: [],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mood.acceso.design',
      },
      {
        protocol: 'https',
        hostname: 'img.acceso.design',
      },
      {
        protocol: 'https',
        hostname: 'mood.acceso.edoardograci.com',
      },
      {
        protocol: 'https',
        hostname: 'json.acceso.design',
      },
    ],
  },
  vite: {
    plugins: [tailwindcss()]
  }
});