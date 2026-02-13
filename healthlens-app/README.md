# HealthLens (V1 Prototype)

Mobile-first PWA prototype implementing the HealthLens plan:
- Risk Scanner first
- Product detail with evidence cards
- Safer swaps
- Watchdog Lite
- Coach Lite
- Saved + Compare
- Live barcode fallback lookup (OpenFoodFacts) when barcode is not in local seed data
- Durable API-first catalog ingestion pipeline with scrape fallback allowlist

## Project structure

- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/index.html` main app shell and tab IA
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/styles.css` premium calm design system and responsive UI
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/app.js` app state, rendering, scanner flow, save/compare flow
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/data.mjs` data contracts, sample products, evidence cards, watchdog feed, coach tips
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/catalogPipeline.mjs` shared normalization, merge, staleness, and completeness utilities
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/catalogLoader.mjs` runtime catalog loader + scan queue export helpers
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/riskEngine.mjs` rule engine, nutrition bands, severity calculation, swap recommendations
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/rulesLoader.mjs` global rules profile loader and runtime flags
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/config/rules.json` strictest-wins multi-framework rule registry
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/tests/riskEngine.test.mjs` scenario tests for core risk logic
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/tests/globalGuardrail.test.mjs` strictest global framework verdict tests
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/tests/catalogPipeline.test.mjs` normalization and merge policy tests
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/tests/ingestCatalog.test.mjs` ingestion integration tests
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/tests/regulatoryIngestion.test.mjs` regulator feed ingestion tests
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/scripts/ingest_catalog.mjs` CLI ingestion runner
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/catalog/products.json` shared catalog store
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/catalog/barcode_queue.json` ingestion queue file
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/catalog/regulatory_actions.json` regulator-confirmed and under-review action feed
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/catalog/regulatory_ingestion_log.jsonl` regulatory ingestion event log
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/catalog/source_allowlist.json` scraping allowlist policy
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/catalog/ingestion_log.jsonl` ingestion event log
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/manifest.webmanifest` PWA metadata
- `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app/service-worker.js` offline caching

## Run locally

From `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app`:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in a browser.

Camera scan behavior:
- If barcode field is empty, tapping `Scan now` (Home) or `Check` (Scan tab) opens camera capture.
- You can also tap `Open camera` buttons.
- Camera capture requires HTTPS on production (`localhost` works locally).

## Run tests

From `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app`:

```bash
node ./tests/riskEngine.test.mjs
node ./tests/catalogPipeline.test.mjs
node ./tests/ingestCatalog.test.mjs
node ./tests/nutritionTable.test.mjs
node ./tests/globalGuardrail.test.mjs
node ./tests/regulatoryIngestion.test.mjs
```

## Catalog ingestion

Daily incremental refresh:

```bash
node ./scripts/ingest_catalog.mjs --mode daily
```

Force refresh one barcode:

```bash
node ./scripts/ingest_catalog.mjs --barcode 8904422704770 --force
```

Dry run:

```bash
node ./scripts/ingest_catalog.mjs --mode daily --dry-run
```

Regulatory action ingestion (official-source adapters + lead queue):

```bash
node ./scripts/ingest_catalog.mjs --regulatory-mode daily
```

## Demo barcodes

- `8901000000011` Golden Turmeric Powder (high risk)
- `8901000000035` Crispy Millet Chips
- `8901000000042` Plain Rolled Oats (lower risk)
- `8901000000073` Crunch Protein Cereal

If a barcode is not in the demo catalog (for example `8901042954714`), the app automatically attempts a live lookup and then runs the same risk analysis.
Sparse product records are auto-refreshed from live lookup, and scan results show clear source labels:
`API lookup`, `API cached`, `API refreshed`, `Scrape fallback`, `Merged`, or `Queued for scraping pipeline`.

Unknown/sparse scans are queued in browser storage and can be exported from the Home tab as `barcode_queue.json` for ingestion.

## Nutrition band table

Scan results now show:
- Existing nutrition chips (quick visual risk)
- A structured table:
  - `Nutrient`
  - `Actual value`
  - `Band` (`Low`, `Medium`, `High`, `Unknown`)
  - `Threshold range`
  - `Daily target`

Banding logic follows the report thresholds:
- Risk nutrients (`energy_kcal`, `total_fat_g`, `saturated_fat_g`, `total_sugars_g`, `salt_g`, `sodium_mg`):
  - low = better, high = worse
- Beneficial nutrients (`fiber_g`, `protein_g`):
  - low = worse, high = better
- Protein uses `% energy = (protein_g * 4 / energy_kcal) * 100`; if energy is missing, protein band is `Unknown`.

## Global guardrail verdict

HealthLens now computes:
- Per-framework verdicts (`UK traffic-light`, `India ICMR HFSS`, `Canada FOP reference`, `WHO guidance`, `HSR reference`)
- One final `Global guardrail verdict` using strictest-wins across available framework signals.
- `Regulatory action engine` verdict from regulator-confirmed recalls/bans/refusals (separate trust track).

Unknowns are explicit:
- Missing added nutrient values (`added_sugars_g`, `added_salt_mg`, `added_fat_g`) stay `Unknown`.
- Added values are never inferred from total sugar/salt/fat.

## Install on Android (Netlify PWA)

Production URL placeholder: `https://<your-site>.netlify.app`

1. Deploy `/Users/nihalgbailur/Downloads/Healthapp/healthlens-app` as a static site to Netlify (HTTPS required).
2. Open the production URL in Chrome on Android.
3. Wait for the install prompt, or open Chrome menu and tap `Install app` / `Add to Home screen`.
4. Launch HealthLens from home screen/app drawer (standalone mode).

### Installability verification checklist

- `https://<your-site>.netlify.app/manifest.webmanifest` loads successfully.
- Manifest includes valid icons (`192x192` and `512x512` PNG).
- Service worker is registered and active (`Application` tab in DevTools).
- No mixed-content or failed-network errors in console.

### Troubleshooting: install button not showing

- Confirm you are on `https` (not `http`).
- Hard refresh once after deployment (service worker cache update).
- Confirm manifest request is `200` and parsed.
- Confirm service worker controls the current page (reload once after first registration).
- Use Chrome menu install option if `beforeinstallprompt` does not appear immediately.

### Troubleshooting: camera scan not opening

- Confirm you are on HTTPS (`https://<your-site>.netlify.app`) or localhost.
- Allow camera permission in browser settings.
- Use Android Chrome latest version for best BarcodeDetector support.
- If live detection is unsupported on a browser, use manual barcode entry.

## Trust policy implemented

- Every `High` and `Moderate` signal must include at least one evidence card.
- Evidence labels are explicit:
  - `Regulator Confirmed`
  - `Independent Evidence`
  - `Under Review`
- Unverified claims from secondary reports are never shown as confirmed bans.
- Brand-level ban claims are downgraded to `Under Review` unless a verifiable regulator source exists.
- UI includes non-diagnostic legal-safe language.

## Note

This is an implementation prototype with curated sample data designed for product validation and UX testing before backend integration.
