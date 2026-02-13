import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runRegulatoryIngestion } from '../scripts/ingest_catalog.mjs';

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function run() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'healthlens-regulatory-'));

  await fs.writeFile(path.join(tempRoot, 'regulatory_actions.json'), '[]\n', 'utf8');
  await fs.writeFile(
    path.join(tempRoot, 'regulatory_leads.json'),
    `${JSON.stringify(
      [
        {
          id: 'lead-ban-claim',
          product_name: 'Mustard Oil',
          authority: 'Lead queue',
          action_type: 'ban',
          hazard: 'Pending verification',
          source_urls: ['local://pdf-lead']
        }
      ],
      null,
      2
    )}\n`,
    'utf8'
  );
  await fs.writeFile(path.join(tempRoot, 'regulatory_ingestion_log.jsonl'), '', 'utf8');

  const mockFetch = async (url) => {
    const href = String(url);

    if (href.includes('fda.gov')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'fda-1',
              jurisdiction: 'US',
              authority: 'U.S. FDA',
              action_type: 'import_refusal',
              product_name: 'Frozen shrimp consignments',
              reason_category: 'Residue non-compliance',
              hazard: 'Antibiotic residue markers',
              action_date: '2026-02-12',
              status: 'confirmed',
              source_urls: ['https://www.accessdata.fda.gov/cms_ia/importalert_16.html'],
              confidence: 'Regulator Confirmed'
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const result = await runRegulatoryIngestion({
    mode: 'daily',
    catalogDir: tempRoot,
    fetchImpl: mockFetch,
    now: new Date('2026-02-13T00:00:00.000Z')
  });

  assert.equal(result.records >= 2, true);

  const actions = await readJson(path.join(tempRoot, 'regulatory_actions.json'));
  const confirmed = actions.find((item) => item.id === 'fda-1');
  assert(confirmed, 'expected confirmed adapter item');
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.action_type, 'import_refusal');
  assert.equal(Array.isArray(confirmed.source_urls) && confirmed.source_urls.length > 0, true);

  const lead = actions.find((item) => item.id === 'lead-ban-claim');
  assert(lead, 'expected lead item from queue');
  assert.equal(lead.status, 'under_review');
  assert.equal(lead.action_type, 'update');
  assert.equal(lead.confidence, 'Under Review');

  const logRaw = await fs.readFile(path.join(tempRoot, 'regulatory_ingestion_log.jsonl'), 'utf8');
  assert.equal(logRaw.includes('"adapter":"fda"'), true);

  console.log('Regulatory ingestion tests passed.');
}

run();
