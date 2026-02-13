import { EVIDENCE_BY_RULE } from './data.mjs';

/** @typedef {'Low' | 'Moderate' | 'High' | 'Unknown'} Severity */

/**
 * @typedef {Object} RiskSignal
 * @property {string} signal_id
 * @property {Severity} severity
 * @property {string} ingredient_or_issue
 * @property {string} rule_triggered
 * @property {number} confidence
 * @property {string} explanation_short
 * @property {import('./data.mjs').EvidenceCard[]} evidence
 */

/**
 * @typedef {Object} NutritionAssessment
 * @property {string} nutrient_key
 * @property {string} nutrient
 * @property {number | null} value
 * @property {number | null} threshold_low
 * @property {number | null} threshold_high
 * @property {'risk' | 'beneficial'} band_type
 * @property {'low' | 'medium' | 'high' | 'unknown'} band_level
 * @property {'green' | 'amber' | 'red' | 'gray'} band_color
 * @property {'better' | 'worse' | 'unknown'} band_meaning
 * @property {string} threshold_text
 * @property {string} daily_target
 * @property {string} actual_display
 */

/**
 * @typedef {Object} ScanResult
 * @property {Severity} severity
 * @property {RiskSignal[]} risk_signals
 * @property {NutritionAssessment[]} nutrition_assessment
 * @property {number} risk_score
 * @property {string} summary
 */

const ingredientRules = [
  {
    id: 'lead_chromate',
    severity: 'High',
    confidence: 0.98,
    pattern: /lead\s*chromate/i,
    label: 'Lead chromate',
    explanation: 'Possible heavy metal adulteration with no safe exposure level.'
  },
  {
    id: 'metanil_yellow',
    severity: 'High',
    confidence: 0.95,
    pattern: /metanil\s*yellow/i,
    label: 'Metanil yellow',
    explanation: 'Banned textile dye linked to neurotoxicity and organ damage risk.'
  },
  {
    id: 'deo_eg_contamination',
    severity: 'High',
    confidence: 0.97,
    pattern: /(diethylene\s*glycol|ethylene\s*glycol)/i,
    label: 'DEG/EG contamination marker',
    explanation: 'Associated with severe poisoning events in contaminated syrups.'
  },
  {
    id: 'potassium_bromate',
    severity: 'High',
    confidence: 0.93,
    pattern: /potassium\s*bromate/i,
    label: 'Potassium bromate',
    explanation: 'Banned in multiple jurisdictions due to carcinogenic concern.'
  },
  {
    id: 'antibiotic_shrimp',
    severity: 'High',
    confidence: 0.9,
    pattern: /(chloramphenicol|nitrofuran|malachite\s*green)/i,
    label: 'Banned aquaculture antibiotic residue',
    explanation: 'Linked to import refusals and antimicrobial resistance risk.'
  },
  {
    id: 'synthetic_sweeteners',
    severity: 'Moderate',
    confidence: 0.62,
    pattern: /(aspartame|sucralose|acesulfame|saccharin)/i,
    label: 'Synthetic sweetener marker',
    explanation: 'Some long-term effects are still under review across agencies.'
  },
  {
    id: 'ultra_processed_markers',
    severity: 'Moderate',
    confidence: 0.74,
    pattern: /(high\s*fructose\s*corn\s*syrup|hfcs|maltodextrin|soy\s*protein\s*isolate|bht|bha)/i,
    label: 'Ultra-processed formulation marker',
    explanation: 'Multiple additives and isolates can indicate high-processing formulations.'
  }
];

