/**
 * Ingredients List Block
 *
 * Displays recipe ingredients organized in sections.
 * HTML structure from orchestrator:
 * <div class="ingredients-list">
 *   <div class="ingredients-header">
 *     <h2>Ingredients</h2>
 *     <p>For X servings</p>
 *   </div>
 *   <p><strong>Section Name</strong></p>
 *   <div class="ingredient-row">
 *     <p>2 cups</p>
 *     <p>ingredient name</p>
 *   </div>
 *   ...
 * </div>
 */

export default function decorate(block) {
  const rows = [...block.children];

  rows.forEach((row) => {
    // Check if it's a header row
    if (row.querySelector('h2')) {
      row.classList.add('ingredients-header');
      return;
    }

    // Check if it's a section label
    if (row.querySelector('strong') && row.children.length === 1) {
      row.classList.add('ingredients-section');
      return;
    }

    // Otherwise it's an ingredient row
    const cells = [...row.children];
    if (cells.length >= 2) {
      row.classList.add('ingredient-row');
      if (cells[0]) cells[0].classList.add('ingredient-amount');
      if (cells[1]) cells[1].classList.add('ingredient-name');
      if (cells[2]) cells[2].classList.add('ingredient-note');
    }
  });
}
