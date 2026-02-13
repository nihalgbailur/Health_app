#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  computeDataCompletenessScore,
  finalizeProductRecord,
  inferBrandFromName,
  isProductSparse,
  isProductStale,
  mergeProductRecords,
  normalizeOffProduct,
  normalizeScrapedProduct,
  parseNumber,
  titleCase
} from '../catalogPipeline.mjs';

const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v2/product';
const OPEN_FOOD_FACTS_API_V0 = 'https://world.openfoodfacts.org/api/v0/product';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');

const DEFAULT_CATALOG_DIR = path.join(APP_ROOT, 'catalog');

function usage() {
  return [
    'Usage:',
    '  node scripts/ingest_catalog.mjs --mode daily',
    '  node scripts/ingest_catalog.mjs --barcode <code> --force',
    '  node scripts/ingest_catalog.mjs --regulatory-mode daily',
    'Options:',
    '  --mode daily           Refresh stale records and queued barcodes',
    '  --barcode <code>       Refresh a specific barcode (repeatable)',
    '  --regulatory-mode daily  Refresh regulator action feed',
    '  --force                Force refresh even if record is not stale',
    '  --catalog-dir <path>   Override catalog directory',
    '  --dry-run              Do not write output files'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    mode: null,
    regulatoryMode: null,
    barcodes: [],
    force: false,
    catalogDir: DEFAULT_CATALOG_DIR,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--mode') {
      args.mode = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (token === '--barcode') {
      const barcode = String(argv[index + 1] || '').trim();
      if (barcode) args.barcodes.push(barcode);
      index += 1;
      continue;
    }

    if (token === '--regulatory-mode') {
      args.regulatoryMode = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (token === '--force') {
      args.force = true;
      continue;
    }

    if (token === '--catalog-dir') {
      args.catalogDir = path.resolve(argv[index + 1] || DEFAULT_CATALOG_DIR);
      index += 1;
      continue;
    }

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
  }

  return args;
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, payload) {
  const formatted = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(filePath, formatted, 'utf8');
}

async function appendLogLines(filePath, lines) {
  if (!lines.length) return;
  const text = lines.map((line) => JSON.stringify(line)).join('\n');
  await fs.appendFile(filePath, `${text}\n`, 'utf8');
}

function normalizeQueue(queuePayload) {
  if (!queuePayload || typeof queuePayload !== 'object') {
    return { barcodes: [], last_updated: null };
  }

  const entries = Array.isArray(queuePayload.barcodes)
    ? queuePayload.barcodes
        .map((entry) => ({
          barcode: String(entry?.barcode || '').trim(),
          reason: String(entry?.reason || 'unknown'),
          source: String(entry?.source || 'unknown'),
          queued_at: entry?.queued_at || null,
          queued_count: Number(entry?.queued_count || 1),
          candidate_urls: Array.isArray(entry?.candidate_urls) ? entry.candidate_urls.map((url) => String(url || '').trim()).filter(Boolean) : []
        }))
        .filter((entry) => entry.barcode)
    : [];

  return {
    barcodes: entries,
    last_updated: queuePayload.last_updated || null
  };
}

function normalizeAllowlist(allowlistPayload) {
  if (!allowlistPayload || typeof allowlistPayload !== 'object') {
    return {
      domains: [],
      barcode_sources: {},
      rate_limit_ms: 1200,
      timeout_ms: 6000,
      user_agent: 'HealthLensIngestor/1.0'
    };
  }

  return {
    domains: Array.isArray(allowlistPayload.domains)
      ? [...new Set(allowlistPayload.domains.map((domain) => String(domain || '').toLowerCase()).filter(Boolean))]
      : [],
    barcode_sources:
      allowlistPayload.barcode_sources && typeof allowlistPayload.barcode_sources === 'object'
        ? allowlistPayload.barcode_sources
        : {},
    rate_limit_ms: Number(allowlistPayload.rate_limit_ms || 1200),
    timeout_ms: Number(allowlistPayload.timeout_ms || 6000),
    user_agent: String(allowlistPayload.user_agent || 'HealthLensIngestor/1.0')
  };
}

function toProductMap(products) {
  const map = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const normalized = finalizeProductRecord(product, {
      sourceOrigin: product?.source_origin || 'api',
      preserveTimestamps: true
    });
    if (!normalized.barcode) continue;
    map.set(normalized.barcode, normalized);
  }
  return map;
}

