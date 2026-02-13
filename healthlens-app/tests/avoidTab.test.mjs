import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/nihalgbailur/Downloads/Healthapp/healthlens-app';

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function run() {
  const html = read('index.html');
  const appJs = read('app.js');
  const css = read('styles.css');

  // 1) New Avoid tab and panel exist in IA.
  assert.match(html, /data-tab="avoid"/);
  assert.match(html, /data-go-tab="avoid"/);
  assert.match(html, /id="avoidSearch"/);
  assert.match(html, /id="avoidConfirmedList"/);
  assert.match(html, /id="avoidReviewList"/);

  // 2) App wiring includes avoid marker loading and tab rendering.
  assert.match(appJs, /loadAvoidMarkers/);
  assert.match(appJs, /state\.avoidMarkers/);
  assert.match(appJs, /renderAvoidTab\(/);
  assert.match(appJs, /avoid_verdict/);

  // 3) Navigation is horizontal-scroll ready and Avoid visuals exist.
  assert.match(css, /\.tab-bar[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /\.avoid-banner\.high/);
  assert.match(css, /\.avoid-chip/);

  console.log('Avoid tab integration tests passed.');
}

run();
