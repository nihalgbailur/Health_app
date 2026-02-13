import assert from 'node:assert/strict';

import {
  computeDataCompletenessScore,
  isProductSparse,
  isProductStale,
  mergeProductRecords,
  normalizeOffProduct,
  normalizeScrapedProduct
} from '../catalogPipeline.mjs';

function run() {
  // 1) Brand extraction from tags/owner and localized ingredients extraction.
  const offLocalized = normalizeOffProduct(
    {
      product_name: 'Digestive Biscuit',
      brands: '',
      brands_tags: ['en:patanjali'],
      brand_owner: '',
      categories: 'biscuits',
      ingredients_text_hi: 'गेहूं का आटा, चीनी, वनस्पति तेल',
      nutriments: {
        energy_100g: '2000 kj',
        fat_100g: '18 g',
        'saturated-fat_100g': '8 g',
        sugars_100g: '24 g',
        salt_100g: '0.5 g',
        fiber_100g: '3 g',
        proteins_100g: '5 g'
      },
      countries_tags: ['en:india']
    },
    {
      barcode: '8900000000001',
      sourceUrl: 'https://world.openfoodfacts.org/api/v2/product/8900000000001.json',
      nowISO: '2026-02-13T00:00:00.000Z'
    }
  );

  assert.equal(offLocalized.brand, 'Patanjali');
  assert.equal(offLocalized.region_availability.includes('India'), true);
  assert.equal(offLocalized.ingredients_raw.length > 0, true);

  // 2) kJ conversion and sodium/salt consistency.
  assert.equal(offLocalized.nutrition_per_100g.energy_kcal, Number((2000 / 4.184).toFixed(2)));
  assert.equal(offLocalized.nutrition_per_100g.sodium_mg, 200);

  // 3) Completeness score should be above sparse threshold.
  assert.equal(isProductSparse(offLocalized), false);
  assert.equal(computeDataCompletenessScore(offLocalized) >= 4, true);

  // 4) Merge policy: richer incoming can replace weaker values while preserving provenance.
  const sparseExisting = normalizeOffProduct(
    {
      product_name: 'Butter Cookies',
      brands: 'Unknown brand',
      nutriments: {},
      countries_tags: []
    },
    {
      barcode: '8900000000002',
      sourceUrl: 'https://world.openfoodfacts.org/api/v0/product/8900000000002.json',
      nowISO: '2026-02-12T00:00:00.000Z'
    }
  );

  const scrapedRicher = normalizeScrapedProduct(
    {
      barcode: '8900000000002',
      name: 'Butter Cookies Classic',
      brand: 'Unibic',
      category: 'Biscuits',
      ingredients_raw: ['wheat flour', 'sugar', 'butter', 'salt'],
      nutrition_per_100g: {
        total_sugars_g: 21,
        salt_g: 0.8,
        total_fat_g: 16,
        protein_g: 6
      }
    },
    {
      barcode: '8900000000002',
      sourceUrl: 'https://www.unibicfoods.com/products/butter-cookies',
      nowISO: '2026-02-13T00:00:00.000Z'
    }
  );

  const merged = mergeProductRecords(sparseExisting, scrapedRicher, {
    nowISO: '2026-02-13T00:00:00.000Z'
  });

  assert.equal(merged.source_origin, 'merged');
  assert.equal(merged.brand, 'Unibic');
  assert.equal(merged.ingredients_raw.length >= 4, true);
  assert.equal(merged.source_urls.length >= 2, true);
  assert.equal(merged.data_quality_flags.includes('MERGED_SOURCES'), true);

  // 5) Staleness check.
  assert.equal(
    isProductStale(
      {
        ...merged,
        last_verified_at: '2026-02-10T00:00:00.000Z'
      },
      24,
      new Date('2026-02-13T00:00:00.000Z').getTime()
    ),
    true
  );

  console.log('Catalog pipeline tests passed.');
}

run();
