/**
 * HealthLens seed data and contracts for V1 prototype.
 */

/** @typedef {'Low' | 'Moderate' | 'High' | 'Unknown'} Severity */
/** @typedef {'Regulator Confirmed' | 'Independent Evidence' | 'Independent Testing' | 'Under Review'} SourceType */

/**
 * @typedef {Object} ProductProfile
 * @property {string} id
 * @property {string} barcode
 * @property {string} name
 * @property {string} brand
 * @property {string} category
 * @property {string[]} region_availability
 * @property {string[]} ingredients_raw
 * @property {'solid' | 'liquid' | 'unknown'} product_form
 * @property {number | undefined} [serving_size_g]
 * @property {number | undefined} [serving_size_ml]
 * @property {{
 *   energy_kcal: number,
 *   total_fat_g: number,
 *   saturated_fat_g: number,
 *   total_sugars_g: number,
 *   salt_g: number,
 *   sodium_mg: number,
 *   fiber_g: number,
 *   protein_g: number,
 *   added_sugars_g?: number,
 *   added_salt_mg?: number,
 *   added_fat_g?: number
 * }} nutrition_per_100g
 * @property {'seed' | 'api' | 'scrape' | 'merged'} source_origin
 * @property {string[]} source_urls
 * @property {string} fetched_at
 * @property {string} last_verified_at
 * @property {number} data_completeness_score
 * @property {string[]} data_quality_flags
 */

/**
 * @typedef {Object} EvidenceCard
 * @property {string} id
 * @property {SourceType} source_type
 * @property {string} title
 * @property {string} source_url
 * @property {string} publication_date
 * @property {'India' | 'EU' | 'US' | 'Global'} jurisdiction
 * @property {'High' | 'Medium' | 'Low'} strength_level
 * @property {'Regulator Confirmed' | 'Independent Evidence' | 'Under Review'} verification_state
 * @property {string} last_verified_at
 * @property {string} source_authority
 */

/**
 * @typedef {Object} RegulatoryActionItem
 * @property {string} id
 * @property {string} jurisdiction
 * @property {string} authority
 * @property {'ban' | 'recall' | 'import_refusal' | 'alert' | 'update'} action_type
 * @property {string | undefined} [barcode]
 * @property {string} product_name
 * @property {string | undefined} [brand]
 * @property {string | undefined} [manufacturer]
 * @property {string} reason_category
 * @property {string} hazard
 * @property {string} action_date
 * @property {'confirmed' | 'under_review'} status
 * @property {string[]} source_urls
 * @property {'Regulator Confirmed' | 'Independent Evidence' | 'Under Review'} confidence
 */

/**
 * @typedef {Object} WatchdogItem
 * @property {string} id
 * @property {string} title
 * @property {'ban' | 'recall' | 'refusal' | 'update'} event_type
 * @property {'India' | 'EU' | 'US' | 'Global'} geography
 * @property {string} date
 * @property {string[]} source_links
 * @property {string} summary
 */

