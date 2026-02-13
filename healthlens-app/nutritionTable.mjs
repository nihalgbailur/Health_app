function defaultEscapeHTML(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @param {string} level
 */
export function toBandLabel(level) {
  if (!level || level === 'unknown') return 'Unknown';
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * @param {import('./riskEngine.mjs').NutritionAssessment} assessment
 */
export function toContextBandLabel(assessment) {
  const base = toBandLabel(assessment?.band_level || 'unknown');
  if (base === 'Unknown') return base;

  const level = String(assessment?.band_level || '').toLowerCase();
  const bandType = String(assessment?.band_type || 'risk').toLowerCase();

  if (bandType === 'beneficial') {
    if (level === 'high') return `${base} (Good)`;
    if (level === 'medium') return `${base} (Okay)`;
    return `${base} (Needs boost)`;
  }

  if (level === 'low') return `${base} (Good)`;
  if (level === 'medium') return `${base} (Caution)`;
  return `${base} (Risk)`;
}

/**
 * @param {(value: string) => string} [escapeHTML]
 */
export function renderNutritionLegendHTML(escapeHTML = defaultEscapeHTML) {
  return `<div class="nutrition-legend" role="note" aria-label="Nutrition band legend">
    <p class="meta"><strong>Legend:</strong> color + label meaning changes by nutrient type.</p>
    <div class="legend-row">
      <span class="meta">Risk nutrients</span>
      <span class="band green">${escapeHTML('Low (Good)')}</span>
      <span class="band amber">${escapeHTML('Medium (Caution)')}</span>
      <span class="band red">${escapeHTML('High (Risk)')}</span>
    </div>
    <div class="legend-row">
      <span class="meta">Beneficial nutrients (fiber/protein)</span>
      <span class="band red">${escapeHTML('Low (Needs boost)')}</span>
      <span class="band amber">${escapeHTML('Medium (Okay)')}</span>
      <span class="band green">${escapeHTML('High (Good)')}</span>
    </div>
  </div>`;
}

/**
 * @param {import('./riskEngine.mjs').NutritionAssessment[]} assessments
 * @param {(value: string) => string} [escapeHTML]
 */
export function renderNutritionChipsHTML(assessments, escapeHTML = defaultEscapeHTML) {
  const knownAssessments = (assessments || []).filter((item) => item.band_level !== 'unknown');
  if (!knownAssessments.length) {
    return '<p class="meta">Nutrition values unavailable.</p>';
  }

  return `<ul class="nutrition-list">${knownAssessments
    .map(
      (item) => `<li class="nutrition-item">
        <span>${escapeHTML(item.nutrient)}: <strong>${escapeHTML(item.actual_display)}</strong></span>
        <span class="band ${item.band_color}">${escapeHTML(toContextBandLabel(item))}</span>
      </li>`
    )
    .join('')}</ul>`;
}

/**
 * @param {import('./riskEngine.mjs').NutritionAssessment[]} assessments
 * @param {(value: string) => string} [escapeHTML]
 */
export function renderNutritionTableHTML(assessments, escapeHTML = defaultEscapeHTML) {
  if (!assessments || !assessments.length) {
    return '<p class="meta">No nutrition data available for table view.</p>';
  }

  return `<div class="nutrition-table-wrap" role="region" aria-label="Nutrition band table" tabindex="0">
    <table class="nutrition-table">
      <thead>
        <tr>
          <th scope="col">Nutrient</th>
          <th scope="col">Actual value</th>
          <th scope="col">Band</th>
          <th scope="col">Threshold range</th>
          <th scope="col">Daily target</th>
        </tr>
      </thead>
      <tbody>
        ${assessments
          .map(
            (item) => `<tr>
              <td>${escapeHTML(item.nutrient)}</td>
              <td>${escapeHTML(item.actual_display)}</td>
              <td><span class="band ${item.band_color}">${escapeHTML(toContextBandLabel(item))}</span></td>
              <td>${escapeHTML(item.threshold_text)}</td>
              <td>${escapeHTML(item.daily_target)}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