function sortedProductsFromMap(productMap) {
  return [...productMap.values()]
    .map((product) => finalizeProductRecord(product, {
      sourceOrigin: product?.source_origin || 'api',
      preserveTimestamps: true
    }))
    .sort((left, right) => left.barcode.localeCompare(right.barcode));
}

function collectTargets({ args, productsMap, queue, now }) {
  const targets = new Set(args.barcodes);

  if (args.mode === 'daily') {
    for (const product of productsMap.values()) {
      if (args.force || isProductStale(product, 24, now)) {
        targets.add(product.barcode);
      }
    }

    for (const entry of queue.barcodes) {
      targets.add(entry.barcode);
    }
  }

  return [...targets];
}

function getQueueEntry(queue, barcode) {
  return queue.barcodes.find((entry) => entry.barcode === barcode) || null;
}

function upsertQueueEntry(queue, barcode, reason, source = 'ingestor') {
  const existingIndex = queue.barcodes.findIndex((entry) => entry.barcode === barcode);
  const payload = {
    barcode,
    reason,
    source,
    queued_at: new Date().toISOString(),
    queued_count: existingIndex === -1 ? 1 : Number(queue.barcodes[existingIndex].queued_count || 1) + 1,
    candidate_urls: existingIndex === -1 ? [] : queue.barcodes[existingIndex].candidate_urls || []
  };

  if (existingIndex === -1) {
    queue.barcodes.push(payload);
  } else {
    queue.barcodes[existingIndex] = payload;
  }
}

function removeQueueEntries(queue, processedBarcodes) {
  const removeSet = new Set(processedBarcodes);
  queue.barcodes = queue.barcodes.filter((entry) => !removeSet.has(entry.barcode));
}

async function fetchJson(url, { fetchImpl, timeoutMs = 6000, headers = {} }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, { fetchImpl, timeoutMs = 6000, headers = {} }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOffVariant(endpoint, barcode, { fetchImpl, timeoutMs, nowISO }) {
  const url = `${endpoint}/${encodeURIComponent(barcode)}.json`;
  const payload = await fetchJson(url, {
    fetchImpl,
    timeoutMs,
    headers: { Accept: 'application/json' }
  });

  if (!payload || payload.status !== 1 || !payload.product) return null;

  const normalized = normalizeOffProduct(payload.product, {
    barcode,
    sourceUrl: url,
    nowISO
  });

  normalized.source_urls = [...new Set([...(normalized.source_urls || []), payload.product?.link, payload.product?.url].filter(Boolean))];
  normalized.last_verified_at = nowISO;
  return normalized;
}

async function fetchApiCandidate(barcode, { fetchImpl, timeoutMs, nowISO }) {
  const v2 = await fetchOffVariant(OPEN_FOOD_FACTS_API, barcode, { fetchImpl, timeoutMs, nowISO });
  const v0 = await fetchOffVariant(OPEN_FOOD_FACTS_API_V0, barcode, { fetchImpl, timeoutMs, nowISO });

  if (!v2) return v0;
  if (!v0) return v2;
  return mergeProductRecords(v2, v0, { nowISO });
}

function isDomainAllowlisted(url, allowlistDomains) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowlistDomains.includes(hostname);
  } catch {
    return false;
  }
}

function parseRobotsRules(robotsText, userAgent) {
  const lines = String(robotsText || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean);

  const userAgentLower = String(userAgent || '*').toLowerCase();
  const wildcardRules = [];
  const agentRules = [];

  let currentTargets = [];

  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === 'user-agent') {
      currentTargets = [value.toLowerCase()];
      continue;
    }

    if (key !== 'disallow') continue;
    if (!value) continue;

    if (currentTargets.includes('*')) {
      wildcardRules.push(value);
    }

    if (currentTargets.some((agent) => userAgentLower.includes(agent) || agent.includes(userAgentLower))) {
      agentRules.push(value);
    }
  }

  return agentRules.length ? agentRules : wildcardRules;
}