/** @type {Record<string, EvidenceCard[]>} */
export const EVIDENCE_BY_RULE = {
  lead_chromate: [
    {
      id: 'e-led-1',
      source_type: 'Regulator Confirmed',
      title: 'FDA import alerts and U.S. studies on lead in turmeric',
      source_url: 'https://www.fda.gov/food/importing-food-products-united-states/import-alerts',
      publication_date: '2025-10-10',
      jurisdiction: 'US',
      strength_level: 'High'
    },
    {
      id: 'e-led-2',
      source_type: 'Independent Evidence',
      title: 'Stanford-led study on lead adulteration in South Asian turmeric',
      source_url: 'https://pubs.acs.org',
      publication_date: '2024-09-01',
      jurisdiction: 'Global',
      strength_level: 'High'
    }
  ],
  metanil_yellow: [
    {
      id: 'e-dye-1',
      source_type: 'Regulator Confirmed',
      title: 'Indian food safety actions against banned textile dyes',
      source_url: 'https://fssai.gov.in',
      publication_date: '2025-07-14',
      jurisdiction: 'India',
      strength_level: 'High'
    },
    {
      id: 'e-dye-2',
      source_type: 'Independent Evidence',
      title: 'Large sample studies reporting banned dyes in market foods',
      source_url: 'https://www.cseindia.org',
      publication_date: '2024-12-18',
      jurisdiction: 'India',
      strength_level: 'Medium'
    }
  ],
  deo_eg_contamination: [
    {
      id: 'e-pharma-1',
      source_type: 'Regulator Confirmed',
      title: 'WHO medical product alerts on contaminated syrups',
      source_url: 'https://www.who.int/news-room/medical-product-alerts',
      publication_date: '2025-06-01',
      jurisdiction: 'Global',
      strength_level: 'High'
    }
  ],
  potassium_bromate: [
    {
      id: 'e-bromate-1',
      source_type: 'Regulator Confirmed',
      title: 'FSSAI ban on potassium bromate in food products',
      source_url: 'https://fssai.gov.in',
      publication_date: '2016-06-15',
      jurisdiction: 'India',
      strength_level: 'High'
    }
  ],
  antibiotic_shrimp: [
    {
      id: 'e-shrimp-1',
      source_type: 'Regulator Confirmed',
      title: 'Import refusals and mandatory testing for antibiotic residues',
      source_url: 'https://www.fda.gov',
      publication_date: '2025-11-03',
      jurisdiction: 'US',
      strength_level: 'High'
    }
  ],
  synthetic_sweeteners: [
    {
      id: 'e-sweet-1',
      source_type: 'Under Review',
      title: 'Long-term sweetener health outcomes remain debated',
      source_url: 'https://www.iarc.who.int',
      publication_date: '2025-03-11',
      jurisdiction: 'Global',
      strength_level: 'Low'
    }
  ],
  ultra_processed_markers: [
    {
      id: 'e-upf-1',
      source_type: 'Independent Evidence',
      title: 'Umbrella reviews linking higher ultra-processed intake to disease risk',
      source_url: 'https://www.bmj.com',
      publication_date: '2024-02-28',
      jurisdiction: 'Global',
      strength_level: 'Medium'
    }
  ],
  trans_fat_pho: [
    {
      id: 'e-transfat-1',
      source_type: 'Regulator Confirmed',
      title: 'WHO REPLACE and PHO elimination guidance',
      source_url: 'https://www.who.int/teams/nutrition-and-food-safety/replace-trans-fat',
      publication_date: '2025-12-01',
      jurisdiction: 'Global',
      strength_level: 'High'
    }
  ],
  uk_portion_override: [
    {
      id: 'e-portion-1',
      source_type: 'Regulator Confirmed',
      title: 'UK front-of-pack guidance on red-per-portion overrides',
      source_url: 'https://www.food.gov.uk/sites/default/files/media/document/fop-guidance_0.pdf',
      publication_date: '2025-06-01',
      jurisdiction: 'Global',
      strength_level: 'High'
    }
  ],
  high_sugar: [
    {
      id: 'e-nutrition-1',
      source_type: 'Regulator Confirmed',
      title: 'WHO and UK traffic-light sugar thresholds',
      source_url: 'https://www.who.int',
      publication_date: '2025-01-20',
      jurisdiction: 'Global',
      strength_level: 'High'
    }
  ],
  high_salt: [
    {
      id: 'e-nutrition-2',
      source_type: 'Regulator Confirmed',
      title: 'WHO sodium and salt guidance for processed foods',
      source_url: 'https://www.who.int/publications',
      publication_date: '2025-04-17',
      jurisdiction: 'Global',
      strength_level: 'High'
    }
  ],
  high_saturated_fat: [
    {
      id: 'e-nutrition-3',
      source_type: 'Regulator Confirmed',
      title: 'Saturated fat guidance across WHO and major health systems',
      source_url: 'https://www.who.int/health-topics',
      publication_date: '2025-02-05',
      jurisdiction: 'Global',
      strength_level: 'High'
    }
  ]
};

function deriveSourceAuthority(card) {
  const url = String(card?.source_url || '').toLowerCase();
  if (!url) return 'Unknown';
  if (url.includes('fda.gov')) return 'U.S. FDA';
  if (url.includes('who.int')) return 'WHO';
  if (url.includes('fssai.gov.in')) return 'FSSAI';
  if (url.includes('food.gov.uk')) return 'UK FSA';
  if (url.includes('canada.ca')) return 'Health Canada';
  if (url.includes('europa.eu')) return 'European Commission';
  if (url.includes('bmj.com')) return 'BMJ';
  if (url.includes('pubs.acs.org')) return 'ACS Publications';
  if (url.includes('cseindia.org')) return 'CSE India';
  if (url.includes('iarc.who.int')) return 'IARC';
  return 'Independent source';
}

function deriveVerificationState(sourceType) {
  if (sourceType === 'Regulator Confirmed') return 'Regulator Confirmed';
  if (sourceType === 'Under Review') return 'Under Review';
  return 'Independent Evidence';
}

for (const cards of Object.values(EVIDENCE_BY_RULE)) {
  for (const card of cards) {
    card.verification_state = card.verification_state || deriveVerificationState(card.source_type);
    card.last_verified_at = card.last_verified_at || card.publication_date;
    card.source_authority = card.source_authority || deriveSourceAuthority(card);
  }
}

