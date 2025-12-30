// scripts/generate-enrichment.ts
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { TursoHttpClient } from '../src/lib/turso';

interface EnrichmentData {
    product_id: string;
    image_id: string;
    embedding_text: string;
    enrichment_json: any;
}

interface ProductSource {
    id: string;
    name: string;
    designer: string | null;
    client: string | null;
    year: string | null;
    city: string | null;
}

interface MoodboardEnrichment {
    [productId: string]: {
        images: {
            [imageId: string]: {
                embedding_text: string;
                enrichment: any;
            };
        };
        metadata: {
            all_keywords: string[];
            primary_category: string;
            materials: string[];
            colors: string[];
            styles: string[];
        };
    };
}

async function generateEnrichmentData() {
    const dbUrl = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!dbUrl || !authToken) {
        console.error('❌ Error: Missing environment variables!');
        process.exit(1);
    }

    try {
        console.log('📊 Fetching enrichment data from Turso...');

        const turso = new TursoHttpClient(dbUrl, authToken);

        // Fetch all enrichment data
        const result = await turso.execute({
            sql: `SELECT 
              pi.product_id,
              pi.id as image_id,
              pi.embedding_text,
              pi.enrichment_json
            FROM product_images pi
            WHERE pi.embedding_text IS NOT NULL
            ORDER BY pi.product_id, pi.position`,
            args: []
        });

        console.log(`✅ Found ${result.rows.length} enriched images`);

        // Load moodboard.json to get product metadata
        const moodboardPath = path.join(process.cwd(), 'public', 'moodboard.json');
        const moodboardData = JSON.parse(fs.readFileSync(moodboardPath, 'utf-8'));
        const productsMap = new Map<string, ProductSource>(moodboardData.map((p: any) => [p.id, p]));

        // Build enrichment structure
        const enrichment: MoodboardEnrichment = {};

        result.rows.forEach((row: any) => {
            const productId = row.product_id;
            const imageId = row.image_id;

            if (!enrichment[productId]) {
                const product = productsMap.get(productId);
                enrichment[productId] = {
                    images: {},
                    metadata: {
                        all_keywords: [],
                        primary_category: 'design',
                        materials: [],
                        colors: [],
                        styles: []
                    }
                };

                // Extract metadata from product
                if (product) {
                    const keywords = new Set<string>();

                    // Add product metadata as keywords
                    if (product.name) keywords.add(product.name.toLowerCase());
                    if (product.designer) keywords.add(product.designer.toLowerCase());
                    if (product.client) keywords.add(product.client.toLowerCase());
                    if (product.year) keywords.add(product.year);
                    if (product.city) keywords.add(product.city.toLowerCase());

                    enrichment[productId].metadata.all_keywords = Array.from(keywords);
                }
            }

            // Parse enrichment JSON
            let enrichmentData = null;
            try {
                if (row.enrichment_json) {
                    enrichmentData = typeof row.enrichment_json === 'string'
                        ? JSON.parse(row.enrichment_json)
                        : row.enrichment_json;

                    // Extract materials, colors, styles from enrichment
                    if (enrichmentData.materials) {
                        enrichment[productId].metadata.materials.push(...enrichmentData.materials);
                    }
                    if (enrichmentData.colors) {
                        enrichment[productId].metadata.colors.push(...enrichmentData.colors);
                    }
                    if (enrichmentData.style) {
                        enrichment[productId].metadata.styles.push(enrichmentData.style);
                    }
                    if (enrichmentData.keywords) {
                        enrichment[productId].metadata.all_keywords.push(...enrichmentData.keywords);
                    }
                }
            } catch (e) {
                console.warn(`⚠️  Failed to parse enrichment for ${imageId}`);
            }

            // Store image enrichment
            enrichment[productId].images[imageId] = {
                embedding_text: row.embedding_text || '',
                enrichment: enrichmentData
            };
        });

        // Deduplicate metadata arrays
        Object.keys(enrichment).forEach(productId => {
            enrichment[productId].metadata.materials =
                Array.from(new Set(enrichment[productId].metadata.materials));
            enrichment[productId].metadata.colors =
                Array.from(new Set(enrichment[productId].metadata.colors));
            enrichment[productId].metadata.styles =
                Array.from(new Set(enrichment[productId].metadata.styles));
            enrichment[productId].metadata.all_keywords =
                Array.from(new Set(enrichment[productId].metadata.all_keywords));
        });

        // Write to public directory
        const publicDir = path.join(process.cwd(), 'public');
        const outputPath = path.join(publicDir, 'moodboard-enrichment.json');

        fs.writeFileSync(outputPath, JSON.stringify(enrichment, null, 2));

        console.log(`💾 Written enrichment data to ${outputPath}`);
        console.log(`📊 Total products enriched: ${Object.keys(enrichment).length}`);

        // Create metadata summary
        const metadataPath = path.join(publicDir, 'enrichment-metadata.json');
        fs.writeFileSync(
            metadataPath,
            JSON.stringify({
                lastUpdated: new Date().toISOString(),
                productCount: Object.keys(enrichment).length,
                imageCount: result.rows.length,
                totalKeywords: Object.values(enrichment)
                    .reduce((sum, p) => sum + p.metadata.all_keywords.length, 0)
            }, null, 2)
        );

        console.log('🎉 Enrichment data generated successfully!');
    } catch (error) {
        console.error('❌ Error generating enrichment data:', error);
        process.exit(1);
    }
}

generateEnrichmentData();