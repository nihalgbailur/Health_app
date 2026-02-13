import { EVIDENCE_BY_RULE } from './data.mjs';
import {
  getDefaultProfile,
  getDefaultProfileId,
  getGlobalFrameworkProfiles,
  getRulesVersion,
  isGlobalGuardrailEnabled
} from './rulesLoader.mjs';

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

/** @typedef {import('./data.mjs').RegulatoryActionItem} RegulatoryActionItem */

/**
 * @typedef {Object} FrameworkVerdict
 * @property {string} framework_id
 * @property {string} framework_name
 * @property {Severity} severity
 * @property {string[]} triggered_rules
 * @property {string[]} unknown_reasons
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
 * @property {'per_100g' | 'per_100ml' | 'percent_energy' | 'dv_based'} basis
 * @property {'solid' | 'liquid' | 'both'} applies_to
 * @property {string} framework_id
 * @property {'low' | 'medium' | 'high' | 'unknown'} framework_band_level
 * @property {'low' | 'medium' | 'high' | 'unknown'} global_band_level
 * @property {'missing_value' | 'missing_energy_for_percent' | 'missing_added_nutrient' | 'not_applicable' | 'guidance_only_reference'} [unknown_reason]
 * @property {boolean} is_estimated
 * @property {string} [rule_id]
 * @property {boolean} [rule_is_provisional]
 */

/**
 * @typedef {Object} ScanResult
 * @property {Severity} severity
 * @property {RiskSignal[]} risk_signals
 * @property {NutritionAssessment[]} nutrition_assessment
 * @property {number} risk_score
 * @property {string} summary
 * @property {string} rules_profile_id
 * @property {string} rules_version
 * @property {FrameworkVerdict[]} framework_verdicts
 * @property {Severity} global_guardrail_verdict
 * @property {RegulatoryActionItem[]} regulatory_action_matches
 * @property {'high' | 'medium' | 'low'} overall_confidence
 * @property {string[]} confidence_notes
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
    id: 'trans_fat_pho',
    severity: 'High',
    confidence: 0.92,
    pattern: /(partially\s+hydrogenated|hydrogenated\s+vegetable\s+oil|pho\b|trans\s*fat)/i,
    label: 'Industrial trans fat / PHO marker',
    explanation: 'Industrial trans fat markers are treated as high priority in global guidance.'
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

const severityRank = {
  Unknown: 0,
  Low: 1,
  Moderate: 2,
  High: 3
};

export { severityRank };

const UK_PORTION_OVERRIDE = {
  solid: {
    min_portion: 100,
    thresholds: {
      total_fat_g: 21,
      saturated_fat_g: 6,
      total_sugars_g: 27,
      salt_g: 1.8
    }
  },
  liquid: {
    min_portion: 150,
    thresholds: {
      total_fat_g: 13.13,
      saturated_fat_g: 3.75,
      total_sugars_g: 16.88,
      salt_g: 1.13
    }
  }
};

const REGULATORY_CONFIDENCE = {
  CONFIRMED: 'Regulator Confirmed',
  INDEPENDENT: 'Independent Evidence',
  REVIEW: 'Under Review'
};

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * @param {string | undefined} confidence
 * @returns {'Regulator Confirmed' | 'Independent Evidence' | 'Under Review'}
 */
function normalizeActionConfidence(confidence) {
  const normalized = String(confidence || '').toLowerCase();
  if (normalized.includes('regulator') || normalized.includes('confirmed')) return REGULATORY_CONFIDENCE.CONFIRMED;
  if (normalized.includes('independent')) return REGULATORY_CONFIDENCE.INDEPENDENT;
  return REGULATORY_CONFIDENCE.REVIEW;
}

/**
 * @param {string | undefined} status
 * @returns {'confirmed' | 'under_review'}
 */
function normalizeActionStatus(status) {
  return String(status || '').toLowerCase() === 'confirmed' ? 'confirmed' : 'under_review';
}

/**
 * @param {string | undefined} actionType
 * @returns {'ban' | 'recall' | 'import_refusal' | 'alert' | 'update'}
 */
function normalizeActionType(actionType) {
  const normalized = String(actionType || '').toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'ban') return 'ban';
  if (normalized === 'recall') return 'recall';
  if (normalized === 'import_refusal' || normalized === 'refusal') return 'import_refusal';
  if (normalized === 'alert') return 'alert';
  return 'update';
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {RegulatoryActionItem} action
 */
