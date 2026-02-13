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
  assert.equal(typeof turmeric.avoid_verdict, 'string');
  assert.equal(Array.isArray(turmeric.avoid_matches), true);
  assert.equal(Array.isArray(turmeric.avoid_notes), true);
  assert.equal(turmeric.avoid_verdict, 'Avoid');

  // 2. Unknown manual check with no trigger should produce Unknown state.
  const manualUnknown = evaluateProduct(null, {
    ingredients: parseIngredientsInput('whole oats, water, sea salt')
  });
  assert.equal(manualUnknown.severity, 'Unknown');
  assert.equal(manualUnknown.risk_signals.length, 0);
  assert.equal(manualUnknown.avoid_verdict, 'None');

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
  assert.equal(sparseLiveProduct.avoid_verdict, 'Unknown');

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

  // 5b. Under-review avoid markers should produce Caution, not Avoid.
  const avoidReviewOnly = evaluateProduct(null, {
    ingredients: parseIngredientsInput('milk solids, sugar, tartrazine')
  });
  assert.equal(avoidReviewOnly.avoid_verdict, 'Caution');
  assert(avoidReviewOnly.avoid_matches.some((item) => item.verification_state === 'Under Review'));

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

  // 12. Global guardrail metadata should be present in every scan result.
  assert.equal(typeof cereal.rules_profile_id, 'string');
  assert.equal(typeof cereal.rules_version, 'string');
  assert.equal(Array.isArray(cereal.framework_verdicts), true);
  assert.equal(typeof cereal.global_guardrail_verdict, 'string');

  // 13. Strictest-wins: high in one framework should produce High global verdict.
  const strictestProduct = evaluateProduct({
    id: 'strictest-high',
    barcode: '0000000000099',
    name: 'Strictest High Product',
    brand: 'Guardrail',
    category: 'Snacks',
    region_availability: ['Global'],
    product_form: 'solid',
    ingredients_raw: [],
    nutrition_per_100g: {
      energy_kcal: 190,
      total_sugars_g: 8,
      added_sugars_g: 4,
      salt_g: 0.2,
      sodium_mg: 80,
      saturated_fat_g: 1.1,
      total_fat_g: 2
    }
  });
  const ukVerdict = strictestProduct.framework_verdicts.find((item) => item.framework_id === 'uk_traffic_light_v1');
  const icmrVerdict = strictestProduct.framework_verdicts.find((item) => item.framework_id === 'india_icmr_hfss_v1');
  assert(ukVerdict, 'Expected UK framework verdict');
  assert(icmrVerdict, 'Expected ICMR framework verdict');
  assert.equal(ukVerdict.severity, 'Moderate');
  assert.equal(icmrVerdict.severity, 'High');
  assert.equal(strictestProduct.global_guardrail_verdict, 'High');

  // 14. Missing added nutrient values stay Unknown in ICMR checks (no inference from totals).
  const missingAddedProduct = evaluateProduct({
    id: 'strictest-missing-added',
    barcode: '0000000000100',
    name: 'Missing Added Data',
    brand: 'Guardrail',
    category: 'Snacks',
    region_availability: ['Global'],
    product_form: 'solid',
    ingredients_raw: [],
    nutrition_per_100g: {
      total_sugars_g: 8,
      salt_g: 0.2,
      sodium_mg: 80,
      saturated_fat_g: 1.1,
      total_fat_g: 2
    }
  });
  const icmrUnknownVerdict = missingAddedProduct.framework_verdicts.find((item) => item.framework_id === 'india_icmr_hfss_v1');
  assert(icmrUnknownVerdict, 'Expected ICMR framework verdict when added fields are missing');
  assert.equal(icmrUnknownVerdict.severity, 'Unknown');
  assert(icmrUnknownVerdict.unknown_reasons.includes('missing_added_nutrient'));

  // 15. No framework data should produce Unknown global guardrail verdict.
  const allUnknown = evaluateProduct({
    id: 'all-unknown-frameworks',
    barcode: '0000000000101',
    name: 'Unknown Framework Product',
    brand: 'Guardrail',
    category: 'General',
    region_availability: ['Global'],
    ingredients_raw: [],
    nutrition_per_100g: {}
  });
  assert.equal(allUnknown.global_guardrail_verdict, 'Unknown');

  // 16. PHO/trans-fat marker should trigger a high-priority ingredient signal.
  const phoSignalScan = evaluateProduct(null, {
    ingredients: parseIngredientsInput('wheat flour, partially hydrogenated vegetable oil, sugar')
  });
  const phoSignal = phoSignalScan.risk_signals.find((signal) => signal.rule_triggered === 'trans_fat_pho');
  assert(phoSignal, 'Expected trans_fat_pho signal for PHO marker');
  assert.equal(phoSignal.severity, 'High');

  // 17. Regulator-confirmed action should appear as a confirmed match and can raise strictest verdict.
  const confirmedRegulatoryScan = evaluateProduct(
    {
      id: 'regulatory-confirmed-case',
      barcode: '8909999999991',
      name: 'Frozen shrimp consignments',
      brand: 'Ocean Basket',
      category: 'Seafood',
      region_availability: ['US'],
      product_form: 'solid',
      ingredients_raw: ['shrimp', 'water'],
      nutrition_per_100g: {}
    },
    {
      regulatory_actions: [
        {
          id: 'ra-fda-import-1',
          jurisdiction: 'US',
          authority: 'U.S. FDA',
          action_type: 'import_refusal',
          product_name: 'Frozen shrimp consignments',
          reason_category: 'Residue non-compliance',
          hazard: 'Antibiotic residue markers',
          action_date: '2026-02-10',
          status: 'confirmed',
          source_urls: ['https://www.accessdata.fda.gov/cms_ia/importalert_16.html'],
          confidence: 'Regulator Confirmed'
        }
      ]
    }
  );
  assert.equal(confirmedRegulatoryScan.regulatory_action_matches.length, 1);
  assert.equal(confirmedRegulatoryScan.regulatory_action_matches[0].status, 'confirmed');
  assert(confirmedRegulatoryScan.risk_signals.some((signal) => signal.rule_triggered.startsWith('regulatory_')));

  // 18. Unverified brand-level ban claim must stay under review and not be published as confirmed ban.
  const underReviewRegulatoryScan = evaluateProduct(
    {
      id: 'regulatory-under-review-case',
      barcode: '8909999999992',
      name: 'Mustard Oil',
      brand: 'Generic Mustard',
      category: 'Oils',
      region_availability: ['Global'],
      product_form: 'liquid',
      ingredients_raw: ['mustard oil'],
      nutrition_per_100g: {}
    },
    {
      regulatory_actions: [
        {
          id: 'lead-claim-ban',
          jurisdiction: 'Global',
          authority: 'Secondary report',
          action_type: 'ban',
          product_name: 'Mustard Oil',
          brand: 'Generic Mustard',
          reason_category: 'Unverified claim',
          hazard: 'Pending regulator verification',
          action_date: '2026-02-11',
          status: 'under_review',
          source_urls: [],
          confidence: 'Under Review'
        }
      ]
    }
  );
  assert.equal(underReviewRegulatoryScan.regulatory_action_matches.length, 1);
  assert.equal(underReviewRegulatoryScan.regulatory_action_matches[0].status, 'under_review');
  assert.equal(underReviewRegulatoryScan.regulatory_action_matches[0].action_type, 'update');
  assert.equal(
    underReviewRegulatoryScan.risk_signals.some((signal) => signal.rule_triggered.startsWith('regulatory_')),
    false
  );
  assert.equal(underReviewRegulatoryScan.overall_confidence, 'low');

  console.log('All risk engine tests passed.');
}

run();
