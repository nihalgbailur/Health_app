const NUTRITION_KEYS = [
  'energy_kcal',
  'total_fat_g',
  'saturated_fat_g',
  'total_sugars_g',
  'salt_g',
  'sodium_mg',
  'fiber_g',
  'protein_g'
];

const GENERIC_BRAND_TOKENS = new Set([
  'Digestive',
  'Biscuit',
  'Biscuits',
  'Cookie',
  'Cookies',
  'Butter',
  'Milk',
  'Snack',
  'Chips',
  'Cereal',
  'Spice',
  'Powder',
  'Flour',
  'Masala',
  'Tea'
]);

const DEFAULT_SCORE_SPARSE_THRESHOLD = 4;

export function parseNumber(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(2));

  const cleaned = String(value)
    .trim()
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '');
  if (!cleaned) return undefined;

  const numeric = Number.parseFloat(cleaned);
  if (!Number.isFinite(numeric)) return undefined;
  return Number(numeric.toFixed(2));
}

export function titleCase(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

export function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeNutritionShape(nutrition) {
  const source = nutrition && typeof nutrition === 'object' ? nutrition : {};
  const out = {};
  for (const key of NUTRITION_KEYS) {
    const parsed = parseNumber(source[key]);
    if (parsed !== undefined) out[key] = parsed;
  }
  return out;
}

export function countNutritionValues(nutrition) {
  const normalized = normalizeNutritionShape(nutrition);
  return NUTRITION_KEYS.filter((key) => normalized[key] !== undefined).length;
}

export function hasMeaningfulIngredients(product) {
  return Array.isArray(product?.ingredients_raw) && product.ingredients_raw.some((item) => String(item || '').trim().length > 1);
}

export function computeDataCompletenessScore(product) {
  const ingredientScore = hasMeaningfulIngredients(product) ? 2 : 0;
  const nutritionScore = countNutritionValues(product?.nutrition_per_100g);
  const brandScore = product?.brand && String(product.brand).trim().toLowerCase() !== 'unknown brand' ? 1 : 0;
  const nameScore = product?.name ? 1 : 0;
  return ingredientScore + nutritionScore + brandScore + nameScore;
}

export function computeDataQualityFlags(product) {
  const flags = [];
  const score = computeDataCompletenessScore(product);
  if (!hasMeaningfulIngredients(product)) flags.push('MISSING_INGREDIENTS');
  if (countNutritionValues(product?.nutrition_per_100g) === 0) flags.push('MISSING_NUTRITION');
  if (!product?.brand || String(product.brand).trim().toLowerCase() === 'unknown brand') flags.push('UNKNOWN_BRAND');
  if (score < DEFAULT_SCORE_SPARSE_THRESHOLD) flags.push('SPARSE_DATA');
  if (product?.source_origin === 'scrape') flags.push('UNDER_REVIEW');
  if (product?.source_origin === 'merged') flags.push('MERGED_SOURCES');
  return uniqueStrings(flags);
}

export function isProductSparse(product, threshold = DEFAULT_SCORE_SPARSE_THRESHOLD) {
  return computeDataCompletenessScore(product) < threshold;
}

export function isProductStale(product, staleHours = 24, now = Date.now()) {
  const stamp = product?.last_verified_at || product?.fetched_at;
  if (!stamp) return true;
  const timestamp = new Date(stamp).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return now - timestamp > staleHours * 60 * 60 * 1000;
}

export function inferBrandFromName(name) {
  const normalized = String(name || '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 'Unknown brand';

  const firstToken = titleCase(normalized.split(' ')[0]);
  if (!firstToken || GENERIC_BRAND_TOKENS.has(firstToken)) return 'Unknown brand';
  return firstToken;
}

export function deriveBrandFromOpenFoodFacts(product) {
  const candidates = [];
  if (product?.brands) {
    candidates.push(...String(product.brands).split(',').map((value) => value.trim()));
  }

  if (Array.isArray(product?.brands_tags)) {
    candidates.push(
      ...product.brands_tags
        .map((value) => String(value || '').split(':').pop().replace(/-/g, ' ').trim())
        .filter(Boolean)
    );
  }

  if (typeof product?.brand_owner === 'string' && product.brand_owner.trim()) {
    candidates.push(product.brand_owner.trim());
  }

  const valid = candidates.find((value) => value && value.toLowerCase() !== 'unknown brand');
  if (valid) return titleCase(valid);

  return inferBrandFromName(product?.product_name || product?.generic_name || '');
}

export function normalizeCategoryFromOpenFoodFacts(product) {
  const topTag = Array.isArray(product?.categories_tags) && product.categories_tags.length ? product.categories_tags[0] : '';
  if (topTag) {
    const compact = String(topTag).split(':').pop().replace(/-/g, ' ').trim();
    if (compact) return titleCase(compact);
  }

  const direct = String(product?.categories || '')
    .split(',')[0]
    .trim();
  return direct || 'General';
}

export function mapOpenFoodFactsRegions(countryTags, countriesText = '') {
  const tags = Array.isArray(countryTags) ? countryTags.map((value) => String(value || '').toLowerCase()) : [];
  if (countriesText) {
    tags.push(...String(countriesText).split(',').map((value) => value.trim().toLowerCase()));
  }

  const hasTag = (needle) => tags.some((value) => value.includes(needle));
  const regions = [];

  if (hasTag('india')) regions.push('India');
  if (hasTag('united-states') || hasTag('usa')) regions.push('US');
  if (
    hasTag('european-union') ||
    hasTag('france') ||
    hasTag('germany') ||
    hasTag('spain') ||
    hasTag('italy') ||
    hasTag('netherlands') ||
    hasTag('belgium')
  ) {
    regions.push('EU');
  }

  if (!regions.length) regions.push('Global');
  return uniqueStrings(regions);
}

export function extractIngredientsFromOpenFoodFacts(product) {
  if (Array.isArray(product?.ingredients) && product.ingredients.length) {
    const structured = product.ingredients
      .map((item) => {
        if (item?.text) return item.text;
        if (typeof item?.id === 'string') return item.id.split(':').pop().replace(/-/g, ' ');
        return '';
      })
      .map((value) => value.trim())
      .filter(Boolean);

    if (structured.length) return structured.slice(0, 40);
  }

  const textCandidates = [];
  const directFields = [
    product?.ingredients_text_en,
    product?.ingredients_text,
    product?.ingredients_text_with_allergens_en,
    product?.ingredients_text_with_allergens
  ];
  for (const candidate of directFields) {
    if (candidate) textCandidates.push(candidate);
  }

  const localized = Object.entries(product || {})
    .filter(([key, value]) => /^ingredients_text(?:_|$)/i.test(key) && typeof value === 'string' && value.trim())
    .map(([, value]) => value);
  textCandidates.push(...localized);

  const bestText = textCandidates.sort((a, b) => String(b).length - String(a).length)[0];
  if (bestText) {
    return String(bestText)
      .split(/[,;]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .slice(0, 40);
  }

  if (Array.isArray(product?.ingredients_hierarchy) && product.ingredients_hierarchy.length) {
    const hierarchy = product.ingredients_hierarchy
      .map((value) => String(value || '').split(':').pop().replace(/-/g, ' ').trim())
      .filter(Boolean);
    if (hierarchy.length) return hierarchy.slice(0, 40);
  }

  return [];
}

function deriveKcalFromKj(nutriments) {
  const kj = firstDefined(parseNumber(nutriments?.energy_100g), parseNumber(nutriments?.energy));
  if (kj === undefined) return undefined;
  return Number((kj / 4.184).toFixed(2));
}

export function extractNutritionFromOpenFoodFacts(nutriments = {}) {
  const energyKcal = firstDefined(
    parseNumber(nutriments['energy-kcal_100g']),
    parseNumber(nutriments['energy-kcal']),
    deriveKcalFromKj(nutriments)
  );

  const totalFat = firstDefined(parseNumber(nutriments.fat_100g), parseNumber(nutriments.fat));
  const saturatedFat = firstDefined(parseNumber(nutriments['saturated-fat_100g']), parseNumber(nutriments['saturated-fat']));
  const sugars = firstDefined(parseNumber(nutriments.sugars_100g), parseNumber(nutriments.sugars));
  const salt = firstDefined(parseNumber(nutriments.salt_100g), parseNumber(nutriments.salt));
  const sodiumGrams = firstDefined(parseNumber(nutriments.sodium_100g), parseNumber(nutriments.sodium));
  const fiber = firstDefined(parseNumber(nutriments.fiber_100g), parseNumber(nutriments.fiber));
  const protein = firstDefined(parseNumber(nutriments.proteins_100g), parseNumber(nutriments.proteins));

  const sodiumMg =
    sodiumGrams === undefined
      ? salt === undefined
        ? undefined
        : Number(((salt / 2.5) * 1000).toFixed(2))
      : Number((sodiumGrams * 1000).toFixed(2));
  const saltG =
    salt === undefined
      ? sodiumGrams === undefined
        ? undefined
        : Number((sodiumGrams * 2.5).toFixed(2))
      : salt;

  return normalizeNutritionShape({
    energy_kcal: energyKcal,
    total_fat_g: totalFat,
    saturated_fat_g: saturatedFat,
    total_sugars_g: sugars,
    salt_g: saltG,
    sodium_mg: sodiumMg,
    fiber_g: fiber,
    protein_g: protein
  });
}

export function finalizeProductRecord(product, {
  sourceOrigin,
  sourceUrl,
  nowISO = new Date().toISOString(),
  preserveTimestamps = true
} = {}) {
  const normalized = {
    id: String(product?.id || `prod-${product?.barcode || Math.random().toString(36).slice(2, 8)}`),
    barcode: String(product?.barcode || '').trim(),
    name: String(product?.name || '').trim() || 'Unknown product',
    brand: String(product?.brand || '').trim() || 'Unknown brand',
    category: String(product?.category || '').trim() || 'General',
    region_availability: uniqueStrings(product?.region_availability || ['Global']),
    ingredients_raw: uniqueStrings(product?.ingredients_raw || []),
    nutrition_per_100g: normalizeNutritionShape(product?.nutrition_per_100g || {}),
    source_origin: sourceOrigin || product?.source_origin || 'api',
    source_urls: uniqueStrings([...(product?.source_urls || []), sourceUrl]),
    fetched_at: preserveTimestamps && product?.fetched_at ? product.fetched_at : nowISO,
    last_verified_at: preserveTimestamps && product?.last_verified_at ? product.last_verified_at : nowISO
  };

  normalized.data_completeness_score = computeDataCompletenessScore(normalized);
  normalized.data_quality_flags = computeDataQualityFlags(normalized);

  return normalized;
}

export function normalizeOffProduct(rawProduct, {
  barcode,
  sourceUrl,
  nowISO = new Date().toISOString()
} = {}) {
  const normalized = {
    id: `api-${barcode}`,
    barcode: String(barcode || rawProduct?.code || '').trim(),
    name: rawProduct?.product_name || rawProduct?.generic_name || `Unknown product (${barcode || rawProduct?.code || '-'})`,
    brand: deriveBrandFromOpenFoodFacts(rawProduct),
    category: normalizeCategoryFromOpenFoodFacts(rawProduct),
    region_availability: mapOpenFoodFactsRegions(rawProduct?.countries_tags || [], rawProduct?.countries || ''),
    ingredients_raw: extractIngredientsFromOpenFoodFacts(rawProduct),
    nutrition_per_100g: extractNutritionFromOpenFoodFacts(rawProduct?.nutriments || {}),
    source_origin: 'api',
    source_urls: uniqueStrings([sourceUrl])
  };

  return finalizeProductRecord(normalized, { sourceOrigin: 'api', sourceUrl, nowISO, preserveTimestamps: false });
}

export function normalizeScrapedProduct(scraped, {
  barcode,
  sourceUrl,
  nowISO = new Date().toISOString()
} = {}) {
  const normalized = {
    id: `scrape-${barcode}`,
    barcode: String(barcode || scraped?.barcode || '').trim(),
    name: scraped?.name || `Unknown product (${barcode || '-'})`,
    brand: scraped?.brand || inferBrandFromName(scraped?.name || ''),
    category: scraped?.category || 'General',
    region_availability: uniqueStrings(scraped?.region_availability || ['Global']),
    ingredients_raw: uniqueStrings(scraped?.ingredients_raw || []),
    nutrition_per_100g: normalizeNutritionShape(scraped?.nutrition_per_100g || {}),
    source_origin: 'scrape',
    source_urls: uniqueStrings([sourceUrl])
  };

  return finalizeProductRecord(normalized, { sourceOrigin: 'scrape', sourceUrl, nowISO, preserveTimestamps: false });
}

function pickScalar(existingValue, incomingValue, preferIncoming) {
  const existing = String(existingValue || '').trim();
  const incoming = String(incomingValue || '').trim();

  if (!existing && incoming) return incoming;
  if (!incoming) return existing;
  return preferIncoming ? incoming : existing;
}

function mergeNutrition(existing, incoming, preferIncoming) {
  const out = {};
  const existingNorm = normalizeNutritionShape(existing || {});
  const incomingNorm = normalizeNutritionShape(incoming || {});

  for (const key of NUTRITION_KEYS) {
    const e = existingNorm[key];
    const i = incomingNorm[key];

    if (e === undefined && i === undefined) continue;
    if (e === undefined) {
      out[key] = i;
      continue;
    }
    if (i === undefined) {
      out[key] = e;
      continue;
    }
    out[key] = preferIncoming ? i : e;
  }

  return out;
}

export function mergeProductRecords(existingRecord, incomingRecord, {
  nowISO = new Date().toISOString()
} = {}) {
  const existing = finalizeProductRecord(existingRecord, {
    sourceOrigin: existingRecord?.source_origin,
    nowISO,
    preserveTimestamps: true
  });
  const incoming = finalizeProductRecord(incomingRecord, {
    sourceOrigin: incomingRecord?.source_origin,
    nowISO,
    preserveTimestamps: true
  });

  const existingScore = existing.data_completeness_score;
  const incomingScore = incoming.data_completeness_score;
  const preferIncoming = incomingScore > existingScore;

  const merged = {
    id: existing.id || incoming.id,
    barcode: existing.barcode || incoming.barcode,
    name: pickScalar(existing.name, incoming.name, preferIncoming),
    brand: pickScalar(existing.brand, incoming.brand, preferIncoming),
    category: pickScalar(existing.category, incoming.category, preferIncoming),
    region_availability: uniqueStrings([...(existing.region_availability || []), ...(incoming.region_availability || [])]),
    ingredients_raw: uniqueStrings(
      preferIncoming
        ? [...(incoming.ingredients_raw || []), ...(existing.ingredients_raw || [])]
        : [...(existing.ingredients_raw || []), ...(incoming.ingredients_raw || [])]
    ),
    nutrition_per_100g: mergeNutrition(existing.nutrition_per_100g, incoming.nutrition_per_100g, preferIncoming),
    source_origin:
      existing.source_origin === incoming.source_origin
        ? existing.source_origin
        : existing.source_origin && incoming.source_origin
          ? 'merged'
          : existing.source_origin || incoming.source_origin || 'merged',
    source_urls: uniqueStrings([...(existing.source_urls || []), ...(incoming.source_urls || [])]),
    fetched_at:
      new Date(existing.fetched_at || 0).getTime() > new Date(incoming.fetched_at || 0).getTime()
        ? existing.fetched_at
        : incoming.fetched_at,
    last_verified_at: nowISO
  };

  merged.data_completeness_score = computeDataCompletenessScore(merged);
  merged.data_quality_flags = computeDataQualityFlags(merged);

  return merged;
}
