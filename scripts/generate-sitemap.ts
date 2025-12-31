import fs from 'fs';
import path from 'path';

const SITE_URL = 'https://acceso.design';
const PUBLIC_DIR = path.join(process.cwd(), 'public');

interface Studio {
    slug: string;
    cover?: string;
}

interface MoodboardItem {
    slug: string;
    cover?: string;
    status: string;
}

function formatXML(urls: string[]) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;
}

function generateSitemap() {
    // 1. Static Sitemap
    const staticURLs = [
        '',
        '/info',
        '/designers',
        '/moodboard',
        '/map',
        '/pricing',
        '/request-studio'
    ].map(route => `  <url>
    <loc>${SITE_URL}${route}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${route === '' ? '1.0' : '0.8'}</priority>
  </url>`);

    fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap-static.xml'), formatXML(staticURLs));

    // 2. Designers Sitemap
    try {
        const studios: Studio[] = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'studios.json'), 'utf-8'));
        const designerURLs = studios.map(studio => `  <url>
    <loc>${SITE_URL}/designers/${studio.slug}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    ${studio.cover ? `<image:image>
      <image:loc>${studio.cover}</image:loc>
    </image:image>` : ''}
  </url>`);

        fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap-designers.xml'), formatXML(designerURLs));
    } catch (e) {
        console.error('Error generating designers sitemap:', e);
    }

    // 3. Moodboard Sitemap
    try {
        const moodboard: MoodboardItem[] = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'moodboard.json'), 'utf-8'));
        const moodboardURLs = moodboard
            .filter(item => item.status === 'Published')
            .map(item => `  <url>
    <loc>${SITE_URL}/moodboard/${item.slug}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
    ${item.cover ? `<image:image>
      <image:loc>${item.cover}</image:loc>
    </image:image>` : ''}
  </url>`);

        fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap-moodboard.xml'), formatXML(moodboardURLs));
    } catch (e) {
        console.error('Error generating moodboard sitemap:', e);
    }

    // 4. Sitemap Index
    const indexXML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE_URL}/sitemap-static.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/sitemap-designers.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/sitemap-moodboard.xml</loc>
  </sitemap>
</sitemapindex>`;

    fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), indexXML);
    console.log('Sitemaps generated successfully!');
}

generateSitemap();