const nutritionThresholdRegistry = [
  {
    key: 'energy_kcal',
    label: 'Energy (kcal)',
    unit: 'kcal',
    band_type: 'risk',
    low_max: 40,
    medium_max: 250,
    high_min: 250,
    daily_target: '~2000 kcal/day',
    source_basis: 'Energy density (per 100g) from report thresholds'
  },
  {
    key: 'total_fat_g',
    label: 'Total fat (g)',
    unit: 'g',
    band_type: 'risk',
    low_max: 3.0,
    medium_max: 17.5,
    high_min: 17.5,
    daily_target: '~70 g/day',
    source_basis: 'Traffic-light fat threshold model'
  },
  {
    key: 'saturated_fat_g',
    label: 'Saturated fat (g)',
    unit: 'g',
    band_type: 'risk',
    low_max: 1.5,
    medium_max: 5.0,
    high_min: 5.0,
    daily_target: '<20 g/day',
    source_basis: 'WHO-aligned saturated fat limits'
  },
  {
    key: 'total_sugars_g',
    label: 'Total sugars (g)',
    unit: 'g',
    band_type: 'risk',
    low_max: 5.0,
    medium_max: 22.5,
    high_min: 22.5,
    daily_target: 'Added sugar <25-50 g/day',
    source_basis: 'WHO and traffic-light sugar cutoffs'
  },
  {
    key: 'salt_g',
    label: 'Salt (g)',
    unit: 'g',
    band_type: 'risk',
    low_max: 0.3,
    medium_max: 1.5,
    high_min: 1.5,
    daily_target: '<5 g/day',
    source_basis: 'WHO sodium/salt guidance'
  },
  {
    key: 'sodium_mg',
    label: 'Sodium (mg)',
    unit: 'mg',
    band_type: 'risk',
    low_max: 120,
    medium_max: 600,
    high_min: 600,
    daily_target: '<2000 mg/day',
    source_basis: 'Global sodium benchmark bands'
  },
  {
    key: 'fiber_g',
    label: 'Fiber (g)',
    unit: 'g',
    band_type: 'beneficial',
    low_max: 1,
    medium_max: 3,
    high_min: 3,
    daily_target: '>=25-30 g/day',
    source_basis: 'Fiber density benchmark per 100g'
  },
  {
    key: 'protein_g',
    label: 'Protein (g)',
    unit: 'g',
    band_type: 'beneficial',
    low_max: 12,
    medium_max: 20,
    high_min: 20,
    daily_target: '10-35% daily energy',
    source_basis: 'Protein as % of energy density'
  }
];

const severityRank = {
  Unknown: 0,
  Low: 1,
  Moderate: 2,
  High: 3
};

export { severityRank };

/**
 * @param {string} barcode
 * @param {import('./data.mjs').ProductProfile[]} products
 */
export function lookupProductByBarcode(barcode, products) {
  const normalized = String(barcode || '').trim();
  return products.find((p) => p.barcode === normalized) || null;
}

/**
 * @param {string[]} ingredients
 * @returns {RiskSignal[]}
 */
export function evaluateIngredientRisks(ingredients) {
  const joined = ingredients.join(', ').toLowerCase();
  /** @type {RiskSignal[]} */
  const signals = [];

  for (const rule of ingredientRules) {
    if (!rule.pattern.test(joined)) continue;
    signals.push({
      signal_id: `signal-${rule.id}`,
      severity: rule.severity,
      ingredient_or_issue: rule.label,
      rule_triggered: rule.id,
      confidence: rule.confidence,
      explanation_short: rule.explanation,
      evidence: EVIDENCE_BY_RULE[rule.id] || []
    });
  }

  return signals;
}

/**
 * @param {number | undefined | null} value
 */
function asFiniteNumber(value) {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

/**
 * @param {number} value
 * @param {number} maxFractionDigits
 */
function formatNumber(value, maxFractionDigits = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits
  }).format(value);
}

/**
 * @param {number | null} value
 * @param {string} unit
 */
function formatActualValue(value, unit) {
  if (value === null) return 'Unknown';
  return `${formatNumber(value)} ${unit}`.trim();
}

/**
 * @param {{key: string, unit: string, low_max: number, medium_max: number, band_type: 'risk' | 'beneficial'}} meta
 * @param {number | null} value
 * @param {import('./data.mjs').ProductProfile['nutrition_per_100g'] | undefined} nutrition
 */
