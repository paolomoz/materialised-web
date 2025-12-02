/**
 * Recipe Steps Block
 *
 * Displays recipe instructions as numbered steps with optional images.
 * HTML structure from orchestrator:
 * <div class="recipe-steps">
 *   <div><h2>Instructions</h2></div>
 *   <div class="step">
 *     <div>
 *       <p><strong>Step 1</strong></p>
 *       <p>Instructions...</p>
 *       <img alt="Step 1" />
 *     </div>
 *   </div>
 *   ...
 * </div>
 */

export default function decorate(block) {
  const rows = [...block.children];

  // First row is the title
  if (rows[0] && rows[0].querySelector('h2')) {
    rows[0].classList.add('recipe-steps-header');
  }

  // Remaining rows are steps
  rows.slice(1).forEach((row, index) => {
    row.classList.add('recipe-step');
    row.setAttribute('data-step', index + 1);

    // Find step content cell
    const cell = row.querySelector('div');
    if (cell) {
      cell.classList.add('recipe-step-content');

      // Find and style step number
      const stepLabel = cell.querySelector('p:first-child strong');
      if (stepLabel) {
        stepLabel.parentElement.classList.add('recipe-step-number');
      }

      // Find and style step image
      const img = cell.querySelector('img');
      if (img) {
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'recipe-step-image';
        img.parentNode.insertBefore(imgWrapper, img);
        imgWrapper.appendChild(img);
      }
    }
  });
}