async function isRobotsAllowed(url, {
  fetchImpl,
  timeoutMs,
  userAgent,
  robotsCache
}) {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin;

    if (!robotsCache.has(origin)) {
      const robotsUrl = `${origin}/robots.txt`;
      const robotsText = await fetchText(robotsUrl, {
        fetchImpl,
        timeoutMs,
        headers: { 'User-Agent': userAgent }
      });

      robotsCache.set(origin, parseRobotsRules(robotsText || '', userAgent));
    }

    const disallowRules = robotsCache.get(origin) || [];
    const targetPath = parsed.pathname || '/';

    const blocked = disallowRules.some((rule) => {
      const normalizedRule = String(rule || '').trim();
      if (!normalizedRule) return false;
      return targetPath.startsWith(normalizedRule);
    });

    return !blocked;
  } catch {
    return false;
  }
}

async function enforceRateLimit(domain, rateLimitMs, requestClock) {
  const now = Date.now();
  const last = requestClock.get(domain) || 0;
  const delta = now - last;

  if (delta < rateLimitMs) {
    await new Promise((resolve) => setTimeout(resolve, rateLimitMs - delta));
  }

  requestClock.set(domain, Date.now());
}

function parseJsonLike(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonLdProductObjects(html) {
  const matches = [...String(html || '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products = [];

  for (const match of matches) {
    const payload = parseJsonLike(match[1]?.trim() || '');
    if (!payload) continue;

    const queue = Array.isArray(payload) ? [...payload] : [payload];

    while (queue.length) {
      const entry = queue.shift();
      if (!entry || typeof entry !== 'object') continue;

      if (Array.isArray(entry['@graph'])) {
        queue.push(...entry['@graph']);
      }

      const type = entry['@type'];
      const typeList = Array.isArray(type) ? type : [type];
      if (typeList.some((value) => String(value || '').toLowerCase() === 'product')) {
        products.push(entry);
      }
    }
  }

  return products;
}

function splitIngredients(text) {
  return String(text || '')
    .split(/[,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function parseQuantity(value, target) {
  if (value === null || value === undefined) return undefined;

  const text = String(value).trim().toLowerCase();
  const numeric = parseNumber(text);
  if (numeric === undefined) return undefined;

  if (target === 'g') {
    if (text.includes('mg')) return Number((numeric / 1000).toFixed(2));
    return numeric;
  }

  if (target === 'mg') {
    if (text.includes(' g') || text.endsWith('g')) return Number((numeric * 1000).toFixed(2));
    return numeric;
  }

  if (target === 'kcal') {
    if (text.includes('kj')) return Number((numeric / 4.184).toFixed(2));
    if (text.includes('cal') && !text.includes('kcal')) return Number((numeric / 1000).toFixed(2));
    return numeric;
  }

  return numeric;
}

function parseNutritionFromJsonLd(nutrition) {
  if (!nutrition || typeof nutrition !== 'object') return {};

  const energy = parseQuantity(nutrition.calories || nutrition.energyContent, 'kcal');
  const fat = parseQuantity(nutrition.fatContent, 'g');
  const saturated = parseQuantity(nutrition.saturatedFatContent, 'g');
  const sugar = parseQuantity(nutrition.sugarContent, 'g');
  const sodiumMg = parseQuantity(nutrition.sodiumContent, 'mg');
  const saltG = parseQuantity(nutrition.saltContent, 'g');
  const protein = parseQuantity(nutrition.proteinContent, 'g');
  const fiber = parseQuantity(nutrition.fiberContent, 'g');
  const addedSugar = parseQuantity(nutrition.addedSugarContent || nutrition.addedSugars || nutrition.addedSugar, 'g');
  const addedFat = parseQuantity(nutrition.addedFatContent || nutrition.addedFat, 'g');
  const addedSaltMg = parseQuantity(nutrition.addedSaltContent || nutrition.addedSalt, 'mg');

  const inferredSalt = saltG !== undefined ? saltG : sodiumMg === undefined ? undefined : Number(((sodiumMg / 1000) * 2.5).toFixed(2));
  const inferredSodium = sodiumMg !== undefined ? sodiumMg : saltG === undefined ? undefined : Number(((saltG / 2.5) * 1000).toFixed(2));

  const out = {
    energy_kcal: energy,
    total_fat_g: fat,
    saturated_fat_g: saturated,
    total_sugars_g: sugar,
    salt_g: inferredSalt,
    sodium_mg: inferredSodium,
    protein_g: protein,
    fiber_g: fiber,
    added_sugars_g: addedSugar,
    added_salt_mg: addedSaltMg,
    added_fat_g: addedFat
  };

  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined));
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNutritionFromText(text) {
  const source = String(text || '').toLowerCase();

  const valueFor = (pattern, target) => {
    const match = source.match(pattern);
    if (!match) return undefined;
    return parseQuantity(match[1], target);
  };

  const sugar = valueFor(/sugars?\s*[:\-]?\s*([0-9.,]+\s*(?:mg|g|kj|kcal|cal)?)/i, 'g');
  const salt = valueFor(/salt\s*[:\-]?\s*([0-9.,]+\s*(?:mg|g))/i, 'g');
  const sodium = valueFor(/sodium\s*[:\-]?\s*([0-9.,]+\s*(?:mg|g))/i, 'mg');
  const fat = valueFor(/(?:total\s+)?fat\s*[:\-]?\s*([0-9.,]+\s*(?:mg|g))/i, 'g');
  const satFat = valueFor(/saturated\s+fat\s*[:\-]?\s*([0-9.,]+\s*(?:mg|g))/i, 'g');
  const protein = valueFor(/protein\s*[:\-]?\s*([0-9.,]+\s*(?:mg|g))/i, 'g');
  const fiber = valueFor(/(?:fibre|fiber)\s*[:\-]?\s*([0-9.,]+\s*(?:mg|g))/i, 'g');
  const addedSugar = valueFor(/added\s+sugars?\s*[:\-]?\s*([0-9.,]+\s*(?:mg|g))/i, 'g');
  const addedSaltMg = valueFor(/added\s+salt\s*[:\-]?\s*([0-9.,]+\s*(?:mg|g))/i, 'mg');
  const addedFat = valueFor(/added\s+fat\s*[:\-]?\s*([0-9.,]+\s*(?:mg|g))/i, 'g');

  if ([sugar, salt, sodium, fat, satFat, protein, fiber, addedSugar, addedSaltMg, addedFat].every((value) => value === undefined)) {
    return {};
  }

  return {
    total_sugars_g: sugar,
    salt_g: salt,
    sodium_mg: sodium,
    total_fat_g: fat,
    saturated_fat_g: satFat,
    protein_g: protein,
    fiber_g: fiber,
    added_sugars_g: addedSugar,
    added_salt_mg: addedSaltMg,
    added_fat_g: addedFat
  };
}

function parseScrapedProductFromHtml(html, { barcode, url }) {
  const productObjects = extractJsonLdProductObjects(html);

  if (productObjects.length) {
    const selected = productObjects[0];
    const brandRaw =
      typeof selected.brand === 'string'
        ? selected.brand
        : selected.brand?.name || selected.manufacturer?.name || selected.manufacturer || '';

    const ingredientsRaw =
      selected.ingredients || selected.ingredient || selected.ingredientsText || selected.description || selected.disambiguatingDescription || '';

    return normalizeScrapedProduct(
      {
        barcode,
        name: selected.name || selected.alternateName || `Unknown product (${barcode})`,
        brand: brandRaw || inferBrandFromName(selected.name || ''),
        category: selected.category || 'General',
        ingredients_raw: Array.isArray(ingredientsRaw) ? ingredientsRaw.map((value) => String(value || '').trim()).filter(Boolean) : splitIngredients(ingredientsRaw),
        nutrition_per_100g: parseNutritionFromJsonLd(selected.nutrition || {})
      },
      {
        barcode,
        sourceUrl: url
      }
    );
  }

  const cleanText = stripHtml(html);
  const titleMatch = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? titleCase(titleMatch[1].replace(/\s+/g, ' ').trim()) : `Unknown product (${barcode})`;

  const ingredientMatch = cleanText.match(/ingredients?\s*[:\-]\s*([^\n\.]{10,400})/i);
  const ingredients = ingredientMatch ? splitIngredients(ingredientMatch[1]) : [];
  const nutrition = parseNutritionFromText(cleanText);

  if (!ingredients.length && !Object.keys(nutrition).length) {
    return null;
  }

  return normalizeScrapedProduct(
    {
      barcode,
      name: pageTitle,
      brand: inferBrandFromName(pageTitle),
      category: 'General',
      ingredients_raw: ingredients,
      nutrition_per_100g: nutrition
    },
    {
      barcode,
      sourceUrl: url
    }
  );
}

function getCandidateScrapeUrls({ barcode, queueEntry, allowlist, existing, apiCandidate }) {
  const fromQueue = queueEntry?.candidate_urls || [];
  const fromAllowlistMap = Array.isArray(allowlist.barcode_sources?.[barcode]) ? allowlist.barcode_sources[barcode] : [];
  const fromRecords = [...(existing?.source_urls || []), ...(apiCandidate?.source_urls || [])];

  const candidateUrls = [...new Set([...fromQueue, ...fromAllowlistMap, ...fromRecords].map((url) => String(url || '').trim()).filter(Boolean))];

  return candidateUrls.filter((url) => isDomainAllowlisted(url, allowlist.domains));
}

async function scrapeFallbackCandidate({
  barcode,
  queueEntry,
  allowlist,
  existing,
  apiCandidate,
  fetchImpl,
  nowISO,
  robotsCache,
  requestClock,
  logs
}) {
  const candidateUrls = getCandidateScrapeUrls({ barcode, queueEntry, allowlist, existing, apiCandidate });
  if (!candidateUrls.length) return null;

  const scrapedRecords = [];

  for (const url of candidateUrls) {
    let parsed;
    try {
      const domain = new URL(url).hostname.toLowerCase();
      const robotsAllowed = await isRobotsAllowed(url, {
        fetchImpl,
        timeoutMs: allowlist.timeout_ms,
        userAgent: allowlist.user_agent,
        robotsCache
      });

      if (!robotsAllowed) {
        logs.push({
          ts: nowISO,
          barcode,
          status: 'robots_blocked',
          source: 'scrape',
          url
        });
        continue;
      }

      await enforceRateLimit(domain, allowlist.rate_limit_ms, requestClock);
      const html = await fetchText(url, {
        fetchImpl,
        timeoutMs: allowlist.timeout_ms,
        headers: {
          'User-Agent': allowlist.user_agent,
          Accept: 'text/html'
        }
      });

      if (!html) continue;
      parsed = parseScrapedProductFromHtml(html, { barcode, url });
    } catch {
      parsed = null;
    }

    if (parsed) {
      parsed.last_verified_at = nowISO;
      parsed.fetched_at = nowISO;
      scrapedRecords.push(parsed);
    }
  }

  if (!scrapedRecords.length) return null;

  return scrapedRecords.reduce((accumulator, current) =>
    accumulator ? mergeProductRecords(accumulator, current, { nowISO }) : current
  , null);
}

export async function runIngestion({
  mode = null,
  barcodes = [],
  force = false,
  catalogDir = DEFAULT_CATALOG_DIR,
  dryRun = false,
  fetchImpl = globalThis.fetch,
  now = new Date()
} = {}) {
  if (!fetchImpl) {
    throw new Error('No fetch implementation available.');
  }

  await fs.mkdir(catalogDir, { recursive: true });

  const productsPath = path.join(catalogDir, 'products.json');
  const queuePath = path.join(catalogDir, 'barcode_queue.json');
  const allowlistPath = path.join(catalogDir, 'source_allowlist.json');
  const logPath = path.join(catalogDir, 'ingestion_log.jsonl');

  const nowISO = now.toISOString();
  const nowMillis = now.getTime();

  const existingProducts = await readJsonFile(productsPath, []);
  const queue = normalizeQueue(await readJsonFile(queuePath, { barcodes: [], last_updated: null }));
  const allowlist = normalizeAllowlist(await readJsonFile(allowlistPath, {}));

  const productsMap = toProductMap(existingProducts);
  const args = { mode, barcodes, force };
  const targets = collectTargets({ args, productsMap, queue, now: nowMillis });

  const logs = [];
  const resolvedBarcodes = [];
  const unresolvedBarcodes = [];

  const robotsCache = new Map();
  const requestClock = new Map();

  for (const barcode of targets) {
    const existing = productsMap.get(barcode) || null;
    const queueEntry = getQueueEntry(queue, barcode);

    let apiCandidate = await fetchApiCandidate(barcode, {
      fetchImpl,
      timeoutMs: allowlist.timeout_ms,
      nowISO
    });

    let candidate = apiCandidate;
    let source = apiCandidate ? 'api' : 'none';

    if (!candidate || isProductSparse(candidate)) {
      const scraped = await scrapeFallbackCandidate({
        barcode,
        queueEntry,
        allowlist,
        existing,
        apiCandidate,
        fetchImpl,
        nowISO,
        robotsCache,
        requestClock,
        logs
      });

      if (scraped) {
        candidate = candidate ? mergeProductRecords(candidate, scraped, { nowISO }) : scraped;
        source = candidate.source_origin === 'merged' ? 'merged' : 'scrape';
      }
    }

    if (!candidate) {
      unresolvedBarcodes.push(barcode);
      upsertQueueEntry(queue, barcode, 'unresolved_after_api_and_scrape', 'ingestor');
      logs.push({
        ts: nowISO,
        barcode,
        status: 'unresolved',
        source: 'none',
        message: 'No usable product data from API or scraping fallback.'
      });
      continue;
    }

    const merged = existing ? mergeProductRecords(existing, candidate, { nowISO }) : finalizeProductRecord(candidate, {
      sourceOrigin: candidate.source_origin || 'api',
      nowISO,
      preserveTimestamps: true
    });

    productsMap.set(barcode, merged);
    resolvedBarcodes.push(barcode);

    logs.push({
      ts: nowISO,
      barcode,
      status: 'resolved',
      source,
      score: computeDataCompletenessScore(merged),
      quality_flags: merged.data_quality_flags,
      source_urls: merged.source_urls
    });
  }

  removeQueueEntries(queue, resolvedBarcodes);
  queue.last_updated = nowISO;

  const productsOut = sortedProductsFromMap(productsMap);

  if (!dryRun) {
    await writeJsonFile(productsPath, productsOut);
    await writeJsonFile(queuePath, queue);
    await appendLogLines(logPath, logs);
  }

  return {
    catalogDir,
    mode,
    processed: targets.length,
    resolved: resolvedBarcodes.length,
    unresolved: unresolvedBarcodes.length,
    resolvedBarcodes,
    unresolvedBarcodes,
    dryRun
  };
}

const REGULATORY_ADAPTERS = [
  {
    id: 'fda',
    authority: 'U.S. FDA',
    jurisdiction: 'US',
    endpoint: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts'
  },
  {
    id: 'eu_rasff',
    authority: 'EU RASFF',
    jurisdiction: 'EU',
    endpoint: 'https://food.ec.europa.eu/safety/rasff-food-and-feed-safety-alerts_en'
  },
  {
    id: 'uk_fsa',
    authority: 'UK FSA',
    jurisdiction: 'EU',
    endpoint: 'https://www.food.gov.uk/news-alerts'
  },
  {
    id: 'health_canada',
    authority: 'Health Canada',
    jurisdiction: 'Global',
    endpoint: 'https://www.canada.ca/en/health-canada/services/food-nutrition/food-safety/food-recalls-allergy-alerts.html'
  }
];

function normalizeRegulatoryActionItem(item) {
  const actionTypeRaw = String(item?.action_type || 'update').toLowerCase();
  const actionType = ['ban', 'recall', 'import_refusal', 'alert', 'update'].includes(actionTypeRaw)
    ? actionTypeRaw
    : actionTypeRaw === 'refusal'
      ? 'import_refusal'
      : 'update';
  const status = String(item?.status || '').toLowerCase() === 'confirmed' ? 'confirmed' : 'under_review';
  const sourceUrls = Array.isArray(item?.source_urls) ? item.source_urls.map((url) => String(url || '').trim()).filter(Boolean) : [];
  const confidence = String(item?.confidence || '').toLowerCase().includes('regulator')
    ? 'Regulator Confirmed'
    : String(item?.confidence || '').toLowerCase().includes('independent')
      ? 'Independent Evidence'
      : 'Under Review';

  const safeActionType = status === 'confirmed' ? actionType : actionType === 'ban' ? 'update' : actionType;
  const safeStatus = status === 'confirmed' && sourceUrls.length === 0 ? 'under_review' : status;
  const safeConfidence = safeStatus === 'confirmed' ? confidence : 'Under Review';

  return {
    id: String(item?.id || '').trim(),
    jurisdiction: String(item?.jurisdiction || 'Global').trim() || 'Global',
    authority: String(item?.authority || 'Unknown authority').trim() || 'Unknown authority',
    action_type: safeActionType,
    barcode: item?.barcode ? String(item.barcode).trim() : undefined,
    product_name: String(item?.product_name || '').trim(),
    brand: item?.brand ? String(item.brand).trim() : undefined,
    manufacturer: item?.manufacturer ? String(item.manufacturer).trim() : undefined,
    reason_category: String(item?.reason_category || 'General safety').trim() || 'General safety',
    hazard: String(item?.hazard || 'Not specified').trim() || 'Not specified',
    action_date: String(item?.action_date || '').trim(),
    status: safeStatus,
    source_urls: sourceUrls,
    confidence: safeConfidence
  };
}

function mergeRegulatoryActions(existing, incoming) {
  const byId = new Map();
  for (const item of [...existing, ...incoming]) {
    if (!item?.id) continue;
    const normalized = normalizeRegulatoryActionItem(item);
    if (!normalized.product_name) continue;

    const current = byId.get(normalized.id);
    if (!current) {
      byId.set(normalized.id, normalized);
      continue;
    }

    const currentScore = current.status === 'confirmed' ? 2 : current.confidence === 'Independent Evidence' ? 1 : 0;
    const nextScore = normalized.status === 'confirmed' ? 2 : normalized.confidence === 'Independent Evidence' ? 1 : 0;
    byId.set(normalized.id, nextScore >= currentScore ? normalized : current);
  }

  return [...byId.values()].sort((left, right) => String(right.action_date || '').localeCompare(String(left.action_date || '')));
}

function normalizeRegulatoryLeadFeed(payload) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((entry, index) => normalizeRegulatoryActionItem({
      id: entry?.id || `lead-${index + 1}`,
      jurisdiction: entry?.jurisdiction || 'Global',
      authority: entry?.authority || 'HealthLens lead queue',
      action_type: entry?.action_type || 'update',
      barcode: entry?.barcode,
      product_name: entry?.product_name || entry?.title || '',
      brand: entry?.brand,
      manufacturer: entry?.manufacturer,
      reason_category: entry?.reason_category || 'Unverified external claim',
      hazard: entry?.hazard || 'Pending regulator verification',
      action_date: entry?.action_date || new Date().toISOString().slice(0, 10),
      status: 'under_review',
      source_urls: Array.isArray(entry?.source_urls) ? entry.source_urls : [],
      confidence: 'Under Review'
    }))
    .filter((item) => item.id && item.product_name);
}

async function fetchRegulatoryAdapter(adapter, { fetchImpl, timeoutMs = 6000 }) {
  const payload = await fetchJson(adapter.endpoint, {
    fetchImpl,
    timeoutMs,
    headers: { Accept: 'application/json' }
  });

  if (!payload || typeof payload !== 'object') return [];

  const records = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.results)
      ? payload.results
      : [];

  return records
    .map((entry, index) => normalizeRegulatoryActionItem({
      id: entry?.id || `${adapter.id}-${index + 1}`,
      jurisdiction: entry?.jurisdiction || adapter.jurisdiction,
      authority: entry?.authority || adapter.authority,
      action_type: entry?.action_type || entry?.event_type || 'update',
      barcode: entry?.barcode,
      product_name: entry?.product_name || entry?.title || '',
      brand: entry?.brand,
      manufacturer: entry?.manufacturer,
      reason_category: entry?.reason_category || entry?.category || 'Regulatory update',
      hazard: entry?.hazard || entry?.summary || 'Not specified',
      action_date: entry?.action_date || entry?.date || new Date().toISOString().slice(0, 10),
      status: entry?.status || 'under_review',
      source_urls: Array.isArray(entry?.source_urls) ? entry.source_urls : [adapter.endpoint],
      confidence: entry?.confidence || 'Under Review'
    }))
    .filter((item) => item.id && item.product_name);
}

export async function runRegulatoryIngestion({
  mode = 'daily',
  catalogDir = DEFAULT_CATALOG_DIR,
  dryRun = false,
  fetchImpl = globalThis.fetch,
  now = new Date()
} = {}) {
  if (mode !== 'daily') {
    throw new Error('Only daily regulatory ingestion mode is supported.');
  }

  await fs.mkdir(catalogDir, { recursive: true });

  const nowISO = now.toISOString();
  const actionsPath = path.join(catalogDir, 'regulatory_actions.json');
  const leadsPath = path.join(catalogDir, 'regulatory_leads.json');
  const logPath = path.join(catalogDir, 'regulatory_ingestion_log.jsonl');

  const existing = await readJsonFile(actionsPath, []);
  const leads = normalizeRegulatoryLeadFeed(await readJsonFile(leadsPath, []));
  const logs = [];
  const incoming = [];

  for (const adapter of REGULATORY_ADAPTERS) {
    try {
      const pulled = await fetchRegulatoryAdapter(adapter, { fetchImpl });
      incoming.push(...pulled);
      logs.push({
        ts: nowISO,
        adapter: adapter.id,
        status: 'ok',
        count: pulled.length
      });
    } catch (error) {
      logs.push({
        ts: nowISO,
        adapter: adapter.id,
        status: 'error',
        message: String(error?.message || error || 'adapter_failed')
      });
    }
  }

  if (leads.length) {
    incoming.push(...leads);
    logs.push({
      ts: nowISO,
      adapter: 'lead_queue',
      status: 'ok',
      count: leads.length
    });
  }

  const merged = mergeRegulatoryActions(
    Array.isArray(existing) ? existing.map((item) => normalizeRegulatoryActionItem(item)) : [],
    incoming
  );

  if (!dryRun) {
    await writeJsonFile(actionsPath, merged);
    await appendLogLines(logPath, logs);
  }

  return {
    catalogDir,
    mode,
    records: merged.length,
    incoming: incoming.length,
    dryRun
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.mode && !args.barcodes.length && !args.regulatoryMode) {
    console.error(usage());
    process.exit(1);
  }

  if (args.mode && args.mode !== 'daily') {
    console.error('Only --mode daily is currently supported.');
    process.exit(1);
  }

  if (args.regulatoryMode && args.regulatoryMode !== 'daily') {
    console.error('Only --regulatory-mode daily is currently supported.');
    process.exit(1);
  }

  const result = {};

  if (args.mode || args.barcodes.length) {
    result.catalog = await runIngestion({
      mode: args.mode,
      barcodes: args.barcodes,
      force: args.force,
      catalogDir: args.catalogDir,
      dryRun: args.dryRun
    });
  }

  if (args.regulatoryMode) {
    result.regulatory = await runRegulatoryIngestion({
      mode: args.regulatoryMode,
      catalogDir: args.catalogDir,
      dryRun: args.dryRun
    });
  }

  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