function evaluateBand(meta, value, nutrition) {
  /** @type {'low' | 'medium' | 'high' | 'unknown'} */
  let level = 'unknown';
  let thresholdText = '';
  let actualDisplay = formatActualValue(value, meta.unit);
  let thresholdLow = meta.low_max;
  let thresholdHigh = meta.medium_max;

  if (meta.key === 'fiber_g') {
    thresholdText = 'Low < 1 g | Medium >= 1 to < 3 g | High >= 3 g (>= 6 g very high)';
    if (value !== null) {
      if (value < 1) level = 'low';
      else if (value < 3) level = 'medium';
      else level = 'high';
    }
  } else if (meta.key === 'protein_g') {
    thresholdText = 'Low < 12% energy | Medium >= 12% to < 20% | High >= 20%';
    const energy = asFiniteNumber(nutrition?.energy_kcal);
    if (value !== null && energy && energy > 0) {
      const energyPercent = (value * 4 * 100) / energy;
      actualDisplay = `${formatNumber(value)} g (${formatNumber(energyPercent, 1)}% energy)`;
      if (energyPercent < 12) level = 'low';
      else if (energyPercent < 20) level = 'medium';
      else level = 'high';
    } else if (value !== null) {
      actualDisplay = `${formatNumber(value)} g (energy unavailable)`;
      level = 'unknown';
    }
    thresholdLow = 12;
    thresholdHigh = 20;
  } else {
    thresholdText = `Low <= ${formatNumber(meta.low_max)} ${meta.unit} | Medium > ${formatNumber(meta.low_max)} to <= ${formatNumber(meta.medium_max)} ${meta.unit} | High > ${formatNumber(meta.medium_max)} ${meta.unit}`;
    if (value !== null) {
      if (value <= meta.low_max) level = 'low';
      else if (value <= meta.medium_max) level = 'medium';
      else level = 'high';
    }
  }

  return {
    level,
    thresholdText,
    actualDisplay,
    thresholdLow,
    thresholdHigh
  };
}

/**
 * @param {'risk' | 'beneficial'} bandType
 * @param {'low' | 'medium' | 'high' | 'unknown'} bandLevel
 */
function resolveBandTone(bandType, bandLevel) {
  if (bandLevel === 'unknown') {
    return {
      band_color: 'gray',
      band_meaning: 'unknown'
    };
  }

  if (bandType === 'risk') {
    if (bandLevel === 'low') return { band_color: 'green', band_meaning: 'better' };
    if (bandLevel === 'medium') return { band_color: 'amber', band_meaning: 'worse' };
    return { band_color: 'red', band_meaning: 'worse' };
  }

  if (bandLevel === 'low') return { band_color: 'red', band_meaning: 'worse' };
  if (bandLevel === 'medium') return { band_color: 'amber', band_meaning: 'better' };
  return { band_color: 'green', band_meaning: 'better' };
}

/**
 * @param {import('./data.mjs').ProductProfile['nutrition_per_100g']} nutrition
 * @returns {NutritionAssessment[]}
 */
export function assessNutrition(nutrition) {
  /** @type {NutritionAssessment[]} */
  return nutritionThresholdRegistry.map((meta) => {
    const value = asFiniteNumber(nutrition?.[meta.key]);
    const {
      level,
      thresholdText,
      actualDisplay,
      thresholdLow,
      thresholdHigh
    } = evaluateBand(meta, value, nutrition);
    const { band_color, band_meaning } = resolveBandTone(meta.band_type, level);

    return {
      nutrient_key: meta.key,
      nutrient: meta.label,
      value,
      threshold_low: thresholdLow,
      threshold_high: thresholdHigh,
      band_type: meta.band_type,
      band_level: level,
      band_color,
      band_meaning,
      threshold_text: thresholdText,
      daily_target: meta.daily_target,
      actual_display: actualDisplay
    };
  });
}

/**
 * @param {NutritionAssessment[]} assessments
 * @returns {RiskSignal[]}
 */
export function evaluateNutritionRisks(assessments) {
  /** @type {RiskSignal[]} */
  const signals = [];

  const sugar = assessments.find((x) => x.nutrient_key === 'total_sugars_g');
  const salt = assessments.find((x) => x.nutrient_key === 'salt_g');
  const satFat = assessments.find((x) => x.nutrient_key === 'saturated_fat_g');

  if (sugar?.band_level === 'high' || sugar?.band_level === 'medium') {
    signals.push({
      signal_id: 'signal-high-sugar',
      severity: sugar.band_level === 'high' ? 'High' : 'Moderate',
      ingredient_or_issue: 'Sugar density',
      rule_triggered: 'high_sugar',
      confidence: 0.86,
      explanation_short:
        sugar.band_level === 'high'
          ? 'Sugar is in the high-risk zone per traffic-light thresholds.'
          : 'Sugar is in the caution zone; compare lower-sugar alternatives.',
      evidence: EVIDENCE_BY_RULE.high_sugar
    });
  }

  if (salt?.band_level === 'high' || salt?.band_level === 'medium') {
    signals.push({
      signal_id: 'signal-high-salt',
      severity: salt.band_level === 'high' ? 'High' : 'Moderate',
      ingredient_or_issue: 'Salt density',
      rule_triggered: 'high_salt',
      confidence: 0.9,
      explanation_short:
        salt.band_level === 'high'
          ? 'Salt is in the high-risk zone and can quickly raise sodium load.'
          : 'Salt is moderate; frequent use can still push daily sodium limits.',
      evidence: EVIDENCE_BY_RULE.high_salt
    });
  }

  if (satFat?.band_level === 'high' || satFat?.band_level === 'medium') {
    signals.push({
      signal_id: 'signal-high-satfat',
      severity: satFat.band_level === 'high' ? 'High' : 'Moderate',
      ingredient_or_issue: 'Saturated fat density',
      rule_triggered: 'high_saturated_fat',
      confidence: 0.82,
      explanation_short:
        satFat.band_level === 'high'
          ? 'Saturated fat is high for a per-100g serving baseline.'
          : 'Saturated fat is moderate; frequent intake can add up quickly.',
      evidence: EVIDENCE_BY_RULE.high_saturated_fat
    });
  }

  return signals;
}

