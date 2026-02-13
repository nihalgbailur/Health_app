import assert from 'node:assert/strict';

import { PRODUCTS } from '../data.mjs';
import {
  compareProducts,
  evaluateProduct,
  parseIngredientsInput,
  validateEvidenceCompleteness
} from '../riskEngine.mjs';

const byId = (id) => {
  const product = PRODUCTS.find((p) => p.id === id);
  assert(product, `Expected product ${id} to exist`);
  return product;
};

const byNutrientKey = (scan, key) => {
  const assessment = scan.nutrition_assessment.find((item) => item.nutrient_key === key);
  assert(assessment, `Expected nutrient assessment for ${key}`);
  return assessment;
};

function run() {
  // 1. Known high-risk additive should result in High severity and evidence cards.
  const turmeric = evaluateProduct(byId('p1'));
  assert.equal(turmeric.severity, 'High');
  assert(turmeric.risk_signals.some((s) => s.rule_triggered === 'lead_chromate'));
  assert.equal(validateEvidenceCompleteness(turmeric), true);

  // 2. Unknown manual check with no trigger should produce Unknown state.
  const manualUnknown = evaluateProduct(null, {
    ingredients: parseIngredientsInput('whole oats, water, sea salt')
  });
  assert.equal(manualUnknown.severity, 'Unknown');
  assert.equal(manualUnknown.risk_signals.length, 0);

  // 2b. Catalog product without ingredients/nutrition should stay Unknown, not Low.
  const sparseLiveProduct = evaluateProduct({
    id: 'live-missing',
    barcode: '0000000000000',
    name: 'Sparse Live Product',
    brand: 'Unknown',
    category: 'General',
    region_availability: ['Global'],
    ingredients_raw: [],
    nutrition_per_100g: {}
  });
  assert.equal(sparseLiveProduct.severity, 'Unknown');
  assert.match(sparseLiveProduct.summary, /limited product data/i);

  // 3. Compare two products and ensure lower-risk recommendation is selected.
  const chips = byId('p3');
  const oats = byId('p4');
  const comparison = compareProducts(chips, oats);
  assert.equal(comparison.recommendedProductId, oats.id);
  assert(comparison.left.risk_score > comparison.right.risk_score);

  // 4. High/Moderate signals should always include evidence cards.
  const yogurt = evaluateProduct(byId('p5'));
  assert.equal(validateEvidenceCompleteness(yogurt), true);

  // 5. Under-review controversial claim should be labeled as such.
  const underReview = evaluateProduct(null, {
    ingredients: parseIngredientsInput('water, aspartame, flavor')
  });
  const reviewSignal = underReview.risk_signals.find((s) => s.rule_triggered === 'synthetic_sweeteners');
  assert(reviewSignal, 'Expected synthetic_sweeteners signal');
  assert(reviewSignal.evidence.some((card) => card.source_type === 'Under Review'));

  // 6. Red nutrition threshold should trigger high-sugar alert.
  const cereal = evaluateProduct(byId('p7'));
  assert(cereal.risk_signals.some((s) => s.rule_triggered === 'high_sugar'));

  // 7. Summary should stay concise for quick comprehension.
  assert(cereal.summary.length <= 220, 'Expected concise summary for low-literacy readability');

  // 8. Core risk nutrients + energy should resolve explicit Low/Medium/High levels.
  const bandProbe = evaluateProduct({
    id: 'band-probe',
    barcode: '0000000000010',
    name: 'Band Probe Product',
    brand: 'Probe',
    category: 'General',
    region_availability: ['Global'],
    ingredients_raw: [],
    nutrition_per_100g: {
      energy_kcal: 260,
      total_fat_g: 4,
      saturated_fat_g: 6,
      total_sugars_g: 4,
      salt_g: 0.4,
      sodium_mg: 700,
      fiber_g: 0.5,
      protein_g: 10
    }
  });
  assert.equal(byNutrientKey(bandProbe, 'energy_kcal').band_level, 'high');
  assert.equal(byNutrientKey(bandProbe, 'total_fat_g').band_level, 'medium');
  assert.equal(byNutrientKey(bandProbe, 'saturated_fat_g').band_level, 'high');
  assert.equal(byNutrientKey(bandProbe, 'total_sugars_g').band_level, 'low');
  assert.equal(byNutrientKey(bandProbe, 'salt_g').band_level, 'medium');
  assert.equal(byNutrientKey(bandProbe, 'sodium_mg').band_level, 'high');

  // 9. Fiber is beneficial: low fiber should map to red/worse and high fiber to green/better.
  const lowFiber = byNutrientKey(bandProbe, 'fiber_g');
  assert.equal(lowFiber.band_level, 'low');
  assert.equal(lowFiber.band_color, 'red');
  assert.equal(lowFiber.band_meaning, 'worse');

  const oatsScan = evaluateProduct(byId('p4'));
  const highFiber = byNutrientKey(oatsScan, 'fiber_g');
  assert.equal(highFiber.band_level, 'high');
  assert.equal(highFiber.band_color, 'green');
  assert.equal(highFiber.band_meaning, 'better');

  // 10. Protein uses energy percentage and falls back to Unknown when energy is missing.
  const proteinKnown = byNutrientKey(bandProbe, 'protein_g');
  assert.equal(proteinKnown.band_level, 'medium');
  assert.match(proteinKnown.actual_display, /\% energy/);

  const proteinUnknown = evaluateProduct({
    id: 'protein-unknown',
    barcode: '0000000000011',
    name: 'Protein Unknown Energy',
    brand: 'Probe',
    category: 'General',
    region_availability: ['Global'],
    ingredients_raw: [],
    nutrition_per_100g: {
      protein_g: 12
    }
  });
  const unknownProteinAssessment = byNutrientKey(proteinUnknown, 'protein_g');
  assert.equal(unknownProteinAssessment.band_level, 'unknown');
  assert.equal(unknownProteinAssessment.band_color, 'gray');
  assert.match(unknownProteinAssessment.actual_display, /energy unavailable/i);

  // 11. Threshold text should stay human-readable and explicit.
  const sugarThreshold = byNutrientKey(bandProbe, 'total_sugars_g').threshold_text;
  assert.match(sugarThreshold, /Low <= 5 g/i);
  assert.match(sugarThreshold, /High > 22\.5 g/i);

  console.log('All risk engine tests passed.');
}

run();