function inferSeedProductForm(product) {
  const explicit = String(product?.product_form || '').toLowerCase().trim();
  if (explicit === 'solid' || explicit === 'liquid') return explicit;

  const hint = `${product?.category || ''} ${product?.name || ''}`.toLowerCase();
  if (/(drink|beverage|juice|water|soda|tea|coffee|milk|shake|smoothie|syrup)/i.test(hint)) {
    return 'liquid';
  }

  return 'solid';
}

/** @type {ProductProfile[]} */
export const PRODUCTS = [
  {
    id: 'p1',
    barcode: '8901000000011',
    name: 'Golden Turmeric Powder',
    brand: 'SunSpice',
    category: 'Spices',
    region_availability: ['India', 'EU', 'US'],
    ingredients_raw: ['turmeric', 'lead chromate'],
    nutrition_per_100g: {
      energy_kcal: 335,
      total_fat_g: 10,
      saturated_fat_g: 3,
      total_sugars_g: 3.2,
      salt_g: 0.14,
      sodium_mg: 56,
      fiber_g: 22,
      protein_g: 8
    }
  },
  {
    id: 'p2',
    barcode: '8901000000028',
    name: 'Metro Masala Blend',
    brand: 'QuickCook',
    category: 'Spices',
    region_availability: ['India'],
    ingredients_raw: ['chili', 'coriander', 'salt', 'metanil yellow'],
    nutrition_per_100g: {
      energy_kcal: 280,
      total_fat_g: 7,
      saturated_fat_g: 1.8,
      total_sugars_g: 8.2,
      salt_g: 3.8,
      sodium_mg: 1520,
      fiber_g: 11,
      protein_g: 9
    }
  },
  {
    id: 'p3',
    barcode: '8901000000035',
    name: 'Crispy Millet Chips - Tangy Tomato',
    brand: 'NimbleSnax',
    category: 'Snacks',
    region_availability: ['India', 'US'],
    ingredients_raw: ['millet flour', 'rice flour', 'sunflower oil', 'salt', 'natural flavors'],
    nutrition_per_100g: {
      energy_kcal: 512,
      total_fat_g: 24,
      saturated_fat_g: 5.7,
      total_sugars_g: 4,
      salt_g: 2.2,
      sodium_mg: 880,
      fiber_g: 3.8,
      protein_g: 7
    }
  },
  {
    id: 'p4',
    barcode: '8901000000042',
    name: 'Plain Rolled Oats',
    brand: 'GoodHarvest',
    category: 'Breakfast',
    region_availability: ['India', 'EU', 'US', 'Global'],
    ingredients_raw: ['whole grain oats'],
    nutrition_per_100g: {
      energy_kcal: 389,
      total_fat_g: 6.9,
      saturated_fat_g: 1.2,
      total_sugars_g: 0.9,
      salt_g: 0.02,
      sodium_mg: 8,
      fiber_g: 10,
      protein_g: 16.9
    }
  },
  {
    id: 'p5',
    barcode: '8901000000059',
    name: 'Fruit Yogurt Cup - Strawberry',
    brand: 'DairyMorn',
    category: 'Dairy',
    region_availability: ['India', 'EU'],
    ingredients_raw: ['milk solids', 'sugar', 'fruit pulp', 'tartrazine', 'stabilizer', 'flavor'],
    nutrition_per_100g: {
      energy_kcal: 154,
      total_fat_g: 4.6,
      saturated_fat_g: 3,
      total_sugars_g: 21,
      salt_g: 0.34,
      sodium_mg: 136,
      fiber_g: 0.4,
      protein_g: 4.4
    }
  },
  {
    id: 'p6',
    barcode: '8901000000066',
    name: 'Classic Curd Unsweetened',
    brand: 'DairyMorn',
    category: 'Dairy',
    region_availability: ['India', 'Global'],
    ingredients_raw: ['milk', 'live cultures'],
    nutrition_per_100g: {
      energy_kcal: 61,
      total_fat_g: 3.3,
      saturated_fat_g: 2.1,
      total_sugars_g: 4.7,
      salt_g: 0.12,
      sodium_mg: 48,
      fiber_g: 0,
      protein_g: 3.5
    }
  },
  {
    id: 'p7',
    barcode: '8901000000073',
    name: 'Crunch Protein Cereal',
    brand: 'MorningFuel',
    category: 'Breakfast',
    region_availability: ['India', 'US', 'Global'],
    ingredients_raw: [
      'corn flour',
      'sugar',
      'soy protein isolate',
      'high fructose corn syrup',
      'maltodextrin',
      'bht'
    ],
    nutrition_per_100g: {
      energy_kcal: 430,
      total_fat_g: 8,
      saturated_fat_g: 1,
      total_sugars_g: 30,
      salt_g: 1.1,
      sodium_mg: 440,
      fiber_g: 2.2,
      protein_g: 17
    }
  },
  {
    id: 'p8',
    barcode: '8901000000080',
    name: 'Cold Relief Children Syrup',
    brand: 'CarePharm',
    category: 'Medicine',
    region_availability: ['India', 'Global'],
    ingredients_raw: ['acetaminophen', 'propylene glycol', 'diethylene glycol trace'],
    nutrition_per_100g: {
      energy_kcal: 0,
      total_fat_g: 0,
      saturated_fat_g: 0,
      total_sugars_g: 0,
      salt_g: 0,
      sodium_mg: 0,
      fiber_g: 0,
      protein_g: 0
    }
  },
  {
    id: 'p9',
    barcode: '8901000000097',
    name: 'Ocean Farm Shrimp Pack',
    brand: 'BlueBasket',
    category: 'Seafood',
    region_availability: ['India', 'EU', 'US'],
    ingredients_raw: ['shrimp', 'water', 'salt', 'chloramphenicol residue'],
    nutrition_per_100g: {
      energy_kcal: 99,
      total_fat_g: 0.3,
      saturated_fat_g: 0.1,
      total_sugars_g: 0,
      salt_g: 0.6,
      sodium_mg: 240,
      fiber_g: 0,
      protein_g: 24
    }
  }
].map((product) => ({
  ...product,
  product_form: inferSeedProductForm(product),
  source_origin: 'seed',
  source_urls: ['seed://data.mjs'],
  fetched_at: '2026-02-13T00:00:00.000Z',
  last_verified_at: '2026-02-13T00:00:00.000Z',
  data_completeness_score: 0,
  data_quality_flags: []
}));