function buildRegulatoryEvidenceCard(action) {
  const sourceUrl = Array.isArray(action.source_urls) && action.source_urls.length ? action.source_urls[0] : '';
  return {
    id: `e-reg-${slugify(action.id || action.product_name || action.authority) || 'unknown'}`,
    source_type: 'Regulator Confirmed',
    title: `${action.authority} ${String(action.action_type || 'update').replaceAll('_', ' ')} notice`,
    source_url: sourceUrl || 'https://www.who.int',
    publication_date: action.action_date || new Date().toISOString().slice(0, 10),
    jurisdiction: ['India', 'EU', 'US', 'Global'].includes(action.jurisdiction) ? /** @type {'India' | 'EU' | 'US' | 'Global'} */ (action.jurisdiction) : 'Global',
    strength_level: 'High',
    verification_state: REGULATORY_CONFIDENCE.CONFIRMED,
    last_verified_at: action.action_date || new Date().toISOString().slice(0, 10),
    source_authority: action.authority || 'Regulator'
  };
}

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
 * @param {RegulatoryActionItem} action
 * @returns {RegulatoryActionItem}
 */
function normalizeRegulatoryActionRecord(action) {
  const base = {
    id: String(action?.id || `action-${slugify(action?.product_name || action?.authority || '')}`),
    jurisdiction: String(action?.jurisdiction || 'Global'),
    authority: String(action?.authority || 'Unknown authority'),
    action_type: normalizeActionType(action?.action_type),
    product_name: String(action?.product_name || '').trim(),
    brand: action?.brand ? String(action.brand).trim() : undefined,
    manufacturer: action?.manufacturer ? String(action.manufacturer).trim() : undefined,
    reason_category: String(action?.reason_category || 'General safety'),
    hazard: String(action?.hazard || 'Not specified'),
    action_date: String(action?.action_date || ''),
    status: normalizeActionStatus(action?.status),
    source_urls: Array.isArray(action?.source_urls) ? action.source_urls.map((url) => String(url || '').trim()).filter(Boolean) : [],
    confidence: normalizeActionConfidence(action?.confidence)
  };

  if (base.status === 'confirmed' && base.source_urls.length === 0) {
    return {
      ...base,
      status: 'under_review',
      confidence: REGULATORY_CONFIDENCE.REVIEW
    };
  }

  if (base.status !== 'confirmed' && base.action_type === 'ban') {
    return {
      ...base,
      action_type: 'update',
      confidence: REGULATORY_CONFIDENCE.REVIEW
    };
  }

  return base;
}

/**
 * @param {RegulatoryActionItem} action
 * @param {import('./data.mjs').ProductProfile | null} product
 */
function doesRegulatoryActionMatchProduct(action, product) {
  if (!product) return false;
  if (!action) return false;

  const barcode = String(product.barcode || '').trim();
  const actionBarcode = String(action?.barcode || '').trim();
  if (barcode && actionBarcode && barcode === actionBarcode) return true;

  const productName = normalizeText(product.name);
  const actionProduct = normalizeText(action.product_name);
  const productBrand = normalizeText(product.brand);
  const actionBrand = normalizeText(action.brand);

  if (productBrand && actionBrand) {
    if (productBrand === actionBrand) return true;
    if (productBrand.includes(actionBrand) || actionBrand.includes(productBrand)) return true;
  }

  if (productName && actionProduct) {
    if (productName === actionProduct) return true;
    if (productName.includes(actionProduct) || actionProduct.includes(productName)) return true;
  }

  return false;
}

/**
 * @param {import('./data.mjs').ProductProfile | null} product
 * @param {RegulatoryActionItem[] | undefined} actions
 * @returns {RegulatoryActionItem[]}
 */
function matchRegulatoryActions(product, actions) {
  if (!product) return [];
  const normalizedActions = Array.isArray(actions) ? actions.map(normalizeRegulatoryActionRecord) : [];
  const matched = normalizedActions.filter((action) => doesRegulatoryActionMatchProduct(action, product));
  return matched.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'confirmed' ? -1 : 1;
    return String(b.action_date || '').localeCompare(String(a.action_date || ''));
  });
}

