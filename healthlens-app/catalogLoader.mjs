import { finalizeProductRecord, mergeProductRecords } from './catalogPipeline.mjs';

const DEFAULT_CATALOG_URL = './catalog/products.json';
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