/** @type {WatchdogItem[]} */
export const WATCHDOG_FEED = [
  {
    id: 'w1',
    title: 'EU tightened residue checks on select spice imports',
    event_type: 'update',
    geography: 'EU',
    date: '2026-01-14',
    source_links: ['https://food.ec.europa.eu/safety/rasff_en'],
    summary: 'Increased border sampling for contamination-prone categories and exporters.'
  },
  {
    id: 'w2',
    title: 'US import refusal notices on antibiotic residues in shrimp',
    event_type: 'refusal',
    geography: 'US',
    date: '2025-12-02',
    source_links: ['https://www.accessdata.fda.gov/cms_ia/importalert_'],
    summary: 'Multiple lines refused for residues linked to banned aquaculture antibiotic use.'
  },
  {
    id: 'w3',
    title: 'India reiterates ban enforcement on industrial food dyes',
    event_type: 'ban',
    geography: 'India',
    date: '2025-11-10',
    source_links: ['https://fssai.gov.in'],
    summary: 'State units directed to increase sampling in sweets, spice mixes, and street snacks.'
  },
  {
    id: 'w4',
    title: 'Global safety alert on contaminated pediatric syrups',
    event_type: 'recall',
    geography: 'Global',
    date: '2025-09-28',
    source_links: ['https://www.who.int/news-room/medical-product-alerts'],
    summary: 'Cross-border advisories continue for DEG/EG contamination in pediatric products.'
  },
  {
    id: 'w5',
    title: 'Independent dairy contamination report marked as under review',
    event_type: 'update',
    geography: 'India',
    date: '2026-01-21',
    source_links: ['https://fssai.gov.in'],
    summary: 'Findings circulating publicly are not yet regulator-verified; caution label retained.'
  }
];

export const COACH_TIPS = [
  {
    id: 'c1',
    title: 'Fiber bump for today',
    text: 'Add one cup of cooked lentils or beans to reach your daily fiber target faster.'
  },
  {
    id: 'c2',
    title: 'Smart sugar swap',
    text: 'If packaged yogurt has over 10g sugar per serving, choose plain curd and add fresh fruit.'
  },
  {
    id: 'c3',
    title: 'Sodium reset',
    text: 'Compare products per 100g. Choose options with sodium under 120mg when possible.'
  },
  {
    id: 'c4',
    title: 'Hydration anchor',
    text: 'Use water as your default drink. Keep a visible bottle near your work or study spot.'
  },
  {
    id: 'c5',
    title: 'Label speed trick',
    text: 'Scan the first three ingredients. If sugar, refined flour, or added oils dominate, skip it.'
  }
];

export const SOURCE_BADGE_COLORS = {
  'Regulator Confirmed': 'var(--badge-regulator)',
  'Independent Evidence': 'var(--badge-independent)',
  'Independent Testing': 'var(--badge-independent)',
  'Under Review': 'var(--badge-review)'
};
