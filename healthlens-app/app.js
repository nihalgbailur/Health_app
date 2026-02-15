import { COACH_TIPS, PRODUCTS, SOURCE_BADGE_COLORS, WATCHDOG_FEED } from './data.mjs';
import {
  compareProducts,
  evaluateProduct,
  lookupProductByBarcode,
  parseIngredientsInput,
  recommendSwaps,
  validateEvidenceCompleteness
} from './riskEngine.mjs';
import { renderNutritionChipsHTML, renderNutritionLegendHTML, renderNutritionTableHTML } from './nutritionTable.mjs';
import {
  clearQueuedBarcodes,
  enqueueBarcodeForIngestion,
  exportQueuedBarcodes,
  loadAvoidMarkers,
  loadCatalogWithSeedFallback,
  loadRegulatoryActions,
  readQueuedBarcodes
} from './catalogLoader.mjs';
import {
  isProductSparse,
  isProductStale,
  mergeProductRecords,
  normalizeOffProduct
} from './catalogPipeline.mjs';

const storageKeys = {
  savedIds: 'healthlens.savedIds',
  recentChecks: 'healthlens.recentChecks',
  coachIndex: 'healthlens.coachIndex'
};

const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v2/product';
const OPEN_FOOD_FACTS_API_V0 = 'https://world.openfoodfacts.org/api/v0/product';
const LIVE_LOOKUP_TIMEOUT_MS = 4500;
const STALE_REFRESH_HOURS = 24;
const CAMERA_BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

const state = {
  activeTab: 'home',
  catalog: [...PRODUCTS],
  regulatoryActions: [],
  avoidMarkers: [],
  savedIds: new Set(readSavedIds()),
  recentChecks: readRecentChecks(),
  coachIndex: readCoachIndex(),
  lastScan: null,
  deferredInstallPrompt: null,
  isScanning: false,
  camera: {
    isOpen: false,
    targetInput: 'scan',
    stream: null,
    detector: null,
    rafId: 0,
    lastValue: '',
    lastDetectedAt: 0
  }
};

const elements = {
  tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
  panels: Array.from(document.querySelectorAll('.tab-panel')),
  homeScanForm: document.querySelector('#homeScanForm'),
  homeBarcode: document.querySelector('#homeBarcode'),
  scanBarcodeForm: document.querySelector('#scanBarcodeForm'),
  scanBarcode: document.querySelector('#scanBarcode'),
  manualCheckForm: document.querySelector('#manualCheckForm'),
  manualIngredients: document.querySelector('#manualIngredients'),
  scanResult: document.querySelector('#scanResult'),
  homeAlerts: document.querySelector('#homeAlerts'),
  recentList: document.querySelector('#recentList'),
  clearRecentBtn: document.querySelector('#clearRecentBtn'),
  watchdogList: document.querySelector('#watchdogList'),
  avoidSearch: document.querySelector('#avoidSearch'),
  avoidCategoryChips: document.querySelector('#avoidCategoryChips'),
  avoidConfirmedList: document.querySelector('#avoidConfirmedList'),
  avoidReviewList: document.querySelector('#avoidReviewList'),
  avoidReviewPanel: document.querySelector('#avoidReviewPanel'),
  coachTip: document.querySelector('#coachTip'),
  nextTipBtn: document.querySelector('#nextTipBtn'),
  savedList: document.querySelector('#savedList'),
  clearSavedBtn: document.querySelector('#clearSavedBtn'),
  compareLeft: document.querySelector('#compareLeft'),
  compareRight: document.querySelector('#compareRight'),
  runCompareBtn: document.querySelector('#runCompareBtn'),
  compareResult: document.querySelector('#compareResult'),
  installBtn: document.querySelector('#installBtn'),
  queueCount: document.querySelector('#queueCount'),
  exportQueueBtn: document.querySelector('#exportQueueBtn'),
  clearQueueBtn: document.querySelector('#clearQueueBtn'),
  openHomeCameraBtn: document.querySelector('#openHomeCameraBtn'),
  openScanCameraBtn: document.querySelector('#openScanCameraBtn'),
  cameraScannerModal: document.querySelector('#cameraScannerModal'),
  closeCameraScannerBtn: document.querySelector('#closeCameraScannerBtn'),
  useManualBarcodeBtn: document.querySelector('#useManualBarcodeBtn'),
  cameraVideo: document.querySelector('#cameraVideo'),
  cameraStatus: document.querySelector('#cameraStatus'),
  scanIngredientsBtn: document.querySelector('#scanIngredientsBtn'),
  cameraCaptureBtn: document.querySelector('#cameraCaptureBtn')
};

void init();

async function init() {
  const [catalog, regulatoryActions, avoidMarkers] = await Promise.all([
    loadCatalogWithSeedFallback(PRODUCTS),
    loadRegulatoryActions(),
    loadAvoidMarkers()
  ]);
  state.catalog = catalog;
  state.regulatoryActions = regulatoryActions;
  state.avoidMarkers = avoidMarkers;

  bindTabNavigation();
  bindScannerForms();
  bindHomeActions();
  bindAvoidTab();
  bindCoach();
  bindSavedAndCompare();
  bindCameraScanner();
  bindOCR();
  bindPwaInstall();
  registerServiceWorker();

  renderHomeAlerts();
  renderRecentChecks();
  renderWatchdogFeed();
  renderAvoidTab();
  renderCoachTip();
  renderSaved();
  renderCompareSelectors();
  renderQueueState();
}

function bindTabNavigation() {
  elements.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.goTab));
  });
}

function setActiveTab(tabName) {
  if (!tabName) return;
  state.activeTab = tabName;

  elements.tabButtons.forEach((btn) => {
    const active = btn.dataset.goTab === tabName;
    btn.classList.toggle('active', active);
    if (active) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  elements.panels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.tab === tabName);
  });
}

