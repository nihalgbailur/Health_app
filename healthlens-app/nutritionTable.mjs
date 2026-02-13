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
        <span class="band ${item.band_color}">${escapeHTML(toBandLabel(item.band_level))}</span>
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
              <td><span class="band ${item.band_color}">${escapeHTML(toBandLabel(item.band_level))}</span></td>
              <td>${escapeHTML(item.threshold_text)}</td>
              <td>${escapeHTML(item.daily_target)}</td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
