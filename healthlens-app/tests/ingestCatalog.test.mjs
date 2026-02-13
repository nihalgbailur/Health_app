import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { finalizeProductRecord } from '../catalogPipeline.mjs';
import { runIngestion } from '../scripts/ingest_catalog.mjs';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function run() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'healthlens-ingest-'));

  const staleProduct = finalizeProductRecord(
    {
      id: 'api-8902000000001',
      barcode: '8902000000001',
      name: 'Stale Snack',
      brand: 'SnackCo',
      category: 'Snacks',
      region_availability: ['India'],
      ingredients_raw: ['corn', 'salt'],
      nutrition_per_100g: { total_sugars_g: 4, salt_g: 1.8 }
    },
    {
      sourceOrigin: 'api',
      sourceUrl: 'https://world.openfoodfacts.org/api/v2/product/8902000000001.json',
      nowISO: '2026-02-10T00:00:00.000Z',
      preserveTimestamps: false
    }
  );

  const freshProduct = finalizeProductRecord(
    {
      id: 'api-8902000000002',
      barcode: '8902000000002',
      name: 'Fresh Oats',
      brand: 'GoodHarvest',
      category: 'Breakfast',
      region_availability: ['India'],
      ingredients_raw: ['whole grain oats'],
      nutrition_per_100g: { total_sugars_g: 1.1, salt_g: 0.1, fiber_g: 8 }
    },
    {
      sourceOrigin: 'api',
      sourceUrl: 'https://world.openfoodfacts.org/api/v2/product/8902000000002.json',
      nowISO: '2026-02-13T00:00:00.000Z',
      preserveTimestamps: false
    }
  );

  await fs.writeFile(path.join(tempRoot, 'products.json'), `${JSON.stringify([staleProduct, freshProduct], null, 2)}\n`, 'utf8');

  await fs.writeFile(
    path.join(tempRoot, 'barcode_queue.json'),
    `${JSON.stringify(
      {
        barcodes: [
          {
            barcode: '8903000000003',
            reason: 'api_sparse_needs_scrape',
            source: 'scanner',
            queued_at: '2026-02-13T00:00:00.000Z',
            queued_count: 1,
            candidate_urls: ['https://www.unibicfoods.com/products/butter-cookies']
          }
        ],
        last_updated: '2026-02-13T00:00:00.000Z'
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  await fs.writeFile(
    path.join(tempRoot, 'source_allowlist.json'),
    `${JSON.stringify(
      {
        domains: ['www.unibicfoods.com'],
        barcode_sources: {},
        rate_limit_ms: 1,
        timeout_ms: 3000,
        user_agent: 'HealthLensIngestor/1.0'
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  await fs.writeFile(path.join(tempRoot, 'ingestion_log.jsonl'), '', 'utf8');

  const fetchCalls = [];
  const mockFetch = async (url) => {
    const href = String(url);
    fetchCalls.push(href);

    if (href.includes('/api/v2/product/8902000000001.json')) {
      return new Response(
        JSON.stringify({
          status: 1,
          product: {
            code: '8902000000001',
            product_name: 'Stale Snack Updated',
            brands: 'SnackCo',
            ingredients_text_en: 'corn, palm oil, salt',
            nutriments: {
              sugars_100g: '8 g',
              salt_100g: '2.2 g',
              fat_100g: '24 g'
            },
            countries_tags: ['en:india']
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (href.includes('/api/v0/product/8902000000001.json')) {
      return new Response(JSON.stringify({ status: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (href.includes('/api/v2/product/8903000000003.json') || href.includes('/api/v0/product/8903000000003.json')) {
      return new Response(JSON.stringify({ status: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (href.endsWith('/robots.txt')) {
      return new Response('User-agent: *\nDisallow:\n', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    if (href.includes('https://www.unibicfoods.com/products/butter-cookies')) {
      return new Response(
        `<!doctype html><html><head><title>Unibic Butter Cookies</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Unibic Butter Cookies","brand":{"@type":"Brand","name":"Unibic"},"category":"Biscuits","ingredients":"wheat flour, sugar, butter, salt","nutrition":{"@type":"NutritionInformation","calories":"520 kcal","sugarContent":"21 g","saltContent":"0.9 g","fatContent":"16 g","proteinContent":"6 g"}}
</script>
</head><body>Unibic product page</body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      );
    }

    return new Response('', { status: 404 });
  };

  const result = await runIngestion({
    mode: 'daily',
    catalogDir: tempRoot,
    fetchImpl: mockFetch,
    now: new Date('2026-02-13T00:00:00.000Z')
  });

  assert.equal(result.processed, 2);
  assert.equal(result.resolved, 2);
  assert.equal(result.unresolved, 0);

  const productsAfter = await readJson(path.join(tempRoot, 'products.json'));
  const staleUpdated = productsAfter.find((item) => item.barcode === '8902000000001');
  const scrapedAdded = productsAfter.find((item) => item.barcode === '8903000000003');
  const freshUntouched = productsAfter.find((item) => item.barcode === '8902000000002');

  assert(staleUpdated, 'stale product should be present');
  assert.equal(staleUpdated.name.includes('Updated'), true);
  assert.equal(staleUpdated.last_verified_at, '2026-02-13T00:00:00.000Z');

  assert(scrapedAdded, 'queued barcode should be ingested via scrape fallback');
  assert.equal(scrapedAdded.source_origin === 'scrape' || scrapedAdded.source_origin === 'merged', true);
  assert.equal(scrapedAdded.ingredients_raw.length > 0, true);

  assert(freshUntouched, 'fresh product should still exist');
  assert.equal(fetchCalls.some((href) => href.includes('/8902000000002.json')), false);

  const queueAfter = await readJson(path.join(tempRoot, 'barcode_queue.json'));
  assert.equal(queueAfter.barcodes.length, 0);

  const logsRaw = await fs.readFile(path.join(tempRoot, 'ingestion_log.jsonl'), 'utf8');
  assert.equal(logsRaw.includes('"status":"resolved"'), true);

  console.log('Ingestion integration tests passed.');
}

run();