function bindScannerForms() {
  elements.homeScanForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const barcode = elements.homeBarcode.value.trim();
    if (!barcode) {
      void openCameraScanner('home');
      return;
    }
    void runBarcodeScan(barcode);
  });

  elements.scanBarcodeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const barcode = elements.scanBarcode.value.trim();
    if (!barcode) {
      void openCameraScanner('scan');
      return;
    }
    void runBarcodeScan(barcode);
  });

  elements.manualCheckForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const ingredients = parseIngredientsInput(elements.manualIngredients.value);
    if (!ingredients.length) {
      renderManualInputError('Please enter at least one ingredient.');
      return;
    }

    const result = evaluateProduct(null, {
      ingredients,
      manual_input: elements.manualIngredients.value,
      regulatory_actions: state.regulatoryActions,
      avoid_markers: state.avoidMarkers
    });
    completeScan({
      product: null,
      result,
      mode: 'manual',
      manualIngredients: ingredients,
      source: 'manual'
    });
  });

  elements.scanResult.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches('[data-jump-manual]')) {
      focusManualIngredients();
      return;
    }

    if (target.matches('[data-refresh-barcode]')) {
      const refreshCode = target.dataset.refreshBarcode;
      if (refreshCode) void runBarcodeScan(refreshCode);
      return;
    }

    if (target.matches('[data-export-queue]')) {
      exportQueuedBarcodes('barcode_queue.json');
      return;
    }

    if (target.matches('[data-save-product]')) {
      const productId = target.dataset.saveProduct;
      toggleSaved(productId);
      return;
    }

    if (target.matches('[data-swap-product]')) {
      const productId = target.dataset.swapProduct;
      const barcode = getProductById(productId)?.barcode;
      if (barcode) {
        void runBarcodeScan(barcode);
      }
    }
  });
}

function bindHomeActions() {
  elements.clearRecentBtn.addEventListener('click', () => {
    state.recentChecks = [];
    writeRecentChecks(state.recentChecks);
    renderRecentChecks();
  });

  if (elements.exportQueueBtn) {
    elements.exportQueueBtn.addEventListener('click', () => {
      exportQueuedBarcodes('barcode_queue.json');
    });
  }

  if (elements.clearQueueBtn) {
    elements.clearQueueBtn.addEventListener('click', () => {
      clearQueuedBarcodes();
      renderQueueState();
    });
  }

  if (elements.openHomeCameraBtn) {
    elements.openHomeCameraBtn.addEventListener('click', () => {
      void openCameraScanner('home');
    });
  }

  if (elements.openScanCameraBtn) {
    elements.openScanCameraBtn.addEventListener('click', () => {
      void openCameraScanner('scan');
    });
  }
}

function bindAvoidTab() {
  if (elements.avoidSearch) {
    elements.avoidSearch.addEventListener('input', () => {
      renderAvoidTab();
    });
  }

  if (elements.avoidCategoryChips) {
    elements.avoidCategoryChips.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('[data-avoid-category]')) return;

      const category = String(target.dataset.avoidCategory || 'all');
      if (elements.avoidSearch) {
        elements.avoidSearch.dataset.categoryFilter = category;
      }
      renderAvoidTab();
    });
  }
}

function bindCoach() {
  elements.nextTipBtn.addEventListener('click', () => {
    state.coachIndex = (state.coachIndex + 1) % COACH_TIPS.length;
    writeCoachIndex(state.coachIndex);
    renderCoachTip();
  });
}

function bindSavedAndCompare() {
  elements.clearSavedBtn.addEventListener('click', () => {
    state.savedIds = new Set();
    writeSavedIds([]);
    renderSaved();
    renderCompareSelectors();
    elements.compareResult.innerHTML = '';
  });

  elements.runCompareBtn.addEventListener('click', () => {
    const leftId = elements.compareLeft.value;
    const rightId = elements.compareRight.value;

    if (!leftId || !rightId || leftId === rightId) {
      elements.compareResult.innerHTML = '<p class="muted">Pick two different products to compare.</p>';
      return;
    }

    const left = getProductById(leftId);
    const right = getProductById(rightId);

    if (!left || !right) return;
    const comparison = compareProducts(left, right, {
      regulatory_actions: state.regulatoryActions,
      avoid_markers: state.avoidMarkers
    });

    elements.compareResult.innerHTML = renderComparisonHTML(left, right, comparison);
  });
}

function bindPwaInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    elements.installBtn.hidden = false;
  });

  elements.installBtn.addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    elements.installBtn.hidden = true;
  });
}

function bindCameraScanner() {
  if (!elements.cameraScannerModal) return;

  if (elements.closeCameraScannerBtn) {
    elements.closeCameraScannerBtn.addEventListener('click', () => {
      closeCameraScanner();
    });
  }

  if (elements.useManualBarcodeBtn) {
    elements.useManualBarcodeBtn.addEventListener('click', () => {
      const target = state.camera.targetInput === 'home' ? 'home' : 'scan';
      closeCameraScanner();
      focusBarcodeInput(target);
    });
  }

  elements.cameraScannerModal.addEventListener('click', (event) => {
    if (event.target === elements.cameraScannerModal) {
      closeCameraScanner();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.camera.isOpen) {
      closeCameraScanner();
    }
  });

  if (elements.cameraCaptureBtn) {
    elements.cameraCaptureBtn.addEventListener('click', () => {
      void captureAndOCR();
    });
  }
}

function bindOCR() {
  if (elements.scanIngredientsBtn) {
    elements.scanIngredientsBtn.addEventListener('click', () => {
      void openCameraScanner('ingredients');
    });
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      // No-op for prototype mode.
    });
  }
}

function focusBarcodeInput(targetInput = 'scan') {
  const target = targetInput === 'home' ? 'home' : 'scan';
  setActiveTab(target);
  const input = target === 'home' ? elements.homeBarcode : elements.scanBarcode;
  input?.focus();
}

