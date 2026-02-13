import assert from 'node:assert/strict';

import { evaluateProduct } from '../riskEngine.mjs';
import { renderNutritionChipsHTML, renderNutritionLegendHTML, renderNutritionTableHTML } from '../nutritionTable.mjs';

function run() {
  const fullScan = evaluateProduct({
    id: 'table-full',
    barcode: '1000000000001',
    name: 'Table Full Product',
    brand: 'HealthLens',
    category: 'Snacks',
    region_availability: ['Global'],
    ingredients_raw: [],
    nutrition_per_100g: {
      energy_kcal: 310,
      total_fat_g: 12,
      saturated_fat_g: 4,
      total_sugars_g: 9,
      salt_g: 0.4,
      sodium_mg: 160,
      fiber_g: 0.5,
      protein_g: 8
    }
  });

  // 1) Scan nutrition section should include both chip list and table.
  const chipsHtml = renderNutritionChipsHTML(fullScan.nutrition_assessment);
  const tableHtml = renderNutritionTableHTML(fullScan.nutrition_assessment);
  const legendHtml = renderNutritionLegendHTML();
  assert.match(chipsHtml, /class="nutrition-list"/);
  assert.match(tableHtml, /class="nutrition-table"/);
  assert.match(tableHtml, /Nutrient/);
  assert.match(tableHtml, /Daily target/);
  assert.match(legendHtml, /Low \(Good\)/);
  assert.match(legendHtml, /High \(Risk\)/);

  // 2) Partial nutrition data still renders all tracked nutrient rows with Unknown values.
  const partialScan = evaluateProduct({
    id: 'table-partial',
    barcode: '1000000000002',
    name: 'Table Partial Product',
    brand: 'HealthLens',
    category: 'Snacks',
    region_availability: ['Global'],
    ingredients_raw: [],
    nutrition_per_100g: {
      total_sugars_g: 10
    }
  });

  const partialTableHtml = renderNutritionTableHTML(partialScan.nutrition_assessment);
  const rowCount = (partialTableHtml.match(/<tr>/g) || []).length;
  assert.equal(rowCount, 12); // header row + 11 nutrient rows
  assert.match(partialTableHtml, />Unknown</);

  // 3) Beneficial nutrients should invert color semantics (fiber low=red, high=green).
  const lowFiber = fullScan.nutrition_assessment.find((item) => item.nutrient_key === 'fiber_g');
  assert(lowFiber);
  assert.equal(lowFiber.band_color, 'red');

  const highFiberScan = evaluateProduct({
    id: 'table-fiber-high',
    barcode: '1000000000003',
    name: 'Table Fiber High',
    brand: 'HealthLens',
    category: 'Snacks',
    region_availability: ['Global'],
    ingredients_raw: [],
    nutrition_per_100g: {
      fiber_g: 7,
      energy_kcal: 180,
      protein_g: 9
    }
  });

  const highFiber = highFiberScan.nutrition_assessment.find((item) => item.nutrient_key === 'fiber_g');
  assert(highFiber);
  assert.equal(highFiber.band_color, 'green');

  // 4) Labels should include directional meaning to avoid ambiguity.
  assert.match(chipsHtml, /High \(Risk\)/);
  const highFiberChipsHtml = renderNutritionChipsHTML(highFiberScan.nutrition_assessment);
  assert.match(highFiberChipsHtml, /High \(Good\)/);

  console.log('Nutrition table integration tests passed.');
}

run();