/**
 * @param {RegulatoryActionItem[]} matches
 * @returns {RiskSignal[]}
 */
function evaluateRegulatoryActionSignals(matches) {
  /** @type {RiskSignal[]} */
  const signals = [];
  for (const action of matches) {
    if (action.status !== 'confirmed') continue;
    const severity = action.action_type === 'alert' || action.action_type === 'update' ? 'Moderate' : 'High';
    const confidence = action.confidence === REGULATORY_CONFIDENCE.CONFIRMED ? 0.94 : 0.72;
    const issue = `${action.authority} ${String(action.action_type).replaceAll('_', ' ')}`;

    signals.push({
      signal_id: `signal-regulatory-${slugify(action.id || action.product_name || action.authority)}`,
      severity,
      ingredient_or_issue: issue,
      rule_triggered: `regulatory_${slugify(action.id || action.product_name)}`,
      confidence,
      explanation_short: `${action.reason_category}: ${action.hazard}.`,
      evidence: [buildRegulatoryEvidenceCard(action)]
    });
  }
  return signals;
}

/**
 * @param {RegulatoryActionItem[]} matches
 * @returns {FrameworkVerdict}
 */
function computeRegulatoryFrameworkVerdict(matches) {
  const confirmed = matches.filter((action) => action.status === 'confirmed');
  const triggeredRules = confirmed.map((action) => `regulatory_${slugify(action.id || action.product_name || action.authority)}`);
  const unknownReasons = [];
  if (matches.some((action) => action.status !== 'confirmed')) {
    unknownReasons.push('under_review_regulatory_claim');
  }

  let severity = 'Unknown';
  if (confirmed.some((action) => action.action_type === 'ban' || action.action_type === 'recall' || action.action_type === 'import_refusal')) {
    severity = 'High';
  } else if (confirmed.length) {
    severity = 'Moderate';
  }

  return {
    framework_id: 'regulatory_actions_v1',
    framework_name: 'Regulatory action engine',
    severity,
    triggered_rules: [...new Set(triggeredRules)],
    unknown_reasons: unknownReasons
  };
}

/**
 * @param {import('./data.mjs').ProductProfile | null} product
 * @param {import('./data.mjs').ProductProfile['nutrition_per_100g'] | undefined} nutrition
 * @param {'solid' | 'liquid' | 'unknown'} productForm
 * @returns {RiskSignal[]}
 */
function evaluateUkPortionOverrideRisks(product, nutrition, productForm) {
  if (!product || !nutrition) return [];
  if (productForm !== 'solid' && productForm !== 'liquid') return [];

  const config = UK_PORTION_OVERRIDE[productForm];
  if (!config) return [];

  const portionSize = productForm === 'liquid' ? asFiniteNumber(product?.serving_size_ml) : asFiniteNumber(product?.serving_size_g);
  if (portionSize === null || portionSize <= config.min_portion) return [];

  /** @type {RiskSignal[]} */
  const signals = [];
  const nutrientLabels = {
    total_fat_g: 'Total fat',
    saturated_fat_g: 'Saturated fat',
    total_sugars_g: 'Total sugars',
    salt_g: 'Salt'
  };

  for (const [nutrientKey, threshold] of Object.entries(config.thresholds)) {
    const per100 = asFiniteNumber(nutrition?.[nutrientKey]);
    if (per100 === null) continue;
    const perPortion = (per100 * portionSize) / 100;
    if (perPortion <= threshold) continue;

    signals.push({
      signal_id: `signal-uk-portion-${nutrientKey}`,
      severity: 'High',
      ingredient_or_issue: `UK portion override: ${nutrientLabels[nutrientKey] || nutrientKey}`,
      rule_triggered: 'uk_portion_override',
      confidence: productForm === 'solid' ? 0.84 : 0.78,
      explanation_short: `${nutrientLabels[nutrientKey] || nutrientKey} exceeds UK red-per-portion guidance for a ${formatNumber(portionSize)} ${productForm === 'liquid' ? 'ml' : 'g'} serving.`,
      evidence: EVIDENCE_BY_RULE.uk_portion_override || []
    });
  }

  return signals;
}

/**
 * @param {Severity[]} severities
 */