function setCameraStatus(message, isError = false) {
  if (!elements.cameraStatus) return;
  elements.cameraStatus.textContent = message;
  elements.cameraStatus.classList.toggle('camera-status-error', isError);
}

function normalizeScannedBarcode(rawValue) {
  const cleaned = String(rawValue || '')
    .replace(/\s+/g, '')
    .replace(/[^0-9A-Za-z]/g, '')
    .trim();
  if (!cleaned) return '';
  if (/^\d{8,14}$/.test(cleaned)) return cleaned;
  return cleaned.length >= 8 ? cleaned : '';
}

async function createBarcodeDetector() {
  if (!('BarcodeDetector' in window)) return null;

  try {
    if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = CAMERA_BARCODE_FORMATS.filter((format) => supported.includes(format));
      if (formats.length) {
        return new window.BarcodeDetector({ formats });
      }
    }
    return new window.BarcodeDetector();
  } catch {
    return null;
  }
}

function stopCameraStream() {
  if (state.camera.stream) {
    for (const track of state.camera.stream.getTracks()) {
      track.stop();
    }
    state.camera.stream = null;
  }

  if (elements.cameraVideo?.srcObject) {
    elements.cameraVideo.srcObject = null;
  }
}

function closeCameraScanner() {
  if (state.camera.rafId) {
    cancelAnimationFrame(state.camera.rafId);
  }

  state.camera.rafId = 0;
  state.camera.isOpen = false;
  state.camera.detector = null;
  state.camera.lastValue = '';
  stopCameraStream();

  if (elements.cameraScannerModal) {
    elements.cameraScannerModal.hidden = true;
  }
  document.body.classList.remove('camera-open');
}

async function finalizeCameraBarcode(rawValue) {
  const normalized = normalizeScannedBarcode(rawValue);
  if (!normalized) return;

  const now = Date.now();
  if (state.camera.lastValue === normalized && now - state.camera.lastDetectedAt < 1400) {
    return;
  }

  state.camera.lastValue = normalized;
  state.camera.lastDetectedAt = now;
  setCameraStatus(`Captured ${normalized}. Checking now...`);
  closeCameraScanner();

  elements.homeBarcode.value = normalized;
  elements.scanBarcode.value = normalized;
  await runBarcodeScan(normalized);
}

async function runCameraDetectionLoop() {
  if (!state.camera.isOpen || !state.camera.detector || !elements.cameraVideo) return;

  try {
    if (elements.cameraVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const detected = await state.camera.detector.detect(elements.cameraVideo);
      const firstHit = detected
        .map((entry) => normalizeScannedBarcode(entry?.rawValue))
        .find((value) => Boolean(value));

      if (firstHit) {
        await finalizeCameraBarcode(firstHit);
        return;
      }
    }
  } catch {
    // Keep looping; camera frames may fail intermittently on some devices.
  }

  state.camera.rafId = requestAnimationFrame(() => {
    void runCameraDetectionLoop();
  });
}

async function openCameraScanner(targetInput = 'scan') {
  if (state.camera.isOpen) return;
  state.camera.targetInput = targetInput;

  if (!window.isSecureContext && location.hostname !== 'localhost') {
    renderManualInputError('Camera scan requires HTTPS. Open this app on a secure URL and try again.');
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    renderManualInputError('Camera is not available in this browser. Enter barcode manually.');
    return;
  }

  state.camera.targetInput = targetInput;
  state.camera.isOpen = true;
  state.camera.lastDetectedAt = 0;
  state.camera.lastValue = '';

  const isOCR = targetInput === 'ingredients';
  if (elements.cameraCaptureBtn) elements.cameraCaptureBtn.hidden = !isOCR;
  if (elements.useManualBarcodeBtn) elements.useManualBarcodeBtn.hidden = isOCR;

  if (elements.cameraScannerModal) {
    elements.cameraScannerModal.hidden = false;
  }
  document.body.classList.add('camera-open');
  setCameraStatus('Requesting camera permission...');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    state.camera.stream = stream;

    if (!elements.cameraVideo) {
      throw new Error('Camera video element missing.');
    }

    elements.cameraVideo.srcObject = stream;
    await elements.cameraVideo.play();

    const detector = await createBarcodeDetector();
    if (!detector) {
      stopCameraStream();
      setCameraStatus('Live barcode detection is not supported on this browser. Use manual barcode entry.', true);
      return;
    }

    state.camera.detector = detector;
    state.camera.detector = detector;

    if (isOCR) {
      setCameraStatus('Point camera at INGREDIENTS list and tap Capture.');
    } else {
      setCameraStatus('Point camera at barcode. Capture happens automatically.');
      state.camera.rafId = requestAnimationFrame(() => {
        void runCameraDetectionLoop();
      });
    }
  } catch {
    closeCameraScanner();
    renderManualInputError('Camera permission was blocked or unavailable. Enable camera access and retry.');
  }
}

