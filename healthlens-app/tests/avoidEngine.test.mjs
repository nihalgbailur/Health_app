import assert from 'node:assert/strict';

import { evaluateAvoidMarkers } from '../riskEngine.mjs';

function run() {
  // 1) Regulator-confirmed high-confidence marker should map to Avoid.
  const confirmed = evaluateAvoidMarkers(
    {
      id: 'p-avoid-1',
      barcode: '9990000000001',
      name: 'Snack',
      brand: 'Demo',
      category: 'Snacks',
      region_availability: ['Global'],
      ingredients_raw: ['wheat flour', 'partially hydrogenated vegetable oil'],
      nutrition_per_100g: {}
    },
    ['wheat flour', 'partially hydrogenated vegetable oil'],
    '',
    [],
    undefined
  );
  assert.equal(confirmed.avoid_verdict, 'Avoid');
  assert(confirmed.avoid_matches.some((item) => item.marker_id === 'avoid-trans-fat-pho'));

  // 2) Under-review marker only should map to Caution.
  const reviewOnly = evaluateAvoidMarkers(
    null,
    ['milk solids', 'sugar', 'tartrazine'],
    '',
    [],
    undefined
  );
  assert.equal(reviewOnly.avoid_verdict, 'Caution');
  assert(reviewOnly.avoid_matches.every((item) => item.verification_state !== 'Regulator Confirmed'));

  // 3) Non-matching ingredient text should map to None.
  const none = evaluateAvoidMarkers(
    null,
    ['whole oats', 'water', 'sea salt'],
    '',
    [],
    undefined
  );
  assert.equal(none.avoid_verdict, 'None');
  assert.equal(none.avoid_matches.length, 0);

  // 4) Missing pack and regulatory context should map to Unknown.
  const unknown = evaluateAvoidMarkers(null, [], '', [], undefined);
  assert.equal(unknown.avoid_verdict, 'Unknown');

  // 5) Regulatory text can trigger marker matches.
  const regulatoryMatch = evaluateAvoidMarkers(
    {
      id: 'p-avoid-2',
      barcode: '9990000000002',
      name: 'Spice Mix',
      brand: 'Demo',
      category: 'Spices',
      region_availability: ['Global'],
      ingredients_raw: [],
      nutrition_per_100g: {}
    },
    [],
    '',
    [
      {
        id: 'ra-1',
        jurisdiction: 'US',
        authority: 'U.S. FDA',
        action_type: 'import_refusal',
        product_name: 'Spice batch',
        reason_category: 'Contamination',
        hazard: 'ethylene oxide concern',
        action_date: '2026-02-13',
        status: 'under_review',
        source_urls: ['https://www.accessdata.fda.gov'],
        confidence: 'Under Review'
      }
    ],
    undefined
  );
  assert.equal(regulatoryMatch.avoid_verdict, 'Caution');
  assert(regulatoryMatch.avoid_matches.some((item) => item.match_source === 'regulatory_action'));

  console.log('Avoid engine tests passed.');
}

run();
