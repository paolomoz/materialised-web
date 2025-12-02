/**
 * Recipe Directions Block
 *
 * Numbered step-by-step recipe directions with circular indicators
 * and navigation arrows.
 *
 * Content Model (DA Table):
 * | Recipe Directions |                                              |
 * |-------------------|----------------------------------------------|
 * | Step 1            | Steam squash in a steamer or microwave...    |
 * | Step 2            | Place all ingredients into the Vitamix...    |
 * | Step 3            | Start the blender on its lowest speed...     |
 *
 * HTML structure after decoration:
 * <div class="recipe-directions">
 *   <h2>Directions</h2>
 *   <div class="directions-list">
 *     <div class="direction-step">
 *       <span class="step-number">1</span>
 *       <p class="step-text">...</p>
 *     </div>
 *     ...
 *   </div>
 *   <div class="directions-nav">...</div>
 * </div>
 */

const ICONS = {
  chevronLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
};

export default function decorate(block) {
  const rows = [...block.children];

  // Parse steps from rows
  const steps = [];
  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length >= 2) {
      // Step number in first cell, instruction in second
      const stepLabel = cells[0].textContent.trim();
      const instruction = cells[1].innerHTML.trim();
      if (instruction) {
        steps.push({ label: stepLabel, instruction });
      }
    } else if (cells.length === 1) {
      // Single cell with instruction
      const text = cells[0].innerHTML.trim();
      // Check if it's a header
      if (cells[0].querySelector('h2, h3')) {
        // Skip headers, we'll add our own
      } else if (text) {
        steps.push({ label: `Step ${steps.length + 1}`, instruction: text });
      }
    }
  });

  // Build steps HTML
  const stepsHtml = steps.map((step, i) => `
    <div class="direction-step" data-step="${i + 1}">
      <span class="step-number" aria-hidden="true">${i + 1}</span>
      <div class="step-content">
        <p class="step-text">${step.instruction}</p>
      </div>
    </div>
  `).join('');

  block.innerHTML = `
    <h2 class="directions-title">Directions</h2>
    <div class="directions-list">
      ${stepsHtml}
    </div>
  `;

}