async function runBarcodeScan(barcode) {
  if (!barcode) {
    renderManualInputError('Enter a barcode first.');
    return;
  }

  if (state.isScanning) return;
  state.isScanning = true;
  renderScanningState(barcode);

  try {
    const localProduct = lookupProductByBarcode(barcode, state.catalog);
    if (localProduct) {
      let selectedProduct = localProduct;
      let selectedSource = sourceFromProductRecord(localProduct);

      if (shouldRefreshFromLive(localProduct)) {
        const refreshedLiveProduct = await fetchLiveProductByBarcode(barcode);
        if (refreshedLiveProduct) {
          const mergedRecord = mergeProductRecords(localProduct, refreshedLiveProduct);
          upsertCatalogProduct(mergedRecord);
          selectedProduct = mergedRecord;
          selectedSource = sourceFromProductRecord(mergedRecord, true);
        } else if (isProductSparse(localProduct)) {
          queueBarcodeForIngestion(barcode, 'local_sparse_needs_scrape');
          selectedSource = 'queued-scrape';
        }
      }

      const result = evaluateProduct(selectedProduct, {
        regulatory_actions: state.regulatoryActions,
        avoid_markers: state.avoidMarkers
      });
      completeScan({
        product: selectedProduct,
        result,
        mode: 'barcode-hit',
        barcode,
        source: selectedSource
      });
      return;
    }

    const liveProduct = await fetchLiveProductByBarcode(barcode);
    if (liveProduct) {
      upsertCatalogProduct(liveProduct);

      let selectedSource = 'api';
      if (isProductSparse(liveProduct)) {
        queueBarcodeForIngestion(barcode, 'api_sparse_needs_scrape');
      }

      const result = evaluateProduct(liveProduct, {
        regulatory_actions: state.regulatoryActions,
        avoid_markers: state.avoidMarkers
      });
      completeScan({
        product: liveProduct,
        result,
        mode: 'barcode-hit',
        barcode,
        source: selectedSource
      });
      return;
    }

    queueBarcodeForIngestion(barcode, 'api_miss_needs_scrape');
    const result = evaluateProduct(null, {
      ingredients: [],
      regulatory_actions: state.regulatoryActions,
      avoid_markers: state.avoidMarkers
    });
    completeScan({
      product: null,
      result,
      mode: 'barcode-miss',
      barcode,
      source: 'queued-scrape'
    });
  } finally {
    state.isScanning = false;
  }
}

function renderScanningState(barcode) {
  setActiveTab('scan');
  elements.scanResult.classList.remove('empty-state');
  elements.scanResult.innerHTML = `
    <h3>Checking barcode...</h3>
    <p class="meta">Searching catalog, then API lookup for ${escapeHTML(barcode)}. If still sparse, this barcode will be queued for allowlist scraping refresh.</p>
  `;
}

async function fetchLiveProductByBarcode(barcode) {
  const v2Product = await fetchFromEndpoint(`${OPEN_FOOD_FACTS_API}/${encodeURIComponent(barcode)}.json`, barcode);
  const v0Product = await fetchFromEndpoint(`${OPEN_FOOD_FACTS_API_V0}/${encodeURIComponent(barcode)}.json`, barcode);

  if (!v2Product) return v0Product;
  if (!v0Product) return v2Product;
  return mergeProductRecords(v2Product, v0Product);
}