/**
 * @param {import('./data.mjs').ProductProfile | null} product
 * @param {{ ingredients?: string[] }} [options]
 * @returns {ScanResult}
 */
export function evaluateProduct(product, options = {}) {
  const ingredients = options.ingredients || product?.ingredients_raw || [];
  const nutrition = product?.nutrition_per_100g;

  const ingredientSignals = evaluateIngredientRisks(ingredients);
  const nutritionAssessments = assessNutrition(nutrition);
  const nutritionSignals = evaluateNutritionRisks(nutritionAssessments);
  const allSignals = [...ingredientSignals, ...nutritionSignals];

  const summary = buildSummary(allSignals, product);
  const severity = decideOverallSeverity(allSignals, nutritionAssessments, Boolean(product), ingredients);
  const riskScore = calculateRiskScore(severity, allSignals, nutritionAssessments);

  return {
    severity,
    risk_signals: allSignals,
    nutrition_assessment: nutritionAssessments,
    risk_score: riskScore,
    summary
  };
}

/**
 * @param {Severity} severity
 * @param {RiskSignal[]} signals
 * @param {NutritionAssessment[]} nutritionAssessments
 */
function calculateRiskScore(severity, signals, nutritionAssessments) {
  const riskNutrition = nutritionAssessments.filter((n) => n.band_type === 'risk' && n.band_level !== 'unknown');
  const redCount = riskNutrition.filter((n) => n.band_color === 'red').length;
  const amberCount = riskNutrition.filter((n) => n.band_color === 'amber').length;
  return severityRank[severity] * 30 + signals.length * 12 + redCount * 8 + amberCount * 2;
}

/**
 * @param {RiskSignal[]} signals
 * @param {NutritionAssessment[]} nutritionAssessments
 * @param {boolean} hasCatalogProduct
 * @param {string[]} ingredients
 * @returns {Severity}
 */
function decideOverallSeverity(signals, nutritionAssessments, hasCatalogProduct, ingredients) {
  if (!hasCatalogProduct && signals.length === 0) {
    return ingredients.length ? 'Unknown' : 'Unknown';
  }

  const knownNutritionCount = nutritionAssessments.filter((n) => n.band_level !== 'unknown').length;
  const knownRiskNutrition = nutritionAssessments.filter((n) => n.band_type === 'risk' && n.band_level !== 'unknown');
  if (hasCatalogProduct && signals.length === 0 && knownNutritionCount === 0 && ingredients.length === 0) {
    return 'Unknown';
  }

  if (signals.some((s) => s.severity === 'High')) return 'High';

  const redNutritionCount = knownRiskNutrition.filter((n) => n.band_color === 'red').length;
  if (redNutritionCount >= 2) return 'High';

  if (signals.some((s) => s.severity === 'Moderate')) return 'Moderate';

  if (redNutritionCount === 1) return 'Moderate';

  if (!hasCatalogProduct && signals.length === 0) return 'Unknown';

  return 'Low';
}

/**
 * @param {RiskSignal[]} signals
 * @param {import('./data.mjs').ProductProfile | null} product
 */
