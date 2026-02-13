import assert from 'node:assert/strict';

import { evaluateProduct } from '../riskEngine.mjs';

function run() {
  const product = evaluateProduct({
    id: 'guardrail-case',
    barcode: '1111111111111',
    name: 'Guardrail Example',
    brand: 'HealthLens',
    category: 'Snacks',
    region_availability: ['Global'],
    product_form: 'solid',
    ingredients_raw: ['wheat flour', 'sugar'],
    nutrition_per_100g: {
      energy_kcal: 210,
      total_fat_g: 2,
      saturated_fat_g: 0.8,
      total_sugars_g: 7,
      salt_g: 0.2,
      sodium_mg: 80,
      added_sugars_g: 4
    }
  });

  assert.equal(product.rules_profile_id, 'global_guardrail_v1');
  assert.equal(product.global_guardrail_verdict, 'High');
  assert.equal(Array.isArray(product.framework_verdicts), true);

  const expectedFrameworks = new Set([
    'uk_traffic_light_v1',
    'india_icmr_hfss_v1',
    'canada_fop_reference_v1',
    'who_population_guidance_v1',
    'hsr_reference_v1',
    'regulatory_actions_v1',
    'ingredient_safety_v1'
  ]);

  for (const frameworkId of expectedFrameworks) {
    assert(product.framework_verdicts.some((item) => item.framework_id === frameworkId), `Missing framework verdict: ${frameworkId}`);
  }

  const icmr = product.framework_verdicts.find((item) => item.framework_id === 'india_icmr_hfss_v1');
  assert(icmr);
  assert.equal(icmr.severity, 'High');

  const canada = product.framework_verdicts.find((item) => item.framework_id === 'canada_fop_reference_v1');
  assert(canada);
  assert.equal(canada.severity, 'Unknown');

  console.log('Global guardrail tests passed.');
}

run();