async function fetchFromEndpoint(url, barcode) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return null;

    const payload = await response.json();
    if (payload?.status !== 1 || !payload.product) return null;
    return normalizeOffProduct(payload.product, {
      barcode,
      sourceUrl: url
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function shouldRefreshFromLive(product) {
  if (!product) return false;
  return isProductSparse(product) || isProductStale(product, STALE_REFRESH_HOURS);
}

function focusManualIngredients() {
  elements.manualIngredients.scrollIntoView({ behavior: 'smooth', block: 'center' });
  elements.manualIngredients.focus();
}

function queueBarcodeForIngestion(barcode, reason) {
  enqueueBarcodeForIngestion(barcode, {
    reason,
    source: 'scanner'
  });
  renderQueueState();
}

function renderQueueState() {
  const queued = readQueuedBarcodes();
  if (elements.queueCount) {
    elements.queueCount.textContent = `${queued.length} queued`;
  }
  if (elements.exportQueueBtn) {
    elements.exportQueueBtn.disabled = queued.length === 0;
  }
}

function upsertCatalogProduct(product) {
  const existingIndex = state.catalog.findIndex((entry) => entry.id === product.id || entry.barcode === product.barcode);
  if (existingIndex === -1) {
    state.catalog.push(product);
    return;
  }
  state.catalog[existingIndex] = mergeProductRecords(state.catalog[existingIndex], product);
}

function getProductById(productId) {
  return state.catalog.find((product) => product.id === productId);
}

function getEvidencePolicyLabel(result) {
  const gatedSignals = result.risk_signals.filter((signal) => signal.severity === 'High' || signal.severity === 'Moderate');
  if (!gatedSignals.length) return 'not required for this scan';
  return validateEvidenceCompleteness(result) ? 'complete' : 'needs review';
}

function sourceFromProductRecord(product, refreshed = false) {
  const origin = String(product?.source_origin || '').toLowerCase();
  if (origin === 'merged') return 'merged';
  if (origin === 'scrape') return 'scrape-fallback';
  if (origin === 'api') return refreshed ? 'api-refreshed' : 'api-cached';
  if (origin === 'seed') return 'seed-catalog';
  return refreshed ? 'api-refreshed' : 'api';
}

function getSourceLabel(source) {
  if (source === 'api') return 'API lookup';
  if (source === 'api-cached') return 'API cached';
  if (source === 'api-refreshed') return 'API refreshed';
  if (source === 'scrape-fallback') return 'Scrape fallback';
  if (source === 'merged') return 'Merged (API + scrape)';
  if (source === 'seed-catalog') return 'Seed catalog';
  if (source === 'queued-scrape') return 'Queued for scraping pipeline';
  return 'Manual input';
}

function completeScan(scanPayload) {
  state.lastScan = scanPayload;
  setActiveTab('scan');
  renderScanResult();

  const label = scanPayload.product
    ? `${scanPayload.product.name} (${scanPayload.product.brand})${['api', 'api-cached', 'api-refreshed', 'merged', 'scrape-fallback'].includes(scanPayload.source) ? ' [Catalog]' : ''}`
    : scanPayload.mode === 'manual'
      ? 'Manual ingredient check'
      : `Unknown barcode: ${scanPayload.barcode}`;

  prependRecentCheck({
    label,
    severity: scanPayload.result.severity,
    at: new Date().toISOString(),
    productId: scanPayload.product?.id || null
  });
}

function renderScanResult() {
  if (!state.lastScan) return;

  const { product, result, mode, manualIngredients, barcode, source } = state.lastScan;
  const guardrailVerdict = result.global_guardrail_verdict || result.severity;
  const severityClass = guardrailVerdict.toLowerCase();
  const evidencePolicyLabel = getEvidencePolicyLabel(result);
  const confidenceSummary = renderConfidenceSummary(result);
  const regulatoryActions = renderRegulatoryActions(result.regulatory_action_matches || []);
  const avoidBanner = renderAvoidBanner(result);

  const swaps = product
    ? recommendSwaps(state.catalog, product, result, {
      regulatory_actions: state.regulatoryActions,
      avoid_markers: state.avoidMarkers
    })
    : [];
  const swapHTML = swaps.length
    ? `<ul class="swap-list">${swaps
      .map((swap) => {
        const candidate = getProductById(swap.candidate_product_id);
        if (!candidate) return '';
        return `<li>
              <strong>${escapeHTML(candidate.name)}</strong>
              <p class="meta">${escapeHTML(candidate.brand)} • ${escapeHTML(candidate.category)}</p>
              <p>${escapeHTML(swap.reason_codes.join(' | '))}</p>
              <button type="button" class="secondary-btn" data-swap-product="${candidate.id}">View swap</button>
            </li>`;
      })
      .join('')}</ul>`
    : '<p class="meta">No safer swap found yet in this category.</p>';

  const headerTitle = product
    ? `${escapeHTML(product.name)} • ${escapeHTML(product.brand)}`
    : mode === 'manual'
      ? 'Manual ingredient result'
      : `Unknown product (${escapeHTML(barcode || '-')})`;

  const ingredientsPreview = product
    ? product.ingredients_raw
    : manualIngredients || [];
  const needsManualAssist = Boolean(product && isProductSparse(product));

  elements.scanResult.classList.remove('empty-state');
  elements.scanResult.innerHTML = `
    <div class="result-grid">
      <div>
        <div class="badge-row">
          <span class="badge ${severityClass}">${guardrailVerdict}</span>
          <span class="meta">Global guardrail verdict • Evidence policy: ${escapeHTML(evidencePolicyLabel)} • Confidence: ${escapeHTML(String(result.overall_confidence || 'low').toUpperCase())}</span>
        </div>
        <h3>${headerTitle}</h3>
        <p>${escapeHTML(result.summary)}</p>
        <p class="meta" style="margin-top:8px;">Ingredients: ${escapeHTML(ingredientsPreview.join(', ') || 'Not available')}</p>
        ${source
      ? `<p class="meta" style="margin-top:6px;">Source: ${escapeHTML(getSourceLabel(source))}</p>`
      : ''
    }
        ${needsManualAssist
      ? `<div class="stack-item" style="margin-top:10px;">
                 <p><strong>Need a stronger result?</strong></p>
                 <p class="meta">This record has limited label data. Add ingredients from the product pack to unlock better risk detection.</p>
                 <div class="badge-row" style="margin-top:8px;">
                   <button type="button" class="secondary-btn" data-jump-manual="1">Add ingredients manually</button>
                   ${barcode ? `<button type="button" class="ghost-btn" data-refresh-barcode="${escapeAttr(barcode)}">Refresh lookup</button>` : ''}
                   <button type="button" class="ghost-btn" data-export-queue="1">Export queue</button>
                 </div>
               </div>`
      : ''
    }
      </div>

      ${product ? `<button type="button" class="secondary-btn" data-save-product="${product.id}">${state.savedIds.has(product.id) ? 'Remove from saved' : 'Save product'}</button>` : ''}

      <div>
        <h3>Avoid check</h3>
        ${avoidBanner}
      </div>

      <div>
        <h3>Risk signals</h3>
        ${renderRiskSignals(result.risk_signals)}
      </div>

      <div>
        <h3>Framework breakdown</h3>
        ${renderFrameworkBreakdown(result.framework_verdicts || [])}
      </div>

      <div>
        <h3>Why this confidence?</h3>
        ${confidenceSummary}
      </div>

      <div>
        <h3>Regulatory actions</h3>
        ${regulatoryActions}
      </div>

      <div>
        <h3>Nutrition traffic light (per 100g)</h3>
        <p class="meta">Profile: ${escapeHTML(result.rules_profile_id || 'global_guardrail_v1')} • Rules v${escapeHTML(result.rules_version || '1.0.0')}</p>
        ${renderNutritionLegendHTML(escapeHTML)}
        ${renderNutritionChipsHTML(result.nutrition_assessment, escapeHTML)}
        ${renderNutritionTableHTML(result.nutrition_assessment, escapeHTML)}
      </div>

      <div>
        <h3>Evidence cards</h3>
        ${renderEvidence(result.risk_signals)}
      </div>

      <div>
        <h3>Safer swaps</h3>
        ${swapHTML}
      </div>

      <p class="meta">
        This result aggregates international health frameworks because enforcement and labeling practices vary by market.
      </p>
      <p class="meta">
        This list aggregates international evidence and regulator actions; entries without authority confirmation are labeled Under Review.
      </p>
      <p class="meta">
        Informational only, not medical or legal advice. Risk signals are evidence-driven and may include under-review findings when regulator confirmation is pending.
      </p>
    </div>
  `;
}

function renderRiskSignals(signals) {
  if (!signals.length) {
    return '<p class="meta">No high-confidence risk signals were detected from current rules.</p>';
  }

  return `<ul class="signal-list">${signals
    .map((signal) => {
      const sev = signal.severity.toLowerCase();
      return `<li>
          <div class="badge-row"><span class="badge ${sev}">${signal.severity}</span><span class="meta">Confidence ${(signal.confidence * 100).toFixed(0)}%</span></div>
          <p><strong>${escapeHTML(signal.ingredient_or_issue)}</strong></p>
          <p>${escapeHTML(signal.explanation_short)}</p>
        </li>`;
    })
    .join('')}</ul>`;
}

function renderFrameworkBreakdown(frameworkVerdicts) {
  if (!frameworkVerdicts.length) {
    return '<p class="meta">Framework verdicts unavailable for this scan.</p>';
  }

  return `<details class="framework-breakdown" open>
    <summary>Open framework verdicts</summary>
    <ul class="framework-list">${frameworkVerdicts
      .map((framework) => {
        const severityClass = String(framework.severity || 'Unknown').toLowerCase();
        const unknownNotes = Array.isArray(framework.unknown_reasons) && framework.unknown_reasons.length
          ? `<p class="meta">Unknown reasons: ${escapeHTML(framework.unknown_reasons.join(', '))}</p>`
          : '';
        const triggered = Array.isArray(framework.triggered_rules) && framework.triggered_rules.length
          ? `<p class="meta">Triggered rules: ${escapeHTML(framework.triggered_rules.join(', '))}</p>`
          : '<p class="meta">No triggered high/moderate rule in this framework.</p>';

        return `<li>
          <div class="badge-row">
            <span class="badge ${severityClass}">${escapeHTML(framework.severity || 'Unknown')}</span>
            <span class="meta">${escapeHTML(framework.framework_name || framework.framework_id || 'Framework')}</span>
          </div>
          ${triggered}
          ${unknownNotes}
        </li>`;
      })
      .join('')}</ul>
  </details>`;
}

function confidenceToneLabel(level) {
  const normalized = String(level || '').toLowerCase();
  if (normalized === 'high') return 'Regulator Confirmed';
  if (normalized === 'medium') return 'Independent Evidence';
  return 'Under Review';
}

function renderConfidenceSummary(result) {
  const level = String(result?.overall_confidence || 'low').toLowerCase();
  const notes = Array.isArray(result?.confidence_notes) ? result.confidence_notes : [];
  const label = confidenceToneLabel(level);
  const levelClass = level === 'high' ? 'low' : level === 'medium' ? 'moderate' : 'unknown';

  return `<div class="stack-item">
    <div class="badge-row">
      <span class="badge ${levelClass}">${escapeHTML(level.toUpperCase())}</span>
      <span class="meta">${escapeHTML(label)}</span>
    </div>
    ${notes.length
      ? `<ul class="meta-list">${notes.map((note) => `<li>${escapeHTML(note)}</li>`).join('')}</ul>`
      : '<p class="meta">Confidence notes unavailable for this scan.</p>'
    }
  </div>`;
}

function renderRegulatoryActions(actions) {
  if (!actions.length) {
    return '<p class="meta">No regulator action match found for this scan.</p>';
  }

  return `<ul class="evidence-list">${actions
    .map((action) => {
      const confidenceColor = SOURCE_BADGE_COLORS[action.confidence] || '#334';
      const stateLabel = action.status === 'confirmed' ? 'Confirmed' : 'Under Review';
      const stateClass = action.status === 'confirmed' ? 'low' : 'unknown';
      const actionLabel = String(action.action_type || 'update').replaceAll('_', ' ').toUpperCase();
      const links = Array.isArray(action.source_urls) && action.source_urls.length
        ? action.source_urls.map((url) => `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">Source</a>`).join(' • ')
        : '<span class="meta">No source link available</span>';

      return `<li>
        <div class="badge-row">
          <span class="badge source" style="background:${confidenceColor}">${escapeHTML(action.confidence || 'Under Review')}</span>
          <span class="badge ${stateClass}">${escapeHTML(stateLabel)}</span>
          <span class="meta">${escapeHTML(action.authority || 'Authority')} • ${escapeHTML(action.action_date || 'Date unknown')}</span>
        </div>
        <p><strong>${escapeHTML(action.product_name || 'Regulatory action')}</strong></p>
        <p class="meta">${escapeHTML(actionLabel)} • ${escapeHTML(action.reason_category || 'General safety')}</p>
        <p>${escapeHTML(action.hazard || 'Hazard details unavailable.')}</p>
        <p class="meta">${links}</p>
      </li>`;
    })
    .join('')}</ul>`;
}

function renderAvoidBanner(result) {
  const verdict = String(result?.avoid_verdict || 'Unknown');
  const verdictClass =
    verdict === 'Avoid'
      ? 'high'
      : verdict === 'Caution'
        ? 'moderate'
        : verdict === 'None'
          ? 'low'
          : 'unknown';
  const matches = Array.isArray(result?.avoid_matches) ? result.avoid_matches : [];
  const notes = Array.isArray(result?.avoid_notes) ? result.avoid_notes : [];

  if (!matches.length) {
    return `<div class="stack-item avoid-banner ${verdictClass}">
      <div class="badge-row">
        <span class="badge ${verdictClass}">${escapeHTML(verdict)}</span>
        <span class="meta">Avoid-track status</span>
      </div>
      <p class="meta">${escapeHTML(notes[0] || 'No avoid marker matched this scan.')}</p>
    </div>`;
  }

  const markerList = matches
    .slice(0, 6)
    .map((match) => `<li>${escapeHTML(match.display_name)}</li>`)
    .join('');

  return `<div class="stack-item avoid-banner ${verdictClass}">
    <div class="badge-row">
      <span class="badge ${verdictClass}">${escapeHTML(verdict)}</span>
      <span class="meta">Name-only quick list</span>
    </div>
    <ul class="meta-list">${markerList}</ul>
    ${notes.length
      ? `<p class="meta">${escapeHTML(notes[0])}</p>`
      : ''
    }
  </div>`;
}

function markerMatchesQuery(marker, searchTerm) {
  if (!searchTerm) return true;
  const haystack = `${marker.display_name} ${marker.aliases.join(' ')} ${marker.category}`.toLowerCase();
  return haystack.includes(searchTerm);
}

function toCategoryLabel(category) {
  if (!category) return 'Other';
  const words = String(category).split('_');
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function renderAvoidMarkerCard(marker) {
  const sourceColor = SOURCE_BADGE_COLORS[marker.verification_state] || '#334';
  const severityClass = marker.severity === 'High' ? 'high' : marker.severity === 'Moderate' ? 'moderate' : 'low';
  const links = marker.source_urls.length
    ? marker.source_urls
      .map((url) => `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">Source</a>`)
      .join(' • ')
    : '<span class="meta">No source links</span>';

  return `<li class="stack-item avoid-marker">
    <div class="badge-row">
      <span class="badge source" style="background:${sourceColor}">${escapeHTML(marker.verification_state)}</span>
      <span class="badge ${severityClass}">${escapeHTML(marker.severity)}</span>
      <span class="meta">${escapeHTML(toCategoryLabel(marker.category))}</span>
    </div>
    <p><strong>${escapeHTML(marker.display_name)}</strong></p>
    <p class="meta">${links}</p>
  </li>`;
}