function buildSummary(signals, product) {
  if (!product && signals.length === 0) {
    return 'We could not verify this item yet. Enter ingredients manually or scan another barcode.';
  }

  const productHasContext =
    Boolean(product?.ingredients_raw?.length) || Boolean(product && hasUsableNutritionData(product.nutrition_per_100g));
  if (product && !productHasContext && signals.length === 0) {
    return 'Limited product data available from this lookup. Add ingredients manually for a stronger risk assessment.';
  }

  if (signals.length === 0) {
    return 'No major risk markers were detected from current rules. Keep comparing per-100g labels.';
  }

  const top = [...signals].sort((a, b) => severityRank[b.severity] - severityRank[a.severity])[0];
  return `${top.ingredient_or_issue}: ${top.explanation_short}`;
}

/**
 * @param {import('./data.mjs').ProductProfile['nutrition_per_100g'] | undefined} nutrition
 */
function hasUsableNutritionData(nutrition) {
  if (!nutrition) return false;
  return ['total_fat_g', 'saturated_fat_g', 'total_sugars_g', 'salt_g', 'sodium_mg', 'fiber_g', 'protein_g'].some((key) =>
    Number.isFinite(Number(nutrition[key]))
  );
}

/**
 * @param {import('./data.mjs').ProductProfile[]} products
 * @param {import('./data.mjs').ProductProfile} selected
 * @param {ScanResult} selectedScan
 * @returns {Array<{candidate_product_id: string, reason_codes: string[], net_improvement_score: number}>}
 */
export function recommendSwaps(products, selected, selectedScan) {
  const inCategory = products.filter((p) => p.category === selected.category && p.id !== selected.id);
  const recommendations = inCategory
    .map((candidate) => {
      const candidateScan = evaluateProduct(candidate);
      const improvement = selectedScan.risk_score - candidateScan.risk_score;
      const reasonCodes = [];

      if (candidateScan.severity !== selectedScan.severity) {
        reasonCodes.push(`Overall risk ${selectedScan.severity.toLowerCase()} -> ${candidateScan.severity.toLowerCase()}`);
      }

      const selectedRed = selectedScan.nutrition_assessment.filter((n) => n.band_type === 'risk' && n.band_color === 'red').length;
      const candidateRed = candidateScan.nutrition_assessment.filter((n) => n.band_type === 'risk' && n.band_color === 'red').length;
      if (candidateRed < selectedRed) {
        reasonCodes.push(`Fewer red nutrition flags (${candidateRed} vs ${selectedRed})`);
      }

      if (candidateScan.risk_signals.length < selectedScan.risk_signals.length) {
        reasonCodes.push('Fewer risk signals triggered');
      }

      return {
        candidate_product_id: candidate.id,
        reason_codes: reasonCodes.length ? reasonCodes : ['Cleaner profile in current rules'],
        net_improvement_score: Number(improvement.toFixed(1))
      };
    })
    .filter((x) => x.net_improvement_score > 0)
    .sort((a, b) => b.net_improvement_score - a.net_improvement_score)
    .slice(0, 3);

  return recommendations;
}

/**
 * @param {import('./data.mjs').ProductProfile} left
 * @param {import('./data.mjs').ProductProfile} right
 */
export function compareProducts(left, right) {
  const leftScan = evaluateProduct(left);
  const rightScan = evaluateProduct(right);

  const nutrientDiff = leftScan.nutrition_assessment.map((entry) => {
    const rightEntry = rightScan.nutrition_assessment.find((n) => n.nutrient === entry.nutrient);
    const leftValue = entry.value ?? 0;
    const rightValue = rightEntry?.value ?? 0;
    return {
      nutrient: entry.nutrient,
      left_value: leftValue,
      right_value: rightValue,
      delta: Number((leftValue - rightValue).toFixed(2))
    };
  });

  const recommendedProductId = leftScan.risk_score <= rightScan.risk_score ? left.id : right.id;

  return {
    left: leftScan,
    right: rightScan,
    nutrientDiff,
    recommendedProductId
  };
}

/**
 * Enforces trust policy: every High/Moderate signal needs at least one evidence card.
 * @param {ScanResult} result
 */
export function validateEvidenceCompleteness(result) {
  return result.risk_signals
    .filter((s) => s.severity === 'High' || s.severity === 'Moderate')
    .every((s) => Array.isArray(s.evidence) && s.evidence.length > 0);
}

/**
 * @param {string} input
 */
export function parseIngredientsInput(input) {
  return String(input || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
