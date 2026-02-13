import { finalizeProductRecord, mergeProductRecords } from './catalogPipeline.mjs';

const DEFAULT_CATALOG_URL = './catalog/products.json';
const DEFAULT_REGULATORY_ACTIONS_URL = './catalog/regulatory_actions.json';
const INGEST_QUEUE_STORAGE_KEY = 'healthlens.ingestQueue';

function toSeedRecord(product) {
  return finalizeProductRecord(product, {
    sourceOrigin: product?.source_origin || 'seed',
    sourceUrl: 'seed://data.mjs',
    preserveTimestamps: true
  });
}

function safeParseJSON(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return fallback;
  }
}

export async function loadCatalogWithSeedFallback(seedProducts, {
  catalogUrl = DEFAULT_CATALOG_URL
} = {}) {
  const seedRecords = Array.isArray(seedProducts) ? seedProducts.map(toSeedRecord) : [];

  let catalogRecords = [];
  try {
    const response = await fetch(catalogUrl, { cache: 'no-store' });
    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload)) {
        catalogRecords = payload.map((item) =>
          finalizeProductRecord(item, {
            sourceOrigin: item?.source_origin || 'api',
            preserveTimestamps: true
          })
        );
      }
    }
  } catch {
    catalogRecords = [];
  }

  const byBarcode = new Map();
  for (const seed of seedRecords) {
    byBarcode.set(seed.barcode, seed);
  }

  for (const record of catalogRecords) {
    if (!record?.barcode) continue;
    const existing = byBarcode.get(record.barcode);
    if (!existing) {
      byBarcode.set(record.barcode, record);
      continue;
    }

    byBarcode.set(record.barcode, mergeProductRecords(existing, record));
  }

  return [...byBarcode.values()]
    .filter((record) => record?.barcode)
    .sort((a, b) => a.barcode.localeCompare(b.barcode));
}

function normalizeRegulatoryAction(item) {
  const confidence = String(item?.confidence || '').toLowerCase();
  const status = String(item?.status || '').toLowerCase() === 'confirmed' ? 'confirmed' : 'under_review';
  const sourceUrls = Array.isArray(item?.source_urls) ? item.source_urls.map((url) => String(url || '').trim()).filter(Boolean) : [];
  const safeStatus = status === 'confirmed' && sourceUrls.length > 0 ? 'confirmed' : 'under_review';
  const actionType = String(item?.action_type || 'update').trim() || 'update';
  const safeActionType = safeStatus === 'confirmed' ? actionType : actionType === 'ban' ? 'update' : actionType;
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
    confidence:
      safeStatus === 'confirmed' && confidence.includes('regulator')
        ? 'Regulator Confirmed'
        : safeStatus === 'confirmed' && confidence.includes('independent')
          ? 'Independent Evidence'
          : 'Under Review'
  };
}

export async function loadRegulatoryActions({
  actionsUrl = DEFAULT_REGULATORY_ACTIONS_URL
} = {}) {
  try {
    const response = await fetch(actionsUrl, { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json();
    if (!Array.isArray(payload)) return [];
    return payload
      .map((item) => normalizeRegulatoryAction(item))
      .filter((item) => item.id && item.product_name);
  } catch {
    return [];
  }
}

export function readQueuedBarcodes() {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(INGEST_QUEUE_STORAGE_KEY);
  if (!raw) return [];

  const parsed = safeParseJSON(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry) => entry && typeof entry.barcode === 'string');
}

export function writeQueuedBarcodes(entries) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(INGEST_QUEUE_STORAGE_KEY, JSON.stringify(Array.isArray(entries) ? entries : []));
}

export function enqueueBarcodeForIngestion(barcode, {
  reason = 'manual',
  source = 'app',
  candidate_urls = []
} = {}) {
  const normalized = String(barcode || '').trim();
  if (!normalized) return;

  const queue = readQueuedBarcodes();
  const existingIndex = queue.findIndex((entry) => entry.barcode === normalized);
  const nowISO = new Date().toISOString();

  const payload = {
    barcode: normalized,
    reason,
    source,
    queued_at: nowISO,
    candidate_urls: Array.isArray(candidate_urls) ? candidate_urls : []
  };

  if (existingIndex === -1) {
    queue.push(payload);
  } else {
    queue[existingIndex] = {
      ...queue[existingIndex],
      ...payload,
      queued_count: Number(queue[existingIndex].queued_count || 1) + 1
    };
  }

  writeQueuedBarcodes(queue);
}

export function clearQueuedBarcodes() {
  writeQueuedBarcodes([]);
}

export function exportQueuedBarcodes(filename = 'barcode_queue_export.json') {
  if (typeof document === 'undefined') return false;

  const queuePayload = {
    barcodes: readQueuedBarcodes(),
    generated_at: new Date().toISOString()
  };

  const blob = new Blob([`${JSON.stringify(queuePayload, null, 2)}\n`], {
    type: 'application/json'
  });

  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);

  return true;
}