function renderAvoidTab() {
  if (!elements.avoidConfirmedList || !elements.avoidReviewList) return;
  const searchTerm = String(elements.avoidSearch?.value || '')
    .toLowerCase()
    .trim();
  const selectedCategory = String(elements.avoidSearch?.dataset.categoryFilter || 'all').toLowerCase();

  const categories = ['all', ...new Set((state.avoidMarkers || []).map((marker) => String(marker.category || 'other').toLowerCase()))];
  if (elements.avoidCategoryChips) {
    elements.avoidCategoryChips.innerHTML = categories
      .map((category) => {
        const active = category === selectedCategory;
        return `<button type="button" class="${active ? 'secondary-btn' : 'ghost-btn'} avoid-chip" data-avoid-category="${escapeAttr(category)}" data-category="${escapeAttr(category)}">${escapeHTML(
          toCategoryLabel(category)
        )}</button>`;
      })
      .join('');
  }

  const filtered = (state.avoidMarkers || [])
    .filter((marker) => (selectedCategory === 'all' ? true : String(marker.category || '').toLowerCase() === selectedCategory))
    .filter((marker) => markerMatchesQuery(marker, searchTerm))
    .sort((left, right) => {
      const severityRank = { High: 3, Moderate: 2, Low: 1 };
      const delta = (severityRank[right.severity] || 1) - (severityRank[left.severity] || 1);
      if (delta !== 0) return delta;
      return String(left.display_name || '').localeCompare(String(right.display_name || ''));
    });

  const confirmed = filtered.filter((marker) => marker.verification_state === 'Regulator Confirmed');
  const review = filtered.filter((marker) => marker.verification_state !== 'Regulator Confirmed');

  elements.avoidConfirmedList.innerHTML = confirmed.length
    ? confirmed.map((marker) => renderAvoidMarkerCard(marker)).join('')
    : '<li class="stack-item"><p class="meta">No confirmed marker in this filter.</p></li>';

  elements.avoidReviewList.innerHTML = review.length
    ? review.map((marker) => renderAvoidMarkerCard(marker)).join('')
    : '<li class="stack-item"><p class="meta">No under-review marker in this filter.</p></li>';

  if (elements.avoidReviewPanel) {
    elements.avoidReviewPanel.open = Boolean(review.length);
  }
}