function strictestSeverity(severities) {
  if (!severities.length) return 'Unknown';
  return severities.reduce((best, current) => {
    return severityRank[current] > severityRank[best] ? current : best;
  }, 'Unknown');
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
 * @param {import('./data.mjs').ProductProfile | null} product
 */
function resolveProductForm(product) {
  const explicit = String(product?.product_form || '').trim().toLowerCase();
  if (explicit === 'solid' || explicit === 'liquid') return explicit;

  const hint = `${product?.category || ''} ${product?.name || ''}`.toLowerCase();
  if (!hint.trim()) return 'unknown';

  if (/(drink|beverage|juice|soda|cola|water|tea|coffee|shake|smoothie|syrup|milk|lassi)/i.test(hint)) {
    return 'liquid';
  }

  return 'solid';
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
 * @param {any} rule
 * @param {'solid' | 'liquid' | 'unknown'} productForm
 */
function isRuleApplicable(rule, productForm) {
  const appliesTo = String(rule?.applies_to || 'both');
  if (appliesTo === 'both') return true;
  if (productForm === 'unknown') return false;
  return appliesTo === productForm;
}

/**
 * @param {any} rule
 * @param {import('./data.mjs').ProductProfile['nutrition_per_100g'] | undefined} nutrition
 */
function evaluateRuleValue(rule, nutrition) {
  if (rule?.calculation === 'percent_energy_from_protein') {
    const protein = asFiniteNumber(nutrition?.protein_g);
    if (protein === null) {
      return {
        valueForBand: null,
        value: null,
        actualDisplay: 'Unknown',
        unknownReason: 'missing_value'
      };
    }

    const energy = asFiniteNumber(nutrition?.energy_kcal);
    if (energy === null || energy <= 0) {
      return {
        valueForBand: null,
        value: protein,
        actualDisplay: `${formatNumber(protein)} g (energy unavailable)`,
        unknownReason: 'missing_energy_for_percent'
      };
    }

    const percentEnergy = (protein * 4 * 100) / energy;
    return {
      valueForBand: percentEnergy,
      value: protein,
      actualDisplay: `${formatNumber(protein)} g (${formatNumber(percentEnergy, 1)}% energy)`,
      unknownReason: undefined
    };
  }

  const value = asFiniteNumber(nutrition?.[rule?.nutrient_key]);
  if (value === null) {
    const defaultUnknown = String(rule?.nutrient_key || '').startsWith('added_')
      ? 'missing_added_nutrient'
      : 'missing_value';

    return {
      valueForBand: null,
      value: null,
      actualDisplay: 'Unknown',
      unknownReason: rule?.unknown_reason || defaultUnknown
    };
  }

  return {
    valueForBand: value,
    value,
    actualDisplay: formatActualValue(value, String(rule?.unit || '')),
    unknownReason: undefined
  };
}

/**
 * @param {any} rule
 * @param {number | null} valueForBand
 */
function evaluateBandLevel(rule, valueForBand) {
  if (valueForBand === null) return 'unknown';

  const lowMax = Number(rule?.low_max);
  const mediumMax = Number(rule?.medium_max);

  if (rule?.nutrient_key === 'fiber_g') {
    if (valueForBand < lowMax) return 'low';
    if (valueForBand < mediumMax) return 'medium';
    return 'high';
  }

  if (rule?.calculation === 'percent_energy_from_protein') {
    if (valueForBand < lowMax) return 'low';
    if (valueForBand < mediumMax) return 'medium';
    return 'high';
  }

  if (valueForBand <= lowMax) return 'low';
  if (valueForBand <= mediumMax) return 'medium';
  return 'high';
}

/**
 * @param {any} rule
 * @param {import('./data.mjs').ProductProfile['nutrition_per_100g'] | undefined} nutrition
 * @param {'solid' | 'liquid' | 'unknown'} productForm
 * @param {string} frameworkId
 * @returns {NutritionAssessment}
 */
function evaluateRuleAssessment(rule, nutrition, productForm, frameworkId) {
  const applicable = isRuleApplicable(rule, productForm);
  const basis = /** @type {'per_100g' | 'per_100ml' | 'percent_energy' | 'dv_based'} */ (rule?.basis || 'per_100g');
  const appliesTo = /** @type {'solid' | 'liquid' | 'both'} */ (rule?.applies_to || 'both');
  const bandType = /** @type {'risk' | 'beneficial'} */ (rule?.band_type || 'risk');

  if (!applicable) {
    const tone = resolveBandTone(bandType, 'unknown');
    return {
      nutrient_key: String(rule?.nutrient_key || 'unknown_nutrient'),
      nutrient: String(rule?.label || rule?.nutrient_key || 'Unknown nutrient'),
      value: null,
      threshold_low: asFiniteNumber(rule?.low_max),
      threshold_high: asFiniteNumber(rule?.medium_max),
      band_type: bandType,
      band_level: 'unknown',
      band_color: tone.band_color,
      band_meaning: tone.band_meaning,
      threshold_text: String(rule?.threshold_text || ''),
      daily_target: String(rule?.daily_target || 'N/A'),
      actual_display: 'Unknown',
      basis,
      applies_to: appliesTo,
      framework_id: frameworkId,
      framework_band_level: 'unknown',
      global_band_level: 'unknown',
      unknown_reason: 'not_applicable',
      is_estimated: false,
      rule_id: String(rule?.rule_id || ''),
      rule_is_provisional: Boolean(rule?.is_provisional)
    };
  }

  const valueResult = evaluateRuleValue(rule, nutrition);
  const bandLevel = evaluateBandLevel(rule, valueResult.valueForBand);
  const tone = resolveBandTone(bandType, bandLevel);

  return {
    nutrient_key: String(rule?.nutrient_key || 'unknown_nutrient'),
    nutrient: String(rule?.label || rule?.nutrient_key || 'Unknown nutrient'),
    value: valueResult.value,
    threshold_low: asFiniteNumber(rule?.low_max),
    threshold_high: asFiniteNumber(rule?.medium_max),
    band_type: bandType,
    band_level: bandLevel,
    band_color: tone.band_color,
    band_meaning: tone.band_meaning,
    threshold_text: String(rule?.threshold_text || ''),
    daily_target: String(rule?.daily_target || 'N/A'),
    actual_display: valueResult.actualDisplay,
    basis,
    applies_to: appliesTo,
    framework_id: frameworkId,
    framework_band_level: bandLevel,
    global_band_level: bandLevel,
    unknown_reason: /** @type {any} */ (valueResult.unknownReason),
    is_estimated: false,
    rule_id: String(rule?.rule_id || ''),
    rule_is_provisional: Boolean(rule?.is_provisional)
  };
}

/**
 * @param {any} profile
 * @param {import('./data.mjs').ProductProfile['nutrition_per_100g'] | undefined} nutrition
 * @param {'solid' | 'liquid' | 'unknown'} productForm
 */
function evaluateProfileNutrition(profile, nutrition, productForm) {
  const rules = Array.isArray(profile?.nutrient_rules) ? profile.nutrient_rules : [];
  return rules.map((rule) => evaluateRuleAssessment(rule, nutrition, productForm, String(profile.profile_id)));
}

/**
 * @param {FrameworkVerdict[]} frameworkVerdicts
 */
function computeGlobalGuardrailVerdict(frameworkVerdicts) {
  const known = frameworkVerdicts
    .map((item) => item.severity)
    .filter((severity) => severity !== 'Unknown');

  if (!known.length) return 'Unknown';
  return strictestSeverity(known);
}

/**
 * @param {any} profile
 * @param {NutritionAssessment[]} assessments
 * @returns {FrameworkVerdict}
 */
function computeFrameworkVerdict(profile, assessments) {
  const frameworkId = String(profile?.profile_id || 'unknown_framework');
  const frameworkName = String(profile?.framework_name || frameworkId);

  if (profile?.guidance_only) {
    return {
      framework_id: frameworkId,
      framework_name: frameworkName,
      severity: 'Unknown',
      triggered_rules: [],
      unknown_reasons: ['guidance_only_reference']
    };
  }

  const relevant = assessments.filter((item) => item.band_type === 'risk' && item.unknown_reason !== 'not_applicable');
  const known = relevant.filter((item) => item.band_level !== 'unknown');
  const unknownReasons = [...new Set(relevant.map((item) => item.unknown_reason).filter(Boolean))];
  const provisionalTriggered = relevant.some((item) => item.rule_is_provisional && (item.band_level === 'medium' || item.band_level === 'high'));

  /** @type {string[]} */
  const triggeredRules = relevant
    .filter((item) => item.band_level === 'medium' || item.band_level === 'high')
    .map((item) => item.rule_id || item.nutrient_key)
    .filter(Boolean);

  let severity = 'Unknown';
  if (known.some((item) => item.band_level === 'high')) {
    severity = 'High';
  } else if (known.some((item) => item.band_level === 'medium')) {
    severity = 'Moderate';
  } else if (known.length) {
    severity = 'Low';
  }

  if (severity === 'Unknown' && !unknownReasons.length) {
    unknownReasons.push('missing_value');
  }
  if (provisionalTriggered) {
    unknownReasons.push('provisional_thresholds');
  }

  return {
    framework_id: frameworkId,
    framework_name: frameworkName,
    severity,
    triggered_rules: [...new Set(triggeredRules)],
    unknown_reasons: unknownReasons
  };
}

/**
 * @param {RiskSignal[]} ingredientSignals
 * @returns {FrameworkVerdict}
 */
function computeIngredientFrameworkVerdict(ingredientSignals) {
  const severity = strictestSeverity(ingredientSignals.map((signal) => signal.severity));

  return {
    framework_id: 'ingredient_safety_v1',
    framework_name: 'Ingredient safety engine',
    severity: ingredientSignals.length ? severity : 'Unknown',
    triggered_rules: ingredientSignals.map((signal) => signal.rule_triggered),
    unknown_reasons: ingredientSignals.length ? [] : ['missing_value']
  };
}

/**
 * @param {import('./data.mjs').ProductProfile['nutrition_per_100g']} nutrition
 * @param {{ product_form?: 'solid' | 'liquid' | 'unknown' }} [options]
 * @returns {NutritionAssessment[]}
 */
export function assessNutrition(nutrition, options = {}) {
  const profile = getDefaultProfile();
  if (!profile) return [];

  const productForm = options.product_form || 'unknown';
  return evaluateProfileNutrition(profile, nutrition, productForm);
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
 * @param {{ ingredients?: string[], regulatory_actions?: RegulatoryActionItem[] }} [options]
 * @returns {ScanResult}
 */
export function evaluateProduct(product, options = {}) {
  const ingredients = options.ingredients || product?.ingredients_raw || [];
  const nutrition = product?.nutrition_per_100g;
  const productForm = resolveProductForm(product);
  const regulatoryActionMatches = matchRegulatoryActions(product, options.regulatory_actions);

  const ingredientSignals = evaluateIngredientRisks(ingredients);
  const nutritionAssessments = assessNutrition(nutrition, { product_form: productForm });
  const nutritionSignals = evaluateNutritionRisks(nutritionAssessments);
  const portionOverrideSignals = evaluateUkPortionOverrideRisks(product, nutrition, productForm);
  const regulatorySignals = evaluateRegulatoryActionSignals(regulatoryActionMatches);
  const allSignals = [...ingredientSignals, ...nutritionSignals, ...portionOverrideSignals, ...regulatorySignals];

  const frameworkProfiles = getGlobalFrameworkProfiles();
  const frameworkVerdicts = frameworkProfiles.map((profile) => {
    const profileAssessments = evaluateProfileNutrition(profile, nutrition, productForm);
    return computeFrameworkVerdict(profile, profileAssessments);
  });

  frameworkVerdicts.push(computeIngredientFrameworkVerdict(ingredientSignals));
  frameworkVerdicts.push(computeRegulatoryFrameworkVerdict(regulatoryActionMatches));

  const globalGuardrailVerdict = computeGlobalGuardrailVerdict(frameworkVerdicts);

  const summary = buildSummary(allSignals, product);
  const legacySeverity = decideOverallSeverity(allSignals, nutritionAssessments, Boolean(product), ingredients);
  const severity = isGlobalGuardrailEnabled()
    ? strictestSeverity([globalGuardrailVerdict, strictestSeverity(allSignals.map((signal) => signal.severity))])
    : legacySeverity;

  const riskScore = calculateRiskScore(severity, allSignals, nutritionAssessments);
  const confidenceBundle = computeOverallConfidence({
    product,
    ingredients,
    nutritionAssessments,
    signals: allSignals,
    regulatoryMatches: regulatoryActionMatches
  });

  return {
    severity,
    risk_signals: allSignals,
    nutrition_assessment: nutritionAssessments,
    risk_score: riskScore,
    summary,
    rules_profile_id: getDefaultProfileId(),
    rules_version: getRulesVersion(),
    framework_verdicts: frameworkVerdicts,
    global_guardrail_verdict: globalGuardrailVerdict,
    regulatory_action_matches: regulatoryActionMatches,
    overall_confidence: confidenceBundle.overall_confidence,
    confidence_notes: confidenceBundle.confidence_notes
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
 * @param {{
 *   product: import('./data.mjs').ProductProfile | null,
 *   ingredients: string[],
 *   nutritionAssessments: NutritionAssessment[],
 *   signals: RiskSignal[],
 *   regulatoryMatches: RegulatoryActionItem[]
 * }} input
 * @returns {{overall_confidence: 'high' | 'medium' | 'low', confidence_notes: string[]}}
 */
function computeOverallConfidence(input) {
  const notes = [];
  let score = 0;

  if (input.product) {
    score += 1;
  } else {
    notes.push('No verified product record was available for this scan.');
  }

  if (input.ingredients.length) {
    score += 1;
  } else {
    notes.push('Ingredient list missing or incomplete.');
  }

  const knownRiskNutrition = input.nutritionAssessments.filter((item) => item.band_type === 'risk' && item.band_level !== 'unknown');
  if (knownRiskNutrition.length >= 3) {
    score += 1;
  } else {
    notes.push('Limited nutrition fields reduced confidence for framework evaluation.');
  }

  const provisionalHits = input.nutritionAssessments.filter(
    (item) => item.rule_is_provisional && (item.band_level === 'medium' || item.band_level === 'high')
  ).length;
  if (provisionalHits) {
    notes.push(`${provisionalHits} threshold trigger(s) use provisional reference logic.`);
  }

  const confirmedRegulatory = input.regulatoryMatches.filter((item) => item.status === 'confirmed').length;
  if (confirmedRegulatory > 0) {
    score += 2;
    notes.push(`${confirmedRegulatory} regulator-confirmed action match(es) found.`);
  }

  const unresolvedRegulatory = input.regulatoryMatches.filter((item) => item.status !== 'confirmed').length;
  if (unresolvedRegulatory > 0) {
    notes.push(`${unresolvedRegulatory} regulatory claim(s) are under review.`);
  }

  const evidenceRequired = input.signals.filter((signal) => signal.severity === 'High' || signal.severity === 'Moderate').length;
  const evidenceComplete = input.signals
    .filter((signal) => signal.severity === 'High' || signal.severity === 'Moderate')
    .every((signal) => Array.isArray(signal.evidence) && signal.evidence.length > 0);

  if (evidenceRequired > 0 && evidenceComplete) {
    score += 1;
  } else if (evidenceRequired > 0) {
    notes.push('Some risk signals are missing complete evidence links.');
  }

  /** @type {'high' | 'medium' | 'low'} */
  let overall = 'low';
  if (score >= 5) overall = 'high';
  else if (score >= 3) overall = 'medium';

  if (!notes.length) {
    notes.push('Confidence is based on label completeness and evidence provenance.');
  }

  return {
    overall_confidence: overall,
    confidence_notes: notes
  };
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
  return [
    'total_fat_g',
    'saturated_fat_g',
    'total_sugars_g',
    'salt_g',
    'sodium_mg',
    'fiber_g',
    'protein_g',
    'added_sugars_g',
    'added_salt_mg',
    'added_fat_g'
  ].some((key) => Number.isFinite(Number(nutrition[key])));
}

/**
 * @param {import('./data.mjs').ProductProfile[]} products
 * @param {import('./data.mjs').ProductProfile} selected
 * @param {ScanResult} selectedScan
 * @param {{ regulatory_actions?: RegulatoryActionItem[] }} [options]
 * @returns {Array<{candidate_product_id: string, reason_codes: string[], net_improvement_score: number}>}
 */
export function recommendSwaps(products, selected, selectedScan, options = {}) {
  const inCategory = products.filter((p) => p.category === selected.category && p.id !== selected.id);
  const recommendations = inCategory
    .map((candidate) => {
      const candidateScan = evaluateProduct(candidate, options);
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
 * @param {{ regulatory_actions?: RegulatoryActionItem[] }} [options]
 */
export function compareProducts(left, right, options = {}) {
  const leftScan = evaluateProduct(left, options);
  const rightScan = evaluateProduct(right, options);

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