function renderEvidence(signals) {
  const evidence = signals
    .flatMap((signal) => signal.evidence || [])
    .filter((card, index, arr) => arr.findIndex((x) => x.id === card.id) === index);

  if (!evidence.length) {
    return '<p class="meta">No evidence cards available for this scan yet.</p>';
  }

  return `<ul class="evidence-list">${evidence
    .map((card) => {
      const sourceColor = SOURCE_BADGE_COLORS[card.source_type] || '#334';
      return `<li>
          <div class="badge-row"><span class="badge source" style="background:${sourceColor}">${escapeHTML(card.source_type)}</span><span class="meta">${escapeHTML(card.jurisdiction)} • ${escapeHTML(card.publication_date)}</span></div>
          <p><strong>${escapeHTML(card.title)}</strong></p>
          <p class="meta">Strength: ${escapeHTML(card.strength_level)}</p>
          <p><a href="${escapeAttr(card.source_url)}" target="_blank" rel="noreferrer">Open source</a></p>
        </li>`;
    })
    .join('')}</ul>`;
}

function renderHomeAlerts() {
  const top = WATCHDOG_FEED.slice(0, 3);
  elements.homeAlerts.innerHTML = top
    .map(
      (item) => `<li class="stack-item">
        <p><strong>${escapeHTML(item.title)}</strong></p>
        <p class="meta">${escapeHTML(item.geography)} • ${escapeHTML(item.event_type.toUpperCase())} • ${escapeHTML(item.date)}</p>
      </li>`
    )
    .join('');
}

function renderWatchdogFeed() {
  elements.watchdogList.innerHTML = WATCHDOG_FEED.map((item) => {
    const badgeClass = item.event_type === 'ban' || item.event_type === 'recall' ? 'high' : item.event_type === 'refusal' ? 'moderate' : 'unknown';
    const links = item.source_links
      .map((link) => `<a href="${escapeAttr(link)}" target="_blank" rel="noreferrer">Source</a>`)
      .join(' • ');

    return `<li class="stack-item">
      <div class="badge-row">
        <span class="badge ${badgeClass}">${escapeHTML(item.event_type.toUpperCase())}</span>
        <span class="meta">${escapeHTML(item.geography)} • ${escapeHTML(item.date)}</span>
      </div>
      <p><strong>${escapeHTML(item.title)}</strong></p>
      <p>${escapeHTML(item.summary)}</p>
      <p class="meta">${links}</p>
    </li>`;
  }).join('');
}

function renderCoachTip() {
  const tip = COACH_TIPS[state.coachIndex % COACH_TIPS.length];
  elements.coachTip.innerHTML = `
    <p class="meta">Daily nudge</p>
    <h3>${escapeHTML(tip.title)}</h3>
    <p>${escapeHTML(tip.text)}</p>
  `;
}

function renderSaved() {
  const savedProducts = state.catalog.filter((p) => state.savedIds.has(p.id));
  if (!savedProducts.length) {
    elements.savedList.innerHTML = `
      <li class="empty-state saved-empty">
        <h3>No saved products</h3>
        <p class="meta">Your saved collection is empty. Bookmark products from scan results to see them here.</p>
      </li>`;
    return;
  }

  elements.savedList.innerHTML = savedProducts
    .map((product) => {
      const result = evaluateProduct(product, {
        regulatory_actions: state.regulatoryActions,
        avoid_markers: state.avoidMarkers
      });
      return `<li class="stack-item">
        <div class="section-head">
          <p><strong>${escapeHTML(product.name)}</strong></p>
          <span class="badge ${result.severity.toLowerCase()}">${result.severity}</span>
        </div>
        <p class="meta">${escapeHTML(product.brand)} • ${escapeHTML(product.category)}</p>
        <div class="badge-row" style="margin-top:10px;">
          <button type="button" class="secondary-btn" data-swap-product="${product.id}">Open in scanner</button>
          <button type="button" class="ghost-btn" data-save-product="${product.id}">Remove</button>
        </div>
      </li>`;
    })
    .join('');

  elements.savedList.querySelectorAll('[data-save-product]').forEach((button) => {
    button.addEventListener('click', () => toggleSaved(button.dataset.saveProduct));
  });

  elements.savedList.querySelectorAll('[data-swap-product]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.swapProduct;
      const barcode = getProductById(id)?.barcode;
      if (barcode) void runBarcodeScan(barcode);
    });
  });
}

function renderCompareSelectors() {
  const savedProducts = state.catalog.filter((p) => state.savedIds.has(p.id));
  const options = ['<option value="">Select product</option>']
    .concat(savedProducts.map((p) => `<option value="${p.id}">${escapeHTML(p.name)} (${escapeHTML(p.brand)})</option>`))
    .join('');

  elements.compareLeft.innerHTML = options;
  elements.compareRight.innerHTML = options;
}

function renderComparisonHTML(leftProduct, rightProduct, comparison) {
  const recommendation = comparison.recommendedProductId === leftProduct.id ? leftProduct : rightProduct;

  return `
    <div class="card" style="padding:12px; border-radius:14px;">
      <p><strong>Recommended:</strong> ${escapeHTML(recommendation.name)}</p>
      <p class="meta">Based on current risk score and nutrition red-flag count.</p>
      <div class="compare-grid">
        ${comparison.nutrientDiff
      .map(
        (diff) => `<div class="compare-row">
              <span>${escapeHTML(diff.nutrient)}</span>
              <span>${escapeHTML(leftProduct.name)}: ${diff.left_value}</span>
              <span>${escapeHTML(rightProduct.name)}: ${diff.right_value}</span>
            </div>`
      )
      .join('')}
      </div>
    </div>
  `;
}

function renderRecentChecks() {
  if (!state.recentChecks.length) {
    elements.recentList.innerHTML = '<li class="stack-item"><p class="meta">No scans yet.</p></li>';
    return;
  }

  elements.recentList.innerHTML = state.recentChecks
    .map(
      (item) => `<li class="stack-item">
        <div class="section-head">
          <p>${escapeHTML(item.label)}</p>
          <span class="badge ${item.severity.toLowerCase()}">${escapeHTML(item.severity)}</span>
        </div>
        <p class="meta">${new Date(item.at).toLocaleString()}</p>
      </li>`
    )
    .join('');
}

function prependRecentCheck(entry) {
  state.recentChecks = [entry, ...state.recentChecks].slice(0, 8);
  writeRecentChecks(state.recentChecks);
  renderRecentChecks();
}

function toggleSaved(productId) {
  if (!productId) return;

  if (state.savedIds.has(productId)) {
    state.savedIds.delete(productId);
  } else {
    state.savedIds.add(productId);
  }

  writeSavedIds(Array.from(state.savedIds));
  renderSaved();
  renderCompareSelectors();
  renderScanResult();
}

function renderManualInputError(message) {
  elements.scanResult.classList.remove('empty-state');
  elements.scanResult.innerHTML = `<h3>Input needed</h3><p class="meta">${escapeHTML(message)}</p>`;
  setActiveTab('scan');
}

function readSavedIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKeys.savedIds) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSavedIds(ids) {
  localStorage.setItem(storageKeys.savedIds, JSON.stringify(ids));
}

function readRecentChecks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKeys.recentChecks) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecentChecks(entries) {
  localStorage.setItem(storageKeys.recentChecks, JSON.stringify(entries));
}

function readCoachIndex() {
  const raw = Number(localStorage.getItem(storageKeys.coachIndex) || 0);
  return Number.isFinite(raw) ? raw : 0;
}

function writeCoachIndex(index) {
  localStorage.setItem(storageKeys.coachIndex, String(index));
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function captureAndOCR() {
  if (!state.camera.stream || !elements.cameraVideo) return;

  setCameraStatus('Processing image... this may take a few seconds.');

  // Capture frame
  const canvas = document.createElement('canvas');
  canvas.width = elements.cameraVideo.videoWidth;
  canvas.height = elements.cameraVideo.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(elements.cameraVideo, 0, 0, canvas.width, canvas.height);

  // Stop stream to freeze UI
  stopCameraStream();

  try {
    if (!window.Tesseract) {
      throw new Error('OCR library not loaded.');
    }

    const { data: { text } } = await window.Tesseract.recognize(canvas, 'eng');

    // Simple cleanup
    const cleanText = text
      .replace(/\n/g, ', ')
      .replace(/[^a-zA-Z0-9, \-\.%]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanText.length < 5) {
      setCameraStatus('No text detected. Try again.', true);
      return;
    }

    closeCameraScanner();
    elements.manualIngredients.value = cleanText;
    focusManualIngredients();

  } catch (err) {
    console.error(err);
    setCameraStatus('OCR failed. Try manual entry.', true);
  }
}

function escapeAttr(value) {
  return escapeHTML(value);
}
